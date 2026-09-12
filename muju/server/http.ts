import express from 'express';
import { resolve } from 'node:path';
import type { ErrorRequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z, ZodError } from 'zod';
import { RoomStore } from './rooms';
import { RoomError } from './schema';
import { createMcpServer } from './mcp';

export function createApp(store: RoomStore, options: { publicUrl: string; distPath?: string; allowedOrigins?: string[]; rateLimit?: number }) {
  const app = express();
  app.disable('x-powered-by');
  const origins = new Set([new URL(options.publicUrl).origin, ...(options.allowedOrigins ?? [])]);
  const buckets = new Map<string, { until: number; count: number }>();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!(req.path.startsWith('/api/') || req.path === '/mcp')) return next();
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return res.status(403).json({ code: 'ORIGIN_NOT_ALLOWED', error: 'Origin is not allowed by this host.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    const now = Date.now(), key = req.socket.remoteAddress ?? 'unknown';
    for (const [ip, bucket] of buckets) if (bucket.until <= now) buckets.delete(ip);
    const bucket = buckets.get(key) ?? { until: now + 60000, count: 0 };
    bucket.count++; buckets.set(key, bucket);
    if (bucket.count > (options.rateLimit ?? 600)) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ code: 'RATE_LIMIT', error: 'Too many requests. Retry in a minute.' });
    }
    if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/muju/health', (_req, res) => res.json({ ok: true, game: 'Muju Hono Tanka', protocol: 1 }));
  app.post('/api/muju/rooms', (req, res) => res.status(201).json(store.create(req.body)));
  app.get('/api/muju/rooms/:id', (req, res) => res.json(store.get(req.params.id, req.headers.authorization?.replace(/^Bearer /, ''))));
  app.get('/api/muju/rooms/:id/changes', async (req, res, next) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    try {
      const query = z.object({ afterRevision: z.coerce.number().int().nonnegative(),
        timeoutMs: z.coerce.number().int().min(0).max(25000).default(25000) }).strict().parse(req.query);
      const change = await store.wait(req.params.id, query.afterRevision, query.timeoutMs, controller.signal,
        req.headers.authorization?.replace(/^Bearer /, ''));
      if (!controller.signal.aborted) res.json(change);
    } catch (error) { if (!controller.signal.aborted) next(error); }
    finally { res.off('close', cancel); }
  });
  app.post('/api/muju/rooms/:id/join', (req, res) => res.json(store.join(req.params.id, req.body)));
  app.post('/api/muju/rooms/:id/restore', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new RoomError(401, 'SEAT_REQUIRED', 'Paste your private seat credentials to restore this seat.');
    const { player } = z.object({ player: z.enum(['white', 'black']) }).strict().parse(req.body);
    res.json(store.restore(req.params.id, auth.slice(7), player));
  });
  for (const operation of ['actions', 'preview'] as const) {
    app.post(`/api/muju/rooms/:id/${operation}`, (req, res) => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) throw new RoomError(401, 'SEAT_REQUIRED', 'Send your seat token as Authorization: Bearer <token>.');
      res.json(store.act(req.params.id, auth.slice(7), req.body, operation === 'preview'));
    });
  }
  app.post('/mcp', async (req, res, next) => {
    const server = createMcpServer(store, options.publicUrl);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { next(error); }
  });
  app.all('/mcp', (_req, res) => res.status(405).json({ error: 'This stateless MCP endpoint accepts POST requests.' }));
  if (options.distPath) {
    app.get('/', (_req, res) => res.redirect('/muju/'));
    app.get('/SKILL.md', (_req, res) => res.type('text/markdown').sendFile(resolve(options.distPath!, 'skills/muju-hono-tanka/SKILL.md')));
    app.use('/muju', express.static(options.distPath));
  }
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof RoomError) res.status(error.status).json({ code: error.code, error: error.message });
    else if (error instanceof ZodError) res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid request.', issues: error.issues });
    else if (error.status === 413 || error instanceof SyntaxError) res.status(error.status ?? 400).json({ error: 'Invalid or oversized JSON request.' });
    else { console.error('Muju server error:', error instanceof Error ? error.message : 'Unknown error'); res.status(500).json({ error: 'Server could not complete the request.' }); }
  };
  app.use(onError);
  return app;
}
