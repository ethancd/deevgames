# Static value solver: current

Catalogue SHA-256: `fd7244d37e2cc313e6b67219747f8acf54da2fdd996aec39f94ede204f7abbe3`. Model SHA-256: `2ac32c09748a2662ed4ed4658aaac1ae4f9f5f46a810e8da50aecde8c2b876f4`.

**This is a set of local optimization results, not a universal power score or a proof of game balance.**

## Distinctness and cheapest qualifying roles

Witness counts reflect this deliberately broad mission grid, not importance or expected frequency. A witness means a cheapest qualifying single piece; it does not beat every mixed army.

| Unit | ATK/DEF/SPD/MINE | Cost | Same-tier dominators | Cheapest / sole-cheapest tasks | Example witness |
|---|---|---|---|---:|---|
| Hi (fire_1) | 2/1/2/1 | 1 | none | 2760 / 1848 | strike fire_1 at distance 1 within 1 actions; mine >=1 crystals at turn end on rich ground; survive no hit |
| Hono (fire_2) | 3/1/2/1 | 3 | none | 1272 / 936 | strike water_1 at distance 3 within 2 actions; mine >=0 crystals at turn end on rich ground; survive plant_2 hit |
| Kagari (fire_3) | 4/2/3/1 | 6 | none | 6726 / 5400 | strike fire_1 at distance 3 within 2 actions; mine >=0 crystals at turn end on rich ground; survive plant_3 hit |
| Radi (lightning_1) | 1/1/3/0 | 1 | none | 1296 / 384 | strike fire_1 at distance 4 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Umeme (lightning_2) | 2/1/4/0 | 3 | none | 636 / 636 | strike fire_1 at distance 5 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Kimubunga (lightning_3) | 3/1/5/0 | 6 | none | 1092 / 732 | strike fire_1 at distance 6 within 2 actions; mine >=0 crystals at turn end on rich ground; survive no hit |
| Sjor (water_1) | 2/2/1/2 | 2 | none | 2874 / 2058 | strike fire_1 at distance 1 within 1 actions; mine >=1 crystals at turn end on rich ground; survive fire_1 hit |
| Straumr (water_2) | 2/3/1/2 | 4 | none | 2766 / 2766 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive fire_2 hit |
| Aegirinn (water_3) | 3/4/2/3 | 10 | none | 11778 / 10878 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive fire_3 hit |
| Göl (shadow_1) | 2/2/2/0 | 2 | none | 1404 / 588 | strike fire_1 at distance 3 within 2 actions; mine >=0 crystals at turn end on rich ground; survive fire_1 hit |
| Gölge (shadow_2) | 3/2/2/1 | 4 | none | 1026 / 1026 | strike fire_1 at distance 3 within 2 actions; mine >=1 crystals at turn end on rich ground; survive fire_1 hit |
| Karanlık (shadow_3) | 4/2/3/2 | 10 | none | 4215 / 3315 | strike fire_1 at distance 4 within 2 actions; mine >=0 crystals at turn end on rich ground; survive fire_1 hit |
| Muju (plant_1) | 0/2/1/3 | 3 | none | 326 / 98 | collect >=3 on ordinary reserve 4 within 1 turns; survive no hit |
| Sachita (plant_2) | 1/3/1/4 | 6 | none | 2372 / 1196 | strike water_1 at distance 1 within 1 actions; mine >=4 crystals at turn end on rich ground; survive no hit |
| Sachakuna (plant_3) | 2/4/1/5 | 12 | none | 6388 / 3760 | strike fire_1 at distance 1 within 1 actions; mine >=5 crystals at turn end on rich ground; survive no hit |
| Inyan (metal_1) | 1/3/1/2 | 3 | none | 3048 / 2484 | strike water_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive water_1 hit |
| Mazask (metal_2) | 2/4/1/3 | 6 | none | 7536 / 5394 | strike fire_1 at distance 1 within 1 actions; mine >=0 crystals at turn end on rich ground; survive water_3 hit |
| Tanka (metal_3) | 2/6/2/4 | 12 | none | 7146 / 4518 | strike fire_1 at distance 1 within 1 actions; mine >=4 crystals at turn end on rich ground; survive fire_2 hit |

## Marginal stat values (one extra point, holding opponents fixed)

Attack and speed show newly reachable one-hit kill cells on the reporting grid. Action savings are mean shortest-path move-then-attack savings over the declared distances. Mining gains are exact extra resources within six passive income turns. Defense compares the cheapest feasible four-body/six-action attack at distance 1; “unbreakable” only means infeasible under that bound.

| Unit | ATK+1: kill cells | SPD+1: kill cells / mean actions saved | MINE+1: ordinary / shelf / rich resources | DEF+1: cheapest kill bill before → after | ATK×SPD extra cells beyond additive |
|---|---:|---:|---:|---|---:|
| fire_1 | 54/972 | 27/972 / 1.33 | 0 / 2 / 4 | 1 → 1 | 18 |
| fire_2 | 9/972 | 45/972 / 1.33 | 0 / 2 / 4 | 1 → 1 | 3 |
| fire_3 | 24/972 | 48/972 / 0.67 | 0 / 2 / 4 | 1 → 2 | 6 |
| lightning_1 | 36/972 | 18/972 / 0.67 | 4 / 6 / 6 | 1 → 1 | 9 |
| lightning_2 | 90/972 | 27/972 / 0.39 | 4 / 6 / 6 | 1 → 1 | 18 |
| lightning_3 | 18/972 | 45/972 / 0.28 | 4 / 6 / 6 | 1 → 1 | 3 |
| water_1 | 12/972 | 30/972 / 4.00 | 0 / 0 / 0 | 2 → 3 | 6 |
| water_2 | 12/972 | 30/972 / 4.00 | 0 / 0 / 0 | 3 → 4 | 6 |
| water_3 | 27/972 | 36/972 / 1.33 | 0 / 0 / 0 | 4 → 5 | 9 |
| shadow_1 | 18/972 | 30/972 / 1.33 | 4 / 6 / 6 | 2 → 3 | 6 |
| shadow_2 | 27/972 | 36/972 / 1.33 | 0 / 2 / 4 | 2 → 3 | 9 |
| shadow_3 | 24/972 | 45/972 / 0.67 | 0 / 0 / 0 | 2 → 3 | 6 |
| plant_1 | 24/972 | 0/972 / 4.00 | 0 / 0 / 0 | 1 → 1 | 12 |
| plant_2 | 42/972 | 12/972 / 4.00 | 0 / 0 / 0 | 1 → 2 | 21 |
| plant_3 | 24/972 | 33/972 / 4.00 | 0 / 0 / 0 | 2 → 2 | 12 |
| metal_1 | 42/972 | 12/972 / 4.00 | 0 / 0 / 0 | 1 → 2 | 21 |
| metal_2 | 24/972 | 33/972 / 4.00 | 0 / 0 / 0 | 2 → 2 | 12 |
| metal_3 | 36/972 | 33/972 / 1.33 | 0 / 0 / 0 | 2 → 3 | 12 |

## Earliest financed exemplar (own turns)

Income is external crystals per turn, paid AFTER placement/promotion. Starting units are free. No enemy or travel; tier rent is modeled here. Promotion permits immediate action; freshly placed pieces cannot promote again that turn.

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
| water_3 | 8 | 5 | 3 | 3 |
| shadow_1 | 2 | 2 | 2 | 2 |
| shadow_2 | 4 | 3 | 3 | 3 |
| shadow_3 | 10 | 5 | 4 | 4 |
| plant_1 | 0 | 1 | 1 | 1 |
| plant_2 | 3 | 2 | 2 | 2 |
| plant_3 | 9 | 5 | 3 | 3 |
| metal_1 | 3 | 2 | 2 | 2 |
| metal_2 | 6 | 3 | 3 | 3 |
| metal_3 | 12 | 6 | 4 | 4 |

## Limits

- Open shortest-path distances, no traffic or enemy moves.
- Strike grid: 18 targets, all 18 open-board distances, action budgets 1/2/3; cells are not matchup probabilities.
- Kill frontiers: at most four distinct bodies in independent approach lanes, six shared actions; no tech gates.
- Mining: passive collection on one finite cell of 4/8/10 for up to six turns; no protection or other miners.
- Roles: least-cost SINGLE qualifying piece in declared strike/mining/occupation tasks; neither army optimality nor frequency.
- Access: maintained starting F1/W1/P1 and external income paid at turn end, upkeep before next placement; earliest single-line exemplar, not expected match timing.

Read solver/README.md for equations, counterfactual interpretation, test coverage and how to challenge these assumptions.

## Capabilities accessible by turn

Each is the best individually financed exemplar, not an army affordable all at once. Different pieces may set different maxima. The final column requires ONE available piece to have both the speed and attack for the kill.

| Income/turn | Own turn | Max ATK/DEF/SPD/MINE | Target types killable from distance 7 in 3 actions |
|---:|---:|---|---:|
| 3 | 1 | 2/2/2/3 | 0/18 |
| 3 | 2 | 3/3/3/4 | 6/18 |
| 3 | 3 | 4/4/4/4 | 16/18 |
| 3 | 4 | 4/4/5/4 | 16/18 |
| 3 | 5 | 4/4/5/5 | 17/18 |
| 3 | 6 | 4/6/5/5 | 17/18 |
| 3 | 7 | 4/6/5/5 | 17/18 |
| 3 | 8 | 4/6/5/5 | 17/18 |
| 6 | 1 | 2/2/2/3 | 0/18 |
| 6 | 2 | 3/3/3/4 | 6/18 |
| 6 | 3 | 4/4/4/5 | 16/18 |
| 6 | 4 | 4/6/5/5 | 17/18 |
| 6 | 5 | 4/6/5/5 | 17/18 |
| 6 | 6 | 4/6/5/5 | 17/18 |
| 6 | 7 | 4/6/5/5 | 17/18 |
| 6 | 8 | 4/6/5/5 | 17/18 |
| 9 | 1 | 2/2/2/3 | 0/18 |
| 9 | 2 | 3/3/3/4 | 6/18 |
| 9 | 3 | 4/4/4/5 | 16/18 |
| 9 | 4 | 4/6/5/5 | 17/18 |
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
| lightning_1 | 0.31 (35 cases) | 16/54 | fire_3, distance 1: 2 → 1 crystals |
| lightning_2 | 1.29 (51 cases) | 3/54 | water_1, distance 1: 6 → 3 crystals |
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
