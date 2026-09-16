# Hard AI: measure first, then choose the work

Status: proposed development plan, not authorization to change existing strength
criteria or replace the shipped AI. Based on the September 15 postmortem in
`deevgames-muju-hardai`, and inspection of its code at `85a1bc5`.

## Starting point

The objective is a measurably stronger opponent than the shipped `AIEngineV2`
within realistic desktop and phone turn budgets. Fourteen green engineering
milestones establish useful infrastructure, not evidence that this objective
has been reached. Keep the replica, correctness checks, replay tooling and
paired ladder; pause M15–M20 feature work until a baseline comparison exists.

The released v2.8 game is already committed at `6d16f14` on the former online
branch. Its canonical rules, shipped AI, WASM source, hooks and dependencies
match the hard-AI snapshot `44c41c4`. That snapshot also contains research data
and omits the production soundtrack. Do not merge the experimental branch into
production to resolve this history. Preserve the old branch and local artifacts;
integrate production into a separate continuation checkout and verify its diff.

## 1. Make the measurement trustworthy (first bounded task)

Audit the ladder before spending hours on it. Inspect and test:

- **One budget per turn.** `lab/hard-ai/bots/hard.ts` currently passes a fresh
  `targetMs` to every re-search, whereas the AIv2 adapters debit a remaining-turn
  balance. Prove whether re-search can occur and enforce the same accounting.
  Record actual thinking time, fallback counts and p50/p95/p99 latency.
- **The actual shipped baseline.** Check the adapter's engine lifecycle, seeding,
  resignation and per-action time allocation against the released worker/hook,
  not only against the new branch's modified whole-turn path. Compare the new
  whole-turn AIv2 adapter as a separate experimental arm if useful.
- **A real width ablation.** The postmortem calls the reference generator K=96,
  but `gen/generate.ts` currently defines `REFERENCE_K=2000`, widths
  `[40,16,8,4]`, 200 place plans and a separate 120,000-node budget. The registry
  does not expose a K=96 arm. Define explicit K=24 and K=96 configurations,
  record every parameter, and distinguish increasing K alone from widening the
  action beam. Do not silently label the instrument's reference path K=96.
- **Comparable time.** Hard's `targetMs` selects work through a learned profile
  and uses an abort factor; it is not necessarily a strict wall-time limit.
  Measure actual time and overruns before claiming equal-time strength.
- **Reproducibility and diversity.** Pin commits, rules, WASM, full config and
  corpus hashes. Confirm that changing seeds produces meaningfully different
  games; identical deterministic openings are not independent evidence.
- **Pair counts.** `--pairs 50 --handicaps 0,3` creates 50 pairs total, split
  between handicaps. Use separate runs for 50 pairs at each handicap. Report
  confidence intervals by handicap, adjudications and anomalies, not just Elo.

Exit: a small replayable smoke comparison, zero illegal actions/divergences,
and timing/configuration evidence that makes the larger experiment interpretable.
Allow 45–60 minutes of implementation; if it exceeds that, report the specific
remaining defect and split the task. Do not lower an acceptance bar to finish.

## 2. Run a staged comparison campaign

Run at most two heavy workers on this shared machine; do not launch several
sharded campaigns at once. First run two pairs per comparison to measure cost
and catch adapter problems, then an eight-pair diagnostic. Estimate the full
campaign duration from observed turns and time, rather than assuming two hours.

| Comparison | Budget and sample | Decision informed |
| --- | --- | --- |
| Current hard vs shipped `aiv2-hard` | 3,000 ms/turn; target 50 pairs **per handicap**, 0 and 3 | Is the replacement competitive? |
| Hard K=96 vs hard K=24 | Same measured turn budget, paired openings; target 50 pairs | Does broader coverage pay for its search cost? |
| Shipped `aiv2-hard` vs Rush | 500 ms/turn, 8 pairs, handicap 0 | Calibrate the old M14 smoke result |

Run fixed-work measurements separately for deterministic regression and cost
diagnosis. They do not establish fair cross-engine strength. Freeze the sample,
stopping rule and statistical analysis before the full run; do not repeatedly
peek at a fixed-sample interval and stop when it looks favorable. Inconclusive
results stay inconclusive.

The existing baseline command, after the audit, is:

```sh
npm run hard:ladder -- --a hard@lab-400k --b aiv2-hard \
  --work wall:3000 --handicaps 0 --pairs 50 --seed 91601 \
  --shards 2 --out lab/results/hard-ai-recovery/baseline-h0
```

Repeat for handicap 3 with its own output directory. The `-400k` label is
documentary: `--work wall:3000` controls this run. The width comparison needs the
explicit new profiles from step 1; there is no ready-made wide-profile command.

## 3. Choose one improvement from evidence

- If wider generation clearly improves play, reopen candidate generation. Try
  root breadth and search-informed reranking, one change per experiment. Keep
  tactical forced moves and legal fallback behavior. Measure both missed strong
  turns and lost search depth; K alone cannot recover moves the beam never made.
- If hard loses and breadth does not help, inspect a small set of losing replays
  and tactical positions. Isolate evaluation, move ordering and search completion
  with ablations. A null width result does **not** prove the recall-ceiling theory:
  a wider but slower generator can hide a coverage benefit.
- If hard is competitive, expose an opt-in development mode and measure the real
  worker/browser path before adding more search machinery. Keep shipped Hard as
  the default until the release gate passes.
- If the replacement remains far behind, use the ladder to improve shipped
  AIv2 as a competing path. Compare payoff per measured iteration; retaining the
  replica does not require committing to its current search design.

Each iteration gets one hypothesis, one focused patch, correctness checks and
the same small standing comparison against shipped Hard. Keep a held-out corpus
for release evaluation; do not tune on the acceptance set.

## 4. Release and process gates

Keep correctness, strength and responsiveness as separate reported statuses.
Require canonical legality/replica checks; a predeclared paired strength test
against shipped Hard at matched time; and actual desktop/phone measurements of
latency, cancellation, memory and fallback behavior. Desktop CPU throttling is
only a proxy until real-phone evidence exists. The previously specified M19
release criteria remain in force unless the owner explicitly approves changes.

Implementers may propose criterion amendments in a short pending list; they may
not approve their own changes. A verifier's finding that a criterion was changed
to fit results blocks the milestone. Past amended milestones retain their
engineering results but carry unresolved strength/performance status.

Keep milestones to roughly an hour and at most five substantive clauses. Finish
the current checkpoint on pause, then start nothing new. Use explicit engine-test
timeouts and a single campaign resource budget. A one-page result should show:
baseline score and interval, actual timing, correctness, changed parameters,
unresolved criteria and the next decision. Large raw artifacts belong behind
links, not in the decision summary.

**Next action:** stabilize the continuation branch, audit the measurement adapter,
and produce the first direct comparison with the shipped Hard AI. No M15–M20
implementation or multi-hour campaign was started as part of writing this plan.
