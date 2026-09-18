# hard:eval-audit — fuzz-1000

- Generated 2026-09-17T03:16:27.858Z.
- Inputs: lab/hard-ai/positions/fuzz-1000.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 1000, measured 1000, skipped 0.
- Buckets: corpus 1000.
- Side to move: white 522, black 478.
- Score from the side to move (cc): mean -235.73, mean |score| 2908.50, min -10646, max 10806.

## Checks

- Side swap: 0 of 1000 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 585 of 1000 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 585 positions (cc): mean 14.87, mean |delta| 211.38, min -1150, max 1440.
- Score identity `Σ w·f === full()`: 0 of 1000 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 1000 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 1000 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| RelocationDebt | economy | 501 | 50.1% | fuzz-5150-1097-11: -1 vs 0; fuzz-5150-1651-27: -10 vs -9; fuzz-5150-531-27: -2 vs -1 |
| EconDelta | economy | 342 | 34.2% | fuzz-5150-1651-27: -3 vs -4; fuzz-5150-1044-37: 5 vs 6; fuzz-5150-1726-60: 9 vs 8 |
| DepletionWaste | economy | 318 | 31.8% | fuzz-5150-1044-37: 7 vs 6; fuzz-5150-1726-60: 3 vs 6; fuzz-5150-1113-66: -11 vs -10 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 0.60 | 0.75 | 1000 |
| stage1 | 21.08 | 29.71 | 1000 |
| stage2 | 87.88 | 173.63 | 1000 |
| stage0plus1 | 21.68 | 30.33 | 1000 |
| full | 109.56 | 204.38 | 1000 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 956 | 1450.80 | 8500 | 29.9% | 449/507 |
| economy | 13 | 996 | 730.76 | 6062 | 15.1% | 459/537 |
| home | 11 | 875 | 980.89 | 4920 | 20.2% | 417/458 |
| safety | 19 | 978 | 807.33 | 3750 | 16.7% | 495/483 |
| space | 14 | 999 | 875.44 | 3491 | 18.1% | 508/491 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Material | material | 0 | 100 | 95.6% | 1450.80 | 8500 | 20.7% | -0.06 |
| 23 | EconDelta | economy | 2 | 80 | 92.8% | 708.48 | 3760 | 10.1% | -0.06 |
| 7 | SpawnArea | space | 1 | 30 | 97.4% | 569.43 | 2310 | 8.1% | -0.06 |
| 28 | Hanging | safety | 2 | -50 | 88.9% | 341.70 | 1800 | 4.9% | 0.06 |
| 27 | RelocationDebt | economy | 2 | -60 | 84.3% | 320.34 | 2340 | 4.6% | 0.04 |
| 24 | DepletionWaste | economy | 2 | -30 | 94.5% | 276.96 | 3210 | 3.9% | 0.05 |
| 1 | Rent | economy | 0 | -422 | 47.5% | 262.48 | 2532 | 3.7% | 0.04 |
| 14 | HomeCountdown | home | 1 | -180 | 56.8% | 225.36 | 540 | 3.2% | -0.04 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 54.8% | 219.20 | 400 | 3.1% | -0.08 |
| 17 | Exposure | safety | 1 | -20 | 94.5% | 212.60 | 1220 | 3.0% | 0.02 |
| 13 | HomeThreat | home | 1 | -400 | 48.2% | 192.80 | 400 | 2.7% | -0.05 |
| 4 | HomeInvaded | home | 0 | -4000 | 4.2% | 168.00 | 4000 | 2.4% | -0.24 |
| 2 | BankLiquid | economy | 0 | 90 | 78.5% | 151.20 | 720 | 2.2% | -0.15 |
| 30 | ApproachRetreat | safety | 2 | -25 | 83.5% | 145.35 | 825 | 2.1% | -0.02 |
| 5 | PstMine | economy | 1 | 60 | 61.6% | 145.32 | 1080 | 2.1% | 0.05 |
| 35 | AnchorFragility | safety | 2 | -120 | 67.2% | 141.96 | 360 | 2.0% | -0.04 |
| 8 | SpawnReserve | space | 1 | 8 | 96.7% | 122.92 | 712 | 1.7% | -0.05 |
| 10 | AnchorDepth | space | 1 | 25 | 91.8% | 109.75 | 400 | 1.6% | -0.05 |
| 36 | BlockingDeficit | safety | 2 | -150 | 59.3% | 106.35 | 300 | 1.5% | -0.06 |
| 48 | Inv11HomeBare | home | 2 | -250 | 34.4% | 86.00 | 250 | 1.2% | -0.07 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 33.7% | 84.25 | 250 | 1.2% | -0.04 |
| 33 | KillAvailable | safety | 2 | 35 | 72.3% | 79.73 | 560 | 1.1% | 0.03 |
| 15 | HomePlug | home | 1 | 220 | 35.8% | 78.76 | 220 | 1.1% | -0.13 |
| 19 | ActionsLeft | space | 1 | 40 | 48.7% | 77.92 | 160 | 1.1% | 1.00 |
| 34 | CleaveExposure | safety | 2 | -40 | 39.7% | 75.48 | 840 | 1.1% | -0.02 |
| 26 | Insolvency | economy | 2 | -150 | 8.1% | 60.00 | 750 | 0.9% | -0.38 |
| 22 | ElementCoverage | space | 1 | 150 | 37.5% | 56.25 | 150 | 0.8% | -0.02 |
| 25 | RunwayCliff | economy | 2 | -600 | 7.9% | 47.40 | 600 | 0.7% | -0.37 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 45.9% | 45.90 | 100 | 0.7% | 0.02 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 36.9% | 44.28 | 120 | 0.6% | 0.01 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 20.2% | 40.40 | 200 | 0.6% | -0.50 |
| 31 | ApproachStrand | safety | 2 | -10 | 73.5% | 39.80 | 260 | 0.6% | -0.01 |
| 29 | HangingBuy | safety | 2 | -30 | 17.7% | 36.12 | 990 | 0.5% | -0.08 |
| 6 | BankConvertible | economy | 1 | 20 | 77.6% | 35.94 | 320 | 0.5% | -0.14 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 23.8% | 35.70 | 150 | 0.5% | -0.13 |
| 9 | SpawnZero | space | 1 | -800 | 4.2% | 33.60 | 800 | 0.5% | 0.05 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 4.2% | 33.60 | 800 | 0.5% | 0.05 |
| 16 | HomeRescuers | home | 1 | 90 | 29.7% | 26.73 | 90 | 0.4% | -0.05 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 6.4% | 25.60 | 400 | 0.4% | 0.59 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 9.4% | 23.50 | 250 | 0.3% | 0.64 |
| 12 | CornerSeal | home | 1 | -60 | 27.4% | 16.74 | 120 | 0.2% | -0.01 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 10.5% | 15.75 | 150 | 0.2% | 0.83 |
| 37 | CornerInfiltration | home | 2 | 300 | 4.2% | 12.60 | 300 | 0.2% | -0.24 |
| 50 | Inv13Turtle | space | 2 | -200 | 5.3% | 10.60 | 200 | 0.2% | -0.51 |
| 18 | DrawPressure | space | 1 | -8 | 4.2% | 9.56 | 648 | 0.1% | 0.38 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 1.3% | 7.80 | 600 | 0.1% | -0.08 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 2.3% | 3.45 | 150 | 0.0% | 0.74 |
| 32 | StrandPunish | safety | 2 | 20 | 4.6% | 3.02 | 100 | 0.0% | 0.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 6.4% | 2.56 | 40 | 0.0% | -0.03 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 0.8% | 2.40 | 300 | 0.0% | -0.50 |
| 3 | BankExcess | economy | 0 | 25 | 2.5% | 1.82 | 325 | 0.0% | -0.28 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 1.7% | 1.02 | 60 | 0.0% | 0.41 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 28.0% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 47.3% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

4 of 58 features are zero on all 1000 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 11 | Infiltration | home | 90 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 55 | Inv18WastedEndPlace | space | 0 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 1000 positions, both features nonzero in at least 20 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 1.000 | HomeInvaded | home | CornerInfiltration | home | 42 |
| 1.000 | SpawnZero | space | Inv1SpawnZero | space | 42 |
| 0.997 | RunwayCliff | economy | Insolvency | economy | 79 |
| 0.944 | SpawnArea | space | SpawnReserve | space | 953 |
| 0.902 | SpawnArea | space | AnchorDepth | space | 906 |
| 0.896 | BankLiquid | economy | BankConvertible | economy | 749 |
| 0.879 | HomeThreat | home | HomeCountdown | home | 482 |
| 0.854 | DepletionWaste | economy | RelocationDebt | economy | 813 |
| 0.843 | ApproachRetreat | safety | KillAvailable | safety | 649 |
| 0.828 | SpawnReserve | space | AnchorDepth | space | 898 |
| -0.822 | Material | material | RelocationDebt | economy | 823 |
| -0.819 | Material | material | DepletionWaste | economy | 905 |
| 0.817 | AnchorFragility | safety | BlockingDeficit | safety | 569 |
| 0.806 | Hanging | safety | KillAvailable | safety | 686 |
| -0.804 | Material | material | Exposure | safety | 929 |
| 0.795 | HomeCountdown | home | HomePlug | home | 306 |
| -0.795 | EconDelta | economy | RelocationDebt | economy | 800 |
| 0.787 | HomeThreat | home | AnchorFragility | safety | 435 |
| 0.776 | Material | material | EconDelta | economy | 889 |
| -0.772 | EconDelta | economy | DepletionWaste | economy | 884 |

