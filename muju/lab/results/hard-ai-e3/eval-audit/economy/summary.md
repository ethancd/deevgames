# hard:eval-audit — economy

- Generated 2026-09-17T03:16:28.715Z.
- Inputs: lab/hard-ai/positions/economy.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 30, measured 30, skipped 0.
- Buckets: corpus 30.
- Side to move: white 30, black 0.
- Score from the side to move (cc): mean 3386.57, mean |score| 3386.57, min 1111, max 5898.

## Checks

- Side swap: 0 of 30 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 0 of 30 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 0 positions (cc): mean 0.00, mean |delta| 0.00, min 0, max 0.
- Score identity `Σ w·f === full()`: 0 of 30 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 30 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 30 nonzero.

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 1.34 | 1.38 | 30 |
| stage1 | 16.39 | 19.33 | 30 |
| stage2 | 23.62 | 31.50 | 30 |
| stage0plus1 | 17.73 | 20.67 | 30 |
| full | 41.35 | 51.42 | 30 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 30 | 656.67 | 1700 | 15.7% | 30/0 |
| economy | 13 | 30 | 856.27 | 2694 | 20.5% | 24/6 |
| home | 11 | 29 | 702.33 | 1590 | 16.8% | 29/0 |
| safety | 19 | 30 | 540.00 | 540 | 12.9% | 30/0 |
| space | 14 | 30 | 1421.70 | 2968 | 34.0% | 30/0 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 | SpawnArea | space | 1 | 30 | 100.0% | 1051.00 | 2400 | 22.0% | 1.00 |
| 0 | Material | material | 0 | 100 | 100.0% | 656.67 | 1700 | 13.7% | 1.00 |
| 23 | EconDelta | economy | 2 | 80 | 93.3% | 405.33 | 640 | 8.5% | 0.57 |
| 14 | HomeCountdown | home | 1 | -180 | 96.7% | 384.00 | 540 | 8.0% | 1.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 100.0% | 300.00 | 300 | 6.3% | 1.00 |
| 10 | AnchorDepth | space | 1 | 25 | 100.0% | 247.50 | 400 | 5.2% | 1.00 |
| 35 | AnchorFragility | safety | 2 | -120 | 100.0% | 240.00 | 240 | 5.0% | 1.00 |
| 2 | BankLiquid | economy | 0 | 90 | 26.7% | 180.00 | 720 | 3.8% | 1.00 |
| 24 | DepletionWaste | economy | 2 | -30 | 86.7% | 178.00 | 840 | 3.7% | -1.00 |
| 1 | Rent | economy | 0 | -422 | 33.3% | 168.80 | 844 | 3.5% | -1.00 |
| 26 | Insolvency | economy | 2 | -150 | 20.0% | 150.00 | 750 | 3.1% | -1.00 |
| 13 | HomeThreat | home | 1 | -400 | 36.7% | 146.67 | 400 | 3.1% | 1.00 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 36.7% | 146.67 | 400 | 3.1% | 1.00 |
| 5 | PstMine | economy | 1 | 60 | 23.3% | 132.00 | 720 | 2.8% | 1.00 |
| 25 | RunwayCliff | economy | 2 | -600 | 20.0% | 120.00 | 600 | 2.5% | -1.00 |
| 19 | ActionsLeft | space | 1 | 40 | 73.3% | 117.33 | 160 | 2.5% | 1.00 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 26.7% | 53.33 | 200 | 1.1% | 1.00 |
| 6 | BankConvertible | economy | 1 | 20 | 26.7% | 48.00 | 220 | 1.0% | 1.00 |
| 48 | Inv11HomeBare | home | 2 | -250 | 10.0% | 25.00 | 250 | 0.5% | 1.00 |
| 27 | RelocationDebt | economy | 2 | -60 | 30.0% | 18.00 | 60 | 0.4% | -1.00 |
| 3 | BankExcess | economy | 0 | 25 | 13.3% | 10.00 | 75 | 0.2% | 1.00 |
| 8 | SpawnReserve | space | 1 | 8 | 73.3% | 5.87 | 8 | 0.1% | 1.00 |
| 4 | HomeInvaded | home | 0 | -4000 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 9 | SpawnZero | space | 1 | -800 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 12 | CornerSeal | home | 1 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 15 | HomePlug | home | 1 | 220 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 16 | HomeRescuers | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 17 | Exposure | safety | 1 | -20 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 18 | DrawPressure | space | 1 | -8 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 33.3% | 0.00 | 0 | 0.0% | 0.00 |
| 22 | ElementCoverage | space | 1 | 150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 28 | Hanging | safety | 2 | -50 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 29 | HangingBuy | safety | 2 | -30 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 30 | ApproachRetreat | safety | 2 | -25 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 31 | ApproachStrand | safety | 2 | -10 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 32 | StrandPunish | safety | 2 | 20 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 33 | KillAvailable | safety | 2 | 35 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 34 | CleaveExposure | safety | 2 | -40 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 37 | CornerInfiltration | home | 2 | 300 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 50 | Inv13Turtle | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

35 of 58 features are zero on all 30 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 4 | HomeInvaded | home | -4000 |
| 9 | SpawnZero | space | -800 |
| 11 | Infiltration | home | 90 |
| 12 | CornerSeal | home | -60 |
| 15 | HomePlug | home | 220 |
| 16 | HomeRescuers | home | 90 |
| 17 | Exposure | safety | -20 |
| 18 | DrawPressure | space | -8 |
| 20 | Corridor | space | 0 |
| 22 | ElementCoverage | space | 150 |
| 28 | Hanging | safety | -50 |
| 29 | HangingBuy | safety | -30 |
| 30 | ApproachRetreat | safety | -25 |
| 31 | ApproachStrand | safety | -10 |
| 32 | StrandPunish | safety | 20 |
| 33 | KillAvailable | safety | 35 |
| 34 | CleaveExposure | safety | -40 |
| 37 | CornerInfiltration | home | 300 |
| 38 | Inv1SpawnZero | space | -800 |
| 39 | Inv2CornerSeal | home | -300 |
| 40 | Inv3RetreatSquare | safety | -250 |
| 41 | Inv4StrandUnpunished | safety | -100 |
| 42 | Inv5PoorMinerSquare | economy | -400 |
| 43 | Inv6FragileAnchor | safety | -120 |
| 44 | Inv7PromoteNoRunway | economy | -600 |
| 45 | Inv8NoPreAdjacency | safety | -150 |
| 46 | Inv9ChipAcrossTurn | safety | -150 |
| 49 | Inv12CleaveLine | safety | -40 |
| 50 | Inv13Turtle | space | -200 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 54 | Inv17SelfBlock | safety | -60 |
| 55 | Inv18WastedEndPlace | space | 0 |
| 56 | Inv19SoftMinerExposed | safety | -150 |
| 57 | Inv20StrandNoRetreat | safety | -250 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 30 positions, both features nonzero in at least 5 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 1.000 | SpawnReserve | space | ActionsLeft | space | 22 |
| -1.000 | SpawnReserve | space | Inv14LiquidityFloor | economy | 0 |
| 1.000 | HomeThreat | home | Inv10HomeReachable | home | 11 |
| 1.000 | RunwayCliff | economy | Insolvency | economy | 6 |
| -1.000 | ActionsLeft | space | Inv14LiquidityFloor | economy | 0 |
| -0.997 | BankLiquid | economy | SpawnReserve | space | 0 |
| -0.997 | BankLiquid | economy | ActionsLeft | space | 0 |
| 0.997 | BankLiquid | economy | Inv14LiquidityFloor | economy | 8 |
| 0.985 | BankLiquid | economy | BankConvertible | economy | 8 |
| 0.969 | SpawnArea | space | AnchorDepth | space | 30 |
| -0.968 | BankConvertible | economy | SpawnReserve | space | 0 |
| -0.968 | BankConvertible | economy | ActionsLeft | space | 0 |
| 0.968 | BankConvertible | economy | Inv14LiquidityFloor | economy | 8 |
| -0.960 | Material | material | Rent | economy | 10 |
| -0.938 | BankConvertible | economy | EconDelta | economy | 6 |
| -0.918 | BankLiquid | economy | EconDelta | economy | 6 |
| 0.901 | PstMine | economy | BankConvertible | economy | 7 |
| 0.900 | SpawnReserve | space | EconDelta | economy | 22 |
| 0.900 | ActionsLeft | space | EconDelta | economy | 22 |
| -0.900 | EconDelta | economy | Inv14LiquidityFloor | economy | 6 |

