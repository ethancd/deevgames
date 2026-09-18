# Lane 5 proposed amendments (E3.1 group ablation)

Lane 5 owns `lab/hard-ai/ablate/arms.ts`, `tests/lab/ablate.test.ts`,
`docs/hard-ai/e3/E3.1-GROUP-ABLATION.md` and
`lab/results/hard-ai-e3/ablate/**`. Everything below needs a file this lane
does not own. Nothing here has been applied.

## L5-A1 — `hard:ablate`'s default arm list now includes six arms the recall instrument cannot see

- File: `lab/hard-ai/ablate/run.ts` (lane 5 does not own it).
- Fact: `parseArgs` defaults `args.arms` to `armNames()`
  (`tests/lab/ablate.test.ts`, "defaults to every arm and the derived corpus"),
  and `armNames()` now returns 20 arms, six of them the E3.1 weight arms.
- Fact: the recall instrument builds `new Evaluator(this.rep)` with no weights
  argument — i.e. `DEFAULT_WEIGHTS` — whatever `--arm` says
  (`lab/hard-ai/recall/run.ts:356`), and reads only `gen`/`genInterior` off the
  arm (`recall/run.ts:390-399`). A weights arm therefore changes NO recall
  column, root or reply.
- Consequence: `npm run hard:ablate` with no `--arms` would spend six heavy-slot
  recall runs reproducing `base`'s numbers six times.
- Proposal: default `args.arms` to the arms whose factor is not `weights`, and
  let `--arms` name a weights arm explicitly for anyone who wants the control.
- Second half of the proposal: `formatComparison`'s footnote currently says
  "root columns are base's by construction for: … read replyTop1 for an
  interior arm". For a weights arm EVERY column is base's, reply included. The
  footnote should distinguish the two cases rather than point a weights arm at
  `replyTop1`.

## L5-A2 — `ladderPlan` prints a validation-stratum pricing row for the weight arms

- File: `lab/hard-ai/ablate/run.ts` (`ladderCommand`, `ladderPlan`).
- Fact: `ladderCommand(name)` emits `--openings <LADDER_OPENINGS>` at
  `wall:3000` for any arm name, and `LADDER_OPENINGS` is an E1 VALIDATION file
  (`tests/lab/ablate.test.ts`: "never prices against the sealed or development
  strata", `expect(plan).toContain('e1-val.jsonl')`).
- Fact: `E3-PLAN.md` "Rules E3 rows will run under" allocates E3 screening rows
  to named blocks with one use left and confirmations to `e2-val.jsonl` rows
  32–63, under a seed rule of its own (`20260930 + row ordinal`).
- Consequence: the printed plan for a weight arm is a command that would consume
  a validation block outside E3's allocation, with an `armLadderSeed` seed
  rather than a ledger seed. It is only printed, never run, but it is printed as
  if it were the arm's pricing row.
- Proposal: `ladderPlan` should either omit `weights`-factor arms or print them
  with a line saying the E3 row rules, not `LADDER_OPENINGS`, govern them.

## L5-A3 — `w[F.Material]` is written and never read

- Files: `src/ai/hard/eval/weights.ts:56` (the write) and
  `src/ai/hard/eval/evaluate.ts:103-125` (the code that does not read it).
  Lane 5 may not edit `src/ai/hard/**` at all in E3.1.
- Fact: `Evaluator.stage0` scores the material block as
  `materialCc(p, root) + this.sum(F.Rent, F.HomeInvaded)`. `materialCc` uses
  `this.weights.material` (the 18 catalogue params) and `sum` starts at feature
  1, so `w[F.Material] = 100` is read by nothing under `src/ai/hard/**`
  (`grep -rn "F.Material" src/ai/hard/` finds the write at `weights.ts:56`, the
  extraction `features.ts:174`, and two comments).
- Consequence 1: an ablation arm that zeroed `w[F.Material]` would be a
  byte-identical player to the champion under a different config hash — a silent
  A/A row. Lane 5's arms therefore do not include an `eval-no-material` arm, and
  the doc says why.
- Consequence 2: anything that reads the vector as "the weights the engine
  uses" — a Texel run (E3.3), a contribution table, a regularizer — will treat
  feature 0 as a live parameter with a gradient that can never change play.
- Proposal, for the coordinator to route to whoever owns the decision (lane 1
  for semantics, lane 8 for the tuner): either state the inertness at the
  declaration site, or exclude feature 0 from any tuned parameter block, or make
  `stage0` scale `materialCc` by `w[F.Material]/100` so the documented scale
  sentence in `weights.ts`'s header is enforced by the code. The third option is
  a `src/ai/hard/**` change and an engine-behaviour change unless
  `w[F.Material]` stays at exactly 100, so it is E3.2 work at the earliest.

## L5-A4 — the `material` group in `eval-groups.ts` cannot be ablated through `w[]`

- File: `lab/hard-ai/audit/eval-groups.ts` (coordinator-owned).
- Fact: `EVAL_GROUPS.material` is `[F.Material]`, one feature, and that feature's
  weight is inert (L5-A3). The five group names read as five ablatable groups;
  four of them are.
- Proposal: a sentence in the module header saying that a material ablation must
  move `weights.material` (the 18 catalogue priors), not `w[F.Material]`, and
  that lane 5 registers no `material` arm for that reason. No index moves.
