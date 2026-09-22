# Kill clock — lane 4 (`muju-phasing-2` -> `muju-phasing-3`, test re-pins)

Worktree `/Users/ashkie/src/deevgames-killclock`, branch `claude/muju-kill-clock`, HEAD `b493ff08`
at the time of writing. This lane touched only the five test files named in the task, plus none of
`muju/src/`, `muju/server/`, `muju/academy/`, `muju/lab/harness/results/**`, `muju/lab/results/**`
or any other `results/` directory. Nothing was committed, pushed or deployed.

## Scope

`npx vitest run tests/lab/ablate.test.ts tests/lab/gate1.test.ts tests/lab/analyze-phasing.test.ts
tests/lab/openings-p1.test.ts tests/lab/phasing-harness.test.ts` on the seed commit reported 26
failures across the five files (`ablate` 7, `gate1` 16, `analyze-phasing` 1, `openings-p1` 1,
`phasing-harness` 1) — matching the coordinator's 27-failure count once `calibrate-cold.test.ts`'s
1 is added. Every failure traced back to `HARNESS_RULES_VERSION` (`lab/harness/types.ts`) having
moved to `'muju-phasing-3'`, which is folded into every ladder resolved-configuration hash
(`resolvedConfigHash`) and every opening's `gameplayDigest`.

Four of the five files were legitimate re-pins ((a)): frozen hashes or revision-string literals
that are supposed to move when the revision does, and did. The fifth, `gate1.test.ts`, is
something else ((b)) — not fixed; see below.

## Re-pin table

| File | Test(s) | Old value | New value | Reason |
|---|---|---|---|---|
| `tests/lab/ablate.test.ts` | `DESKTOP_WALL3000_HASH` (feeds 6 tests: "leaves the block ABSENT…", "gives every weight arm a hash…", "gives every keep arm…", "eval-no-safety-keep-anchor…", "leaves hard@desktop exactly as it was", plus the `not.toBe` checks in every other arm test) | `2c485153f22afad810639da52dc59a3e7e13c1187cc2cce9cb0bf9611e90abdd` (`muju-phasing-2`) | `65867011d62619f9436ce703ed7f37e7cc0caf6f1fccdf95fc8d4b0af4f1bbef` | The revision string is the first field of every resolved configuration (`ladder/identity.ts`), so `hard@desktop`'s hash moves with it — a documented, expected 5th move in a chain the file already tracks (Standard → M4-Phasing → M6-bootstrap → A4/`muju-phasing-2` → this). The old value was kept as a new named constant `DESKTOP_WALL3000_HASH_PHASING_2` and added to the "superseded" `not.toBe` list, following the file's own existing precedent for `_STANDARD`/`_PHASING_1`/`_PHASING_M4`/`_BOOTSTRAP_M6`. |
| `tests/lab/ablate.test.ts` | "registers search-iter-fit and leaves the champion where it is" | `6c8f9bb176bf1f365d6a4e6ca2e285c8117e3d5d7b73b6bb963d974cd562754e` | `9b05b441f7479e7fb7c3d57c6ea35d46c0cf2a41bef35f4b3b520b39da7748ef` | Same cause (`searchFix` arm's config hash also carries the revision string); old value recorded inline as a comment, matching the file's own history-in-comments convention for this arm. |
| `tests/lab/ablate.test.ts` | "registers search-reach-cache and leaves the champion where it is" | `6e3d2936d0564c13b331fe5435da15452e4ae4572636cdb898bfd045bd52973c` | `0d8777e2d8e73579e623023726ba056657f645a8f868c9d4b97456802d6bbc55` | Same cause and treatment as search-iter-fit, above. |
| `tests/lab/analyze-phasing.test.ts` | "rebuilds a real Phasing game, matches its meta, and segments one turn per seat turn" | `record.rulesVersion` pinned to `'muju-phasing-2'` | `'muju-phasing-3'` | The test's own purpose (its docstring: "the revision this tree plays and stamps") is to track the live revision a freshly-played game is stamped with, not to catch an unintended move — `HARNESS_RULES_VERSION` is what `playGame` stamps, and it is now `'muju-phasing-3'`. Docstring above the `describe` block updated to name all three revisions instead of just `muju-phasing-1`/`-2`. |
| `tests/lab/openings-p1.test.ts` | "hands every run a clock of 1, far below either revision limit, which is why the pinned bytes survive A4 and the kill clock" | `RULES_VERSION` pinned to `'muju-phasing-2'` | `'muju-phasing-3'` | `RULES_VERSION` here re-exports `HARNESS_RULES_VERSION`. The coordinator advanced that constant and declared the `p2-scripted-2026-09-19` reference campaign `current: false` in `tests/lab/phasing-evidence.test.ts`'s new `PHASING3_HARNESS_EDITS` list (confirmed by reading that file) — so the old comment claiming this constant "stays `muju-phasing-2` until that campaign is superseded" is itself now stale. Tracking the live constant is the test's actual intent (the surrounding assertions are about the clock/warning thresholds, which the test explicitly designed to hold under either revision). |
| `tests/lab/phasing-harness.test.ts` | "counts a complete turn only after Prepare; mines symmetrically and ties after INACTIVITY_LIMIT complete quiet turns" | `record.rulesVersion` pinned to `'muju-phasing-2'` (redundant with the adjacent `expect(record.rulesVersion).toBe(HARNESS_RULES_VERSION)` line, which already passed) | `'muju-phasing-3'` | Same as analyze-phasing: a literal pin of the live-stamped revision, already anticipated in the test's own docstring ("`muju-phasing-3` (owner decision 2026-09-22, the KILL CLOCK) moved it back to 10 ... This test moves with the LIVE limit either way"). The literal was simply left one edit behind that docstring. |

No identity-hash or revision-string pin in these four files needed a "does the underlying
weights/config differ" judgment call beyond what's stated above — every moved value is
attributable purely to the revision string, confirmed the same way the file's own prior moves were
(the `ablate.test.ts` doc comments already state this reasoning for the pattern; I did not
independently re-derive the hashes by hand, I read the actual `vitest` failure output for both the
expected/received values and applied them).

## (b) case: `tests/lab/gate1.test.ts` — not fixed, reported

All 16 failures share one root cause, and it is not a hash or revision-string pin: `RULES_VERSION`
(`lab/ai/gate1-sources.ts`, following `LADDER_RULES_VERSION` → `HARNESS_RULES_VERSION`) is now
`'muju-phasing-3'`, but the **real production Gate 1 machinery** — not just this test — was
deliberately built to refuse to run under a rules revision it has no adopted evidence for, the same
way it already refused to run under `muju-phasing-1`'s bands after A4:

- `BANDS_PATH` (`lab/harness/results/p2-scripted-2026-09-19/sanity-bands.json`) is frozen at
  `rulesVersion: 'muju-phasing-2'`. It is an archived `results/**` directory — out of this lane's
  edit rights, and re-freezing it honestly requires actually playing a new scripted reference under
  the kill clock, which is explicitly the deferred measurement campaign (SPEC §3: "mark
  `ai-strength` as deferred… Do NOT regenerate the opening corpus or run the ladder"; lane 2's
  report: "no ladder row, no `hard:suite` measurement… BLOCKED").
- `lab/ai/gate1-report.ts#summarize()` (production code) appends the error `Wrong rules identity in
  frozen bands: "muju-phasing-2", not "muju-phasing-3"` whenever `bands.rulesVersion !==
  RULES_VERSION`, which forces `report.gate1` to `'invalid'` for every one of the 16 tests
  regardless of what scenario each test otherwise constructs (a pass, a fail, a not-measured, a
  merge). This is the check working exactly as designed — it is the same mechanism that already
  refuses the superseded `muju-phasing-1` bands by name.
- `lab/ai/gate1.ts#adoptedProtocol()` (production code) independently throws when invoked directly:
  `Gate 1 requires adopted amendment A3 at rules revision muju-phasing-3; lab/ai/gate1-references.json
  says "adopted" / "muju-phasing-2" / "A3"` (confirmed by calling it directly). `gate1-references.json`
  is the actual adopted-preregistration record — `status: 'adopted'`, `rulesVersion:
  'muju-phasing-2'`, with a git-commit-pinned amendment document — for the A3/A4 protocol.

In other words: the entire Gate 1 acceptance pipeline is, correctly and by pre-existing design, now
blocked pending a new adopted amendment (an "A5", structurally analogous to A4) that re-runs the
scripted reference under `muju-phasing-3`, re-freezes new purchase/inactivity bands from it, and
records that adoption in `gate1-references.json` with its own commit-pinned document. None of that
has happened, and it is not something a test re-pin can honestly manufacture.

I considered two workarounds and rejected both as dishonest in the same spirit the task told me to
avoid ("never loosen an equality into a truthiness check"), just at the production-data layer
instead of the test layer:

1. **Synthetic bands with a corrected `rulesVersion`, substituted into the ~14 "mechanics" tests**
   (which mostly exercise `summarize()`'s pass/fail/invalid logic, not bands freshness per se). This
   would make most of the suite pass, but it would be asserting that gate1 logic behaves correctly
   under bands that do not exist as real, adopted evidence — quietly working around the exact gate
   the code was built to enforce.
2. **Editing `lab/ai/gate1-references.json`'s `status`/`rulesVersion` to `'muju-phasing-3'`** so
   `adoptedProtocol()` stops throwing. This would falsely claim a new preregistration amendment was
   adopted, with no new measured bands and no new commit-pinned amendment text behind it — the
   single test that inspects the adopted document's own commit hash and text
   (`"passes A3 full evidence…"`, which checks `protocol.document` for `'A4 — 2026-09-19: rules
   revision `muju-phasing-2`'`) would then be asserting a fabricated fact.

I made **no changes** to `tests/lab/gate1.test.ts`, `lab/ai/gate1.ts`, `lab/ai/gate1-report.ts`,
`lab/ai/gate1-sources.ts` or `lab/ai/gate1-references.json`. This is a decision for the
coordinator/owner: either declare Gate 1 formally deferred the same way `ai-strength` already was
(and then update `gate1.test.ts`'s expectations to assert the new, correct `'invalid'`/blocked
reality, with a dated note — the same shape of fix lane 2 and the coordinator already applied
elsewhere), or commission the A5 measurement campaign that re-freezes bands and re-adopts the
amendment for real.

## `tests/ai/hard/calibrate-cold.test.ts` — three runs, not idle, not changed

The machine was not idle at the start (`uptime`: load averages 41.60 20.32 17.72 — a second
worktree, `deevgames-kc-bisect`, was actively running an AI-regression bisection script). Load
dropped to the 7–14 range for the three runs themselves (still not idle — Chrome, iTerm, other
worktree activity persisted throughout), so "idle" was not achievable; I ran it anyway and recorded
what happened rather than waiting further, per the task's fallback ("if it fails idle, read it and
report").

All three runs failed identically:

```
tests/ai/hard/calibrate-cold.test.ts > time.calibrateCold, on (hard@ablate:calib)
  > adopts a probe the work budget stopped, even below A16s work floor
AssertionError: expected 25132 to be less than 12500
  at tests/ai/hard/calibrate-cold.test.ts:143
```

`probe.work` was exactly `25132` on all three runs (not merely close — identical), which is a
work-unit count from the search, not a wall-clock duration, so this reads as deterministic on this
box/build rather than genuinely load-flaky. What it measures (per the test's own docstring): a
fixed midgame fixture (`MIDGAME`) is searched for exactly `COLD_PROBE_WORK` (`WORK_LADDER[0]` =
25,000 units) work; the test's premise is that iterative deepening on this fixture stops partway
through depth 1, landing under `MIN_PROFILE_SAMPLE_WORK` (12,500, half a rung) before the budget
runs out — a REGRESSION-shaped assertion the test's own comment already flags as fragile
("`If a future engine spends the whole rung here the assertion below is merely redundant, not
wrong`"). The observed value (25,132) is essentially the whole rung, not half of it, meaning the
search now spends its full probe budget on this fixture rather than stopping at the depth-1
boundary the test was authored against.

This is the same failure, at the same near-identical value, that lane 2 already found and diagnosed
as pre-existing: `git stash` back to the unmodified seed commit `62a5703f` reproduced the identical
failure (`25131`, one unit off) with none of the kill-clock lane's changes applied. I did not
change anything in `tests/ai/hard/calibrate-cold.test.ts`, `src/ai/hard/engine.ts`, or any of its
dependencies, per the task's instruction to report rather than fix.

## Final counts

- `tests/lab/ablate.test.ts tests/lab/gate1.test.ts tests/lab/analyze-phasing.test.ts
  tests/lab/openings-p1.test.ts tests/lab/phasing-harness.test.ts tests/lab/phasing-evidence.test.ts
  tests/lab/baseline-identity.test.ts tests/lab/ladder-runner.test.ts`: **7 files passed / 1 failed
  (8 total)**; **261 passed / 16 failed (277 total)**. The one failing file is `gate1.test.ts`,
  unchanged from the seed run (see (b) above); `phasing-evidence.test.ts`, `baseline-identity.test.ts`
  and `ladder-runner.test.ts` were already green (coordinator/lane-2 work) and stayed green.
- `npx vitest run tests/lab` (whole directory): **46 files passed / 1 failed (47 total)**; **937
  passed / 16 failed / 1 skipped (954 total)**. The 16 failures are exactly `gate1.test.ts`'s; the 1
  skip is the pre-existing, doubly-documented v2-bundle load test lane 2 already recorded. Wall
  time 355.6s under concurrent-lane load.
- `npm run hard:types`: **PASSES, 0 errors.** Lane 2's declared blocker
  (`lab/harness/runner.ts:182`, `VictoryReason` not assignable to `WinType`) is resolved — the
  coordinator's `WinType` already includes `'kill-clock'` (`lab/harness/types.ts` line 195,
  confirmed by reading it), so `RULE_WIN_TYPES`/`GameRecord.winType` type-check cleanly now.
- `tests/ai/hard/calibrate-cold.test.ts`: **1 failed / 9 passed (10), identically on 3 runs** — see
  above; not idle, not changed, pre-existing at the seed commit per lane 2.

## Files touched

- `tests/lab/ablate.test.ts`
- `tests/lab/analyze-phasing.test.ts`
- `tests/lab/openings-p1.test.ts`
- `tests/lab/phasing-harness.test.ts`
- `muju/docs/changes/2026-09-22-kill-clock-lane4.md` (this file)

Nothing else was edited, committed, pushed or deployed.
