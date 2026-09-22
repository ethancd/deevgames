# Static value solver: current

Catalogue SHA-256: `b68494692da19506e14d6ffe2ea4f57c10bcd18fceb7607ffe8f30934b20978c`. Model SHA-256: `06dcc63535002fdf103c382eaf71a693f74b9bfeceafc9aa49e091c43f5614c9`.

**This is a set of local optimization results, not a universal power score or a proof of game balance.**

## Distinctness and cheapest qualifying roles

Witness counts reflect this deliberately broad mission grid, not importance or expected frequency. A witness means a cheapest qualifying single piece; it does not beat every mixed army.

| Unit | ATK/DEF/SPD/MINE | Cost | Same-tier dominators | Cheapest / sole-cheapest tasks | Example witness |
|---|---|---|---|---:|---|
| Hi (fire_1) | 2/1/2/1 | 3 | none | 3450 / 2490 | strike fire_1 at distance 1 within 1 actions; mine >=1 crystals at turn end on rich ground; survive no hit |
| Honō (fire_2) | 3/1/2/1 | 7 | none | 1560 / 1560 | strike water_1 at distance 2 within 2 actions; mine >=0 crystals at turn end on rich ground; survive plant_2 hit |
| Kagari (fire_3) | 4/2/3/1 | 15 | none | 6555 / 6105 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive plant_3 hit |
| Radi (lightning_1) | 1/1/3/0 | 3 | none | 1365 / 405 | strike fire_1 at distance 4 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Umeme (lightning_2) | 2/1/4/0 | 7 | none | 870 / 870 | strike fire_1 at distance 5 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Kimbunga (lightning_3) | 3/1/5/0 | 15 | none | 1365 / 915 | strike fire_1 at distance 6 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Sjór (water_1) | 2/2/1/2 | 4 | none | 2874 / 2058 | strike fire_1 at distance 1 within 1 actions; mine >=1 crystals at turn end on rich ground; survive fire_1 hit |
| Straumr (water_2) | 2/3/1/2 | 8 | none | 3612 / 3612 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive fire_2 hit |
| Ægirinn (water_3) | 3/4/2/3 | 16 | none | 13986 / 13056 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive fire_3 hit |
| Loş (shadow_1) | 2/2/2/0 | 4 | none | 1404 / 588 | strike fire_1 at distance 3 within 2 actions; mine >=0 crystals at turn end on rich ground; survive fire_1 hit |
| Gölge (shadow_2) | 3/2/2/1 | 8 | none | 810 / 810 | strike fire_1 at distance 3 within 2 actions; mine >=1 crystals at turn end on rich ground; survive fire_1 hit |
| Karanlık (shadow_3) | 4/2/3/2 | 16 | none | 4569 / 3639 | strike fire_1 at distance 4 within 2 actions; mine >=0 crystals at turn end on rich ground; survive fire_1 hit |
| Muju (plant_1) | 0/3/1/3 | 5 | none | 700 / 42 | occupy anchor at distance 1 within 1 moves; survive water_1 hit |
| Mallki (plant_2) | 1/3/1/5 | 9 | none | 3957 / 1183 | strike water_1 at distance 1 within 1 actions; mine >=5 crystals at turn end on rich ground; survive no hit |
| Sach'akuna (plant_3) | 2/4/1/8 | 17 | none | 15097 / 10288 | strike fire_1 at distance 1 within 1 actions; mine >=6 crystals at turn end on rich ground; survive no hit |
| Poṉ (metal_1) | 1/3/0/3 | 5 | none | 1690 / 1032 | strike water_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive water_1 hit |
| Veḷḷi (metal_2) | 1/4/1/4 | 9 | none | 3680 / 906 | strike water_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive shadow_3 hit |
| Irumbu (metal_3) | 2/5/2/5 | 17 | none | 11697 / 6888 | strike fire_1 at distance 1 within 1 actions; mine >=4 crystals at turn end on rich ground; survive fire_2 hit |

## Marginal stat values (one extra point, holding opponents fixed)

Attack and speed show newly reachable one-hit kill cells on the reporting grid. Action savings are mean shortest-path move-then-attack savings over the declared distances. Mining gains are exact extra resources within six passive income turns. Defense compares the cheapest feasible four-body/six-action attack at distance 1; “unbreakable” only means infeasible under that bound.

| Unit | ATK+1: kill cells | SPD+1: kill cells / mean actions saved | MINE+1: ordinary / shelf / rich resources | DEF+1: cheapest kill bill before → after | ATK×SPD extra cells beyond additive |
|---|---:|---:|---:|---|---:|
| fire_1 | 54/972 | 27/972 / 1.33 | 0 / 2 / 6 | 3 → 3 | 18 |
| fire_2 | 18/972 | 45/972 / 1.33 | 0 / 2 / 6 | 3 → 3 | 6 |
| fire_3 | 12/972 | 51/972 / 0.67 | 0 / 2 / 6 | 3 → 4 | 3 |
| lightning_1 | 48/972 | 15/972 / 0.67 | 4 / 6 / 6 | 3 → 3 | 12 |
| lightning_2 | 90/972 | 27/972 / 0.39 | 4 / 6 / 6 | 3 → 3 | 18 |
| lightning_3 | 36/972 | 45/972 / 0.28 | 4 / 6 / 6 | 3 → 3 | 6 |
| water_1 | 6/972 | 30/972 / 4.00 | 0 / 0 / 4 | 4 → 7 | 3 |
| water_2 | 6/972 | 30/972 / 4.00 | 0 / 0 / 4 | 7 → 8 | 3 |
| water_3 | 36/972 | 33/972 / 1.33 | 0 / 0 / 0 | 8 → 11 | 12 |
| shadow_1 | 9/972 | 30/972 / 1.33 | 4 / 6 / 6 | 4 → 7 | 3 |
| shadow_2 | 36/972 | 33/972 / 1.33 | 0 / 2 / 6 | 4 → 7 | 12 |
| shadow_3 | 24/972 | 45/972 / 0.67 | 0 / 0 / 4 | 4 → 7 | 6 |
| plant_1 | 24/972 | 0/972 / 4.00 | 0 / 0 / 0 | 3 → 6 | 12 |
| plant_2 | 36/972 | 12/972 / 4.00 | 0 / 0 / 0 | 3 → 6 | 18 |
| plant_3 | 30/972 | 30/972 / 4.00 | 0 / 0 / 0 | 6 → 6 | 15 |
| metal_1 | 18/972 | 12/972 / unreachable before | 0 / 0 / 0 | 3 → 6 | 18 |
| metal_2 | 36/972 | 12/972 / 4.00 | 0 / 0 / 0 | 6 → 6 | 18 |
| metal_3 | 45/972 | 30/972 / 1.33 | 0 / 0 / 0 | 6 → 6 | 15 |

## Earliest financed exemplar (own turns)

Income is external crystals per turn, paid AFTER placement/promotion. Starting units are free. No enemy or travel; tier rent is modeled here. Promotion permits immediate action; freshly placed pieces cannot promote again that turn.

| Unit | Net line investment | Income 3 | Income 6 | Income 9 |
|---|---:|---:|---:|---:|
| fire_1 | 0 | 1 | 1 | 1 |
| fire_2 | 4 | 3 | 2 | 2 |
| fire_3 | 12 | 6 | 4 | 3 |
| lightning_1 | 3 | 2 | 2 | 2 |
| lightning_2 | 7 | 4 | 3 | 3 |
| lightning_3 | 15 | 7 | 4 | 4 |
| water_1 | 0 | 1 | 1 | 1 |
| water_2 | 4 | 3 | 2 | 2 |
| water_3 | 12 | 6 | 4 | 3 |
| shadow_1 | 4 | 3 | 2 | 2 |
| shadow_2 | 8 | 4 | 3 | 3 |
| shadow_3 | 16 | 8 | 4 | 4 |
| plant_1 | 0 | 1 | 1 | 1 |
| plant_2 | 4 | 3 | 2 | 2 |
| plant_3 | 12 | 6 | 4 | 3 |
| metal_1 | 5 | 3 | 2 | 2 |
| metal_2 | 9 | 4 | 3 | 3 |
| metal_3 | 17 | 8 | 4 | 4 |

## Limits

- Open shortest-path distances, no traffic or enemy moves.
- Strike grid: 18 targets, all 18 open-board distances, action budgets 1/2/3; cells are not matchup probabilities.
- Kill frontiers: at most four distinct bodies in independent approach lanes, six shared actions; no tech gates.
- Mining: passive collection on one finite cell of 4/8/16 for up to six turns; no protection or other miners.
- Roles: least-cost SINGLE qualifying piece in declared strike/mining/occupation tasks; neither army optimality nor frequency.
- Access: maintained starting F1/W1/P1 and external income paid at turn end, upkeep before next placement; earliest single-line exemplar, not expected match timing.

Read solver/README.md for equations, counterfactual interpretation, test coverage and how to challenge these assumptions.

## Capabilities accessible by turn

Each is the best individually financed exemplar, not an army affordable all at once. Different pieces may set different maxima. The final column requires ONE available piece to have both the speed and attack for the kill.

| Income/turn | Own turn | Max ATK/DEF/SPD/MINE | Target types killable from distance 7 in 3 actions |
|---:|---:|---|---:|
| 3 | 1 | 2/3/2/3 | 0/18 |
| 3 | 2 | 2/3/3/3 | 5/18 |
| 3 | 3 | 3/3/3/5 | 5/18 |
| 3 | 4 | 3/4/4/5 | 9/18 |
| 3 | 5 | 3/4/4/5 | 9/18 |
| 3 | 6 | 4/4/4/8 | 17/18 |
| 3 | 7 | 4/4/5/8 | 17/18 |
| 3 | 8 | 4/5/5/8 | 18/18 |
| 6 | 1 | 2/3/2/3 | 0/18 |
| 6 | 2 | 3/3/3/5 | 5/18 |
| 6 | 3 | 3/4/4/5 | 9/18 |
| 6 | 4 | 4/5/5/8 | 18/18 |
| 6 | 5 | 4/5/5/8 | 18/18 |
| 6 | 6 | 4/5/5/8 | 18/18 |
| 6 | 7 | 4/5/5/8 | 18/18 |
| 6 | 8 | 4/5/5/8 | 18/18 |
| 9 | 1 | 2/3/2/3 | 0/18 |
| 9 | 2 | 3/3/3/5 | 5/18 |
| 9 | 3 | 4/4/4/8 | 17/18 |
| 9 | 4 | 4/5/5/8 | 18/18 |
| 9 | 5 | 4/5/5/8 | 18/18 |
| 9 | 6 | 4/5/5/8 | 18/18 |
| 9 | 7 | 4/5/5/8 | 18/18 |
| 9 | 8 | 4/5/5/8 | 18/18 |

## Conditional crystal value of ATK +1

Cheapest same-type squad, at most four bodies and six actions, at distances 1/4/7 against every target. Price savings average only cases feasible before AND after; newly feasible cases are reported separately and are not assigned an invented crystal price.

| Unit | Mean crystals saved in jointly feasible cases | Newly feasible cases | Example |
|---|---:|---:|---|
| fire_1 | 0.75 (36 cases) | 12/54 | water_1, distance 1: 6 → 3 crystals |
| fire_2 | 0.29 (48 cases) | 4/54 | water_2, distance 1: 14 → 7 crystals |
| fire_3 | 0.57 (53 cases) | 1/54 | water_3, distance 1: 30 → 15 crystals |
| lightning_1 | 0.96 (28 cases) | 15/54 | fire_3, distance 1: 6 → 3 crystals |
| lightning_2 | 2.44 (43 cases) | 8/54 | water_1, distance 1: 14 → 7 crystals |
| lightning_3 | 1.18 (51 cases) | 2/54 | water_2, distance 1: 30 → 15 crystals |
| water_1 | 1.19 (27 cases) | 2/54 | water_2, distance 1: 8 → 4 crystals |
| water_2 | 2.37 (27 cases) | 2/54 | water_2, distance 1: 16 → 8 crystals |
| water_3 | 2.00 (40 cases) | 8/54 | water_3, distance 1: 32 → 16 crystals |
| shadow_1 | 0.86 (37 cases) | 3/54 | water_2, distance 1: 8 → 4 crystals |
| shadow_2 | 1.00 (40 cases) | 8/54 | water_3, distance 1: 16 → 8 crystals |
| shadow_3 | 1.25 (51 cases) | 2/54 | plant_3, distance 1: 32 → 16 crystals |
| plant_1 | 5.83 (6 cases) | 9/54 | water_1, distance 1: 10 → 5 crystals |
| plant_2 | 4.80 (15 cases) | 13/54 | fire_1, distance 1: infeasible → 9 crystals |
| plant_3 | 3.64 (28 cases) | 5/54 | fire_3, distance 1: 34 → 17 crystals |
| metal_1 | 3.64 (11 cases) | 7/54 | fire_1, distance 1: infeasible → 5 crystals |
| metal_2 | 4.80 (15 cases) | 13/54 | fire_1, distance 1: infeasible → 9 crystals |
| metal_3 | 2.68 (38 cases) | 10/54 | fire_3, distance 1: 34 → 17 crystals |
