/**
 * ENGINE FALLBACKS, per ladder game (Gate 0 item 6 of
 * `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`).
 *
 * > In every ladder game: 0 illegal actions, 0 replica divergences, 0 engine
 * > fallbacks (`packError`, `engineError`, `divergence`, `invalidSuffix`,
 * > `emptyPlan`, `workerError`). A fallback means the game was partly V2 vs V2.
 *
 * That is a CORRECTNESS VETO, not a statistic: a Hard-vs-V2 row in which the
 * Hard seat fell back for one turn is a row where part of the game was V2
 * against V2, and no score from it may be reported. Until now the ladder could
 * not answer the question at all — `replicaDivergences` was counted (through
 * `GameRecord.anomalies`) and `emptyPlans` was reported as a TIMING column, and
 * the other four kinds were invisible. So the whole vector is now carried on
 * every `GameRow`, summed per run, and any non-zero total VOIDS the row
 * (`ladder/run.ts#computeMetrics`).
 *
 * THE SIX KINDS are the browser's own (`src/ai/hardOptIn.ts#HardDiagnostics`),
 * kept spelled identically so a lab row and a `window.__mujuHardDiag` dump
 * describe the same event:
 *
 *   packError     the replica could not pack the position (`PackError`)
 *   engineError   the search threw
 *   divergence    the replica's plan disagreed with the canonical rules
 *   invalidSuffix an action inside the plan the canonical rules refuse
 *   emptyPlan     the search returned no actions at all
 *   workerError   the worker rejected, errored, or hit the watchdog
 *
 * WHERE THE LAB'S COUNTS COME FROM. Three sources, all already in the process:
 *
 *   - `lab/hard-ai/bots/hard.ts#hardBotDivergences()` — the adapter's own count
 *     of plan actions `isLegalAction` refused. The adapter drops the rest of
 *     the plan and the runner ends the phase, which is exactly the browser's
 *     `invalidSuffix`/`divergence` exit. It is process-wide and monotonic, so
 *     `worker.ts` snapshots it around each game.
 *   - `HardBotTiming.emptyPlans` — the same adapter's empty-plan count, already
 *     carried per game and per seat.
 *   - this module's registry, for everything a ladder-side adapter can observe
 *     itself. `ladder/engines.ts`'s `aiv2` adapters note an `emptyPlan` when a
 *     search comes back with no actions, and `noteLadderFallback` is the door a
 *     future Phasing-aware `hard@*` adapter (or a worker-backed one) reports
 *     `packError` / `engineError` / `workerError` through. Nothing about PLAY
 *     changes: the counters are written beside the behaviour that was already
 *     there.
 *
 * NOT-YET-OBSERVED IS ZERO, NOT UNKNOWN. Every field is a number on every
 * current row. `packError`, `engineError` and `workerError` are 0 for a run
 * whose engines have no worker and no pack step, and that 0 is the truth about
 * that run — the veto asks "did a fallback happen", and in those runs it
 * demonstrably did not. A row written before this landed carries no `fallbacks`
 * field at all, and `computeMetrics` reports that as "not recorded" rather than
 * as six zeros (`RunMetrics.fallbacksRecorded`).
 */

/** The six fallback kinds, spelled as `src/ai/hardOptIn.ts` spells them. */
export const FALLBACK_KINDS = [
  'packError',
  'engineError',
  'divergence',
  'invalidSuffix',
  'emptyPlan',
  'workerError',
] as const;

export type FallbackKind = (typeof FALLBACK_KINDS)[number];

export type FallbackCounts = Record<FallbackKind, number>;

export function emptyFallbackCounts(): FallbackCounts {
  return { packError: 0, engineError: 0, divergence: 0, invalidSuffix: 0, emptyPlan: 0, workerError: 0 };
}

export function fallbackTotal(counts: FallbackCounts | undefined): number {
  if (counts === undefined) return 0;
  let total = 0;
  for (const kind of FALLBACK_KINDS) total += counts[kind];
  return total;
}

export function addFallbackCounts(into: FallbackCounts, more: FallbackCounts): FallbackCounts {
  for (const kind of FALLBACK_KINDS) into[kind] += more[kind];
  return into;
}

/** `a - b`, field by field, never below 0 — the per-game delta of a monotonic
 * process-wide counter. */
export function fallbackCountsDelta(after: FallbackCounts, before: FallbackCounts): FallbackCounts {
  const out = emptyFallbackCounts();
  for (const kind of FALLBACK_KINDS) out[kind] = Math.max(0, after[kind] - before[kind]);
  return out;
}

/** Every non-zero kind as `kind=n`, in `FALLBACK_KINDS` order. Empty when clean. */
export function describeFallbacks(counts: FallbackCounts | undefined): string {
  if (counts === undefined) return '';
  return FALLBACK_KINDS.filter(k => counts[k] > 0).map(k => `${k}=${counts[k]}`).join(', ');
}

/**
 * The process-wide registry. Monotonic like the browser's `__mujuHardDiag` and
 * like `hardBotDivergences()`: games run sequentially inside a shard, so a
 * snapshot-and-subtract around one game belongs to that game.
 */
let registry: FallbackCounts = emptyFallbackCounts();

export function noteLadderFallback(kind: FallbackKind, n = 1): void {
  registry[kind] += n;
}

export function ladderFallbackCounts(): FallbackCounts {
  return { ...registry };
}

export function resetLadderFallbackCounts(): void {
  registry = emptyFallbackCounts();
}
