import type { Express } from 'express';
import { z } from 'zod';
import { RoomError } from '../schema';
import type { ExplorerStore } from './store';
const id = z.string().regex(/^[a-f0-9]{32}$/);
const usage = z.array(z.object({ player: z.enum(['white', 'black']), provider: z.string().max(20), model: z.string().max(100),
  inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(), elapsedMs: z.number().nonnegative() }).strict()).max(20).default([]);
export function explorerRoutes(app: Express, store: ExplorerStore) {
  const token = (authorization?: string) => {
    if (!authorization?.startsWith('Bearer ')) throw new RoomError(401, 'EXPERIMENT_TOKEN_REQUIRED', 'Use the private experiment control token.');
    return authorization.slice(7);
  };
  app.post('/api/muju/experiments', (req, res) => res.status(201).json(store.create(req.body)));
  app.get('/api/muju/experiments/:id', (req, res) => res.json(store.get(id.parse(req.params.id))));
  app.get('/api/muju/experiments/:id/export', (req, res) => {
    const experiment = store.get(id.parse(req.params.id));
    res.setHeader('Content-Disposition', `attachment; filename="muju-experiment-${experiment.id}.json"`);
    res.json({ format: 'muju-advantage-explorer-1', experiment });
  });
  app.post('/api/muju/experiments/:id/claim', (req, res) => {
    const body = z.object({ workerId: z.string().min(8).max(100) }).strict().parse(req.body);
    res.json({ job: store.claim(id.parse(req.params.id), token(req.headers.authorization), body.workerId) });
  });
  for (const operation of ['call', 'query', 'submit'] as const) app.post(`/api/muju/experiments/:id/${operation}`, (req, res) => {
    const body = z.object({ jobId: id, callId: z.string().min(8).max(100).optional(), input: z.unknown().optional(), usage }).strict().parse(req.body);
    const args = [id.parse(req.params.id), token(req.headers.authorization), body.jobId] as const;
    res.json(operation === 'call' ? store.call(...args, z.string().min(8).max(100).parse(body.callId))
      : operation === 'query' ? store.query(...args, body.input) : store.submit(...args, body.input, body.usage));
  });
  app.post('/api/muju/experiments/:id/control', (req, res) => {
    const body = z.object({ action: z.enum(['pause', 'resume', 'stop']), reason: z.string().max(1000).optional() }).strict().parse(req.body);
    res.json(store.control(id.parse(req.params.id), token(req.headers.authorization), body.action, body.reason));
  });
  app.post('/api/muju/experiments/:id/review', (req, res) => {
    const body = z.object({ note: z.string().max(10000) }).strict().parse(req.body);
    res.json(store.review(id.parse(req.params.id), token(req.headers.authorization), body.note));
  });
}
