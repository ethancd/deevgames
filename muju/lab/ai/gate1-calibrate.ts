/**
 * Gate 1 budget calibration (preregistration amendment A3 §3).
 *
 *   "Before the row, on the same dev openings, measure the median search work
 *    each engine consumes per own turn in WALL mode at its shipped quick
 *    allowance (hard 10,000 ms, medium 3,000 ms) on the measurement machine
 *    while otherwise idle; record machine, load and the two medians in the row's
 *    manifest; use those medians as the row's fixed-work budgets."
 *
 * Why this exists. A2 asserted 6,000 / 3,000 work units per own turn. Nothing
 * had measured what either engine actually spends, and an independent diagnosis
 * put those numbers at 3–15% of the shipped pace, unequally between the arms.
 * A budget is a property of the machine and the engine, so it is measured here
 * and written down, rather than chosen.
 *
 * What "work" means. `SearchBudget` (`src/ai/runtime.ts`) counts one unit per
 * `spend()`, and `fixedWork` is a cap on exactly that counter — so a work budget
 * and a work measurement are the same quantity by construction. The class does
 * not expose the counter, and `src/ai/**` is not this lane's to edit, so the
 * meter below wraps `SearchBudget.prototype.spend` for the duration of the
 * measurement and restores it afterwards. `tests/lab/gate1-calibration.test.ts`
 * pins the meter against a work-bound search, where the consumed work must equal
 * the requested `fixedWork` exactly.
 *
 * The seat plays the SHIPPED whole-turn loop (`useAI.ts`, mirrored by
 * `lab/ai/turn-budget-smoke.ts`): one allowance per turn, `scaleToBudget` on,
 * debited by what each search spent, plan dispatched action by action. At the
 * quick allowance `scaleConfigForBudget` is a no-op by construction, so this is
 * the shipped preset at the shipped clock.
 *
 * From muju/:
 *   node --import tsx lab/ai/gate1-calibrate.ts --out <NEW directory> [--turns 16] [--openings 8]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, loadavg, platform, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { SearchBudget } from '../../src/ai/runtime';
import { aiTurnBudgetMs } from '../../src/ai/turnTime';
import { isLegalAction } from '../../src/game/legality';
import type { AIAction } from '../../src/ai/types';
import type { GameState, PlayerId } from '../../src/game/types';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { playGame } from '../harness/runner';
import { DEFAULT_MATCH_OPTIONS, type EngineBot } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, slotCount } from '../hard-ai/ladder/heavy';
import { DEV_BOOK_PATH, HANDICAPS, gate1StartState, loadGate1Book } from './gate1-openings';
import type { GateDifficulty } from './gate1-bot';

export const CALIBRATION_SCHEMA = 'muju-gate1-calibration-v1' as const;
export const CALIBRATION_AMENDMENT = 'A3' as const;
export const DIFFICULTIES: readonly GateDifficulty[] = ['hard', 'medium'];
/** A3 names these explicitly; read them from the shipped table so they cannot drift. */
export const QUICK_ALLOWANCE_MS: Record<GateDifficulty, number> = {
  hard: aiTurnBudgetMs('hard', 'quick'),
  medium: aiTurnBudgetMs('medium', 'quick'),
};

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * Counts the work a search consumes, by wrapping `SearchBudget#spend` while the
 * measurement runs. Single-threaded: one search is in flight at a time, so a
 * process-wide counter is exact. `install()` throws if a meter is already
 * installed, so a leaked patch can never silently double-count.
 */
export class WorkMeter {
  private original: SearchBudget['spend'] | null = null;
  private total = 0;
  install(): void {
    if (this.original) throw new Error('Work meter already installed');
    this.original = SearchBudget.prototype.spend;
    const original = this.original;
    const meter = this;
    SearchBudget.prototype.spend = function (this: SearchBudget, amount = 1): boolean {
      const accepted = original.call(this, amount);
      if (accepted) meter.total += amount;
      return accepted;
    };
  }
  uninstall(): void {
    if (!this.original) return;
    SearchBudget.prototype.spend = this.original;
    this.original = null;
  }
  reset(): void { this.total = 0; }
  read(): number { return this.total; }
  /** Installs the meter for `fn` and always restores the prototype. */
  static async around<T>(fn: (meter: WorkMeter) => Promise<T>): Promise<T> {
    const meter = new WorkMeter();
    meter.install();
    try { return await fn(meter); } finally { meter.uninstall(); }
  }
}

export interface TurnSample {
  difficulty: GateDifficulty;
  opening: string;
  handicap: number;
  turn: number;
  seat: PlayerId;
  work: number;
  searchMs: number;
  searches: number;
}

/**
 * One seat running the shipped whole-turn loop at `allowanceMs`, recording the
 * work and time each of its own turns consumed.
 */
export function createPacedSeat(
  difficulty: GateDifficulty, solver: TacticalSolver, meter: WorkMeter,
  allowanceMs: number, sink: (sample: Omit<TurnSample, 'difficulty' | 'opening' | 'handicap'>) => void,
) {
  let engine: AIEngineV2 | null = null, seed = 1;
  let queue: AIAction[] = [], remainingMs = 0, turnKey = '';
  let open: { turn: number; seat: PlayerId; work: number; searchMs: number; searches: number } | null = null;
  const flush = () => { if (open && open.searches) sink(open); open = null; };
  const bot: EngineBot = {
    kind: 'engine', name: `aiv2-${difficulty}@wall${allowanceMs}`,
    onGameStart(_player, gameSeed) { seed = gameSeed; engine = null; queue = []; turnKey = ''; flush(); },
    async nextAction(state: GameState, player: PlayerId) {
      if (state.ruleset !== 'phasing') throw new Error('Calibration requires Phasing');
      const key = `${state.turn.turnNumber}:${player}`;
      if (key !== turnKey) {
        flush();
        turnKey = key; remainingMs = allowanceMs; queue = [];
        open = { turn: state.turn.turnNumber, seat: player, work: 0, searchMs: 0, searches: 0 };
      }
      if (!engine) { engine = new AIEngineV2(difficulty); engine.setSeed(seed); engine.setTacticalSolver(solver); }
      if (queue.length && !isLegalAction(state, queue[0])) queue = [];
      if (!queue.length) {
        // WALL mode: fixedWork stays 0, the whole-turn allowance is the budget.
        engine.setConfig({ fixedWork: 0, scaleToBudget: true });
        meter.reset();
        const result = await engine.findBestAction(state, Math.max(1, remainingMs));
        open!.work += meter.read();
        open!.searchMs += result.timeMs;
        open!.searches += 1;
        remainingMs = Math.max(0, remainingMs - result.timeMs);
        queue = [...result.plan.actions];
      }
      return queue.shift() ?? null;
    },
  };
  return { bot, flush };
}

export const median = (xs: readonly number[]): number => {
  if (!xs.length) throw new Error('Median of an empty sample');
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};

export interface CalibrationOptions {
  turnsPerEngine: number;
  openings: number;
  /** Full-round ceiling per calibration game: bounds a game to a few own turns. */
  maxTurns: number;
  seed: number;
}
export const DEFAULT_CALIBRATION: CalibrationOptions = { turnsPerEngine: 16, openings: 8, maxTurns: 2, seed: 20260960 };

/**
 * Plays bounded self-play games from the first `openings` dev openings with both
 * seats at `difficulty`, so every completed turn is a sample of that engine's
 * own turn, and stops as soon as `turnsPerEngine` samples exist.
 */
export async function sampleEngine(
  difficulty: GateDifficulty, solver: TacticalSolver, options: CalibrationOptions,
  book: ReturnType<typeof loadGate1Book>,
): Promise<TurnSample[]> {
  const samples: TurnSample[] = [];
  await WorkMeter.around(async meter => {
    for (let i = 0; i < options.openings && samples.length < options.turnsPerEngine; i++) {
      const opening = book.openings[i];
      const handicap = HANDICAPS[i % HANDICAPS.length];
      const collected: Omit<TurnSample, 'difficulty' | 'opening' | 'handicap'>[] = [];
      const sink = (s: Omit<TurnSample, 'difficulty' | 'opening' | 'handicap'>) => collected.push(s);
      const white = createPacedSeat(difficulty, solver, meter, QUICK_ALLOWANCE_MS[difficulty], sink);
      const black = createPacedSeat(difficulty, solver, meter, QUICK_ALLOWANCE_MS[difficulty], sink);
      await playGame({
        bots: { white: white.bot, black: black.bot },
        seed: options.seed + i, runId: 'gate1-calibration', engineHash: 'calibration',
        experiment: `gate1-calibration-${CALIBRATION_AMENDMENT}`,
        initialState: gate1StartState(opening, handicap),
        options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: handicap, actionsPerTurn: 4,
          maxTurns: options.maxTurns, upkeep: 'shipped', inactivityRule: 'on' },
      });
      white.flush(); black.flush();
      for (const c of collected) samples.push({ difficulty, opening: opening.id, handicap, ...c });
    }
  });
  if (samples.length < 4) throw new Error(`Calibration sample too small for ${difficulty}: ${samples.length} turns`);
  return samples.slice(0, Math.max(options.turnsPerEngine, 4));
}

export function summarizeSamples(samples: readonly TurnSample[]) {
  const work = samples.map(s => s.work), ms = samples.map(s => s.searchMs);
  return {
    ownTurns: samples.length,
    medianWorkPerTurn: median(work),
    meanWorkPerTurn: Math.round(work.reduce((a, b) => a + b, 0) / work.length),
    minWorkPerTurn: Math.min(...work), maxWorkPerTurn: Math.max(...work),
    p25WorkPerTurn: quantile(work, 0.25), p75WorkPerTurn: quantile(work, 0.75),
    medianSearchMsPerTurn: median(ms),
    medianSearchesPerTurn: median(samples.map(s => s.searches)),
    samples,
  };
}

export interface Calibration {
  path: string;
  sha256: string;
  budgets: Record<GateDifficulty, number>;
  manifest: Record<string, unknown>;
}

/**
 * Reads the calibration manifest a row is required to run against (A3 §3), and
 * refuses anything that is not a complete A3 calibration of BOTH engines at the
 * shipped quick allowance. The row has no fallback: without this file there are
 * no budgets, which is the point — A2's were asserted.
 */
export function loadCalibration(path: string): Calibration {
  const bytes = readFileSync(path);
  const manifest = JSON.parse(bytes.toString('utf8')) as Record<string, any>;
  if (manifest.schema !== CALIBRATION_SCHEMA || manifest.amendment !== CALIBRATION_AMENDMENT) {
    throw new Error(`${path} is not a ${CALIBRATION_SCHEMA}/${CALIBRATION_AMENDMENT} calibration manifest`);
  }
  if (manifest.book?.path !== DEV_BOOK_PATH) throw new Error('Calibration was not measured on the dev book');
  const budgets = {} as Record<GateDifficulty, number>;
  for (const difficulty of DIFFICULTIES) {
    const engine = manifest.engines?.[difficulty];
    const budget = manifest.budgets?.[difficulty];
    if (!engine || engine.allowanceMs !== QUICK_ALLOWANCE_MS[difficulty] || engine.pace !== 'quick') {
      throw new Error(`Calibration for ${difficulty} is missing or was not measured at its shipped quick allowance`);
    }
    if (!Number.isSafeInteger(engine.ownTurns) || engine.ownTurns < 4) {
      throw new Error(`Calibration for ${difficulty} sampled too few own turns`);
    }
    if (!Number.isSafeInteger(budget) || budget < 1 || budget !== engine.medianWorkPerTurn) {
      throw new Error(`Calibration budget for ${difficulty} is not its recorded median work per own turn`);
    }
    budgets[difficulty] = budget;
  }
  return { path, sha256: sha(bytes), budgets, manifest };
}

export function parseArgs(args: string[]): { out: string; options: CalibrationOptions } {
  let out: string | undefined;
  const options = { ...DEFAULT_CALIBRATION };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Repeated option ${flag}`);
    seen.add(flag);
    const number = (name: string) => {
      const value = Number(args[++i]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} requires a positive integer`);
      return value;
    };
    if (flag === '--out') { out = args[++i]; if (!out || out.startsWith('--')) throw new Error('--out requires a new directory'); }
    else if (flag === '--turns') options.turnsPerEngine = number('--turns');
    else if (flag === '--openings') options.openings = number('--openings');
    else if (flag === '--max-turns') options.maxTurns = number('--max-turns');
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!out) throw new Error('Provide --out <new directory>');
  if (options.openings > 48) throw new Error('The dev book holds 48 openings');
  return { out, options };
}

export async function main(args: string[]) {
  const { out, options } = parseArgs(args);
  if (heavyBypassed()) throw new Error('Gate 1 calibration refuses MUJU_HEAVY_BYPASS');
  await withHeavySlot('gate1-calibrate', async () => {
    mkdirSync(out); // never overwrite an existing calibration
    const book = loadGate1Book(DEV_BOOK_PATH);
    const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
    const loadBefore = loadavg();
    const startedAt = new Date().toISOString();
    const engines: Record<string, ReturnType<typeof summarizeSamples> & { allowanceMs: number; pace: 'quick' }> = {};
    const loadDuring: Record<string, number[]> = {};
    for (const difficulty of DIFFICULTIES) {
      const t0 = Date.now();
      const samples = await sampleEngine(difficulty, solver, options, book);
      loadDuring[difficulty] = loadavg();
      engines[difficulty] = { allowanceMs: QUICK_ALLOWANCE_MS[difficulty], pace: 'quick', ...summarizeSamples(samples) };
      console.log(JSON.stringify({ difficulty, ownTurns: samples.length, elapsedS: Math.round((Date.now() - t0) / 1000),
        medianWorkPerTurn: engines[difficulty].medianWorkPerTurn, load: loadDuring[difficulty] }));
    }
    const budgets = Object.fromEntries(DIFFICULTIES.map(d => [d, engines[d].medianWorkPerTurn]));
    const manifest = {
      schema: CALIBRATION_SCHEMA, amendment: CALIBRATION_AMENDMENT, startedAt,
      finishedAt: new Date().toISOString(),
      book: { path: book.path, sha256: book.sha256, openingsUsed: book.openings.slice(0, options.openings).map(o => o.id) },
      options,
      machine: { device: `${cpus()[0]?.model} / ${platform()}/${arch()}`, cpuCount: cpus().length,
        memoryGB: Math.round(totalmem() / 1e9), node: process.version },
      load: { before: loadBefore, during: loadDuring, after: loadavg(),
        note: 'A3 asks for an otherwise idle machine; the row manifest carries these numbers so a loaded calibration is visible.' },
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      queue: { directory: heavyDir(), slots: slotCount() },
      engines, budgets,
      workDefinition: 'SearchBudget#spend units (src/ai/runtime.ts); the same counter fixedWork caps.',
      mode: 'WALL, shipped whole-turn loop, scaleToBudget on, quick pace (hard 10,000 ms / medium 3,000 ms).',
    };
    const path = `${out}/calibration.json`;
    writeFileSync(path, json(manifest));
    writeFileSync(`${out}/calibration.sha256`, `${sha(readFileSync(path))}  calibration.json\n`);
    console.log(json({ budgets, ratio: budgets.hard / budgets.medium, out: path }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
}
