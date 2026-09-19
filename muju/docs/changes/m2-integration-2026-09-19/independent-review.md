# M2 integration independent review — 2026-09-19

Reviewed the uncommitted merge in
`/Users/ashkie/Documents/Codex/2026-09-18/wba/work/deevgames-m2-integration`:

- HEAD: `9361143bfd8e0496c61003b3826ac8e2d4f1a57a`
- MERGE_HEAD: `ecf37daf9b4e82b0f17630c45bd7832a77153b3b`
- Merge base: `2922375ef8c1f828f4bc5c1a411d1e19cdc2b6fd`

**Result:** one integration-specific test coverage regression found and corrected
with coordinator authorization. No other actionable integration regression found
within the scoped static review. The test split requires the coordinator's
planned execution checks; this reviewer ran no engine, tests, build, or broad
suite and read no opening corpus or full Gate1 outcome artifacts.

## Finding and correction

**P2 — the inherited whole-file quarantine masked newly integrated Phasing
coverage.** `muju/vitest.config.ts:92-93` excludes `tests/lab/analyze.test.ts` and
`tests/lab/profile.test.ts`; the exclusion is applied at line 109. Those entries
are appropriate for the legacy Standard search-dependent tests, but the other
parent had since added three Phasing reconstruction checks to the first file and
a Phasing P1 builder check to the second. A default integration test run would
silently omit those four checks despite their test bodies surviving the merge.

After the coordinator explicitly authorized the bounded correction, I moved:

| Original file | New active file | Preserved tests |
|---|---|---:|
| `muju/tests/lab/analyze.test.ts` | `muju/tests/lab/analyze-phasing.test.ts` | 3 |
| `muju/tests/lab/profile.test.ts` | `muju/tests/lab/profile-phasing.test.ts` | 1 |

The transferred test blocks, including comments, assertions, inputs and test
timeouts, are byte-for-byte copies. The analysis file retains the original
`passBot` helper, fixture path, loader/reconstruction and scripted-bot imports.
The profile file retains its `metal-v28-catalogue` side-effect import and
300,000 ms file timeout. Legacy files lose only these moved blocks, their now
unused imports, and an adjusted location comment. Their remaining tests and
quarantine remain intact. Neither new filename matches the 26 explicit
quarantine entries; both match the existing include pattern.

Preserved test identities:

1. `analyze: rules-bound reconstruction of a Phasing replay > rebuilds a real Phasing game, matches its meta, and segments one turn per seat turn`
2. `analyze: rules-bound reconstruction of a Phasing replay > REFUSES a Phasing replay whose recorded pending summons the rebuild does not reproduce`
3. `analyze: rules-bound reconstruction of a Phasing replay > reads the rule set off the record and refuses a revision it has not been taught`
4. `corpus builders > builds p1-dev positions at game turn 6 for a small opening set`

The analysis block retains 16 `expect` call sites and the profile block 11,
including looped assertions. `m2-integration-test-split.json` records the block
hashes and identities. Static `git diff --check` passed. No pass result for the
four moved tests is claimed here; execution belongs to the coordinator.

New file SHA-256:

- `analyze-phasing.test.ts`: `ccff43f3935df58dcc7ae1191a637279bbd12f9d15c483e483922b7a8a3a8a02`
- `profile-phasing.test.ts`: `b82cbc795097cca9de4335578e9c419bbffade4cb01ebbbf105431ff161981ba`

## Parent preservation and runtime overlap

Git tree/index metadata establishes that all **276 HEAD-only changed paths** and
all **47 MERGE_HEAD-only changed paths** were retained in the merge index with
their respective parent blobs. No unresolved index entries were present. This
comparison used object metadata; it did not open corpus contents. The sole path
changed by both parents since the merge base was
`muju/src/ai/hard/search/pvs.ts`.

The combined PVS implementation preserves both independent changes:

- Canonical parent's `wallFit?: boolean` context field and
  `s.cfg.searchFix?.iterFit ?? s.wallFit === true` fallback remain at lines
  280-293 and 953-959. `engine.ts` still resets `wallFit` before every search and
  enables it only for a wall allowance above the quick threshold. Explicit true
  or false `iterFit` continues to take precedence; fixed work does not arm it.
- M2 parent's `cappedProverCalls` stats field/default and lifetime-counter
  publication remain in `newSearchStats`, `chargeProver` and `countProver`
  (lines 370-401). The telemetry update does not alter work charging or the
  iteration-fit branch.

The HEAD-relative auto-merge diff added only M2 telemetry; the MERGE_HEAD-relative
diff added only the canonical wall-fit change. The coordinator subsequently
corrected a PVS telemetry comment and the M2 ledger. The PVS working-tree diff
contains comment lines only, with no executable change.

Runtime/config hashes were pinned before and after review for **52 files** under
`src`, `server`, `assembly`, engine-seat tools and the Vitest configuration. The
only runtime-file byte drift was the coordinator's deliberate PVS comment change:

| PVS snapshot | Git blob | SHA-256 |
|---|---|---|
| Initial combined runtime | `18c46c798689c11e5ad4f7d99887b302db10fc95` | `787409d3814784682b8a08f305c10d1b09f33911f527a9ef47e402c976695452` |
| After comment correction | `7f92f69be4a0c8a6a6df1bf7bcff5bccebf5b3ed` | `2655bff41fe56e75b134585bb2ad66da513f6ecc2c73af1f16c4dbbba1aa29ed` |

All other 51 pinned files, including the Vitest configuration, were unchanged
during this review. Evidence files:
`m2-integration-review-before-hashes.json`,
`m2-integration-review-after-hashes.json`, and
`m2-integration-review-preservation.json`.

## Guard and ordinary-oracle review

The Phasing public AI closure remains intact. `worker/handler.ts` rejects a
Phasing request before constructing an engine, including an explicit Hard request.
`GameScreen.tsx:249,257,293,308` disables both AI hooks and dispatch paths for
Phasing. `ModeSelect.tsx:95-97,265,281` permits Phasing only in human Pass & Play
and blocks loading a Phasing save into AI mode. The replica's `pack` retains its
opposite low-level representation boundary: `core/state.ts:591-596` requires an
explicit Phasing state and rejects implicit/explicit Standard. No review edit
relaxed any of these gates.

Ordinary Prepare enumeration remains complete independently of V2 heuristic
pruning: `src/ai/moves.ts:50-57` enumerates every affordable tier-1 purchase over
the canonical spawn squares, then asks canonical legality. The shared ordinary
phase list adds actual-unit promotions and the phase end. Strategic pruning
remains in planner code. The server's separate `observation.ts:76-84` explicitly
constructs its rules inventory rather than consuming a strategic candidate list,
then applies legality and pagination at lines 97-115. The unquarantined
`tests/ai/prepare-legality.test.ts` and
`tests/server/prepare-legality.test.ts` retain exhaustive both-rules/both-seat
coverage, risky-but-legal purchase retention and exact MCP page totals. This is
the ordinary Prepare claim, not an assertion that the displayed upkeep helper
enumerates every keep-set.

## T6 policy and authenticated binding preservation

The policy/server/runner files match the canonical parent; M2 did not rewrite
them. Focused source inspection retained these load-bearing boundaries:

- `matchPolicy.ts` permits hosted analysis only for centaur and forbids hosted
  rules-oracle assistance for bare. Analysis/headline/briefing policy checks occur
  before cached results are read (`analysis/index.ts:238-254,316-319`). MCP wait
  rejects a restricted briefing before waiting (`mcp.ts:128`).
- HTTP scope is allowlisted before routes/static serving (`http.ts:40-46`).
  `matchScope.ts` binds one room and immutable policy, filters tool discovery and
  backend access, and does not expose create/join/restore as match capabilities.
  The stdio bridge discovers the same scope from health and uses the scoped MCP
  server (`stdio.ts:30-40`).
- Private snapshots conditionally expose `authenticatedPlayer` from the trusted
  seat argument (`rooms.ts:241-248`), with admitted/read seats derived through
  authentication; public snapshots omit it. Issued initialization checks this
  identity before `reserve()` (`engine-seat/config.ts:55-60`). Resume/search and
  acknowledged actions recheck it (`runner.ts:43-58,98-112`). Public long-poll
  responses trigger a new authenticated read rather than assuming they carry a
  private identity (`runner.ts:65-72`).
- The pinned room contract still compares policy, clock rule and explicit
  handicap, and rejects Phasing (`contract.ts:24-50`). No restore/mutation was
  introduced as a credential-validation shortcut.

This is preservation and targeted source review, not a new exhaustive security
audit or live-service test. In particular, T6's retained Standard-only admission
and M2's new Phasing-only replica currently provide **no common ruleset for a
real T6 Hard study**. Keeping the guard closed is intentional; the merged branch
does not become a runnable Hard seat merely by preserving its runner. The
coordinator was notified of this readiness limitation.

## Scope limits

AGENTS and CONTENT_DAG were read. No runtime or Vitest-config file was edited by
this reviewer; the four test files above were the only authorized repository
edits. The coordinator's M2 ledger corrections and comment drift were observed
separately from executable preservation. No commits were made.

This review does not establish M4, Gate0, Hard release/strength, M7 seat readiness
or M8 completion. It does not reinterpret inherited historical pass counts as a
fresh integrated-tree pass and does not infer full-suite success from a scoped
review. The coordinator owns final compilation/test evidence and integration
commit decisions.

## Saved integration execution: independent failure classification

After the coordinator's execution finished, I read
`work/m2-integration-verification/tests.json` and `tests-verification.json` and
traced each failed assertion to the relevant test/runner source. I did not rerun
tests or edit repository code during this follow-up.

The saved command ran from the integration checkout with `--maxWorkers=1`,
started at `2026-09-19T09:18:35.573Z`, finished at
`2026-09-19T09:23:08.673Z`, and exited **1**. The test JSON SHA-256 is
`aa1e25b996d6a794e3c0b2fb9371a81957d1ca3308b6620e1dc596246b732210`.
Its exact assertion totals are **728 tests: 703 passed, 25 failed, 0 pending,
0 todo**. It contains 58 file results: 56 passed and two failed. The reporter
also reports four failed *suites*, including nested describe accounting; this
is not four failed files. There are no nonempty file-level collection/error
messages in this artifact.

**All 25 observed failures are attributable to the documented Standard-only T6
versus Phasing-only replica incompatibility. No unrelated observed failure was
found.** The precise breakdown is:

| Group | Count | Failure mechanism |
|---|---:|---|
| `engine-seat.test.ts`: immediate fixture-result construction | 3 | `resultFor()` at line 18 calls `Replica.pack()` on the Standard state created by `fixture()` at line 23. `state.ts:595` rejects it before the verification or runner assertions. |
| `engine-seat.test.ts`: expected downstream exception replaced by early PackError | 6 | Tests expect stale revision, deliberate fallback, retry policy, acknowledgement room identity, pre-submit stale revision, or changed authenticated identity; their search stubs call the same `resultFor()` and fail before those paths. |
| `engine-seat.test.ts`: parameterized post-search contract checks | 14 | The generic rejection assertion at line 153 accepts the early PackError. The following `journal.pending?.expectedRevision` assertion at line 154 fails as `undefined` versus `1`, because search never produced a result and the runner never reached pending-journal creation. |
| `engine-seat.test.ts`: actual bounded Standard Hard search | 1 | The real `HardEngine.searchTurn()` returns `fallback: 'pack-error'`; line 274 expected no fallback. |
| `match-policy.test.ts`: actual Standard Hard turn over HTTP | 1 | The ordinary room is Standard (`store.create` at line 115). The real bounded search returns `pack-error`; `verifySeatTurn():13` rejects it before submission, matching the failure stack through `runSeat():88`. |
| **Total** | **25** | **24 lab engine-seat failures plus one HTTP engine-turn failure.** |

The three direct fixture failures are the whole-turn verifier test, the ordinary
long-poll/search/durable-submit/retry test, and the pinned 60-second contract and
recovery test (`engine-seat.test.ts:32,49,134`). The six replaced-exception
failures are at lines 77, 83, 163, 170, 176 and 202. All use the common failing
Standard fixture result helper; none produces a different error provenance.

The fourteen post-search mismatch variants are: room identity, absent policy,
policy version, tool tier, protocol, absent time control, untimed room, clock
delay, clock bank, absent handicap, changed handicap, absent clock, stopped
clock, and wrong running player. Their common code at lines 150-154 invokes
`resultFor(state)` inside the search stub. `runSeat()` catches/logs that search
exception at lines 82-85 and throws before its durable pending assignment at
line 96. Therefore the missing pending revision is a secondary effect of the
same PackError, not evidence that post-search validation deleted a saved batch.

The same saved artifact positively records:

- 519 active tests under `tests/ai/hard/` passed, including all 21 turn-pace tests.
- All four moved Phasing tests passed: three analysis-reconstruction checks and
  the one profile builder check. The quarantine masking finding is now closed
  with execution evidence on the integrated tree.
- All five real store/HTTP seat-binding tests, four policy-correction tests and
  six match-scope tests passed.
- The remaining 31 engine-seat tests and six match-policy tests passed.

These results support the narrow classification, but the 23 fixture-dependent
runner tests did **not** exercise their downstream assertions in this run.
Their earlier passing evidence is historical, and this failure classification
cannot replace their eventual restored integrated-tree coverage. The mismatch
must remain visible in the intermediate merge; changing Phasing/Standard guards,
weakening the verifier, or silently quarantining the failures would not establish
readiness. This follow-up adds no M4, Gate0, Hard release, T6 study, or M8
completion claim.
