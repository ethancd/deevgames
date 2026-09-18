# hard:eval-audit — exam-dev

- Generated 2026-09-17T03:16:29.763Z.
- Inputs: lab/hard-ai/exam/cases/dev.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 149, measured 149, skipped 0.
- Buckets: authored 133, loss-root 16.
- Side to move: white 120, black 29.
- Score from the side to move (cc): mean 115.74, mean |score| 2865.11, min -8184, max 7949.

## Checks

- Side swap: 0 of 149 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 17 of 149 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 17 positions (cc): mean 51.76, mean |delta| 242.35, min -460, max 720.
- Score identity `Σ w·f === full()`: 0 of 149 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 149 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 149 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| RelocationDebt | economy | 16 | 10.7% | authored-tactics-tactics-two-lanes-plant_3-vs-fire_3: 6 vs 3; authored-tactics-tactics-chipped-plant_3-vs-fire_3: 3 vs 1; authored-tactics-tactics-plugged-water_1-vs-fire_3: -3 vs -2 |
| EconDelta | economy | 12 | 8.1% | authored-tactics-tactics-two-lanes-plant_3-vs-fire_3: 11 vs 6; authored-tactics-tactics-plugged-water_1-vs-fire_3: 9 vs 7; authored-tactics-tactics-plugged-water_2-vs-fire_3: 5 vs 3 |
| DepletionWaste | economy | 11 | 7.4% | authored-tactics-tactics-two-lanes-plant_3-vs-fire_3: 48 vs 56; authored-tactics-tactics-plugged-water_1-vs-fire_3: -24 vs -21; authored-tactics-tactics-plugged-water_2-vs-fire_3: -24 vs -21 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 0.74 | 0.79 | 149 |
| stage1 | 11.77 | 18.83 | 149 |
| stage2 | 27.16 | 54.79 | 149 |
| stage0plus1 | 12.51 | 19.63 | 149 |
| full | 39.67 | 75.04 | 149 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 132 | 702.68 | 3400 | 11.9% | 48/84 |
| economy | 13 | 148 | 1136.75 | 3594 | 19.2% | 97/51 |
| home | 11 | 139 | 1597.32 | 5120 | 27.0% | 58/81 |
| safety | 19 | 145 | 1180.30 | 4830 | 19.9% | 92/53 |
| space | 14 | 145 | 1307.63 | 5736 | 22.1% | 93/52 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | HomeInvaded | home | 0 | -4000 | 22.8% | 912.75 | 4000 | 12.7% | -0.29 |
| 7 | SpawnArea | space | 1 | 30 | 75.8% | 725.44 | 2640 | 10.1% | 0.03 |
| 0 | Material | material | 0 | 100 | 88.6% | 702.68 | 3400 | 9.8% | -0.27 |
| 28 | Hanging | safety | 2 | -50 | 76.5% | 363.76 | 1350 | 5.1% | 0.42 |
| 1 | Rent | economy | 0 | -422 | 51.7% | 331.37 | 1688 | 4.6% | 0.32 |
| 23 | EconDelta | economy | 2 | 80 | 85.9% | 313.56 | 1280 | 4.4% | 0.33 |
| 24 | DepletionWaste | economy | 2 | -30 | 79.9% | 279.06 | 1800 | 3.9% | -0.04 |
| 5 | PstMine | economy | 1 | 60 | 83.2% | 265.37 | 1260 | 3.7% | 0.05 |
| 34 | CleaveExposure | safety | 2 | -40 | 59.1% | 238.12 | 1360 | 3.3% | -0.20 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 58.4% | 233.56 | 400 | 3.3% | -0.54 |
| 14 | HomeCountdown | home | 1 | -180 | 83.9% | 218.66 | 540 | 3.0% | -0.07 |
| 33 | KillAvailable | safety | 2 | 35 | 89.3% | 201.78 | 910 | 2.8% | 0.38 |
| 26 | Insolvency | economy | 2 | -150 | 38.9% | 201.34 | 750 | 2.8% | 0.45 |
| 8 | SpawnReserve | space | 1 | 8 | 66.4% | 195.54 | 896 | 2.7% | 0.23 |
| 30 | ApproachRetreat | safety | 2 | -25 | 55.7% | 184.23 | 850 | 2.6% | 0.04 |
| 13 | HomeThreat | home | 1 | -400 | 43.6% | 174.50 | 400 | 2.4% | -0.38 |
| 25 | RunwayCliff | economy | 2 | -600 | 23.5% | 140.94 | 600 | 2.0% | 0.83 |
| 2 | BankLiquid | economy | 0 | 90 | 34.2% | 138.93 | 720 | 1.9% | 0.53 |
| 17 | Exposure | safety | 1 | -20 | 83.2% | 137.32 | 680 | 1.9% | 0.05 |
| 10 | AnchorDepth | space | 1 | 25 | 74.5% | 131.04 | 400 | 1.8% | 0.03 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 47.0% | 117.45 | 250 | 1.6% | 0.00 |
| 19 | ActionsLeft | space | 1 | 40 | 60.4% | 96.64 | 160 | 1.3% | 1.00 |
| 9 | SpawnZero | space | 1 | -800 | 10.1% | 80.54 | 800 | 1.1% | -0.20 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 10.1% | 80.54 | 800 | 1.1% | -0.20 |
| 37 | CornerInfiltration | home | 2 | 300 | 22.8% | 68.46 | 300 | 1.0% | -0.29 |
| 35 | AnchorFragility | safety | 2 | -120 | 40.3% | 60.40 | 360 | 0.8% | -0.37 |
| 22 | ElementCoverage | space | 1 | 150 | 36.2% | 54.36 | 150 | 0.8% | 0.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 32.9% | 54.36 | 300 | 0.8% | 0.02 |
| 27 | RelocationDebt | economy | 2 | -60 | 33.6% | 49.93 | 600 | 0.7% | -0.28 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 38.9% | 46.71 | 120 | 0.7% | -0.52 |
| 29 | HangingBuy | safety | 2 | -30 | 21.5% | 46.51 | 720 | 0.6% | 0.19 |
| 50 | Inv13Turtle | space | 2 | -200 | 21.5% | 42.95 | 200 | 0.6% | -0.25 |
| 3 | BankExcess | economy | 0 | 25 | 14.1% | 38.59 | 400 | 0.5% | -0.14 |
| 15 | HomePlug | home | 1 | 220 | 16.8% | 36.91 | 220 | 0.5% | -0.44 |
| 31 | ApproachStrand | safety | 2 | -10 | 46.3% | 32.15 | 150 | 0.4% | 0.33 |
| 48 | Inv11HomeBare | home | 2 | -250 | 12.1% | 30.20 | 250 | 0.4% | -0.56 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 14.1% | 28.19 | 200 | 0.4% | -0.05 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 22.1% | 22.15 | 100 | 0.3% | 0.03 |
| 6 | BankConvertible | economy | 1 | 20 | 27.5% | 18.66 | 180 | 0.3% | 0.41 |
| 32 | StrandPunish | safety | 2 | 20 | 12.1% | 16.11 | 300 | 0.2% | 0.78 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 4.7% | 14.09 | 300 | 0.2% | -0.43 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 6.7% | 10.07 | 150 | 0.1% | -0.60 |
| 12 | CornerSeal | home | 1 | -60 | 12.1% | 9.66 | 120 | 0.1% | -0.11 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 22.1% | 8.86 | 40 | 0.1% | -0.21 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 2.0% | 8.05 | 400 | 0.1% | 1.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 5.4% | 8.05 | 150 | 0.1% | 0.50 |
| 16 | HomeRescuers | home | 1 | 90 | 8.1% | 7.25 | 90 | 0.1% | -1.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 2.7% | 6.71 | 250 | 0.1% | 1.00 |
| 18 | DrawPressure | space | 1 | -8 | 6.0% | 0.81 | 32 | 0.0% | 1.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 3.4% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 51.7% | 0.00 | 0 | 0.0% | 0.00 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

7 of 58 features are zero on all 149 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 11 | Infiltration | home | 90 |
| 44 | Inv7PromoteNoRunway | economy | -600 |
| 45 | Inv8NoPreAdjacency | safety | -150 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 54 | Inv17SelfBlock | safety | -60 |
| 55 | Inv18WastedEndPlace | space | 0 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 149 positions, both features nonzero in at least 5 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 1.000 | HomeInvaded | home | CornerInfiltration | home | 34 |
| 1.000 | SpawnZero | space | Inv1SpawnZero | space | 15 |
| 0.981 | SpawnArea | space | AnchorDepth | space | 111 |
| 0.962 | RunwayCliff | economy | Insolvency | economy | 35 |
| 0.952 | SpawnArea | space | SpawnReserve | space | 99 |
| 0.925 | SpawnReserve | space | AnchorDepth | space | 97 |
| -0.909 | Material | material | Exposure | safety | 121 |
| 0.887 | SpawnReserve | space | Inv13Turtle | space | 31 |
| 0.861 | ApproachRetreat | safety | KillAvailable | safety | 78 |
| -0.854 | BankExcess | economy | SpawnZero | space | 12 |
| -0.854 | BankExcess | economy | Inv1SpawnZero | space | 12 |
| 0.854 | KillAvailable | safety | CleaveExposure | safety | 83 |
| 0.853 | SpawnArea | space | Inv13Turtle | space | 32 |
| 0.849 | ApproachRetreat | safety | Inv3RetreatSquare | safety | 70 |
| 0.832 | Rent | economy | Exposure | safety | 71 |
| 0.831 | BankLiquid | economy | Inv14LiquidityFloor | economy | 21 |
| -0.827 | BankLiquid | economy | SpawnZero | space | 15 |
| -0.827 | BankLiquid | economy | Inv1SpawnZero | space | 15 |
| 0.820 | Hanging | safety | KillAvailable | safety | 110 |
| 0.818 | CornerSeal | home | Inv2CornerSeal | home | 7 |

## Loss roots

16 exam cases carried over from real E1.1 losses (`source.kind === "loss"`), reported separately.

| # | feature | group | fires | mean \|w·f\| cc | share of Σ\|w·f\| |
| ---: | --- | --- | ---: | ---: | ---: |
| 7 | SpawnArea | space | 100.0% | 900.00 | 15.8% |
| 0 | Material | material | 81.3% | 543.75 | 9.5% |
| 23 | EconDelta | economy | 93.8% | 445.00 | 7.8% |
| 28 | Hanging | safety | 81.3% | 303.13 | 5.3% |
| 24 | DepletionWaste | economy | 81.3% | 294.38 | 5.2% |
| 5 | PstMine | economy | 87.5% | 255.00 | 4.5% |
| 8 | SpawnReserve | space | 100.0% | 243.50 | 4.3% |
| 14 | HomeCountdown | home | 62.5% | 213.75 | 3.8% |
| 29 | HangingBuy | safety | 81.3% | 195.00 | 3.4% |
| 1 | Rent | economy | 37.5% | 184.63 | 3.2% |
| 10 | AnchorDepth | space | 93.8% | 167.19 | 2.9% |
| 17 | Exposure | safety | 100.0% | 158.75 | 2.8% |
| 40 | Inv3RetreatSquare | safety | 62.5% | 156.25 | 2.7% |
| 30 | ApproachRetreat | safety | 75.0% | 139.06 | 2.4% |
| 2 | BankLiquid | economy | 56.3% | 112.50 | 2.0% |
| 15 | HomePlug | home | 50.0% | 110.00 | 1.9% |
| 27 | RelocationDebt | economy | 50.0% | 101.25 | 1.8% |
| 13 | HomeThreat | home | 25.0% | 100.00 | 1.8% |
| 47 | Inv10HomeReachable | home | 25.0% | 100.00 | 1.8% |
| 50 | Inv13Turtle | space | 50.0% | 100.00 | 1.8% |

