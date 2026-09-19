import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withHeavySlot } from '../../lab/hard-ai/ladder/heavy';
import { ENGINE_ALLOWANCE_MS, runSeat, type SeatJournal } from './runner';
import { assertSeatConfiguration, initializeSeat, seatConfigSchema, seatJournalSchema } from './config';

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
  const config = seatConfigSchema.parse(JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')));
  await withHeavySlot('engine-seat-deep', async () => {
  const stateFile = resolve(config.stateFile), lock = `${stateFile}.lock`;
  mkdirSync(dirname(stateFile), { recursive: true, mode: 0o700 });
  mkdirSync(lock, { mode: 0o700 });
  let journal: SeatJournal;
  const resumed = existsSync(stateFile);
  try {
    if (resumed) {
      journal = seatJournalSchema.parse(JSON.parse(readFileSync(stateFile, 'utf8')));
      assertSeatConfiguration(journal, config);
      chmodSync(stateFile, 0o600);
    } else {
      // Reserve before join. An uncertain join leaves this marker for explicit
      // recovery; automatically re-joining would revoke a previous credential.
      journal = await initializeSeat(config, () => closeSync(openSync(stateFile, 'wx', 0o600)));
      writeFileSync(stateFile, JSON.stringify(journal), { mode: 0o600 });
    }
    const save = (value: SeatJournal) => {
      const temporary = `${stateFile}.tmp`;
      writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, stateFile);
    };
    const log = (event: Record<string, unknown>) => appendFileSync(`${stateFile}.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
    log({ event: 'start', roomId: config.roomId, player: journal.connection.player, seed: journal.seed,
      contract: journal.contract, admission: journal.admission,
      profile: 'desktop', allowanceMs: ENGINE_ALLOWANCE_MS, source: sourceIdentity(), resumed });
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
    await runSeat({ journal, save, log, signal: controller.signal });
  } finally { rmSync(lock, { recursive: true }); }
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Engine seat failed.'); process.exitCode = 1; });
