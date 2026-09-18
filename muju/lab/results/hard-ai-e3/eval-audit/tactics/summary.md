# hard:eval-audit — tactics

- Generated 2026-09-17T03:16:28.965Z.
- Inputs: lab/hard-ai/positions/tactics.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 79, measured 79, skipped 0.
- Buckets: corpus 79.
- Side to move: white 79, black 0.
- Score from the side to move (cc): mean -225.39, mean |score| 2038.84, min -8184, max 4891.

## Checks

- Side swap: 0 of 79 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 11 of 79 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 11 positions (cc): mean -29.09, mean |delta| 254.55, min -460, max 720.
- Score identity `Σ w·f === full()`: 0 of 79 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 79 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 79 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| RelocationDebt | economy | 10 | 12.7% | tactics-two-lanes-plant_3-vs-fire_3: 6 vs 3; tactics-chipped-plant_3-vs-fire_3: 3 vs 1; tactics-plugged-water_1-vs-fire_3: -3 vs -2 |
| EconDelta | economy | 7 | 8.9% | tactics-two-lanes-plant_3-vs-fire_3: 11 vs 6; tactics-plugged-water_1-vs-fire_3: 9 vs 7; tactics-plugged-water_2-vs-fire_3: 5 vs 3 |
| DepletionWaste | economy | 6 | 7.6% | tactics-two-lanes-plant_3-vs-fire_3: 48 vs 56; tactics-plugged-water_1-vs-fire_3: -24 vs -21; tactics-plugged-water_2-vs-fire_3: -24 vs -21 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 0.95 | 1.00 | 79 |
| stage1 | 13.35 | 16.25 | 79 |
| stage2 | 21.98 | 30.17 | 79 |
| stage0plus1 | 14.30 | 17.21 | 79 |
| full | 36.28 | 47.25 | 79 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 71 | 955.70 | 3400 | 16.1% | 28/43 |
| economy | 13 | 78 | 1324.91 | 3594 | 22.4% | 58/20 |
| home | 11 | 71 | 1171.65 | 5120 | 19.8% | 21/50 |
| safety | 19 | 77 | 1347.53 | 4830 | 22.8% | 56/21 |
| space | 14 | 79 | 1119.73 | 3004 | 18.9% | 54/25 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Material | material | 0 | 100 | 89.9% | 955.70 | 3400 | 12.8% | -0.21 |
| 7 | SpawnArea | space | 1 | 30 | 89.9% | 576.84 | 1770 | 7.8% | 0.10 |
| 1 | Rent | economy | 0 | -422 | 79.7% | 496.78 | 1688 | 6.7% | 0.43 |
| 28 | Hanging | safety | 2 | -50 | 89.9% | 440.51 | 1350 | 5.9% | 0.46 |
| 23 | EconDelta | economy | 2 | 80 | 94.9% | 409.11 | 1200 | 5.5% | 0.57 |
| 4 | HomeInvaded | home | 0 | -4000 | 10.1% | 405.06 | 4000 | 5.4% | -1.00 |
| 5 | PstMine | economy | 1 | 60 | 88.6% | 363.80 | 1260 | 4.9% | 0.09 |
| 26 | Insolvency | economy | 2 | -150 | 50.6% | 330.38 | 750 | 4.4% | 0.70 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 67.1% | 268.35 | 400 | 3.6% | -0.81 |
| 34 | CleaveExposure | safety | 2 | -40 | 75.9% | 266.33 | 1360 | 3.6% | -0.50 |
| 24 | DepletionWaste | economy | 2 | -30 | 83.5% | 261.65 | 1800 | 3.5% | -0.24 |
| 25 | RunwayCliff | economy | 2 | -600 | 41.8% | 250.63 | 600 | 3.4% | 0.82 |
| 33 | KillAvailable | safety | 2 | 35 | 96.2% | 232.15 | 910 | 3.1% | 0.45 |
| 13 | HomeThreat | home | 1 | -400 | 57.0% | 227.85 | 400 | 3.1% | -0.78 |
| 30 | ApproachRetreat | safety | 2 | -25 | 45.6% | 199.68 | 850 | 2.7% | -0.11 |
| 14 | HomeCountdown | home | 1 | -180 | 78.5% | 184.56 | 360 | 2.5% | -0.29 |
| 17 | Exposure | safety | 1 | -20 | 88.6% | 182.78 | 680 | 2.5% | 0.17 |
| 8 | SpawnReserve | space | 1 | 8 | 89.9% | 167.59 | 584 | 2.3% | 0.32 |
| 19 | ActionsLeft | space | 1 | 40 | 79.7% | 127.59 | 160 | 1.7% | 1.00 |
| 10 | AnchorDepth | space | 1 | 25 | 89.9% | 126.27 | 300 | 1.7% | 0.10 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 44.3% | 110.76 | 250 | 1.5% | -0.09 |
| 2 | BankLiquid | economy | 0 | 90 | 20.3% | 91.14 | 720 | 1.2% | 1.00 |
| 9 | SpawnZero | space | 1 | -800 | 10.1% | 81.01 | 800 | 1.1% | -1.00 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 10.1% | 81.01 | 800 | 1.1% | -1.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 44.3% | 75.95 | 300 | 1.0% | 0.31 |
| 27 | RelocationDebt | economy | 2 | -60 | 45.6% | 69.11 | 600 | 0.9% | -0.44 |
| 35 | AnchorFragility | safety | 2 | -120 | 43.0% | 66.84 | 360 | 0.9% | 0.00 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 48.1% | 57.72 | 120 | 0.8% | -0.16 |
| 48 | Inv11HomeBare | home | 2 | -250 | 22.8% | 56.96 | 250 | 0.8% | -0.56 |
| 22 | ElementCoverage | space | 1 | 150 | 32.9% | 49.37 | 150 | 0.7% | -0.62 |
| 31 | ApproachStrand | safety | 2 | -10 | 53.2% | 41.14 | 150 | 0.6% | 0.38 |
| 32 | StrandPunish | safety | 2 | 20 | 24.1% | 38.23 | 300 | 0.5% | 0.79 |
| 37 | CornerInfiltration | home | 2 | 300 | 10.1% | 30.38 | 300 | 0.4% | -1.00 |
| 29 | HangingBuy | safety | 2 | -30 | 5.1% | 22.78 | 450 | 0.3% | 1.00 |
| 50 | Inv13Turtle | space | 2 | -200 | 10.1% | 20.25 | 200 | 0.3% | -1.00 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 5.1% | 15.19 | 300 | 0.2% | -1.00 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 10.1% | 15.19 | 150 | 0.2% | -1.00 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 11.4% | 11.39 | 100 | 0.2% | -0.11 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 5.1% | 10.13 | 200 | 0.1% | 1.00 |
| 6 | BankConvertible | economy | 1 | 20 | 10.1% | 8.10 | 100 | 0.1% | 1.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 17.7% | 7.09 | 40 | 0.1% | -1.00 |
| 12 | CornerSeal | home | 1 | -60 | 5.1% | 6.08 | 120 | 0.1% | -1.00 |
| 3 | BankExcess | economy | 0 | 25 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 15 | HomePlug | home | 1 | 220 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 16 | HomeRescuers | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 18 | DrawPressure | space | 1 | -8 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 62.0% | 0.00 | 0 | 0.0% | 0.00 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

15 of 58 features are zero on all 79 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 3 | BankExcess | economy | 25 |
| 11 | Infiltration | home | 90 |
| 15 | HomePlug | home | 220 |
| 16 | HomeRescuers | home | 90 |
| 18 | DrawPressure | space | -8 |
| 20 | Corridor | space | 0 |
| 42 | Inv5PoorMinerSquare | economy | -400 |
| 44 | Inv7PromoteNoRunway | economy | -600 |
| 45 | Inv8NoPreAdjacency | safety | -150 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 54 | Inv17SelfBlock | safety | -60 |
| 55 | Inv18WastedEndPlace | space | 0 |
| 56 | Inv19SoftMinerExposed | safety | -150 |
| 57 | Inv20StrandNoRetreat | safety | -250 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 79 positions, both features nonzero in at least 5 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 1.000 | SpawnZero | space | Inv1SpawnZero | space | 8 |
| 1.000 | HomeInvaded | home | CornerInfiltration | home | 8 |
| 0.993 | SpawnArea | space | SpawnReserve | space | 71 |
| -0.993 | Material | material | Exposure | safety | 70 |
| -0.983 | BankConvertible | economy | Inv13Turtle | space | 8 |
| 0.978 | SpawnArea | space | AnchorDepth | space | 71 |
| 0.966 | RunwayCliff | economy | Insolvency | economy | 33 |
| 0.961 | SpawnReserve | space | AnchorDepth | space | 71 |
| -0.927 | BankLiquid | economy | ActionsLeft | space | 0 |
| 0.907 | HomeThreat | home | HomeCountdown | home | 45 |
| 0.895 | DepletionWaste | economy | RelocationDebt | economy | 33 |
| 0.884 | ApproachRetreat | safety | Inv3RetreatSquare | safety | 35 |
| 0.878 | HomeThreat | home | Inv10HomeReachable | home | 45 |
| 0.870 | Rent | economy | Exposure | safety | 57 |
| -0.862 | Material | material | Rent | economy | 57 |
| 0.852 | Hanging | safety | KillAvailable | safety | 70 |
| -0.851 | AnchorDepth | space | Inv6FragileAnchor | safety | 38 |
| 0.845 | Hanging | safety | ApproachRetreat | safety | 30 |
| 0.839 | ApproachRetreat | safety | KillAvailable | safety | 36 |
| 0.828 | KillAvailable | safety | CleaveExposure | safety | 59 |

