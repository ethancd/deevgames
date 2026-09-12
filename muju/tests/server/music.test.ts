// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { MUSIC_TRACKS } from '../../src/music/tracks';

const store = new RoomStore(':memory:');
let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp(store, { publicUrl: 'http://localhost', distPath: resolve('public') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/muju/music/`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });

it('serves all nine mixes with seekable audio metadata and immutable versioned caching', async () => {
  for (const track of MUSIC_TRACKS) {
    const response = await fetch(base + track.file, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/audio\/mpeg/);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Number(response.headers.get('content-length'))).toBeGreaterThan(1000000);
  }
});

it('returns the exact middle and tail bytes of Tanka instead of restarting the MP3', async () => {
  const track = MUSIC_TRACKS.find(track => track.id === 'tanka-flute')!;
  const source = readFileSync(resolve('public/music', track.file));
  for (const [range, start, end] of [['bytes=5000000-5000015', 5000000, 5000015], ['bytes=-16', source.length - 16, source.length - 1]] as const) {
    const response = await fetch(base + track.file, { headers: { Range: range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/${source.length}`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(source.subarray(start, end + 1));
  }
});
