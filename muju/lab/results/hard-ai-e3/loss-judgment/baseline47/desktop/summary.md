# E3.1 loss judgment — `baseline47`

Generated 2026-09-17T06:35:06.056Z by `lab/hard-ai/audit/loss-judgment.ts`.
41 analysed turns, 39 distinct positions, weights `default-v1` version 1 (the champion's).
Judge 2 allowance: 8000 ms per turn for `aiv2-hard`, seed 20260917.

All static scores are centi-crystals FROM THE SEAT that lost, at the turn's end state.
`static Δ` is adviser minus played; positive means the champion's own static evaluation prefers the adviser's turn.
`searched Δ` is the same difference in `RootCandidate.scoreCc` at 400k units; those are fail-low bounds, so an exact 0 means "searched, not preferred", not "equal".

| position | seat | turn | class | static A | static P | static Δ | searched Δ | flip work | aiv2-hard | verdict |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `e1-g2-s680_3_79-B-white` + `e1-g5-s195_3_77-B-white` | black | 3 | fixed-work-divergence | 624 | 1819 | -1195 | +1359 | never | unknown | static-prefers-played |
| `e1-g3-s165_0_66-B-white` | black | 2 | strong-candidate-misjudged | 986 | 986 | +0 | +0 | never | unknown | static-indifferent |
| `e1-g3-s375_3_51-A-white` + `e1-g4-s470_3_49-A-white` | white | 2 | fixed-work-divergence | -1744 | -1642 | -102 | +2032 | never | unknown | static-prefers-played |
| `e1-g3-s625_0_42-B-white` | black | 5 | fixed-work-divergence | 7982 | 8189 | -207 | +757 | never | unknown | static-prefers-played |
| `e1-g4-s1030_0_60-A-white` | white | 8 | fixed-work-divergence | 7871 | 9429 | -1558 | +2245 | never | unknown | static-prefers-played |
| `e1-g4-s250_0_16-B-white` | black | 3 | fixed-work-divergence | 2975 | 2983 | -8 | +468 | never | unknown | static-prefers-played |
| `e1-g4-s250_3_17-B-white` | black | 3 | strong-candidate-misjudged | 1318 | 1402 | -84 | +0 | never | unknown | static-prefers-played |
| `e1-g4-s30_3_81-B-white` | black | 4 | fixed-work-divergence | 5646 | 6655 | -1009 | +3814 | never | unknown | static-prefers-played |
| `e1-g4-s430_0_36-B-white` | black | 5 | strong-candidate-misjudged | 2236 | 2826 | -590 | +0 | never | unknown | static-prefers-played |
| `e1-g4-s50_0_68-A-white` | white | 2 | strong-candidate-misjudged | 3047 | 4995 | -1948 | +0 | never | unknown | static-prefers-played |
| `e1-g4-s50_3_69-A-white` | white | 2 | fixed-work-divergence | 4344 | 3212 | +1132 | +1903 | never | unknown | static-and-search-agree-on-adviser |
| `e1-g4-s550_3_31-B-white` | black | 3 | fixed-work-divergence | 1557 | 1561 | -4 | +51 | never | unknown | static-prefers-played |
| `e1-g4-s730_0_20-A-white` | white | 4 | strong-candidate-misjudged | 2802 | 3096 | -294 | +0 | never | unknown | static-prefers-played |
| `e1-g4-s730_0_20-B-white` | black | 2 | fixed-work-divergence | 3280 | 3296 | -16 | +385 | never | unknown | static-prefers-played |
| `e1-g4-s750_0_18-A-white` | white | 4 | fixed-work-divergence | 1862 | 2838 | -976 | +67 | never | unknown | static-prefers-played |
| `e1-g4-s750_0_18-B-white` | black | 1 | strong-candidate-misjudged | 407 | 67 | +340 | +0 | never | unknown | static-prefers-adviser-search-does-not |
| `e1-g4-s830_0_52-B-white` | black | 3 | strong-candidate-misjudged | 4239 | 4374 | -135 | +0 | never | unknown | static-prefers-played |
| `e1-g4-s850_3_95-B-white` | black | 3 | strong-candidate-misjudged | 1383 | 1780 | -397 | +0 | never | unknown | static-prefers-played |
| `e1-g5-s255_0_54-A-white` | white | 6 | fixed-work-divergence | 6911 | 7087 | -176 | +261 | never | unknown | static-prefers-played |
| `e1-g5-s255_0_54-B-white` | black | 2 | strong-candidate-misjudged | 2931 | 210 | +2721 | +0 | never | unknown | static-prefers-adviser-search-does-not |
| `e1-g5-s315_0_86-A-white` | white | 2 | strong-candidate-misjudged | 4656 | 4656 | +0 | +0 | never | unknown | static-indifferent |
| `e1-g5-s315_3_87-A-white` | white | 4 | strong-candidate-misjudged | 4401 | 3638 | +763 | -1038 | never | unknown | static-prefers-adviser-search-does-not |
| `e1-g5-s315_3_87-B-white` | black | 1 | strong-candidate-misjudged | 420 | 2260 | -1840 | +0 | never | unknown | static-prefers-played |
| `e1-g5-s415_3_41-A-white` | white | 4 | fixed-work-divergence | -1493 | 2348 | -3841 | +247 | never | unknown | static-prefers-played |
| `e1-g5-s415_3_41-B-white` | black | 5 | fixed-work-divergence | 953 | 420 | +533 | +1986 | never | unknown | static-and-search-agree-on-adviser |
| `e1-g5-s555_0_98-B-white` | black | 2 | strong-candidate-misjudged | 984 | 1438 | -454 | +0 | never | unknown | static-prefers-played |
| `e1-g5-s915_3_97-B-white` | black | 3 | strong-candidate-misjudged | 1267 | 1493 | -226 | +0 | never | unknown | static-prefers-played |
| `e1-g5-s935_3_57-A-white` | white | 11 | strong-candidate-misjudged | -2485 | -1670 | -815 | +0 | never | unknown | static-prefers-played |
| `e1-g5-s935_3_57-B-white` | black | 2 | fixed-work-divergence | 908 | -205 | +1113 | +1643 | never | unknown | static-and-search-agree-on-adviser |
| `e1-g5-s955_0_90-B-white` | black | 5 | fixed-work-divergence | 4005 | 4403 | -398 | +348 | never | unknown | static-prefers-played |
| `e1-g5-s975_0_46-A-white` | white | 3 | fixed-work-divergence | 1412 | 1693 | -281 | +3388 | never | unknown | static-prefers-played |
| `e1-g5-s975_0_46-B-white` | black | 1 | fixed-work-divergence | 41 | 347 | -306 | +1817 | never | unknown | static-prefers-played |
| `g3-s45_0_10-B-white` | black | 3 | strong-candidate-misjudged | 3237 | 684 | +2553 | +0 | never | unknown | static-prefers-adviser-search-does-not |
| `g3-s45_3_11-A-white` | white | 1 | strong-candidate-misjudged | 568 | 644 | -76 | +0 | never | unknown | static-prefers-played |
| `g3-s45_3_11-B-white` | black | 8 | fixed-work-divergence | -2450 | -3007 | +557 | +1732 | never | unknown | static-and-search-agree-on-adviser |
| `g4-s30_0_2-B-white` | black | 6 | strong-candidate-misjudged | 8858 | 9818 | -960 | -346 | never | unknown | static-prefers-played |
| `g4-s30_3_3-A-white` | white | 4 | fixed-work-divergence | 818 | -965 | +1783 | +2883 | never | unknown | static-and-search-agree-on-adviser |
| `g5-s31_0_4-B-white` | black | 1 | strong-candidate-misjudged | -1042 | -633 | -409 | +0 | never | unknown | static-prefers-played |
| `g5-s31_3_5-B-white` | black | 2 | fixed-work-divergence | 743 | 2204 | -1461 | +2079 | never | unknown | static-prefers-played |

## Judges, per position

`mat gap` is seat material minus opponent material in catalogue crystals; `P` at the played end state, then the seat's own turn 3 and 6 later.
`aiv2 Δ` is the champion's static score of `aiv2-hard`'s own end state minus its score of the played end state, from the seat.
`nearer` is which candidate end state aiv2's lies nearer to in contribution space (L1 over the 58 weighted contributions).

| position | result | mat gap P | +3 | +6 | home lost +6 | aiv2 Δ vs played | aiv2 Δ vs adviser | nearer | top-5 with adviser |
| --- | --- | ---: | ---: | ---: | :-: | ---: | ---: | --- | ---: |
| `e1-g2-s680_3_79-B-white` | loss home-checkmate | -7 | -21 | -33 | no | - | - | - | - |
| `e1-g3-s165_0_66-B-white` | loss home-checkmate | +1 | -37 | -51 | no | - | - | - | - |
| `e1-g3-s375_3_51-A-white` | loss elimination | -3 | -8 | -28 | no | - | - | - | - |
| `e1-g3-s625_0_42-B-white` | loss home-checkmate | -11 | -30 | -17 | no | - | - | - | - |
| `e1-g4-s1030_0_60-A-white` | loss elimination | -35 | -38 | -17 | no | - | - | - | - |
| `e1-g4-s250_0_16-B-white` | loss elimination | +7 | -34 | -74 | no | - | - | - | - |
| `e1-g4-s250_3_17-B-white` | loss elimination | +1 | +11 | +9 | no | - | - | - | - |
| `e1-g4-s30_3_81-B-white` | loss home-checkmate | +13 | -17 | -68 | no | - | - | - | - |
| `e1-g4-s430_0_36-B-white` | loss elimination | +7 | -14 | -36 | no | - | - | - | - |
| `e1-g4-s50_0_68-A-white` | loss elimination | +9 | -9 | -11 | no | - | - | - | - |
| `e1-g4-s50_3_69-A-white` | loss elimination | +3 | -20 | -53 | no | - | - | - | - |
| `e1-g4-s550_3_31-B-white` | loss elimination | +4 | +1 | -11 | no | - | - | - | - |
| `e1-g4-s730_0_20-A-white` | loss upkeep-elimination | +5 | -20 | -18 | no | - | - | - | - |
| `e1-g4-s730_0_20-B-white` | loss home-checkmate | +1 | -17 | +8 | no | - | - | - | - |
| `e1-g4-s750_0_18-A-white` | loss elimination | +8 | -13 | -16 | no | - | - | - | - |
| `e1-g4-s750_0_18-B-white` | loss home-checkmate | +0 | -5 | -26 | no | - | - | - | - |
| `e1-g4-s830_0_52-B-white` | loss home-checkmate | +9 | +15 | +1 | no | - | - | - | - |
| `e1-g4-s850_3_95-B-white` | loss home-checkmate | -9 | -39 | -56 | no | - | - | - | - |
| `e1-g5-s255_0_54-A-white` | loss elimination | +2 | -13 | -28 | no | - | - | - | - |
| `e1-g5-s255_0_54-B-white` | loss elimination | +1 | -31 | -86 | no | - | - | - | - |
| `e1-g5-s315_0_86-A-white` | loss elimination | +7 | +1 | -13 | no | - | - | - | - |
| `e1-g5-s315_3_87-A-white` | loss elimination | -4 | -40 | -36 | no | - | - | - | - |
| `e1-g5-s315_3_87-B-white` | loss elimination | +3 | -3 | -2 | no | - | - | - | - |
| `e1-g5-s415_3_41-A-white` | loss home-checkmate | +1 | -31 | -34 | no | - | - | - | - |
| `e1-g5-s415_3_41-B-white` | loss elimination | +13 | -8 | -8 | no | - | - | - | - |
| `e1-g5-s555_0_98-B-white` | loss home-checkmate | +6 | -14 | -52 | no | - | - | - | - |
| `e1-g5-s915_3_97-B-white` | loss home-checkmate | -4 | -14 | - | - | - | - | - | - |
| `e1-g5-s935_3_57-A-white` | loss home-checkmate | -32 | -59 | - | - | - | - | - | - |
| `e1-g5-s935_3_57-B-white` | loss elimination | -3 | -11 | -40 | no | - | - | - | - |
| `e1-g5-s955_0_90-B-white` | loss home-checkmate | +16 | +7 | +1 | no | - | - | - | - |
| `e1-g5-s975_0_46-A-white` | loss elimination | +9 | -36 | - | - | - | - | - | - |
| `e1-g5-s975_0_46-B-white` | loss elimination | +0 | -17 | -25 | no | - | - | - | - |
| `g3-s45_0_10-B-white` | loss elimination | +5 | -27 | -88 | no | - | - | - | - |
| `g3-s45_3_11-A-white` | loss home-checkmate | +0 | -3 | +8 | no | - | - | - | - |
| `g3-s45_3_11-B-white` | loss elimination | -43 | -94 | -137 | no | - | - | - | - |
| `g4-s30_0_2-B-white` | loss home-checkmate | -13 | -23 | -40 | no | - | - | - | - |
| `g4-s30_3_3-A-white` | loss home-checkmate | +5 | -1 | +0 | no | - | - | - | - |
| `g5-s31_0_4-B-white` | loss elimination | +0 | -12 | -26 | no | - | - | - | - |
| `g5-s31_3_5-B-white` | loss elimination | +1 | -15 | -50 | no | - | - | - | - |

## Where each position is routed

- `static-prefers-adviser-search-does-not`: the leaf evaluation already prefers the adviser's end state and the depth-3 search does not. That is a search or leaf problem (E4), not a judgment problem.
- `static-prefers-played`: the leaf evaluation prefers the played end state. That is a judgment problem and E3.2 material.
- `static-indifferent`: the two end states score the same statically.

## Verdict counts

- static-prefers-played: 28
- static-indifferent: 2
- static-and-search-agree-on-adviser: 5
- static-prefers-adviser-search-does-not: 4

## Judge 2 (`aiv2-hard`, foreign engine)

- picks the unknown: 39

## Group ranking (all distinct positions)

| group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc | mean Δ cc | max \|Δ\| | at |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| safety | 30 | 13 | 17 | -4305 | 18065 | -143 | 2515 | e1-g5-s415_3_41-A-white t4 |
| space | 36 | 12 | 24 | -4059 | 17341 | -113 | 1691 | e1-g5-s415_3_41-A-white t4 |
| economy | 32 | 16 | 16 | +1443 | 14217 | +45 | 1742 | e1-g4-s30_3_81-B-white t4 |
| material | 22 | 11 | 11 | +500 | 7500 | +23 | 1000 | e1-g5-s415_3_41-B-white t5 |
| home | 10 | 6 | 4 | -1850 | 4970 | -185 | 3110 | e1-g4-s30_3_81-B-white t4 |

## Feature ranking (all distinct positions, top 20 by Σ |Δ|)

| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc | max \|Δ\| | at |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Hanging | safety | 24 | 11 | 13 | -1100 | 10200 | 1400 | g3-s45_3_11-B-white t8 |
| SpawnArea | space | 34 | 14 | 20 | -900 | 10140 | 1050 | e1-g5-s415_3_41-A-white t4 |
| Material | material | 22 | 11 | 11 | +500 | 7500 | 1000 | e1-g5-s415_3_41-B-white t5 |
| EconDelta | economy | 29 | 12 | 17 | -80 | 6160 | 800 | e1-g5-s415_3_41-B-white t5 |
| PstMine | economy | 27 | 15 | 12 | +960 | 5880 | 540 | e1-g5-s415_3_41-B-white t5 |
| DepletionWaste | economy | 31 | 12 | 19 | -1140 | 4620 | 390 | e1-g5-s315_3_87-A-white t4 |
| HomeInvaded | home | 1 | 0 | 1 | -4000 | 4000 | 4000 | e1-g4-s30_3_81-B-white t4 |
| Exposure | safety | 23 | 12 | 11 | -100 | 3860 | 580 | e1-g5-s415_3_41-A-white t4 |
| ApproachRetreat | safety | 18 | 7 | 11 | -1725 | 3775 | 550 | g3-s45_3_11-B-white t8 |
| RelocationDebt | economy | 21 | 10 | 11 | -60 | 3420 | 720 | e1-g3-s625_0_42-B-white t5 |
| HangingBuy | safety | 18 | 9 | 9 | +1050 | 3150 | 930 | e1-g3-s625_0_42-B-white t5 |
| Inv13Turtle | space | 15 | 9 | 6 | +600 | 3000 | 200 | e1-g2-s680_3_79-B-white t3 |
| SpawnReserve | space | 34 | 13 | 21 | -272 | 2608 | 264 | e1-g3-s625_0_42-B-white t5 |
| Rent | economy | 6 | 5 | 1 | +1688 | 2532 | 422 | e1-g3-s625_0_42-B-white t5 |
| Inv3RetreatSquare | safety | 9 | 5 | 4 | +0 | 2500 | 500 | e1-g5-s415_3_41-A-white t4 |
| KillAvailable | safety | 22 | 12 | 10 | +210 | 2240 | 490 | g3-s45_3_11-B-white t8 |
| AnchorDepth | space | 22 | 10 | 12 | -25 | 2125 | 225 | e1-g5-s415_3_41-A-white t4 |
| CleaveExposure | safety | 6 | 1 | 5 | -1400 | 1880 | 720 | e1-g4-s1030_0_60-A-white t8 |
| BankConvertible | economy | 25 | 14 | 11 | +480 | 1760 | 180 | e1-g2-s680_3_79-B-white t3 |
| SpawnZero | space | 2 | 0 | 2 | -1600 | 1600 | 800 | e1-g3-s625_0_42-B-white t5 |

## The never-flip positions (0)


| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc |
| --- | --- | ---: | ---: | ---: | ---: | ---: |

## Side-swap antisymmetry at the 24 end states

All 78 end states read the same from either point of view: `full(p, seat) === −full(p, opponent)` and every one of the 58 features negates. The seat-view reading used throughout is therefore not a choice.

## Judge 4: features against the rules engine

`Rent`, `BankLiquid`, `HomeInvaded`, `HomePlug` and `SpawnZero` are checked for EQUALITY: their definitions are arithmetic on quantities `src/game` also computes, so a disagreement would be an engine bug.
`Hanging` is checked for SIGN ONLY and against a LOWER BOUND: `t.killActions` is built with a full four-action budget, purchases and promotions on and several attack lanes, while the canonical count allows one step of approach and one single attacker with no purchase. A sign disagreement therefore says the feature's sign rests on kills the canonical count cannot see; it is not by itself proof of a bug.

- e1-g4-s1030_0_60-A-white t8: adviser end state: Hanging says -53, the rules engine says 3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- e1-g4-s30_3_81-B-white t4: played end state: Hanging says 8, the rules engine says -3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- e1-g5-s315_3_87-A-white t4: played end state: Hanging says -4, the rules engine says 3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- e1-g5-s315_3_87-A-white t4: adviser end state: Hanging says -12, the rules engine says 3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- g5-s31_3_5-B-white t2: played end state: Hanging says 2, the rules engine says -3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
