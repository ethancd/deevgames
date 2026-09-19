# M6 accounting bootstrap — verified checkpoint, full M6 incomplete

2026-09-19. Prepared on `codex/phasing-m6` above M5 `66473c7582eacbbad1f49f69c6b0b8789f6a1638` and M4 `5d317407`. The approved pre-outcome contract is [M6-BOOTSTRAP-CONTRACT.md](M6-BOOTSTRAP-CONTRACT.md). Full evidence is preserved in [the change record](../../changes/m6-evaluation-2026-09-19/README.md).

The implementation checks pass over the **selected** 80-file Hard/Phasing set: **1,106 tests, zero failed/skipped; six type configurations; dependencies; DAG; production build; independent 44-root replay; 18 accounting goldens**. That selected set is not the repository default suite, which currently **fails** — see "Repository-wide test state" below. The first complete frozen M5 measurement is **valid but fails two performance floors**. This is an accounting bootstrap checkpoint, not completion of full M6 (corpus → fit → validation), the migration, or a release.

| Family | Earned / offered | Frozen minimum | Result |
| --- | ---: | ---: | --- |
| Tactics |62/63|57|Pass|
| Invariants |5/18|17|Fail|
| Home mate |28/28|28|Pass|
| Economy |20/20|20|Pass|
| Summon disruption |5/14|13|Fail|
| Home fortify |6/6|6|Pass|

All225 expected cases ran;126/149 offered units earned and all76 coverage checks passed. There were no missing/error/indeterminate coverage rows, correctness vetoes or source/engine drift. A strategic predicate miss is a valid negative result, not a reason to void the row. No thresholds, classifications or coefficients were adjusted after seeing it. The independently audited earlier Gate1 baseline failure remains unchanged, and every release guard remains closed.

Frozen bootstrap weights hash `0ae24a95`; exact weights file SHA256 `e8e1cc7d7e15d9c02d148651004dfd2fe716b98a8017e3ef031b94ed74816eb3`. M5 manifest semantic SHA256 `df27339b4c2ad85821a00bc3a3dbb8ab5b6f9d151ee105177c894cf36a31be0f`; measured engine identity `06e907b23c209d35dc7ffd03cd55cffab77377c78876eb815aff82633dfdbcc7`; case-row bytes SHA256 `32f6b531193e9f81de74860651ca8040f56dd807bd82ff4adf4acdce22111a33`.

## Implemented accounting contract

Feature indices 0–57 and the twenty invariant slots 38–57 are preserved. Four stage-2 features are appended: PendingValue58, ArrivalThreat59, DisruptPressure60 and RentShortfall61. The feature identity is `muju-phasing-eval-1`, persisted weights schema `muju-weights-phasing-v1`, vector length62, weights version2, label `phasing-accounting-bootstrap-v1`.

The nonzero bootstrap feature entries are Material0=100 (informational), BankLiquid2=100, BankExcess3=100, EconDelta23=100 and PendingValue58=1. The evaluator prices live material through the separate18-entry catalogue-cost vector, not by multiplying feature0. All other57 feature coefficients are explicitly zero. Cash has one value on both sides of the old eight-crystal split. Zero tactical coefficients are a deliberate declared limitation, not missing feature implementations or evidence that those effects lack strategic value.

The economic forecast follows one named policy: no moves, attacks, purchases or promotions; end phases, settle legal upkeep with canonical `defaultUpkeepAction(state, false)`, and stop at the first terminal state or after six future own income closures per side. The structural maximum is48 phase actions. A current unpaid Prepare bill has ordinal0 and no new income; not-yet-collected income closures have ordinals1–6 with inherited Q16 discounts `round(0.9^k * 65536)`. A settled Prepare does not mine or pay its completed bill again. Arrivals resolve in actual incoming-turn order, with actual prior releases, simultaneous-batch eligibility, refunds, healing and terminal precedence.

Two ledgers remain separate. Cash flow uses exact finite income, actual paid rent, refund cash and legal retained/released bodies. Valuation includes root-live mining minus actual rent and root-live catalogue principal released by this policy. It neither adds arrival principal nor treats a refund as income. Pending-origin mining is tracked by the original commitment, separately from root-live service. Feature23 takes the signed live-origin cc difference and truncates once to whole crystals; feature58 keeps signed cc precision. Q16 accounting uses safe-number integer arithmetic rather than unsafe32-bit shifts. Rounded feature output is not described as the exact event ledger.

The packed implementation is checked against a separately authored canonical-transition reference that accepts explicit states. It does not call the old relocation DP or a default corpus loader. The old DP remains a named historical diagnostic, not the oracle for current feature23.

## Pending features and tactical provenance

PendingValue prices every commitment's full paid principal plus its own discounted service only when the bounded exposure selector does not mark it. Invalid/unreached commitments retain refundable principal; a service discount never invents destroyed escrow. Risk1 also covers failure of the named no-move arrival forecast. Risk0 means only that this bounded probe did not mark exposure; it does not prove safety or estimate a calibrated probability.

The forecast retains the actual first intervening enemy Act before the root batch resolves (`pendingEnemyAct`) and the actual first incoming owner Act after that batch and healing (`pendingOwnAct`). These copies come from the same forecast, with no additional makes or proof calls. Movement exposure uses surviving root-live enemy identities, actual AP/flags, surviving anchors and actual occupancy including preceding paid arrivals. Newly arrived bodies block paths but are not movers in this bounded probe. Released root anchors cannot remain fictitious alternate support.

For a candidate intruder endpoint, current bank plus exact remaining finite income of every own live body, relocating only the mover, must cover at least that mover's upkeep. Other renters may be released in a legal keep. Free movers pass this necessary condition. Necessarily released intruders contribute neither risk nor pressure. The probe still omits captures, coordinated moves, a full post-move keep/terminal analysis and new arrival movers. DisruptPressure is the maximum conditional denied-service opportunity across mutually exclusive endpoints, not their sum and not captured/refunded principal. It remains coefficient0 because adding it to service already discounted by PendingValue would count the same event twice.

ArrivalThreat runs two current-horizon optimistic kill tables on the same actual incoming owner-Act snapshot. The second excludes only newly arrived friendly attacker identities while preserving their occupancy. It counts a surviving root-live enemy target only when the all-attacker table can remove it and the live-only table cannot. A selected plan mentioning an arrival is insufficient evidence of dependence. Birth identities distinguish survivors from reused dead slots. Terminal-before-arrival gives no future opportunity. This is a non-exhaustive table differential, not a canonical complete kill proof; its coefficient is0.

Legacy HangingBuy29 reports those arrival-dependent root targets. Hanging28 excludes the same identities from its old static optimistic hanging set. Slot28 remains a residual different-horizon diagnostic; subtracting unmatched aggregate totals would be unsound. Slots28/29/59 all remain zero-weight.

The retained snapshots add cache dependencies beyond the public position hash. `context.ts` keeps the M4 slot-to-square guard and additionally checks live birth order/IDs, pending commit order/IDs and both next-sequence counters. Guards are stamped after successful level1 construction. A vetoed level2 build stays at level1 rather than caching partial results. Equal-hash/equal-board changed-identity regressions check refreshed snapshot identities and exact cache hits with no repeated proof work.

## Invariants, purchase ordering and computation

Invariant bits5 and17 are explicit structural zeros: a snapshot cannot reconstruct a delayed commitment's old immediate-placement role or causal movement change from `F_PLACED`. Bits15/18 retain their structural/protocol meanings. Bits7/14 use the reached first unpaid bill and actual shortfall, with promotion/no-kill conditions retained. An unreached bill is not certified affordable. Bit19 removes the obsolete bank requirement and reads already-paid static next-Act exposure; it is still an optimistic geometric diagnostic, with coefficient0. Its same-board projection can differ from the chronological arrival forecast after upkeep releases. `leadCc` includes refundable pending principal so BUY does not manufacture a material deficit.

Purchase ordering uses the reached first bill's required reserve as a fixed pre-purchase heuristic baseline. It does not remove otherwise legal affordable plans, and a new commitment can change later income. No outcome-derived cash threshold or floor was introduced.

Full evaluation is deliberate. Every window computes stage2; the old unproved finite lazy bound is replaced by positive infinity. This establishes no throughput or responsiveness claim. Existing EVAL charges remain. Private forecast proof deltas are charged at existing PROVER class8 in evaluator and search table builds, including throwing calls; cached work is not charged again. Generator proof calls preserve the established count-only policy rather than silently changing its work price. Quiescence preserves actual executed work even when a typed forecast veto throws.

Wall-mode preparation before rung selection has separate proof/cap telemetry which survives a cold-probe stats reset; it is not silently billed to the later search allocation. Calibration uses an explicit Phasing initial state and meters its table/evaluator forecast work. A capped forecast throws `PhasingEconomyProofCutoff` through the engine's generic catches. It is not a leaf score, safe unknown, book answer or clean fallback. Fixed budgets, existing work costs and threshold conventions were not retuned.

## Book, mirror and future data boundaries

Nonempty books require BK03 and exact serialized weight/schema/version/vector identity, initial-map contents, current packed rule/catalogue signature and handicap. BK02, missing descriptors and mismatches fall through to search. Actual selection still requires a generated candidate with the stored raw end-position key and canonical replay verification. The wall-budget book hint uses the same compatibility helper, so a rejected stale book cannot shorten its target. EMPTY_BOOK remains the default; no actual book was built or measured.

Root book keys use raw orientation and Kturn, including phase/AP/current flags/progress. Partial Act and Prepare roots cannot alias a full Act solely through Kpos. Ordered state mirrors remap all200 pending-plane entries and sparse IDs, preserve birth/commit ordering, and rotate canonical summoning/income receipts and highlights. Receipt round numbers require their documented coordinate normalization when comparing transformed boundaries.

The named default-upkeep policy breaks equal-cost ties by absolute square. Rotation plus a seat swap can therefore retain a different renter and change later mining/PV. The approved implementation preserves this canonical policy. Each transformed reference is checked independently; universal rotational evaluation equivalence is not claimed. Fixed-position side-of-view sign antisymmetry is still required. Book mirroring does not merge scores across this asymmetry.

Future corpus/fit CLIs require explicit reviewed source-allowlist metadata and its caller-supplied hash, current rules/feature/weight identity, exact p1-dev source path/hash/opening identities and bound run/replay/corpus bytes. Required metadata preflights precede dataset reads. Unknown/unapproved/val/sealed/validation/symlink paths are refused without enumeration. Replays use the same hashed parsed bytes rather than reopening them. Only full-AP Act/no-upkeep rows qualify. Output directories must be fresh, outside src, with exclusive writes. Legacy rows/vectors are rejected, not padded or overwritten.

Texel preserves cash2/3=100, pending58=1 and fire1 material300; source tests use synthetic planted data and keep their numerical recovery tolerances. The guard's trust boundary is reviewed caller-pinned metadata; it does not magically identify maliciously relabelled copied content or claim protection against an adversarial filesystem race. No real opening pool, game corpus, fitted engine vector, validation set, sealed set, self-play run or book build was read/generated by the M6 implementation lanes. Synthetic test fitting is test evidence, not a tuned Muju candidate.

## Preserved evidence at this checkpoint

All execution was coordinator-scheduled through the shared queue with source/test hashes. The change record preserves failed diagnostics and final passing verification separately.

| Evidence | Recorded status and scope |
| --- | --- |
| `work/m6-first-focused-1/tests.json` | `success:false`;202 passed,20 failed,0 pending/skipped. Seven failed files: eval, interfaces, invariants, phasing-book, phasing-bootstrap, phasing-invariants, purchase. JSON nested failed-suite counter20 is not seven failed files. |
| `work/m6-first-types-1/command.log` | Preserved initial type failures, including forecast event annotations, removed liquidity export, current book metadata declaration and fixture literal typing. |
| `work/m6-second-types-1/command.log` | Preserved remaining negative-test literal type failure; corrected without changing a runtime predicate. |
| `work/m6-third-types-1/verification.json` | Current `tsc -p lab/hard-ai/tsconfig.json --noEmit` passed, as reported by coordinator. |
| `work/m6-second-focused-1/tests.json` | `success:true`;396 passed,0 failed,0 pending/skipped,18 files. Coordinator reports source drift0. |
| `work/m6-broad-regression-1/tests.json` | `success:false`;1,102 passed,4 failed,0 pending/skipped out of1,106. All four failures are old finite-bound/lazy-exit/EVAL2-conditional expectations in `tests/ai/hard/lazy.test.ts`; source drift0. This failure remains preserved. |
| Final broad regression, `m6-broad-regression-2` |1,106 passed,0 failed,0 skipped,80 files; source drift0. |
| `m6-static-checks-1`, plus `m6-final-types-1` |All six type configurations pass;46 Hard files,0 dependency violations;27-node49-edge DAG valid; source drift0. |
| Independent44-root replay, `m6-independent-acceptance-1.json` |3,339 macros/full unmakes,16,996 ordered canonical action/state comparisons,44 production searches,4 fault controls;0 failures/caps/drift. |
| Accounting freeze, `m6-bootstrap-freeze-2` |18/18 independent canonical-ledger goldens; exact sparse vector/material priors;0 source/driver drift or input mutations. |
| Complete frozen measurement, `m6-suite-measure-1` |225 cases, valid=true, floorPass=false; results and frozen identities above. |
| Production package, `m6-build-1` |`npm run build` passes, including WASM rebuild; no tracked WASM change, no source drift, no deployment. |

The396 focused passes comprise current M6 economy54, bootstrap24, book8, invariant14 and tuning guards19; ported eval25, interfaces21, invariants15, purchase25, perft33 and synthetic Texel30; and seven M5 implementation/adapter files totalling128. These tests establish their exercised implementation contracts, not M5 floor acceptance or engine strength.

The first failures prompted semantic ports after the original outputs were preserved. Review also found and corrected chronological released-anchor exposure, phantom paid attackers after refunds, necessarily released intruders, unhashed snapshot identity dependencies, missing forecast work accounting, partial-state book key aliasing and a stale-book timing hint. Tests were not skipped, numeric performance floors were not changed, and historical outcomes were not regenerated to fit the code. After the broad failure was preserved, `lazy.test.ts` was ported without production edits: it retains300 positions for both default and stretched weights, adds exact3× stage2 arithmetic, keeps300×12 window checks while requiring exact full-score equality, and requires exactly one EVAL1/EVAL2 charge and an actual stage2 call for every finite high/low/straddling window. Positive infinity remains the explicit no-finite-certificate sentinel, including zeroed stage2 weights. The final1,106-test run includes this correction and passes.

## Explicit residual historical surfaces

The current default configuration retains12 named historical exclusions, unchanged by this M6 implementation checkpoint. A green selected/default run is not an unqualified full-repository migration pass.

| Group | Retained excluded files | Boundary |
| --- | --- | --- |
| Historical M4 experiments | `tests/ai/hard/p6-stoppable-generation.test.ts`, `p8-rescue-cap.test.ts` | Standard snapshots, old catalogue and measured output/performance pins remain historical; active Phasing controls cover stop/cap/telemetry and completion. |
| Historical M5 harnesses | `tests/lab/suites.test.ts`, `exam.test.ts`, `reference.test.ts`, `analyze.test.ts`, `profile.test.ts`, `turn-allowance.test.ts` | Seven new Phasing suite files and active analyze/profile controls do not certify every old loader/reference/bench path. |
| Historical M6 evaluation consumers | `tests/ai/hard/eval-correct.test.ts`, `approach-tie.test.ts`, `tests/lab/eval-audit.test.ts`, `recall.test.ts` | Old catalogue/fuzz/corpus reads, numeric correction-arm pins and old mirror/measurement assumptions require separate authored ports before restoration. |

Additional legacy CLIs are not current M6 acceptance routes merely because they remain executable. `bench/run.ts` still loads historical corpora and prices the former economy correction; old economy/threat/kill/geometry oracles have unconditional historical loaders; recall always includes fixed historical fixtures; eval-audit has stale58/mirror assumptions and an overly broad mirror error boundary. The detailed source triage is `work/m6-legacy-consumers-review.md`. They were not invoked, their old evidence remains preserved, and no claim of their full Phasing correctness follows. Inv19's static projection limitation is also recorded there; any future nonzero utility coefficient needs a separately justified semantic port.

## Repository-wide test state

Added 2026-09-19 after the Codex lane stopped. Every number here was re-measured on this working tree, not copied from the evidence bundle.

`m6-broad-regression-2` is a **selected** run: `vitest run tests/ai/hard <15 named lab files>`. The repository default, plain `npx vitest run` with the standard quarantine applied, selects **187 files / 2,605 tests**, and it does not pass:

| Default `npx vitest run` | Count |
| --- | ---: |
| Test files selected | 187 |
| Tests | 2,605 |
| Tests passed | 2,562 |
| Tests failed | **43** |
| Tests skipped/todo | 0 |
| `numTotalTestSuites` (describe blocks) | 613 |
| `numFailedTestSuites` | **16** |

Re-measuring the 80 files of the selected set inside that same full run reproduces Codex's row exactly: 1,106 tests, 0 failed. All 43 failures are in the other 107 files (1,499 tests), which the M6 lane never ran. They divide as follows.

| File | Failed | Status |
| --- | ---: | --- |
| `tests/lab/ablate.test.ts` | 13 | **New in M6.** Passes at base `66473c75`, fails here. |
| `tests/lab/analyze-work-sweep.test.ts` | 3 | **New in M6.** Passes at base `66473c75`, fails here. |
| `tests/lab/engine-seat.test.ts` | 24 | Pre-existing at base: `PackError: pack: ruleset "standard" is not "phasing"`. |
| `tests/server/match-policy.test.ts` | 1 | Pre-existing at base: `Engine fallback: pack-error`, same cause. |
| `tests/server/history.test.ts` | 1 | Pre-existing at base. |
| `tests/lab/gate1.test.ts` | 1 | Load-induced flake only: passes in isolation here and at base. |

Baseline established by running those six files in the clean `66473c75` checkout (`work/deevgames-phasing-m5`): 26 failed there, in exactly the three pre-existing files. So M6 introduces **16 new failures across two default-selected files**, and inherits 26.

Both new-failure files are unported eval consumers of the same kind that `m6-legacy-consumers-review.md` triaged and quarantined (`eval-correct`, `approach-tie`, `eval-audit`, `recall`) — but neither `ablate` nor `analyze/work-sweep` appears anywhere in that review, and neither is in `vitest.config.ts`'s quarantine list, so both stayed in the default selection and silently regressed. Two distinct causes:

1. **The ablation harness can no longer build an evaluator.** `lab/hard-ai/ablate/**` constructs arm weight vectors that do not carry the new `featureSchema`/`version` fields, so M6's new `assertCurrentWeights` (`src/ai/hard/eval/weights.ts:106`) throws `Phasing weight schema/version mismatch` from the `Evaluator` constructor. This is a real unported consumer, not a stale numeric pin.
2. **The ablation arms have nothing left to ablate.** The safety weight-group arms assert membership and distinct per-arm hashes (`expected 15 to be 13`, `expected 21 to be 19`, arm hash equal to the champion hash). With 57 of 62 coefficients pinned to zero, removing a zero weight changes no configuration, so arms collapse onto the champion. Plus one plain label pin: `expected 'phasing-accounting-bootstrap-v1' to be 'default-v1'`.

**These failures have deliberately not been fixed here.** Cause 1 needs a decided schema/version contract for arm vectors; cause 2 needs a decision about what an ablation instrument means under a sparse bootstrap. Regenerating the frozen champion/arm hashes to make them green would move pins to fit the code, which this milestone forbids. Either port both consumers properly, or add them to the quarantine list with a written reason, as the other four were. Until then the default suite is red and must be reported as red.

### Quarantine in `vitest.config.ts`

Twelve files remain excluded from the default selection unless `MUJU_RUN_QUARANTINE=1`. The config states the reason for each; in brief:

| File | Reason recorded |
| --- | --- |
| `tests/ai/hard/p6-stoppable-generation.test.ts` | Historical Standard experiment; active Phasing tests cover stop/cap/telemetry. |
| `tests/ai/hard/p8-rescue-cap.test.ts` | Same historical M4 group. |
| `tests/lab/suites.test.ts` | M5 harness; `suites/run` over the engine (failed to collect). |
| `tests/lab/exam.test.ts` | M5 harness over `search/root` + `pvs` (23 passing). |
| `tests/lab/reference.test.ts` | M5 harness; engine reference determinism (21 passing). |
| `tests/lab/analyze.test.ts` | M5 harness; analyze/replay over `search/root` (10 passing). |
| `tests/lab/profile.test.ts` | M5 harness; `bench/profile` over the whole stack (7 passing). |
| `tests/lab/turn-allowance.test.ts` | M5 harness; `search/pvs` turn allowance (21 passing). |
| `tests/ai/hard/eval-correct.test.ts` | M6 evaluation consumer; `eval/evaluate` + features + invariants (15 passing). |
| `tests/ai/hard/approach-tie.test.ts` | M6 consumer; `tables/approach` tie-break. |
| `tests/lab/eval-audit.test.ts` | M6 consumer; `audit/eval-audit` over eval weights (3 passing). |
| `tests/lab/recall.test.ts` | M6 consumer; recall over eval weights (5 passing). |

## Why the two floors failed

This is worth stating plainly, because the measurement row alone reads as a bookkeeping result and it is not one.

The bootstrap vector has exactly five nonzero entries: Material 0 = 100 (informational), BankLiquid 2 = 100, BankExcess 3 = 100, EconDelta 23 = 100 and PendingValue 58 = 1. The twenty invariant slots 38–57 are zero. DisruptPressure 60 is zero. ArrivalThreat 59, Hanging 28 and HangingBuy 29 are zero.

So the invariants family (5/18 earned, minimum 17) and the summon-disruption family (5/14 earned, minimum 13) failed because **the evaluation carries no term that prices either signal**. The invariant and disruption features are computed and diagnostically available; nothing in the score consults them, so the search has no reason to prefer a position that respects an invariant or that denies an enemy summon. The five earned units in each family are cases where the economic terms happened to point the same way.

That is a statement about engine strength, not about accounting. The failing predicates are real behavioural misses: **the engine does not yet reliably disrupt enemy summons, and does not yet avoid its own invariant violations.** Closing the gap is evaluation and generator work — non-zero, justified coefficients for the invariant and disruption terms, and a generator that offers the moves those terms would reward — obtained through the corpus → fit → validation sequence below. It is not a measurement defect, a case-classification problem or anything that a correction to the ledger would move.

Three things this therefore does not license, restated because the floors were frozen before the measurement: no coefficient may be chosen from these misses, no floor may be lowered, and no case may be reclassified or dropped. The failure stands as recorded.

## What remains for full M6

Five blockers, from the read-only continuation review (`m6-dev-continuation.md`, packaged with the evidence). None has been started.

1. **Freeze a development-data allocation and sampling protocol.** Plan §4e gives the sequence but no corpus size; the historical DESIGN §5.15 / M20 figures (fixed 25000 work, 20,000 games, 20 Texel iterations) are not accepted by the current corpus CLI, and M18's 400 games / 3 iterations is an instrument check, not a tune. A convenient small run must not be substituted silently.
2. **Resolve the diversity ceiling first.** `ladder/openings/split.ts` freezes 48 P1 dev openings; with handicaps 0 and 3 that is 96 opening×handicap cells, and `pairing.ts` reuses the same position and seed for both orientations while Hard ignores seeds. Identical-weight self-play therefore yields at most 96 distinct trajectories. Reusing seeds or `--allow-opening-reuse` adds none. 20,000 games is far out of reach without a new diversity-generating producer and a dated allocation amendment.
3. **Bind candidate weights into real ladder workers.** `ladder/engines.ts` resolves fixed `hard@<profile>` labels and there is no candidate weight-file/hash CLI, so a validation command does not exist yet. Needs immutable per-arm weight paths plus expected hashes, schema/pin validation before workers start, and those hashes carried into resolved config, game/replay identity and resume comparisons.
4. **Freeze the tunable parameter domain before fitting.** `freeParams()` currently offers 75 of 80 parameters. The bootstrap pins 57 coefficients at zero and reserves some overlapping features for a separately preregistered residual model. Enumerate which terms are eligible, which stay zero, and why; encode that in the fitting manifest and guard. Keep 2 = 100, 3 = 100, 58 = 1 and fire_1 = 300. The domain must not be chosen from the M5 misses.
5. **Freeze validation criteria and allocation before any dev outcome.** M6's exit condition ("val row positive; suites ≥ floor") defines no val rung, pair cap, uncertainty criterion or stopping rule. M20's protocol and M7's sealed gate are different protocols and neither may be substituted. A concrete pre-outcome val row, comparator, allocation, stopping rule, failure criteria and selection rule must be written first.

Then, in order: dev-only self-play corpus on **DEV openings only** → Texel fit on that corpus → validation on **VAL only** → re-pin the selected weights, hash and engine identity → re-run the unchanged frozen 225-case suite against the unchanged floors. Only a candidate that clears the floors as written completes M6.

## Outstanding acceptance and DAG disposition

The measured accounting bootstrap has failed the invariant and disruption floors. Full M6 still requires a reviewed development-only data protocol, corpus/fit/validation and a selected frozen candidate meeting the unchanged floors. The ladder currently has no explicit hash-bound fitted-weight arm, and the finite existing development allocation must not be misrepresented as thousands of independent self-play games by reusing deterministic seeds. The separately recorded continuation review identifies these remaining tasks. M7 correctness/responsiveness/sealed gates and M8 cutover remain blocked; no tuning to the M5 answers is permitted.

Source work affects Hard evaluation, economy/tactical diagnostics, purchase ordering, book/schema compatibility, lab data boundaries and their tests. Canonical game rules, content catalogue, UI/worker release guards, difficulty presets, server/database state, Academy evidence and deployments were not changed by these lanes. The content DAG's downstream strength and release checks remain separate pending work; no deployment, new release routing, sealed acceptance, tuned selection, browser/worker acceptance, LLM-versus-Phasing match or migration cutover is established by this checkpoint.

Supporting reviewer ledgers: `m6-feature-handoff.md`, `m6-invariants-handoff.md`, `m6-tune-source-guards-handoff.md`, `m6-economy-peer-review.md`, `m6-pending-evaluator-source-review.md`, `m6-legacy-consumers-review.md`, and the approved contract. Earlier hash inventories are checkpoints, not replacements for the final coordinator verification manifests.

Every `work/…` artifact named anywhere in this document is now packaged in the repository at `docs/changes/m6-evaluation-2026-09-19/` (65 files, 4.2 MB): the run directories, drivers, review ledgers, `original-file-sha256.json` recording each original's bytes and SHA256, and `evidence-sha256.json` binding the packaged copies. Files over 1 MB are stored gzipped, losslessly, with the original hash preserved in `original-file-sha256.json`. Independently re-checked on this tree: the frozen bootstrap weights hash is `0ae24a95` computed from `DEFAULT_WEIGHTS` in source; `m6-bootstrap-freeze-2/weights.json` is SHA256 `e8e1cc7d…`; `m6-independent-acceptance-1.json` is SHA256 `31e89b82…`; `m6-suite-measure-1/result.json` records `valid: true`, `floorPass: false` with the six family rows as tabulated above.

## Independent acceptance limits and retained diagnostics

The44-root generator row uses the same frozen pre-M6 authored domain,50,000 generation work and25,000 production search work. It is a legality/state/undo test, not exhaustive move enumeration, a strength row or a phone responsiveness measurement. Forced-offer overflow is recorded on five roots (129,131,30,121,279 offer events), with zero proof cutoffs; these are bounded generation omissions, not counts of unique missing turns. All reported accepted macros and searches were independently replayed.

The first accounting driver stopped on case11 solely because Node strict equality distinguished numeric0 from-0 in the viewpoint identity. Its exact driver and report are preserved in `m6-bootstrap-freeze-1`. The second driver uses numeric equality for expected score and opposite-view score; production code, ledger arithmetic and weights are unchanged. The reviewed18-case repeat passes. Failed first type/focused diagnostics and the later1102-pass/4-fail historical lazy-test run remain in the evidence bundle, alongside the semantic test-port review.

## Addendum, 2026-09-19 — independent reviews of M4 and M5 change the reading of the two floor failures

Written by Claude after Codex's quota ended, from two independent read-only reviews (M4 search port `5d317407`, M5
suites `66473c75`). The measurement above stays recorded exactly as measured: valid, floors **not** passed. What changes
is what those two misses mean. The "Why the two floors failed" section above says the engine does not yet reliably
disrupt enemy summons or avoid its own invariant violations; the reviews show that reading is not supported by these
particular cases:

- **Summon disruption 5/14.** All nine misses (M5-SD-01/02/03/04/06/07/09/18 and one more) are roots where the mover has
  a legal, immediate, canonically verified home-occupation WIN. Each case uses `terminalPolicy: 'predicate-only'` with an
  accept predicate whose first conjunct is `game-phase == 'playing'`, so **winning the game scores zero**. The engine
  returned `source: 'mate'` at 0 search nodes on every one. On the roots without a mate-in-1 the engine disrupts and
  scores. This is a suite-authoring defect: the answer marked correct (force a 3–5 crystal refund) is strictly worse under
  the real rules than the answer marked wrong (end the game). Four tactics roots carry the same free win and passed only
  because their predicate does not require `playing`.
- **Invariants 5/18.** All 18 non-structural pairs use `primaryMetric = 'eval-gap'`, i.e. they score the STATIC
  evaluation, not play. Thirteen pairs differ only in geometry with identical material and banks, and the measured weight
  vector (`phasing-accounting-bootstrap-v1`) has every invariant slot (38–57), DrawPressure and the geometry features at
  exactly zero — documented as such 29 minutes before the floors were declared. An eval gap of exactly 0 on those pairs is
  arithmetically forced. The searched diagnostic already separates several of them correctly (inv3 +500, inv4 +500,
  inv16 +900, inv19 +300, inv20 +400) and shows real disagreement on inv12 (−100) and inv13 (−400).

Consequences. (1) The v1 floors for these two families are not fit to gate a release; they must be superseded by a NEW
manifest and floor version (v2) — never by editing `fixtures/v1`, lowering a floor, or reclassifying a v1 case — with an
authoring-time veto on roots that have an immediate canonical win, an intruder-survival requirement for disruption, a
play-based metric for geometric invariant pairs, and a floor contract bound to a commit that precedes the run. Because v1
outcomes have now been seen, v2 floors must come from a rule that does not depend on outcomes (same allowed-miss count per
family as v1). (2) One genuine engine strength defect WAS found by the M4 review, unrelated to these suites: HOME_RACE
commitments keep their Standard status (FORCED, tactical, never pruned, top-ordered) although under Phasing they are slow
delayed purchases; demoting them lets the same 120k work reach depth 2–3 instead of 1. (3) The default test suite is red
on this commit for the reasons in "Repository-wide test state"; the two unported eval consumers and the Standard-only
engine-seat tests are follow-up work, not masked.
