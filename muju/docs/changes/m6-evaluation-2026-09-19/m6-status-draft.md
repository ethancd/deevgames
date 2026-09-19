# M6 accounting bootstrap — reviewer-facing status draft

Draft for coordinator evidence integration, 2026-09-19. Source is paused in `work/deevgames-phasing-m6`, branch `codex/phasing-m6`, current committed base `66473c7582eacbbad1f49f69c6b0b8789f6a1638` (M5 suites integrated above M4 `5d317407`). M6 source changes are uncommitted at this checkpoint. The approved pre-outcome contract is `muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md`.

The focused implementation check has passed. The first broad regression completed with four preserved lazy-test failures; its test-only semantic correction awaits verification. Final broader verification, the new M6 independent44-root replay row, bootstrap goldens and the first scored M5 measurement remain pending. This draft does not mark M6, the migration or a release complete. The sparse hand vector is an accounting reference, not a strength result or a selected tuned engine.

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

All execution was coordinator-scheduled through the shared queue with source/test hashes. This drafting lane executed no runtime command. Evidence should be linked/copied by root into the final change record without overwriting failed diagnostics.

| Evidence | Recorded status and scope |
| --- | --- |
| `work/m6-first-focused-1/tests.json` | `success:false`;202 passed,20 failed,0 pending/skipped. Seven failed files: eval, interfaces, invariants, phasing-book, phasing-bootstrap, phasing-invariants, purchase. JSON nested failed-suite counter20 is not seven failed files. |
| `work/m6-first-types-1/command.log` | Preserved initial type failures, including forecast event annotations, removed liquidity export, current book metadata declaration and fixture literal typing. |
| `work/m6-second-types-1/command.log` | Preserved remaining negative-test literal type failure; corrected without changing a runtime predicate. |
| `work/m6-third-types-1/verification.json` | Current `tsc -p lab/hard-ai/tsconfig.json --noEmit` passed, as reported by coordinator. |
| `work/m6-second-focused-1/tests.json` | `success:true`;396 passed,0 failed,0 pending/skipped,18 files. Coordinator reports source drift0. |
| `work/m6-broad-regression-1/tests.json` | `success:false`;1,102 passed,4 failed,0 pending/skipped out of1,106. All four failures are old finite-bound/lazy-exit/EVAL2-conditional expectations in `tests/ai/hard/lazy.test.ts`; source drift0. This failure remains preserved. |
| Other five type configurations, dependency check and DAG check | Coordinator owns final evidence integration; no unverified combined pass is asserted in this draft. |
| New M6 independent44-root replay, bootstrap goldens, scored M5 run | Pending; prior M4 results do not certify this evaluator. |

The396 focused passes comprise current M6 economy54, bootstrap24, book8, invariant14 and tuning guards19; ported eval25, interfaces21, invariants15, purchase25, perft33 and synthetic Texel30; and seven M5 implementation/adapter files totalling128. These tests establish their exercised implementation contracts, not M5 floor acceptance or engine strength.

The first failures prompted semantic ports after the original outputs were preserved. Review also found and corrected chronological released-anchor exposure, phantom paid attackers after refunds, necessarily released intruders, unhashed snapshot identity dependencies, missing forecast work accounting, partial-state book key aliasing and a stale-book timing hint. Tests were not skipped, numeric performance floors were not changed, and historical outcomes were not regenerated to fit the code. After the broad failure was preserved, `lazy.test.ts` was ported without production edits: it retains300 positions for both default and stretched weights, adds exact3× stage2 arithmetic, keeps300×12 window checks while requiring exact full-score equality, and requires exactly one EVAL1/EVAL2 charge and an actual stage2 call for every finite high/low/straddling window. Positive infinity remains the explicit no-finite-certificate sentinel, including zeroed stage2 weights. This test-only correction is paused pending root execution.

## Explicit residual historical surfaces

The current default configuration retains12 named historical exclusions, unchanged by this M6 implementation checkpoint. A green selected/default run is not an unqualified full-repository migration pass.

| Group | Retained excluded files | Boundary |
| --- | --- | --- |
| Historical M4 experiments | `tests/ai/hard/p6-stoppable-generation.test.ts`, `p8-rescue-cap.test.ts` | Standard snapshots, old catalogue and measured output/performance pins remain historical; active Phasing controls cover stop/cap/telemetry and completion. |
| Historical M5 harnesses | `tests/lab/suites.test.ts`, `exam.test.ts`, `reference.test.ts`, `analyze.test.ts`, `profile.test.ts`, `turn-allowance.test.ts` | Seven new Phasing suite files and active analyze/profile controls do not certify every old loader/reference/bench path. |
| Historical M6 evaluation consumers | `tests/ai/hard/eval-correct.test.ts`, `approach-tie.test.ts`, `tests/lab/eval-audit.test.ts`, `recall.test.ts` | Old catalogue/fuzz/corpus reads, numeric correction-arm pins and old mirror/measurement assumptions require separate authored ports before restoration. |

Additional legacy CLIs are not current M6 acceptance routes merely because they remain executable. `bench/run.ts` still loads historical corpora and prices the former economy correction; old economy/threat/kill/geometry oracles have unconditional historical loaders; recall always includes fixed historical fixtures; eval-audit has stale58/mirror assumptions and an overly broad mirror error boundary. The detailed source triage is `work/m6-legacy-consumers-review.md`. They were not invoked, their old evidence remains preserved, and no claim of their full Phasing correctness follows. Inv19's static projection limitation is also recorded there; any future nonzero utility coefficient needs a separately justified semantic port.

## Outstanding acceptance and DAG disposition

Root owns final evidence integration, source hashes/commit identity and the implementation milestone decision. Before calling the bootstrap measured, finish the active broad/type/dependency/DAG checks, independent current44-root verification, exact vector/config/source freeze and current synthetic goldens, then run the preregistered M5 measurement without changing classifications or floors in response. An accounting bootstrap may fail a strength floor; that is a recorded negative result, not a reason to fit coefficients to the gate.

Source work affects Hard evaluation, economy/tactical diagnostics, purchase ordering, book/schema compatibility, lab data boundaries and their tests. Canonical game rules, content catalogue, UI/worker release guards, difficulty presets, server/database state, Academy evidence and deployments were not changed by these lanes. The content DAG's downstream strength and release checks remain separate pending work; no deployment, new release routing, sealed acceptance, tuned selection, browser/worker acceptance, LLM-versus-Phasing match or migration cutover is authorized or implied by this draft.

Supporting reviewer ledgers: `work/m6-feature-handoff.md`, `work/m6-invariants-handoff.md`, `work/m6-tune-source-guards-handoff.md`, `work/m6-economy-peer-review.md`, `work/m6-pending-evaluator-source-review.md`, `work/m6-legacy-consumers-review.md`, and the approved contract. Earlier hash inventories are checkpoints, not replacements for the final coordinator verification manifests.
