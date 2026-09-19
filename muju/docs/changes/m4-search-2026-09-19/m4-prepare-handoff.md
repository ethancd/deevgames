# M4 Prepare planner slice C — handoff

Working checkout: `work/deevgames-phasing-m4`, branch `codex/phasing-m4`, base `0ecd0f9d`. Shared checkout: macro/search and table changes belong to other owners. No commits, guard change, corpus reads, tuning or deployment in this slice.

## Owned changes

- `muju/src/ai/hard/gen/purchase.ts`
- `muju/src/ai/hard/gen/promote.ts`
- `muju/tests/ai/hard/purchase.test.ts`
- `muju/tests/ai/hard/promote.test.ts`
- `muju/tests/ai/hard/root-exposure.test.ts` (later explicit ownership transfer from root)
- `muju/tests/ai/hard/forced-phasing.test.ts` (later independent regression assignment; both cases passed focused3)

Purchases enumerate all affordable tier-1 classes; Standard's immediate lethal-answer/dominance helpers are removed. Enumeration remains deliberately bounded by the existing multiset/square/plan config. Every plan freezes the original live spawn union, removes existing own paid commitments and same-plan commitments, deducts bank, and emits only BUY actions. It never materializes or anchors a new piece. `spawnAfter` means uncommitted purchase availability, not live spawn geometry. Other-owner commitments do not reserve squares for this owner.

No cross-state cache was added. Definition/square scores are recomputed per call, including reserve, enemy geometry, configuration and pending-plane changes. No spawn-mask/bank-only cache exists.

Scoring rationale is hand-derived, not fitted: multiply the old mine value by the existing `GAMMA_Q16[1]` for one extra delayed mining cycle. The partial disruption probe intersects all live supporting rectangles and asks whether a live enemy mover can finish its next four-action Act there. A reachable single intruder must block every alternative support. The risk charge uses only refundable cash's one-cycle time value, `(1-gamma) * price * safeCc`; it does not charge lost material. This probe omits captures, combinations and future arrivals and is an ordering heuristic, not a survival/arrival proof. `strikeCc` and `blockCc` have no effect. `anchorCc` charges consumed commitment availability, with no new live anchor credit. HOME_RACE scores/flags are delayed intent and never an immediate move/attack.

Promotion KILL is replaced by `Mission.FORTIFY = 0`; other mission IDs remain unchanged. While an own live unit occupies enemy home, every legal own promotion is retained as a potential occupier/blocker reinforcement. This conservative candidate coverage avoids guessing which remote blocker might affect rescue. Replica/canonical adjudication, not the mission label, decides mate. These candidates bypass ordinary `max` (even zero) up to output capacity; the macro owner agreed to provide `MAX_SLOTS` records and force their completion before ordinary pruning. Outside fortification, SURVIVE, INCOME, REACH and defence-improving ANCHOR missions remain selective. Attack-only promotion no longer masquerades as immediate anchor protection. Equal scores use square order rather than slot identity.

## Integration contract

Planner signatures remain `planPurchases(p,t,cfg,sc,ply,out)` and `planPromotions(p,t,max,out)`. Macro owner owns `HOME_FORTIFY=4096`, `DISRUPT=8192`, `TACTICAL_FLAGS`, forced injection and complete macro replay. Macro HOME_RACE injection must remain independent of normal purchase cutoffs. FORTIFY needs `MAX_SLOTS` output records to guarantee every legal candidate; smaller caller buffers are explicit truncation. Root owns interface tests, global types/dependencies and quarantine edits.

## Verification

First combined diagnostic: `work/m4-diagnostic-focused-1/{verification.json,tests.json,command.log}` (root-owned shared queue wrapper `work/run-m4-check.mts`; exact command in verification.json; `MUJU_RUN_QUARANTINE=1`, explicit ported file list, one Vitest worker). Exit 1, drift `[]`, JSON `success:false`, `numPassedTests:258`, `numFailedTests:9`, `numFailedTestSuites:10`, `numPendingTests:0`. Owned purchase cases all 25 passed; promote 12 passed and 1 failed. Preserve this evidence unchanged.

The failed blocker-fortification fixture was already canonical mate before promotion: tier-I Sjor cannot perform the two attacks its proposed rescue needs. Corrected the defender to tier-II Straumr (same power and speed, now two-attack Cleave capacity), and strengthened the test to obtain/replay the canonical rescue witness before checking that blocker DEF 2→3 produces mate. No planner source change, outcome tuning or weakened expected answer.

Root additionally transferred `root-exposure.test.ts`. It now defines eight explicit Phasing roots instead of reading Standard authored/opening JSONL during collection. All identity/instrumentation results require no fallback and full canonical action/end-key replay. A paid-arrival tactical fixture uses explicit maxDepth 1/2 with bounded quiescence, requiring completed-depth records and nonempty quiesce/interior reply traces; no work-rung-to-depth inference. An additional own-pending Prepare case verifies it stays pending through opponent handoff. Original metadata/instrumentation assertions remain. No historical corpus bytes were opened or changed.

Follow-up verification pending root's next stable combined run. The standalone `work/run-m4-prepare-checks.mjs` was prepared but never invoked; it is not evidence.

### Focused2 results and bounded follow-up

Root's types4 passed. Combined focused2 evidence is preserved in `work/m4-diagnostic-focused-2/{verification.json,tests.json,command.log}`: exit1, `sourceDrift:[]`, JSON `success:false`, `numPassedTests:331`, `numFailedTests:1`, `numFailedTestSuites:2`, `numPendingTests:0`. Owned purchase25, promote13, root-exposure43 all passed. The only failed assertion was `quiesce honours DESIGN §5.11.4's R5 cap on a tactics-rich position`, assigned to the macro owner; do not represent focused2 as overall green. The promotion fixture correction is now verified, as are the non-vacuous instrumentation and canonical replay assertions.

The subsequent independent read-only macro/Prepare review found two material gaps outside this slice's runtime files: per-ply output capacity silently dropping forced candidates, and forced Act entries bypassing their FORTIFY Prepare suffixes. Details and source pins: `work/m4-macro-prepare-review.md`. Root assigned one additional owned file, `muju/tests/ai/hard/forced-phasing.test.ts`, containing independent regressions for both; it is currently written and paused, unexecuted. The macro owner owns their runtime fixes. Existing five owned files remain at the focused2 hashes below. Final combined verification/acceptance is still pending those closures; no general M4 completion claim.

Both macro fixes have now received static re-review without a new finding. The new independent test is frozen at SHA256 `7033120f1af383ecedc918959f680db7d417908eec933e9c31aba797f4a245ba`; exact corrected macro source and test pins are in `work/m4-forced-regressions-ready-hashes.json`. Root will execute the tests in the next coordinated shared-queue run. All six owned files are paused.

### Focused3 results

Root's focused3 completed at `work/m4-diagnostic-focused-3/{verification.json,tests.json,command.log}`: exit1, drift `[]`, JSON `success:false`, `numPassedTests:350`, `numFailedTests:3`, `numFailedTestSuites:4`, `numPendingTests:0`. Both new `forced-phasing.test.ts` regressions passed. Remaining failures are two already-expired-stop P6 truncation-flag checks (upkeep review false/true) and the R5 quiescence work-share check; macro owner owns corrections. Preserve all failed evidence. The six owned files remain unchanged; final integrated verification is pending the later run.

Read-only R5 correction review (quiesce SHA256 `29656ac2294c22c87fd2501c3772f0a6530e51f59d87538c4df4725534d26c6f`, pvs `07c5d8ecdd7b97092c7120b810aae985b246805f28cda0ac16f08a74c8082bb8`, test `fbc4d1369cf2c8f1dfc87cd24ed50a20c239b1134007be0fe0c9cf5275160f72`): post-cap depth-zero calls return an ordinary charged static leaf before opening another Q subtree; entered subtrees retain their full measured work delta. No clipping, EVAL-charge suppression or new material defect found. The real-rung test is still necessary because static cap polling cannot prove a universal ceiling for a large in-flight operation. P6's initial stop now sets truncated before breaking. No reviewer execution.

## DAG and limits

Read AGENTS and CONTENT_DAG before source edits. Plan `python3 tools/muju-content-dag.py plan --files muju/src/ai/hard/gen/purchase.ts muju/src/ai/hard/gen/promote.ts --format json` saved as `work/m4-prepare-dag-plan.json`; no unmapped paths. Hard generator source changed in this slice; broader Hard integration, strength, release and deployments remain root-owned/blocked until their gates pass. No strength or full-M4/release claim follows from these planner tests. Historical experiment evidence remains intact.

## Focused2 freeze

All five owned source/test files are paused for root's types4 then focused2 run. Hashes are saved in `work/m4-prepare-focused2-ready-hashes.json`; source/test edits are prohibited until results. Final verification is pending. Purchase/planner source hashes remain identical to the first ready snapshot; only the corrected fortification test and transferred instrumentation test changed.

- `muju/src/ai/hard/gen/purchase.ts`: `0539d2e0816dba24ad082730a4be38626eddbf48069516ef52956db09eb5cbdd`
- `muju/src/ai/hard/gen/promote.ts`: `cd7a2a41ad8df9c36c90b12cbbb97abf3588d50a91f3489b295e5f10c6b9fb9c`
- `muju/tests/ai/hard/purchase.test.ts`: `712aa3bbbf0d129ed6e2bcaefeeafc35e480c997ddbb1724845966ff8deface0`
- `muju/tests/ai/hard/promote.test.ts`: `140c80c52c54291b13c9f167405c63c4465728c1d19336b39c7b185a7bfb82dc`
- `muju/tests/ai/hard/root-exposure.test.ts`: `a3529abaa2f32baec120cf7a348a86645703b93d736ae4ecb9c013690a1213fc`

## Independent review support

Read-only reviews (no code/execution/corpus reads) were delivered to root in `work/m4-acceptance-driver-review.md` and `work/m4-legacy-search-test-review.md`. The original three driver findings were corrected and re-reviewed in source. Root also reports the wrapper leaf-PID queue fix is implemented; no interrupted earlier run was recorded. Root's pvs/order/mate ports were reviewed without a new clear fixture/assertion defect. These reviews are not a runtime acceptance claim.
