# Muju examination set — dev stratum, hard@desktop

- run at 2026-09-17T06:44:31.986Z on The-Work-Box.local (node v24.11.1)
- work: fixed 25000 units; config `hard:desktop:fixed:25000#517637c54a3b54d7dc9fa3a23c88ca97606e55ba1851094861d88ec54d7ce62f`
- cases from `lab/hard-ai/exam/cases`; stratum rule: development — may be inspected, debugged against and tuned against
- wall 18.9 s for 149 cases

## Exact cases (canonical witness)

121/127 passed (95.3%).
1 passed by the "a win is never a miss" adjudication; 4 rest on an incomplete witness.

## Judgment cases (stated preference)

1/22 matched (4.5%).

Outcomes: matched 1, unmatched 14, won 3, dead 4
(15 of 22 rows put a preference to the test at all).

Won outright, so neither matched nor missed (A7-2):
- `authored-home-mate-cheap-invasion-one-attack-mate-preference`
- `authored-home-mate-cheap-invasion-one-attack-rotated-black-mate-preference`
- `e21-purchase-plus-promotion`

Dead positions by canonical proof, so neither matched nor missed (A7-3):
- `authored-home-mate-clear-an-adjacent-lane-mate-preference`
- `authored-home-mate-clear-an-adjacent-lane-rotated-black-mate-preference`
- `authored-home-mate-zero-attack-occupier-mate-preference`
- `authored-home-mate-zero-attack-occupier-rotated-black-mate-preference`

**A judgment match is not a pass and is never added to the exact tally.** It records
agreement with an adviser's or an author's preference; disagreement is a disagreement,
not a defect.

## By Muju demand (EPIC-PLAN §1)

| demand | exact passed/cases | judgment matched/cases | §1 row |
| --- | ---: | ---: | --- |
| `healing` | 32/32 | 0/6 | Healing each turn — prefer real kills and threats over damage that disappears |
| `shared-actions` | 26/31 | 0/0 | Four shared actions — coordinate movement, multiple attackers and Cleave; spend actions on a coherent turn |
| `immediate-action` | 27/28 | 0/1 (+1 won) | Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions |
| `home-and-spawn` | 35/35 | 0/13 (+2 won, 4 dead) | Home occupation and spawn geometry — defend, invade, block spawning and recognize races |
| `recurring-upkeep` | 1/1 | 1/2 | Recurring upkeep — finance the next turn and choose a useful army, including forced releases |

## Exact misses (6)

| case | claim | engine end key | source | depth | note |
| --- | --- | --- | --- | ---: | --- |
| `authored-tactics-tactics-plugged-fire_1-vs-fire_3` | kill | `3bc2e15dbb95cdf4` | search | 3 |  |
| `authored-tactics-tactics-plugged-water_1-vs-fire_3` | kill | `31c79b62f1f42480` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_2-vs-fire_3` | kill | `64416c6104a6d67e` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_3-vs-fire_3` | kill | `af3ea4c8345eafd8` | search | 3 |  |
| `authored-tactics-tactics-plugged-shadow_1-vs-fire_3` | kill | `85f0ff93a720a183` | search | 4 |  |
| `authored-spawn-strike-spawn-strike-retreat-1` | kill | `93646e0760fd48bc` | search | 2 |  |

