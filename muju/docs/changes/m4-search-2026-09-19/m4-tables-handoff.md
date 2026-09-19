# M4 tables, spawn and NodeTables cache handoff

Status: source/tests drafted; root is running source-bound combined diagnostics. This record does not claim accepted verification, Hard readiness, Gate 0, M4 overall completion or M8 activation.

Checkout: `/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-phasing-m4`, branch `codex/phasing-m4`, base `0ecd0f9d`.

## Owned changes

- `muju/src/ai/hard/core/spawn.ts`: additive `validPendingMask(p, side, out)` computes eligibility against the original live board. `pendingVoidedBy(p, victimSide, intruderSquare)` counts only currently valid paid commitments newly voided by the hypothetical occupation, preserving alternative-anchor semantics.
- `muju/src/ai/hard/tables/kill.ts`: explicit optional `KillOpts.horizon` (`current` default, `nextAct` future). Current queries do not invent purchases or promotions; the mover cannot attack during Prepare. Future candidates include each valid paid commitment as a separate actor, free of additional crystal cost. `KILL_PENDING_ATTACKER=-127` plus `spawnAt` is deliberately distinct from old negative-definition BUY encodings; future plans are forecasts, not replayable current lines. All future BFS uses the complete valid batch as occupancy. Future flags reset; defender damage resets before the mover's next Act but remains before the imminent opponent Act.
- `muju/src/ai/hard/tables/threat.ts`: current ready live-body strike is separate from future live-body `strikeNext` and pending-only legacy-name `strikeIfBought`. Future exposure combines live and pending reach on the simultaneous arrival board; cash without a paid commitment contributes no pending attack.
- `muju/src/ai/hard/tables/home.ts`: nearest future home threats use actual bodies and valid paid arrivals, rather than hypothetical affordable buys. `homeRaceAvailable` keeps its triple-buffer interface but emits `[BUY, PA_NONE, PA_NONE]` legal Prepare intent. The macro generator owns Prepare completion; this helper neither predicts a live slot nor moves a pending body. Existing pending target squares are excluded.
- `muju/src/ai/hard/tables/approach.ts` (lease extended by root): explicit current/nextAct approach table with the same live/paid-arrival distinction and shared projected occupancy. No hypothetical promotion or uncommitted purchase enters the table. The low-level optional-definition `classifyApproach` remains a documented geometric what-if; it does not establish legality of a buy or promotion.
- `muju/src/ai/hard/tables/context.ts`: current `killNow` and defensive next-Act `killActions`/`approach` are computed separately. Already-paid arrivals do not activate legacy `killNeedsBuy`. Cache reuse requires exact slot-to-square equality in addition to Kturn/catalog/level, including dead slots and L1→L2 upgrades; no ord-only TT invalidation was added.

`core/state.ts`, economy/eval, workers/UI/server/seat, tuning weights, corpora, books and canonical rules were not edited in this lane. AGENTS and CONTENT_DAG were read before editing. These are Hard-only consumer corrections to frozen Phasing rules, with publication outside this lane.

## Focused tests

Proposed combined root diagnostic list: `tests/ai/hard/{kill,threat,home,tables-phasing,spawn,tables}.test.ts`.

- Existing lane/combat/cleave/spawn/square tests retained.
- Legacy purchase/promotion kill expectations replaced by current negative controls and paid next-Act positive controls.
- Pending strike differential uses canonical `resolveSummons` + canonical movement for 1,000 side projections from 500 seeded authored boards; no position corpus access.
- `home.test.ts` replaces old BUY→END_PLACE→MOVE expectations with legal Prepare commitments; 300 seeded authored Prepare boards are checked for canonical BUY legality. A canonical buy/handoff/opponent reply/arrival sequence separately proves the prospective route exists only at the next own Act. Former archived Standard/opening corpus reads were removed from this Phasing test port; historical corpora were not changed or read.
- `tables-phasing.test.ts` adds canonical BUY→handoff→reply→arrival→attack evidence at zero remaining bank; future-vs-arrived kill and approach comparisons; alternative-anchor disruption compared with canonical resolution; a two-arrival corridor where one arrival blocks the other's kill/strike/approach route; damaged-target healing timing; equal-Kturn slot permutation for both L1 upgrade and L2 reuse; and dead-slot remapping.

Required root quarantine change after verification: remove only `tests/ai/hard/home.test.ts` from M2 quarantine. New `tables-phasing.test.ts` is unquarantined already. Other M4 quarantine removals belong their owners/root.

## Scope limits and pending verification

Next-Act geometry assumes unchanged live positions and surviving bodies through intervening replies/upkeep. It applies deterministic attack reset and the intervening defender heal, and projects already-paid current commitments, but does not simulate an opponent move, future purchase, future promotion or upkeep release. These are tactical estimates, not guaranteed future witnesses or win proofs.

The existing `approach-tie.test.ts` remains an M6 evaluation-flag/corpus test, already quarantined; its tie ordering mechanism and eval knobs were not changed. Its old enumeration commentary still describes hypothetical forms and needs a later M6 corpus/oracle port. This lane does not run or read its corpus.

Root owns shared queue executions, full source/test hashes, dependency/type checks and cross-slice acceptance. No test was independently executed by this lane before the combined diagnostic. Final outcomes/hashes will be appended after root evidence and corrections.

## Diagnostic corrections (not final acceptance)

Root reported combined focused diagnostic 1: 258 passed / 9 failed, no source drift. All table/spawn/home cases passed except the new canonical BUY lifecycle fixture: its White bank was 3, but `water_1` costs 4. The fixture now uses the canonical catalogue price and still asserts exactly zero bank after BUY. This was a fixture error, not a relaxed legal-action assertion. Root retains the failed run.

A separate pre-rerun source audit found the next-Act projection needed both arrival windows when forecasting the current mover's following Act. A valid opposing arrival can block a future movement lane even though it was absent on the current board. `nextActProjection` now represents the opponent's preceding batch and then the mover's own batch, with each batch validated against its own pre-arrival snapshot. An imminent opponent forecast includes only that opponent's batch. The proposed test was corrected before authoring: opposite currently valid spawn rectangles cannot overlap on an unchanged board, so it would be false to claim a valid enemy arrival newly voids an already valid own commitment without an intervening move. The actual regression is path blocking, demonstrated by a 2-AP approach becoming 3 AP, and verified against canonical full turn handoffs and append order.

The current strike map was also restricted to the mover's actual remaining AP (reserve one action for the hit), with 1-AP, 2-AP and Prepare controls. Slot-remapping tests now maintain the high-water slot count and independently recompute Kturn after the permutation.

## Second diagnostic and bounded P6/P8 coverage handoff

Root reported the second source-stable combined diagnostic: **331 passed / 1 failed**. All table, spawn, home and two-window regressions passed. The one remaining failure was the separately owned quiescence cap test; this lane makes no claim that overall M4 acceptance was complete at this checkpoint.

Root then authorized four test-only changes from `work/m4-remaining-quarantine-review.md`:

- `tests/ai/hard/search-tie-break.test.ts`: all fresh constructors explicitly request Phasing. Existing absent/empty flag equality, TT ordering and non-vacuous tie controls remain. Both engine arms must canonically replay through the first handoff or victory. The last title now accurately states its legal-macro contract instead of claiming that it necessarily changes the returned move.
- `tests/ai/hard-engine-fallback-elapsed.test.ts`: two valid fixtures explicitly request Phasing, with a once-called throwing search spy. Invalid packing and exact elapsed/zero-clock checks are retained.
- New `tests/ai/hard/p6-stoppable-generation-phasing.test.ts`: five authored current-rule cases drive production stop-aware generation, stopped-root salvage with/without mandatory upkeep, eligible-node TT suppression, and nonzero counted-but-unpriced generator proof telemetry. Candidate outputs must pass canonical complete-macro replay.
- New `tests/ai/hard/p8-rescue-cap-phasing.test.ts`: three authored current-catalogue cases drive the actual engine-installed shared cap across all three generators, charged witness accounting, refusal/truncation/eligible-node TT suppression, per-search reset, repeated fixed-work equality, and absent/inert control. The observer wraps real `homeWitness` with a 2,048-node bound, and replay verifies the rescued invader is removed.

The historical P6/P8 files, JSON snapshots, old numeric pins and Metal-v2.8 mock were left byte-for-byte unchanged. No tests were independently executed. Source edits paused for root's `types5` and `focused3` after scoped `git diff --check` passed. Quarantine removal/ledger changes remain root-owned; the new files require no removal because they are unquarantined by default. These are structural regression contracts, not new strength or latency claims.

## Active-suite geometry fixture correction

The parent-run active regression set reported 822 passed / 4 failed, no skips, with all six type/dependency checks passing. Two failures were `geometry.test.ts:173,259`: exposure-filtered blocking returned the cap sentinel 3 instead of expected 1. The test's private `level1` builder filled only the current `strike` plane; M4 `refreshExposure` correctly reads the new `strikeNext` plus already-paid arrival plane. Missing future live strikes therefore produced an empty exposure candidate mask. This was a stale test assembly, not evidence that geometry's fragility formula needed weakening.

Only `tests/ai/hard/geometry.test.ts` was edited: the helper now populates both current and explicit next-Act strikes (with the mover's remaining current AP handled separately); exact F5 blocking=1 and fragility=2/3 expectations remain, and the old `blocking<=1` assertion is strengthened to exactly 1. The F5 fixture now exhibits a fully canonical handoff and Black route to A1, after which the canonical spawning oracle reports zero White squares. A new independent Phasing case distinguishes a zero-bank already-paid fire arrival from a rich but uncommitted opponent: the paid body legally arrives and reaches D5 to invalidate White's sole supporting rectangle; the immobile live Yan cannot supply that occupation. Both sides' expected masks and cap sentinel are asserted explicitly. No runtime edits, quarantine changes, or independent executions. Scoped diff check passed; source paused for root verification.
