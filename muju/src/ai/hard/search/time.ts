/**
 * Work accounting and deterministic time (DESIGN §4.16 `time.ts`, §5.11.6, F18).
 *
 * The search never reads a clock. It spends WORK, an integer currency whose
 * unit is calibrated to ≈ 1 µs on the reference box (`hard:bench --calibrate`
 * measures the real ratio on the box it runs on and records it in the M14
 * artifact), and it stops when the budget is gone. The budget itself is one of
 * eight quantised rungs, so jitter in the only three clock reads in the whole
 * engine — `chooseWork`'s input, `updateProfile`'s measurement and the abort
 * watchdog — cannot move the rung and therefore cannot change the move.
 *
 * This is the ONLY module under `src/ai/hard/` besides `engine.ts` that
 * `lab/hard-ai/deps.ts` lets read a clock, and `now()` below is the single
 * place it happens.
 */
import { DEAD, MAX_SLOTS, type PackedState } from '../types';
import type { NodeTables } from '../tables/context';
import { KILL_IMPOSSIBLE } from '../tables/kill';
import { HOME_NEVER } from '../tables/home';
import { ACTIONS_PER_TURN } from '../core/state';

export type { DeviceProfile, TimeConfig } from '../config';
import type { DeviceProfile, TimeConfig } from '../config';

/** DESIGN §4.16. Every meter bucket; `WORK_COST` is indexed by these. */
export const WorkClass = {
  MACRO: 0,
  QUIESCE: 1,
  TURN: 2,
  GEN: 3,
  KILLTABLE: 4,
  DFPN: 5,
  EVAL1: 6,
  EVAL2: 7,
  PROVER: 8,
} as const;
export type WorkClass = (typeof WorkClass)[keyof typeof WorkClass];

export const WORK_CLASS_COUNT = 9;

/** DESIGN §8's table: units ≈ µs on the reference box. `MACRO 4, QUIESCE 4,
 * TURN 1, GEN 4 per place plan, KILLTABLE 8, DFPN 2, EVAL1 2, EVAL2 12,
 * PROVER 40 per full-prover call`. */
export const WORK_COST: readonly number[] = [4, 4, 1, 4, 8, 2, 2, 12, 40];

/** `25e3 × 2^k, k = 0..7` (DESIGN §5.11.6). */
export const WORK_LADDER: readonly number[] = [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6];

/**
 * DESIGN §4.16. A pure counter: `spend` adds `WORK_COST[cls] × n` to `used`
 * and `n` to `byClass[cls]`. Nothing here reads a clock, so two runs that
 * spend the same work stop at the same node.
 */
export class WorkMeter {
  readonly byClass = new Int32Array(WORK_CLASS_COUNT);
  private usedUnits = 0;
  private limitUnits: number;

  constructor(limit: number) {
    if (!Number.isFinite(limit) || limit < 0) throw new RangeError(`WorkMeter: bad limit ${limit}`);
    this.limitUnits = Math.floor(limit);
  }

  spend(cls: number, n = 1): void {
    this.byClass[cls] += n;
    this.usedUnits += WORK_COST[cls] * n;
  }

  exhausted(): boolean {
    return this.usedUnits >= this.limitUnits;
  }

  get used(): number {
    return this.usedUnits;
  }

  get limit(): number {
    return this.limitUnits;
  }

  /** Units this class has spent (count × its cost) — the numerator of the
   * R5 quiescence cap (DESIGN §5.11.4: `byClass[QUIESCE] ≤ 0.35 × limit`). */
  unitsIn(cls: number): number {
    return this.byClass[cls] * WORK_COST[cls];
  }

  /** Re-arms the meter for a fresh search. Additive to DESIGN §4.16 so one
   * `HardEngine` can serve many turns without reallocating. */
  reset(limit: number = this.limitUnits): void {
    if (!Number.isFinite(limit) || limit < 0) throw new RangeError(`WorkMeter: bad limit ${limit}`);
    this.limitUnits = Math.floor(limit);
    this.usedUnits = 0;
    this.byClass.fill(0);
  }
}

/** The clock. The only `Date.now` under `src/ai/hard/search/`. */
export function now(): number {
  return Date.now();
}

/**
 * DESIGN §4.16: the largest rung `≤ profile.unitsPerMs × targetMs`, floored at
 * `WORK_LADDER[0]`. Quantisation is the whole point — a 5 % swing in the
 * measured throughput leaves the rung, and so the move, untouched.
 */
export function chooseWork(profile: DeviceProfile, targetMs: number): number {
  const budget = profile.unitsPerMs * targetMs;
  let chosen = WORK_LADDER[0];
  for (let i = 0; i < WORK_LADDER.length; i++) {
    if (WORK_LADDER[i] <= budget) chosen = WORK_LADDER[i];
  }
  return chosen;
}

/**
 * EWMA with α = 1/4 over the measured `work / elapsedMs` (DESIGN §4.16).
 * Call ONLY after a search that ran to completion: a search truncated by the
 * abort watchdog or by a cancel spent less work than the clock says it did,
 * and folding that in would ratchet the profile down forever.
 *
 * Returns a NEW profile; the caller decides whether to adopt it.
 */
export function updateProfile(profile: DeviceProfile, work: number, elapsedMs: number): DeviceProfile {
  if (elapsedMs <= 0 || work <= 0) return profile;
  const sample = work / elapsedMs;
  const blended = profile.samples === 0 ? sample : profile.unitsPerMs + (sample - profile.unitsPerMs) / 4;
  const unitsPerMs = Math.max(1, Math.round(blended));
  return { unitsPerMs, samples: profile.samples + 1 };
}

/** Highest `valueCc` among the targets `side` can actually remove this turn. */
function killNowWorth(p: PackedState, t: NodeTables, side: number): number {
  const table = t.killNow[side];
  let best = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const e = table.entry[slot];
    if (e.minActions === KILL_IMPOSSIBLE || e.minActions > ACTIONS_PER_TURN) continue;
    if (e.valueCc > best) best = e.valueCc;
  }
  return best;
}

/** `actionsToCorner` of the cheapest threat against either corner. */
function homeThreatActions(t: NodeTables): number {
  const a = t.home[0].actionsToCorner;
  const b = t.home[1].actionsToCorner;
  const best = a < b ? a : b;
  return best >= HOME_NEVER ? HOME_NEVER : best;
}

/**
 * DESIGN §5.11.6: `targetMs = clamp(baseMs × m / 100, minMs, maxMs)` with
 * `m = 100 · 1.5[home threat ≤ 4 actions either side] · 1.3[killNow worth ≥
 * 800 cc either side] · 0.5[one candidate] · 0.4[book hit]`, in integer
 * arithmetic (the multipliers are applied as `×3/2`, `×13/10`, `×1/2`,
 * `×2/5`, each truncating, so the result is machine-independent).
 *
 * `t` must be a level-2 `NodeTables` for `p`: both the home and the `killNow`
 * terms are level-2 quantities.
 */
export function targetMs(
  p: PackedState,
  t: NodeTables,
  cfg: TimeConfig,
  bookHit: boolean,
  candidates: number,
): number {
  let m = 100;
  if (homeThreatActions(t) <= ACTIONS_PER_TURN) m = ((m * 3) / 2) | 0;
  if (killNowWorth(p, t, 0) >= 800 || killNowWorth(p, t, 1) >= 800) m = ((m * 13) / 10) | 0;
  if (candidates <= 1) m = (m / 2) | 0;
  if (bookHit) m = ((m * 2) / 5) | 0;
  const raw = ((cfg.baseMs * m) / 100) | 0;
  if (raw < cfg.minMs) return cfg.minMs;
  if (raw > cfg.maxMs) return cfg.maxMs;
  return raw;
}
