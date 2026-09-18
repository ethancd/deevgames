# hard:eval-audit — openings

- Generated 2026-09-17T03:16:28.490Z.
- Inputs: lab/hard-ai/positions/openings.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 797, measured 797, skipped 0.
- Buckets: corpus 797.
- Side to move: white 0, black 797.
- Score from the side to move (cc): mean -720.84, mean |score| 753.58, min -2692, max 1469.

## Checks

- Side swap: 0 of 797 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 194 of 797 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 194 positions (cc): mean 20.26, mean |delta| 240.57, min -600, max 400.
- Score identity `Σ w·f === full()`: 0 of 797 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 797 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 797 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| RelocationDebt | economy | 168 | 21.1% | opening-013: 0 vs -1; opening-014: 0 vs -1; opening-017: -1 vs 0 |
| EconDelta | economy | 163 | 20.5% | opening-005: -6 vs -7; opening-013: -3 vs -1; opening-014: -4 vs -3 |
| DepletionWaste | economy | 163 | 20.5% | opening-005: -3 vs -2; opening-013: -1 vs -5; opening-014: -2 vs -4 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 0.54 | 0.58 | 797 |
| stage1 | 12.64 | 14.79 | 797 |
| stage2 | 26.26 | 31.37 | 797 |
| stage0plus1 | 13.18 | 15.33 | 797 |
| full | 39.44 | 46.38 | 797 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 0 | 0.00 | 0 | 0.0% | 0/0 |
| economy | 13 | 797 | 553.90 | 850 | 54.6% | 10/787 |
| home | 11 | 759 | 164.23 | 360 | 16.2% | 551/208 |
| safety | 19 | 53 | 15.94 | 855 | 1.6% | 0/53 |
| space | 14 | 797 | 279.90 | 1839 | 27.6% | 263/534 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | BankLiquid | economy | 0 | 90 | 100.0% | 498.90 | 540 | 19.4% | -1.00 |
| 5 | PstMine | economy | 1 | 60 | 100.0% | 469.76 | 900 | 18.3% | 1.00 |
| 23 | EconDelta | economy | 2 | 80 | 100.0% | 415.46 | 880 | 16.2% | -0.99 |
| 19 | ActionsLeft | space | 1 | 40 | 100.0% | 160.00 | 160 | 6.2% | 1.00 |
| 7 | SpawnArea | space | 1 | 30 | 95.7% | 150.94 | 780 | 5.9% | -0.97 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 65.4% | 130.74 | 200 | 5.1% | -1.00 |
| 50 | Inv13Turtle | space | 2 | -200 | 60.2% | 120.45 | 200 | 4.7% | -1.00 |
| 14 | HomeCountdown | home | 1 | -180 | 65.0% | 116.99 | 180 | 4.5% | 1.00 |
| 6 | BankConvertible | economy | 1 | 20 | 98.6% | 108.43 | 120 | 4.2% | -1.00 |
| 24 | DepletionWaste | economy | 2 | -30 | 100.0% | 101.56 | 300 | 3.9% | 1.00 |
| 15 | HomePlug | home | 1 | 220 | 25.5% | 56.04 | 220 | 2.2% | -1.00 |
| 8 | SpawnReserve | space | 1 | 8 | 95.5% | 55.16 | 208 | 2.1% | -0.97 |
| 10 | AnchorDepth | space | 1 | 25 | 91.3% | 51.10 | 175 | 2.0% | -0.99 |
| 27 | RelocationDebt | economy | 2 | -60 | 42.4% | 31.62 | 240 | 1.2% | 0.99 |
| 12 | CornerSeal | home | 1 | -60 | 52.3% | 31.39 | 60 | 1.2% | -0.84 |
| 16 | HomeRescuers | home | 1 | 90 | 17.2% | 15.47 | 90 | 0.6% | -1.00 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 4.1% | 12.42 | 300 | 0.5% | 1.00 |
| 9 | SpawnZero | space | 1 | -800 | 1.4% | 11.04 | 800 | 0.4% | 1.00 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 1.4% | 11.04 | 800 | 0.4% | 1.00 |
| 17 | Exposure | safety | 1 | -20 | 6.6% | 8.33 | 240 | 0.3% | -1.00 |
| 18 | DrawPressure | space | 1 | -8 | 100.0% | 8.00 | 8 | 0.3% | 1.00 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 1.9% | 1.88 | 100 | 0.1% | -1.00 |
| 28 | Hanging | safety | 2 | -50 | 0.9% | 1.76 | 200 | 0.1% | -1.00 |
| 29 | HangingBuy | safety | 2 | -30 | 1.9% | 1.69 | 90 | 0.1% | -1.00 |
| 35 | AnchorFragility | safety | 2 | -120 | 0.9% | 1.05 | 120 | 0.0% | -1.00 |
| 31 | ApproachStrand | safety | 2 | -10 | 1.9% | 0.92 | 70 | 0.0% | -1.00 |
| 33 | KillAvailable | safety | 2 | 35 | 0.9% | 0.31 | 35 | 0.0% | -1.00 |
| 0 | Material | material | 0 | 100 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 1 | Rent | economy | 0 | -422 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 3 | BankExcess | economy | 0 | 25 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 4 | HomeInvaded | home | 0 | -4000 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 13 | HomeThreat | home | 1 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 22 | ElementCoverage | space | 1 | 150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 25 | RunwayCliff | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 26 | Insolvency | economy | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 30 | ApproachRetreat | safety | 2 | -25 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 32 | StrandPunish | safety | 2 | 20 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 34 | CleaveExposure | safety | 2 | -40 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 37 | CornerInfiltration | home | 2 | 300 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 48 | Inv11HomeBare | home | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

31 of 58 features are zero on all 797 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 0 | Material | material | 100 |
| 1 | Rent | economy | -422 |
| 3 | BankExcess | economy | 25 |
| 4 | HomeInvaded | home | -4000 |
| 11 | Infiltration | home | 90 |
| 13 | HomeThreat | home | -400 |
| 20 | Corridor | space | 0 |
| 21 | TierClimb | space | 0 |
| 22 | ElementCoverage | space | 150 |
| 25 | RunwayCliff | economy | -600 |
| 26 | Insolvency | economy | -150 |
| 30 | ApproachRetreat | safety | -25 |
| 32 | StrandPunish | safety | 20 |
| 34 | CleaveExposure | safety | -40 |
| 36 | BlockingDeficit | safety | -150 |
| 37 | CornerInfiltration | home | 300 |
| 40 | Inv3RetreatSquare | safety | -250 |
| 42 | Inv5PoorMinerSquare | economy | -400 |
| 43 | Inv6FragileAnchor | safety | -120 |
| 44 | Inv7PromoteNoRunway | economy | -600 |
| 45 | Inv8NoPreAdjacency | safety | -150 |
| 46 | Inv9ChipAcrossTurn | safety | -150 |
| 47 | Inv10HomeReachable | home | -400 |
| 48 | Inv11HomeBare | home | -250 |
| 49 | Inv12CleaveLine | safety | -40 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 53 | Inv16ClockDiscipline | space | -200 |
| 54 | Inv17SelfBlock | safety | -60 |
| 55 | Inv18WastedEndPlace | space | 0 |
| 56 | Inv19SoftMinerExposed | safety | -150 |
| 57 | Inv20StrandNoRetreat | safety | -250 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 797 positions, both features nonzero in at least 16 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 0.902 | SpawnArea | space | AnchorDepth | space | 720 |
| 0.888 | BankLiquid | economy | Inv14LiquidityFloor | economy | 521 |
| 0.888 | SpawnArea | space | SpawnReserve | space | 761 |
| -0.867 | PstMine | economy | EconDelta | economy | 797 |
| 0.797 | HomeCountdown | home | HomePlug | home | 0 |
| 0.751 | AnchorDepth | space | Inv13Turtle | space | 480 |
| 0.729 | SpawnReserve | space | AnchorDepth | space | 718 |
| -0.678 | EconDelta | economy | Inv14LiquidityFloor | economy | 521 |
| 0.658 | BankLiquid | economy | BankConvertible | economy | 786 |
| 0.651 | SpawnArea | space | Exposure | safety | 53 |
| 0.630 | SpawnArea | space | Inv13Turtle | space | 480 |
| 0.630 | AnchorDepth | space | Exposure | safety | 53 |
| -0.606 | BankLiquid | economy | EconDelta | economy | 797 |
| 0.594 | PstMine | economy | Inv14LiquidityFloor | economy | 521 |
| 0.572 | SpawnReserve | space | Inv13Turtle | space | 478 |
| 0.565 | BankConvertible | economy | Inv14LiquidityFloor | economy | 510 |
| 0.549 | BankLiquid | economy | PstMine | economy | 797 |
| 0.522 | CornerSeal | home | Inv2CornerSeal | home | 33 |
| 0.509 | DepletionWaste | economy | RelocationDebt | economy | 338 |
| 0.476 | BankLiquid | economy | RelocationDebt | economy | 338 |

