# E2 lane 1 — the per-turn instrument, the deepening gate, and four arms probed

Three things: a per-search record on every hard ladder seat, a switchable
deepening gate, and a probe of all four allocation arms. The headline is
negative and it is the useful part — **`deep-gate` as specified is more
conservative than the rule it replaces**: it spends less work than
`hard@desktop` and loses 0.3 completed depth. `work-fit` is the only arm of the
four that raises both work and utilisation without losing depth.

## A. The per-turn instrument

`lab/hard-ai/bots/hard.ts` now pushes one row per SEARCH onto
`HardSeatTiming.turnRows`, which `lab/harness/runner.ts` already copies into
`PlayerGameStats.hardTiming`, so it lands in `games.jsonl` and in replay meta
with no further plumbing. Fields (`lab/harness/types.ts HardSeatTurnRow`):
`turn`, `rung`, `work`, `elapsedMs`, `searchMs`, `fundedMs`, `depth`,
`stopReason`, `unitsPerMsBefore`, `unitsPerMsAfter`, `deadlineCut`.

The rung was NOT observable from outside the engine, so it is now
`HardSearchStats.rung` — `opts.work` as `searchRoot` hands it to `meter.reset`,
recorded where the meter is armed so every return path carries it. The two
profile readings are `HardSearchStats.unitsPerMsBefore` / `unitsPerMsAfter`,
written by `engine.ts` around `updateProfile`. **`HardSearchStats` is not
serialised into any resolved configuration, so no hash moves**; the three
fields are statistics, and `newSearchStats()` starts them at 0.

Cost: one object push per search, nothing in a hot path, nothing in `src/`
beyond three integer stores. The root exposure is deliberately NOT turned on for
ladder rows — it allocates per search, and an E2 row has to stay comparable with
the E1 rows measured without it — so `rootTrace` is left to the analyser's
re-runs and is not in the row.

## B. The gate arm

`SearchConfig.iterationGate?: 'fixed45' | 'predicted'`, absent everywhere
(`canonicalJson` drops it, so the champion's hash is unmoved).
`search/pvs.ts shouldDeepen` is the whole implementation:

- `fixed45` (absent, and every shipped shape): DESIGN §5.11.2's constant,
  `used × 100 ≤ limit × 45`, in the same integer arithmetic as before.
- `predicted`: start the next depth when `used + lastIterWork × ratio ≤ limit`,
  where `lastIterWork` is what the last COMPLETED depth cost (aspiration
  re-searches included) and `ratio` is the measured ratio of the last two
  completed depths clamped to [2, 6], or 3 when only one has completed.

What it can gain: a completed depth `fixed45` refused because `used` had crossed
0.45 while the next depth would in fact have fitted. What it can lose: the work
of a started-but-truncated iteration — which `iterativeDeepening` drops anyway,
so the loss is time, not quality — and, as measured below, a completed depth
when the prediction over-estimates. In wall mode A11's deadline still bounds the
worst case and a truncated iteration is still dropped, so the gate cannot change
what a completed depth means.

Arms registered in `lab/hard-ai/ablate/arms.ts`, hash-pinned in
`tests/lab/ablate.test.ts`:

| arm | factor | resolved config hash at wall:3000 |
| --- | --- | --- |
| `hard@desktop` / `base` | none | `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd` (unchanged) |
| `work-fit` | time | `8c7369591855da0b4fc5c9766dce24ec2e2f73c6520232991dd0865473d28828` |
| `deep-gate` | iterationGate | `4ea03ea14ff0f6cde6c3d0cf4bd80323ce88983264d8465ffe3bfeded3033b8e` |
| `work-fit-deep` | combined | `3969370fe0221f2a08a9ac68b950fc772323819540789ae77265dab92eccda5c` |

`combined` is a new declared factor: `work-fit-deep` moves two named factors and
says so, `factorsOf` reports both, and `maskFactor` restores both, so the
one-factor invariant covers it by declaration rather than by omission.
`deep-gate` is the first allocation arm with `rootDiagnostic: true` —
`iterationGate` is a SEARCH field, so unlike the two `time` arms it applies under
fixed work and a fixed-work instrument can see it.

## C. The probe

20 positions: the 14 first-consequential turns of lane 2's sweep (reconstructed
through `analyze/replay.ts` exactly as `work-sweep.ts` does) plus the 6
loss-derived exam cases. Fresh engine per arm per position, three warm-up
searches at `targetMs = deadlineMs = 3,000`, then one measured.
`MUJU_HEAVY_SLOTS=3`, one process, about 12 minutes.

| arm | mean rung | mean work | mean ms | used/allowance | abort rate | mean depth | exact flips /14 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hard@desktop` | 200,000 | 132,972 | 1,500 | 50.0% | 0% | 2.80 | 0 |
| `work-fit` | 253,900 | 163,671 | 1,804 | 60.1% | 0% | 2.80 | 0 |
| `deep-gate` | 200,000 | 102,706 | 1,171 | 39.0% | 0% | 2.50 | 0 |
| `work-fit-deep` | 241,450 | 104,108 | 1,200 | 40.0% | 0% | 2.50 | 0 |

`work-fit` reproduces its earlier result on the wider set: +23% work, +10 points
of utilisation, no aborts, depth unchanged.

**`deep-gate` goes the wrong way.** It spends 23% LESS work than the champion and
gives up 0.3 completed depth, and it drags `work-fit-deep` down with it: the
combined arm keeps `work-fit`'s bigger rung and then refuses to use it.
Two rows show the mechanism. On `loss-g2-s5_0_2-A-t4` the champion spends
200,421 of its 200,000-unit rung at depth 3 — it STARTS a depth-4 iteration it
cannot finish and burns the rung on an iteration that is then dropped — while
`deep-gate` stops at 76,570, same depth 3, in a third of the time. That is the
gate working as designed. But on `loss-g3-s1_0_1-B-t6` the champion completes
depth 3 for 172,857 units and `deep-gate` stops at depth 2 for 80,570: the
prediction refused a depth that would have completed.

The cause is the clamp floor. `ratio` is clamped to [2, 6] as specified, and the
measured depth-over-depth cost ratio at these positions is frequently BELOW 2, so
`lastIterWork × 2` over-estimates the next depth and the gate refuses it. The
0.45 rule, crude as it is, is more permissive than a pessimistic prediction. I
did not change the clamp: it was specified, and moving it is a decision, not a
fix. The follow-up if the gate is wanted is a floor near the measured ratio
(1.2-1.5) or an unclamped prediction with the deadline as the only backstop.

**The decisive flip column is NOT obtained, and that is a reproducibility
problem, not a probe failure.** No arm picks the adviser's turn on any of the 14
(0/14 exact matches), and the 300 cc tolerance half of the rule cannot be
evaluated because the chosen end keys are outside the deep-score cache the sweep
left behind — scoring them needs an adviser search apiece, which does not fit
the CPU budget. Before that column can decide anything, this has to be resolved:
on `g4-s10_0_8-A-white` turn 3, `sweep.json` records that a fixed 283,000-unit
search picks the adviser's key `bd1579e6…` (its flip), but on the same
reconstructed position I get `35810826…` at fixed 283,000, at fixed 283,000 with
exposure on, and from every wall arm — four independent runs agreeing with each
other and disagreeing with the artifact. Either the sweep's engine is not the
one I resolve from `DESKTOP`, or the reconstructed position differs. **This is
lane 2's artifact and I have not edited it; it needs one look before any arm is
chosen on flip evidence.**

## D. Recommendation

**Row #3 should be `work-fit` alone, not `work-fit-deep`.** I disagree with
running the combined arm first, and the reason is in the table: on these 20
positions the gate half SUBTRACTS — 104,108 units against `work-fit`'s 163,671,
and 2.50 completed depth against 2.80. Running `work-fit-deep` first would
screen an arm that is, at the rungs this box reaches, mostly `work-fit` with a
brake on. `work-fit` is the only arm that raises work and utilisation with no
depth cost and no aborts, and it is the one with a mechanism the artifacts
already justify.

`deep-gate` should not get a row in its current form. The right next step for it
is cheap and is not a row: re-probe with the ratio floor at 1.2-1.5 and see
whether the loss turns into the gain the E1 baseline's unspent third implies. If
that probe is positive, `work-fit-deep` becomes the interesting arm and can take
row #4.

Prediction for the `work-fit` row, falsifiably (unchanged from
`E2-LANE1-WORK-FIT.md` §5): mean turnMs per seat-turn rises from 1,951 to at
least 2,300 and the overrun rate stays within 3 points of the baseline's 15.6%;
the arm is rejected if the Elo point estimate is below 0 or its 95% interval's
upper bound is below +10. With the instrument from §A now on every seat, that
row will for the first time record the rung, the profile and the stop reason
per turn, so a flat result can be attributed rather than guessed at.

## Tests

```
npx tsc --noEmit        exit 0
npm run hard:types      exit 0

npx vitest run tests/ai/hard/root-exposure tests/ai/hard/determinism tests/ai/hard/deadline \
  tests/ai/hard/calibrate-cold tests/ai/hard/interfaces tests/ai/hard/p6-stoppable-generation \
  tests/ai/hard/pvs tests/ai/hard-engine-fallback-elapsed tests/ai/worker-turn \
  tests/lab/ablate tests/lab/turn-allowance tests/lab/baseline-identity --maxWorkers=1
 Test Files  12 passed (12)
      Tests  212 passed (212)
   Duration  505.18s
```

```
npx vitest run tests/ai/hard/root-exposure tests/ai/hard/determinism tests/ai/hard/pvs \
  tests/lab/ablate tests/lab/turn-allowance tests/lab/analyze-exposure-split \
  tests/lab/analyze-work-sweep tests/lab/baseline-identity --maxWorkers=1   (after §E)
 Test Files  8 passed (8)
      Tests  175 passed (175)
   Duration  168.21s
```

The byte-identity proof for the gate is `tests/ai/hard/root-exposure.test.ts`:
it compares a fixed-work search with the instrument on and off across eight
positions, and `iterationGate` is absent on `DESKTOP`, so those searches run the
`fixed45` path unchanged. `tests/lab/ablate.test.ts` still pins the champion's
hash unmodified.

## E. The ratio floor, re-probed at 1.3 and 1.5 — negative, and my §C diagnosis was wrong

The floor is now a parameter: `SearchConfig.iterationGateFloor?: number`, absent
means 2, so `deep-gate` and `work-fit-deep` keep the hashes pinned in
`tests/lab/ablate.test.ts` and no new arm is registered. Same 20 positions,
same protocol (fresh engine, 3 warm-ups, 1 measured at `targetMs = deadlineMs =
3,000`), `MUJU_HEAVY_SLOTS=3`, one process, ~13 minutes. The measured search
runs with the root exposure on so `rootTrace[].work` (new, optional) gives the
per-iteration cost the gate predicts from.

| arm | mean rung | mean work | mean ms | used/allowance | abort | mean depth |
| --- | --- | --- | --- | --- | --- | --- |
| `hard@desktop` (control, re-run) | 200,000 | 132,972 | 1,507 | 50.2% | 0% | 2.80 |
| `work-fit` (§C run) | 253,900 | 163,671 | 1,804 | 60.1% | 0% | 2.80 |
| `deep-gate` @ floor 2 (§C run) | 200,000 | 102,706 | 1,171 | 39.0% | 0% | 2.50 |
| `deep-gate` @ floor 1.3 | 200,000 | 102,706 | 1,176 | 39.2% | 0% | 2.50 |
| `work-fit-deep` @ floor 2 (§C run) | 241,450 | 104,108 | 1,200 | 40.0% | 0% | 2.50 |
| `work-fit-deep` @ floor 1.3 | 241,450 | 104,108 | 1,205 | 40.2% | 0% | 2.50 |
| `work-fit-deep` @ floor 1.5 | 241,450 | 104,108 | 1,213 | 40.4% | 0% | 2.50 |

The control reproduces §C's numbers to the unit (132,972 work, 2.80 depth,
200,000 rung), which is also a cross-check that the exposure changes nothing.
**Lowering the floor changes nothing at all** — work, depth and rung are
identical at 2, 1.5 and 1.3.

The ratio distribution says why, and it contradicts what §C guessed. Over 126
consecutive-completed-iteration pairs:

| samples | min | p25 | median | p75 | p90 | max | mean |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 126 | 0.61 | 3.66 | 9.05 | 14.40 | 22.23 | 39.17 | 10.53 |

Buckets: `[0,1.3)` 5, `[1.3,1.5)` 1, `[1.5,2)` 0, `[2,3)` 8, `[3,4)` 24,
`[4,6)` 4, `≥6` 84. So only 5 of 126 ratios are under 1.3 and 6 under 2: **the
floor almost never binds, and §C's claim that "the measured ratio is frequently
below 2" was an inference from two rows, not a measurement. It was wrong.** What
binds is the CEILING and the estimator itself. Split by depth (control arm):

| step | n | median | min | max |
| --- | --- | --- | --- | --- |
| depth 1 → 2 | 19 | 12.32 | 3.66 | 39.17 |
| depth 2 → 3 | 17 | 3.02 | 0.61 | 10.74 |

The ratio DECAYS sharply with depth — depth 1 is nearly free (one ply plus
quiescence) while depth 2 explodes — so predicting depth 3→4 from a ratio
measured at 1→2 or 2→3 systematically over-predicts, is then clamped down to 6,
and 6 is still enough to refuse almost every next iteration. That is the whole
of the gate's behaviour: `used + lastIterWork × 6 > limit` fires long before
`used > 0.45 × limit` does.

**Recommendation unchanged, and now on measured rather than inferred grounds:
row #3 is `work-fit` alone.** `work-fit-deep` at floor 1.3 does NOT beat
`work-fit` on either column that matters — 104,108 units against 163,671 and
2.50 completed depth against 2.80, with no abort in any arm, so there is no
abort-rate argument in its favour either. No new arm is registered, as
instructed.

If the gate is worth another attempt, the lever is the ESTIMATOR, not the
clamp: predict the next depth from a ratio that decays with depth (the measured
1→2 median is 12.3 and the 2→3 median is 3.0, so a per-depth decay is visible in
16 positions' worth of data), or drop the ratio entirely and predict from
`limit - used` against the last iteration's own cost. `iterationGateFloor` is
left in place because it is the parameterisation that was asked for and it costs
one optional field, but this probe says it is inert: it should not be tuned
again without changing the estimator first.

## Files changed

- `src/ai/hard/config.ts` — `SearchConfig.iterationGate?: 'fixed45' | 'predicted'`
  and `iterationGateFloor?: number` (absent = 2).
- `src/ai/hard/search/pvs.ts` — `shouldDeepen` (floor parameterised); the
  completed-iteration cost tracking; `HardSearchStats.rung` /
  `unitsPerMsBefore` / `unitsPerMsAfter`.
- `src/ai/hard/search/probe.ts` — `RootTraceRow.work?`, the per-iteration cost
  the ratio distribution is computed from.
- `src/ai/hard/search/root.ts` — records `stats.rung` where the meter is armed.
- `src/ai/hard/engine.ts` — writes the two profile readings around `updateProfile`.
- `lab/hard-ai/ablate/arms.ts` — `deep-gate`, `work-fit-deep`, the `iterationGate`
  and `combined` factors, `factorsOf`/`maskFactor` extended.
- `lab/hard-ai/bots/hard.ts` — the per-search rows.
- `tests/lab/ablate.test.ts`, `tests/lab/turn-allowance.test.ts` — extended.

**Outside the lane's files, and flagged as asked:** `lab/harness/types.ts` gains
the `HardSeatTurnRow` interface and one optional `turnRows?` field on
`HardSeatTiming`. Additive, optional, no behaviour; the harness only carries it.
