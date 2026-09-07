# Static value solver: lightning

Catalogue SHA-256: `63ab3922ec38efc53f4b1f6310e34799920fa7ec7e0cf4e3144545fd4343d57a`. Model SHA-256: `859f0b67455c80190450c895cbad154e27742f22a4c46c01b4347e80f1d48940`.

**This is a set of local optimization results, not a universal power score or a proof of game balance.**

## Distinctness and cheapest qualifying roles

Witness counts reflect this deliberately broad mission grid, not importance or expected frequency. A witness means a cheapest qualifying single piece; it does not beat every mixed army.

| Unit | ATK/DEF/SPD/MINE | Cost/build | Same-tier dominators | Cheapest / sole-cheapest tasks | Example witness |
|---|---|---|---|---:|---|
| Hi (fire_1) | 2/1/2/1 | 1/1 | none | 2572 / 1084 | strike fire_1 at distance 1 within 2 actions; mine >=1 fresh layers first; survive no hit |
| Hono (fire_2) | 3/1/2/1 | 3/1 | none | 1198 / 430 | strike fire_4 at distance 1 within 2 actions; mine >=1 fresh layers first; survive plant_2 hit |
| Kagari (fire_3) | 4/2/3/1 | 6/2 | none | 6232 / 4436 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive plant_3 hit |
| Gokamoka (fire_4) | 6/3/4/1 | 10/2 | none | 11100 / 9386 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive plant_4 hit |
| Radi (lightning_1) | 2/1/3/0 | 1/1 | none | 2112 / 624 | strike fire_1 at distance 4 within 2 actions; mine >=0 fresh layers first; survive no hit |
| Umeme (lightning_2) | 3/1/4/0 | 3/1 | none | 1908 / 1260 | strike fire_1 at distance 5 within 2 actions; mine >=0 fresh layers first; survive no hit |
| Kimubunga (lightning_3) | 3/1/5/1 | 6/2 | none | 2336 / 1656 | strike fire_1 at distance 5 within 3 actions; mine >=1 fresh layers first; survive no hit |
| Dhorubakali (lightning_4) | 4/1/6/1 | 10/2 | none | 1256 / 992 | strike fire_1 at distance 7 within 2 actions; mine >=0 fresh layers first; survive no hit |
| Sjor (water_1) | 2/2/1/2 | 2/1 | none | 2066 / 1340 | strike fire_1 at distance 1 within 2 actions; mine >=1 fresh layers first; survive fire_1 hit |
| Straumr (water_2) | 2/3/1/2 | 4/2 | none | 3432 / 3432 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive fire_2 hit |
| Aegirinn (water_3) | 3/4/2/3 | 10/2 | none | 13635 / 13027 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive fire_3 hit |
| Hafkafstormur (water_4) | 4/5/3/3 | 15/3 | none | 20740 / 14866 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive water_4 hit |
| Göl (shadow_1) | 2/2/2/0 | 2/1 | none | 1248 / 522 | strike fire_1 at distance 3 within 2 actions; mine >=0 fresh layers first; survive fire_1 hit |
| Gölge (shadow_2) | 3/2/2/1 | 4/2 | none | 850 / 850 | strike fire_1 at distance 3 within 3 actions; mine >=1 fresh layers first; survive fire_1 hit |
| Karanlık (shadow_3) | 4/2/3/2 | 10/2 | none | 3078 / 1020 | strike fire_1 at distance 4 within 3 actions; mine >=2 fresh layers first; survive no hit |
| Karabasan (shadow_4) | 5/3/4/2 | 15/3 | none | 14013 / 8139 | strike fire_1 at distance 5 within 2 actions; mine >=0 fresh layers first; survive fire_2 hit |
| Muju (plant_1) | 0/2/1/3 | 3/2 | none | 299 / 133 | mine >=3 in fresh corridor within 1 actions; survive no hit |
| Sachita (plant_2) | 1/3/1/3 | 6/2 | metal_2 | 815 / 0 | strike water_1 at distance 1 within 2 actions; mine >=3 fresh layers first; survive no hit |
| Sachakuna (plant_3) | 2/4/1/4 | 12/3 | none | 4040 / 4040 | strike fire_1 at distance 1 within 2 actions; mine >=4 fresh layers first; survive no hit |
| Cuauhtlimallki (plant_4) | 3/5/1/5 | 20/3 | none | 8729 / 6250 | strike fire_1 at distance 1 within 2 actions; mine >=5 fresh layers first; survive no hit |
| Inyan (metal_1) | 1/3/1/2 | 3/2 | none | 2426 / 1972 | strike water_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive water_1 hit |
| Mazaska (metal_2) | 2/4/1/3 | 6/2 | none | 9715 / 7784 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive water_3 hit |
| Tankasila (metal_3) | 2/6/1/3 | 12/3 | none | 921 / 921 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive shadow_4 hit |
| Wakanwicasa (metal_4) | 3/8/1/4 | 20/3 | none | 4518 / 2039 | strike fire_1 at distance 1 within 1 actions; mine >=0 fresh layers first; survive fire_4 hit |

## Marginal stat values (one extra point, holding opponents fixed)

Attack and speed show newly reachable one-hit kill cells on the reporting grid. Action savings are mean shortest-path move-then-attack savings over the declared distances. Mining gains are exact extra resources within six corridor actions. Defense compares the cheapest feasible four-body/six-action attack at distance 1; “unbreakable” only means infeasible under that bound.

| Unit | ATK+1: kill cells | SPD+1: kill cells / mean actions saved | MINE+1: fresh / scattered / stripped resources | DEF+1: cheapest kill bill before → after | ATK×SPD extra cells beyond additive |
|---|---:|---:|---:|---|---:|
| fire_1 | 63/1296 | 30/1296 / 1.33 | 3 / 2 / 0 | 1 → 1 | 21 |
| fire_2 | 27/1296 | 51/1296 / 1.33 | 3 / 2 / 0 | 1 → 1 | 9 |
| fire_3 | 24/1296 | 60/1296 / 0.67 | 3 / 2 / 0 | 1 → 2 | 6 |
| fire_4 | 15/1296 | 69/1296 / 0.39 | 3 / 3 / 0 | 2 → 2 | 3 |
| lightning_1 | 84/1296 | 30/1296 / 0.67 | 3 / 2 / 0 | 1 → 1 | 21 |
| lightning_2 | 45/1296 | 51/1296 / 0.39 | 3 / 3 / 0 | 1 → 1 | 9 |
| lightning_3 | 54/1296 | 51/1296 / 0.28 | 3 / 3 / 0 | 1 → 1 | 9 |
| lightning_4 | 42/1296 | 60/1296 / 0.17 | 3 / 3 / 0 | 1 → 1 | 6 |
| water_1 | 18/1296 | 36/1296 / 4.00 | 3 / 2 / 0 | 2 → 3 | 9 |
| water_2 | 18/1296 | 36/1296 / 4.00 | 3 / 2 / 0 | 3 → 4 | 9 |
| water_3 | 27/1296 | 45/1296 / 1.33 | 3 / 2 / 3 | 4 → 5 | 9 |
| water_4 | 36/1296 | 54/1296 / 0.67 | 3 / 2 / 3 | 5 → 6 | 9 |
| shadow_1 | 27/1296 | 36/1296 / 1.33 | 3 / 2 / 0 | 2 → 3 | 9 |
| shadow_2 | 27/1296 | 45/1296 / 1.33 | 3 / 2 / 0 | 2 → 3 | 9 |
| shadow_3 | 36/1296 | 54/1296 / 0.67 | 3 / 2 / 0 | 2 → 3 | 9 |
| shadow_4 | 15/1296 | 63/1296 / 0.39 | 3 / 3 / 0 | 3 → 4 | 3 |
| plant_1 | 24/1296 | 0/1296 / 4.00 | 3 / 2 / 3 | 1 → 1 | 12 |
| plant_2 | 54/1296 | 12/1296 / 4.00 | 3 / 2 / 3 | 1 → 2 | 27 |
| plant_3 | 24/1296 | 39/1296 / 4.00 | 3 / 2 / 3 | 2 → 2 | 12 |
| plant_4 | 24/1296 | 51/1296 / 4.00 | 0 / 0 / 0 | 2 → 2 | 12 |
| metal_1 | 54/1296 | 12/1296 / 4.00 | 3 / 2 / 0 | 1 → 2 | 27 |
| metal_2 | 24/1296 | 39/1296 / 4.00 | 3 / 2 / 3 | 2 → 2 | 12 |
| metal_3 | 24/1296 | 39/1296 / 4.00 | 3 / 2 / 3 | 2 → 3 | 12 |
| metal_4 | 24/1296 | 51/1296 / 4.00 | 3 / 2 / 3 | 3 → 3 | 12 |

## Earliest financed exemplar (own turns)

Income is external crystals per turn, paid AFTER placement/promotion. Starting units are free. No enemy, travel, or income-generating action cost is modeled here. Promotion permits immediate action; freshly placed pieces cannot promote again that turn.

| Unit | Net line investment | Income 3 | Income 6 | Income 9 |
|---|---:|---:|---:|---:|
| fire_1 | 0 | 1 | 1 | 1 |
| fire_2 | 2 | 2 | 2 | 2 |
| fire_3 | 5 | 3 | 3 | 3 |
| fire_4 | 9 | 4 | 4 | 4 |
| lightning_1 | 1 | 2 | 2 | 2 |
| lightning_2 | 3 | 3 | 3 | 3 |
| lightning_3 | 6 | 4 | 4 | 4 |
| lightning_4 | 10 | 5 | 5 | 5 |
| water_1 | 0 | 1 | 1 | 1 |
| water_2 | 2 | 2 | 2 | 2 |
| water_3 | 8 | 4 | 3 | 3 |
| water_4 | 13 | 6 | 4 | 4 |
| shadow_1 | 2 | 2 | 2 | 2 |
| shadow_2 | 4 | 3 | 3 | 3 |
| shadow_3 | 10 | 5 | 4 | 4 |
| shadow_4 | 15 | 6 | 5 | 5 |
| plant_1 | 0 | 1 | 1 | 1 |
| plant_2 | 3 | 2 | 2 | 2 |
| plant_3 | 9 | 4 | 3 | 3 |
| plant_4 | 17 | 7 | 4 | 4 |
| metal_1 | 3 | 3 | 3 | 3 |
| metal_2 | 6 | 4 | 4 | 4 |
| metal_3 | 12 | 5 | 5 | 5 |
| metal_4 | 20 | 8 | 6 | 6 |

## Limits

- Open shortest-path distances, no traffic or enemy moves.
- Strike grid: 24 targets, all 18 open-board distances, action budgets 1/2/3; cells are not matchup probabilities.
- Kill frontiers: at most four distinct bodies in independent approach lanes, six shared actions; no tech gates.
- Mining: exact finite ten-cell corridor, six actions, one unit, no protection or other miners.
- Roles: least-cost SINGLE qualifying piece in declared strike/mining/occupation tasks; neither army optimality nor frequency.
- Access: maintained starting F1/W1/P1 and external income paid after placement; earliest single-line exemplar, not expected match timing.

Read solver/README.md for equations, counterfactual interpretation, test coverage and how to challenge these assumptions.

## Capabilities accessible by turn

Each is the best individually financed exemplar, not an army affordable all at once. Different pieces may set different maxima. The final column requires ONE available piece to have both the speed and attack for the kill.

| Income/turn | Own turn | Max ATK/DEF/SPD/MINE | Target types killable from distance 7 in 3 actions |
|---:|---:|---|---:|
| 3 | 1 | 2/2/2/3 | 0/24 |
| 3 | 2 | 3/3/3/3 | 10/24 |
| 3 | 3 | 4/3/4/3 | 20/24 |
| 3 | 4 | 6/4/5/4 | 23/24 |
| 3 | 5 | 6/6/6/4 | 23/24 |
| 3 | 6 | 6/6/6/4 | 23/24 |
| 3 | 7 | 6/6/6/5 | 23/24 |
| 3 | 8 | 6/8/6/5 | 23/24 |
| 6 | 1 | 2/2/2/3 | 0/24 |
| 6 | 2 | 3/3/3/3 | 10/24 |
| 6 | 3 | 4/4/4/4 | 20/24 |
| 6 | 4 | 6/5/5/5 | 23/24 |
| 6 | 5 | 6/6/6/5 | 23/24 |
| 6 | 6 | 6/8/6/5 | 23/24 |
| 6 | 7 | 6/8/6/5 | 23/24 |
| 6 | 8 | 6/8/6/5 | 23/24 |
| 9 | 1 | 2/2/2/3 | 0/24 |
| 9 | 2 | 3/3/3/3 | 10/24 |
| 9 | 3 | 4/4/4/4 | 20/24 |
| 9 | 4 | 6/5/5/5 | 23/24 |
| 9 | 5 | 6/6/6/5 | 23/24 |
| 9 | 6 | 6/8/6/5 | 23/24 |
| 9 | 7 | 6/8/6/5 | 23/24 |
| 9 | 8 | 6/8/6/5 | 23/24 |

## Conditional crystal value of ATK +1

Cheapest same-type squad, at most four bodies and six actions, at distances 1/4/7 against every target. Price savings average only cases feasible before AND after; newly feasible cases are reported separately and are not assigned an invented crystal price.

| Unit | Mean crystals saved in jointly feasible cases | Newly feasible cases | Example |
|---|---:|---:|---|
| fire_1 | 0.37 (52 cases) | 12/72 | fire_4, distance 1: 2 → 1 crystals |
| fire_2 | 0.33 (64 cases) | 4/72 | water_2, distance 1: 6 → 3 crystals |
| fire_3 | 0.50 (72 cases) | 0/72 | water_3, distance 1: 12 → 6 crystals |
| fire_4 | 0.42 (72 cases) | 0/72 | metal_4, distance 1: 20 → 10 crystals |
| lightning_1 | 0.45 (64 cases) | 7/72 | fire_4, distance 1: 2 → 1 crystals |
| lightning_2 | 0.46 (71 cases) | 1/72 | water_2, distance 1: 6 → 3 crystals |
| lightning_3 | 0.93 (71 cases) | 1/72 | water_2, distance 1: 12 → 6 crystals |
| lightning_4 | 0.83 (72 cases) | 0/72 | water_3, distance 1: 20 → 10 crystals |
| water_1 | 0.61 (33 cases) | 6/72 | water_2, distance 1: 4 → 2 crystals |
| water_2 | 1.21 (33 cases) | 6/72 | water_2, distance 1: 8 → 4 crystals |
| water_3 | 1.50 (60 cases) | 5/72 | water_3, distance 1: 20 → 10 crystals |
| water_4 | 2.32 (71 cases) | 1/72 | water_4, distance 1: 30 → 15 crystals |
| shadow_1 | 0.53 (49 cases) | 11/72 | water_2, distance 1: 4 → 2 crystals |
| shadow_2 | 0.60 (60 cases) | 5/72 | water_3, distance 1: 8 → 4 crystals |
| shadow_3 | 1.55 (71 cases) | 1/72 | water_4, distance 1: 20 → 10 crystals |
| shadow_4 | 0.63 (72 cases) | 0/72 | plant_4, distance 1: 30 → 15 crystals |
| plant_1 | 3.43 (7 cases) | 10/72 | water_1, distance 1: 6 → 3 crystals |
| plant_2 | 3.53 (17 cases) | 20/72 | fire_1, distance 1: infeasible → 6 crystals |
| plant_3 | 2.59 (37 cases) | 4/72 | fire_3, distance 1: 24 → 12 crystals |
| plant_4 | 2.44 (41 cases) | 4/72 | fire_4, distance 1: 40 → 20 crystals |
| metal_1 | 1.76 (17 cases) | 20/72 | fire_1, distance 1: infeasible → 3 crystals |
| metal_2 | 1.30 (37 cases) | 4/72 | fire_3, distance 1: 12 → 6 crystals |
| metal_3 | 2.59 (37 cases) | 4/72 | fire_3, distance 1: 24 → 12 crystals |
| metal_4 | 2.44 (41 cases) | 4/72 | fire_4, distance 1: 40 → 20 crystals |
