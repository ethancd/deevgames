/**
 * EMBER — internal rolling history for trend/forecast (src/body/history.ts).
 *
 * Per PLAN + types.ts: trend and predictedTicksToLimit are derived from a
 * short internal history kept INSIDE the body module, keyed by the
 * BodyState object identity via a WeakMap — NOT stored as fields on
 * BodyState (BodyState is the pinned, authoritative contract).
 */

import type { BodyState, BodyVar, WorldState } from '../core/types';

export interface HistoryEntry {
  tick: number;
  fuel: number;
  heat: number;
  damage: number;
  fatigue: number;
  activation: number;
}

const HISTORY_LEN = 40;
const SLOPE_WINDOW = 10;

const historyStore = new WeakMap<BodyState, HistoryEntry[]>();

/** Record the current tick's true values for `body`. Called once per
 *  stepBody(). Keeps only the most recent HISTORY_LEN entries. */
export function pushHistory(body: BodyState, world: WorldState): void {
  const list = historyStore.get(body) ?? [];
  list.push({
    tick: world.tick,
    fuel: body.fuel,
    heat: body.heat,
    damage: body.damage,
    fatigue: body.fatigue,
    activation: body.activation,
  });
  if (list.length > HISTORY_LEN) list.splice(0, list.length - HISTORY_LEN);
  historyStore.set(body, list);
}

/** Read-only view of the recorded history for `body` (empty if stepBody has
 *  never been called on it yet). */
export function getHistory(body: BodyState): readonly HistoryEntry[] {
  return historyStore.get(body) ?? [];
}

/** Per-tick linear slope of `key` over the most recent SLOPE_WINDOW entries
 *  (simple endpoint-to-endpoint rate; 0 if there isn't enough history). */
export function recentSlope(
  body: BodyState,
  key: Exclude<BodyVar, 'stability'>,
): number {
  const history = getHistory(body);
  if (history.length < 2) return 0;
  const recent = history.slice(-SLOPE_WINDOW);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.tick - first.tick;
  if (dt <= 0) return 0;
  return (last[key] - first[key]) / dt;
}

/** Test-only escape hatch: clears history for a given body so tests can
 *  reason about a fresh history sequence without cross-test bleed (bodies
 *  are usually fresh objects per test anyway, since the store is keyed by
 *  identity, but this is handy for explicit resets). */
export function resetHistory(body: BodyState): void {
  historyStore.delete(body);
}
