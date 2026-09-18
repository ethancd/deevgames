**Four actions per turn: a more positional Muju Hono Tanka**

Four shared actions would make positioning and damage per action more valuable, constrain coordinated attacks, and let the economy develop faster relative to troop movement. This is a substantial balance change: mining, purchases, promotions, healing, upkeep and the home-occupation deadline all retain their existing timing.

I ran **560 scripted games: 280 with six actions and 280 with four**, using the current catalogue and 496-crystal map. Eight matchup cells cover rush, expansion, defense, invasion, siege and mirrors; each uses 20 seeds, with colors swapped for distinct policies. Only the shared action budget changed, in an isolated engine copy.

| Observed in this policy mix | Six actions | Four actions |
|---|---:|---:|
| Median first-kill round, among games with kills | 1 | 2 |
| Mean game length, in rounds | 22.4 | 27.1 |
| Median game length, in rounds | 21 | 22 |
| Inactivity draws | 57/280 (20.4%) | 66/280 (23.6%) |
| Rush wins against pure expansion | 40/40 | 40/40 |
| Median length of those rush–expansion games | 6 | 13 |

The clearest result is **a slower rush, with the same outcome against undefended expansion**. Longer tails drive much of the 21% increase in mean game length; the overall median increases by just one round. The small draw-rate increase is suggestive. These fixed policies describe possible failure modes; expert balance and human turn duration remain untested.

- **Movement becomes a bigger commitment.** With an open route, Hi/Hono’s maximum move-and-attack distance falls from 11 to 7 squares; Sjor’s falls from 6 to 4. Advancing, attacking and retreating must compete for four actions. A replayed opening against a stationary opponent needs nine total actions for the starting Hi to kill the enemy Muju: own turn 2 with six actions, turn 3 with four. Forward spawn anchors and nearby reserves become more valuable.

- **Finishing a target matters more.** Damage still fully heals at the target’s next turn, so a five-action combination cannot be completed across two turns. Durable pieces gain protection from dispersed attackers; one-hit counters become more valuable. Kagari remains the only catalogue unit that can kill a full-health Tanka in one hit. Cleave still caps at the same tier: exact enumeration found three kills against spaced Muju require six actions, allowing only two with four. Three adjacent Muju still fall in three actions under either budget.

- **The home-corner deadline gets harsher too.** In an exact fixture, enemy Tanka occupies A1, friendly Hi is at E1 and Radi at A4, with no crystals. Clearing it requires five actions: two moves for Hi, one for Radi, and two attacks. Six actions save the game; four cannot prevent the occupation win. Moving Hi one square closer, to D1, restores a four-action defense. Earlier positioning becomes essential even though invasions themselves travel more slowly.

- **Economic growth and army activity pull apart.** Stationary starters still collect six crystals; buying and promoting still cost no actions. More bodies can earn income without being activated, favoring passive coverage while crowding the movement budget. Finite reserves still force relocation, which becomes harder. Upgraded pieces also pay unchanged upkeep during longer journeys, so an across-the-board elite-unit buff is unlikely. The unchanged ten-player-turn inactivity clock allows each side only 20 action points instead of 30 before a quiet-game draw.

**My judgment:** a promising variant for more deliberate positioning and tighter local fights. The main risks are congested armies, combinations that cease to work, and home invasions that require defenders to be positioned earlier. The matchup results do not establish a universal defensive advantage: the Tanka-siege policy fell from 24/40 to 12/40 wins against the home-guard policy, while improving from 8/40 to 14/40 against rush.

All 560 games passed legality and invariant checks; none hit the simulation cap. Eight baseline games reproduced the production engine’s outcomes and economic histories. Tactical witnesses use legal transitions, exact single-unit enumeration, and the target-removal solver. Production source files were left unchanged.

[Results and full matchup breakdown](../lab/results/four-actions-2026-09-12/summary.json) · [Reproduction instructions](../lab/experiments/four-actions/README.md)
