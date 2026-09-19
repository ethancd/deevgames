# M5 — Phasing suites and measurement harness

2026-09-19. Base M4 commit `5d31740791b8c3aa17797a29f9a5eac87a85b844`.
Implementation and canonical authoring are verified. Engine score acceptance is **not established**: no M5 production Hard measurement has run. This milestone does not clear the valid failed Gate1 baseline, Gate0, held-out strength or responsiveness. Production flags remain closed.

## Frozen inventory and floors

The new independent `lab/hard-ai/suites/phasing/fixtures/v1` bundle contains 225 cases / 245 logical members: 79 tactics, 20 invariant pairs, 56 home framings (28 rescue /28 invader), 30 economy, 30 summon-disruption and 10 home-fortify. It offers 149 decision/preference units plus 76 mandatory coverage/structural cases. Coverage cannot earn decision points or shrink denominators. Historical Standard fixtures remain unchanged.

The exact manifest semantic SHA-256 is `df27339b4c2ad85821a00bc3a3dbb8ab5b6f9d151ee105177c894cf36a31be0f`; its byte SHA-256 is `c7db0acc1b32b6fec72bdc87ae84eaedb95dc0ca7912b25ca860bdbed09dc024`. The adjacent floor-contract.json binds that manifest. Targets were declared before any M5 engine choice, pair evaluation or searched outcome; see M5-FLOOR-PREREGISTRATION-v1.md. Targets: tactics57/63, invariants17/18, home28/28, economy20/20, disruption13/14, fortify6/6, and all76 coverage. These are engineering judgments, not imported empirical Standard floors.

## Implementation and scope

Strict schemas bind each authored position to canonical rules/source, require legal construction prefixes and ordered semantic replay, and distinguish complete first-handoff macros from multi-turn coverage sequences. Positive and negative decision witnesses must independently satisfy their declared semantic objective. The 64 source branches for new families have full ordered endpoint checks. Current catalogue corrections and the two minimal paid-retention cash corrections are recorded in author ledgers; original inputs and their hashes remain preserved.

The production adapter owns its weights and positions, serializes process-global rules, explicitly disables the book, binds complete source/config/weights identity, and validates every chosen macro through canonical actions plus fresh packed endpoint. Primary pair preference uses the tested evaluator's full score from the declared side; fixed-work searched gaps are separate diagnostics. Partial pair failures retain completed operations and full JSON-safe search statistics. Illegal/partial/divergent/fallback/missing/mixed-identity or unresolved strategic proof is a veto. Structural15's deliberately capped UNKNOWN is a passing protocol control, not an accepted tactical answer.

Author/validate CLI refuses existing output directories, checks exact input bytes before parsing and after validation, and records provenance. The measurement CLI requires the exact manifest and separate preregistered contract, writes start identity before engine work, preserves all225 case results/errors and fixed denominators, and checks final input/source/engine drift. No corpus or opening data is read by these commands. Tests use labelled injected engines where necessary; those checks are not engine-strength evidence.

## Verification

- Final Hard/lab TypeScript check passed; zero source drift.
- All seven new active test files passed:128 tests,0 failed,0 skipped. This includes canonical authoring, endpoint parity, tamper/denominator/refusal checks, adapter contracts and floor aggregation.
- Actual author CLI and separately reopened validate CLI both passed225cases/245members, identical manifest/file identities, zero source drift.
- Bound floor contract validated against the final manifest.
- Hard dependency scan:44files,0 layering/nondeterminism/BigInt violations. DAG valid27nodes/49edges; declared external Academy media remains unavailable and unaffected here.
- Failed authoring/type/test diagnostics are retained with exact original-byte hashes in `docs/changes/m5-suites-2026-09-19/evidence-index.json`; compressed logs are evidence, not rewritten passing results.

The six historical M5 harness exclusions remain visible in vitest.config.ts. Seven new suites-phasing files run by default; M6 and old Standard-specific harnesses are not represented as migrated. Runtime engine sources are unchanged from M4 in this branch, so M4's full runtime checks were not wastefully repeated for a lab-only change.

## DAG and release disposition

`ai-strength`: changed and canonically verified; production suite scores and broader release gates remain pending. `game-validation`: scoped128tests/types passed; full release and browser gates remain blocked. Upstream canonical game/Hard runtime, UI/server/persistence/MCP/Academy: verified unchanged by this diff. Static/server package, deployment and live release verification: blocked by migration gates and outside publication scope; no deployment or master merge occurred.

## Next dependency

Integrate this branch with separately validated M6 schema/evaluation work, pin the bootstrap/goldens and run the complete bound measurement. Preserve any miss as a miss; do not lower floors, reclassify cases or tune to suite answers. A passing suite alone is not a release decision.
