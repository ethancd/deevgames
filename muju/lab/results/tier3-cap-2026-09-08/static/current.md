# Static value solver: current

Catalogue SHA-256: `847d7604b21794bea4d93b5dbcb40675667339b97fbad22c659be2493cabc4d3`. Model SHA-256: `a96c91e42f9830a9401970b056bfca95650f085d00e8f92b0a3f656c173e2dd1`.

**This is a set of local optimization results, not a universal power score or a proof of game balance.**

## Distinctness and cheapest qualifying roles

Witness counts reflect this deliberately broad mission grid, not importance or expected frequency. A witness means a cheapest qualifying single piece; it does not beat every mixed army.

| Unit | ATK/DEF/SPD/MINE | Cost/build | Same-tier dominators | Cheapest / sole-cheapest tasks | Example witness |
|---|---|---|---|---:|---|
| Hi (fire_1) | 2/1/2/1 | 1/1 | none | 2328 / 984 | strike fire_1 at distance 1 within 2 actions; mine >=1 fresh layers first; survive no hit |
| Hono (fire_2) | 3/1/2/1 | 3/1 | none | 1056 / 360 | strike water_1 at distance 3 within 3 actions; mine >=1 fresh layers first; survive no hit |
| Kagari (fire_3) | 4/2/3/1 | 6/2 | none | 4554 / 3126 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive plant_3 hit |
| Radi (lightning_1) | 2/1/3/0 | 1/1 | none | 1908 / 564 | strike fire_1 at distance 4 within 2 actions; mine >=0 fresh layers first; survive no hit |
| Umeme (lightning_2) | 3/1/4/0 | 3/1 | none | 1680 / 1104 | strike fire_1 at distance 5 within 2 actions; mine >=0 fresh layers first; survive no hit |
| Kimubunga (lightning_3) | 3/1/5/1 | 6/2 | none | 2064 / 1464 | strike fire_1 at distance 5 within 3 actions; mine >=1 fresh layers first; survive no hit |
| Sjor (water_1) | 2/2/1/2 | 2/1 | none | 1730 / 1130 | strike fire_1 at distance 1 within 2 actions; mine >=1 fresh layers first; survive fire_1 hit |
| Straumr (water_2) | 2/3/1/2 | 4/2 | none | 2760 / 2760 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive fire_2 hit |
| Aegirinn (water_3) | 3/4/2/3 | 10/2 | none | 9273 / 8789 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive fire_3 hit |
| Göl (shadow_1) | 2/2/2/0 | 2/1 | none | 1032 / 432 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive fire_1 hit |
| Gölge (shadow_2) | 3/2/2/1 | 4/2 | none | 566 / 566 | strike fire_1 at distance 3 within 3 actions; mine >=1 fresh layers first; survive fire_1 hit |
| Karanlık (shadow_3) | 4/2/3/2 | 10/2 | none | 2684 / 2200 | strike fire_1 at distance 4 within 2 actions; mine >=0 fresh layers first; survive fire_1 hit |
| Muju (plant_1) | 0/2/1/3 | 3/2 | none | 299 / 133 | mine >=3 in fresh corridor within 1 actions; survive no hit |
| Sachita (plant_2) | 1/3/1/4 | 6/2 | none | 1907 / 1092 | strike water_1 at distance 1 within 2 actions; mine >=4 fresh layers first; survive no hit |
| Sachakuna (plant_3) | 2/4/1/5 | 12/3 | none | 4756 / 4752 | strike fire_1 at distance 1 within 2 actions; mine >=4 fresh layers first; survive no hit |
| Inyan (metal_1) | 1/3/1/2 | 3/2 | none | 2426 / 1972 | strike water_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive water_1 hit |
| Mazask (metal_2) | 2/4/1/3 | 6/2 | none | 5575 / 3932 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive water_3 hit |
| Tanka (metal_3) | 2/6/2/3 | 12/3 | none | 507 / 503 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive shadow_3 hit |

## Marginal stat values (one extra point, holding opponents fixed)

Attack and speed show newly reachable one-hit kill cells on the reporting grid. Action savings are mean shortest-path move-then-attack savings over the declared distances. Mining gains are exact extra resources within six corridor actions. Defense compares the cheapest feasible four-body/six-action attack at distance 1; “unbreakable” only means infeasible under that bound.

| Unit | ATK+1: kill cells | SPD+1: kill cells / mean actions saved | MINE+1: fresh / scattered / stripped resources | DEF+1: cheapest kill bill before → after | ATK×SPD extra cells beyond additive |
|---|---:|---:|---:|---|---:|
| fire_1 | 54/972 | 27/972 / 1.33 | 3 / 2 / 0 | 1 → 1 | 18 |
| fire_2 | 9/972 | 45/972 / 1.33 | 3 / 2 / 0 | 1 → 1 | 3 |
| fire_3 | 24/972 | 48/972 / 0.67 | 3 / 2 / 0 | 1 → 2 | 6 |
| lightning_1 | 72/972 | 27/972 / 0.67 | 3 / 2 / 0 | 1 → 1 | 18 |
| lightning_2 | 15/972 | 45/972 / 0.39 | 3 / 3 / 0 | 1 → 1 | 3 |
| lightning_3 | 18/972 | 45/972 / 0.28 | 3 / 3 / 0 | 1 → 1 | 3 |
| water_1 | 12/972 | 30/972 / 4.00 | 3 / 2 / 0 | 2 → 3 | 6 |
| water_2 | 12/972 | 30/972 / 4.00 | 3 / 2 / 0 | 3 → 4 | 6 |
| water_3 | 27/972 | 36/972 / 1.33 | 3 / 2 / 3 | 4 → 5 | 9 |
| shadow_1 | 18/972 | 30/972 / 1.33 | 3 / 2 / 0 | 2 → 3 | 6 |
| shadow_2 | 27/972 | 36/972 / 1.33 | 3 / 2 / 0 | 2 → 3 | 9 |
| shadow_3 | 24/972 | 45/972 / 0.67 | 3 / 2 / 0 | 2 → 3 | 6 |
| plant_1 | 24/972 | 0/972 / 4.00 | 3 / 2 / 3 | 1 → 1 | 12 |
| plant_2 | 42/972 | 12/972 / 4.00 | 3 / 2 / 3 | 1 → 2 | 21 |
| plant_3 | 24/972 | 33/972 / 4.00 | 0 / 0 / 0 | 2 → 2 | 12 |
| metal_1 | 42/972 | 12/972 / 4.00 | 3 / 2 / 0 | 1 → 2 | 21 |
| metal_2 | 24/972 | 33/972 / 4.00 | 3 / 2 / 3 | 2 → 2 | 12 |
| metal_3 | 36/972 | 33/972 / 1.33 | 3 / 2 / 3 | 2 → 3 | 12 |

## Earliest financed exemplar (own turns)

Income is external crystals per turn, paid AFTER placement/promotion. Starting units are free. No enemy, travel, or income-generating action cost is modeled here. Promotion permits immediate action; freshly placed pieces cannot promote again that turn.

| Unit | Net line investment | Income 3 | Income 6 | Income 9 |
|---|---:|---:|---:|---:|
| fire_1 | 0 | 1 | 1 | 1 |
| fire_2 | 2 | 2 | 2 | 2 |
| fire_3 | 5 | 3 | 3 | 3 |
| lightning_1 | 1 | 2 | 2 | 2 |
| lightning_2 | 3 | 3 | 3 | 3 |
| lightning_3 | 6 | 4 | 4 | 4 |
| water_1 | 0 | 1 | 1 | 1 |
| water_2 | 2 | 2 | 2 | 2 |
| water_3 | 8 | 4 | 3 | 3 |
| shadow_1 | 2 | 2 | 2 | 2 |
| shadow_2 | 4 | 3 | 3 | 3 |
| shadow_3 | 10 | 5 | 4 | 4 |
| plant_1 | 0 | 1 | 1 | 1 |
| plant_2 | 3 | 2 | 2 | 2 |
| plant_3 | 9 | 4 | 3 | 3 |
| metal_1 | 3 | 3 | 3 | 3 |
| metal_2 | 6 | 4 | 4 | 4 |
| metal_3 | 12 | 5 | 5 | 5 |

## Limits

- Open shortest-path distances, no traffic or enemy moves.
- Strike grid: 18 targets, all 18 open-board distances, action budgets 1/2/3; cells are not matchup probabilities.
- Kill frontiers: at most four distinct bodies in independent approach lanes, six shared actions; no tech gates.
- Mining: exact finite ten-cell corridor, six actions, one unit, no protection or other miners.
- Roles: least-cost SINGLE qualifying piece in declared strike/mining/occupation tasks; neither army optimality nor frequency.
- Access: maintained starting F1/W1/P1 and external income paid after placement; earliest single-line exemplar, not expected match timing.

Read solver/README.md for equations, counterfactual interpretation, test coverage and how to challenge these assumptions.

## Capabilities accessible by turn

Each is the best individually financed exemplar, not an army affordable all at once. Different pieces may set different maxima. The final column requires ONE available piece to have both the speed and attack for the kill.

| Income/turn | Own turn | Max ATK/DEF/SPD/MINE | Target types killable from distance 7 in 3 actions |
|---:|---:|---|---:|
| 3 | 1 | 2/2/2/3 | 0/18 |
| 3 | 2 | 3/3/3/4 | 9/18 |
| 3 | 3 | 4/3/4/4 | 16/18 |
| 3 | 4 | 4/4/5/5 | 16/18 |
| 3 | 5 | 4/6/5/5 | 17/18 |
| 3 | 6 | 4/6/5/5 | 17/18 |
| 3 | 7 | 4/6/5/5 | 17/18 |
| 3 | 8 | 4/6/5/5 | 17/18 |
| 6 | 1 | 2/2/2/3 | 0/18 |
| 6 | 2 | 3/3/3/4 | 9/18 |
| 6 | 3 | 4/4/4/5 | 16/18 |
| 6 | 4 | 4/4/5/5 | 17/18 |
| 6 | 5 | 4/6/5/5 | 17/18 |
| 6 | 6 | 4/6/5/5 | 17/18 |
| 6 | 7 | 4/6/5/5 | 17/18 |
| 6 | 8 | 4/6/5/5 | 17/18 |
| 9 | 1 | 2/2/2/3 | 0/18 |
| 9 | 2 | 3/3/3/4 | 9/18 |
| 9 | 3 | 4/4/4/5 | 16/18 |
| 9 | 4 | 4/4/5/5 | 17/18 |
| 9 | 5 | 4/6/5/5 | 17/18 |
| 9 | 6 | 4/6/5/5 | 17/18 |
| 9 | 7 | 4/6/5/5 | 17/18 |
| 9 | 8 | 4/6/5/5 | 17/18 |

## Conditional crystal value of ATK +1

Cheapest same-type squad, at most four bodies and six actions, at distances 1/4/7 against every target. Price savings average only cases feasible before AND after; newly feasible cases are reported separately and are not assigned an invented crystal price.

| Unit | Mean crystals saved in jointly feasible cases | Newly feasible cases | Example |
|---|---:|---:|---|
| fire_1 | 0.35 (43 cases) | 8/54 | water_1, distance 1: 2 → 1 crystals |
| fire_2 | 0.12 (51 cases) | 1/54 | water_2, distance 1: 6 → 3 crystals |
| fire_3 | 0.67 (54 cases) | 0/54 | water_3, distance 1: 12 → 6 crystals |
| lightning_1 | 0.43 (51 cases) | 3/54 | water_1, distance 1: 2 → 1 crystals |
| lightning_2 | 0.17 (54 cases) | 0/54 | water_2, distance 1: 6 → 3 crystals |
| lightning_3 | 0.33 (54 cases) | 0/54 | water_2, distance 1: 12 → 6 crystals |
| water_1 | 0.59 (27 cases) | 3/54 | water_2, distance 1: 4 → 2 crystals |
| water_2 | 1.19 (27 cases) | 3/54 | water_2, distance 1: 8 → 4 crystals |
| water_3 | 1.49 (47 cases) | 4/54 | water_3, distance 1: 20 → 10 crystals |
| shadow_1 | 0.50 (40 cases) | 7/54 | water_2, distance 1: 4 → 2 crystals |
| shadow_2 | 0.60 (47 cases) | 4/54 | water_3, distance 1: 8 → 4 crystals |
| shadow_3 | 1.11 (54 cases) | 0/54 | plant_3, distance 1: 20 → 10 crystals |
| plant_1 | 3.50 (6 cases) | 9/54 | water_1, distance 1: 6 → 3 crystals |
| plant_2 | 3.20 (15 cases) | 14/54 | fire_1, distance 1: infeasible → 6 crystals |
| plant_3 | 2.07 (29 cases) | 4/54 | fire_3, distance 1: 24 → 12 crystals |
| metal_1 | 1.60 (15 cases) | 14/54 | fire_1, distance 1: infeasible → 3 crystals |
| metal_2 | 1.03 (29 cases) | 4/54 | fire_3, distance 1: 12 → 6 crystals |
| metal_3 | 2.35 (46 cases) | 5/54 | fire_3, distance 1: 24 → 12 crystals |
