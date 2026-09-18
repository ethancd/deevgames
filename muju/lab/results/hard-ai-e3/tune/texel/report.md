# Texel instrument run

**This vector is not a candidate.** No row measured it. Enabling tuned weights as a
default is MILESTONES M20's contract: a fixed-work SPRT at work 400,000, seat-mirrored,
handicaps 0 and 3, `elo0 0 / elo1 10 / alpha = beta = 0.05`, and `src/` is written only on H1.

- corpus: `lab/results/hard-ai-e3/tune/corpus` (positions sha256 `43b66ed61183c089413768a93114e1abfb568dc523bfe7f72e4cd1553ca5401a`)
- rows: 1111 train / 224 held out, split by opening family
- iterations: 3; step schedule 100, 10, 1 cc; free parameters 74 of 76
- k: 4.261337e-4
- train log-loss: 0.639974 -> 0.600488
- held-out log-loss: 0.637823 -> 0.627661
- all integers: true; material[fire_1]: 300
- accepted steps: 8162

## Ten largest parameter moves

| kind | index | name | before | after | delta |
| --- | ---: | --- | ---: | ---: | ---: |
| material | 2 | fire_3 | 1500 | 18150 | +16650 |
| material | 4 | lightning_2 | 700 | 17350 | +16650 |
| w | 25 | RunwayCliff | -600 | -17250 | -16650 |
| w | 26 | Insolvency | -150 | -16800 | -16650 |
| w | 46 | Inv9ChipAcrossTurn | -150 | 16500 | +16650 |
| material | 7 | water_2 | 800 | 5950 | +5150 |
| material | 15 | metal_1 | 500 | -2950 | -3450 |
| w | 42 | Inv5PoorMinerSquare | -400 | 2774 | +3174 |
| w | 20 | Corridor | 0 | 2770 | +2770 |
| w | 21 | TierClimb | 0 | -1970 | -1970 |

## Per-iteration trace

| iteration | accepted steps | train log-loss | held-out log-loss |
| ---: | ---: | ---: | ---: |
| 1 | 3117 | 0.606533 | 0.621992 |
| 2 | 2605 | 0.602363 | 0.623964 |
| 3 | 2440 | 0.600488 | 0.627661 |
