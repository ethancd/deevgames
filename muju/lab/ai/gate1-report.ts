import { eloEstimate } from '../hard-ai/ladder/elo';
import { deriveSeed } from '../harness/rng';
import type { GameRecord } from '../harness/types';
import type { PlayerId } from '../../src/game/types';

export const OPPONENTS = ['Rush', 'Expand', 'Balanced', 'aiv2-medium'] as const;
export type Opponent = typeof OPPONENTS[number];
export type Mode = 'pilot' | 'full';
export const FULL_PAIRS = 64; // PER opponent AND handicap: 1,024 full-row games.
export const SEEDS = { pilot: 20260956, full: 20260957 } as const;
export const AMENDMENT = 'A1' as const;
export interface Task {
  id: string; pairId: string; opponent: Opponent; handicap: 0 | 3;
  pair: number; seed: number; hardSeat: PlayerId;
}
export function schedule(mode: Mode): Task[] {
  const tasks: Task[] = [];
  for (const [o, opponent] of OPPONENTS.entries()) for (const [h, handicap] of ([0, 3] as const).entries()) {
    for (let pair = 0; pair < (mode === 'pilot' ? 1 : FULL_PAIRS); pair++) {
      const pairId = `${opponent}-h${handicap}-p${pair}`;
      const seed = deriveSeed(SEEDS[mode], (o * 2 + h) * FULL_PAIRS + pair);
      for (const hardSeat of ['white', 'black'] as const) tasks.push({
        id: `${pairId}-${hardSeat}`, pairId, opponent, handicap, pair, seed, hardSeat,
      });
    }
  }
  return tasks;
}
export interface Entry { task: Task; identityHash: string; record: GameRecord }
export interface Bands { rulesVersion: string; purchaseRatePerSeat: number[]; inactivityDrawRate: number[] }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const inBand = (v: number, band: number[]) => v >= band[0] && v <= band[1];
const score = (e: Entry) => e.record.winner === null ? 0.5 : Number(e.record.winner === e.task.hardSeat);

/** Exact schedule/identity validation precedes statistics. Missing cells cannot pass. */
export function summarize(entries: Entry[], mode: Mode, identityHash: string, bands: Bands) {
  const planned = schedule(mode);
  const byId = new Map(planned.map(t => [t.id, t]));
  const seen = new Set<string>(), errors: string[] = [];
  if (bands.rulesVersion !== 'muju-phasing-1') errors.push('Wrong rules identity in frozen bands');
  for (const e of entries) {
    if (seen.has(e.task.id)) errors.push(`Duplicate game ${e.task.id}`);
    seen.add(e.task.id);
    if (JSON.stringify(byId.get(e.task.id)) !== JSON.stringify(e.task)) errors.push(`Schedule mismatch ${e.task.id}`);
    if (e.identityHash !== identityHash) errors.push(`Mixed identity ${e.task.id}`);
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
    const elo = eloEstimate(complete.map(p => score(p[0]) + score(p[1])));
    const purchases = mean(group.map(e => e.record.players[e.task.hardSeat].unitsPlaced));
    const inactivity = mean(group.map(e => Number(e.record.inactivityDraw)));
    const adjudications = mean(group.map(e => Number(Boolean(e.record.adjudicated || e.record.capReason))));
    const mustBuyFailures = group.filter(e => (e.record.completedTurns ?? 0) > 10 &&
      e.record.players[e.task.hardSeat].unitsPlaced === 0).map(e => e.task.id);
    const behavior = opponent === 'aiv2-medium' ? null
      : inBand(purchases, bands.purchaseRatePerSeat) && inBand(inactivity, bands.inactivityDrawRate);
    return { opponent, handicap, games: group.length, pairs: complete.length,
      wins: group.filter(e => score(e) === 1).length, draws: group.filter(e => score(e) === 0.5).length,
      losses: group.filter(e => score(e) === 0).length, elo,
      winsBySeat: Object.fromEntries((['white', 'black'] as const).map(seat => [seat,
        group.filter(e => e.task.hardSeat === seat && score(e) === 1).length])),
      meanCompletedTurns: mean(group.map(e => e.record.completedTurns ?? NaN)),
      purchasesPerHardSeat: purchases, inactivityDrawRate: inactivity, adjudicationRate: adjudications,
      behavioralBandsMet: behavior, mustBuyMet: mustBuyFailures.length === 0, mustBuyFailures,
      strengthGated: opponent !== 'Rush',
      strengthMet: elo.muRaw > 0.5 && elo.eloLo > 0, adjudicationMet: adjudications <= 0.01,
    };
  }));
  const criteriaMet = rows.every(r => (!r.strengthGated || r.strengthMet) &&
    r.behavioralBandsMet !== false && r.mustBuyMet && r.adjudicationMet);
  return { rulesVersion: 'muju-phasing-1', amendment: AMENDMENT, mode, identityHash, games: entries.length,
    expectedGames: planned.length, errors,
    criteriaMet,
    gate1: errors.length ? 'invalid' : mode === 'pilot' ? 'pilot-ineligible' : criteriaMet ? 'passed' : 'failed',
    rows };
}
