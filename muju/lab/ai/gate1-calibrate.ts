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
 * WHAT THE FIRST ATTEMPT AT THIS FILE MEASURED, AND WHY IT WAS NOT A ROW BUDGET.
 * Its defaults were `{ turnsPerEngine: 16, openings: 8, maxTurns: 2 }`: every
 * sample came from game turns 1–2, with about three units a side and almost
 * nothing to search, n = 16 per engine, hard ranging 33,963…146,675 around a
 * median of 53,155 — and it was taken at a 5-minute load average near 10 on 12
 * cores, where a WALL-mode measurement under-counts work because the wall clock
 * runs out while the CPU is elsewhere. An opening-only, contended sample is not
 * "the median search work each engine consumes per own turn" (A3 §3); it is the
 * median over the cheapest turns of the game, measured badly. So:
 *
 *  - games run to termination (or `maxTurns`, at least 20 full rounds) across
 *    ALL 48 dev openings and BOTH handicaps, so late-game turns — where the
 *    board is full and a search is expensive — are in the sample;
 *  - the report gives the median per GAME STAGE (opening / middle / late, by
 *    terciles of each seat's own-turn index) as well as overall, with n, so a
 *    reader can see how far the budget is from the stage it will mostly spend;
 *  - machine identity, core count and the load averages at start AND end lead the
 *    manifest, AND the load is now sampled at EVERY GAME BOUNDARY rather than
 *    twice (see `LoadSampler`), because a twelve-hour measurement that begins and
 *    ends on an idle box can spend the middle of itself competing with something
 *    else and under-count the whole time;
 *  - `loadCalibration` REFUSES a manifest taken on a loaded machine, on a
 *    different machine, against a different source tree, or more than 24 hours
 *    ago, unless the row explicitly accepts THAT KIND of refusal —
 *    `--accept-calibration=load,machine,age,sources` — which is then stamped,
 *    kind by kind, into the row manifest and the report header.
 *
 * WHICH NUMBER BECOMES THE BUDGET. A3 §3 says "the median search work each
 * engine consumes per own turn". That is the OVERALL median over every own turn
 * in the sample, per engine — not a stage median, not a mean, not a percentile,
 * and not the median of per-game medians. That last one matters enough to be
 * reported next to it: the overall median is TURN-weighted, so a long game
 * contributes more turns than a short one, and if the two disagree by more than a
 * quarter the manifest says so out loud (`weighting.flagged`). Stage medians and
 * absolute-own-turn-bucket medians are reported for context and are used by
 * nothing.
 *
 * What "work" means. `SearchBudget` (`src/ai/runtime.ts`) counts one unit per
 * `spend()`, and `fixedWork` is a cap on exactly that counter — so a work budget
 * and a work measurement are the same quantity by construction. The meter lives
 * in `gate1-work.ts` because the ROW's adapter needs it too, to debit a turn by
 * what each search actually spent. `tests/lab/gate1-calibration.test.ts` pins the
 * meter against a work-bound search, where consumed work must equal the requested
 * `fixedWork` exactly.
 *
 * The seat plays the SHIPPED whole-turn loop (`useAI.ts`, mirrored by
 * `lab/ai/turn-budget-smoke.ts`): one allowance per turn, `scaleToBudget` on,
 * debited by what each search spent, plan dispatched action by action. At the
 * quick allowance `scaleConfigForBudget` is a no-op by construction, so this is
 * the shipped preset at the shipped clock.
 *
 * From muju/:
 *   node --import tsx lab/ai/gate1-calibrate.ts --out <NEW directory>
 *     [--openings 48] [--max-turns 60] [--turns <cap>]
 *     [--provisional "<why this is not a row budget>"]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, hostname, loadavg, platform, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { aiTurnBudgetMs } from '../../src/ai/turnTime';
import { isLegalAction } from '../../src/game/legality';
import type { AIAction } from '../../src/ai/types';
import type { GameState, PlayerId } from '../../src/game/types';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { playGame } from '../harness/runner';
import { DEFAULT_MATCH_OPTIONS, type EngineBot } from '../harness/types';
import { withHeavySlot, heavyBypassed, heavyDir, readSlots, slotCount } from '../hard-ai/ladder/heavy';
import { DEV_BOOK_PATH, DEV_BOOK_ROWS, HANDICAPS, gate1StartState, loadGate1Book } from './gate1-openings';
import { sourceFileHashes, sourceIdentitySha256 } from './gate1-sources';
import { WorkMeter } from './gate1-work';
import type { GateDifficulty } from './gate1-bot';

export { WorkMeter };

/**
 * v3: per-game-boundary load sampling, absolute-own-turn buckets, the
 * turn/game weighting flag, and the kinded acceptance a row now needs. A v1
 * manifest is an opening-only sample and a v2 manifest carries only two load
 * readings; both are refused outright, not warned about. (A4 voided every
 * calibration taken before it in any case.)
 */
export const CALIBRATION_SCHEMA = 'muju-gate1-calibration-v3' as const;
export const CALIBRATION_AMENDMENT = 'A3' as const;
export const DIFFICULTIES: readonly GateDifficulty[] = ['hard', 'medium'];
/** A3 names these explicitly; read them from the shipped table so they cannot drift. */
export const QUICK_ALLOWANCE_MS: Record<GateDifficulty, number> = {
  hard: aiTurnBudgetMs('hard', 'quick'),
  medium: aiTurnBudgetMs('medium', 'quick'),
};
/** A3 §3 wants an "otherwise idle" machine. One busy core out of many is the
 * most a calibration may carry before the wall-mode sample starts to shrink. */
export const MAX_CALIBRATION_LOAD1 = 1.5;
/**
 * The ceiling on the MAXIMUM 5-minute load average seen at any game boundary.
 *
 * The 1-minute readings at start and end were the only load evidence a v2
 * manifest carried, and they are exactly the two moments a twelve-hour
 * measurement is least likely to be contended: the operator starts it on a quiet
 * box and comes back to a quiet box. The 5-minute average is the one that
 * remembers, and sampling it at every game boundary is what makes it able to
 * catch an hour of competition in the middle.
 *
 * THE ALLOWANCE, STATED. A calibration is itself one busy thread, so it
 * contributes about 1.0 to the load average all by itself; a machine that is
 * "otherwise idle" in A3 §3's sense therefore reads about 1.0, not 0. The ceiling
 * is 1.0 (the calibration's own thread) + 1.0 (everything else it will tolerate) =
 * 2.0. Above that, something other than this measurement was using a core for
 * minutes at a time, and in WALL mode that means the sample is low.
 */
export const CALIBRATION_OWN_THREAD_LOAD = 1.0;
export const MAX_CALIBRATION_LOAD5 = 1.0 + CALIBRATION_OWN_THREAD_LOAD;
/** Beyond a day, the machine's state is no longer the one the row runs on. */
export const MAX_CALIBRATION_AGE_MS = 24 * 60 * 60 * 1000;
/** "Full-length": at least twenty full rounds, or termination, per game. */
export const MIN_CALIBRATION_MAX_TURNS = 20;
/** A3 §3: "on the same dev openings" — all of them, at both handicaps. */
export const CALIBRATION_OPENINGS = DEV_BOOK_ROWS;
export const GAME_STAGES = ['opening', 'middle', 'late'] as const;
export type GameStage = typeof GAME_STAGES[number];
/**
 * Buckets of ABSOLUTE own-turn index, alongside the relative terciles.
 *
 * A tercile is relative to the game it came from, so "late" in a nine-turn game
 * and "late" in a forty-turn game are different positions with different costs,
 * and a median over terciles cannot tell them apart. These buckets are absolute:
 * a seat's first five own turns, its sixth to fifteenth, and everything after.
 * Reported, used by nothing.
 */
export const OWN_TURN_BUCKETS = [
  { id: '1-5', from: 1, to: 5 },
  { id: '6-15', from: 6, to: 15 },
  { id: '16+', from: 16, to: Infinity },
] as const;
export type OwnTurnBucket = typeof OWN_TURN_BUCKETS[number]['id'];
/** The manifest says so when the turn- and game-weighted medians disagree by more. */
export const WEIGHTING_DISAGREEMENT = 0.25;

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const json = (s: unknown) => JSON.stringify(s, null, 2) + '\n';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * Who measured this, so a row can tell whether the budget describes the machine
 * it is about to run on. The node version is recorded but deliberately left OUT
 * of the hash: the work counter is deterministic, so a patch release does not
 * make an old budget wrong, and voiding a 12-hour calibration over one would be
 * theatre. Everything that changes how much a search gets done — the CPU, how
 * many of them, the OS and the memory — is in it.
 */
export interface MachineIdentity {
  hostname: string; cpuModel: string; cpuCount: number; memoryGB: number;
  platform: string; arch: string; sha256: string; node: string;
}
export function machineIdentity(): MachineIdentity {
  const identity = {
    hostname: hostname(), cpuModel: cpus()[0]?.model ?? 'unknown', cpuCount: cpus().length,
    memoryGB: Math.round(totalmem() / 1e9), platform: platform(), arch: arch(),
  };
  return { ...identity, sha256: sha(JSON.stringify(identity)), node: process.version };
}

export interface LoadSample {
  at: string;
  label: string;
  load1: number;
  load5: number;
  load15: number;
  /**
   * The heavy-queue slots held at this moment, by label and pid, EXCLUDING this
   * process. `lab/hard-ai/ladder/heavy.ts` exposes them (`readSlots`), so when a
   * calibration is contended the manifest can say by WHOM rather than only that
   * the number was high — which is the difference between "re-measure later" and
   * "re-measure after that ladder run finishes".
   */
  heavySlotHolders: { slot: number; label: string; pid: number }[];
}

/**
 * Samples the load average at every game boundary of a calibration, so the
 * manifest can carry the max and the mean rather than the two least
 * representative readings of the run.
 */
export class LoadSampler {
  readonly samples: LoadSample[] = [];
  constructor(private readonly clock: () => number[] = loadavg,
    private readonly slots: () => ReturnType<typeof readSlots> = readSlots) {}
  sample(label: string): LoadSample {
    const [load1, load5, load15] = this.clock();
    let heavySlotHolders: LoadSample['heavySlotHolders'] = [];
    try {
      heavySlotHolders = this.slots()
        .filter(s => s.record !== null && !s.stale && s.record.pid !== process.pid)
        .map(s => ({ slot: s.index, label: s.record!.label, pid: s.record!.pid }));
    } catch {
      heavySlotHolders = []; // the queue directory is advisory; never fail a sample on it
    }
    const sample: LoadSample = { at: new Date().toISOString(), label, load1, load5, load15, heavySlotHolders };
    this.samples.push(sample);
    return sample;
  }
  summary() {
    const stat = (pick: (s: LoadSample) => number) => {
      if (!this.samples.length) return { max: null, mean: null };
      const xs = this.samples.map(pick);
      return { max: Math.max(...xs), mean: Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3)) };
    };
    const holders = new Map<string, number>();
    for (const s of this.samples) for (const h of s.heavySlotHolders) {
      holders.set(`${h.label} (pid ${h.pid})`, (holders.get(`${h.label} (pid ${h.pid})`) ?? 0) + 1);
    }
    return {
      samples: this.samples.length,
      load1: stat(s => s.load1),
      load5: stat(s => s.load5),
      load15: stat(s => s.load15),
      /** Every other heavy-queue holder seen, with how many samples saw it. */
      heavySlotHoldersSeen: [...holders].map(([holder, samples]) => ({ holder, samples }))
        .sort((a, b) => b.samples - a.samples),
      note: 'Sampled at every game boundary, not only at start and end. maxLoad5 is what a row checks against ' +
        `${MAX_CALIBRATION_LOAD5} = 1.0 (this calibration's own thread) + ${CALIBRATION_OWN_THREAD_LOAD} ` +
        '(everything else an "otherwise idle" machine may carry, A3 §3).',
    };
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
  /** 0-based index of this turn among that seat's own turns in that game. */
  ownTurnIndex: number;
  /** How many own turns that seat had in that game; the tercile denominator. */
  ownTurns: number;
  /** Tercile of `ownTurnIndex` within `ownTurns`. */
  stage: GameStage;
}

/**
 * Splits one seat's own turns into terciles. A seat with fewer than three own
 * turns still gets every sample labelled — the first third of a two-turn game is
 * its first turn — so no sample is silently dropped from the stage report.
 */
export function stageOf(ownTurnIndex: number, ownTurns: number): GameStage {
  if (ownTurns <= 0) throw new Error('A game with no own turns has no stages');
  if (ownTurnIndex * 3 < ownTurns) return 'opening';
  if (ownTurnIndex * 3 < ownTurns * 2) return 'middle';
  return 'late';
}

/** The absolute bucket an own turn falls in, counting that seat's turns from 1. */
export function bucketOf(ownTurnIndex: number): OwnTurnBucket {
  const nth = ownTurnIndex + 1;
  const bucket = OWN_TURN_BUCKETS.find(b => nth >= b.from && nth <= b.to);
  if (!bucket) throw new Error(`No own-turn bucket for turn ${nth}`);
  return bucket.id;
}

/** What one seat can know about its own turn; the game and stage are added by
 * `sampleEngine`, which is the only thing that knows how long the game was. */
export type RawTurnSample = Omit<TurnSample, 'difficulty' | 'opening' | 'handicap' | 'ownTurnIndex' | 'ownTurns' | 'stage'>;

/**
 * One seat running the shipped whole-turn loop at `allowanceMs`, recording the
 * work and time each of its own turns consumed.
 */
export function createPacedSeat(
  difficulty: GateDifficulty, solver: TacticalSolver, meter: WorkMeter,
  allowanceMs: number, sink: (sample: RawTurnSample) => void,
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
  /** How many dev openings to sample, in file order. A3 §3 wants all of them. */
  openings: number;
  /** Every opening is sampled at every handicap the row plays. */
  handicaps: readonly number[];
  /** Full-round ceiling per calibration game; a game ending sooner just ends. */
  maxTurns: number;
  /** Optional cap on samples per engine, for a cheap smoke run. 0 = no cap, and
   * `loadCalibration` refuses a capped manifest as incomplete coverage. */
  turnsPerEngine: number;
  seed: number;
  /**
   * Why this manifest is NOT a row budget, when it is not one. Set by
   * `--provisional "<reason>"`. A provisional manifest may be short, capped and
   * narrow; it is stamped ineligible, `loadCalibration` refuses it unless the row
   * asks for it by name, and `gate1.ts` refuses it for anything but a pilot.
   */
  provisional?: string;
}
export const DEFAULT_CALIBRATION: CalibrationOptions = {
  openings: CALIBRATION_OPENINGS, handicaps: HANDICAPS, maxTurns: 60, turnsPerEngine: 0, seed: 20260960,
};

/**
 * Plays FULL-LENGTH self-play games — every dev opening at every handicap, to
 * termination or `maxTurns` — with both seats at `difficulty`, so every own turn
 * of every stage of the game is a sample of that engine's per-turn work.
 */
export async function sampleEngine(
  difficulty: GateDifficulty, solver: TacticalSolver, options: CalibrationOptions,
  book: ReturnType<typeof loadGate1Book>, sampler?: LoadSampler,
): Promise<TurnSample[]> {
  if (!options.provisional && options.maxTurns < MIN_CALIBRATION_MAX_TURNS) {
    throw new Error(`A3 §3 needs full-length games: --max-turns ${options.maxTurns} is below ${MIN_CALIBRATION_MAX_TURNS}`);
  }
  const samples: TurnSample[] = [];
  const capped = () => options.turnsPerEngine > 0 && samples.length >= options.turnsPerEngine;
  await WorkMeter.around(async meter => {
    for (let i = 0; i < options.openings && !capped(); i++) {
      for (const [h, handicap] of options.handicaps.entries()) {
        if (capped()) break;
        const opening = book.openings[i];
        // EVERY GAME BOUNDARY, both sides of it: a contended hour in the middle of
        // a long calibration is invisible to a start/end pair of readings.
        sampler?.sample(`${difficulty}:${opening.id}@h${handicap}:before`);
        // Per seat, in the order that seat took its turns: the tercile index.
        const collected = new Map<PlayerId, RawTurnSample[]>();
        const sink = (s: RawTurnSample) => collected.set(s.seat, [...(collected.get(s.seat) ?? []), s]);
        const white = createPacedSeat(difficulty, solver, meter, QUICK_ALLOWANCE_MS[difficulty], sink);
        const black = createPacedSeat(difficulty, solver, meter, QUICK_ALLOWANCE_MS[difficulty], sink);
        await playGame({
          bots: { white: white.bot, black: black.bot },
          // Distinct per (opening, handicap) so no two calibration games share one.
          seed: options.seed + i * options.handicaps.length + h,
          runId: 'gate1-calibration', engineHash: 'calibration',
          experiment: `gate1-calibration-${CALIBRATION_AMENDMENT}`,
          initialState: gate1StartState(opening, handicap),
          options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: handicap, actionsPerTurn: 4,
            maxTurns: options.maxTurns, upkeep: 'shipped', inactivityRule: 'on' },
        });
        white.flush(); black.flush();
        sampler?.sample(`${difficulty}:${opening.id}@h${handicap}:after`);
        for (const seatSamples of collected.values()) {
          const ownTurns = seatSamples.length;
          seatSamples.forEach((c, ownTurnIndex) => samples.push({
            difficulty, opening: opening.id, handicap, ...c,
            ownTurnIndex, ownTurns, stage: stageOf(ownTurnIndex, ownTurns),
          }));
        }
      }
    }
  });
  if (samples.length < 4) throw new Error(`Calibration sample too small for ${difficulty}: ${samples.length} turns`);
  return samples;
}

function workStats(samples: readonly TurnSample[]) {
  const work = samples.map(s => s.work), ms = samples.map(s => s.searchMs);
  return {
    ownTurns: samples.length,
    medianWorkPerTurn: median(work),
    meanWorkPerTurn: Math.round(work.reduce((a, b) => a + b, 0) / work.length),
    minWorkPerTurn: Math.min(...work), maxWorkPerTurn: Math.max(...work),
    p25WorkPerTurn: quantile(work, 0.25), p75WorkPerTurn: quantile(work, 0.75),
    medianSearchMsPerTurn: median(ms),
    medianSearchesPerTurn: median(samples.map(s => s.searches)),
  };
}

/**
 * The median of each GAME's own median work per turn, and how far it is from the
 * turn-weighted overall median that becomes the budget.
 *
 * The overall median counts turns, so a game that lasted forty own turns puts
 * forty samples in and a game that drew in nine puts nine: the budget is
 * turn-weighted, and a population of a few very long games can move it a long way.
 * The median of per-game medians weights every GAME equally instead. Neither is
 * wrong, and A3 §3 names the turn-weighted one, so that stays the budget — but if
 * they disagree by more than a quarter the sample is telling us the budget depends
 * on which games happened to run long, and the manifest should not make a reader
 * work that out for themselves.
 */
export function weightingComparison(samples: readonly TurnSample[]) {
  const byGame = new Map<string, number[]>();
  for (const s of samples) {
    const key = `${s.opening}@${s.handicap}`;
    byGame.set(key, [...(byGame.get(key) ?? []), s.work]);
  }
  const perGameMedians = [...byGame.values()].map(median);
  const turnWeighted = median(samples.map(s => s.work));
  const gameWeighted = median(perGameMedians);
  const ratio = turnWeighted > 0 ? gameWeighted / turnWeighted : NaN;
  const flagged = Number.isFinite(ratio) && Math.abs(ratio - 1) > WEIGHTING_DISAGREEMENT;
  return {
    turnWeightedMedian: turnWeighted,
    gameWeightedMedian: gameWeighted,
    medianOfPerGameMedians: gameWeighted,
    games: perGameMedians.length,
    ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(4)) : null,
    threshold: WEIGHTING_DISAGREEMENT,
    flagged,
    note: flagged
      ? `The game-weighted median is ${(Math.abs(ratio - 1) * 100).toFixed(1)}% from the turn-weighted one, beyond ` +
        `${WEIGHTING_DISAGREEMENT * 100}%. The budget stays the turn-weighted OVERALL median (A3 §3), but it depends ` +
        'materially on how long the sampled games ran; read the bucket medians before trusting it.'
      : 'Turn-weighted and game-weighted medians agree within ' + `${WEIGHTING_DISAGREEMENT * 100}%.`,
  };
}

/**
 * The engine's block of the manifest: the OVERALL median that becomes its budget
 * (A3 §3), the same statistics per game stage and per absolute own-turn bucket so
 * a reader can see which part of a game that median describes, the turn/game
 * weighting comparison, and the coverage the sample was drawn over.
 */
export function summarizeSamples(samples: readonly TurnSample[]) {
  const games = new Set(samples.map(s => `${s.opening}@${s.handicap}`));
  return {
    ownTurns: samples.length,
    games: games.size,
    coverage: {
      openings: new Set(samples.map(s => s.opening)).size,
      handicaps: [...new Set(samples.map(s => s.handicap))].sort((a, b) => a - b),
      games: games.size,
      maxOwnTurnsInAGame: Math.max(...samples.map(s => s.ownTurns)),
      minOwnTurnsInAGame: Math.min(...samples.map(s => s.ownTurns)),
    },
    overall: workStats(samples),
    stages: Object.fromEntries(GAME_STAGES.map(stage => {
      const of = samples.filter(s => s.stage === stage);
      return [stage, of.length ? workStats(of) : { ownTurns: 0 }];
    })) as Record<GameStage, ReturnType<typeof workStats> | { ownTurns: number }>,
    /** Absolute own-turn buckets, as opposed to the per-game terciles above. */
    ownTurnBuckets: Object.fromEntries(OWN_TURN_BUCKETS.map(bucket => {
      const of = samples.filter(s => bucketOf(s.ownTurnIndex) === bucket.id);
      return [bucket.id, of.length ? workStats(of) : { ownTurns: 0 }];
    })) as Record<OwnTurnBucket, ReturnType<typeof workStats> | { ownTurns: number }>,
    weighting: weightingComparison(samples),
    samples,
  };
}

/** The kinds of situational refusal a row may accept, one flag value each. */
export const CALIBRATION_OVERRIDES = ['load', 'machine', 'age', 'sources'] as const;
export type CalibrationOverride = typeof CALIBRATION_OVERRIDES[number];
export interface CalibrationRefusal { kind: CalibrationOverride; reason: string }

export interface Calibration {
  path: string;
  sha256: string;
  budgets: Record<GateDifficulty, number>;
  manifest: Record<string, unknown>;
  /**
   * What the row accepted, kind by kind, for the row manifest and the report
   * header. `overridden` is empty on a clean calibration.
   *
   * WHY KINDS AND NOT ONE BOOLEAN. `--accept-loaded-calibration` was a single
   * switch over four unrelated concessions: a busy box (the sample is low), another
   * machine (the sample describes other hardware), a stale measurement (the box has
   * moved on) and another source tree (the sample describes other engines). An
   * operator who knowingly accepts a 26-hour-old calibration had no way to accept
   * only that, and the evidence could not distinguish them afterwards. Each is now
   * its own named concession, accepted and stamped separately.
   */
  acceptance: {
    accepted: CalibrationOverride[];
    overridden: CalibrationRefusal[];
    /** The reasons alone, for a header that wants them verbatim. */
    reasons: string[];
  };
  /** Set when the manifest declares itself provisional; a pilot may run on it. */
  provisional: string | null;
  /** Median searches per own turn the shipped loop made, per engine. */
  searchesPerTurn: Record<GateDifficulty, number>;
}

export interface LoadCalibrationOptions {
  /** Which kinds of situational refusal to accept (`--accept-calibration=…`). */
  accept?: readonly CalibrationOverride[];
  /** Run against an explicitly provisional, ineligible calibration. */
  acceptProvisional?: boolean;
  /** The tree the ROW is about to run in (`gate1-sources.ts`). */
  sourceIdentitySha256?: string;
  /** The host the row is about to run on. Defaults to this process's. */
  machine?: MachineIdentity;
  /**
   * The instant the freshness window is measured from. `gate1.ts` passes the ROW's
   * first recorded start, persisted in the output directory, NOT `Date.now()`: a
   * sharded row is eight processes that may start hours apart, and a calibration
   * that was fresh for shard 1 must not become stale for shard 8 — the row is one
   * measurement and its freshness is a property of the row.
   */
  now?: number;
}

/**
 * Reads the calibration manifest a row is required to run against (A3 §3).
 *
 * TWO KINDS OF REFUSAL. A manifest that is not a complete A3 calibration of BOTH
 * engines — wrong schema, wrong book, missing engine, a budget that is not the
 * recorded overall median, coverage short of all 48 openings at both handicaps
 * in full-length games — is not a calibration at all, and throws whatever flags
 * are passed. (The one exception is a manifest that DECLARES itself provisional:
 * that is an honest statement of incompleteness rather than a broken calibration,
 * and it is admitted only when the caller asks for it and only for a pilot.) A
 * manifest that IS a complete one but describes a different situation — taken on a
 * loaded machine, on another machine, against another source tree, or more than 24
 * hours ago — is refused too, and `--accept-calibration=<kinds>` can override each
 * refusal BY KIND. Nothing disappears: every kind and reason is returned here and
 * stamped into the row manifest and the report header.
 *
 * The row has no fallback budget, which is the point — A2's were asserted.
 */
export function loadCalibration(path: string, options: LoadCalibrationOptions = {}): Calibration {
  const bytes = readFileSync(path);
  const manifest = JSON.parse(bytes.toString('utf8')) as Record<string, any>;
  if (manifest.schema !== CALIBRATION_SCHEMA || manifest.amendment !== CALIBRATION_AMENDMENT) {
    throw new Error(`${path} is not a ${CALIBRATION_SCHEMA}/${CALIBRATION_AMENDMENT} calibration manifest ` +
      `(found ${JSON.stringify(manifest.schema)}/${JSON.stringify(manifest.amendment)}; a v1 manifest sampled ` +
      'only opening turns, and a v2 manifest recorded the load twice instead of at every game boundary)');
  }
  if (manifest.book?.path !== DEV_BOOK_PATH) throw new Error('Calibration was not measured on the dev book');
  const provisional: string | null = typeof manifest.provisional?.reason === 'string'
    ? manifest.provisional.reason : null;
  if (provisional && !options.acceptProvisional) {
    throw new Error(`${path} declares itself PROVISIONAL and ineligible: ${provisional}\nA row may not be measured ` +
      'against it. Run a full calibration on an idle machine, or — for a plumbing pilot only — pass ' +
      '--provisional-calibration, which stamps the manifest, the summary and the README as ineligible.');
  }
  const sampled = manifest.options ?? {};
  if (!provisional) {
    if (!Number.isSafeInteger(sampled.maxTurns) || sampled.maxTurns < MIN_CALIBRATION_MAX_TURNS) {
      throw new Error(`Calibration games were capped at ${sampled.maxTurns} turns; A3 §3 needs full-length games ` +
        `(at least ${MIN_CALIBRATION_MAX_TURNS})`);
    }
    if (sampled.turnsPerEngine) throw new Error('Calibration stopped early at a per-engine turn cap; coverage is incomplete');
  }
  const budgets = {} as Record<GateDifficulty, number>;
  const searchesPerTurn = {} as Record<GateDifficulty, number>;
  for (const difficulty of DIFFICULTIES) {
    const engine = manifest.engines?.[difficulty];
    const budget = manifest.budgets?.[difficulty];
    if (!engine || engine.allowanceMs !== QUICK_ALLOWANCE_MS[difficulty] || engine.pace !== 'quick') {
      throw new Error(`Calibration for ${difficulty} is missing or was not measured at its shipped quick allowance`);
    }
    const coverage = engine.coverage ?? {};
    if (!provisional && (coverage.openings !== CALIBRATION_OPENINGS ||
      JSON.stringify(coverage.handicaps) !== JSON.stringify([...HANDICAPS]))) {
      throw new Error(`Calibration for ${difficulty} covered ${coverage.openings} openings at handicaps ` +
        `${JSON.stringify(coverage.handicaps)}; A3 §3 needs all ${CALIBRATION_OPENINGS} at ${JSON.stringify([...HANDICAPS])}`);
    }
    if (!Number.isSafeInteger(engine.ownTurns) || engine.ownTurns < 4) {
      throw new Error(`Calibration for ${difficulty} sampled too few own turns`);
    }
    if (!provisional) {
      for (const stage of GAME_STAGES) {
        if (!engine.stages?.[stage]?.ownTurns) throw new Error(`Calibration for ${difficulty} has no ${stage} samples`);
      }
    }
    if (!Number.isSafeInteger(budget) || budget < 1 || budget !== engine.overall?.medianWorkPerTurn) {
      throw new Error(`Calibration budget for ${difficulty} is not its recorded OVERALL median work per own turn ` +
        `(budget ${budget}, overall median ${engine.overall?.medianWorkPerTurn})`);
    }
    const searches = engine.overall?.medianSearchesPerTurn;
    if (!Number.isFinite(searches) || searches < 1) {
      throw new Error(`Calibration for ${difficulty} records no median searches per own turn; the row cannot show ` +
        'that its adapter paces like the loop that was measured');
    }
    budgets[difficulty] = budget;
    searchesPerTurn[difficulty] = searches;
  }
  // Situational refusals: real calibrations of a situation that is not this row's.
  const overridden: CalibrationRefusal[] = [];
  const load = manifest.load ?? {};
  for (const [when, value] of [['start', load.load1AtStart], ['end', load.load1AtEnd]] as const) {
    if (typeof value !== 'number') throw new Error(`Calibration manifest records no 1-minute load at ${when}`);
    if (value > MAX_CALIBRATION_LOAD1) {
      overridden.push({ kind: 'load', reason: `1-minute load average at ${when} was ${value}, above the ` +
        `${MAX_CALIBRATION_LOAD1} an "otherwise idle" machine may carry (A3 §3); WALL-mode work is under-counted ` +
        'on a loaded box' });
    }
  }
  const maxLoad5 = load.boundaries?.load5?.max;
  if (typeof maxLoad5 !== 'number') {
    throw new Error('Calibration manifest records no per-game-boundary load samples (load.boundaries.load5.max); a ' +
      'v2 manifest sampled the load only at start and end, which are the two moments a long measurement is least ' +
      'likely to be contended');
  }
  if (maxLoad5 > MAX_CALIBRATION_LOAD5) {
    const holders = (load.boundaries?.heavySlotHoldersSeen ?? []) as { holder?: string }[];
    overridden.push({ kind: 'load', reason: `the highest 5-minute load average at any game boundary was ` +
      `${maxLoad5}, above ${MAX_CALIBRATION_LOAD5} = 1.0 for the calibration's own thread + ` +
      `${CALIBRATION_OWN_THREAD_LOAD} for everything else an "otherwise idle" machine may carry (A3 §3)` +
      (holders.length ? `; heavy-queue holders seen: ${holders.map(h => h.holder).join(', ')}` : '') });
  }
  const host = options.machine ?? machineIdentity();
  const measuredOn = manifest.machine?.sha256;
  if (typeof measuredOn !== 'string') throw new Error('Calibration manifest records no machine identity');
  if (measuredOn !== host.sha256) {
    overridden.push({ kind: 'machine', reason: `measured on ${manifest.machine?.hostname} ` +
      `(${manifest.machine?.cpuCount}x ${manifest.machine?.cpuModel}), not on this host ${host.hostname} ` +
      `(${host.cpuCount}x ${host.cpuModel})` });
  }
  const finishedAt = Date.parse(String(manifest.finishedAt));
  if (!Number.isFinite(finishedAt)) throw new Error('Calibration manifest records no finish time');
  const ageMs = (options.now ?? Date.now()) - finishedAt;
  if (ageMs > MAX_CALIBRATION_AGE_MS) {
    overridden.push({ kind: 'age', reason: `measured ${(ageMs / 3600000).toFixed(1)} hours before the row started, ` +
      `beyond the ${MAX_CALIBRATION_AGE_MS / 3600000}-hour freshness window` });
  }
  const measuredSources = manifest.sourceIdentity?.sha256;
  if (typeof measuredSources !== 'string') throw new Error('Calibration manifest records no source identity');
  if (options.sourceIdentitySha256 !== undefined && measuredSources !== options.sourceIdentitySha256) {
    overridden.push({ kind: 'sources', reason: `measured against source identity ${measuredSources.slice(0, 12)}, ` +
      `not the row's ${options.sourceIdentitySha256.slice(0, 12)}: the engines it timed are not the engines this ` +
      'row runs' });
  }
  const accepted = [...new Set(options.accept ?? [])];
  const unaccepted = overridden.filter(r => !accepted.includes(r.kind));
  if (unaccepted.length) {
    throw new Error(`${path} is a valid A3 calibration of a DIFFERENT situation:\n` +
      unaccepted.map(r => `  - [${r.kind}] ${r.reason}`).join('\n') +
      `\nMeasure a fresh calibration, or pass --accept-calibration=${[...new Set(unaccepted.map(r => r.kind))].join(',')} ` +
      'to run against this one; each kind accepted and every reason above are then stamped into the row manifest ' +
      'and the report header.');
  }
  return { path, sha256: sha(bytes), budgets, manifest, provisional, searchesPerTurn,
    acceptance: { accepted, overridden, reasons: overridden.map(r => `[${r.kind}] ${r.reason}`) } };
}

/** `--accept-calibration=load,machine` → the kinds, validated. */
export function parseCalibrationOverrides(raw: string): CalibrationOverride[] {
  const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (!parts.length) throw new Error(`--accept-calibration needs at least one of ${CALIBRATION_OVERRIDES.join(',')}`);
  const kinds: CalibrationOverride[] = [];
  for (const part of parts) {
    if (!(CALIBRATION_OVERRIDES as readonly string[]).includes(part)) {
      throw new Error(`--accept-calibration: ${JSON.stringify(part)} is not one of ${CALIBRATION_OVERRIDES.join(',')}`);
    }
    if (kinds.includes(part as CalibrationOverride)) throw new Error(`--accept-calibration repeats ${part}`);
    kinds.push(part as CalibrationOverride);
  }
  return kinds;
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
    else if (flag === '--provisional') {
      const reason = args[++i];
      if (!reason || reason.startsWith('--')) throw new Error('--provisional requires a reason, in quotes');
      options.provisional = reason;
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!out) throw new Error('Provide --out <new directory>');
  if (options.openings > CALIBRATION_OPENINGS) throw new Error(`The dev book holds ${CALIBRATION_OPENINGS} openings`);
  // A short or capped run is allowed ONLY when it says so: `--provisional` stamps
  // the manifest ineligible, and `loadCalibration` then refuses it to any row that
  // has not asked for a provisional calibration by name.
  if (!options.provisional && options.maxTurns < MIN_CALIBRATION_MAX_TURNS) {
    throw new Error(`--max-turns must be at least ${MIN_CALIBRATION_MAX_TURNS}: A3 §3 measures full-length games. ` +
      'A deliberately short sample needs --provisional "<why this is not a row budget>".');
  }
  return { out, options };
}

export async function main(args: string[]) {
  const { out, options } = parseArgs(args);
  if (heavyBypassed()) throw new Error('Gate 1 calibration refuses MUJU_HEAVY_BYPASS');
  await withHeavySlot('gate1-calibrate', async () => {
    mkdirSync(out); // never overwrite an existing calibration
    const book = loadGate1Book(DEV_BOOK_PATH);
    const solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
    const machine = machineIdentity();
    const loadAtStart = loadavg();
    const startedAt = new Date().toISOString();
    const sourceFiles = sourceFileHashes();
    const sampler = new LoadSampler();
    sampler.sample('calibration:start');
    if (loadAtStart[0] > MAX_CALIBRATION_LOAD1) {
      // Not fatal — the operator may be deliberately characterising a loaded
      // box — but it is said once, loudly, before twelve hours are spent.
      console.error(`gate1-calibrate: 1-minute load average is ${loadAtStart[0]} on ${machine.cpuCount} cores, above ` +
        `${MAX_CALIBRATION_LOAD1}. A3 §3 asks for an otherwise idle machine and a row will REFUSE this manifest ` +
        'without --accept-calibration=load.');
    }
    const engines: Record<string, ReturnType<typeof summarizeSamples> & { allowanceMs: number; pace: 'quick' }> = {};
    const loadDuring: Record<string, number[]> = {};
    for (const difficulty of DIFFICULTIES) {
      const t0 = Date.now();
      const samples = await sampleEngine(difficulty, solver, options, book, sampler);
      loadDuring[difficulty] = loadavg();
      engines[difficulty] = { allowanceMs: QUICK_ALLOWANCE_MS[difficulty], pace: 'quick', ...summarizeSamples(samples) };
      console.log(JSON.stringify({ difficulty, ownTurns: samples.length, games: engines[difficulty].games,
        elapsedS: Math.round((Date.now() - t0) / 1000),
        medianWorkPerTurn: engines[difficulty].overall.medianWorkPerTurn,
        medianSearchesPerTurn: engines[difficulty].overall.medianSearchesPerTurn,
        stageMedians: Object.fromEntries(GAME_STAGES.map(s => [s, (engines[difficulty].stages[s] as { medianWorkPerTurn?: number }).medianWorkPerTurn])),
        bucketMedians: Object.fromEntries(OWN_TURN_BUCKETS.map(b =>
          [b.id, (engines[difficulty].ownTurnBuckets[b.id] as { medianWorkPerTurn?: number }).medianWorkPerTurn])),
        weightingFlagged: engines[difficulty].weighting.flagged,
        load: loadDuring[difficulty] }));
    }
    const budgets = Object.fromEntries(DIFFICULTIES.map(d => [d, engines[d].overall.medianWorkPerTurn]));
    sampler.sample('calibration:end');
    const loadAtEnd = loadavg();
    const boundaries = sampler.summary();
    const manifest = {
      schema: CALIBRATION_SCHEMA, amendment: CALIBRATION_AMENDMENT,
      ...(options.provisional ? { provisional: {
        reason: options.provisional, eligible: false,
        note: 'This manifest is NOT a row budget. A row refuses it unless it is a pilot run with ' +
          '--provisional-calibration, and the concession is stamped into the pilot manifest, summary and README.',
      } } : {}),
      // Machine and load lead the file: they are what decides whether this
      // manifest describes the row's situation at all (A3 §3).
      machine,
      load: {
        load1AtStart: loadAtStart[0], load1AtEnd: loadAtEnd[0],
        start: loadAtStart, end: loadAtEnd, during: loadDuring,
        cpuCount: machine.cpuCount, idleThreshold: MAX_CALIBRATION_LOAD1,
        maxLoad5Threshold: MAX_CALIBRATION_LOAD5, ownThreadAllowance: CALIBRATION_OWN_THREAD_LOAD,
        /** Sampled at every game boundary; this is what a row actually checks. */
        boundaries,
        samples: sampler.samples,
        note: 'A3 §3 asks for an otherwise idle machine. In WALL mode a loaded box UNDER-counts work: the clock ' +
          'runs while the CPU is elsewhere. A row refuses a manifest whose 1-minute load at start or end exceeds ' +
          `${MAX_CALIBRATION_LOAD1}, or whose highest 5-minute load at any game boundary exceeds ` +
          `${MAX_CALIBRATION_LOAD5}, unless --accept-calibration=load is passed.`,
      },
      startedAt, finishedAt: new Date().toISOString(),
      sourceIdentity: { sha256: sourceIdentitySha256(sourceFiles), files: Object.keys(sourceFiles).length },
      book: { path: book.path, sha256: book.sha256, openingsUsed: book.openings.slice(0, options.openings).map(o => o.id) },
      options: { ...options, handicaps: [...options.handicaps] },
      git: git('rev-parse', 'HEAD'), gitStatus: git('status', '--porcelain'),
      queue: { directory: heavyDir(), slots: slotCount() },
      engines, budgets,
      budgetRule: "A3 §3's \"median search work consumed per own turn\": the OVERALL median over every own turn of " +
        'every sampled game, per engine — turn-weighted. Stage medians, absolute own-turn-bucket medians and the ' +
        'median of per-game medians are reported for context and are used by nothing; engines.<d>.weighting.flagged ' +
        `is true when the turn- and game-weighted medians differ by more than ${WEIGHTING_DISAGREEMENT * 100}%.`,
      workDefinition: 'SearchBudget#spend units (src/ai/runtime.ts); the same counter fixedWork caps.',
      mode: 'WALL, shipped whole-turn loop, scaleToBudget on, quick pace (hard 10,000 ms / medium 3,000 ms), ' +
        `full-length games (maxTurns ${options.maxTurns}) over all ${options.openings} dev openings at handicaps ` +
        `${JSON.stringify([...options.handicaps])}.`,
    };
    const path = `${out}/calibration.json`;
    writeFileSync(path, json(manifest));
    writeFileSync(`${out}/calibration.sha256`, `${sha(readFileSync(path))}  calibration.json\n`);
    console.log(json({ budgets, ratio: budgets.hard / budgets.medium, out: path,
      provisional: options.provisional ?? null,
      machine: machine.sha256.slice(0, 12), load1: { start: loadAtStart[0], end: loadAtEnd[0] },
      maxLoad5: boundaries.load5.max, loadSamples: boundaries.samples }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
}
