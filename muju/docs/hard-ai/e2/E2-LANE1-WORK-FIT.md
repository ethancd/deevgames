# E2 lane 1 — the work-fit arm: fitting the rung to the allowance

A switchable time-allocation arm, `hard@ablate:work-fit`. It changes one thing:
`chooseWork` quantises the wall-mode rung onto a √2 ladder instead of the ×2
one. `hard@desktop` is untouched, its configuration hash does not move, and
fixed-work mode never reaches the changed code.

## 1. What the quantisation protects, and what a finer ladder gives up

`time.ts`'s header says the rungs exist so that "jitter in the only three clock
reads in the whole engine … cannot move the rung and therefore cannot change
the move", and `chooseWork`'s own comment prices that at "a 5% swing in the
measured throughput". Read against the code, it is NOT protecting fixed-work
reproducibility — `hard:determinism`, `hard:perft`, the recall instrument and
every fixed-work test pass `work` directly and never call `chooseWork`. It
protects the WALL-mode move against two noisy inputs: `updateProfile`'s α = 1/4
EWMA, which tracks the box's instantaneous throughput and never settles, and
`targetMs`'s own multipliers. A ×2 ladder needs the profile to be wrong by 100%
before the rung moves, so the same position replayed on a differently loaded box
picks the same rung, spends the same work and returns the same move; it also
keeps the profile → rung → elapsed → profile loop coarse, since the rung can
only take eight values.

A √2 ladder gives up exactly that margin: a 41% throughput error now moves the
rung where 100% was needed. That is still eight times the 5% swing the header
names, and the failure mode is a rung one step off, not a different search — but
a box whose throughput genuinely halves under load now crosses two rungs instead
of one, and two runs of the same position at different loads are likelier to
differ. No hysteresis is added: the EWMA is already the damper (α = 1/4), the
rung is a floor function of it, and an oscillation between adjacent rungs costs
at most 41% of the work, bounded above by the watchdog either way. If the
equal-time row shows rung flapping, hysteresis is the next lever, and it needs
state `chooseWork` does not have today.

## 2. What the artifacts say (no new games)

Over `lab/results/hard-ai-e1/baseline/replays` (200 games, the `hard@desktop`
seat, `decisionMs` 3,000), `players[side].turnMs` per turn:

| set | seat-turns | mean turnMs | median | used / allowance | < 2,200 ms | ≥ 3,000 ms | overruns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 baseline, wall:3000 | 4,036 | 1,951 | 1,946 | 65.0% | 57.3% | 16.4% | 15.6% |
| E1.1 diag, wall:3000 | 764 | 1,893 | 1,816 | 63.1% | 61.3% | 13.1% | 12.7% |
| E1 diag, wall:8000 | 244 | 4,921 | 4,936 | 61.5% | 5.3% | 86.1% | 8.6% |

The baseline mean of 1,951 ms is E1-CLOSE-CRITIQUE B1's unpriced third, measured:
a third of the allowance is never spent. The shape is the ×2 ladder's: 57% of
turns finish under 2,200 ms — the 200,000-unit rung at the ~100 units/ms this
box delivers under load — while 16.4% sit at the deadline. The wall:8000 row is
the control: a different allowance, the same 61.5% utilisation, which is what a
multiplicative quantiser does and what a per-turn cost model would not. No
artifact records the chosen rung or per-turn work; `hardTiming` is per game
(`overruns`, `budgetExhausted`, `reSearches`), so the rung is inferred from the
time, and §4 measures it directly instead.

## 3. The arm

- Field: `HardConfig.time.ladderStep?: 'sqrt2'` (`src/ai/hard/config.ts`).
  Absent means the shipped `WORK_LADDER`. It is a STRING, not the number √2:
  the rung must be identical on every box (DESIGN F18), and `25e3 × step^k`
  would put `Math.pow` on a float in the middle of that promise. The named
  ladder is integer literals.
- Ladder: `WORK_LADDER_FINE` = 25k, 35k, 50k, 71k, 100k, 141k, 200k, 283k, 400k,
  566k, 800k, 1.13M, 1.6M, 2.26M, 3.2M (`src/ai/hard/search/time.ts`). Every ×2
  rung is still a rung, so a budget that fitted before either stays where it was
  or moves one step up — never further, and never past the budget.
- `chooseWork(profile, targetMs, time?)` takes the block; absent, it is the
  function it always was. `engine.ts` passes `this.config.time` at its one wall
  call site. Fixed-work mode does not call it.
- Registered as `work-fit`, factor `time`, in `lab/hard-ai/ablate/arms.ts`, next
  to `calib` and by the same absent-not-false discipline.

Hashes at `wall:3000`:

| engine | resolved config hash |
| --- | --- |
| `hard@desktop` / `base` | `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd` (unchanged) |
| `hard@ablate:work-fit` | `8c7369591855da0b4fc5c9766dce24ec2e2f73c6520232991dd0865473d28828` |

## 4. Mechanism check

Six loss-derived `dev` exam cases (`source.kind === 'loss'`, the E1.1 loss
roots), fresh engine per arm per case, three warm-up searches at
`targetMs = deadlineMs = 3,000` so the profile has settled, then one measured
search. `MUJU_HEAVY_SLOTS=3`, one process, about four minutes.

| case | desktop rung → work / ms | work-fit rung → work / ms |
| --- | --- | --- |
| g3-s1_0_1-B-t6 | 200k → 172,857 / 1,689 | 283k → 204,228 / 2,076 |
| g3-s1_0_1-B-t9 | 400k → 381 / 7 | 566k → 381 / 7 |
| g2-s20_3_15-A-t3 | 200k → 92,116 / 933 | 283k → 283,159 / 2,643 |
| g2-s20_3_15-B-t7 | 100k → 50,120 / 811 | 141k → 64,140 / 1,097 |
| g2-s5_0_2-A-t4 | 200k → 200,421 / 2,413 | 200k → 200,421 / 2,393 |
| g4-s10_0_8-A-t3 | 200k → 138,684 / 1,439 | 283k → 138,684 / 1,422 |

| arm | mean rung | mean work | mean ms | used / allowance | abort rate | mean depth |
| --- | --- | --- | --- | --- | --- | --- |
| `hard@desktop` | 216,667 | 109,097 | 1,215 | 40.5% | 0% | 2.50 |
| `hard@ablate:work-fit` | 292,667 | 148,502 | 1,606 | 53.5% | 0% | 2.50 |

Work per turn rises 1.36× and utilisation 40.5% → 53.5% with no abort in either
arm — the ratio the arm was asked for. Two rows are the caveat and they matter
more than the mean. `g2-s5_0_2-A-t4`'s budget already sat on a ×2 rung, so the
arm changed nothing, as designed. `g4-s10_0_8-A-t3` got the bigger rung and
spent exactly the same work: `iterativeDeepening` refuses to START an iteration
once `used > 0.45 × limit`, and 138,684 clears that gate against 283,000 as well
as against 200,000. MEAN COMPLETED DEPTH DID NOT MOVE at any of the six. So at
these positions the extra rung buys deeper partial iterations, which
`iterativeDeepening` then drops, rather than completed depths — the arm makes
the allowance reachable, it does not by itself make the search use it.

## 5. The prediction, falsifiably

At `wall:3000`, paired-seed against the same opponent as the E1 baseline:

- Mechanism (must hold, or the arm is broken rather than useless): mean turnMs
  per seat-turn rises from 1,951 to at least 2,300, and the overrun rate stays
  at or under the baseline's 15.6% + 3 points.
- Strength: Elo point estimate ≥ 0. The arm is REJECTED if the point estimate is
  below 0, or if its 95% interval's upper bound is below +10 — the rule that
  rejected `calib` at −27. A row that raises work 1.36× and does not move Elo is
  evidence for the §4 caveat (the 0.45 gate, not the ladder, is the binding
  constraint), and the follow-up is that gate, not a finer ladder.

## 6. Risks

- The A16 EWMA and the rung are a loop. Throughput is measured as
  `work / elapsedMs`, which is rung-independent in principle, so a bigger rung
  should not bias the profile — but P6's unpriced prover means `work` understates
  a generation-heavy turn, and a longer search has a different node mix. A rung
  change can therefore shift the measured throughput level, and with a finer
  ladder that shift is likelier to cross a rung boundary.
- P6 interacts directly. A rung one step up funds more root candidates and so
  more full-prover calls, which are counted and not priced; the exploded turns in
  `P6-TURN-TIME-EXPLOSION.md` were unbounded by the meter and bounded only by the
  deadline. The 20-second cap applies to this arm exactly as to the champion, and
  the watchdog is unchanged.
- The arm is wall-mode only. Nothing about fixed-work determinism changes; the
  byte-identity tests from the root-exposure lane and `hard:determinism` are
  untouched by construction.

## 7. Files changed

- `src/ai/hard/config.ts` — `TimeConfig.ladderStep?: 'sqrt2'`, optional and unset
  on every shipped shape.
- `src/ai/hard/search/time.ts` — `WORK_LADDER_FINE`; `chooseWork` takes an
  optional `TimeConfig`; the quantisation rationale written down.
- `src/ai/hard/engine.ts` — one call site passes `this.config.time`.
- `lab/hard-ai/ablate/arms.ts` — the `work-fit` arm; `factorsOf`'s `time` string
  carries `ladderStep` so the one-factor invariant covers it.
- `tests/lab/ablate.test.ts` — the arm's registration, the champion's hash, and
  a sweep proving the fine ladder only ever fits tighter.

Scoped tests, all green:

```
npx tsc --noEmit        exit 0
npm run hard:types      exit 0

npx vitest run tests/ai/hard/root-exposure tests/ai/hard/determinism tests/ai/hard/deadline \
  tests/ai/hard/calibrate-cold tests/ai/hard/interfaces tests/ai/hard/p6-stoppable-generation \
  tests/ai/hard-engine-fallback-elapsed tests/ai/worker-turn tests/lab/ablate tests/lab/turn-allowance
 Test Files  10 passed (10)
      Tests  169 passed (169)
   Duration  443.34s
```

Read-only dependency outside the lane: `lab/hard-ai/exam/format.ts`
(`loadStratum`, `loadCaseState`, `withExamRules`) for §4's positions; not edited.

## Addendum — the probe re-run on the RIGHT positions (opening critique B1/C4)

The probe is now in the tree: `lab/hard-ai/bench/arm-probe.ts`
(`npm run hard:arm-probe`), artifact
`lab/results/hard-ai-e2/probe/work-fit-12/probe.json`. Two things were wrong
with the scratch version and both are fixed here:

1. The positions. They now come from `reconstruct(replay).bySide[side]` selected
   by `turnNumber` inside the replay's own `withMatchRules`, with the config
   from `resolveHardConfig(hardProfileOf(<the seat's engineLabel>))` — lane 2's
   two resolutions. The check that this is right: `hard@desktop` now reproduces
   the turn the seat actually played on **12 of 12** positions. The scratch
   version reproduced almost none.
2. My own config bug, caught by this probe's first run: spreading
   `armHardConfig(arm)` over the resolved base reverts the WEIGHTS to
   `DESKTOP`'s placeholder vector, so the arm was being measured against a
   different evaluation as well as a different ladder. Two arms reported
   different work at the same rung, which one config field cannot do. The arm's
   PATCH is now spread instead.

12 distinct positions (the sweep's 14 minus B1's two duplicates), wall:3000,
3 warm-ups then 1 measured:

| arm | mean rung | mean work | mean ms | used/allowance | abort | mean depth | units/ms | plays adviser's best | reproduces played |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hard@desktop` | 183,333 | 166,940 | 1,948 | 64.9% | 0% | 2.17 | 83 | 0/12 | 12/12 |
| `work-fit` | 202,000 | 182,940 | 2,157 | 71.9% | 0% | 2.17 | 84 | 0/12 | 12/12 |

Per position, the rung moves on 3 of 12 (`g2-s20_3_15-B` t7 100k→200k,
`g4-s10_0_8-B` t7 100k→141k, `g4-s10_3_9-A` t2 200k→283k with the same work
spent) and **the chosen move is identical on all 12**.

**This weakens the case for row 3 and I am saying so.** The 1.36× work figure in
§4 above and the 1.23× in `E2-LANE1-DEEP-GATE.md` were measured on the
mis-reconstructed positions; on the right ones the arm buys +9.6% work and +7
points of utilisation, not +36%, and it changes no move on the very turns the
sweep says are decided between 200k and 400k. The reason is visible in the
units/ms column: at this box's real warmed rate of ~83 units/ms a 3,000 ms
allowance is a ~249,000-unit budget, which lands on 200,000 under BOTH ladders —
283,000 is out of reach unless the box is running at 94+ units/ms. The √2 ladder
can only pay where the budget falls in a gap, and at this rate it usually does
not.

What that means for the row: the mechanism prediction in §5 (mean turnMs 1,951 →
≥ 2,300) is unlikely to hold at 83 units/ms, and a row that does not move the
mechanism cannot price the hypothesis. Before spending 32 pairs on it, either
re-measure the box's warmed rate under the row's real load (the per-turn
instrument now records `unitsPerMs` per turn, so the first few games would say),
or drop `work-fit` and take the evidence where it now points: the gap is not the
ladder's quantisation but that 200,000 units is what a 3,000 ms turn buys on
this box, while the sweep says these losses need 283,000-400,000.

## Real-game measurement: the instrumented mini-row (coordinator, 2026-09-17 01:29Z)

A 4-pair `hard@ablate:work-fit` vs `hard@desktop` run at wall:3000 on
development openings (`e1-dev.jsonl --openings-skip 44`, seed 1, one shard,
while the 47-loss analysis held the other slot). It is a measurement of the
per-turn instrument, not a row: 8 games decide nothing (3/0/5, −89 [−284,
+61]). Artifacts: `lab/results/hard-ai-e2/ablate/work-fit/mini-instrumented/`.

| seat | turns | rung histogram | mean work | aborted searches | units/ms median (p25, p75) |
| --- | --- | --- | --- | --- | --- |
| `hard@desktop` | 195 | 100k ×65, 200k ×122, 400k ×8 | 137,768 | 24 (12.3%) | 80 (62, 94) |
| `work-fit` | 195 | 100k ×20, 141k ×53, 200k ×79, 283k ×35, 566k ×8 | 156,481 | 41 (21.0%) | 78 (61, 92) |

Readings, stated plainly:

- Under row load this box delivers ~80 units/ms, so a 3,000 ms allowance is a
  ~240k budget. The champion spends a third of its turns on the 100k rung and
  most of the rest on 200k; mean work 138k. The 283k–400k band the sweep says
  the analysed losses need is above what wall:3000 buys here on almost every
  turn.
- The √2 ladder raises mean work by 14% and doubles the abort rate (12% →
  21%): the 283k rung is chosen on 35 turns and the throughput then drops
  under it. More rungs near the budget means more deadline cuts, whose
  iterations are dropped. This is the mechanism lane 1 predicted and the
  reason `work-fit` stays unpriced.
- The comparison that matters for the product is not this one: the browser
  allowance is 8,000 ms (A5 release row at wall:8000), a ~640k budget at this
  rate, which reaches every flip the sweep found. The E1 wall:8000 check
  (8 pairs, 12/4 vs `aiv2-hard`) is the only strength number at that
  allowance. E6's release row must be read with this in mind; E2–E4 rows at
  wall:3000 are a harsher regime than the one the product plays.
