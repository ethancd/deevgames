# Five fixed mineral maps — static study

Catalogue SHA-256: `7a5fdecdcd77f0dce8c81b0aad357ec439ddcf6f584a7f79f08b212955a2bc43`. Model SHA-256: `7657ffa18d5036404b493895df0e162abf85705146ebbe8e1a9fb04fdd35abd6`.

## Resource geometry

| Map | Total | M1 / M2 / M3 / M4 / M5 accessible | ≥4-layer components | Largest rich component | Central four |
|---|---:|---|---:|---:|---:|
| A Uniform wells | 500 | 100 / 200 / 300 / 400 / 500 | 1 | 500 | 20 |
| B Five islands | 340 | 100 / 200 / 300 / 320 / 340 | 5 | 20 | 20 |
| C Two wings | 340 | 100 / 200 / 300 / 320 / 340 | 4 | 30 | 12 |
| D Unequal routes | 340 | 100 / 200 / 284 / 320 / 340 | 6 | 32 | 12 |
| E Braided frontiers | 340 | 100 / 200 / 280 / 320 / 340 | 4 | 70 | 12 |

## Unopposed opening witnesses

Gross / banked crystals at the end of own turn 5, after six shared actions per turn. Plant promotes as soon as affordable; its bank deducts the upgrades. Destination probes are not optimized competitive strategies.

| Map | Bank | Plant investment | Home only | East probe | South probe | Center probe |
|---|---:|---:|---:|---:|---:|---:|
| A | 47 / 47 | 68 / 51 | 45 / 45 | 44 / 44 | 42 / 42 | 43 / 43 |
| B | 47 / 47 | 59 / 42 | 45 / 45 | 44 / 44 | 42 / 42 | 43 / 43 |
| C | 47 / 47 | 59 / 42 | 45 / 45 | 44 / 44 | 42 / 42 | 43 / 43 |
| D | 47 / 47 | 64 / 47 | 43 / 43 | 47 / 47 | 42 / 42 | 47 / 47 |
| E | 47 / 47 | 65 / 48 | 44 / 44 | 47 / 47 | 47 / 47 | 44 / 44 |

## Plant income by own turn (gross)

| Map | Turn 1 | Turn 2 | Turn 3 | Turn 4 | Turn 5 | Bank at turn 5 |
|---|---:|---:|---:|---:|---:|---:|
| A | 11 | 23 | 38 | 53 | 68 | 51 |
| B | 11 | 20 | 33 | 46 | 59 | 42 |
| C | 11 | 20 | 33 | 48 | 59 | 42 |
| D | 11 | 23 | 36 | 51 | 64 | 47 |
| E | 11 | 23 | 38 | 53 | 65 | 48 |

## Reserving actions for other duties

Plant investment: gross income / banked crystals at own turn 5. Reserved actions are not simulated defense.

| Map | 6 economic actions | 5 | 4 | 3 |
|---|---:|---:|---:|---:|
| A | 68 / 51 | 56 / 39 | 46 / 29 | 34 / 17 |
| B | 59 / 42 | 47 / 30 | 40 / 23 | 28 / 11 |
| C | 59 / 42 | 51 / 34 | 40 / 23 | 28 / 11 |
| D | 64 / 47 | 53 / 36 | 44 / 27 | 32 / 15 |
| E | 65 / 48 | 55 / 38 | 44 / 27 | 33 / 16 |

## Geographic single-unit roles

| Unit | A sole-cheapest tasks | B | C | D | E |
|---|---:|---:|---:|---:|---:|
| fire_1 | 466 | 466 | 466 | 466 | 466 |
| fire_2 | 66 | 66 | 66 | 66 | 66 |
| fire_3 | 104 | 104 | 104 | 104 | 104 |
| fire_4 | 200 | 200 | 200 | 200 | 200 |
| lightning_1 | 42 | 42 | 42 | 42 | 42 |
| lightning_2 | 161 | 161 | 161 | 161 | 161 |
| lightning_3 | 102 | 102 | 102 | 102 | 102 |
| lightning_4 | 43 | 43 | 43 | 43 | 43 |
| water_1 | 589 | 589 | 589 | 589 | 589 |
| water_2 | 537 | 537 | 537 | 537 | 537 |
| water_3 | 1048 | 1048 | 1048 | 999 | 981 |
| water_4 | 145 | 145 | 145 | 190 | 136 |
| shadow_1 | 83 | 83 | 83 | 83 | 83 |
| shadow_2 | 64 | 64 | 64 | 64 | 64 |
| shadow_3 | 93 | 93 | 93 | 93 | 93 |
| shadow_4 | 216 | 216 | 216 | 216 | 216 |
| plant_1 | 588 | 588 | 588 | 511 | 539 |
| plant_2 | 2036 | 972 | 1092 | 1384 | 1600 |
| plant_3 | 4142 | 1986 | 2226 | 2379 | 2433 |
| plant_4 | 978 | 678 | 454 | 490 | 547 |
| metal_1 | 895 | 895 | 895 | 895 | 895 |
| metal_2 | 1280 | 1280 | 1280 | 1205 | 1229 |
| metal_3 | 263 | 263 | 263 | 252 | 256 |
| metal_4 | 767 | 503 | 533 | 594 | 652 |

## One-square sensitivity

Compare with the width-256 parent run. Moving a rotational pair preserves both total crystals and the depth histogram. Results are gross Plant income, not win rates.

| Map | Swaps | Parent T3 / T5 | T3 range | T5 range |
|---|---:|---:|---|---|
| A | 0 | 38 / 68 | n/a | n/a |
| B | 8 | 33 / 59 | 33–33 | 55–59 |
| C | 10 | 33 / 59 | 33–33 | 59–59 |
| D | 27 | 35 / 64 | 35–36 | 63–65 |
| E | 40 | 38 / 65 | 36–38 | 64–66 |

## Scope and limitations

- Lab-only 10×10 maps; v1.3 catalogue held fixed. A=500 crystals, B–E=340; variation therefore includes scarcity relative to A.
- Every cell starts at minedDepth 0. Capacity is total existing depth, never a mining-yield multiplier.
- Regional mining routes use both fresh wells and a counterfactual with the top three layers removed everywhere; exact for one already-acquired unit, starting in the district or traveling from home, open movement, one district, six actions, no opponents or other bodies.
- Opening income routes use the real three starters, shared depletion, collision-aware moves, six actions/own turn, optional Plant promotions; opponent stays still and passes. No new units or combat.
- Beam widths 64/256/1024 are heuristic searches; retain the best witnessed result across widths at each horizon because wider beams can discard narrower-beam paths. Every displayed horizon has its own legal witness; only equality with the independent starter upper bound certifies optimum in that restricted model.
- East/south/center searches add an explicit 0.4-point-per-square destination preference for one unit; these are route probes, not Pareto frontiers or comparable strategy ratings. Home restricts all pieces to the near 4×4.
- Action-reserve probes allow only 3/4/5 economic actions per turn; unused actions represent an opportunity cost, not simulated protection or enemy responses.
- Financing uses all prefixes of ONE five-turn bank witness, holds its income fixed despite target purchases/upgrades, and stops new income after turn 5. It omits target placement traffic, protection, competing spending and feedback; not earliest actual tier access.
- Role counts depend on the declared region/target/action/survival grid; missing witnesses are model questions, not proof of useless units. Acquisition, tech and opponent responses are excluded.
- Geometry reports open-board approach distances and hypothetical Radi spawn-blocking costs; it does not establish a first-player advantage or a forced invasion.
- Sensitivity swaps adjacent rotational pairs while preserving total, histogram and starting home squares; width-256 unopposed bank/Plant probes are repeated, not complete game balance tests.

Verified 1370 production-engine replays (including rotated seats and sensitivity witnesses). Runtime: 48.91 seconds.
