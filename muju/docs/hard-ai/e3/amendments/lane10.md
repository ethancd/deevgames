# Lane 10 amendments (E3.2 reproduction + the 47 baseline losses, 2026-09-17)

Proposals only. Lane 10 owns `lab/hard-ai/audit/loss-*.ts`,
`lab/hard-ai/analyze/work-sweep.ts`, `tests/lab/analyze-work-sweep.test.ts`,
`lab/results/hard-ai-e3/repro/**`,
`lab/results/hard-ai-e3/loss-judgment/baseline47/**`,
`docs/hard-ai/e3/E3.2-REPRO.md` and the appended addendum at the end of
`docs/hard-ai/e3/E3.1-LOSS-JUDGMENT.md`. Nothing below was applied.

## A10-1 — the arm is not a leaf-only change; `E3.1-SYNTHESIS.md` §3.2 and §3.5 should say so

- Evidence, `E3.2-REPRO.md` §3, root `74b71f89ae7abb64`
  (`g4-s6_3_5-B-white` = `g5-s7_3_7-B-white`, black, turn 1):
  - `GenFamilyLister(cfg.gen, cfg.weights)` — the production generator's own
    setup — lists **18** candidates under `default-v1` and **19** under
    `default-v1-no-safety`.
  - The turn `hard@ablate:eval-no-safety` actually plays at 400k, 566k and 800k
    units, `7a4e0a31c5259add`, is the arm's candidate #9 and is **not in the
    champion's list at all**.
- §3.2 says "What changes: the 19 `w[]` entries of the safety group set to 0".
  True, and the consequence is wider than the sentence suggests: those entries
  are read by the candidate generator's static ordering and its K-cut as well
  as by the search leaf.
- Proposed: add one bullet under §3.2 and one under §3.5 saying that row #1
  prices the 19 safety weights wherever the engine reads them — generator
  ordering, K-cut and leaf — and that a leaf-only variant would be a different
  arm. No change to the row, the command, the seed or the prediction; the
  one-factor invariant in `tests/lab/ablate.test.ts` is untouched because the
  factor IS `weights`.
- Who owns it: the coordinator (`E3.1-SYNTHESIS.md`).

## A10-2 — §3.3 reproduction step 3's prediction was half right; record which half

- §3.3 step 3 predicts "the arm's search prefers the adviser's key at some rung
  ≤ 400k where the champion never does."
- Measured (`E3.2-REPRO.md` §3): the arm's `flipWork` is 400,000 against the
  champion's `never`, so the RUNG is right; the arm never chooses the adviser's
  key `559e2d60610127d8`. It chooses `7a4e0a31c5259add`, which the champion's
  own adviser scores at −2,032 cc against the adviser's best −1,797 and the
  played −2,473 — a flip only by the sweep's 300 cc `FLIP_TOLERANCE_CC`.
- Proposed: a one-line correction under §3.3 pointing at `E3.2-REPRO.md` §3, so
  the row report does not claim the arm found the adviser's turn.
- Who owns it: the coordinator.

## A10-3 — the item-5 concept does not generalise to the 47-loss set; §4's task is closed negative

- §4 lists "The 47-loss baseline set. Task: … count distinct positions, and
  re-derive item 5; the concept's joint claim (6 of 12) generalises or it does
  not."
- Done, in the addendum to `E3.1-LOSS-JUDGMENT.md`: 41 losses of the two E3.2
  classes, 39 distinct positions, judges 1 and 4 (judge 2 withheld because row
  #1 is live on the same box).
  - safety → played turn: 9 of 10 on the 12, **17 of 30** on the 39
    (two-sided binomial p 0.585); Σ −5,100 cc becomes Σ −4,305 cc.
  - economy → adviser: 8 of 11 on the 12, **16 of 16** on the 39; Σ +3,613
    becomes Σ +1,443.
  - `Material` → played: 6 of 6 becomes 11 of 11, Σ sign flips to +500.
  - space → played: 5 of 8 becomes **24 of 36** (p 0.065), Σ −4,059, the most
    consistent direction in the set.
- Proposed: strike §4's open task, record the answer as NEGATIVE for the joint
  claim, and soften §3.1's "the one concept" paragraph to say the concept is
  what motivated the arm from a 12-position in-sample corpus and did not
  confirm out of sample. The row itself is unaffected — it is an equal-time
  strength measurement, not a test of this claim.
- Who owns it: the coordinator.

## A10-4 — `E3.1-LOSS-JUDGMENT.md`'s "the 47-loss baseline set was not available" section is now stale

- The section (written 03:50Z) is factually about what existed then and should
  stay as a record.
- Proposed: one line appended to that section pointing forward to the addendum
  at the end of the same file. Lane 10's licence is append-at-the-end only, so
  this was not done.
- Who owns it: lane 6 or the coordinator.

## A10-5 — `eval-audit.ts newCtx` should take an optional weight vector

- `lab/hard-ai/audit/eval-audit.ts newCtx()` hard-codes `DEFAULT_WEIGHTS`. Lane
  10 needed the same construction under an arm's vector and, not owning that
  file, cloned it as `newCtxWithWeights(weights)` inside `loss-judgment.ts`
  (same `Replica`, same `Scratch` shape, same `Evaluator`, same version-0
  refusal).
- Proposed: `newCtx(weights: Weights = DEFAULT_WEIGHTS)` in `eval-audit.ts`,
  and `loss-judgment.ts`'s clone deleted in favour of it. Two call sites.
- Who owns it: lane 4 (`lab/hard-ai/audit/eval-*`).

## A10-6 — `package.json` script lines for the two instruments

- Lane 6 already proposed `hard:loss-judgment`. Lane 10 adds nothing to the
  file and repeats the request with the arm form, plus one for the sweep:
  - `"hard:loss-judgment": "node --import tsx lab/hard-ai/audit/loss-judgment.ts"`
  (`hard:analyze:work-sweep` already exists at `package.json:52` and takes the
  new `--engine` flag through `--`, so only the loss-judgment line is missing.)
- Both are invoked by absolute script path in every command recorded in
  `E3.2-REPRO.md`, so nothing depends on this landing.
- Who owns it: the coordinator (`package.json`).

## A10-7 — the row's manifest lists all 32 opening ids, not the 16 in use

- `manifest.openings.ids` for row #1 lists 32 ids; `--pairs 32` over `h0,h3` is
  16 pairs per handicap, i.e. `e1-val2.jsonl` rows 0–15, the preregistered
  block. The block actually played is only readable from `games.jsonl` after
  the row finishes.
- This is the same shape as the napkin's E2 lesson ("`--pairs` counts pairs
  across ALL handicaps") and it costs a reader of the manifest the ability to
  check the allocation rule without the games file.
- Proposed: `ladder/run.ts` record `openings.idsUsed` alongside `ids`. Lane 10
  does not own the ladder.
- Who owns it: the coordinator.
