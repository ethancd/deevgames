# hard:eval-audit — home-mate

- Generated 2026-09-17T03:16:29.197Z.
- Inputs: lab/hard-ai/suites/home-mate.positions.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 56, measured 56, skipped 0.
- Buckets: corpus 56.
- Side to move: white 28, black 28.
- Score from the side to move (cc): mean 93.18, mean |score| 5246.61, min -7789, max 7949.

## Checks

- Side swap: 0 of 56 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 8 of 56 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 8 positions (cc): mean 0.00, mean |delta| 480.00, min -480, max 480.
- Score identity `Σ w·f === full()`: 0 of 56 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 56 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 56 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| EconDelta | economy | 8 | 14.3% | five-action-rotation-exceeds-the-turn-budget-rescue: -12 vs -9; five-action-rotation-exceeds-the-turn-budget-mate: 12 vs 9; five-action-rotation-exceeds-the-turn-budget-rotated-black-rescue: -9 vs -12 |
| DepletionWaste | economy | 8 | 14.3% | five-action-rotation-exceeds-the-turn-budget-rescue: 6 vs 0; five-action-rotation-exceeds-the-turn-budget-mate: -6 vs 0; five-action-rotation-exceeds-the-turn-budget-rotated-black-rescue: 0 vs 6 |
| RelocationDebt | economy | 8 | 14.3% | five-action-rotation-exceeds-the-turn-budget-rescue: 4 vs 3; five-action-rotation-exceeds-the-turn-budget-mate: -4 vs -3; five-action-rotation-exceeds-the-turn-budget-rotated-black-rescue: 3 vs 4 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 1.12 | 1.17 | 56 |
| stage1 | 14.27 | 17.63 | 56 |
| stage2 | 16.75 | 23.21 | 56 |
| stage0plus1 | 15.39 | 18.71 | 56 |
| full | 32.13 | 37.50 | 56 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 52 | 857.14 | 3100 | 10.3% | 26/26 |
| economy | 13 | 56 | 1275.71 | 3014 | 15.3% | 28/28 |
| home | 11 | 56 | 3639.64 | 4520 | 43.6% | 28/28 |
| safety | 19 | 52 | 1414.82 | 4225 | 17.0% | 28/24 |
| space | 14 | 40 | 1158.00 | 4296 | 13.9% | 34/6 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | HomeInvaded | home | 0 | -4000 | 78.6% | 3142.86 | 4000 | 33.3% | -0.27 |
| 0 | Material | material | 0 | 100 | 92.9% | 857.14 | 3100 | 9.1% | 0.00 |
| 7 | SpawnArea | space | 1 | 30 | 21.4% | 472.50 | 2640 | 5.0% | 0.67 |
| 1 | Rent | economy | 0 | -422 | 42.9% | 452.14 | 1688 | 4.8% | 0.00 |
| 28 | Hanging | safety | 2 | -50 | 71.4% | 375.00 | 800 | 4.0% | 0.20 |
| 34 | CleaveExposure | safety | 2 | -40 | 64.3% | 361.43 | 1280 | 3.8% | 0.11 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 82.1% | 328.57 | 400 | 3.5% | -0.22 |
| 23 | EconDelta | economy | 2 | 80 | 100.0% | 308.57 | 960 | 3.3% | 0.00 |
| 33 | KillAvailable | safety | 2 | 35 | 67.9% | 261.25 | 805 | 2.8% | 0.16 |
| 24 | DepletionWaste | economy | 2 | -30 | 78.6% | 259.29 | 480 | 2.7% | 0.00 |
| 14 | HomeCountdown | home | 1 | -180 | 100.0% | 257.14 | 360 | 2.7% | 0.43 |
| 5 | PstMine | economy | 1 | 60 | 100.0% | 248.57 | 720 | 2.6% | 0.00 |
| 37 | CornerInfiltration | home | 2 | 300 | 78.6% | 235.71 | 300 | 2.5% | -0.27 |
| 30 | ApproachRetreat | safety | 2 | -25 | 50.0% | 207.14 | 800 | 2.2% | 0.00 |
| 9 | SpawnZero | space | 1 | -800 | 21.4% | 171.43 | 800 | 1.8% | 0.00 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 21.4% | 171.43 | 800 | 1.8% | 0.00 |
| 8 | SpawnReserve | space | 1 | 8 | 21.4% | 160.57 | 896 | 1.7% | 0.67 |
| 2 | BankLiquid | economy | 0 | 90 | 21.4% | 154.29 | 720 | 1.6% | 0.00 |
| 26 | Insolvency | economy | 2 | -150 | 57.1% | 128.57 | 750 | 1.4% | 0.00 |
| 17 | Exposure | safety | 1 | -20 | 92.9% | 125.71 | 300 | 1.3% | 0.00 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 42.9% | 107.14 | 250 | 1.1% | 0.00 |
| 3 | BankExcess | economy | 0 | 25 | 21.4% | 85.71 | 400 | 0.9% | 0.00 |
| 13 | HomeThreat | home | 1 | -400 | 21.4% | 85.71 | 400 | 0.9% | 1.00 |
| 19 | ActionsLeft | space | 1 | 40 | 50.0% | 80.00 | 160 | 0.8% | 1.00 |
| 10 | AnchorDepth | space | 1 | 25 | 21.4% | 71.43 | 400 | 0.8% | 0.67 |
| 25 | RunwayCliff | economy | 2 | -600 | 7.1% | 42.86 | 600 | 0.5% | 0.00 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 21.4% | 42.86 | 200 | 0.5% | 0.00 |
| 27 | RelocationDebt | economy | 2 | -60 | 28.6% | 38.57 | 240 | 0.4% | 0.00 |
| 50 | Inv13Turtle | space | 2 | -200 | 17.9% | 35.71 | 200 | 0.4% | 1.00 |
| 22 | ElementCoverage | space | 1 | 150 | 21.4% | 32.14 | 150 | 0.3% | 0.00 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 21.4% | 21.43 | 100 | 0.2% | 0.00 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 17.9% | 21.43 | 120 | 0.2% | -1.00 |
| 35 | AnchorFragility | safety | 2 | -120 | 14.3% | 17.14 | 120 | 0.2% | 0.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 42.9% | 17.14 | 40 | 0.2% | 0.00 |
| 16 | HomeRescuers | home | 1 | 90 | 17.9% | 16.07 | 90 | 0.2% | -1.00 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 10.7% | 16.07 | 150 | 0.2% | -0.33 |
| 31 | ApproachStrand | safety | 2 | -10 | 25.0% | 15.00 | 100 | 0.2% | 0.14 |
| 32 | StrandPunish | safety | 2 | 20 | 3.6% | 7.14 | 200 | 0.1% | 1.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 3.6% | 5.36 | 150 | 0.1% | -1.00 |
| 12 | CornerSeal | home | 1 | -60 | 7.1% | 4.29 | 60 | 0.0% | 0.00 |
| 6 | BankConvertible | economy | 1 | 20 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 15 | HomePlug | home | 1 | 220 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 18 | DrawPressure | space | 1 | -8 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 57.1% | 0.00 | 0 | 0.0% | 0.00 |
| 29 | HangingBuy | safety | 2 | -30 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 48 | Inv11HomeBare | home | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

17 of 58 features are zero on all 56 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 6 | BankConvertible | economy | 20 |
| 11 | Infiltration | home | 90 |
| 15 | HomePlug | home | 220 |
| 18 | DrawPressure | space | -8 |
| 20 | Corridor | space | 0 |
| 29 | HangingBuy | safety | -30 |
| 39 | Inv2CornerSeal | home | -300 |
| 42 | Inv5PoorMinerSquare | economy | -400 |
| 44 | Inv7PromoteNoRunway | economy | -600 |
| 45 | Inv8NoPreAdjacency | safety | -150 |
| 48 | Inv11HomeBare | home | -250 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 54 | Inv17SelfBlock | safety | -60 |
| 55 | Inv18WastedEndPlace | space | 0 |
| 56 | Inv19SoftMinerExposed | safety | -150 |
| 57 | Inv20StrandNoRetreat | safety | -250 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 56 positions, both features nonzero in at least 5 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| -1.000 | Inv6FragileAnchor | safety | Inv13Turtle | space | 10 |
| 1.000 | BankLiquid | economy | BankExcess | economy | 12 |
| -1.000 | BankLiquid | economy | SpawnZero | space | 12 |
| -1.000 | BankLiquid | economy | Inv1SpawnZero | space | 12 |
| 1.000 | BankLiquid | economy | Inv14LiquidityFloor | economy | 12 |
| -1.000 | BankExcess | economy | SpawnZero | space | 12 |
| -1.000 | BankExcess | economy | Inv1SpawnZero | space | 12 |
| 1.000 | BankExcess | economy | Inv14LiquidityFloor | economy | 12 |
| 1.000 | HomeInvaded | home | CornerInfiltration | home | 44 |
| 1.000 | SpawnZero | space | Inv1SpawnZero | space | 12 |
| -1.000 | SpawnZero | space | Inv14LiquidityFloor | economy | 12 |
| -1.000 | Inv1SpawnZero | space | Inv14LiquidityFloor | economy | 12 |
| 1.000 | Inv3RetreatSquare | safety | Inv12CleaveLine | safety | 24 |
| 1.000 | SpawnArea | space | SpawnReserve | space | 12 |
| 1.000 | SpawnArea | space | Inv13Turtle | space | 10 |
| -1.000 | SpawnArea | space | Inv6FragileAnchor | safety | 10 |
| 1.000 | SpawnReserve | space | Inv13Turtle | space | 10 |
| -1.000 | SpawnReserve | space | Inv6FragileAnchor | safety | 10 |
| 0.999 | SpawnReserve | space | AnchorDepth | space | 12 |
| 0.999 | SpawnArea | space | AnchorDepth | space | 12 |

