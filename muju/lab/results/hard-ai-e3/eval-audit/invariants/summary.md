# hard:eval-audit — invariants

- Generated 2026-09-17T03:16:29.438Z.
- Inputs: lab/hard-ai/suites/invariants.positions.jsonl.
- Weights `default-v1` version 1, hash `15b9b4e2`.
- Positions loaded 40, measured 40, skipped 0.
- Buckets: corpus 40.
- Side to move: white 0, black 40.
- Score from the side to move (cc): mean -2042.25, mean |score| 2271.20, min -7506, max 1396.

## Checks

- Side swap: 0 of 40 positions have at least one feature where `f_i(p, side) !== -f_i(p, 1 - side)`.
- Rot180: 7 of 40 positions have at least one feature where `f_i(mirror180(p), 1 - side) !== f_i(p, side)`; 0 positions had no packable mirror.
- Rot180 score disagreement on those 7 positions (cc): mean -91.43, mean |delta| 131.43, min -340, max 80.
- Score identity `Σ w·f === full()`: 0 of 40 mismatch.
- Stage identity `stage0 + stage1 + stage2 === full()`: 0 of 40 mismatch.
- Material residual `w[Material]·f[Material] − stage0's material block`: 0 of 40 nonzero.

### Rot180 violations by feature

| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |
| --- | --- | ---: | ---: | --- |
| RelocationDebt | economy | 6 | 15.0% | inv2-corner-seal-violating: -2 vs -1; inv2-corner-seal-correct: -3 vs -1; inv4-strand-unpunished-violating: -2 vs -1 |
| EconDelta | economy | 3 | 7.5% | inv2-corner-seal-violating: 0 vs -2; inv2-corner-seal-correct: 0 vs -1; inv3-retreat-square-correct: -4 vs -3 |
| DepletionWaste | economy | 2 | 5.0% | inv2-corner-seal-violating: -10 vs -6; inv2-corner-seal-correct: -10 vs -8 |

## Cost

| stage | mean µs/call | p95 µs/call | n positions |
| --- | ---: | ---: | ---: |
| stage0 | 1.19 | 1.25 | 40 |
| stage1 | 21.34 | 26.58 | 40 |
| stage2 | 28.38 | 42.79 | 40 |
| stage0plus1 | 22.53 | 27.75 | 40 |
| full | 50.91 | 68.29 | 40 |

Cold tables: one timed pass per variant over the whole list in list order, 5 repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.

## Groups

| group | features | positions with a nonzero sum | mean \|Σ w·f\| cc | max \|Σ w·f\| cc | share of Σ\|group sum\| | +/− positions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| material | 1 | 29 | 375.00 | 2100 | 12.1% | 9/20 |
| economy | 13 | 40 | 1046.00 | 3768 | 33.6% | 2/38 |
| home | 11 | 22 | 429.75 | 1410 | 13.8% | 7/15 |
| safety | 19 | 22 | 443.50 | 2125 | 14.3% | 4/18 |
| space | 14 | 40 | 815.20 | 3286 | 26.2% | 8/32 |

## Features

| # | feature | group | stage | w | fires | mean \|w·f\| cc | max \|w·f\| cc | share of Σ\|w·f\| | sign balance |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | BankLiquid | economy | 0 | 90 | 100.0% | 506.25 | 540 | 13.1% | -1.00 |
| 7 | SpawnArea | space | 1 | 30 | 100.0% | 382.50 | 1980 | 9.9% | -0.65 |
| 0 | Material | material | 0 | 100 | 72.5% | 375.00 | 2100 | 9.7% | -0.38 |
| 5 | PstMine | economy | 1 | 60 | 95.0% | 256.50 | 780 | 6.6% | -0.63 |
| 51 | Inv14LiquidityFloor | economy | 2 | -200 | 97.5% | 195.00 | 200 | 5.0% | -1.00 |
| 23 | EconDelta | economy | 2 | 80 | 55.0% | 172.00 | 1520 | 4.4% | 0.09 |
| 50 | Inv13Turtle | space | 2 | -200 | 72.5% | 145.00 | 200 | 3.7% | -0.93 |
| 24 | DepletionWaste | economy | 2 | -30 | 85.0% | 131.25 | 420 | 3.4% | 0.41 |
| 14 | HomeCountdown | home | 1 | -180 | 47.5% | 130.50 | 360 | 3.4% | -0.47 |
| 22 | ElementCoverage | space | 1 | 150 | 85.0% | 127.50 | 150 | 3.3% | -1.00 |
| 8 | SpawnReserve | space | 1 | 8 | 100.0% | 115.60 | 656 | 3.0% | -0.65 |
| 6 | BankConvertible | economy | 1 | 20 | 100.0% | 111.50 | 160 | 2.9% | -0.95 |
| 13 | HomeThreat | home | 1 | -400 | 27.5% | 110.00 | 400 | 2.8% | -0.82 |
| 47 | Inv10HomeReachable | home | 2 | -400 | 27.5% | 110.00 | 400 | 2.8% | -0.82 |
| 1 | Rent | economy | 0 | -422 | 10.0% | 105.50 | 1688 | 2.7% | 0.00 |
| 35 | AnchorFragility | safety | 2 | -120 | 37.5% | 81.00 | 360 | 2.1% | -0.73 |
| 27 | RelocationDebt | economy | 2 | -60 | 82.5% | 79.50 | 240 | 2.1% | 0.88 |
| 10 | AnchorDepth | space | 1 | 25 | 97.5% | 76.25 | 300 | 2.0% | -0.54 |
| 40 | Inv3RetreatSquare | safety | 2 | -250 | 27.5% | 68.75 | 250 | 1.8% | -1.00 |
| 28 | Hanging | safety | 2 | -50 | 25.0% | 67.50 | 600 | 1.7% | -0.60 |
| 30 | ApproachRetreat | safety | 2 | -25 | 37.5% | 55.63 | 300 | 1.4% | -1.00 |
| 17 | Exposure | safety | 1 | -20 | 47.5% | 53.50 | 220 | 1.4% | -0.37 |
| 15 | HomePlug | home | 1 | 220 | 20.0% | 44.00 | 220 | 1.1% | 0.00 |
| 36 | BlockingDeficit | safety | 2 | -150 | 25.0% | 41.25 | 300 | 1.1% | -0.60 |
| 29 | HangingBuy | safety | 2 | -30 | 22.5% | 37.50 | 270 | 1.0% | -1.00 |
| 48 | Inv11HomeBare | home | 2 | -250 | 15.0% | 37.50 | 250 | 1.0% | -0.67 |
| 33 | KillAvailable | safety | 2 | 35 | 35.0% | 32.38 | 315 | 0.8% | -1.00 |
| 26 | Insolvency | economy | 2 | -150 | 5.0% | 30.00 | 600 | 0.8% | 1.00 |
| 56 | Inv19SoftMinerExposed | safety | 2 | -150 | 17.5% | 26.25 | 150 | 0.7% | -0.71 |
| 34 | CleaveExposure | safety | 2 | -40 | 7.5% | 26.00 | 400 | 0.7% | -0.33 |
| 9 | SpawnZero | space | 1 | -800 | 2.5% | 20.00 | 800 | 0.5% | 1.00 |
| 38 | Inv1SpawnZero | space | 2 | -800 | 2.5% | 20.00 | 800 | 0.5% | 1.00 |
| 41 | Inv4StrandUnpunished | safety | 2 | -100 | 17.5% | 17.50 | 100 | 0.5% | -0.71 |
| 44 | Inv7PromoteNoRunway | economy | 2 | -600 | 2.5% | 15.00 | 600 | 0.4% | 1.00 |
| 18 | DrawPressure | space | 1 | -8 | 5.0% | 10.60 | 392 | 0.3% | 1.00 |
| 42 | Inv5PoorMinerSquare | economy | 2 | -400 | 2.5% | 10.00 | 400 | 0.3% | 1.00 |
| 12 | CornerSeal | home | 1 | -60 | 12.5% | 9.00 | 120 | 0.2% | 1.00 |
| 31 | ApproachStrand | safety | 2 | -10 | 17.5% | 7.50 | 50 | 0.2% | -0.71 |
| 39 | Inv2CornerSeal | home | 2 | -300 | 2.5% | 7.50 | 300 | 0.2% | 1.00 |
| 57 | Inv20StrandNoRetreat | safety | 2 | -250 | 2.5% | 6.25 | 250 | 0.2% | 1.00 |
| 53 | Inv16ClockDiscipline | space | 2 | -200 | 2.5% | 5.00 | 200 | 0.1% | 1.00 |
| 45 | Inv8NoPreAdjacency | safety | 2 | -150 | 2.5% | 3.75 | 150 | 0.1% | 1.00 |
| 46 | Inv9ChipAcrossTurn | safety | 2 | -150 | 2.5% | 3.75 | 150 | 0.1% | 1.00 |
| 43 | Inv6FragileAnchor | safety | 2 | -120 | 2.5% | 3.00 | 120 | 0.1% | -1.00 |
| 16 | HomeRescuers | home | 1 | 90 | 2.5% | 2.25 | 90 | 0.1% | -1.00 |
| 54 | Inv17SelfBlock | safety | 2 | -60 | 2.5% | 1.50 | 60 | 0.0% | 1.00 |
| 49 | Inv12CleaveLine | safety | 2 | -40 | 2.5% | 1.00 | 40 | 0.0% | 1.00 |
| 3 | BankExcess | economy | 0 | 25 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 4 | HomeInvaded | home | 0 | -4000 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 11 | Infiltration | home | 1 | 90 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 19 | ActionsLeft | space | 1 | 40 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 20 | Corridor | space | 1 | 0 | 2.5% | 0.00 | 0 | 0.0% | 0.00 |
| 21 | TierClimb | space | 1 | 0 | 10.0% | 0.00 | 0 | 0.0% | 0.00 |
| 25 | RunwayCliff | economy | 2 | -600 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 32 | StrandPunish | safety | 2 | 20 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 37 | CornerInfiltration | home | 2 | 300 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 52 | Inv15UnknownAsSafe | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |
| 55 | Inv18WastedEndPlace | space | 2 | 0 | 0.0% | 0.00 | 0 | 0.0% | 0.00 |

## Features that never fire

9 of 58 features are zero on all 40 positions.

| # | feature | group | w |
| ---: | --- | --- | ---: |
| 3 | BankExcess | economy | 25 |
| 4 | HomeInvaded | home | -4000 |
| 11 | Infiltration | home | 90 |
| 19 | ActionsLeft | space | 40 |
| 25 | RunwayCliff | economy | -600 |
| 32 | StrandPunish | safety | 20 |
| 37 | CornerInfiltration | home | 300 |
| 52 | Inv15UnknownAsSafe | space | 0 |
| 55 | Inv18WastedEndPlace | space | 0 |

## Most correlated contribution pairs

Pearson r of `c_i = w[i]·f[i]` across the 40 positions, both features nonzero in at least 5 of them.

| r | feature A | group A | feature B | group B | both nonzero |
| ---: | --- | --- | --- | --- | ---: |
| 1.000 | HomeThreat | home | Inv10HomeReachable | home | 11 |
| 0.988 | SpawnArea | space | SpawnReserve | space | 40 |
| 0.986 | ApproachStrand | safety | Inv4StrandUnpunished | safety | 7 |
| 0.965 | SpawnArea | space | AnchorDepth | space | 39 |
| 0.940 | SpawnReserve | space | AnchorDepth | space | 39 |
| 0.860 | AnchorFragility | safety | BlockingDeficit | safety | 10 |
| 0.837 | ApproachRetreat | safety | Inv3RetreatSquare | safety | 11 |
| 0.830 | HomeThreat | home | AnchorFragility | safety | 10 |
| 0.830 | AnchorFragility | safety | Inv10HomeReachable | home | 10 |
| 0.820 | HomeThreat | home | BlockingDeficit | safety | 9 |
| 0.820 | BlockingDeficit | safety | Inv10HomeReachable | home | 9 |
| 0.804 | HomeThreat | home | Exposure | safety | 11 |
| 0.804 | Exposure | safety | Inv10HomeReachable | home | 11 |
| 0.801 | SpawnArea | space | Inv11HomeBare | home | 6 |
| 0.772 | SpawnReserve | space | Inv11HomeBare | home | 6 |
| 0.772 | ApproachRetreat | safety | KillAvailable | safety | 14 |
| 0.768 | AnchorFragility | safety | Inv3RetreatSquare | safety | 10 |
| 0.762 | HangingBuy | safety | ApproachRetreat | safety | 8 |
| 0.761 | SpawnReserve | space | KillAvailable | safety | 14 |
| 0.730 | HomeCountdown | home | HomePlug | home | 7 |

