# Lane 11 proposed amendments (E3.2 safety sub-arms)

Lane 11 owns the three sub-arms in `lab/hard-ai/ablate/arms.ts`, the extension
of `tests/lab/ablate.test.ts`, `docs/hard-ai/e3/E3.2-SAFETY-SUBARMS.md` and
`lab/results/hard-ai-e3/ablate/{eval-no-threat-stack,eval-no-anchor,eval-no-safety-inv}/**`.
Everything below needs a file this lane does not own. Nothing here has been
applied.

## L11-A1 — lane 5's L5-A1 now covers nine arms, not six

- File: `lab/hard-ai/ablate/run.ts` (this lane does not own it; lane 5 already
  proposed the fix as L5-A1).
- Fact: `parseArgs` defaults `args.arms` to `armNames()`, and `armNames()`
  returns three more `weights` arms after this lane's commit.
- Fact: the recall instrument builds `new Evaluator(this.rep)` with no weights
  argument, so none of the nine changes any recall column (`recall/run.ts:356`).
- Consequence: an unqualified `npm run hard:ablate` would now spend NINE
  heavy-slot recall runs reproducing `base`'s numbers.
- Proposal: no new proposal — adopt L5-A1 as written (default the arm list to
  the arms whose factor is not `weights`). This entry only updates its count and
  records that the cost grew.

## L11-A2 — `E3.1-SYNTHESIS.md` §4's second bullet is answered; the list should say so

- File: `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §4 ("What E3.1 could not settle"),
  second bullet, and `E3-PLAN.md`'s "Next bounded task" item 4 in the decision
  record.
- Fact: the bullet's task was "three fixed-work sub-arms on the same four
  `e1-dev` openings, 8 pairs each, lane 5's seed convention continued …
  Descriptive; enters no ledger." That is what this lane ran, at seeds 36, 37
  and 38, and `E3.2-SAFETY-SUBARMS.md` reports it.
- Proposal: mark the bullet answered with a pointer to
  `docs/hard-ai/e3/E3.2-SAFETY-SUBARMS.md`, and carry this lane's caveat with
  the answer: the split is descriptive, at n = 8 pairs on 4 development
  openings, and A15 makes the openings the independence source, so the sub-block
  attribution is as weak as the +338 it decomposes.
- Not proposed: any change to the E3.2 concept, the row #1 preregistration, or
  the arm `eval-no-safety` itself. A within-group split cannot retain or reject
  anything, and this lane ran no equal-time row.

## L11-A3 — the `weights`-arm order pin in `tests/lab/ablate.test.ts` is now a prefix check

- File: `tests/lab/ablate.test.ts` (owned by this lane and by lane 5 before it;
  recorded here because lane 12 also extends the same file this session and the
  coordinator merges both).
- Fact: the test "registers six arms whose factor is weights, in plan order"
  asserted `armNames().filter(factor === 'weights')` EQUALS lane 5's six. Any
  later lane that registers a `weights` arm fails it, whatever the arm is.
- Applied in this lane's own file: the assertion now checks that the first nine
  `weights` arms are lane 5's six followed by this lane's three, as a prefix, so
  a tenth `weights` arm appended at the end of `SPECS` does not fail it while the
  order of the nine stays pinned.
- Proposal for the coordinator, not applied: if lane 12 registers `weights` arms
  of its own, extend the same prefix list rather than reverting to an equality
  over all `weights` arms.
