/**
 * Gate 1 allocation and reporting under preregistration amendment A3.
 *
 * What A3 changed, and why (see `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`):
 *
 *  1. Every seat-mirrored pair starts from a DISTINCT opening, taken in file
 *     order from the frozen dev book, 48 pairs per cell. A2 played all 1,024 of
 *     its games from the canonical initial position, and because the per-task
 *     seed never reaches a V2 engine decision, its two `aiv2-medium` cells each
 *     held one pair replicated 64 times: effective n = 1.
 *  2. The report HASHES every game and refuses to read strength out of
 *     replication. A cell with fewer than 90% distinct games is INVALID — it can
 *     neither pass nor fail a strength condition — and every interval is
 *     computed over DISTINCT pairs only, so a replicated pair cannot narrow one.
 *  3. Budgets come from a calibration manifest, not from a constant.
 *
 * WHAT MAKES (2) BITE. A game is keyed by its SEMANTIC start position plus its
 * actions (`gate1-trace.ts`), never by the opening's id. Under an id-keyed
 * digest the rule was vacuous in a full row — one opening per pair means no two
 * pairs can share a key — and it also missed the dev book's one real
 * transposition, `p1-g5-s245` = `p1-g3-s3`, which at a fixed work budget makes
 * the two `aiv2-medium` cells play one game twice. So every cell here reports
 * three numbers, not one: how many games it holds, how many DISTINCT START
 * POSITIONS those games began from, and how many distinct games and distinct
 * pairs resulted. The book's own 47-of-48 is stated in `bookStartPositions` so a
 * reader meets it in the report rather than in a footnote.
 *
 * A1's acceptance conditions are otherwise unchanged and are implemented here
 * exactly as they were: Expand, Balanced and `aiv2-medium` gated on score > 0.5
 * with an Elo interval excluding 0 in each h0/h3 cell, Rush reported but not
 * gated, frozen purchase/inactivity bands, at least one purchase in any game
 * past ten completed turns, adjudications ≤ 1%.
 */
import { eloEstimate } from '../hard-ai/ladder/elo';
import { deriveSeed } from '../harness/rng';
import { RULES_VERSION } from './gate1-sources';
import type { GameRecord } from '../harness/types';
import type { PlayerId } from '../../src/game/types';

export { RULES_VERSION };

export const OPPONENTS = ['Rush', 'Expand', 'Balanced', 'aiv2-medium'] as const;
export type Opponent = typeof OPPONENTS[number];
export type Mode = 'pilot' | 'full';
/** PER opponent AND handicap: one per dev opening, 768 full-row games (A3 §1). */
export const FULL_PAIRS = 48;
export const PILOT_PAIRS = 1;
export const PAIRS: Record<Mode, number> = { pilot: PILOT_PAIRS, full: FULL_PAIRS };
/**
 * A3 §5: row seed 20260960, unchanged and never yet used for an eligible game.
 *
 * THE PILOT SEED IS NOT A3's 20260961, AND THAT IS DELIBERATE. 20260961 was
 * consumed by the plumbing pilot run under `muju-phasing-1`
 * (`lab/ai/results/gate1-a3-pilot-2026-09-19`, `…-19b`), and A4 voided every Gate 1
 * game measured before it. Re-running the pilot under the same seed would put two
 * different populations — one void, one current — behind one number, and no later
 * audit could tell a 20260961 game of the one from a 20260961 game of the other.
 * So the pilot advances to the next unused integer, exactly the way A2 chose
 * 20260958 after voiding 20260957, and the seed it replaces is recorded below
 * rather than quietly dropped. See `gate1-references.json#a3.seeds`.
 */
export const SEEDS = { full: 20260960, pilot: 20260962 } as const;
/** Pilot seeds that name a void population and may never be reused. */
export const VOID_PILOT_SEEDS: readonly number[] = [20260961];
export const PILOT_SEED_CHANGE_REASON =
  'A3 §5 named pilot seed 20260961; it was consumed by the pilot under muju-phasing-1 and A4 voided every Gate 1 ' +
  'game measured before it, so 20260961 now names a void population. This pilot uses 20260962, the next unused ' +
  'integer, so the two populations can never be confused. Row seed 20260960 is unchanged.';
export const AMENDMENT = 'A3' as const;
/** A3 §2: below this fraction of distinct games, a cell is INVALID (not measured). */
export const MIN_DISTINCT_FRACTION = 0.9;

/**
 * The reading of A3 §2 this report implements, printed in its header.
 *
 * A3 §2 says "the report hashes every game's action sequence. A cell whose number
 * of distinct games is below 90% of its game count is INVALID." It does not say
 * what makes two games the same game, and the two available readings differ by a
 * factor of two in every cell of a seat-mirrored design:
 *
 *  - key on the ACTION HASH alone, and a pair whose two seat-mirrored games happen
 *    to produce the same sequence counts as one game, so a cell of 96 games in
 *    which every pair mirrors cleanly holds 48 distinct games — 50%, INVALID, and
 *    every cell of every row would be invalid by construction;
 *  - key on `(hardSeat, action hash)`, and those two games count as two, because
 *    they ARE two experiments: the same moves played from the White seat and from
 *    the Black seat against an opponent with the opposite handicap and the opposite
 *    tempo are two observations of the engine, not one observation recorded twice.
 *
 * The second is the reading A3 §1's design implies — the whole point of mirroring a
 * pair is that the two seats are different evidence — and it is the one taken here.
 * What A3 §2 is protecting against is A2's failure mode, where ONE PAIR was
 * replicated across 48 pairs of a cell; that is a statement about pairs, and it is
 * caught by the PAIR-level count, which keys on the pair's two hashes together and
 * is unchanged. Both numbers are reported in every cell so the choice is visible
 * and either can be re-derived.
 */
export const DISTINCTNESS_READING =
  'A3 §2 distinctness is keyed on (hardSeat, gameSha256): two seat-mirrored games with identical action sequences ' +
  'are two experiments, not one, so a cleanly mirrored cell is not invalid by construction. Pair-level ' +
  'distinctness — the sampling unit every Elo interval is computed over — is unchanged and keys on the pair\'s two ' +
  'game hashes together, so a replicated PAIR (A2\'s failure mode) still counts once. Both counts are reported per ' +
  'cell: distinctGames (seat-keyed, gates cellValid) and distinctGameSequences (hash only, report-only).';

export interface Task {
  id: string; pairId: string; opponent: Opponent; handicap: 0 | 3;
  pair: number; openingIndex: number; openingId: string;
  /** Semantic hash of the position this game starts from (`gate1-trace.ts`). */
  startSha256: string; seed: number; hardSeat: PlayerId;
}

/** One book row as the schedule consumes it: an id and its start hash per handicap. */
export interface ScheduleOpening {
  id: string;
  /** Keyed by handicap. `Record<number, string>` because JSON keys are strings. */
  starts: Readonly<Record<number, string>>;
}

/** The eight cells in their fixed order: opponent major, handicap minor. */
export const HANDICAPS = [0, 3] as const;
export const CELLS = OPPONENTS.flatMap(opponent => HANDICAPS.map(handicap => ({ opponent, handicap })));
/** A cell's index in `CELLS`, independent of mode, shard layout and run order. */
export function cellIndex(opponent: Opponent, handicap: 0 | 3): number {
  const index = CELLS.findIndex(c => c.opponent === opponent && c.handicap === handicap);
  if (index < 0) throw new Error(`No Gate 1 cell ${opponent}-h${handicap}`);
  return index;
}

/**
 * A game's seed, as a PURE function of the row seed, the cell and the pair index
 * — and, deliberately, CONSTANT in the seat.
 *
 * Nothing about it depends on which shard ran the game, or in what order, which
 * is what makes `gate1 --shard i/n` safe (`gate1-shard.ts`). The two seats of a
 * pair share this seed because they are a SEAT MIRROR of one position and one
 * stream allocation; the harness then splits it per seat itself,
 * `mulberry32(deriveSeed(seed, seat))` and `engine.setSeed(deriveSeed(seed, seat))`
 * (`lab/harness/runner.ts`), so white and black never draw the same numbers. Use
 * `seatSeedFor` for the value a seat actually receives.
 */
export function seedFor(mode: Mode, opponent: Opponent, handicap: 0 | 3, pair: number): number {
  if (!Number.isSafeInteger(pair) || pair < 0 || pair >= FULL_PAIRS) throw new Error(`Bad pair index ${pair}`);
  // Stream index keeps pilot and row seeds disjoint and cells decorrelated.
  return deriveSeed(SEEDS[mode], cellIndex(opponent, handicap) * FULL_PAIRS + pair);
}
/** The seed one SEAT of that game receives, exactly as `runner.ts` derives it. */
export function seatSeedFor(mode: Mode, opponent: Opponent, handicap: 0 | 3, pair: number, seat: PlayerId): number {
  return deriveSeed(seedFor(mode, opponent, handicap, pair), seat === 'white' ? 0 : 1);
}

/**
 * The full schedule. `openings` is the dev book in file order; pair k of every
 * cell starts from opening k, so the two games of a pair share an opening, a
 * start position and a seed, and differ only in which seat `aiv2-hard` holds.
 *
 * Distinct IDS are required here, not distinct POSITIONS: the book is frozen and
 * no opening may be dropped, so the row plays all 48 pairs and the REPORT counts
 * a colliding pair once (`summarize`).
 */
export function schedule(mode: Mode, openings: readonly ScheduleOpening[]): Task[] {
  const pairs = PAIRS[mode];
  if (openings.length < pairs) {
    throw new Error(`Gate 1 ${mode} needs ${pairs} distinct openings, got ${openings.length}`);
  }
  if (new Set(openings.slice(0, pairs).map(o => o.id)).size !== pairs) {
    throw new Error('Gate 1 openings must be distinct');
  }
  const tasks: Task[] = [];
  for (const { opponent, handicap } of CELLS) {
    for (let pair = 0; pair < pairs; pair++) {
      const pairId = `${opponent}-h${handicap}-p${pair}`;
      const seed = seedFor(mode, opponent, handicap, pair);
      const startSha256 = openings[pair].starts[handicap];
      if (typeof startSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(startSha256)) {
        throw new Error(`Opening ${openings[pair].id} has no start-position hash at handicap ${handicap}`);
      }
      for (const hardSeat of ['white', 'black'] as const) tasks.push({
        id: `${pairId}-${hardSeat}`, pairId, opponent, handicap, pair,
        openingIndex: pair, openingId: openings[pair].id, startSha256, seed, hardSeat,
      });
    }
  }
  return tasks;
}

/** One hand-off inside a game, for the LATER-CONVERGENCE report (report-only). */
export interface BoundarySample {
  /** Ply index of the hand-off, 1-based, as the harness counts plies. */
  ply: number;
  /** `boundaryPositionDigest` — the start-position digest minus unit/pending order. */
  digest: string;
}

export interface Entry {
  task: Task;
  identityHash: string;
  record: GameRecord;
  /** Id-independent hash of the game's action sequence (`gate1-trace.ts`). */
  gameSha256: string;
  /** Positions this game handed off at. Absent in historical evidence. */
  boundaries?: readonly BoundarySample[];
}
export interface Bands { rulesVersion: string; purchaseRatePerSeat: number[]; inactivityDrawRate: number[] }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const inBand = (v: number, band: number[]) => v >= band[0] && v <= band[1];
const score = (e: Entry) => e.record.winner === null ? 0.5 : Number(e.record.winner === e.task.hardSeat);

/**
 * Provenance a reader must see in the report header, not in a log: whether the
 * row ran against a calibration it would otherwise have refused.
 */
export interface CalibrationMeta {
  path?: string;
  sha256?: string;
  /** True when ANY shard of this row overrode a calibration refusal. */
  accepted?: boolean;
  /** Every refusal any shard overrode, deduplicated. */
  acceptedReasons?: readonly string[];
  /** The kinds (`load`, `machine`, `age`, `sources`) overridden, deduplicated. */
  acceptedKinds?: readonly string[];
  /**
   * WHICH SHARD ACCEPTED WHAT. A row is run as up to eight processes, each of which
   * loads the calibration itself and may be given a different `--accept-calibration`
   * list. Reading the FIRST shard's manifest and calling it the row's provenance —
   * which is what this used to do — hides every concession the other seven made:
   * shard 1 could run clean while shard 7 waved through a calibration measured on
   * another machine, and the report would say the row was clean. This is the union,
   * attributed.
   */
  acceptedByShard?: readonly { shard: string; kinds: readonly string[]; reasons: readonly string[] }[];
  /** The per-turn work budgets the row was configured with (A3 §3). */
  budgets?: Readonly<Record<string, number>>;
  /** Median searches per own turn the CALIBRATION measured, per engine. */
  searchesPerTurnInCalibration?: Readonly<Record<string, number>>;
  /** True for an explicitly provisional/ineligible calibration (pilots only). */
  provisional?: boolean;
  provisionalReason?: string;
  /** When the row's freshness window was measured from (see `gate1.ts`). */
  freshnessMeasuredFrom?: string;
}

export interface AdapterMeta {
  /** Median searches per own turn the ROW's adapter actually made, per engine. */
  searchesPerTurnInRow?: Readonly<Record<string, number>>;
  /** Plans abandoned because their suffix stopped replaying legally, per engine. */
  invalidSuffixes?: Readonly<Record<string, number>>;
  /** How the adapter reserves allowance for Prepare, stated rather than implied. */
  allocation?: string;
}

export interface ReportMeta {
  calibration?: CalibrationMeta;
  /** Shard layout this summary was merged from, when it was merged. */
  shards?: number;
  adapter?: AdapterMeta;
}

/**
 * Games of one cell that walked into a position another game of the SAME SEAT
 * ASSIGNMENT had already been in, and the earliest ply at which it happened.
 *
 * Report-only, and it gates nothing. Two games that start from different openings
 * and converge on move eleven supply far less independent evidence than their two
 * distinct start positions suggest, and A3 §1's whole argument for 48 openings is
 * about independence. Nothing in A3 sets a threshold for this, so nothing here
 * invents one: the row measures it, states it, and leaves the reading to whoever
 * reads the row.
 */
export interface Convergence {
  hardSeat: PlayerId;
  digest: string;
  /** The earliest ply at which any of these games reached the shared position. */
  earliestPly: number;
  /** Game ids sharing it, with the ply each one arrived at it. */
  games: readonly { id: string; ply: number }[];
}

/** How many convergences a cell lists before it only counts them. */
export const MAX_REPORTED_CONVERGENCES = 20;

/**
 * Per cell: which games share a hand-off position with another game of the same
 * seat assignment, and where. Seat assignment is part of the key for the same
 * reason it is part of the distinctness key — a White-seat game and a Black-seat
 * game reaching one position are two engines meeting there, not a replication.
 */
export function cellConvergence(group: readonly Entry[]): {
  convergences: Convergence[]; convergedGames: number; totalConvergences: number; gamesWithBoundaries: number;
} {
  const bySeatAndDigest = new Map<string, { hardSeat: PlayerId; digest: string; games: { id: string; ply: number }[] }>();
  let gamesWithBoundaries = 0;
  for (const e of group) {
    if (!e.boundaries?.length) continue;
    gamesWithBoundaries++;
    // A game can pass through one position more than once; only its FIRST arrival
    // is evidence about when the two games met.
    const first = new Map<string, number>();
    for (const b of e.boundaries) if (!first.has(b.digest)) first.set(b.digest, b.ply);
    for (const [digest, ply] of first) {
      const key = `${e.task.hardSeat}|${digest}`;
      const bucket = bySeatAndDigest.get(key) ?? { hardSeat: e.task.hardSeat, digest, games: [] };
      bucket.games.push({ id: e.task.id, ply });
      bySeatAndDigest.set(key, bucket);
    }
  }
  const shared = [...bySeatAndDigest.values()].filter(b => b.games.length > 1).map(b => ({
    hardSeat: b.hardSeat, digest: b.digest,
    earliestPly: Math.min(...b.games.map(g => g.ply)),
    games: [...b.games].sort((x, y) => x.ply - y.ply || (x.id < y.id ? -1 : 1)),
  }));
  shared.sort((a, b) => a.earliestPly - b.earliestPly || (a.digest < b.digest ? -1 : 1));
  const convergedGames = new Set(shared.flatMap(s => s.games.map(g => g.id))).size;
  return { convergences: shared.slice(0, MAX_REPORTED_CONVERGENCES), convergedGames,
    totalConvergences: shared.length, gamesWithBoundaries };
}

/** Exact schedule/identity validation precedes statistics. Missing cells cannot pass. */
export function summarize(entries: Entry[], mode: Mode, identityHash: string, bands: Bands,
  openings: readonly ScheduleOpening[], meta: ReportMeta = {}) {
  const planned = schedule(mode, openings);
  const byId = new Map(planned.map(t => [t.id, t]));
  const seen = new Set<string>(), errors: string[] = [];
  if (bands.rulesVersion !== RULES_VERSION) {
    errors.push(`Wrong rules identity in frozen bands: ${JSON.stringify(bands.rulesVersion)}, not ` +
      `${JSON.stringify(RULES_VERSION)}. A4 changed the inactivity clock, so the bands frozen under the old one ` +
      'describe a draw rate this revision does not produce.');
  }
  for (const e of entries) {
    if (seen.has(e.task.id)) errors.push(`Duplicate game ${e.task.id}`);
    seen.add(e.task.id);
    if (JSON.stringify(byId.get(e.task.id)) !== JSON.stringify(e.task)) errors.push(`Schedule mismatch ${e.task.id}`);
    if (e.identityHash !== identityHash) errors.push(`Mixed identity ${e.task.id}`);
    if (typeof e.gameSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.gameSha256)) {
      errors.push(`Missing game hash ${e.task.id}`); // A3 §2 cannot be evaluated without it
    }
    const r = e.record;
    if (r.completedTurns === undefined || !Number.isSafeInteger(r.completedTurns) || r.completedTurns < 0 ||
      !Number.isSafeInteger(r.players[e.task.hardSeat].unitsPlaced) || r.players[e.task.hardSeat].unitsPlaced < 0) {
      errors.push(`Invalid purchase/turn evidence ${e.task.id}`);
    }
    const other = e.task.hardSeat === 'white' ? 'black' : 'white';
    if (r.rulesVersion !== RULES_VERSION || r.seed !== e.task.seed || r.handicap !== e.task.handicap ||
      r.players[e.task.hardSeat].bot !== 'aiv2-hard' || r.players[other].bot !== e.task.opponent ||
      r.options.legality !== 'strict' || !r.options.checkInvariants) errors.push(`Game metadata mismatch ${e.task.id}`);
    if (r.players.white.illegalActions + r.players.black.illegalActions || r.invariantViolation || r.anomalies.length ||
      r.winType === 'invariant-violation') errors.push(`Correctness veto ${e.task.id}`);
  }
  for (const t of planned) if (!seen.has(t.id)) errors.push(`Missing game ${t.id}`);
  const rows = CELLS.map(({ opponent, handicap }) => {
    const group = entries.filter(e => e.task.opponent === opponent && e.task.handicap === handicap);
    const plannedGroup = planned.filter(t => t.opponent === opponent && t.handicap === handicap);
    const pairs = new Map<string, Entry[]>();
    for (const e of group) pairs.set(e.task.pairId, [...(pairs.get(e.task.pairId) ?? []), e]);
    const complete = [...pairs.values()].filter(p => p.length === 2 && p[0].task.hardSeat !== p[1].task.hardSeat);
    // A3 §2: effective sample size. An EXPERIMENT is a seat assignment playing an
    // action sequence, so the key is (hardSeat, gameSha256) — see
    // DISTINCTNESS_READING for why, and for what the bare-hash count below is.
    const distinctGames = new Set(group.map(e => `${e.task.hardSeat}|${e.gameSha256}`)).size;
    /** The same count keyed on the action hash ALONE. Report-only: it is the
     * number a seat-blind reading of A3 §2 would have gated on, kept so a reader
     * can see both and see how far apart they are. */
    const distinctGameSequences = new Set(group.map(e => e.gameSha256)).size;
    const pairKey = (p: Entry[]) => [...p].sort((a, b) => a.task.hardSeat.localeCompare(b.task.hardSeat))
      .map(e => e.gameSha256).join('|');
    const distinct = new Map<string, Entry[]>();
    for (const p of complete) if (!distinct.has(pairKey(p))) distinct.set(pairKey(p), p);
    const distinctPairs = [...distinct.values()];
    const cellValid = group.length > 0 && distinctGames >= MIN_DISTINCT_FRACTION * group.length;
    const convergence = cellConvergence(group);
    // Intervals over DISTINCT pairs only: replication may not narrow one.
    const elo = eloEstimate(distinctPairs.map(p => score(p[0]) + score(p[1])));
    const purchases = mean(group.map(e => e.record.players[e.task.hardSeat].unitsPlaced));
    const inactivity = mean(group.map(e => Number(e.record.inactivityDraw)));
    const adjudications = mean(group.map(e => Number(Boolean(e.record.adjudicated || e.record.capReason))));
    const mustBuyFailures = group.filter(e => (e.record.completedTurns ?? 0) > 10 &&
      e.record.players[e.task.hardSeat].unitsPlaced === 0).map(e => e.task.id);
    const behavior = opponent === 'aiv2-medium' ? null
      : inBand(purchases, bands.purchaseRatePerSeat) && inBand(inactivity, bands.inactivityDrawRate);
    return { opponent, handicap, games: group.length, pairs: complete.length,
      distinctGames, distinctGameSequences, distinctPairs: distinctPairs.length,
      distinctGameFraction: group.length ? distinctGames / group.length : 0,
      distinctSequenceFraction: group.length ? distinctGameSequences / group.length : 0,
      cellValid, openings: new Set(group.map(e => e.task.openingId)).size,
      /** Report-only (A3 sets no threshold): games of this cell that reached a
       * hand-off position another game of the same seat had reached. */
      laterConvergence: convergence,
      /** A3 §1's independence, counted in POSITIONS rather than in book rows:
       * two ids that transpose into one position supply one starting point. */
      distinctStartPositions: new Set(group.map(e => e.task.startSha256)).size,
      plannedStartPositions: new Set(plannedGroup.map(t => t.startSha256)).size,
      /** The sampling unit every interval in this row is computed over. */
      effectiveN: distinctPairs.length,
      wins: group.filter(e => score(e) === 1).length, draws: group.filter(e => score(e) === 0.5).length,
      losses: group.filter(e => score(e) === 0).length, elo,
      winsBySeat: Object.fromEntries((['white', 'black'] as const).map(seat => [seat,
        group.filter(e => e.task.hardSeat === seat && score(e) === 1).length])),
      meanCompletedTurns: mean(group.map(e => e.record.completedTurns ?? NaN)),
      purchasesPerHardSeat: purchases, inactivityDrawRate: inactivity, adjudicationRate: adjudications,
      behavioralBandsMet: behavior, mustBuyMet: mustBuyFailures.length === 0, mustBuyFailures,
      strengthGated: opponent !== 'Rush',
      /** null = INVALID cell: not measured, so neither passed nor failed (A3 §2). */
      strengthMet: cellValid ? elo.muRaw > 0.5 && elo.eloLo > 0 : null,
      adjudicationMet: adjudications <= 0.01,
    };
  });
  const invalidCells = rows.filter(r => !r.cellValid).map(r => `${r.opponent}-h${r.handicap}`);
  const invalidGatingCells = rows.filter(r => r.strengthGated && !r.cellValid).map(r => `${r.opponent}-h${r.handicap}`);
  // A genuine failure: a behaviour condition, or a strength condition in a cell
  // that WAS measured. An invalid cell is neither a pass nor a failure.
  const failed = rows.some(r => (r.strengthGated && r.strengthMet === false) ||
    r.behavioralBandsMet === false || !r.mustBuyMet || !r.adjudicationMet);
  const criteriaMet = rows.every(r => (!r.strengthGated || r.strengthMet === true) &&
    r.behavioralBandsMet !== false && r.mustBuyMet && r.adjudicationMet);
  const calibration = meta.calibration ?? null;
  const adapter = meta.adapter ?? null;
  return { rulesVersion: RULES_VERSION, amendment: AMENDMENT, rulesAmendment: 'A4', mode, identityHash,
    seed: SEEDS[mode], games: entries.length,
    expectedGames: planned.length, errors,
    /** The reading of A3 §2 this row was scored under, in the header, once. */
    distinctnessReading: DISTINCTNESS_READING,
    ...(mode === 'pilot' ? { pilotSeedChange: PILOT_SEED_CHANGE_REASON, voidPilotSeeds: VOID_PILOT_SEEDS } : {}),
    /** Stated up front so the 47-of-48 is never a surprise further down. */
    bookStartPositions: bookStartPositions(mode, openings),
    calibration,
    /**
     * WHAT THE ROW WAS FUNDED WITH AND HOW IT SPENT IT, side by side, in the
     * header. The calibration measures the shipped whole-turn loop; the row plays a
     * fixed-work imitation of it (`gate1-bot.ts`). If the two disagree about how
     * many searches a turn holds, the total budget is beside the point — the row is
     * dividing it differently from the loop it was measured on — and that is only
     * visible if both numbers are printed together.
     */
    pacing: {
      perTurnWorkBudget: calibration?.budgets ?? null,
      searchesPerTurnInCalibration: calibration?.searchesPerTurnInCalibration ?? null,
      searchesPerTurnInRow: adapter?.searchesPerTurnInRow ?? null,
      invalidSuffixes: adapter?.invalidSuffixes ?? null,
      allocation: adapter?.allocation ?? null,
      note: 'The budget is work per OWN TURN (A3 §3), spent across Act, the upkeep decision and Prepare under one ' +
        'mover. searchesPerTurn is the median number of searches a turn held: in the calibration that is the shipped ' +
        'wall-clock loop, in the row the fixed-work adapter. They should be close; they are printed so a reader can ' +
        'check rather than assume.',
    },
    laterConvergence: {
      totalConvergences: rows.reduce((a, r) => a + r.laterConvergence.totalConvergences, 0),
      convergedGames: rows.reduce((a, r) => a + r.laterConvergence.convergedGames, 0),
      gamesWithBoundaries: rows.reduce((a, r) => a + r.laterConvergence.gamesWithBoundaries, 0),
      note: 'Report-only. Two games of one cell and one seat assignment that reach the same hand-off position from ' +
        'here on supply one line of play, however different their openings were. A3 sets no threshold for this and ' +
        'none is invented: the earliest ply of each convergence is listed per cell.',
    },
    shards: meta.shards ?? null,
    criteriaMet, invalidCells, invalidGatingCells,
    // 'invalid' = the evidence itself is unusable; 'not-measured' = the evidence
    // is sound but a gating cell carries no information (A3 §2). Neither passes.
    gate1: errors.length ? 'invalid' : mode === 'pilot' ? 'pilot-ineligible'
      : failed ? 'failed' : invalidGatingCells.length ? 'not-measured' : criteriaMet ? 'passed' : 'failed',
    rows };
}

/**
 * How much independence the book the row actually consumed supplies, per
 * handicap: rows used, distinct start positions, and the ids that transpose into
 * each other. A3 §1 says "48 pairs per cell (one per opening)"; this is where
 * the report says out loud that those 48 openings are 47 positions, so the
 * effective n of a cell is bounded by 47 distinct pairs, not 48, before a single
 * game is played.
 */
export function bookStartPositions(mode: Mode, openings: readonly ScheduleOpening[]) {
  const used = openings.slice(0, PAIRS[mode]);
  const perHandicap = HANDICAPS.map(handicap => {
    const byHash = new Map<string, string[]>();
    for (const opening of used) {
      const hash = opening.starts[handicap];
      byHash.set(hash, [...(byHash.get(hash) ?? []), opening.id]);
    }
    const collisions = [...byHash.entries()].filter(([, ids]) => ids.length > 1)
      .map(([sha256, openingIds]) => ({ sha256, openingIds }));
    return { handicap, openings: used.length, distinctStartPositions: byHash.size, collisions };
  });
  return {
    openings: used.length,
    perHandicap,
    note: perHandicap.every(h => h.distinctStartPositions === h.openings)
      ? 'Every opening used reaches its own start position.'
      : `The book supplies fewer start positions than rows: ${perHandicap
          .map(h => `h${h.handicap} ${h.distinctStartPositions}/${h.openings}`).join(', ')}. ` +
        `Transposing ids: ${perHandicap.flatMap(h => h.collisions.map(c => `h${h.handicap} {${c.openingIds.join(' = ')}}`))
          .join(', ')}. Those pairs are the same evidence and are counted once (A3 §2).`,
  };
}
