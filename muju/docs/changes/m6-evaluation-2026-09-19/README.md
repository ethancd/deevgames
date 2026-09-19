# Phasing accounting bootstrap — 2026-09-19

This change prepares and verifies the M6 accounting bootstrap above M5 `66473c75`. It does **not** complete the corpus/fit/validation milestone, the migration or a release. The frozen225-case measurement is valid and fails two performance floors. The full behavior and limits are in [M6-STATUS](../../hard-ai/phasing/M6-STATUS.md); the model was declared in [the pre-outcome contract](../../hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md).

## Verification

| Check | Result |
| --- | --- |
| Final selected regression |1,106 passed,0 failed/skipped;80 files; source drift0 (`m6-broad-regression-2`). Twelve explicitly named historical files remain excluded; this is not a full-repository acceptance claim. |
| Repository default suite | **Fails.** `npx vitest run` selects 187 files / 2,605 tests: 2,562 passed, 43 failed, 0 skipped; `numFailedTestSuites` 16. The 80 selected files above reproduce 1,106 / 0 failed inside that run; all 43 failures are in the other 107 files, which the M6 lane never ran. 26 are pre-existing at base `66473c75` (`engine-seat` 24, `server/match-policy` 1, `server/history` 1), 1 is a load flake (`lab/gate1`, passes in isolation), and **16 are new in M6**: `lab/ablate.test.ts` 13 and `lab/analyze-work-sweep.test.ts` 3, both unported eval consumers left in the default selection. Measured 2026-09-19 after the Codex lane stopped; see M6-STATUS "Repository-wide test state". |
| Types |All six configurations passed (`m6-static-checks-1`, `m6-final-types-1`). |
| Dependencies/content graph |46 Hard files,0 violations;27-node49-edge graph valid. Archived Academy media is separately unavailable. |
| Production package |`npm run build` passed including WASM; no tracked WASM change or source drift; not deployed (`m6-build-1`). |
| Independent canonical replay |44 roots;3,339 complete generated macros/full unmakes;16,996 ordered state/action comparisons;44 production searches;4 fault controls;0 failures, proof cutoffs, fallbacks or drift. Full report SHA256 `31e89b82196c8673ee8400550a115f23a7849945f8a6e35477bee8155cf6d4f2`. |
| Accounting goldens |18/18 independent canonical receipt-ledger checks; exact sparse62-feature vector and18 catalogue material priors; same-state viewpoint sign and caller-state preservation (`m6-bootstrap-freeze-2`). |
| Frozen suite measurement |225/225 cases;126/149 earned;76/76 coverage passed; valid=true, floorPass=false. Tactics62/63, home28/28, economy20/20, fortify6/6 pass their frozen floors. Invariants5/18 (minimum17), disruption5/14 (minimum13) fail. |

The weights file SHA256 is `e8e1cc7d7e15d9c02d148651004dfd2fe716b98a8017e3ef031b94ed74816eb3`, internal weights hash `0ae24a95`. The suite manifest semantic SHA256 remains `df27339b4c2ad85821a00bc3a3dbb8ab5b6f9d151ee105177c894cf36a31be0f`; measured production engine identity is `06e907b23c209d35dc7ffd03cd55cffab77377c78876eb815aff82633dfdbcc7`. Correctness validity is separate from strategic acceptance. No failing strategic predicates were reclassified or dropped, and no coefficients or floors were fitted to their outcomes.

## Preserved diagnostics and scope

The first focused diagnostic was202 pass/20 fail; the second396/0/0. The first broad run was1,102/4/0, identifying old lazy-bound expectations; all seven lazy tests remain active under the declared full-evaluation contract. Initial type errors and the one later invalid-fixture literal error are preserved. The first accounting script distinguished0 from-0 using Node strict assertion; its exact driver/report are preserved, and the repeat changes only numeric-equality assertions. No production scoring changed in response.

Source hash maps, resolved identities, fixed budgets, exact inputs, before/after checks and original commands are retained. Reports over1MB are gzip-compressed losslessly; `original-file-sha256.json` records original bytes and hashes, and `evidence-sha256.json` binds the packaged files. Driver absolute paths record the original checkout and require intentional relocation to reproduce elsewhere. `m6-results-independent-review.md` records the separate read-only audit.

The44-root domain is bounded and not a strength or latency experiment. Forced-offer overflow is preserved on five roots (129,131,30,121,279 offer events); it is distinct from proof cutoffs and does not certify exhaustive generation. The pending exposure probe and ArrivalThreat table differential are conditional, not exhaustive tactical proofs. Canonical default upkeep's absolute-square tie rule breaks universal rotation/seat equivalence; the book keeps raw orientation and tests fixed-position viewpoint antisymmetry instead. No real corpus, self-play data, fitted candidate, val/sealed pool or book was generated/read by this checkpoint.

## Content DAG dispositions

The broad AI/strength plan and graph output are in `m6-static-checks-1`. Each selected downstream surface is addressed here; this table is scoped to M6, not a replacement for prior migration records.

| Node | Disposition and evidence |
| --- | --- |
| `wasm-tactics` |Verified unchanged: no source/ABI or tracked binary delta; normal production build recompiles it successfully. Prior M3 baseline evidence remains separate. |
| `ai-search` |Changed in the Hard subtree only; V2/worker/difficulty routing unchanged. Focused and broad tests, six type configurations and production build pass. |
| `hard-ai` |Changed: chronological accounting, pending diagnostics, identity cache, sparse bootstrap, unconditional evaluation, metering/veto, BK03 compatibility. Current canonical/undo/ledger evidence passes; full M6 acceptance remains blocked. |
| `ai-strength` |Changed measurement/identity/data guards; complete frozen suite row valid but two floors fail. Previous Gate1 A2 remains valid FAILED. Corpus/fit/val and M7 gates remain outstanding. |
| `mcp-tools` |Public rules/tool source unchanged; server and engine-seat type checks pass. Actual Phasing engine match remains blocked by M7, so no new runtime match claim. |
| `agent-guides` |Verified unchanged: no published tool/rule contract changed by this isolated evaluator checkpoint; no strength claim added. |
| `balance-analysis` |Verified unchanged: canonical catalogue/rules and current static calculation source unchanged; no strategic conclusions regenerated from this bootstrap. |
| `game-validation` |Prepared scoped verification passes, but full migration validation remains blocked by historical harness ports, baseline/strength/responsiveness and worker/e2e gates. |
| `static-package` |Muju production build prepared successfully; full site/release package remains blocked by migration release gates. |
| `server-package` |Server and engine-seat sources type-check; runtime source unchanged. Full release package and production-room validation remain blocked by the migration gates. |
| `static-deploy` |Blocked: publishing paused/no credentials in DAG and release gates unpassed; no deployment performed. |
| `server-deploy` |Blocked: release gates unpassed; no push/master merge or deployment performed. |
| `release-verification` |Blocked: no new deployment, failed Gate1 and M5 floors, no M6 selected candidate or M7/M8 acceptance. |

Canonical Standard deletion/save archival stays on the separate M8 branch. Existing rooms, saved state, historical results and Academy media are preserved. The verified checkpoint can be reviewed and continued independently of the unfinished release.
