# E3.1 judgment decomposition — hard@desktop, fixed 25000 units

- run at 2026-09-17T04:15:18.082Z; weights `15b9b4e2`; resolved config `517637c54a3b54d7dc9fa3a23c88ca97606e55ba1851094861d88ec54d7ce62f`

## Exam judgment cases

| case | label | matched | chosen wins outright | static gap cc (expected − chosen) | searched expected cc | searched chosen cc | named term |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `authored-home-mate-cheap-invasion-one-attack-mate-preference` | contradictory-preference | no | YES | -3978 | — | — | HomeInvaded |
| `authored-home-mate-cheap-invasion-one-attack-rotated-black-mate-preference` | matched | yes | YES | -80 | — | — | ActionsLeft |
| `authored-home-mate-clear-an-adjacent-lane-mate-preference` | contradictory-preference | no | no | 3041 | -998000 | -998000 | HomeInvaded |
| `authored-home-mate-clear-an-adjacent-lane-rotated-black-mate-preference` | contradictory-preference | no | no | 3191 | -998000 | -998000 | HomeInvaded |
| `authored-home-mate-zero-attack-occupier-mate-preference` | matched | yes | no | 528 | -998000 | -998000 | SpawnArea |
| `authored-home-mate-zero-attack-occupier-rotated-black-mate-preference` | matched | yes | no | 678 | -998000 | -998000 | SpawnArea |
| `loss-g3-s1_0_1-B-white-t6` | search-not-eval | no | no | 822 | 1657 | 1657 | Material |
| `loss-g2-s20_3_15-A-white-t3` | eval-blind | no | no | 0 | 2293 | 2293 | Material |
| `loss-g2-s20_3_15-B-white-t7` | search-not-eval | no | no | 1540 | -2647 | -739 | EconDelta |
| `loss-g2-s5_0_2-A-white-t4` | weight-scale | no | no | -208 | 1554 | 1554 | Material |
| `loss-g4-s10_0_8-A-white-t3` | weight-scale | no | no | -385 | 1415 | 1415 | EconDelta |
| `loss-g4-s10_0_8-B-white-t7` | weight-scale | no | no | -2162 | -866 | -866 | Material |
| `loss-g4-s10_3_9-A-white-t2` | search-not-eval | no | no | 421 | -725 | 2799 | Hanging |
| `loss-g4-s2_3_1-B-white-t2` | matched | yes | no | 0 | 729 | 729 | BankLiquid |
| `loss-g4-s6_0_4-A-white-t4` | unresolved | no | no | — | — | 4458 | — |
| `loss-g4-s6_3_5-A-white-t4` | unresolved | no | no | — | — | 2873 | — |
| `loss-g4-s6_3_5-B-white-t1` | weight-scale | no | no | -275 | -1739 | -1739 | Hanging |
| `loss-g5-s11_0_10-B-white-t1` | weight-scale | no | no | -409 | -2309 | -2309 | Hanging |
| `loss-g5-s11_3_11-B-white-t2` | weight-scale | no | no | -1334 | -605 | 729 | HomeThreat |
| `loss-g5-s7_3_7-A-white-t4` | unresolved | no | no | — | — | 2873 | — |
| `loss-g5-s7_3_7-B-white-t1` | weight-scale | no | no | -275 | -1739 | -1739 | Hanging |
| `e21-purchase-plus-promotion` | contradictory-preference | no | YES | 323 | — | — | BankLiquid |

## Invariant pairs

| pair | inv | penalty feature | weight | eval gap cc | label | named term |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `inv1-spawn-zero` | 1 | Inv1SpawnZero | -800 | 3446 | matched | DepletionWaste |
| `inv2-corner-seal` | 2 | Inv2CornerSeal | -300 | 30 | matched | HomeCountdown |
| `inv3-retreat-square` | 3 | Inv3RetreatSquare | -250 | -3462 | engine-bug | SpawnArea |
| `inv4-strand-unpunished` | 4 | Inv4StrandUnpunished | -100 | -2016 | weight-scale | SpawnArea |
| `inv5-poor-miner-square` | 5 | Inv5PoorMinerSquare | -400 | 2165 | matched | EconDelta |
| `inv6-fragile-anchor` | 6 | Inv6FragileAnchor | -120 | -2358 | engine-bug | SpawnArea |
| `inv7-promote-no-runway` | 7 | Inv7PromoteNoRunway | -600 | 600 | matched | Inv7PromoteNoRunway |
| `inv8-no-pre-adjacency` | 8 | Inv8NoPreAdjacency | -150 | 335 | matched | HangingBuy |
| `inv9-chip-across-turn` | 9 | Inv9ChipAcrossTurn | -150 | 150 | matched | Inv9ChipAcrossTurn |
| `inv10-home-reachable` | 10 | Inv10HomeReachable | -400 | 2557 | matched | Hanging |
| `inv11-home-bare` | 11 | Inv11HomeBare | -250 | 884 | matched | CornerSeal |
| `inv12-cleave-line` | 12 | Inv12CleaveLine | -40 | -2464 | weight-scale | SpawnArea |
| `inv13-turtle` | 13 | Inv13Turtle | -200 | 301 | matched | PstMine |
| `inv14-liquidity-floor` | 14 | Inv14LiquidityFloor | -200 | 750 | matched | BankLiquid |
| `inv15-unknown-as-safe` | 15 | Inv15UnknownAsSafe | 0 | 0 | contradictory-preference | BankLiquid |
| `inv16-clock-discipline` | 16 | Inv16ClockDiscipline | -200 | 560 | matched | DrawPressure |
| `inv17-self-block` | 17 | Inv17SelfBlock | -60 | 290 | matched | RelocationDebt |
| `inv18-wasted-end-place` | 18 | Inv18WastedEndPlace | 0 | 0 | contradictory-preference | BankLiquid |
| `inv19-soft-miner-exposed` | 19 | Inv19SoftMinerExposed | -150 | -3662 | weight-scale | SpawnArea |
| `inv20-strand-no-retreat` | 20 | Inv20StrandNoRetreat | -250 | -2318 | weight-scale | HomeThreat |

## Economy rows

| row | root victory | white units | black units | ends | enumeration closed | ends in victory | best reachable | avoid reachable |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| `relocate-fire_1-e` | victory white | 1 | 0 | 84 | yes | 84 | NO | NO |
| `relocate-fire_1-s` | victory white | 1 | 0 | 69 | yes | 69 | NO | NO |
| `relocate-water_1-e` | victory white | 1 | 0 | 40 | yes | 40 | NO | NO |
| `relocate-water_1-s` | victory white | 1 | 0 | 36 | yes | 36 | NO | NO |
| `relocate-plant_1-e` | victory white | 1 | 0 | 41 | yes | 41 | NO | NO |
| `relocate-plant_1-s` | victory white | 1 | 0 | 40 | yes | 40 | NO | NO |
| `relocate-plant_2-e` | victory white | 1 | 0 | 41 | yes | 41 | NO | NO |
| `relocate-plant_2-s` | victory white | 1 | 0 | 41 | yes | 41 | NO | NO |
| `relocate-plant_3-e` | victory white | 1 | 0 | 40 | yes | 40 | NO | NO |
| `relocate-plant_3-s` | victory white | 1 | 0 | 40 | yes | 40 | NO | NO |
| `relocate-metal_1-e` | victory white | 1 | 0 | 37 | yes | 37 | NO | NO |
| `relocate-metal_1-s` | victory white | 1 | 0 | 36 | yes | 36 | NO | NO |
| `relocate-metal_2-e` | victory white | 1 | 0 | 32 | yes | 32 | NO | NO |
| `relocate-metal_2-s` | victory white | 1 | 0 | 28 | yes | 28 | NO | NO |
| `muju-onto-4-0` | victory white | 1 | 0 | 24 | yes | 24 | NO | NO |
| `muju-onto-4-1` | victory white | 1 | 0 | 28 | yes | 28 | NO | NO |
| `muju-onto-4-2` | victory white | 1 | 0 | 31 | yes | 31 | NO | NO |
| `muju-onto-4-3` | victory white | 1 | 0 | 32 | yes | 32 | NO | NO |
| `muju-onto-4-4` | victory white | 1 | 0 | 32 | yes | 32 | NO | NO |
| `muju-onto-4-5` | victory white | 1 | 0 | 31 | yes | 31 | NO | NO |
| `muju-onto-4-6` | victory white | 1 | 0 | 28 | yes | 28 | NO | NO |
| `muju-onto-4-7` | victory white | 1 | 0 | 24 | yes | 24 | NO | NO |
| `promote-plant_1-16-0` | victory white | 1 | 0 | 198374 | no | 198374 | NO | NO |
| `promote-plant_1-8-1` | victory white | 1 | 0 | 189454 | no | 189454 | NO | NO |
| `promote-plant_2-16-2` | victory white | 1 | 0 | 294580 | no | 294580 | NO | NO |
| `promote-metal_1-16-3` | victory white | 1 | 0 | 189317 | no | 189317 | NO | NO |
| `promote-metal_2-16-4` | victory white | 1 | 0 | 298756 | no | 298756 | NO | NO |
| `promote-shadow_1-16-5` | victory white | 1 | 0 | 179942 | no | 179942 | NO | NO |
| `promote-shadow_2-16-6` | victory white | 1 | 0 | 269714 | no | 269714 | NO | NO |
| `promote-water_2-16-7` | victory white | 1 | 0 | 294990 | no | 294990 | NO | NO |

## Label counts

- exam:contradictory-preference: 4
- exam:matched: 4
- exam:search-not-eval: 3
- exam:eval-blind: 1
- exam:weight-scale: 7
- exam:unresolved: 3
- invariants:matched: 12
- invariants:engine-bug: 2
- invariants:weight-scale: 4
- invariants:contradictory-preference: 2
- economy:contradictory-preference: 30

