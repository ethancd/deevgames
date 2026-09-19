/** From muju/: node --import tsx lab/ai/gate1.ts --mode pilot --out <NEW directory>
 * --plan prints the proposed allocation without playing. Full rows are opt-in.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg, cpus, platform, arch } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createInitialGameState } from '../../src/game/board';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { DEFAULT_WEIGHTS, type AIAction } from '../../src/ai/types';
import { playGame } from '../harness/runner';
import { createRushBot, createExpandBot, createBalancedBot } from '../harness/bots/archetypes';
import { DEFAULT_MATCH_OPTIONS } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { createGateBot, TURN_WORK, type GateDifficulty } from './gate1-bot';
import { schedule, summarize, FULL_PAIRS, SEEDS, type Task, type Mode, type Entry, type Bands } from './gate1-report';

export const BANDS_PATH = 'lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json';
export const PROPOSAL_PATH = 'lab/docs/GATE1-AMENDMENT-PROPOSAL-2026-09-19.md';
export const REFERENCE_PATH = 'lab/ai/gate1-references.json';
export const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const initial = (handicap: number) => {
  const state = createInitialGameState(undefined, 4, handicap, 'phasing');
  state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
  return state;
};

/** Read hashes only; never read any opening corpus (dev, val or sealed). */
function sources() {
  const paths = execFileSync('rg', ['--files', 'src/ai', 'src/game', 'assembly', 'lab/ai', 'lab/harness', '-g', '*.ts'],
    { encoding: 'utf8' }).trim().split('\n');
  paths.push('package-lock.json', 'src/ai/wasm/tactics.wasm', 'lab/hard-ai/ladder/elo.ts',
    'lab/hard-ai/ladder/heavy.ts', 'docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md',
    'docs/PHASING-2026-09-16.md', BANDS_PATH, PROPOSAL_PATH, REFERENCE_PATH);
  return Object.fromEntries([...new Set(paths)].sort().map(p => [p, sha(readFileSync(p))]));
}

export async function resolvedConfigs(solver: TacticalSolver) {
  // Fresh throw-away engines expose their ACTUAL resolved defaults via debug.
  // No duplicated difficulty preset table; the live game engines are seeded afresh.
  const configs = {} as Record<GateDifficulty, ReturnType<ReturnType<typeof createGateBot>['resolvedConfig']>>;
  for (const difficulty of ['hard', 'medium'] as const) {
    const seat = createGateBot(difficulty, solver);
    seat.bot.onGameStart('white', 1);
    await seat.bot.nextAction(initial(0), 'white');
    configs[difficulty] = seat.resolvedConfig();
  }
  return configs;
}

export async function runTask(task: Task, solver: TacticalSolver, identityHash: string,
  configs: Awaited<ReturnType<typeof resolvedConfigs>>, runId: string) {
  const hard = createGateBot('hard', solver);
  const medium = task.opponent === 'aiv2-medium' ? createGateBot('medium', solver) : null;
  const other = medium?.bot ?? ({ Rush: createRushBot, Expand: createExpandBot, Balanced: createBalancedBot }
    [task.opponent as 'Rush' | 'Expand' | 'Balanced'])();
  const otherSeat = task.hardSeat === 'white' ? 'black' : 'white';
  const bots = task.hardSeat === 'white' ? { white: hard.bot, black: other } : { white: other, black: hard.bot };
  const trace: AIAction[] = [];
  const arrivals = { white: 0, black: 0 }, refunds = { white: 0, black: 0 };
  const startLoad = loadavg();
  const { record, replay } = await playGame({ bots, seed: task.seed, runId, engineHash: identityHash,
    experiment: 'gate1-proposal', initialState: initial(task.handicap),
    options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: task.handicap,
      actionsPerTurn: 4, upkeep: 'shipped', inactivityRule: 'on', recordReplay: true },
    onAction(before, after, action) {
      trace.push(action);
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
  traceSha256: sha(JSON.stringify(trace)), replay };
}

export function parseArgs(args: string[]) {
  let mode: Mode = 'pilot', out: string | undefined, plan = false;
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
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!plan && !out) throw new Error('Provide --out <new directory> or --plan');
  return { mode, out, plan };
}

export async function main(args: string[]) {
  const { mode, out, plan } = parseArgs(args);
  const tasks = schedule(mode);
  if (plan) {
    console.log(json({ status: 'proposal; not adopted', mode, games: tasks.length,
      pairsPerOpponentAndHandicap: mode === 'pilot' ? 1 : FULL_PAIRS, seed: SEEDS[mode],
      workPerTurn: TURN_WORK, openings: 'canonical initial Phasing state; no corpus', schedule: tasks }));
    return;
  }
  if (heavyBypassed()) throw new Error('Gate 1 refuses MUJU_HEAVY_BYPASS');
  await withHeavySlot(`gate1-${mode}`, async () => {
    // mkdir without recursive/exist-ok: evidence is never overwritten or resumed across identities.
    mkdirSync(out!);
    mkdirSync(`${out}/replays`);
    const manifestPath = `${out}/manifest.json`;
    const manifest: Record<string, unknown> = { schema: 'muju-gate1-v1', status: 'initializing',
      startedAt: new Date().toISOString(), mode, expectedGames: tasks.length, schedule: tasks,
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      node: process.version, device: `${cpus()[0]?.model} / ${platform()}/${arch()}`, cpuCount: cpus().length,
      loadBefore: loadavg(), queue: { directory: heavyDir(), slots: slotCount() },
      note: 'Pilot/proposal only. No Gate 1 pass, worker unlock, or responsiveness claim.' };
    writeFileSync(manifestPath, json(manifest));
    const entries: Entry[] = [];
    let activeTask: Task | undefined;
    try {
      const fileHashes = sources();
      const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
      const configs = await resolvedConfigs(solver);
      const references = JSON.parse(readFileSync(REFERENCE_PATH, 'utf8'));
      if (references.bandsSha256 !== fileHashes[BANDS_PATH]) throw new Error('Frozen band hash mismatch');
      for (const [path, expected] of Object.entries(references.sourceHashes)) {
        if (sha(readFileSync(path)) !== expected) throw new Error(`Historical source hash mismatch: ${path}`);
      }
      const identity = { rulesVersion: 'muju-phasing-1', abi: 7, files: fileHashes, configs,
        configHashes: Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, sha(json(v))])),
        weights: DEFAULT_WEIGHTS, hardWeightsVersion: null, hardBookMagic: null,
        hardIdentityNote: 'Hard replica is not an arm in Gate 1 and is never instantiated',
        options: DEFAULT_MATCH_OPTIONS, opening: 'initial', workPerTurn: TURN_WORK };
      const identityHash = sha(json(identity));
      Object.assign(manifest, { status: 'running', identityHash });
      writeFileSync(`${out}/identity.json`, json(identity));
      writeFileSync(manifestPath, json(manifest));
      const bands = JSON.parse(readFileSync(BANDS_PATH, 'utf8')) as Bands;
      for (const task of tasks) {
        activeTask = task;
        const { replay, ...entry } = await runTask(task, solver, identityHash, configs, out!);
        writeFileSync(`${out}/replays/${task.id}.json`, json(replay));
        appendFileSync(`${out}/games.jsonl`, JSON.stringify(entry) + '\n');
        entries.push(entry);
        const r = entry.record;
        console.log(JSON.stringify({ id: task.id, winner: r.winner, reason: r.winType,
          turns: r.completedTurns, purchases: r.players[task.hardSeat].unitsPlaced, ms: r.durationMs }));
        if (r.invariantViolation || r.anomalies.length || r.players.white.illegalActions + r.players.black.illegalActions) {
          throw new Error(`Correctness veto in ${task.id}; row void`);
        }
      }
      if (JSON.stringify(sources()) !== JSON.stringify(fileHashes)) throw new Error('Sources changed during row; row void');
      const summary = summarize(entries, mode, identityHash, bands, references.proposedElo);
      writeFileSync(`${out}/summary.json`, json(summary));
      if (summary.errors.length) throw new Error(summary.errors.join('\n'));
      Object.assign(manifest, { status: 'complete', completedGames: entries.length, gate1: summary.gate1 });
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      appendFileSync(`${out}/failures.jsonl`, JSON.stringify({ task: activeTask, error: message }) + '\n');
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
