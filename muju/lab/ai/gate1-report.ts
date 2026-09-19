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
 * A1's acceptance conditions are otherwise unchanged and are implemented here
 * exactly as they were: Expand, Balanced and `aiv2-medium` gated on score > 0.5
 * with an Elo interval excluding 0 in each h0/h3 cell, Rush reported but not
 * gated, frozen purchase/inactivity bands, at least one purchase in any game
 * past ten completed turns, adjudications ≤ 1%.
 */
import { eloEstimate } from '../hard-ai/ladder/elo';
import { deriveSeed } from '../harness/rng';
import type { GameRecord } from '../harness/types';
import type { PlayerId } from '../../src/game/types';

export const OPPONENTS = ['Rush', 'Expand', 'Balanced', 'aiv2-medium'] as const;
export type Opponent = typeof OPPONENTS[number];
export type Mode = 'pilot' | 'full';
/** PER opponent AND handicap: one per dev opening, 768 full-row games (A3 §1). */
export const FULL_PAIRS = 48;
export const PILOT_PAIRS = 1;
export const PAIRS: Record<Mode, number> = { pilot: PILOT_PAIRS, full: FULL_PAIRS };
/** A3 §5: new row seed 20260960; the plumbing pilot is 20260961 and is ineligible. */
export const SEEDS = { full: 20260960, pilot: 20260961 } as const;
export const AMENDMENT = 'A3' as const;
/** A3 §2: below this fraction of distinct games, a cell is INVALID (not measured). */
export const MIN_DISTINCT_FRACTION = 0.9;

export interface Task {
  id: string; pairId: string; opponent: Opponent; handicap: 0 | 3;
  pair: number; openingIndex: number; openingId: string; seed: number; hardSeat: PlayerId;
}

/**
 * The full schedule. `openingIds` is the dev book in file order; pair k of every
 * cell starts from opening k, so the two games of a pair share an opening and a
 * seed and differ only in which seat `aiv2-hard` holds.
 */
export function schedule(mode: Mode, openingIds: readonly string[]): Task[] {
  const pairs = PAIRS[mode];
  if (openingIds.length < pairs) {
    throw new Error(`Gate 1 ${mode} needs ${pairs} distinct openings, got ${openingIds.length}`);
  }
  if (new Set(openingIds.slice(0, pairs)).size !== pairs) throw new Error('Gate 1 openings must be distinct');
  const tasks: Task[] = [];
  for (const [o, opponent] of OPPONENTS.entries()) for (const [h, handicap] of ([0, 3] as const).entries()) {
    for (let pair = 0; pair < pairs; pair++) {
      const pairId = `${opponent}-h${handicap}-p${pair}`;
      // Stream index keeps pilot and row seeds disjoint and cells decorrelated.
      const seed = deriveSeed(SEEDS[mode], (o * 2 + h) * FULL_PAIRS + pair);
      for (const hardSeat of ['white', 'black'] as const) tasks.push({
        id: `${pairId}-${hardSeat}`, pairId, opponent, handicap, pair,
        openingIndex: pair, openingId: openingIds[pair], seed, hardSeat,
      });
    }
  }
  return tasks;
}

export interface Entry {
  task: Task;
  identityHash: string;
  record: GameRecord;
  /** Id-independent hash of the game's action sequence (`gate1-trace.ts`). */
  gameSha256: string;
}
export interface Bands { rulesVersion: string; purchaseRatePerSeat: number[]; inactivityDrawRate: number[] }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const inBand = (v: number, band: number[]) => v >= band[0] && v <= band[1];
const score = (e: Entry) => e.record.winner === null ? 0.5 : Number(e.record.winner === e.task.hardSeat);

/** Exact schedule/identity validation precedes statistics. Missing cells cannot pass. */
export function summarize(entries: Entry[], mode: Mode, identityHash: string, bands: Bands,
  openingIds: readonly string[]) {
  const planned = schedule(mode, openingIds);
  const byId = new Map(planned.map(t => [t.id, t]));
  const seen = new Set<string>(), errors: string[] = [];
  if (bands.rulesVersion !== 'muju-phasing-1') errors.push('Wrong rules identity in frozen bands');
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
    if (r.rulesVersion !== 'muju-phasing-1' || r.seed !== e.task.seed || r.handicap !== e.task.handicap ||
      r.players[e.task.hardSeat].bot !== 'aiv2-hard' || r.players[other].bot !== e.task.opponent ||
      r.options.legality !== 'strict' || !r.options.checkInvariants) errors.push(`Game metadata mismatch ${e.task.id}`);
    if (r.players.white.illegalActions + r.players.black.illegalActions || r.invariantViolation || r.anomalies.length ||
      r.winType === 'invariant-violation') errors.push(`Correctness veto ${e.task.id}`);
  }
  for (const t of planned) if (!seen.has(t.id)) errors.push(`Missing game ${t.id}`);
  const rows = OPPONENTS.flatMap(opponent => ([0, 3] as const).map(handicap => {
    const group = entries.filter(e => e.task.opponent === opponent && e.task.handicap === handicap);
    const pairs = new Map<string, Entry[]>();
    for (const e of group) pairs.set(e.task.pairId, [...(pairs.get(e.task.pairId) ?? []), e]);
    const complete = [...pairs.values()].filter(p => p.length === 2 && p[0].task.hardSeat !== p[1].task.hardSeat);
    // A3 §2: effective sample size. Two games that replay into each other share
    // a hash; a pair whose two hashes match another pair's is the same evidence
    // twice and is counted once, whatever seed produced it.
    const distinctGames = new Set(group.map(e => e.gameSha256)).size;
    const pairKey = (p: Entry[]) => [...p].sort((a, b) => a.task.hardSeat.localeCompare(b.task.hardSeat))
      .map(e => e.gameSha256).join('|');
    const distinct = new Map<string, Entry[]>();
    for (const p of complete) if (!distinct.has(pairKey(p))) distinct.set(pairKey(p), p);
    const distinctPairs = [...distinct.values()];
    const cellValid = group.length > 0 && distinctGames >= MIN_DISTINCT_FRACTION * group.length;
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
      distinctGames, distinctPairs: distinctPairs.length,
      distinctGameFraction: group.length ? distinctGames / group.length : 0,
      cellValid, openings: new Set(group.map(e => e.task.openingId)).size,
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
  }));
  const invalidCells = rows.filter(r => !r.cellValid).map(r => `${r.opponent}-h${r.handicap}`);
  const invalidGatingCells = rows.filter(r => r.strengthGated && !r.cellValid).map(r => `${r.opponent}-h${r.handicap}`);
  // A genuine failure: a behaviour condition, or a strength condition in a cell
  // that WAS measured. An invalid cell is neither a pass nor a failure.
  const failed = rows.some(r => (r.strengthGated && r.strengthMet === false) ||
    r.behavioralBandsMet === false || !r.mustBuyMet || !r.adjudicationMet);
  const criteriaMet = rows.every(r => (!r.strengthGated || r.strengthMet === true) &&
    r.behavioralBandsMet !== false && r.mustBuyMet && r.adjudicationMet);
  return { rulesVersion: 'muju-phasing-1', amendment: AMENDMENT, mode, identityHash, games: entries.length,
    expectedGames: planned.length, errors,
    criteriaMet, invalidCells, invalidGatingCells,
    // 'invalid' = the evidence itself is unusable; 'not-measured' = the evidence
    // is sound but a gating cell carries no information (A3 §2). Neither passes.
    gate1: errors.length ? 'invalid' : mode === 'pilot' ? 'pilot-ineligible'
      : failed ? 'failed' : invalidGatingCells.length ? 'not-measured' : criteriaMet ? 'passed' : 'failed',
    rows };
}
