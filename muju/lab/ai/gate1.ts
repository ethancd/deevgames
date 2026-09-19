/** Gate 1 baseline-sanity runner, preregistration amendment A3.
 *
 * From muju/:
 *   node --import tsx lab/ai/gate1.ts --mode pilot --calibration <dir>/calibration.json --out <NEW directory>
 *
 * `--plan` prints the adopted A3 allocation without playing. Full rows are opt-in.
 *
 * A3 in three lines: each seat-mirrored pair starts from its own dev-book
 * opening (48 pairs per cell), every game is hashed so the report can refuse to
 * read strength out of replication, and the per-turn fixed-work budgets come
 * from a calibration manifest instead of the asserted 6,000/3,000 of A1/A2.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg, cpus, platform, arch } from 'node:os';
import { pathToFileURL } from 'node:url';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { DEFAULT_WEIGHTS } from '../../src/ai/types';
import { playGame } from '../harness/runner';
import { createRushBot, createExpandBot, createBalancedBot } from '../harness/bots/archetypes';
import { DEFAULT_MATCH_OPTIONS } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { createGateBot, type GateBudgets, type GateDifficulty } from './gate1-bot';
import { loadCalibration, type Calibration } from './gate1-calibrate';
import { DEV_BOOK_PATH, HANDICAPS, gate1StartState, loadGate1Book, openingsDigest, type Gate1Book } from './gate1-openings';
import { createTraceHasher } from './gate1-trace';
import { schedule, summarize, AMENDMENT, PAIRS, SEEDS, type Task, type Mode, type Entry, type Bands } from './gate1-report';
import type { OpeningSpec } from '../hard-ai/ladder/openings';

export const BANDS_PATH = 'lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json';
export const PROPOSAL_PATH = 'lab/docs/GATE1-AMENDMENT-PROPOSAL-2026-09-19.md';
export const REFERENCE_PATH = 'lab/ai/gate1-references.json';
export const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
/** Read the adopted document by commit, independently of later working-copy edits.
 * Historical calibration hashes are audit metadata, no longer prerequisites. */
export function adoptedProtocol() {
  const references = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8'));
  const amendment = references.amendment;
  if (references.status !== 'adopted' || references.rulesVersion !== 'muju-phasing-1' || amendment?.id !== AMENDMENT) {
    throw new Error(`Gate 1 requires adopted amendment ${AMENDMENT}`);
  }
  const document = execFileSync('git', ['show', `${amendment.commit}:${amendment.path}`], { encoding: 'utf8' });
  if (sha(document) !== amendment.sha256) throw new Error('Adopted preregistration hash mismatch');
  return { references, amendment, document };
}

/** Read hashes only; never read any opening corpus but the dev book the row replays. */
function sources() {
  const paths = execFileSync('rg', ['--files', 'src/ai', 'src/game', 'assembly', 'lab/ai', 'lab/harness', '-g', '*.ts'],
    { encoding: 'utf8' }).trim().split('\n');
  paths.push('package-lock.json', 'src/ai/wasm/tactics.wasm', 'lab/hard-ai/ladder/elo.ts',
    'lab/hard-ai/ladder/heavy.ts', 'lab/hard-ai/ladder/ruleset.ts', 'lab/hard-ai/ladder/openings.ts',
    'lab/hard-ai/ladder/openings/phasing.ts',
    'docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md',
    'docs/PHASING-2026-09-16.md', BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH);
  return Object.fromEntries([...new Set(paths)].sort().map(p => [p, sha(readFileSync(p))]));
}

export async function resolvedConfigs(solver: TacticalSolver, budgets: GateBudgets, opening: OpeningSpec) {
  // Fresh throw-away engines expose their ACTUAL resolved defaults via debug.
  // No duplicated difficulty preset table; the live game engines are seeded afresh.
  const configs = {} as Record<GateDifficulty, ReturnType<ReturnType<typeof createGateBot>['resolvedConfig']>>;
  for (const difficulty of ['hard', 'medium'] as const) {
    const seat = createGateBot(difficulty, solver, budgets[difficulty]);
    seat.bot.onGameStart('white', 1);
    const state = gate1StartState(opening, 0);
    await seat.bot.nextAction(state, state.turn.currentPlayer);
    configs[difficulty] = seat.resolvedConfig();
  }
  return configs;
}

export async function runTask(task: Task, solver: TacticalSolver, identityHash: string,
  configs: Awaited<ReturnType<typeof resolvedConfigs>>, runId: string, budgets: GateBudgets, book: Gate1Book) {
  const opening = book.openings[task.openingIndex];
  if (!opening || opening.id !== task.openingId) throw new Error(`Opening mismatch for ${task.id}`);
  const hard = createGateBot('hard', solver, budgets.hard);
  const medium = task.opponent === 'aiv2-medium' ? createGateBot('medium', solver, budgets.medium) : null;
  const other = medium?.bot ?? ({ Rush: createRushBot, Expand: createExpandBot, Balanced: createBalancedBot }
    [task.opponent as 'Rush' | 'Expand' | 'Balanced'])();
  const otherSeat = task.hardSeat === 'white' ? 'black' : 'white';
  const bots = task.hardSeat === 'white' ? { white: hard.bot, black: other } : { white: other, black: hard.bot };
  const trace = createTraceHasher(task.openingId, task.handicap);
  const arrivals = { white: 0, black: 0 }, refunds = { white: 0, black: 0 };
  const startLoad = loadavg();
  const { record, replay } = await playGame({ bots, seed: task.seed, runId, engineHash: identityHash,
    experiment: `gate1-${AMENDMENT}`, initialState: gate1StartState(opening, task.handicap),
    options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: task.handicap,
      actionsPerTurn: 4, upkeep: 'shipped', inactivityRule: 'on', recordReplay: true },
    onAction(before, after, action) {
      trace.push(before, action);
      for (const pending of before.pendingSummons ?? []) {
        if ((after.pendingSummons ?? []).some(s => s.id === pending.id)) continue;
        if (after.board.units.some(u => u.id === pending.id)) arrivals[pending.owner]++;
        else refunds[pending.owner]++;
      }
    },
  });
  for (const [difficulty, adapter] of [['hard', hard], ['medium', medium]] as const) {
    if (adapter && JSON.stringify(adapter.resolvedConfig()) !== JSON.stringify(configs[difficulty])) {
      throw new Error(`Resolved config drift: ${difficulty}`);
    }
  }
  const configHash = (difficulty: GateDifficulty) => sha(json(configs[difficulty]));
  const otherConfig = medium ? configHash('medium') : sha(json({ engine: 'scripted', bot: task.opponent }));
  record.engineConfigHash = task.hardSeat === 'white' ? `${configHash('hard')}|${otherConfig}`
    : `${otherConfig}|${configHash('hard')}`;
  return { task, identityHash, record, telemetry: { arrivals, refunds,
    hard: hard.decisions, ...(medium ? { medium: medium.decisions } : {}),
    hardSeat: task.hardSeat, otherSeat }, load: { before: startLoad, after: loadavg() },
  gameSha256: trace.digest(), plies: trace.steps.length, replay };
}

export function parseArgs(args: string[]) {
  let mode: Mode = 'pilot', out: string | undefined, calibration: string | undefined, plan = false;
  let book = DEV_BOOK_PATH;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Repeated option ${flag}`);
    seen.add(flag);
    if (flag === '--plan') plan = true;
    else if (flag === '--mode') {
      const value = args[++i];
      if (value !== 'pilot' && value !== 'full') throw new Error('--mode must be pilot or full');
      mode = value;
    } else if (flag === '--out') {
      out = args[++i];
      if (!out || out.startsWith('--')) throw new Error('--out requires a new directory');
    } else if (flag === '--calibration') {
      calibration = args[++i];
      if (!calibration || calibration.startsWith('--')) throw new Error('--calibration requires a manifest path');
    } else if (flag === '--book') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--book requires a path');
      book = value; // validated against the frozen dev book below; anything else throws
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!plan && !out) throw new Error('Provide --out <new directory> or --plan');
  // A3 §3: no row runs on asserted budgets. A plan may be printed without one.
  if (!plan && !calibration) throw new Error('Provide --calibration <calibration.json> (preregistration A3 §3)');
  return { mode, out, calibration, book, plan };
}

export async function main(args: string[]) {
  const { mode, out, calibration: calibrationPath, book: bookPath, plan } = parseArgs(args);
  const book = loadGate1Book(bookPath); // refuses p1-val, p1-sealed and any other corpus
  const openingIds = book.openings.map(o => o.id);
  const tasks = schedule(mode, openingIds);
  const protocol = adoptedProtocol();
  const calibration: Calibration | null = calibrationPath ? loadCalibration(calibrationPath) : null;
  if (plan) {
    console.log(json({ status: 'adopted', amendment: protocol.amendment, mode, games: tasks.length,
      pairsPerOpponentAndHandicap: PAIRS[mode], seed: SEEDS[mode],
      workPerTurn: calibration?.budgets ?? 'calibration manifest required (A3 §3)',
      calibration: calibration ? { path: calibration.path, sha256: calibration.sha256 } : null,
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length,
        used: openingIds.slice(0, PAIRS[mode]) },
      schedule: tasks }));
    return;
  }
  if (heavyBypassed()) throw new Error('Gate 1 refuses MUJU_HEAVY_BYPASS');
  const budgets = calibration!.budgets;
  await withHeavySlot(`gate1-${mode}`, async () => {
    // mkdir without recursive/exist-ok: evidence is never overwritten or resumed across identities.
    mkdirSync(out!);
    mkdirSync(`${out}/replays`);
    const manifestPath = `${out}/manifest.json`;
    const manifest: Record<string, unknown> = { schema: 'muju-gate1-v3', status: 'initializing', amendment: AMENDMENT,
      startedAt: new Date().toISOString(), mode, expectedGames: tasks.length, schedule: tasks,
      openings: { path: book.path, sha256: book.sha256, rows: book.openings.length, digest: openingsDigest(openingIds) },
      calibration: { path: calibration!.path, sha256: calibration!.sha256, budgets,
        machine: calibration!.manifest.machine, load: calibration!.manifest.load },
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      node: process.version, device: `${cpus()[0]?.model} / ${platform()}/${arch()}`, cpuCount: cpus().length,
      loadBefore: loadavg(), queue: { directory: heavyDir(), slots: slotCount() },
      note: 'A3 allocation (distinct dev openings, hashed games, calibrated budgets) with unchanged A1 acceptance; ' +
        'pilots are ineligible. No worker unlock or responsiveness claim.' };
    writeFileSync(manifestPath, json(manifest));
    const entries: Entry[] = [];
    let activeTask: Task | undefined;
    let identityHash = '';
    const bands = JSON.parse(readFileSync(BANDS_PATH, 'utf8')) as Bands;
    try {
      const fileHashes = sources();
      const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
      const configs = await resolvedConfigs(solver, budgets, book.openings[0]);
      const { references, amendment, document } = adoptedProtocol();
      if (references.bandsSha256 !== fileHashes[BANDS_PATH]) throw new Error('Frozen band hash mismatch');
      writeFileSync(`${out}/preregistration-${AMENDMENT}.md`, document);
      writeFileSync(`${out}/calibration.json`, json(calibration!.manifest));
      const identity = { rulesVersion: 'muju-phasing-1', preregistration: amendment, abi: 7, files: fileHashes, configs,
        configHashes: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, sha(json(v))])),
        weights: DEFAULT_WEIGHTS, hardWeightsVersion: null, hardBookMagic: null,
        hardIdentityNote: 'Hard replica is not an arm in Gate 1 and is never instantiated',
        options: DEFAULT_MATCH_OPTIONS,
        openings: { path: book.path, sha256: book.sha256, order: 'file order, one opening per pair',
          handicaps: HANDICAPS, digest: openingsDigest(openingIds) },
        calibration: { path: calibration!.path, sha256: calibration!.sha256 },
        workPerTurn: budgets };
      identityHash = sha(json(identity));
      Object.assign(manifest, { status: 'running', identityHash });
      writeFileSync(`${out}/identity.json`, json(identity));
      writeFileSync(manifestPath, json(manifest));
      for (const task of tasks) {
        activeTask = task;
        const { replay, ...entry } = await runTask(task, solver, identityHash, configs, out!, budgets, book);
        writeFileSync(`${out}/replays/${task.id}.json`, json(replay));
        appendFileSync(`${out}/games.jsonl`, JSON.stringify(entry) + '\n');
        entries.push(entry);
        const r = entry.record;
        console.log(JSON.stringify({ id: task.id, opening: task.openingId, winner: r.winner, reason: r.winType,
          turns: r.completedTurns, purchases: r.players[task.hardSeat].unitsPlaced, ms: r.durationMs,
          game: entry.gameSha256.slice(0, 12) }));
        if (r.invariantViolation || r.anomalies.length || r.players.white.illegalActions + r.players.black.illegalActions) {
          throw new Error(`Correctness veto in ${task.id}; row void`);
        }
      }
      // One identity per row. The guard is deliberately blunt — it hashes every
      // source the harness can reach, not only the ones this row's engines
      // import — so it also fires when an unrelated lane edits the tree while a
      // row is running. It names what moved, because "sources changed" alone
      // tells a reader nothing about whether the games are still comparable.
      const after = sources();
      const drifted = [...new Set([...Object.keys(fileHashes), ...Object.keys(after)])]
        .filter(path => fileHashes[path] !== after[path]);
      if (drifted.length) {
        Object.assign(manifest, { sourceDrift: drifted });
        throw new Error(`Sources changed during row; row void: ${drifted.join(', ')}`);
      }
      const summary = summarize(entries, mode, identityHash, bands, openingIds);
      writeFileSync(`${out}/summary.json`, json(summary));
      if (summary.errors.length) throw new Error(summary.errors.join('\n'));
      Object.assign(manifest, { status: 'complete', completedGames: entries.length, gate1: summary.gate1,
        invalidCells: summary.invalidCells });
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      appendFileSync(`${out}/failures.jsonl`, JSON.stringify({ task: activeTask, error: message }) + '\n');
      // The games that were played stay inspectable, under a name that can never
      // be read as a row result: a void row is void whatever its numbers say.
      if (entries.length) {
        try {
          writeFileSync(`${out}/summary-void.json`, json({ void: message,
            ...summarize(entries, mode, identityHash, bands, openingIds) }));
        } catch { /* a summary of broken evidence must not hide the original failure */ }
      }
      Object.assign(manifest, { status: 'invalid', completedGames: entries.length, error: message });
      throw error;
    } finally {
      Object.assign(manifest, { finishedAt: new Date().toISOString(), loadAfter: loadavg() });
      writeFileSync(manifestPath, json(manifest));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
}
