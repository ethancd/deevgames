import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomStore } from './rooms';
import { createApp } from './http';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 3003);
const host = process.env.HOST ?? '0.0.0.0';
const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');
const databasePath = process.env.MUJU_DB_PATH ?? resolve(root, 'data/rooms.sqlite');
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const store = new RoomStore(databasePath, Number(process.env.MUJU_MAX_ROOMS ?? 10000));
const app = createApp(store, { publicUrl, distPath: resolve(root, 'dist'),
  allowedOrigins: (process.env.MUJU_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean) });
const listener = app.listen(port, host, error => {
  if (error) { console.error(`Could not start Muju: ${error.message}`); store.close(); process.exit(1); }
  console.error(`Muju Hono Tanka: ${publicUrl}/muju/ · MCP: ${publicUrl}/mcp`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  listener.close(() => { store.close(); process.exit(0); });
  listener.closeIdleConnections();
});
