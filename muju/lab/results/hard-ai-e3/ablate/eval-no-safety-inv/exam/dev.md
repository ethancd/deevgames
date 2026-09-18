# Muju examination set — dev stratum, hard@ablate:eval-no-safety-inv

- run at 2026-09-17T06:30:18.379Z on The-Work-Box.local (node v24.11.1)
- work: fixed 25000 units; config `hard:ablate:eval-no-safety-inv:fixed:25000#01169019a01593e5464bfbe22fad6740da94755563a15f7314c1e5cefb107250`
- cases from `lab/hard-ai/exam/cases`; stratum rule: development — may be inspected, debugged against and tuned against
- wall 7.4 s for 149 cases

## Exact cases (canonical witness)

120/127 passed (94.5%).
1 passed by the "a win is never a miss" adjudication; 4 rest on an incomplete witness.

## Judgment cases (stated preference)

5/22 matched (22.7%).

**A judgment match is not a pass and is never added to the exact tally.** It records
agreement with an adviser's or an author's preference; disagreement is a disagreement,
not a defect.

## By Muju demand (EPIC-PLAN §1)

| demand | exact passed/cases | judgment matched/cases | §1 row |
| --- | ---: | ---: | --- |
| `healing` | 32/32 | 0/6 | Healing each turn — prefer real kills and threats over damage that disappears |
| `shared-actions` | 25/31 | 0/0 | Four shared actions — coordinate movement, multiple attackers and Cleave; spend actions on a coherent turn |
| `immediate-action` | 27/28 | 0/1 | Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions |
| `home-and-spawn` | 35/35 | 3/13 | Home occupation and spawn geometry — defend, invade, block spawning and recognize races |
| `recurring-upkeep` | 1/1 | 2/2 | Recurring upkeep — finance the next turn and choose a useful army, including forced releases |

## Exact misses (7)

| case | claim | engine end key | source | depth | note |
| --- | --- | --- | --- | ---: | --- |
| `authored-tactics-tactics-plugged-fire_1-vs-fire_3` | kill | `3bc2e15dbb95cdf4` | search | 3 |  |
| `authored-tactics-tactics-plugged-fire_2-vs-fire_3` | kill | `2887392d96d49d55` | search | 3 |  |
| `authored-tactics-tactics-plugged-water_1-vs-fire_3` | kill | `31c79b62f1f42480` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_2-vs-fire_3` | kill | `64416c6104a6d67e` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_3-vs-fire_3` | kill | `af3ea4c8345eafd8` | search | 3 |  |
| `authored-tactics-tactics-plugged-shadow_1-vs-fire_3` | kill | `85f0ff93a720a183` | search | 4 |  |
| `authored-spawn-strike-spawn-strike-retreat-1` | kill | `abec4b6c8ffb54ce` | search | 2 |  |

