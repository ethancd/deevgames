# E3.1 loss judgment — `e1.1-eval-no-safety`

Generated 2026-09-17T06:29:54.428Z by `lab/hard-ai/audit/loss-judgment.ts`.
14 analysed turns, 12 distinct positions, weights `default-v1-no-safety` version 1 (arm `eval-no-safety`).
Judge 2 allowance: 8000 ms per turn for `aiv2-hard`, seed 20260917.

All static scores are centi-crystals FROM THE SEAT that lost, at the turn's end state.
`static Δ` is adviser minus played; positive means the champion's own static evaluation prefers the adviser's turn.
`searched Δ` is the same difference in `RootCandidate.scoreCc` at 400k units; those are fail-low bounds, so an exact 0 means "searched, not preferred", not "equal".

| position | seat | turn | class | static A | static P | static Δ | searched Δ | flip work | aiv2-hard | verdict |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `g2-s20_3_15-A-white` | white | 3 | strong-candidate-misjudged | 1873 | 1781 | +92 | +0 | never | unknown | static-prefers-adviser-search-does-not |
| `g2-s20_3_15-B-white` | black | 7 | fixed-work-divergence | -1649 | -2319 | +670 | +1929 | 283000 | unknown | static-and-search-agree-on-adviser |
| `g2-s5_0_2-A-white` | white | 4 | fixed-work-divergence | 1665 | 919 | +746 | +2910 | 400000 | unknown | static-and-search-agree-on-adviser |
| `g4-s10_0_8-A-white` | white | 3 | fixed-work-divergence | 2298 | 2283 | +15 | +1548 | 283000 | unknown | static-and-search-agree-on-adviser |
| `g4-s10_0_8-B-white` | black | 7 | fixed-work-divergence | 103 | 1515 | -1412 | +253 | 400000 | unknown | static-prefers-played |
| `g4-s10_3_9-A-white` | white | 2 | strong-candidate-misjudged | 2765 | 3125 | -360 | +0 | never | unknown | static-prefers-played |
| `g4-s2_3_1-B-white` | black | 2 | fixed-work-divergence | 1304 | 1364 | -60 | +2255 | 283000 | unknown | static-prefers-played |
| `g4-s6_0_4-A-white` | white | 4 | fixed-work-divergence | 4120 | 3928 | +192 | +988 | 400000 | unknown | static-and-search-agree-on-adviser |
| `g4-s6_3_5-A-white` + `g5-s7_3_7-A-white` | white | 4 | fixed-work-divergence | 2547 | 2793 | -246 | +1208 | 400000 | unknown | static-prefers-played |
| `g4-s6_3_5-B-white` + `g5-s7_3_7-B-white` | black | 1 | strong-candidate-misjudged | -417 | -477 | +60 | +0 | never | unknown | static-prefers-adviser-search-does-not |
| `g5-s11_0_10-B-white` | black | 1 | fixed-work-divergence | -913 | -779 | -134 | +1127 | 400000 | unknown | static-prefers-played |
| `g5-s11_3_11-B-white` | black | 2 | strong-candidate-misjudged | -35 | 1364 | -1399 | +0 | 566000 | unknown | static-prefers-played |

## Judges, per position

`mat gap` is seat material minus opponent material in catalogue crystals; `P` at the played end state, then the seat's own turn 3 and 6 later.
`aiv2 Δ` is the champion's static score of `aiv2-hard`'s own end state minus its score of the played end state, from the seat.
`nearer` is which candidate end state aiv2's lies nearer to in contribution space (L1 over the 58 weighted contributions).

| position | result | mat gap P | +3 | +6 | home lost +6 | aiv2 Δ vs played | aiv2 Δ vs adviser | nearer | top-5 with adviser |
| --- | --- | ---: | ---: | ---: | :-: | ---: | ---: | --- | ---: |
| `g2-s20_3_15-A-white` | loss elimination | +7 | -15 | -14 | no | - | - | - | - |
| `g2-s20_3_15-B-white` | loss home-checkmate | -4 | -50 | -52 | no | - | - | - | - |
| `g2-s5_0_2-A-white` | loss upkeep-elimination | +6 | -32 | -33 | no | - | - | - | - |
| `g4-s10_0_8-A-white` | loss elimination | +4 | -12 | -33 | no | - | - | - | - |
| `g4-s10_0_8-B-white` | loss elimination | -6 | -46 | -17 | no | - | - | - | - |
| `g4-s10_3_9-A-white` | loss home-checkmate | +3 | -19 | -47 | no | - | - | - | - |
| `g4-s2_3_1-B-white` | loss upkeep-elimination | +1 | -11 | -33 | no | - | - | - | - |
| `g4-s6_0_4-A-white` | loss home-checkmate | +16 | +5 | -2 | no | - | - | - | - |
| `g4-s6_3_5-A-white` | loss home-checkmate | +3 | -27 | -22 | no | - | - | - | - |
| `g4-s6_3_5-B-white` | loss elimination | +3 | -12 | -10 | no | - | - | - | - |
| `g5-s11_0_10-B-white` | loss home-checkmate | +0 | -6 | -10 | no | - | - | - | - |
| `g5-s11_3_11-B-white` | loss elimination | +1 | -11 | -10 | no | - | - | - | - |

## Where each position is routed

- `static-prefers-adviser-search-does-not`: the leaf evaluation already prefers the adviser's end state and the depth-3 search does not. That is a search or leaf problem (E4), not a judgment problem.
- `static-prefers-played`: the leaf evaluation prefers the played end state. That is a judgment problem and E3.2 material.
- `static-indifferent`: the two end states score the same statically.

## Verdict counts

- static-prefers-adviser-search-does-not: 2
- static-and-search-agree-on-adviser: 4
- static-prefers-played: 6

## Judge 2 (`aiv2-hard`, foreign engine)

- picks the unknown: 12

## Group ranking (all distinct positions)

| group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc | mean Δ cc | max \|Δ\| | at |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| economy | 11 | 8 | 3 | +3613 | 5239 | +328 | 1147 | g5-s11_3_11-B-white t2 |
| space | 8 | 3 | 5 | -2469 | 2677 | -309 | 1206 | g5-s11_3_11-B-white t2 |
| material | 6 | 0 | 6 | -1700 | 1700 | -283 | 700 | g4-s10_0_8-B-white t7 |
| home | 4 | 2 | 2 | -1280 | 1520 | -320 | 1040 | g5-s11_3_11-B-white t2 |

## Feature ranking (all distinct positions, top 20 by Σ |Δ|)

| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc | max \|Δ\| | at |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| EconDelta | economy | 9 | 4 | 5 | +640 | 1920 | 640 | g2-s5_0_2-A-white t4 |
| Material | material | 6 | 0 | 6 | -1700 | 1700 | 700 | g4-s10_0_8-B-white t7 |
| Rent | economy | 4 | 4 | 0 | +1688 | 1688 | 422 | g2-s5_0_2-A-white t4 |
| SpawnArea | space | 6 | 3 | 3 | -1140 | 1380 | 570 | g5-s11_3_11-B-white t2 |
| PstMine | economy | 7 | 5 | 2 | +540 | 1260 | 300 | g4-s10_0_8-A-white t3 |
| Inv5PoorMinerSquare | economy | 3 | 1 | 2 | -400 | 1200 | 400 | g2-s20_3_15-B-white t7 |
| RelocationDebt | economy | 8 | 4 | 4 | +240 | 840 | 300 | g2-s20_3_15-B-white t7 |
| DepletionWaste | economy | 8 | 3 | 5 | -60 | 840 | 240 | g2-s5_0_2-A-white t4 |
| BankLiquid | economy | 3 | 3 | 0 | +540 | 540 | 180 | g2-s20_3_15-A-white t3 |
| HomeCountdown | home | 2 | 0 | 2 | -540 | 540 | 360 | g4-s10_3_9-A-white t2 |
| BankExcess | economy | 5 | 5 | 0 | +425 | 425 | 175 | g4-s10_0_8-B-white t7 |
| Inv13Turtle | space | 2 | 0 | 2 | -400 | 400 | 200 | g4-s2_3_1-B-white t2 |
| HomeThreat | home | 1 | 0 | 1 | -400 | 400 | 400 | g5-s11_3_11-B-white t2 |
| Inv10HomeReachable | home | 1 | 0 | 1 | -400 | 400 | 400 | g5-s11_3_11-B-white t2 |
| SpawnReserve | space | 8 | 2 | 6 | -304 | 384 | 136 | g5-s11_3_11-B-white t2 |
| AnchorDepth | space | 3 | 0 | 3 | -325 | 325 | 150 | g5-s11_3_11-B-white t2 |
| BankConvertible | economy | 5 | 4 | 1 | +0 | 320 | 160 | g4-s10_0_8-B-white t7 |
| ElementCoverage | space | 2 | 0 | 2 | -300 | 300 | 150 | g4-s2_3_1-B-white t2 |
| CornerSeal | home | 3 | 2 | 1 | +60 | 180 | 60 | g4-s6_3_5-A-white t4 |
| DrawPressure | space | 2 | 1 | 1 | +0 | 16 | 8 | g4-s10_0_8-B-white t7 |

## The never-flip positions (3)

- g2-s20_3_15-A-white t3 white
- g4-s10_3_9-A-white t2 white
- g4-s6_3_5-B-white+g5-s7_3_7-B-white t1 black

| feature | group | positions | → adviser | → played | Σ Δ cc | Σ \|Δ\| cc |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| HomeCountdown | home | 1 | 0 | 1 | -360 | 360 |
| BankLiquid | economy | 1 | 1 | 0 | +180 | 180 |
| Material | material | 1 | 0 | 1 | -100 | 100 |
| EconDelta | economy | 1 | 0 | 1 | -80 | 80 |
| PstMine | economy | 1 | 1 | 0 | +60 | 60 |
| RelocationDebt | economy | 1 | 1 | 0 | +60 | 60 |
| BankConvertible | economy | 1 | 1 | 0 | +40 | 40 |
| SpawnReserve | space | 1 | 0 | 1 | -8 | 8 |

## Side-swap antisymmetry at the 24 end states

All 24 end states read the same from either point of view: `full(p, seat) === −full(p, opponent)` and every one of the 58 features negates. The seat-view reading used throughout is therefore not a choice.

## Judge 4: features against the rules engine

`Rent`, `BankLiquid`, `HomeInvaded`, `HomePlug` and `SpawnZero` are checked for EQUALITY: their definitions are arithmetic on quantities `src/game` also computes, so a disagreement would be an engine bug.
`Hanging` is checked for SIGN ONLY and against a LOWER BOUND: `t.killActions` is built with a full four-action budget, purchases and promotions on and several attack lanes, while the canonical count allows one step of approach and one single attacker with no purchase. A sign disagreement therefore says the feature's sign rests on kills the canonical count cannot see; it is not by itself proof of a bug.

- g4-s10_0_8-B-white t7: adviser end state: Hanging says -5, the rules engine says 5 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- g4-s6_3_5-A-white t4: played end state: Hanging says -1, the rules engine says 3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- g4-s6_3_5-A-white t4: adviser end state: Hanging says -1, the rules engine says 6 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
- g5-s11_3_11-B-white t2: played end state: Hanging says 2, the rules engine says -3 (sign only: crystals of my own material an enemy can eliminate this turn (≤1 step then attack, single attacker) minus theirs; a lower bound on the feature's hangingCc)
