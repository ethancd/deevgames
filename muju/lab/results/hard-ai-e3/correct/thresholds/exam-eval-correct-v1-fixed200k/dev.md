# Muju examination set — dev stratum, hard@ablate:eval-correct-v1

- run at 2026-09-17T17:44:04.257Z on The-Work-Box.local (node v24.11.1)
- work: fixed 200000 units; config `hard:ablate:eval-correct-v1:fixed:200000#96b954370967000d45056f569149ea376078506c0974aa45f633a3e0f1cd096c`
- cases from `lab/hard-ai/exam/cases`; stratum rule: development — may be inspected, debugged against and tuned against
- wall 70.8 s for 149 cases

## Exact cases (canonical witness)

120/127 passed (94.5%).
1 passed by the "a win is never a miss" adjudication; 4 rest on an incomplete witness.

## Judgment cases (stated preference)

2/22 matched (9.1%).

Outcomes: matched 2, unmatched 13, won 3, dead 4
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
| `immediate-action` | 26/28 | 0/1 (+1 won) | Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions |
| `home-and-spawn` | 35/35 | 2/13 (+2 won, 4 dead) | Home occupation and spawn geometry — defend, invade, block spawning and recognize races |
| `recurring-upkeep` | 1/1 | 0/2 | Recurring upkeep — finance the next turn and choose a useful army, including forced releases |

## Exact misses (7)

| case | claim | engine end key | source | depth | note |
| --- | --- | --- | --- | ---: | --- |
| `authored-tactics-tactics-plugged-fire_1-vs-fire_3` | kill | `3bc2e15dbb95cdf4` | search | 5 |  |
| `authored-tactics-tactics-plugged-water_1-vs-fire_3` | kill | `053758f164195953` | search | 4 |  |
| `authored-tactics-tactics-plugged-water_2-vs-fire_3` | kill | `bc305e9f6531b52c` | search | 4 |  |
| `authored-tactics-tactics-plugged-water_3-vs-fire_3` | kill | `af3ea4c8345eafd8` | search | 6 |  |
| `authored-tactics-tactics-plugged-shadow_1-vs-fire_3` | kill | `85f0ff93a720a183` | search | 7 |  |
| `authored-spawn-strike-spawn-strike-purchase-4` | kill | `ea4a40a08701dc50` | search | 4 |  |
| `authored-spawn-strike-spawn-strike-retreat-1` | kill | `93646e0760fd48bc` | search | 4 |  |

