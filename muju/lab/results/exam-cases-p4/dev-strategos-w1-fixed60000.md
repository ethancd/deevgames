# Muju examination set — dev stratum, hard@strategos

- run at 2026-09-25T07:00:05.723Z on The-Work-Box.local (node v24.11.1)
- work: fixed 60000 units; config `hard:strategos:fixed:60000#776b2ad070b4447ad1ff9c8cfcfd540d935d6c3a09c12adc6c98791cd4cb925e`
- cases from `lab/hard-ai/exam/cases-p4`; stratum rule: development — may be inspected, debugged against and tuned against
- wall 8.9 s for 8 cases

## Exact cases (canonical witness)

0/0 passed (n/a).
0 passed by the "a win is never a miss" adjudication; 0 rest on an incomplete witness.

## Judgment cases (stated preference)

0/0 matched (n/a).

Outcomes: matched 0, unmatched 0, won 0, dead 0
(0 of 0 rows put a preference to the test at all).

**A judgment match is not a pass and is never added to the exact tally.** It records
agreement with an adviser's or an author's preference; disagreement is a disagreement,
not a defect.

## Plan cases (canonical predicate, authored choice)

4/8 passed (50.0%); 5/8 as the author expected (1 expected to fail).
0 passed by the "a win is never a miss" adjudication; 0 engine turn(s) did not replay.
Unexpected outcomes: `wave1-OP01-W-t1`, `wave1-OP01-W-t2`, `wave1-OP02-W-t6`.

| case | clock (plies left) | mined W–B | predicate | expected | result | engine turn | evidence |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| `wave1-AS01-W-t3` | 5 (5) | 30–13 | damaging-attack | pass | PASS | MV G6-D1 · ATK D1xC1 p2 · EA · EP | damaging attack: lightning_1@D1 x plant_1@C1 power 2 |
| `wave1-OP01-W-t1` | 1 (9) | 6–9 | spawn-area-open | pass | FAIL (unexpected) | MV J9-J10 · MV I9-J9 · MV J9-J8 · MV I10-I9 · EA · BUY plant_1@J9 · BUY plant_1@I10 · EP | 0 legal spawn square(s) for black after the turn |
| `wave1-OP01-W-t2` | 3 (7) | 14–15 | contact-in-3 | pass | FAIL (unexpected) | EA · EP | no contact within 3 plies: no damaging strike this turn, no adjacency after it, no single-unit strike line after a passive reply |
| `wave1-SO02-B-t37` | 4 (6) | 250–248 | damaging-attack | pass | PASS | ATK E10xD10 p1 · MV B3-C3 · EA · UPKEEP keep 32 · EP | damaging attack: plant_1@E10 x water_3@D10 power 1 |
| `wave1-FB01-B-t18` | 0 (10) | 164–230 | promotion-made | pass | PASS | MV D6-I9 · EA · BUY lightning_1@E3 · BUY lightning_1@E4 · BUY lightning_1@E5 · BUY lightning_1@D6 · PROMO B1 · EP | promoted metal_1->metal_2@B1 |
| `wave1-SN05-W-t5` | 9 (1) | 34–73 | no-clock-reset | pass | PASS | EA · EP | no kill; the clock reads 10 after the hand-off and the game is over (kill-clock, winner black) |
| `wave1-OP02-W-t6` | 0 (10) | 57–82 | promotion-made | pass | FAIL (unexpected) | MV I5-E3 · EA · BUY plant_1@I4 · BUY plant_1@I5 · BUY plant_1@I7 · BUY plant_1@I8 · EP | no promotion in the turn |
| `wave1-SO01-B-t11` | 0 (10) | 80–104 | damaging-attack | fail | FAIL | MV B5-D5 · MV B4-A4 · MV B2-A2 · EA · BUY shadow_1@C1 · BUY shadow_1@B2 · BUY shadow_1@B3 · BUY shadow_1@B4 · EP | no attack in the turn |

**A plan pass is never added to the exact or judgment tallies.** The predicate is decided by the canonical
rules; that it is the right plan at that position is the author's stated judgment (see each case's `reason`).

## By Muju demand (EPIC-PLAN §1)

| demand | exact passed/cases | judgment matched/cases | plan passed/cases | §1 row |
| --- | ---: | ---: | ---: | --- |
| `quiet-clock` | 0/0 | 0/0 | 3/4 | Ten turns without a kill cause a draw — seek a draw when losing and avoid accidental draws when winning |
| `home-and-spawn` | 0/0 | 0/0 | 0/2 | Home occupation and spawn geometry — defend, invade, block spawning and recognize races |
| `immediate-action` | 0/0 | 0/0 | 1/2 | Immediate action after purchasing/promoting — see summon-and-strike, combined purchases/promotions and multiple promotions |

## Exact misses (0)

None.

