# M4 final correction peer review

2026-09-19. Read-only review by `/root/prepare_t6` in the shared `codex/phasing-m4` checkout, base `0ecd0f9dbd71d7135d97e49cdd7e4cd971de5872`. No repository edits, test execution, engine execution, corpus/opening reads or new agents. Parent owns the in-progress broad verification and final commit.

## Result

No material correctness defect or weakened assertion found in the scoped deadline and geometry corrections. The reviewed status document does not declare M4 complete, a release, exhaustive generation, a universal quiescence-cost guarantee, or playing strength. Final broad verification remains a separate requirement.

One minor pending-result wording correction is recommended before commit: `M4-STATUS.md` says “Corrections and final results are recorded in the accompanying change record,” but the reviewed change record explicitly marks `active-regression-2 / final-hard-types-2` as pending when drafted. Until the broad result is available, “Corrections are recorded; final results will be appended before commit” is more precise. This is not a hidden passing claim: both document openings clearly say validation is pending.

## Deadline correction

The preserved first broad result failed the former depth assertion: `returns the last completed iteration once one fits inside the deadline`, expected depth at least 1, actual 0. The old six-body MIDGAME test conflated completion within 600 real milliseconds with recovery of the last completed iteration.

The replacement is meaningful and bounded. It uses a nonterminal Phasing position with an opponent and a deliberately narrow generator, then proves a fixed-work depth-1 baseline completes without truncation or fallback. A second engine retains the same work rung and the real production watchdog with the same 600 ms deadline. Only `search/time.now` is controlled: time advances once a depth-1 progress event has occurred and at least two more search nodes have executed. The test requires the clock actually to expire, exactly the depth-1 progress event, additional nodes, `abort`, truncation, 600 ms measured elapsed, and an unchanged work limit. It then compares actions, score and end key with the independently completed baseline. A premature cut, no depth-2 entry, ordinary completion, empty fallback, or publication of the partial result cannot satisfy these assertions.

The production `HardEngine.ctx.stop` still tests its private armed deadline against imported `now`; no stop-result or search-result stub is used. The existing real-wall deadline/default-watchdog tests remain intact. The replay helper is stronger than before: it rejects post-terminal/post-handoff actions and accepts only terminal or opponent full Act/AP4 completion, rather than any legal prefix. The controlled-clock case does not claim an actual depth-1 throughput bound or that arbitrary search options preserve this tiny fixture's depth.

## Geometry correction

The two preserved broad failures were the F5/C3 rectangle case (expected blocking 1, actual 3) and fragility case (expected blocking at most 1, actual 3). Production `refreshExposure` now reads next-Act live strikes plus paid arrivals. The private test builder had populated only current strikes and the paid-arrival plane, leaving its next-Act live plane empty. The corrected builder agrees with the production level-1 builder's explicit current/next-Act separation, including remaining mover AP for the current plane.

Expected outcomes were retained, not fitted downward. The F5 fixture still pins areas 27 and 2 and blocking exactly 1; the fragility case strengthens blocking from `<=1` to `===1` and retains exact fragility 2/3. The canonical F5 witness checks the complete White handoff and legal Black C3→C1→A1 route, then independently asks canonical spawning for an empty White area.

The new paid-arrival case has live units on both sides and a supported Black paid Fire commitment at F6. A zero-bank pending unit supplies the future D5 exposure that the immobile live Metal I cannot supply. The rich/no-commitment control cannot create that exposure merely from affordability. Each canonical END_PLACE/MOVE step is checked independently, the arrived body actually traverses F6→D6→D5, the pending batch is consumed, Black retains zero cash, and canonical White spawning becomes empty. This separates current live reach, paid future reach and hypothetical new purchases without a Hard-generated expected move or numeric strength target. These remain geometry/wiring tests, not proof that an adversarial opponent would choose that route.

## Status and evidence checks

- Preserved `m4-active-regression-1/tests.json`: `success=false`, 822 passed, 4 failed, 0 pending, 6 failed nested suites. The four assertions match the documented deadline, two geometry and spent-attacker invariant causes.
- Preserved `m4-diagnostic-focused-4/tests.json`: `success=true`, 108 passed, 0 failed, 0 pending, 0 failed suites.
- All six recorded final TypeScript configurations and dependency scan have exit 0, `success=true`, and empty `sourceDrift`. The repeated final hard-types check also has exit 0 and no drift; final broad success was not assumed.
- `independent-summary.json` supports 44 roots, 3,380 candidates, 18,029 canonical actions/state comparisons, 3,380 full-byte unmakes, 44 actual search results, four rejected fault probes, no failures and no source drift. Its input pin agrees with the status document. Decompressing the preserved report reproduces SHA256 `902cc2c0e483d228a316b5c5ba3b3525e8292eaa41e05842021daa28bdaf3ae4`.
- Current runtime/canonical source hashes all still match that independent acceptance report. This review did not rerun acceptance or reinterpret its authored diagrams as scored suite answers.
- Explicit overflow, limited configured TT trees, unverified historical trace attribution, remaining M5/M6 exclusions, pending M5/M6/M7/browser/M8 work and T6 dependency limitations are visible. The separate A2 failure is reported as a valid negative result, not discarded or presented as Hard strength. This review did not independently replay A2 or read its game corpus.

## Reviewed pins and method

Paths below are relative to the shared checkout unless prefixed `work/`.

| Reviewed artifact | SHA256 |
| --- | --- |
| `muju/tests/ai/hard/deadline.test.ts` | `432eba1bc15c3a318c55fb315cb7e89a4dd2be1c87d95715a5b12143cea08ece` |
| `muju/tests/ai/hard/geometry.test.ts` | `b07a0c3d5da2915d654610aa5e3ac46267085704cae4ee71f6c5cffd3f730d65` |
| `muju/docs/hard-ai/phasing/M4-STATUS.md` | `ef8531a68e029ccc78e93625d60a42f7314efbd72ea931dee776f60d847457b5` |
| evidence `README.md` | `b9304dee134acd70575643d0956789d9bd4cf5f943a8590781815eaa9cc0660f` |
| evidence `independent-summary.json` | `b315366c06dd5270ac727c2924da0265cc7560c0c1eaaede20b5149f833e0e76` |
| evidence `m4-active-regression-1/tests.json` | `a915cecaf54cab1a4a251097f0776851a9092fa333efe984998a842ac0c5d694` |
| evidence `m4-diagnostic-focused-4/tests.json` | `8d29fe7054a9f7e18e52b7997cd0803c5849b50e8085e16b2c68e24b9e3bd321` |

Evidence paths are under `muju/docs/changes/m4-search-2026-09-19/`. Review used `git diff --` for the two tests, bounded `sed`/`rg` source reads, JSON metadata/failure extraction, and SHA256 checks. Supporting reads included `engine.ts`, `search/time.ts`, `search/pvs.ts`, `tables/context.ts`, `tables/threat.ts`, `game-fixture.ts`, and the owners' work handoffs. One exploratory `rg` for nonexistent `tables/build.ts` reported an expected path error; the actual builder in `tables/context.ts` was then inspected. No runtime validation was performed by this reviewer.
