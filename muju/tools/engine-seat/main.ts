import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { actionRequestSchema, joinSchema, roomIdSchema, tokenSchema } from '../../server/schema';
import { joinRoom, normalizeServer, roomRequest } from '../../src/online/client';
import type { RoomSnapshot } from '../../src/online/types';
import { withHeavySlot } from '../../lab/hard-ai/ladder/heavy';
import { assertSeatRoom, ENGINE_ALLOWANCE_MS, runSeat, type SeatJournal } from './runner';

const configSchema = z.object({ serverUrl: z.string().transform(normalizeServer), roomId: roomIdSchema,
  name: joinSchema.shape.name, inviteCode: joinSchema.shape.inviteCode, seed: z.number().int().min(0).max(0xffffffff),
  stateFile: z.string().min(1) }).strict();
const journalSchema = z.object({ version: z.literal(1), seed: z.number().int().min(0).max(0xffffffff),
  connection: z.object({ serverUrl: z.string().transform(normalizeServer), roomId: roomIdSchema,
    player: z.enum(['white', 'black']), token: tokenSchema }).strict(), pending: actionRequestSchema.optional() }).strict();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function sourceIdentity() {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
    }
  };
  for (const directory of ['src/game', 'src/ai', 'lab/hard-ai/bots', 'lab/hard-ai/ablate', 'tools/engine-seat']) walk(directory);
  files['package-lock.json'] = createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex');
  return { sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files };
}
async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node --import tsx tools/engine-seat/main.ts /private/path/config.json');
  if (process.env.MUJU_HEAVY_BYPASS === '1') throw new Error('Engine seat must use the shared heavy-work queue.');
  const config = configSchema.parse(JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')));
  await withHeavySlot('engine-seat-deep', async () => {
  const stateFile = resolve(config.stateFile), lock = `${stateFile}.lock`;
  mkdirSync(dirname(stateFile), { recursive: true, mode: 0o700 });
  mkdirSync(lock, { mode: 0o700 });
  let journal: SeatJournal;
  const resumed = existsSync(stateFile);
  try {
    if (resumed) {
      journal = journalSchema.parse(JSON.parse(readFileSync(stateFile, 'utf8')));
      if (journal.connection.serverUrl !== config.serverUrl || journal.connection.roomId !== config.roomId || journal.seed !== config.seed) throw new Error('Stored seat identity differs from the configuration.');
      chmodSync(stateFile, 0o600);
    } else {
      const room = await roomRequest<RoomSnapshot>(config.serverUrl, `/${config.roomId}`);
      assertSeatRoom(room);
      // Reserve before join. An uncertain join leaves this marker for explicit
      // recovery; automatically re-joining would revoke a previous credential.
      closeSync(openSync(stateFile, 'wx', 0o600));
      const admission = await joinRoom(config.serverUrl, config.roomId, config.name, config.inviteCode);
      journal = { version: 1, connection: { ...admission.credentials, serverUrl: config.serverUrl }, seed: config.seed };
      writeFileSync(stateFile, JSON.stringify(journal), { mode: 0o600 });
    }
    const save = (value: SeatJournal) => {
      const temporary = `${stateFile}.tmp`;
      writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, stateFile);
    };
    const log = (event: Record<string, unknown>) => appendFileSync(`${stateFile}.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
    log({ event: 'start', roomId: config.roomId, player: journal.connection.player, seed: journal.seed,
      profile: 'desktop', allowanceMs: ENGINE_ALLOWANCE_MS, source: sourceIdentity(), resumed });
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
    await runSeat({ journal, save, log, signal: controller.signal });
  } finally { rmSync(lock, { recursive: true }); }
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Engine seat failed.'); process.exitCode = 1; });
