# M4 macro / keep / search handoff — implementation ready

Status: owned runtime is frozen; focused verification and independent44-root acceptance passed. Parent owns final broad regressions, integration and commit.

Scope: `work/deevgames-phasing-m4`, base `0ecd0f9dbd71d7135d97e49cdd7e4cd971de5872`. No commits by this owner. No sealed/opening/full Gate1 data inspected. Parent owns global acceptance and quarantine edits.

Implemented:

- ActionSearch retains mover Act endpoints; TurnGenerator completes each retained endpoint through its own post-Act upkeep and Prepare, ending at first END_PLACE handoff or terminal. Partial Prepare roots complete only their remainder. Forced prefixes use one completion path. MAX_TURN_ACTIONS stays 24.
- Every generated PAY_UPKEEP action has index zero and a copied four-word `Turn.keepMask`. Pool reset clears ownership; Turn copies, decoder, search make and ordering replay use the owned choice. Legacy records require an explicitly supplied valid choice table. Canonical verification rejects incomplete macros, actions after handoff/terminal, missing choices, and wrong end keys; decode fault prefixes retain first-refusal reporting.
- Keep ranking no longer consumes NodeTables: enemy-home occupier, own-corner rescuer, unblocked live anchor, then material less rent; square-order enumeration resolves ties at every count. Existing legal subset enumeration/cap remains. Core state / M2 order and prover semantics untouched.
- Numerical TT/proof use is restricted locally to full Act AP4/progress0/no-upkeep boundaries; public Kpos unchanged. Existing terminal evaluation remains relative to the original mover.
- Removed SUMMON_STRIKE. HOME_FORTIFY4096 is tactical; DISRUPT8192 is non-tactical. Promotion owner supplies Mission.FORTIFY; each fortification is offered outside ordinary Prepare shortlist limits. Late forced entries may evict nonforced beam entries; pure-forced or pool saturation increments forcedOverflow and generation truncation blocks numerical TT publication. Production disruption is one metered deterministic best move.
- Rebuild tables for changed Prepare endpoints and charge the existing KILLTABLE class/rate; plan GEN accounting remains. HOME_RACE is a forced pending BUY intent, never an immediate move by a new body.

Verification record (executed by root through normal shared queue; this owner reviewed logs/results):

- `work/m4-diagnostic-types-1`: exit2, missing/unused imports and obsolete tests; preserved.
- `work/m4-diagnostic-types-2`: exit2, two parameter names; preserved.
- `work/m4-diagnostic-types-3`: exit0, no source drift.
- `work/m4-diagnostic-deps-1`: exit0, zero dependency violations, no source drift.
- `work/m4-diagnostic-focused-1`: 258 passed / 9 failed / 0 skipped, drift0, retained in `tests.json`. All initial macro/upkeep/generate/turnpool/replay tests passed. Failures exposed old canonical fixtures/pins, quiescence in-flight accounting, signed signature lookup, and two other owners' directed fixtures. These failures and their corrections remain recorded below.
- `work/m4-diagnostic-types-4`: exit0, no drift. `work/m4-diagnostic-focused-2`:331 passed /1 failed /0 skipped, no drift. Remaining failure was the stale unit test's actual-spent-work share0.35381458 against0.35; that observation does not establish failure of the frozen rung-based R5 gate. These five TT cases passed, but the initial pending(3,2) fixture lay outside its live spawn rectangle and would refund; this run is NOT legal-arrival evidence.
- The pending control was corrected to(1,2), asserts the validPendingMask bit at square21 and a canonical arrival along generated quiet/quiet depth2 branches; it passed focused3 and focused4. Final quiescence generation polling / work accounting corrections passed focused4. Independent acceptance also passed as recorded below. No tests were executed directly by this owner.
- `work/m4-diagnostic-types-5`: exit0, drift0. `work/m4-diagnostic-focused-3`:350 passed /3 failed /0 skipped, drift0. Both independent forced-phasing regressions passed. The corrected legal pending arrival and TT controls passed. Two P6 failures were the pre-generation cut flag reset; actions already passed complete-macro salvage assertions. The R5 failure now was a real rung violation: limit120000, actualwork120230, quiesceWork44799, rungshare0.373325 (spentshare0.3726108292), depth1, work stop. This is distinct from focused2's stale denominator failure.
- `work/m4-diagnostic-types-6`: exit0, drift0.
- `work/m4-diagnostic-focused-4`:108 passed /0 failed /0 skipped, exit0, drift0. Exact files: forced-phasing(2), generate(13), P6 Phasing(5), P8 Phasing(3), phasing-macro(20), pvs(10), quiesce(7), replay(5), root-exposure(43).
- `work/m4-independent-acceptance-1.json`: success,44 roots,3380 candidates,18029 canonical action/state comparisons,3380 full unmake checks,44 real Hard search results,4 fault checks,0 failures and0 source drift. Root executed; this owner reviewed the completed record. Driver SHA25672713e88a2ce3b172e75a91e714df72d60a995f60993560883929903a10a0710; input SHA25686512dc5573b1283be2c4c28644ea28dadc0f6caaf83f5271cc31091e37b6b72.
- Parent's final broad active Hard/M2 run and final deps/types are pending outside this handoff's acceptance claim.

Tests authored/ported here: `phasing-macro.test.ts` (boundary/owned masks/TT domain/slot-independent keep prefixes/terminal/forced storage), `generate.test.ts` (Phasing grammar, delayed purchases, Act tactics, owned keep choices), `turnpool.test.ts` (flags and delayed decoder), `replay.test.ts`, `quiesce.test.ts`, and board-valid upkeep fixtures in `upkeep.test.ts`. Root now owns `pvs.test.ts`/`order.test.ts`; initial Phasing ports there were handed off explicitly.

Limitations / quarantine disposition:

- Root restored the passed M4 files to default Vitest. This slice's exact restored historical files: `canonical.test.ts`, `generate.test.ts`, `gen-trace.test.ts`, `quiesce.test.ts`, `replay.test.ts`, `turnpool.test.ts`, `upkeep.test.ts`. New `phasing-macro.test.ts` is active. Parent and other owners cover the remaining restored files. Historical `p6-stoppable-generation.test.ts` and `p8-rescue-cap.test.ts` remain quarantined, with separate active authored Phasing contract suites; no blanket unquarantine.
- `canonical.test.ts` and observational `gen-trace.test.ts` were ported to authored Phasing roots and passed focused2. The gen trace stage-attribution model still uses historical vocabulary/order; this report does not certify its per-stage removal diagnosis. No other historical corpus suite was read or ported here.
- Forced set has finite output/pool bounds; overflow is explicit, not a completeness claim. The independent row exercised five saturated roots at output152: SD05 remote landing143 omissions, SD10 capture-only anchor221, SD18 arrival attack59, SD28 all rectangles183, SD10 after-first-witness393. These counts are omitted candidate offers, not unique legal-line counts; the same key can be offered more than once. Recorded overflow marks the search truncated and forbids publishing a numerical TT entry. This is a material bounded-generation limitation, not an all-legal-lines claim. Prepare/Act candidate selection remains selective by the frozen generator design. No strength claim or tuning performed.
- The two forced-storage regressions deliberately use synthetic end keys at the storage seam; canonical turn legality is tested independently, not inferred from those storage records.

Additional source corrections after focused1:

- After focused3, the top-level quiesce wrapper now declines to open a new subtree once the allowance has already been spent, using ordinary terminal/static leaf evaluation instead. Every EVAL charge still hits the real WorkMeter; no already-executed subtree work is clipped or relabelled. The new regression calls production pvs at depth0 three times on a tactical state after the cap: generator/qnodes/quiesceWork/QUIESCE events must not advance, evaluator must run3 times and EVAL/global charges must rise. Previously, post-cap static leaves still opened a quiescence call and kept adding to quiesceWork indefinitely.
- iterativeDeepening now marks truncated on an initial deadline stop after its reset; stopped-generation salvage still returns a canonically complete depth0 macro. P6 owner retained both independent expired-stop assertions unchanged.

- Parent verified the authoritative R5 denominator in `design/DEVIATIONS.md` 2026-09-15 amendment (lines2193–2203) and `lab/hard-ai/bench/run.ts`/`gates.ts`: requested rung, not result.work. The unit test now follows that existing rule at unchanged0.35, and logs both ratios. No new stronger cap is imposed. The focused2 stale-denominator failure is preserved and is not evidence of a frozen-gate failure; focused3 did reveal a real rung failure, subsequently corrected and verified in focused4.
- Independent Prepare-owner review found shared root-sized output could be silently sliced to a smaller interior destination. generateAt now sets scratch output length to the actual per-ply capacity before generation and restores the larger capacity on later root calls. The generator's overflow counter/truncation therefore governs the actual retained list.
- The same review found forced Act lines bypassed Prepare fortifications when absent from the ordinary beam. Forced lines now enter centralized upkeep/Prepare completion: bare completion uses the first ranked legal keep choice; all considered keep branches (root/reference≤64, interior best4) may contribute eligible HOME_FORTIFY suffixes. Without an existing own enemy-corner occupier, alternative forced payment choices cannot add fortification and are skipped. Ordinary purchases/combos are not inherited as FORCED. Tables, context flags and owned mask are restored after each injected line. Early terminal prefixes stop immediately. `forced-phasing.test.ts` was independently authored by Prepare owner, with hostile beam scoring and canonical entry→promotion-to-mate plus actual destination-capacity regressions; both regressions passed focused3 and focused4.

- Quiescence checks now include the active top-level subtree's meter delta, passed through recursion, instead of only previously completed subtrees. The generator sink gained a separate local policy-stop predicate and quiescence discards a policy-capped candidate list whole before searching it. Existing GEN charges now occur at plan construction so polling sees them, with unchanged class/rate/count on complete generations. Threshold remains34/100; the existing35% cap assertion is unchanged. Checked before generating and each child; no cost/rate tuning.
- Killer/counter comparisons normalize both stored Int32 signatures and unsigned turn signatures to uint32, including duplicate detection in onCutoff. Parent authors the exact high-bit bonus regression.
- Current kill injection and post-handoff SEE explicitly use horizon current with deprecated buy/promote options false. Live kill replay no longer contains unreachable Standard BUY/lowest-dead-slot prediction; future pending sentinels are refused as non-live actors.
- canonical.test now consumes only authored Phasing states and compares exhaustive Act-end key sets with TT on/off. Historical Standard 22,725/797/1,053 figures remain labelled history rather than being silently repinned. The retained-prefix case uses a real mover MOVE and mover-relative scoring.
- gen-trace.test now uses12 authored Phasing roots and includes owned keep masks in observational equality; pack failure can no longer silently skip a case. This certifies final-output observational identity, not historical stage-removal attribution.
- Five new macro TT cases cover full Act, identical live board with a paid legal pending commitment, partial Act, Prepare and upkeep Prepare. A hand recursion exhausts the configured depth2 candidate tree without alpha/beta or TT (explicitly not the entire legal-action universe); it compares TT on/off scores and retained legal optimal end sets, verifies PVs, requires no truncation, exercises a warmed full-boundary cache and rejects poisoned same-key entries for partial roots. Exact retained end equality is required only for a unique optimum; witness ties do not imply different semantic values.

Verified runtime/source pin (types6/focused4/independent row; unchanged in this handoff):

| Source under `muju/src/ai/hard/` | SHA-256 |
| --- | --- |
| `gen/actionsearch.ts` | `3cd5a24235993cbbc207421f986e123fb4f18bb61d5b1f1c184eab4710d3025f` |
| `gen/generate.ts` | `eeab314180c609077a1f6bb26950fb2c91ff8de7958155b580171618e30e6446` |
| `gen/turn.ts` | `cc16cc8fc877f4070546148242177ab26e7d3ac0369dd7f93dd53c094250dafe` |
| `gen/upkeep.ts` | `961e7d02707ca64dc11938473c218aa801c006643c768b862d54061d6c85bc78` |
| `search/pvs.ts` | `07c5d8ecdd7b97092c7120b810aae985b246805f28cda0ac16f08a74c8082bb8` |
| `search/order.ts` | `b2298bb362b33e2b2a5143879e3aa5dbdaf6cfae844beb19b33dbba99e7bf911` |
| `search/root.ts` | `8df7d1e2a113607af42700028316ee3e105c2cf3ad4994191218f4964f9f9052` |
| `search/quiesce.ts` | `29656ac2294c22c87fd2501c3772f0a6530e51f59d87538c4df4725534d26c6f` |
| `verify/replay.ts` | `b310d047a0ebbed91767b4099f8d030badb21330406d3c6aed4956e661949117` |
