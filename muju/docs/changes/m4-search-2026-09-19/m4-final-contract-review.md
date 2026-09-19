# M4 final read-only contract review — 2026-09-19

Scope: Copernicus's invariant correction and frozen-plan M4 closure in `work/deevgames-phasing-m4`, HEAD `0ecd0f9dbd71d7135d97e49cdd7e4cd971de5872` with uncommitted M4 implementation. Read AGENTS/CONTENT_DAG. No repository writes, experiments, test executions, opening/book corpus or sealed reads. Parent's final default broad run2 and hard types were still in progress when review began; this is source review, not a claim about their eventual result. No M5 authoring/floors or M6 evaluation changes reviewed for acceptance.

## Actionable source finding

**P1 — expiry between two adjacent polls can return an incomplete Act-only prefix.** `src/ai/hard/search/root.ts:434` samples `stoppedBeforeDeepening`; if that poll returns false and the immediately following `iterativeDeepening` initial poll (`search/pvs.ts:987–990`) returns true, no root iteration starts and `result.best` remains null. `root.ts:447–449` nevertheless refuses to salvage the still-valid pre-deepening candidate list because the earlier sample was false. It reaches `root.ts:466–474`, returning a singleton `phaseEndAction(state)` with the root's unchanged key. On a nonterminal Act root, the action is END_ACTION_PHASE: canonical transition leaves the same mover in Prepare, so this is not a complete macro and its reported end key is not recomputed. This is a deterministic two-poll control-flow scenario that can also arise from a real watchdog tick; it needs no generator failure or illegal input.

The existing already-expired P6 fixtures cover the earlier poll returning true; the new deadline retention case covers a completed first iteration. Neither specifically covers this gap. Correct narrowly by distinguishing that no iteration has started (and thus the original candidate list still exists), or by retaining an owned, canonical-verified complete pre-deepening fallback independent of later buffer reuse. Preserve truncated/abort/depth0 telemetry and verify the full macro and returned end key. A directed regression should make all generation/scan polls false, the `stoppedBeforeDeepening` poll false, and the next initial iterative-deepening poll true. Do not weaken the complete-turn assertion or merely label the prefix as a valid fallback. The broader `n===0` fallback at root.ts:357–368 also remains a phase-end escape path; no ordinary generator scenario reaching that branch was established here.

## Invariant correction: no finding

`tests/ai/hard/invariants.test.ts:166–227` replaces fabricated spent-attack flags with canonical transitions. `play` checks still-playing state, White as current actor, legality and an actual new state before each action. The chip damages a durable Metal III and closes the tier-I Water attack chain (`combat.ts:13–17`); a distinct unused Fire has a canonically executed lethal alternative against the adjacent Fire. That alternative does not mutate the original chipped state because `applyAction` is immutable. The no-fresh-body control establishes that every White unit has lost attack eligibility and explicitly rejects another chip.

Both bit cases are evaluated only after END_ACTION then END_PLACE, ending at the first Black Act/AP4 handoff with no pending upkeep. Incoming Black's damage is asserted zero; White's nonlethal attack flags survive the handoff, matching `turn.ts:startTurn/resetUnitActions` and the actual post-turn premises of `eval/invariants.ts:319–330`. The distinct unused attacker remains available to the current-horizon counterfactual kill table; the spent attacker does not. Quiet control has neither chip bit. All six exact bit8/bit9 true/false expectations are preserved; the correction strengthens witness legality and healing evidence rather than loosening expected values. It does not certify the unrelated M6 invariant feature re-derivation or the entire invariant suite.

## M4 criteria and claim boundaries

- The main Act→upkeep→Prepare→handoff grammar, owned masks, immediate-terminal stop, forced prefix fortification completion, current-vs-next-Act tables and slot mapping cache guard are implemented. `verifyTurn` checks actor/boundary as well as key, and numeric TT/proof access has the local full-Act domain guard. The new source finding above is a **root fallback escape** from that otherwise established generated-turn contract.
- Frozen §4b/d replica/prover/ABI7 work is inherited from reviewed M2/M3; M4 does not redo or replace its differential evidence. Canonical commitment/birth ordering intentionally supersedes the original plan's ascending-square arrival sentence. No order signature is demanded merely because rescue witness length can differ.
- §4c's proposed `(spawn-mask,bank)` purchase/promotion memo is deliberately absent: those are insufficient keys for reserve, threat, damage/flags and slot-sensitive inputs. This is a documented correctness-first deviation, not a completed optimization or evidence that branching/latency targets are met. Table-free upkeep ranking lives in `gen/upkeep.ts` rather than exposing/reusing the private Replica ranking API; legal subset scope is unchanged and bounded prefixes have square ties.
- Prepare plans remain selective. HOME_FORTIFY covers each eligible individual promotion as offered, not every possible multi-promotion/buy ordering. Ordinary purchase combinations do not inherit FORCED. Five independent acceptance roots have explicit forced overflow, with counts of omitted offers rather than unique legal lines; no complete forced-set or all-legal-line claim is justified. Tables are static-board horizon projections, not exact opponent response solvers.
- Tiny-tree TT tests establish values and legal optimal endpoints for their configured generated trees, including pending and partial-domain controls. They are not proof of arbitrary selective-search/PV identity under every representation or deadline. M2's semantic MATE argument and M4 selective-search reproducibility are separate claims.
- R5's authoritative denominator is allocated rung; the real prior failure and its fix are preserved. The current single-fixture pass is evidence for that case, not a mathematical upper bound on arbitrary atomic table/generation overshoot.
- Final trace output identity is covered; the historical stage-removal vocabulary/attribution is not re-authored. Historical P6/P8 experiments stay quarantined by reference with active Phasing structural replacements. M5/M6 quarantines, strength, responsiveness and release guards are not completed by M4 legality tests.

The current M4 status/change draft already states these principal evidence limits and marks final validation pending. Aside from the explicit root fallback window, this bounded final source scan identified no additional M4 implementation blocker. Parent's accepted 44-root evidence and targeted runs remain their executions; no new acceptance row was run here.

## Source pin and drift

The frozen plan SHA256 is `5ce09ddd3789da4eebe77c0353af666e44cd58cf1b043b0d565d79c4ec664370`. These source hashes were captured during review and rechecked before writing this report: no drift. Parent-owned live documentation is intentionally not pinned as immutable while its ledger is being completed.

| Repository path | SHA256 |
| --- | --- |
| `muju/tests/ai/hard/invariants.test.ts` | `f624b7f4cb19ebfad6d698c52e4dcb11876d650b89beccd7ce5c44e77f8a0ab2` |
| `muju/src/ai/hard/eval/invariants.ts` | `4ae63feb1b1581b8da186e9ae1b17ff9b0b497e34a8ce26aa431d799d9a38834` |
| `muju/src/game/turn.ts` | `49513b3f769a8295f002db6d2f9457b7e8eec6af0f4c0f24f1d295c08ff155ce` |
| `muju/src/game/combat.ts` | `86cafa7c2abdc6b17654f9365ef9b1caa6e94fbfcfa4ffedcb28e65e34c31b5f` |
| `muju/src/ai/simulate.ts` | `466b87836c63e6c3ff842bb8101a7558eb45fda24356d4c688838b90c4e2610f` |
| `muju/src/ai/hard/tables/context.ts` | `758771ddf3139ffa9697123919bbd2f4085707432cdfd3c2a34454d92a333ca4` |
| `muju/src/ai/hard/gen/purchase.ts` | `0539d2e0816dba24ad082730a4be38626eddbf48069516ef52956db09eb5cbdd` |
| `muju/src/ai/hard/gen/promote.ts` | `cd7a2a41ad8df9c36c90b12cbbb97abf3588d50a91f3489b295e5f10c6b9fb9c` |
| `muju/src/ai/hard/gen/generate.ts` | `eeab314180c609077a1f6bb26950fb2c91ff8de7958155b580171618e30e6446` |
| `muju/src/ai/hard/gen/upkeep.ts` | `961e7d02707ca64dc11938473c218aa801c006643c768b862d54061d6c85bc78` |
| `muju/src/ai/hard/search/pvs.ts` | `07c5d8ecdd7b97092c7120b810aae985b246805f28cda0ac16f08a74c8082bb8` |
| `muju/src/ai/hard/search/root.ts` | `8df7d1e2a113607af42700028316ee3e105c2cf3ad4994191218f4964f9f9052` |
| `muju/src/ai/hard/search/quiesce.ts` | `29656ac2294c22c87fd2501c3772f0a6530e51f59d87538c4df4725534d26c6f` |
| `muju/src/ai/hard/verify/replay.ts` | `b310d047a0ebbed91767b4099f8d030badb21330406d3c6aed4956e661949117` |

## Follow-up implementation, awaiting root verification

After default broad run2 and hard types2 completed successfully, parent released the relevant files. The correction now saves up to the existing eight ranked initial candidates using deep `copyTurn` (actions and owned keep masks), then verifies them lazily only if deepening has neither a completed nor partial answer. Verification uses an empty shared keep table so a missing owned mask cannot be supplied accidentally by later scratch data. A post-generation stop poll in `rootIteration` records an aborted, zero-child partial and avoids starting ordering/children after the watchdog. The root probe has an explicit original-generator-list selection for saved initial salvage, even when a live regeneration buffer exists. Normal completed/partial results still take precedence; saving copies spends no work or changes score/order, and the extra stop poll is always false in ordinary fixed-work runs.

Two new P6 Phasing regressions cover expiry at the first iterative-deepening poll after earlier false polls, and actual stopped regeneration after deliberately overwriting initial destination records and shared upkeep masks. The latter preserves a real generated candidate ranked beyond the stopped regeneration's output count, checks canonical replay and end key, requires the owned PAY_UPKEEP choice, zero searched children, abort/depth0/search source and accurate original-list exposure. Existing completed-depth preservation remains separately tested. Scoped diff check passed; this owner ran no test. Root owns final affected tests, repeated independent44-root row and broad verification.

Prepared hashes: root.ts `cfbcbf206bced4317bb07df6df6b98ec8fc7030adeb7ff7011cd8cbdd675d0e5`; pvs.ts `4a7ad3e61cc95bcccbcd8261f1b06b448f172f4282ff9c8f3733ee5f8dbe5dd6`; probe.ts `c0e76db7fa2f98700be38fde95fa090e433e4a2b531317858d24cd361e3ccf9d`; P6 Phasing test `f5ea4cf2218430931478a010f1c1f12682d6ee2fedc2707f615ec92cd13b5add`. This follow-up supersedes the source finding only upon successful final verification; the earlier source pins and failure reasoning remain historical.
