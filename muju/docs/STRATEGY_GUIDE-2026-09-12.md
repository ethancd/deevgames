# Muju Hono Tanka — A Strategy Guide From One Hard Game

> Historical analysis: predates v2.9 (2026-09-18). Metal is now Yan/Mazask/Tanka with ATK/DEF/SPD/MINE 1/3/0/3, 1/4/1/4, 2/5/2/5. Yan cannot relocate until promoted; old Metal movement and matchup advice is not current evidence.
>
> Also predates v3.0 (2026-09-19, rules revision `muju-phasing-2`): the quiet-turn draw clock is now **twenty** plies, not ten, and the warning turns amber at 17. What resets it is unchanged. Clock-pressure advice below was written for the ten-ply clock and is recorded as it stood; it is not current advice.
>
> Also predates the 2026-09-21 retirement of Standard (`SPEC.md` v3.1). Every line
> below assumes the Standard turn — a Place phase before actions, purchases that
> appear and act the same turn, upkeep paid at turn start. Under the current rules a
> purchase is a public summon that arrives a full turn later, mining and upkeep settle
> at `END_ACTION_PHASE`, and promotions happen after that. Tempo advice in particular
> does not carry over. Recorded as it stood; it is not current advice.
>
> Also predates the 2026-09-22 rename (`JUDGMENT_LOG.md` J-023): Hono→Honō,
> Kimubunga→Kimbunga, Sjor→Sjór, Aegirinn→Ægirinn, Göl→Loş, Sachita→Mallki,
> Sachakuna→Sach'akuna, Yan→Poṉ, Mazask→Veḷḷi, Tanka→Irumbu (metal_1/2/3). Display
> names only; every stat and rule below is unaffected by this note.

*Written by Claude (White) after a 17-turn win by resignation against Codex (Black), 2026-09-12. Four shared actions per turn.*

This is not a solved-game guide. It is a set of principles that held up under pressure, plus the mistakes that nearly lost the game. Costs and stats refer to the live catalogue at the time of writing; check `muju_rules` before relying on a number.

## 1. The board is an economy that runs out

Every square holds a finite stack of crystals. Your starting corner has roughly 110 crystals within three squares of home, and there are two contested 60-crystal pockets on the far diagonals (G2–I3 and B8–D9). That is the whole economy. By turn 8 both players in this game had mined their corners flat and income fell from 15+ to single digits.

Consequences:

- **A plant on an empty stack is a 5-crystal wall, not a miner.** Do not count units as income; count stacks under them.
- **Tier 1 plants (Muju, mines 3, no upkeep) are the only efficient miner.** Promoting to Sachita adds 1 mining for 1 upkeep and 4 crystals: never worth it for income alone.
- **Bank early, spend late.** The player with the bigger bank when the stacks run out dictates the endgame. I finished with 57 crystals to 4.
- **4-stacks are worth stepping onto but never worth buying onto.** A plant costs 5 and a 4-stack yields 4. Walk existing plants there one square at a time; buy new plants only on 8s and 10s.

## 2. Actions, not crystals, are the binding constraint

Four actions per turn, shared across every unit, with attacks costing one each. This single rule shapes everything:

- **Two-unit combos need one unit already adjacent.** Move + attack + move + attack is four actions only if each unit needs a single move. If either hitter is more than one move away, the combo fails by one action. I lost count of the times a kill was "one action short."
- **Speed-1 units effectively never relocate.** Plants and Inyan move one square per action. Buy them where they will stay.
- **Fresh purchases act immediately.** There is no summoning sickness. A unit bought this turn can move and attack this turn. This is the most important tactical fact in the game (see §4).

## 3. Elements decide who can touch whom

Fire/Lightning beat Plant/Metal beat Water/Shadow beat Fire/Lightning. Advantage is +1 attack, disadvantage is −1, floor 0. Attack ≥ defense kills. Work out the immunity table before buying anything:

- **Only fire and lightning tier 2+ kill plants.** Water, metal and shadow cannot scratch a Muju. A wall of plants is immune to a water-and-metal army.
- **Water and shadow kill fire; fire cannot kill Sjor (water_1).** A Sjor next to your plants is a fire-proof sentry, but see §4 on why sentries don't stop hit-and-run.
- **Göl (shadow_1, 4 crystals, speed 2) is a superb hunter.** Immune to Hi, Radi and plants; kills Hi, Sjor and any Hono; two Göls stack 4 damage and kill a Straumr or an Aegirinn. It dies to any water or metal.
- **Tier 3 units are hard counters, not all-rounders.** An Aegirinn (water_3, defense 4) is one-shot only by a Karanlık (shadow_3, attack 4, neutral element, speed 3 so it strikes first) and cannot kill plants or metal. A Tanka (metal_3, defense 5) is immune to everything except a Kagari and two-unit combos, and also cannot kill plants. Both are 16–17 crystals plus 2 upkeep. They are walls that occasionally eat a soft unit, and they bankrupt the owner (§6).

## 4. Hit-and-run beats guards; spawn-strikes beat hit-and-run

A Hi moves 8 squares a turn. It can approach, kill a plant and retreat out of any sentry's reach in one turn. Static guards adjacent to plants do not deter this. What does:

- **Kill fires proactively.** A fire that ends its turn within reach of one of your water/shadow units is dead. Codex lost four fire units this way.
- **Spawn-strike.** Because new units act at once, any enemy that ends adjacent to a square inside your spawn rectangle can be killed by a fresh 3-crystal Hi or 4-crystal Göl. Two fresh Hi's do 6 damage against metal: enough to kill a Tanka. Keep 6–8 crystals in reserve for this at all times.
- **Read spawn rectangles as reach.** Your spawn zone is the rectangle from your home corner to any of your units, with no enemy inside. A single unit far from home is a spawn anchor for a huge area. Codex used its Tanka as an anchor to drop fires beside my pocket plants; I used a Göl at D9 to buy four plants on 10-stacks in one turn. The anchor's survival matters more than its mining.
- **An enemy inside your rectangle blocks that anchor entirely.** Conversely, one unit of yours inside all of the opponent's rectangles shuts off their purchases. Near their home, two units on J9 and I10 (mirror for White) block every anchor at once.

## 5. Model the opponent's kill rule and place accordingly

The decisive habit of this game was classifying each enemy approach square by action cost:

- **Two-action approach (≤ 4 path squares for speed 2):** they strike and retreat. Assume the kill happens. Never leave a soft unit here.
- **Three-action approach (5–6 squares):** they strike and are stranded adjacent. Codex took these kills whenever I could not punish the stranded square with ≥ its defense in damage, and declined them when I could.
- **Unreachable (≥ 7 squares, or all adjacent squares blocked):** safe.

So the rule for every Göl, Hi, Hono and Kagari: stand only where every enemy approach is either unreachable or a stranded square you can punish next turn. Punishment usually means a fresh spawn plus one unit already adjacent. When that holds, the opponent stops attacking and your fragile pieces become permanent deterrents.

A corollary: **bait works only when the punishment does not depend on a rectangle the enemy will be standing inside.** My F2 ambush failed to trigger because the metal and Göl adjacent to F2 made it obviously fatal; my E2 trap was sound because the punishing spawn came from a separate row-1 anchor.

## 6. Upkeep is a clock that kills heavy armies

Tier 2 costs 1 per turn, tier 3 costs 2. Codex ended with an Aegirinn, a Tanka, a Mazask and a Hono: 6 upkeep on 4 income, then 5 on 2, then 5 on 1. Every fire it bought to raid me shortened the life of its own heavies. Its bank went 22 → 21 → 18 → 15 → 9 → 4 and it resigned.

If the opponent over-invests in tier 3:

- Do not chase. Their heavies cannot kill plants or metal, so keep your soft units out of reach (§5) and let them wander. If you must kill an Aegirinn, build a Karanlık and strike from nine squares out; I never did, and should have.
- Plants on empty stacks cost no upkeep, so a corner full of them never dies on its own. Starving works because it stops the defender's fresh spawns, which is what kills raiders. Once they hit zero crystals a Kagari chain-kills three plants a turn from adjacent squares.
- Deny the stacks their heavies want. My Tanka sat on the I2 10-stack in the endgame, mining 4 a turn where nothing Black owned could hurt it.
- Keep your own upkeep under income. I ran 5 upkeep on 45+ banked crystals and shuffled plants onto 4-stacks each turn to stay near break-even.

## 7. The ten-turn draw clock

> Superseded 2026-09-19 (v3.0 / `muju-phasing-2`): the limit is now **twenty** plies, not ten. Only kills still reset it, so the shape of the advice holds, but every count and every urgency judgment in this section was written against the shorter clock. Left as written; see `../SPEC.md` §9.

Ten consecutive player turns without an attack kill is a draw, and only kills reset it. A pure economy race draws. Practical rules:

- Always keep a way to force a kill: a 3-crystal Hi raid on an undefended enemy plant resets the clock and usually costs the raider its life afterwards, which is fine.
- The clock is not a weapon against an opponent who has fires; they can always buy one and kill a plant.

## 8. Home occupation and home-checkmate

A unit that sits on the enemy home until your next turn wins; one that cannot be removed by any legal reply wins immediately. The corner has only two neighbours, so:

- **Plants on the home square are cheap insurance.** Codex bought one on J10 on turn 4 and it invalidated every one-turn assault I could compute.
- **The realistic assault is a Tanka on one neighbour, a Kagari on the other.** The Tanka blocks the spawn rectangles and survives any single attacker; the Kagari kills the home plant (5 vs 3) and the Tanka steps in. This needs the opponent's fresh-fire response to be impossible: either zero crystals or both neighbour squares already yours.
- Count the opponent's promotions in your proof. A Hono promoted to a Kagari in their reply does 3 to water, 5 to metal and plant. Only an Aegirinn survives that on the corner, and a Karanlık in their reply kills even that.

## 9. Mistakes I would not repeat

1. **Not promoting a plant to Sachita to kill an adjacent Sjor on turn 3** (plant beats water: 1+1 = 2 vs 2). That Sjor became the Aegirinn that dominated the middle game.
2. **Moving my only anchor plant off C7** left the entire pocket unspawnable when I needed a two-fire strike the next turn.
3. **Leaving a Göl on a two-action approach square** (J1, D9) twice. Both died for nothing.
4. **Buying plants on 4-stacks** early. Each one returned less than its price.
5. **Walking a Kagari into range of a 3-crystal fire.** Defense 2 dies to Hi. A Kagari is a home-base punisher and a late-game closer, not a roaming striker, while the opponent has crystals and anchors near your target.

## 10. Opening sketch that worked

Turn 1: run the starting Hi 8 squares toward the far pocket so it anchors purchases there next turn. Turn 2: buy a plant on the pocket 10-stack and use the Hi to kill whatever the opponent pushed forward. Turns 3–5: one plant per turn on 10-stacks, one cheap hunter (Göl or Sjor) per turn, kill every fire the opponent buys the turn it stops. Bank the rest. By turn 6 you should have 20+ crystals, 15+ income and no enemy fire on the board. From there the game is §5 and §6.
