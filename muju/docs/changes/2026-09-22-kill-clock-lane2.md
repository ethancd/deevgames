# Kill clock — lane 2 (`muju-phasing-2` -> `muju-phasing-3`, hard-ai + ai-strength)

Worktree `/Users/ashkie/src/deevgames-killclock`, branch `claude/muju-kill-clock`, seed commit
`62a5703f`. Owner decisions in `docs/changes/2026-09-22-kill-clock-SPEC.md` are final and not
reopened here. **Uncommitted at the time of writing; the coordinator commits.** This lane
touched only `muju/src/ai/hard/**`, `muju/tests/ai/hard/**`, `muju/tests/lab/**`,
`muju/lab/hard-ai/**`, `muju/lab/harness/**` (read-only — see "Decisions taken") and new dated
docs under `muju/docs/hard-ai/**`. No other lane's files were touched.

## The change, in this lane's scope

`muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK): the inactivity limit returns to
**ten** plies (same number as `muju-phasing-1`; `muju-phasing-2`'s twenty is now archived), but
the tenth kill-free ply is no longer an automatic draw — the higher **mined total**
(`minedTotal`, canonical `src/game/inactivity.ts`: every crystal a side's units ever took off
the board, Black's starting handicap folded in, never reduced by spending) wins; a tie draws.
`#` (home-checkmate) is withheld once the invader's next turn start is no longer guaranteed:
`c = progress ? 0 : clock + 1`, forbidden at `c >= limit - 1` (i.e. `c >= 9`).

`src/game/inactivity.ts`, `src/game/homeCheckmate.ts` and `src/game/types.ts` (the canonical
implementation this lane mirrors) were already seeded at commit `62a5703f` and were read, not
edited, per the task boundary.

## Node-by-node dispositions

### 10. hard-ai — Hard engine: packed rules replica, turn generator, prover, evaluation and search

**CHANGED.**

- `src/ai/hard/config.ts`: `PHASING_RULES_REVISION` `'muju-phasing-2'` -> `'muju-phasing-3'`,
  comment rewritten.
- `src/ai/hard/types.ts`: `Reason` gains `KILL_CLOCK: 7`; `INACTIVITY: 5` stays for archived
  `muju-phasing-1`/`-2` replays.
- `src/ai/hard/core/state.ts`:
  - `MAX_CLOCK`/`INACTIVITY_LIMIT` needed NO code change — both already re-export the
    canonical constant (10 as of the seed commit), confirmed by reading them; only the doc
    comments describing "20" were stale and are now rewritten.
  - `pack()`: `gained[]` is now `minedTotal(state, side)` (imported from
    `src/game/inactivity.ts`), not raw `resourcesGained` — `gained[1]` (Black) carries
    `p.handicap` folded in, matching the canonical verdict quantity exactly.
  - `unpack()`: `resourcesGained` is restored as `gained[0]` (White, exact) and
    `gained[1] - p.handicap` (Black) — the round trip is exact because the SAME `p.handicap`
    value is what `pack` added and `unpack` subtracts; verified by an explicit round-trip
    assertion in `tests/ai/hard/pack-roundtrip.test.ts`.
  - `check()`'s conservation invariant (`Σ reserve + Σ gained === Σ initialReserve`) now
    subtracts `p.handicap` back out of `gained[1]` before comparing — the handicap crystal
    never came off the board, so it is not part of the board-reserve conservation law.
  - `makeEndPlace()`: the clock terminal no longer sets `Result.DRAW` unconditionally. It now
    compares `p.gained[0]` vs `p.gained[1]` and resolves `WHITE_WIN`/`BLACK_WIN`/`DRAW`
    accordingly, with `Reason.KILL_CLOCK` in every case (matching canonical
    `resolveInactivityDraw`'s `verdict: 'mined-total'` path, which uses the same reason string
    on a tie).
  - `REASON_OF`/`REASON_NAME` maps: gained a `'kill-clock'` entry at value 7.
  - `provesHomeCheckmate()`: gained the `c >= 9` gate, computed packed (`p.progress`, `p.clock`,
    `INACTIVITY_LIMIT`, `p.drawRuleOn`) with no unpack, mirroring canonical
    `killClockForbidsCheckmate`'s arithmetic exactly, inserted before the `proverMode`
    dispatch (same position canonical's gate holds relative to `analyzeHomeDefense`).
- `src/ai/hard/core/zobrist.ts`: NO functional change. `CLOCK_VALUES = INACTIVITY_LIMIT + 1`
  auto-reverted to 11 the moment the canonical constant did; `CLOCK_EXTRA_VALUES` is
  `Math.max(0, 11 - 11) = 0` by the same append-only formula that absorbed the twenty-ply
  widening, so the clock plane is bit-identical to `muju-phasing-1` again by construction, not
  by a code change. Comments describing the (now archived) twenty-value plane were rewritten so
  they no longer read as live.
- `src/ai/hard/eval/features.ts`: `DrawPressure`'s sign changed from the material+bank lead
  (`leadCc`) to the mined-total lead (`p.gained[me] - p.gained[them]`) — the quantity the kill
  clock actually adjudicates. The `clock²` scale is untouched (still `INACTIVITY_LIMIT`-relative,
  so it silently re-absorbed the 20->10 move exactly as it absorbed 10->20). `leadCc` import
  removed (no longer used in this file). **`DEFAULT_WEIGHTS` untouched.**
- `src/ai/hard/eval/invariants.ts`: bit 16's comment rewritten to explain the meaning FLIP
  (sitting on a lead while the clock runs was wasted under an always-draws clock; it is now
  correct, heading toward a win) — see "Decisions taken" for why the underlying `leadCc`
  computation was deliberately left unchanged.
- Every mirror site the task asked me to check (`gen/turn.ts` — does not exist in this engine;
  `tactics/prover.ts`; `search/root.ts`; `search/pvs.ts` — does not exist as a separate file,
  scoring lives in `eval/evaluate.ts`) was read. `eval/evaluate.ts terminalScore` needed NO
  change: it already switches on `p.result` (`WHITE_WIN`/`BLACK_WIN`/`DRAW`/`ONGOING`) with no
  reason-specific branch, so a decided kill-clock position scores `±(WIN_CC − ply·MATE_PLY_CC)`
  automatically, the moment `makeEndPlace` stopped forcing `Result.DRAW`. `search/root.ts`'s
  `decidedFor()` only reads `p.result`, unaffected. `tactics/prover.ts` has no clock or
  `Result.DRAW` logic of its own to update.

Evidence: `npm run hard:perft -- --check` (both engines) 0 mismatches (see re-pin table);
`npx vitest run tests/ai/hard` 918/919 (one pre-existing, unrelated failure — see "Test
counts"); `tests/ai/hard/cross-engine-draw-clock.test.ts` (rewritten, see below) asserts PLAYING
at every one of plies 1..9 and DECIDED at exactly ply 10 in both engines, on a tie, on unequal
mined totals, with Black's handicap, and on the `c=8`/`c=9` checkmate boundary.

### 11. ai-strength — AI correctness veto and preregistered strength evidence

**CHANGED for replica parity and suite-authoring source; BLOCKED for every strength claim (as
the plan node itself requires — a rules change voids prior strength evidence, and this lane
was explicitly told not to produce new strength evidence).**

CHANGED — parity re-pinned first. `hard:perft --check` (canonical): `fixturesChecked 7,
fixturesMismatch 0, digestMismatches 0, mismatches 0, replicaAgreed true`, Standard triple
14959/1053/797, Phasing initial 14959/1850/797 (both frozen columns unchanged — they carry no
clock information). `--check --engine replica`: `fixturesChecked 7, fixturesMismatch 0,
digestMismatches 0, mismatches 0, replicaAgreed true`. Exactly ONE perft fixture moved —
`arrival-and-refund`, digest `dea9d2d6` (its A4/`muju-phasing-2` value) -> `a0ecef98`, counts
141/141/141 -> 121/121/121 — and it moved back to EXACTLY its pre-A4 (`muju-phasing-1`) frozen
value, because the fixture's own walker predicate (`DRAW_MARGIN_PLIES` relative to
`INACTIVITY_LIMIT`) now rejects clock >= 7 again instead of clock >= 17, so the deterministic
seeded walk (seed 5) finds the identical position it found before A4. Re-frozen only after
`--check --engine replica` showed 0 mismatches against the new numbers, same order as the
2026-09-19 precedent. No other fixture's digest or counts moved.

CHANGED — the differential fuzz-fault-injection harness's own duplicate `REASON_NAME` table
(`lab/hard-ai/fuzz/prover-surface.ts`) was missing `'kill-clock'` and printed `draw:7` instead
of `draw:kill-clock`, producing 8 real mismatches against canonical's `draw:kill-clock` string
on a clean walk (`runGatePreservation({seed:11, actions:2000, plies:200})`, 32 games) — a
genuine bug this lane found and fixed, not a rule-forced re-pin of frozen data. After the fix,
the same walk is 0 mismatches (`tests/lab/fuzz-fault-injection.test.ts` green; confirmed
directly with a standalone repro before and after).

CHANGED — suite-authoring source, forced and declared (see the re-pin table): `lab/hard-ai/
suites/phasing/canonical.ts` (`currentRulesVersion` keyed on limit AND verdict, `RULES_VERSIONS`
gains `'muju-phasing-3'`), `lab/hard-ai/suites/phasing/format.ts` (the state-fact `reason` zod
enum gains `'kill-clock'`), `lab/hard-ai/suites/phasing/build-invariants.ts` (case 16's
authored endpoint reason, `'inactivity'` -> `'kill-clock'` — the case's OUTCOME is unchanged,
a tie, since neither side mines in that fixture; only the string the live rule now produces
changed). All three are declared in a new `KILL_CLOCK_ARTIFACT_EDITS` allow-list in
`tests/lab/suites-phasing-manifest.test.ts`, which otherwise still fails loudly on any
UNDECLARED drift in the committed v2 bundle's pinned artifact set — same pattern
`tests/lab/phasing-evidence.test.ts`'s `A4_HARNESS_EDITS` already established for the harness.
`tests/lab/suites-phasing-v2-schema.test.ts`'s "authored rules revision is derived" describe
block re-pinned to `muju-phasing-3`/limit 10, with new cases for `currentRulesVersion(limit,
verdict)`'s two-argument form.

BLOCKED — no re-verification of suites whose "expected moves" depend on the OLD clock beyond
the one authored case above: this lane's scope was rules-correctness (SPEC §3), not
re-authoring the suite corpus. `tests/lab/suites-phasing-manifest.test.ts`'s `it.skip`'d load
test for the committed v2 bundle keeps its skip (now naming BOTH the 2026-09-22 rename and the
kill clock as reasons the bundle is superseded) — re-authoring and re-binding it is explicitly
the next campaign's job (SPEC §3, and this lane's own docs/hard-ai note).

BLOCKED — `lab/harness/runner.ts` / `lab/harness/types.ts` (`WinType`, `HARNESS_RULES_VERSION`,
`inactivityDraw`) are byte-pinned by `tests/lab/phasing-evidence.test.ts` for the
`p2-scripted-2026-09-19` reference campaign (`rulesVersion: 'muju-phasing-2'`) and were
deliberately NOT edited — see "Decisions taken". `npm run hard:types` fails on exactly this one
declared point (`lab/harness/runner.ts:182`, `VictoryReason` now includes `'kill-clock'` which
`WinType` does not).

BLOCKED — no ladder row, no `hard:suite` measurement, no opening regeneration: not run, per the
task's explicit instruction. `DEFAULT_WEIGHTS` and every weight file under `docs/hard-ai/
phasing/repair-2026-09-20/weights/` are untouched and are now measured against a terminal they
were not tuned for (recorded in `docs/hard-ai/PHASING-3-KILL-CLOCK-2026-09-22.md`).

Evidence: see "Test counts" and the re-pin table below.

## Re-pin table

Every value that moved, and why the rule forces it. Nothing in `lab/harness/results/**`,
`lab/results/**` (except the two transient gate-run outputs noted at the end), opening corpora
or sealed splits was touched.

| File | Old | New | Why the rule forces it |
|---|---|---|---|
| `src/ai/hard/config.ts` | `PHASING_RULES_REVISION = 'muju-phasing-2'` | `'muju-phasing-3'` | The build's own rules-revision label; SPEC §3 names it explicitly. |
| `src/ai/hard/types.ts` | `Reason` has no `KILL_CLOCK` | `KILL_CLOCK: 7` added | Canonical `VictoryReason` gained `'kill-clock'`; the packed `Reason` enum must be able to represent every reason `make` can now produce. |
| `src/ai/hard/core/state.ts` (`pack`) | `gained[i] = resourcesGained` | `gained[i] = minedTotal(state, side)` | SPEC §3: "Pack `gained[]` from `minedTotal`, not raw `resourcesGained`." Black's handicap must be included for the packed terminal to match canonical's verdict. |
| `src/ai/hard/core/state.ts` (`unpack`) | `resourcesGained: p.gained[i]` | White unchanged; Black `p.gained[1] - p.handicap` | Restores the exact pre-pack value; `resourcesGained` itself must never include the handicap (`minedTotal` adds it only at read time), or every downstream consumer of `state.players.black.resourcesGained` (UI, server, lab telemetry) would silently double-count it. |
| `src/ai/hard/core/state.ts` (`check`) | conservation compared `reserveTotal + gained[0] + gained[1]` to `initialTotal` | subtracts `p.handicap` from the sum first | The handicap crystal was never on the board; without the subtraction, `replica.check()` throws `conservation broken` on every handicapped game (the differential fuzzer's invariant surface exercises this). |
| `src/ai/hard/core/state.ts` (`makeEndPlace`) | clock terminal always `Result.DRAW`, `Reason.INACTIVITY` | compares `gained[]`, resolves `WHITE_WIN`/`BLACK_WIN`/`DRAW`, always `Reason.KILL_CLOCK` | SPEC §1/§3: the tenth kill-free ply is a decided position, not an automatic draw. |
| `src/ai/hard/core/state.ts` (`provesHomeCheckmate`) | no clock gate | `c >= limit - 1` forbids the mate | SPEC §1: `#` predicts a turn start the clock may pre-empt; canonical already gates `resolveHomeCheckmate` on `killClockForbidsCheckmate`, and the packed prover must not diverge. |
| `src/ai/hard/eval/features.ts` (`DrawPressure`) | signed by `leadCc` (material+bank) | signed by `gained[me]-gained[them]` (mined-total lead) | SPEC §3: "sign it by the side-to-move's mined-total lead." The quantity the feature is named after must be the quantity the clock actually adjudicates. |
| `lab/hard-ai/perft/fixtures.json` (`arrival-and-refund`) | digest `dea9d2d6`, 141/141/141 (`muju-phasing-2` value) | digest `a0ecef98`, 121/121/121 (its pre-A4, `muju-phasing-1`-era value) | The fixture's generator walks a random game to the first position matching a clock-relative predicate; the predicate's threshold moved with `INACTIVITY_LIMIT` (10 again), so the deterministic seeded walk finds the SAME earlier position it found before A4. Re-frozen only after canonical and replica agreed (`--check --engine replica`, 0 mismatches). |
| `lab/hard-ai/suites/phasing/canonical.ts` (`currentRulesVersion`, `RULES_VERSIONS`) | keyed on limit alone; two-entry union | keyed on `(limit, verdict)`; three-entry union incl. `'muju-phasing-3'` | SPEC §2: "Key the mapping on limit AND verdict... never guess." `muju-phasing-1` and `muju-phasing-3` are both ten-ply limits now, so the limit alone is no longer sufficient. |
| `lab/hard-ai/suites/phasing/format.ts` (`reason` zod enum) | no `'kill-clock'` | `'kill-clock'` added | An authored suite document whose endpoint assertion is the new reason must validate; the case 16 fixture change below is unrepresentable without it. |
| `lab/hard-ai/suites/phasing/build-invariants.ts` (case 16, `clock-discipline`) | endpoint asserts `reason: 'inactivity'` | asserts `reason: 'kill-clock'` | The fixture's own outcome (a TIE — neither side mines) is unchanged; only the string the live rule produces for that outcome changed. |
| `lab/hard-ai/fuzz/prover-surface.ts` (local `REASON_NAME`) | 7-entry array, no index 7 | 8-entry array, `'kill-clock'` at index 7 | A stale duplicate of `core/state.ts`'s (unexported, so hand-copied) `REASON_NAME`; without the entry, every kill-clock terminal the gate-preservation fuzzer reaches is misreported as `draw:7` and never matches canonical's `draw:kill-clock`, a false-positive divergence. |

### Tests re-pinned (not a re-pin of frozen evidence — ordinary test maintenance forced by the rule)

`tests/ai/hard/constants.test.ts`, `interfaces.test.ts` (Reason enum), `pack-roundtrip.test.ts`
(gained[]/handicap round trip, kill-clock reason in the victory-pack table),
`phasing-economy.test.ts` (reason string), `prover.test.ts` (checkmate gate boundary moved from
"one ply short of the limit" to `c=8`/`c=9`; the unproven-occupation case's hand-off outcome
is now a decisive Black win, not a tie, because Black's invading `END_ACTION` mines real
income — verified, not assumed), `terminal-order.test.ts` (same checkmate-boundary and
mined-income points, four sub-cases), `zobrist.test.ts` (the "appended clock keys" test
rewritten to assert the plane is exactly its frozen 11-key prefix again), `eval.test.ts`
(`DrawPressure`'s expected pressure value at `clock=9` re-derived from the formula, `90 -> 81`;
new assertions proving the sign now follows mined lead and not material lead), and the
from-scratch rewrite of `cross-engine-draw-clock.test.ts`. In `tests/lab`:
`openings-p1.test.ts` and `phasing-harness.test.ts` (`INACTIVITY_LIMIT`/`WARNING` re-pinned to
10/7; `phasing-harness.test.ts` additionally moved off the now-permanently-false
`record.inactivityDraw` to `record.winner`/`record.winType`, see "Decisions taken"),
`suites-phasing-v2-schema.test.ts` (the `currentRulesVersion` two-argument tests),
`suites-phasing-manifest.test.ts` (the new declared-edit allow-list).

## Decisions taken

1. **Did not edit `lab/harness/types.ts` or `lab/harness/runner.ts`.** Both are byte-pinned by
   `tests/lab/phasing-evidence.test.ts` for the `p2-scripted-2026-09-19` scripted reference
   campaign (`rulesVersion: 'muju-phasing-2'`); editing either — even the type-only addition of
   `'kill-clock'` to `WinType` — would change their SHA-256 and break that campaign's exact-match
   pin (`moved` must be `[]` for the CURRENT row). Per the task's explicit instruction ("say so
   and stop rather than move a pinned evidence file silently"), I stopped: `npm run hard:types`
   fails on exactly this one declared point, and `lab/harness/runner.ts:397`'s
   `inactivityDraw: state.victoryReason === 'inactivity'` is now permanently `false` for any
   live kill-clock game (`tests/lab/phasing-harness.test.ts` was rewritten to check
   `record.winner`/`record.winType` instead, which are accurate at runtime — TS type erasure
   means the mistyped `WinType` field still holds the correct string). Re-pinning the harness
   is the next measurement campaign's job.
2. **Left `eval/invariants.ts` bit 16's `leadCc` (material+bank) computation unchanged**,
   updating only its comment/wording. SPEC §3 explicitly differentiates "sign [DrawPressure] by
   the mined-total lead" (a computation instruction) from "update the doc comments and the
   invariant bit 16 wording" (a wording instruction); I read this distinction as deliberate and
   did not extend it into an unauthorized functional change, especially since invariant bits
   feed weighted features whose retuning is out of scope this campaign (`DEFAULT_WEIGHTS`
   frozen) and changing the computation would have forced a fixture re-pin
   (`tests/ai/hard/invariants.test.ts` inv16, `lab/hard-ai/suites/build-invariants.ts`) with no
   compensating benefit while weights stay at zero for this feature.
3. **Re-froze exactly one perft fixture**, after confirming canonical/replica agreement, in the
   same order the 2026-09-19 precedent used (`--freeze` from canonical, then `--check --engine
   replica` before trusting the new numbers).
4. **Extended, rather than weakened, the v2-bundle artifact-pin check** in
   `tests/lab/suites-phasing-manifest.test.ts` with a declared allow-list, mirroring
   `phasing-evidence.test.ts`'s existing `A4_HARNESS_EDITS` pattern, so an undeclared drift in
   any OTHER suite-authoring source still fails the test.
5. **Rewrote `cross-engine-draw-clock.test.ts` scoped to canonical + the Hard replica only**,
   dropping the old file's legacy-AIEngineV2 and server-observation assertions. Those two
   readers live in `src/ai/*` outside `hard/` and in `muju/server/**`, both outside this lane's
   ownership and edit rights (lane 1 and lane 3 respectively); keeping them would have made this
   lane's test depend on the OTHER lanes' concurrent, uncommitted work landing correctly, which
   is not something I can verify or guarantee from here. Added the task's required
   unequal-mined-totals differential test and an explicit `c=8`/`c=9` checkmate-gate parity
   test.
6. **Left `lab/hard-ai/analyze/replay.ts`'s `RULE_WIN_TYPES` unedited.** It is typed against the
   pinned `WinType` (same blocker as #1) and no currently-passing test exercises it against a
   live kill-clock replay; noted here rather than silently worked around.
7. **Did not touch `lab/harness/results/**`, `lab/results/**` (historical subdirectories),
   opening corpora or sealed splits.** The only `lab/results/**` paths that changed are
   `lab/results/hard-ai-verify/perft.json` (overwritten every `hard:perft --check` run — a
   transient status file, not archived evidence) and a freshly created
   `lab/results/hard-ai-verify-2026-09-22/{M1,M4,M5}.json` (this lane's own dated gate-run
   output, from running exactly the commands the task specified).

## Test counts (exact)

- `npx vitest run tests/ai/hard`: **918 passed / 919 total** (67 of 68 files green). The one
  failure, `calibrate-cold.test.ts` > "adopts a probe the work budget stopped, even below A16s
  work floor" (`probe.work` 25131–25132 vs an expected `< 12500`), is a wall-clock timing
  assertion. Confirmed pre-existing and unrelated: `git stash` back to the unmodified seed
  commit `62a5703f` reproduces the identical failure (25131) with none of this lane's changes
  applied. This worktree is shared with two other concurrently-working lanes (`git status`
  shows uncommitted changes across `src/game`, `src/components`, `server/`, `academy/` from
  lanes 1 and 3), consistent with the repo's own documented lesson that wall-clock tests are
  load-sensitive under concurrent lanes and are not a merge gate.
- `npx vitest run tests/lab`: **954 passed / 955 total, 1 skipped intentionally** (47 of 47
  files green — the one `it.skip` is the pre-existing, now-doubly-documented v2-bundle load
  test).
- `npm run hard:types`: **FAILS**, one error, `lab/harness/runner.ts(182,7)`: `Type
  'VictoryReason' is not assignable to type 'WinType | null'` — the single declared,
  deliberately-not-fixed consequence of the harness pin (Decision 1).
- `npm run hard:perft -- --check` (canonical and replica): **0 mismatches**, ~4 s wall time.
- `npm run hard:verify -- --gate M1` (perft + deps): **PASS**.
- `npm run hard:verify -- --gate M4` (`vitest run tests/ai/hard` + deps + two tsc passes):
  **FAIL** — the gate's own `vitest run tests/ai/hard` glob also matches sibling files
  (`tests/ai/hard-engine-fallback-elapsed.test.ts`, etc.), and its criterion requires
  `tscErrors === 0`, so it fails on the same declared `hard:types` blocker (Decision 1) plus
  the one pre-existing timing test.
- `npm run hard:verify -- --gate M5` (replica/fuzz): **FAIL** — the chain's first step
  (`vitest run tests/ai/hard`) exits non-zero (same pre-existing timing test, worse under this
  run's load — 3 suite-level failures reported vs 1 in isolation), so the chain short-circuits
  before its fuzz/perft steps run at all; those steps were separately confirmed clean via direct
  `hard:fuzz`/`hard:perft` invocation and via `tests/lab/fuzz-fault-injection.test.ts`.
- `npm run hard:verify -- --gate M2, M3, M12, M13, M14`: **NOT RUN.** These invoke
  `hard:ladder`, `hard:bench --eval` and `hard:recall` — strength/measurement commands the task
  explicitly told this lane not to run.
- `npm run hard:verify -- --gate M6..M11`: **NOT RUN**, over this lane's time budget (each
  invokes a several-minute oracle/fuzz pass); M1/M4/M5 were run as the representative
  rule-parity sample, following the same "out of lane and over budget" disposition the
  2026-09-19 precedent recorded for the full gate chain.
