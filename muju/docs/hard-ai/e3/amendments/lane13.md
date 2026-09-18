# E3 lane 13 — proposed amendments

Lane 13 owns `lab/hard-ai/suites/run.ts`, `lab/hard-ai/recall/run.ts`,
`lab/hard-ai/exam/seed.ts` (dry-run reporting only), `lab/hard-ai/ablate/run.ts`
(the default arm list only), `tests/lab/{suites,recall}.test.ts`,
`tests/lab/ablate.test.ts` (append only),
`docs/hard-ai/e3/E3.3-INSTRUMENT-FOLLOWUPS.md` and
`lab/results/hard-ai-e3/followups/**`. Everything below needs a file this lane
does not own, or is a ruling no lane may take. Nothing here was applied.

Evidence is in `E3.3-INSTRUMENT-FOLLOWUPS.md` and the artifacts it names.

## A13-1 — `rootDiagnostic` should be `true` on the fifteen weights and evalFix arms

- File: `lab/hard-ai/ablate/arms.ts` (lane 5's and lane 12's).
- Fact: the flag is `false` on the nine `weights` arms (`eval-no-economy`,
  `eval-no-home`, `eval-no-safety`, `eval-no-invariants`, `eval-stage01`,
  `eval-no-space`, plus lane 11's three safety sub-arms) and on the six
  `evalFix` arms, and both comment blocks give the reason as
  `recall/run.ts:354-356` building its own `allocTables()` and
  `new Evaluator(this.rep)`.
- Fact: that is no longer true. `recall/run.ts recallEnginePatch(arm)` resolves
  the arm's weight vector and `evalFix` block and stamps them on the evaluator
  and both `NodeTables`. Measured on 20 root + 10 reply positions of
  `fuzz-1000.jsonl`: `eval-no-safety` `top1` .30 -> .35, `replyTop1` .20 -> .30,
  `regret_p90` 1,432 -> 931 cc; `eval-correct-v1` `top3` .50 -> .45,
  `regret_p90` 1,432 -> 1,222 cc.
- Proposal: flip `rootDiagnostic` to `true` on all fifteen and rewrite the two
  comment blocks. `tests/lab/ablate.test.ts`'s existing "arms the recall
  instrument cannot see" case (its `invisible` list) has to lose them in the
  same edit; that case is not this lane's to change, and the appended block
  pins today's state so the two do not drift silently.
- Not proposed: any change to the arms themselves, their patches or their
  hashes.

## A13-2 — `formatComparison`'s footnote is now wrong for a weights arm

- File: `lab/hard-ai/ablate/run.ts`, `formatComparison` (this lane owns the
  default `--arms` list in that file, not this function).
- Now: any arm with `rootDiagnostic: false` is listed under "root columns are
  base's by construction for: … read `replyTop1` for an interior arm, and the
  equal-time ladder row for one that moves no generator at all".
- L5-A1's second half already said that sentence was wrong for a weights arm,
  because EVERY column was base's, reply included. After the A8 / L5-A1 fix it
  is wrong the other way: for a weights or `evalFix` arm, every column moves,
  root and reply.
- Proposal, tied to A13-1: once the flag is `true` on the fifteen, the footnote
  stops naming them by itself, and the remaining text (`reply-wide`,
  `interior-*`, `calib`, `work-fit*`) is correct as written. If A13-1 is
  refused, the footnote needs a third case spelled out instead.
- Second half: a weights or `evalFix` arm also moves the depth-2 TRUTH, since
  its leaves are scored by the arm's evaluator. Two such arms are therefore not
  ranked against one fixed yardstick the way two generator arms are. The
  comparison table should carry that sentence under it, next to
  `SELECTIVE_REFERENCE_LABEL`, before anyone reads two weights arms' `top1`
  against each other.

## A13-3 — two numbers for the arm are superseded by A9-1

- Files: `docs/hard-ai/e3/E3.2-PRECONDITIONS.md` (lane 9's) and
  `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §3.5 (the coordinator's).
- `E3.2-PRECONDITIONS.md` §1.2's table gives `hard@ablate:eval-no-safety`
  `invariantsEval` .60 (12/20), with the note "see L9-F1". Under A9-1 the arm's
  own vector is read and the value is **.50 (10/20)**: `inv8-no-pre-adjacency`
  335 cc -> 0 cc and `inv9-chip-across-turn` 150 cc -> 0 cc, pass -> miss in
  both. Twelve of the 20 gaps move.
- §5's L9-F1 bullet ("the invariants EVAL column has no engine in it") is
  fixed, not outstanding, and should be dated and marked so.
- `E3.1-SYNTHESIS.md` §3.5 tells row #1 to "report the EVAL column only" for the
  arm. A7-1 already inverted that; after A9-1 both columns can see an arm and
  either may be quoted, with `weightsLabel` beside it.
- `hard@desktop`'s .60 (12/20) is unchanged and every one of its 20 gaps is
  byte-identical, so A6's baseline is not touched. The A6/MILESTONES owner still
  owns the question lane 9 raised: whether an A6-baselined metric may change
  meaning for a non-champion engine. It is applied here under the coordinator's
  standing delegation; a refusal reverts one function.

## A13-4 — the A9-4 ruling, with A9-4's denominator corrected

- Files: `lab/hard-ai/exam/cases/dev.jsonl` and every document quoting `/22`.
  No lane may edit the case file; this is the E1.2 exam-set owner's ruling.
- The dry run (`lab/results/hard-ai-e3/followups/reseed-dryrun.json`, 40.7 s,
  2,000,000-call budget) says a re-seed as the seeder stands today would write
  141 rows against the committed 149, and would drop EIGHT rows and add none:
  - four `dead-position-judgment` home-mate rows — the ones A9-4 is about;
  - `e21-purchase-plus-promotion` (judgment), `e21-multi-promotion-double-threshold`,
    `e21-summon-and-strike` and `e21-upkeep-release-choice` (exact) — hand-added
    E2.1 rows whose `source.kind` is `authored`, which the seeder neither
    produces nor preserves (`keptLossCases` keeps only `source.kind === 'loss'`).
- So the judgment denominator would go 22 -> **17**, not 22 -> 18 as A9-4 says,
  and the "126 authored exact against the seeder's 123" drift is exactly those
  three E2.1 exact rows.
- Proposal: the ruling should answer two questions, not one.
  1. Do the four dead judgment rows leave the file, or stay and keep being
     reported as `dead` (today's behaviour, no file change)?
  2. Should the seeder preserve hand-added authored cases the way it preserves
     loss cases? Until it does, "re-seed" and "drop the four dead rows" are
     different operations and the first cannot be used to do the second.
- Whichever way (1) goes, the denominators in `E3.1-JUDGMENT-CASES.md` and
  `E3.2-PRECONDITIONS.md` need restating against 17 or 18 depending on (2).

## A13-5 — for `.claude/napkin.md` (the coordinator's file)

Three things worth keeping.

- `lab/hard-ai/recall/run.ts` used to call `void main()` at module level with no
  entry-point guard, so importing it ran a measurement. Two of the lab runners
  already had the guard; a third did not, which is why there was no
  `tests/lab/recall.test.ts` before this lane.
- `recall/run.ts` declares its own `interface Partial`, which SHADOWS
  TypeScript's `Partial<T>` for the whole module. `Partial<HardConfig>` there is
  a "Type 'Partial' is not generic" error; spell the type
  `ReturnType<typeof hardEnginePatch>` instead.
- A judgment exam id is `examIdFor(suite, caseId)` with `-preference` appended,
  while a seeder skip row is keyed by the bare suite case id. Matching the two
  without the suffix silently loses every judgment row's reason.
