# Muju examination set — dev stratum, hard@ablate:eval-fix-b1

- run at 2026-09-17T07:00:22.660Z on The-Work-Box.local (node v24.11.1)
- work: fixed 25000 units; config `hard:ablate:eval-fix-b1:fixed:25000#4a16930a51e213a6aa94807b42eb46b8fb0e225c34385f0fb7bfa2b61aac00b9`
- cases from `lab/hard-ai/exam/cases`; stratum rule: development — may be inspected, debugged against and tuned against
- wall 7.7 s for 149 cases

## Exact cases (canonical witness)

121/127 passed (95.3%).
1 passed by the "a win is never a miss" adjudication; 4 rest on an incomplete witness.

## Judgment cases (stated preference)

4/22 matched (18.2%).

**A judgment match is not a pass and is never added to the exact tally.** It records
agreement with an adviser's or an author's preference; disagreement is a disagreement,
not a defect.

## By Muju demand (EPIC-PLAN §1)

| demand | exact passed/cases | judgment matched/cases | §1 row |
| --- | ---: | ---: | --- |
| `healing` | 32/32 | 0/6 | Healing each turn — prefer real kills and threats over damage that disappears |
| `shared-actions` | 26/31 | 0/0 | Four shared actions — coordinate movement, multiple attackers and Cleave; spend actions on a coherent turn |
| `immediate-action` | 27/28 | 0/1 | Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions |
| `home-and-spawn` | 35/35 | 3/13 | Home occupation and spawn geometry — defend, invade, block spawning and recognize races |
| `recurring-upkeep` | 1/1 | 1/2 | Recurring upkeep — finance the next turn and choose a useful army, including forced releases |

## Exact misses (6)

| case | claim | engine end key | source | depth | note |
| --- | --- | --- | --- | ---: | --- |
| `authored-tactics-tactics-plugged-fire_1-vs-fire_3` | kill | `3bc2e15dbb95cdf4` | search | 3 |  |
| `authored-tactics-tactics-plugged-water_1-vs-fire_3` | kill | `246e10f93b94c874` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_2-vs-fire_3` | kill | `d93c6377ad684e6b` | search | 2 |  |
| `authored-tactics-tactics-plugged-water_3-vs-fire_3` | kill | `af3ea4c8345eafd8` | search | 3 |  |
| `authored-tactics-tactics-plugged-shadow_1-vs-fire_3` | kill | `85f0ff93a720a183` | search | 4 |  |
| `authored-spawn-strike-spawn-strike-retreat-1` | kill | `93646e0760fd48bc` | search | 2 |  |

