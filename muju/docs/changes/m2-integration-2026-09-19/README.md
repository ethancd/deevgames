# M2 replica and support integration — 2026-09-19

This isolated merge combines the reviewed M2 replica at
`ecf37daf9b4e82b0f17630c45bd7832a77153b3b` with the support integration at
`9361143bfd8e0496c61003b3826ac8e2d4f1a57a` on
`codex/phasing-m2-integration`. It preserves both parents. The sole overlapping
runtime path, `search/pvs.ts`, retains both the timer changes and cap telemetry.
No conflict resolution or new executable runtime change was necessary.
One inherited extra EOF blank line in a test file was removed for whitespace
validation; test assertions are unchanged.

Independent review found the inherited whole-file Standard test quarantine
also hid four newer Phasing consumer tests. Their identical assertion blocks
now live in active `analyze-phasing.test.ts` and `profile-phasing.test.ts`.
Legacy tests retain their existing quarantine. The block hashes and review are
included. The M2 ledger now limits its order-invariance argument to MATE versus
non-MATE under the stated DFS assumptions, corrects the gate-only histogram,
and distinguishes saved full-suite evidence from a later affected-suite run.
The PVS telemetry comment was corrected consistently.

M2 acceptance is scoped to its replica contract: the stable committed-source
independent check passed 18 canonical/replica legal actions, 18 full-byte undo
checks, 56 ordered-state comparisons and 216 prover comparisons across six
caps. Historical bulk fuzz artifacts carry dirty-tree provenance and do not
retroactively become executions of this merge. Their review and the narrowed
MATE argument are retained separately. Witnesses, selective generation and
slot-indexed cache reuse remain M4 obligations.

## Validation and readiness

The shared heavy queue runs this merge's focused tests and all six TypeScript
projects. Logs, exit codes and before/after runtime hashes accompany this record.
The independent reviewer checked exact parent preservation and runtime guards. Execution finished with **703 passed, 25 failed, 0 skipped across 58 files**;
all 519 active Hard tests passed, including all 21 turn-pace tests, and the four
moved Phasing tests passed. Failures are 24 in `tests/lab/engine-seat.test.ts`
and one actual-HTTP engine turn in `tests/server/match-policy.test.ts`, caused
by the ruleset mismatch described below. They remain active and visible; no
new quarantine or weakening was introduced. Six type configurations and DAG
validation passed; runtime source hashes stayed stable. This is a reviewed
intermediate merge, not a green full integration or a release-ready tree.
The separate A2 Gate 1 run continues at fixed `32f83b88`, with no source edits,
outcome peeking, identity pooling or duplicated run.

T6 continues to enforce issued-seat binding and room-scoped analysis policy.
Its current runner accepts Standard; the M2 Hard packer accepts Phasing only.
Consequently an actual T6 Hard match is not runnable on this intermediate tree.
Opening those guards or calling this match-ready would be incorrect. The
shared legality oracle still exposes all ordinary Prepare purchases. T5's
canonical removal remains separate and M8-only.

## Content DAG dispositions

Plan: `python3 tools/muju-content-dag.py plan --kind ai --format json`.
The exact emitted closure is preserved in `dag-plan.json`.

| Node | Disposition and evidence |
| --- | --- |
| wasm-tactics | Verified unchanged by this integration: preserves ABI 7 parent implementation; app/lab types exercise host interfaces. No new WASM generation claim. |
| ai-search | Changed by integrating parent timer and M2 telemetry; source preservation and focused legal-oracle checks. Worker/UI Phasing guards remain closed. |
| hard-ai | Changed: M2 replica/order/prover port integrated; independent M2 evidence and active Hard tests. M4 generator/search still pending. |
| ai-strength | Blocked on M4–M7 and frozen gates. A2 baseline run remains separate and unpassed. |
| mcp-tools | Verified unchanged from support parent, with scoped server/match/MCP tests; no new runtime edits. |
| agent-guides | Verified unchanged from support parent; this intermediate replica merge introduces no public tool or rules instructions. |
| balance-analysis | Verified unchanged: no catalogue, canonical rules, static solver model or new strength claim. |
| game-validation | Changed: four previously hidden Phasing tests now active; focused tests and six type configurations recorded. Full release/browser gates still blocked. |
| static-package | Blocked on remaining engine and release gates; no release artifact built for this intermediate tree. |
| server-package | Blocked on remaining engine and release gates; no deployment image/persistence claim. |
| static-deploy | Blocked: no publication in scope, Pages publishing paused. |
| server-deploy | Blocked: no publication in scope; production room storage untouched. |
| release-verification | Changed: this evidence record; end-to-end release remains blocked. |

The Academy notice inherited from the support branch remains prepared and
unpublished. No paid narration or media was generated. No Gate 0/1/2/3, Hard
release, live latency measurement, M8 cutover or production deployment is claimed.
