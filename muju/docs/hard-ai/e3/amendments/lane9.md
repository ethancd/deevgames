# E3 lane 9 — proposed amendments

Lane 9 owns `lab/hard-ai/suites/run.ts`, `lab/hard-ai/exam/{run,format,seed}.ts`,
`tests/lab/{exam,suites}.test.ts`, the `features.ts:28-31` header comment,
`docs/hard-ai/e3/E3.2-PRECONDITIONS.md` and
`lab/results/hard-ai-e3/preconditions/**`. Everything below either needs a file
this lane does not own, or is inside a file it owns but would change the meaning
of a number somebody else's row or gate is written against. Nothing here was
applied. Evidence is in `E3.2-PRECONDITIONS.md` and the artifacts it names.

## A9-1 — the invariants EVAL column cannot see the engine under test

**File:** `lab/hard-ai/suites/run.ts` (this lane's file; not applied on purpose).
**Now:** `const PAIR_EVAL = new Evaluator(PAIR_REPLICA);` at module level, with
no weights, so `Evaluator`'s constructor defaults to `DEFAULT_WEIGHTS`.
**Proposed:** `new Evaluator(PAIR_REPLICA, suiteEnginePatch(args.engine).weights)`,
and the artifact records the vector's label next to `invariantsEval`.

Measured at the E3 head plus A7-1, all 20 pairs at their own 50,000-unit budget:
`invariantDetail[].evalGapCc` is IDENTICAL, row for row, between
`hard@desktop` and `hard@ablate:eval-no-safety`
(`preconditions/suites-desktop/after-default-v1.json` against
`preconditions/suites-eval-no-safety/after-default-v1-no-safety.json`). The two
engines do not agree; the column is the same number printed twice, because there
is no engine in it.

Consequences worth naming:

- `E3.1-SYNTHESIS.md` §3.5 tells row #1 to "report the EVAL column only" for the
  arm, since the searched one was measured with the wrong weights. After A7-1
  that is exactly inverted: the SEARCHED column is the only one that can see an
  arm (champion 6/20, arm 8/20), and the EVAL column is the champion's .60 under
  any engine name.
- Any past reading of `invariantsEval` for a non-champion engine is a reading of
  `DEFAULT_WEIGHTS`.

**Why it is proposed and not applied:** `invariantsEval` is an A6 baseline and
appears in M14's and M17's pass criteria. For `hard@desktop` the change is a
no-op (the vector is `default-v1` either way), but for every other engine it
changes what the metric means, and that is the A6/MILESTONES owner's call, not a
lane's.

## A9-2 — A6's suite baselines are material-only numbers

**File:** `docs/hard-ai/e0/AMENDMENTS-DECIDED.md`, entry A6.
**Now:** "baselines from M14-suite.json (tactics .918, spawnStrike .95,
homeMate 56, invariantsEval .60)".
**Proposed:** record that those were measured with `placeholder-m4` in the
searched path (the A7-1 bug) and carry the re-measurement beside them:
`hard@desktop` under `default-v1`, each case at its own budget, `--shards 1`,
2026-09-17 at the E3 head: tactics .9178 (73/79 cases, 67/73 points),
spawn-strike **.80** (16/20), home-mate 56, `invariantsEval` .60 (12/20),
`invariantsSearched` **.30** (6/20), economy 1.000 (30/30).

tactics, home-mate and `invariantsEval` stand. spawn-strike .95 does not.

## A9-3 — M14's spawn-strike clause now passes with zero margin

**File:** `docs/hard-ai/MILESTONES.md`, gate rows M14 and M17.
**M14 asks** `suite.spawnStrike >= 0.80`. Re-measured with the gate row's own
engine and work (`--suites spawn-strike --engine hard@lab --work 400000
--shards 1`): **0.80**, exactly at the bar
(`preconditions/suites-desktop/m14-gate-spawn-strike-lab-400k.json`).
`hard@lab` and `hard@desktop` resolve to the same config hash at fixed:400,000
(`d474d5ea9f10…`), so this is the champion, and A13 is confirmed by measurement.
**M17 asks** `suite.spawnStrike >= M14.suite.spawnStrike` and
`suite.invariantsEval >= M14.suite.invariantsEval`, which compares a
`default-v1` measurement with a `placeholder-m4` one unless both sides are
re-measured.

**Proposed:** re-run M14's and M17's suite commands under A7-1 and record the
new artifacts, before either criterion is quoted again; and note in the M14 row
that the pre-A7-1 `M14-suite.json` numbers are not comparable with post-A7-1
ones (A12's rule, one level down).

**Not proposed:** moving the 0.80 bar. Nothing here says the bar is wrong; it
says the number under it was measuring material.

## A9-4 — `cases/dev.jsonl` and its seeder now disagree by four cases

**Files:** `lab/hard-ai/exam/cases/dev.jsonl` (not this lane's to edit) and
`lab/hard-ai/exam/seed.ts` (this lane's, already fixed).
After A7-3 the seeder refuses to carry
`home-mate#clear-an-adjacent-lane-mate`, its `rotated-black` twin,
`home-mate#zero-attack-occupier-mate` and its twin as judgment cases (dry run:
judgment carries 6 -> 2, exact carries unchanged at 123, skipped still 62). The
committed `dev.jsonl` still holds them, and `exam/run.ts` reports them under the
`dead` outcome instead.

**Proposed:** a ruling from the E1.2 exam-set owner on whether to re-seed. It is
not a lane's call, and it is not the "never repair a fixture" case: the party
disagreeing with the file is the canonical rules through the seeder, not the
engine. If it is re-seeded, the dev judgment denominator goes 22 -> 18 and every
count in `E3.1-JUDGMENT-CASES.md` and `E3.2-PRECONDITIONS.md` needs its
denominator restated.

**Noted while measuring, not proposed:** the committed `dev.jsonl` carries 126
authored exact cases where the seeder's own report carries 123. That drift
predates this lane (the committed `seed-report.json` says 123 too) and belongs
with the same ruling.

## A9-5 — `hard:suite` still has no `--all`

**File:** `lab/hard-ai/suites/run.ts` (this lane's file) or A6's text.
A6 decided "`--all` = tactics, spawn-strike, home-mate, invariants, plus economy
and home-force once they exist" and records it as "implemented in E6.1 prep".
`parseArgs` has no `--all` argument today, so every command in
`E3.2-PRECONDITIONS.md` spells the five suites out.
**Proposed:** implement `--all` as exactly A6's list (with `economy` in it, per
A7-5's warning that the economy suite measures nothing today), or amend A6 to
say the flag does not exist. Left alone here because the E3.2 row report does
not need it and A6's list is an owner's text.

## A9-6 — the exam artifact's judgment shape changed

**File:** anything that reads `lab/results/**/exam/*.json`.
`judgment` now carries `matched`, `unmatched`, `won`, `dead`, `comparable`,
`wonCases`, `deadCases`; `matchRate` keeps its old formula (`matched / cases`)
so an older number stays comparable, and `matched` is `null` on an adjudicated
row. `byDemand` gains `judgmentWon` and `judgmentDead`.
**Proposed:** lane 5's `ablate/eval-no-safety/exam/dev.json` and any other
artifact quoted as "N/22" should be restated as matched + won + dead, the way
§4 of `E3.2-PRECONDITIONS.md` restates 4/22 and 5/22. No file needs editing; the
prose that quotes them does.
