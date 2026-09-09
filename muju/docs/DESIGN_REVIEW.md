> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> This branch has not been deployed.

# Muju Hono Tanka — A Design Review (rules v1.4)

*Written 2026-09-08 against the production checkout `deevgames-muju-cleave` (branch `codex/muju-tier-cleave`, commit 5ec6deb): SPEC.md v1.4, `src/game` and `src/ai`, and the 2026-09-07 reports on correctness, balance v1.3, the five-map study, Map D and its playtests, home occupation victory, the WASM AI, mobile UX, the visual system, empty approaches, and Cleave. The June balance lab (SPEC_AUDIT, EXPERIMENTS, STATUS-2026-06-10) is treated as history. An earlier draft of this review was written against a stale June checkout and is superseded by this one.*

---

## 1. What the game is

Muju Hono Tanka is a two-player, deterministic, turn-based war game on a 10×10 grid whose economy is the board itself. The map, called Unequal routes, is a fixed layout with 180° rotational symmetry: a deep 2×2 of five-crystal cells at each home corner, four-layer shelves along one wing, three-layer ground nearly everywhere else, and sixteen blank bedrock cells forming the approaches to the deep expansion wells on the other wing. There are 308 crystals on the board at the start, and that is all the value there will ever be. Two players begin in opposite corners with three tier-1 units apiece (a fire, a water, a plant) and no money.

There are two ways to win. Eliminate every enemy unit on the board, or have one of your units standing on the opponent's home corner at the start of your turn. Entering the corner is a threat, not a win: the defender gets one full turn to remove the invader, and while the invader stands there every one of the defender's reinforcement rectangles is blocked, since all of them contain the corner. There is no clock and no dice.

A turn has three beats. First you place whatever finished building last turn and, if you like, promote a unit in place to its next tier. Then you spend six actions, drawn from a single pool shared by your whole army, on any mix of one-square-per-speed moves, adjacent melee attacks, and mining the cell a unit stands on. Then you spend resources to queue new units, which the opponent cannot see until they land.

Combat compares integers. If the attacker's ATK, adjusted by ±1 for elemental advantage, meets or exceeds the defender's DEF, the defender is removed. Otherwise the defender is marked with that much damage, which lowers its DEF for the rest of the attacker's turn and vanishes when the defender's own turn begins. Kills must be assembled within one six-action turn; nothing carries over. Every unit gets one attack per turn by default, and only a killing blow earns another, up to a cap equal to the unit's tier: a tier-1 attacks once, a tier-4 can chain four kills. A survivor ends the chain. This is Cleave, the v1.4 rule.

The economy is a well. A unit's Mining stat is a rope length: on a fresh five-layer cell a Mining-3 unit takes layers 1–3 in one action, leaving layers 4 and 5 for a longer rope. On Unequal routes most cells have only three layers, so most of the board is fully strippable by a tier-1 plant, and the deep layers exist only in the twenty five-crystal cells at the homes and the far wells.

New units appear at no action cost anywhere inside a rectangle drawn from your home corner to any unit you own, provided no enemy unit is inside that rectangle. One forward unit opens an enormous deployment zone; one enemy infiltrator inside it closes that zone entirely. Tech is gated by presence: to queue a tier-N unit you need a same-element unit of tier N−1 or better on the board.

Six elements in three pairs form the type chart. Fire and Lightning beat Plant and Metal, which beat Water and Shadow, which beat Fire and Lightning; partners within a pair are neutral. Each pair is an RTS archetype: Fire/Lightning rush, Plant/Metal expand, Water/Shadow between. Four tiers per element make twenty-four units, named in Japanese, Swahili, Norse, Turkish, Quechua/Nahuatl, and Lakota. The title names a tier-1 plant, a tier-2 fire, and — since the September rename moved Tanka into the tier-3 Metal name Tankasila — a unit that no longer exists at the tier the title implies.

---

## 2. Lineage

The spec's own tagline, "Go, Chess, StarCraft," is about two-thirds right, and the wrong third is instructive.

**The StarCraft third is the truest, and Map D made it truer.** Everything about the macro layer is real-time-strategy theory ported to turns: a finite map economy that depletes, a build queue with build times, a tech ladder, and the rush/boom/turtle trinity made literal in the element pairs. The ruling that Rush must beat Expand elementally ("mass Fire_1 is the zerg rush") is the orthodox Age of Empires trinity with Balanced standing in for Turtle. Unequal routes is a ladder map in the StarCraft sense: a rich main at each home, a natural expansion on the shelves, contested thirds at the far wells, blank approaches acting as dead ground between them, and rotational symmetry so that both players face the same geography from opposite sides. The design vocabulary of the lab (rush band, trap lines, first-player advantage, natural wins versus caps) is RTS balance vocabulary.

**The Chess third is really Shogi and Tafl.** Pieces with distinct movement profiles capturing by adjacency are chess-like, but the two mechanics that shape play — dropping reinforcements onto the board and promoting a piece in place — are shogi's drop rule and promotion, with an economy that pays for them. The home-occupation victory is Hnefatafl inverted: in Tafl the king wins by reaching a corner; in Muju any invader wins by reaching the opponent's corner and surviving one turn there. It also carries Stratego's flag and the reach-the-far-rank victory of Breakthrough. Very little of chess's positional texture survives (no zones of control, no ranged pieces, no diagonals), but the tactical habit of counting attackers and defenders on a square is fully present.

**The Go third is nominal.** Nothing resembles capture by surrounding and territory is not scored. Where Go shows is in the spawn rectangle: a unit projected forward claims deployment space the way a stone claims influence, and an enemy stone inside your framework voids it.

Four other relatives are closer than the ones on the label.

*Magic: The Gathering* is the exact model for combat. ATK is power, DEF is toughness, damage is marked until cleanup, and a creature you failed to finish is whole next turn. Gang-blocking arithmetic and the heartbreak of one point short are Muju's daily texture.

*Dungeons & Dragons 3.5* supplies Cleave by name and by rule: a kill grants an extra attack. Muju's tier cap on the chain (one, two, three, four) is its own contribution, and it is what finally gives high-tier units a reason to exist beyond unlocking deeper mining: a Gokamoka can now clear four tier-1 attackers in four actions, which is the anti-swarm tool the June game lacked.

*Summoner Wars* is the closest board game: reinforcements paid from an economy, summoned adjacent to walls you have advanced, with summoning shut down by an opponent who gets inside your lines. Muju's corner-anchored rectangle is a more geometric version of the same idea, and its infiltration rule is absolute. *Hive* supplies the other half: placement denied by enemy proximity.

*Into the Breach* is the video-game relative on the micro side. Each turn is a small deterministic puzzle: given six actions, these pieces, these thresholds, can I kill without being killed back? Muju hides the enemy's next reinforcement where Into the Breach shows the enemy's next move, so the puzzle is less clean. Fire Emblem's weapon triangle is the model for the ±1 modifier; Advance Wars for "units are stat blocks with a cost, and the game is production."

**What is not borrowed.** The well (depth-gated layers giving the economy a vertical axis that maps onto the tech tree), the corner-anchored spawn rectangle with total denial by infiltration, the global six-action pool that does not grow with army size, and the coupling of home occupation to spawn lockout (an invader on your corner both threatens the win and freezes your reinforcements, so the climax is forced to be fought with what is already on the board). The dawn-heal rule is Magic's, but its use as a stated board-game-ability constraint — state must be trackable by piece position plus a transient marker — is a design principle in its own right, and Cleave's per-unit attack count was designed to satisfy it (it, too, resets at the owner's turn).

---

## 3. What subskills it exercises

**Threshold arithmetic.** The core repeated skill is the integer knapsack: which subset of my adjacent-or-reachable units, with per-attacker elemental modifiers, sums to at least this DEF, and can I get them all adjacent inside six actions? Damage vanishing at the defender's turn means every kill is a one-turn project. The mobile UI now previews the arithmetic on hover (modified ATK versus current DEF, and whether the target dies or what DEF remains), which moves the skill from memorization to reading.

**Cleave sequencing.** With kills unlocking attacks, ordering matters within a turn in a way it did not before. A tier-2 that can kill, step, and kill again in three actions is a different piece from one that cannot; the WASM tactical kernel searches exactly these chains, and the Cleave release's "kill → move → kill" rescue fixture is the canonical example. Players learn to line up soft targets for their high-tier pieces and to deny chains by not offering a first kill.

**Action-budget allocation.** Six actions for the whole army makes tempo the scarce resource. A ten-unit army still gets six actions; its advantage is choice, not throughput. Every action spent mining is one not spent moving, and Plant_1's three crystals per action against Hi's one is why Plant is the economy element. Players must learn to think of actions as the currency.

**Rectangle geometry and home defense.** Advancing one unit to the center opens a 36-square deployment zone; a fast enemy slipping behind the front closes every rectangle it sits inside; and an enemy on your corner closes all of them at once while threatening the win. Reading rectangles now includes reading the corner: what can reach it next turn, what I have on the board (not in the queue) to clear it, and whether to station a guard there in advance. The home-victory report's Guard policy is the first formalization of this skill.

**Route choice.** The two wings are different: shelves on one, blank approaches and deep wells on the other. Where to send the first miners, whether to cross the dead ground, and which expansion to contest are decisions the uniform June board did not offer.

**Build-order planning under hiding, and the counting that answers it.** Cost, build time, presence-gated tech, and the once-per-phase, not-on-placement-turn promotion rule make a real build-order problem. The opponent's mining yields are public and their manifested spending is public, so their stockpile plus hidden queue is a derivable range; the UI shows it.

**Counter-picking.** The double-thick triangle reads at a glance and is not decorative: the June E7 result showed that the Water→Fire back-edge is what lets a prepared defense exist at all.

**Conversion.** The last unit must actually be killed, or the corner must actually be held. Rotating attackers out and in within one turn to exceed the adjacency limit on a corner remains an advanced technique the rules permit and the tutorial does not teach; the AI's fixture set includes a three-attacker rotation, so the engine knows it even if new players do not.

---

## 4. Themes and patterns

**The uneven earth.** The board is a mine, and now a mine with geography: rich homes, a shelf, dead approaches, deep wells worth crossing for. The theme is extraction under scarcity with a built-in ending, and the empty-approaches revision (turning the sixteen two-crystal cells to bare rock) made the map legible as terrain even though nothing about movement changed. Depletion now produces two distinct dynamics: stillness when both sides wall (as in June) or a forced expansion toward the wells when the home runs dry.

**The corner as sacred site.** Home occupation gives each player a square that means something. It is where you start, where your reinforcements are anchored, and where the game ends if the enemy stands on it at dawn. A unit that never leaves the corner is no longer a stalemate engine; it is a garrison, and the attacker's puzzle is to break it. Metal IV was simultaneously the best garrison and, after Lightning I, the most-cited invader in the September trials (73 home wins), which is the sign of a rule that gave durable pieces a purpose on both ends of the board.

**Names as pedagogy.** Unit names lengthen with tier: Hi, Hono, Kagari, Gokamoka; Göl, Gölge, Karanlık, Karabasan; Inyan, Mazaska, Tankasila, Wakanwicasa. A player who cannot remember stats can hear tier in syllable count, and the new tier marks on the piece graphics (one to four base marks, a rim at tier 3, a crest at tier 4) carry the same information visually.

**Six cultures, six stat blocks.** Japanese fire, Swahili lightning, Norse water, Turkish/Slavic shadow, Quechua/Nahuatl plant, Lakota metal: a world-spanning pantheon in the manner of a civilization game. The stat table produces a reading no one chose: the two Indigenous American languages are attached to the slowest lines (Plant is Speed 1 at three tiers, Metal at all four), one of them to the only unit that starts with ATK 0 and cannot fight, while Japanese and Norse names go to the fighters. It is what a stranger sees in the table, and it is the kind of thing a publisher raises.

**Wounds close at dawn; so do sword-arms.** Full heal at the owner's turn is thematically a rule about resolve and practically a rule about tabletops. Cleave's attack count and last-kill flag are the same kind of state: transient, per-unit, wiped at the owner's turn, representable by a token. The board-game-ability ruling has now governed three separate mechanics and held.

**The game as an experimental object, doubled.** June built a lab. September ran eight lanes through it in a day — correctness, balance, mobile, map, home victory, AI, visuals, Cleave — each with its own report, hash-stamped evidence, adversarial self-critique, production receipt with byte-for-byte hash comparison, and a note of what it does not prove. The judgment log grew two entries that retire a June metric (the fixed 35–55% rush band) in favor of a better one (natural finishes versus caps, under an adaptive family of aggressive strategies). The pattern is unusual and worth naming: the project's method is now more mature than most published games' method, and the game is being rebuilt in response to what the method found, which is the thing that was missing in June.

---

## 5. What it has to teach

**To players.** Kill math before moving; focus fire when partial damage is worthless; ordering attacks so that kills unlock attacks; opportunity cost under a global action pool; reading a board for rectangles and for the corner; the RTS trinity as intuition; route choice on an asymmetric map; and inference from public income against hidden spending. The combination of deterministic combat, hidden production, a global action budget, and a reach-the-corner objective is an unusual gym.

**To designers.** The September reports extract lessons that generalize beyond this game, and several correct June's.

A fixed win-rate target for a fixed script is the wrong metric. June demanded that mass Fire_1 win 35–55% against a scripted AntiRush. September found that 71 of 80 AntiRush "wins" were 120-round caps adjudicated on material, that an adaptive attacker who promotes and adds Plant broke the same walls 38 times naturally, and retired the target. The generalization: count natural finishes and caps separately, and test families of strategies rather than one script.

A victory condition can end games without fixing passive play. Home occupation cut capped games from 45.6% to 29.2% and the median length from 52 to 27 rounds in paired trials, and produced 399 home wins where elimination-only produced none; and Balanced self-play and several passive investment pairings stayed heavily capped, one of them (Aware InvestT3 versus Aware Balanced) in all 40 runs under either rule. The rule creates an ending; it does not teach a policy to organize an invasion.

A cheap fast unit plus a reachable objective is an opening trap until the defense is taught. Twenty-six of the twenty-seven home wins before round five were by Lightning I. A policy that stations one Water at home in advance reduced that to zero in 160 games without solving the broader Lightning matchup. The lesson is about sequencing: introduce the counterplay in the same release as the threat.

Small-integer stat systems have no fine knob, but a static solver can at least find dominance. The v1.2 catalogue had Sachita strictly dominated by Mazaska; the solver found it, and v1.3's seven numeric edits (Lightning ATK 2/3/3/4, Plant mining 3/4/5/5, Plant T4 speed 2) left 24 distinct profiles with a sole-cheapest task witness each. That is a floor, not a balance proof, and the report says so.

Map economics can undo a catalogue buff in the same week. Plant's tier-3 mining was raised to 5 on Sept 7; Map D shipped the same day with twenty fifth-layer crystals instead of a hundred, and the paired playtests showed the tier-3 Plant income lead over basic miners falling from +22.1 to +2.8 crystals by round 20. The static study predicted this and it survived contact with active play. Two lanes optimizing different things need one owner.

Harness policies must spend like players. The first routing probes spent their cash in the build phase and never promoted, so their "Tech" label overstated what they tested; a follow-up that reserved the next promotion cost changed the conclusion. Bot design is part of the experiment design.

Hidden information is expensive to keep hidden, and the fix was accounting, not architecture. June's D3 leak (public `resourcesSpent` updated at queue time on the human path) was resolved by splitting committed spending from manifested spending and exposing only the latter to the opponent's observation. One rule, one transition function, one legality boundary shared by humans, AI execution, and search: that is what closed D1–D6 and D11–D14 together.

A global action pool decouples army size from tempo, and Cleave is the counterweight. Placement costs zero actions, so going wide is free to build and expensive to use; the six-action cap was the only force favoring tall play against a steep decline in stat-points-per-crystal from tier 1 to tier 4. Kill-gated, tier-capped attacks give a single strong piece throughput that a swarm cannot match per action. Whether the numbers land is uncalibrated; the shape is right.

---

## 6. Flaws and shortcomings

Ordered by how much they shape play, each anchored to something in the repository. Several June items are gone and are listed at the end so the record is clear.

**The finishing problem is reduced, not solved.** Home occupation brought the paired-suite cap rate from 45.6% to 29.2%. The Map D playtests, run under elimination-only rules before home victory shipped, capped 52.2% of 5,760 games; the balance report notes Balanced versus Expand still caps 182 of 200. The most striking single number is from the roaming-versus-home Plant matchup: the roaming policy earned 186.8 crystals by round 20 to the home policy's 73.1, and the pairing finished one natural win and 79 caps. A 2.5× income lead that cannot convert is the clearest evidence that conversion, not economy, is where the game is weakest. The shipped app still has no turn limit, draw offer, or adjudication, so a human game between two defenders can still run without end; it is simply much easier now for one of them to decide to go win.

**Two mono-line matchups remain unwinnable and one pair is still a trap partner.** Mono-Shadow versus Mono-Water is 0/200 after v1.3, and Mono-Plant versus Mono-Metal has no natural wins with caps rising from 20 to 47. Shadow's role — the report identifies a concrete fast mixed-purpose niche for Karanlık at cost 10 — exists on paper and has not been shown in play. The balance report's own ruling is not to buff Shadow to satisfy a score table, which is the right instinct and leaves the problem open.

**Lightning may be the compulsory opener under the new rules.** The ATK buff fixed June's trap line (Lightning/Metal natural wins went from 7 to 61 of 200; Balanced versus Lightning rush from 96 to 153). The same buff, combined with home occupation, made Lightning I the game's fastest win condition. The Guard policy answers it, and the balance report's adversarial section says plainly that Lightning "may still become the default pressure purchase." If every opening must station a Water at home by round three, the rule has reduced freedom rather than added it. This is the matchup most in need of human play.

**Cleave is uncalibrated.** The v1.4 release is explicit that it is "correctness/regression checks, not a new balance or difficulty calibration." Every balance number in the September reports was produced under the one-attack-per-target rule. Cleave changes the value of every tier-2+ piece against swarms, and swarms were the aggressive strategy the lab spent the most effort measuring. The catalogue that was tuned on Sept 7 was tuned for a combat rule that no longer exists.

**The high-tier miner's reason to exist shrank the day it was strengthened.** Discussed under lessons; as a flaw, Sachakuna and Cuauhtlimallki now have 20 fifth-layer crystals of unique work on the whole map. The playtest report calls deep-mining returns "the primary balance concern" and proposes moving a small amount of ore into contested fourth/fifth layers. The Plant T4 speed change and Cleave both give tier 4 non-economic reasons to exist, so the line is not dead, but its stated identity ("Expand — MINE specialist") no longer describes its best use.

**Hidden production is still a large tax for a modest return.** The queue and stockpile are hidden, units appear at zero action cost anywhere in a rectangle and act immediately. For the defender the threat surface each turn is every empty square in a large rectangle holding any unit the opponent could afford two turns ago, which is not a thing a human reasons about, so humans reason about walls and the corner instead. For the AI it meant a belief layer that September had to rebuild ("replace the historically broken indefinitely accumulating speculative queue with bounded public-conservation hypotheses"). The hiding buys surprise placement. It costs the clean deterministic puzzle the rest of the game wants to be.

**The board has economic geography and no tactical geography.** Blank approaches are walkable and spawn-eligible; nothing on the map blocks movement, grants cover, or changes combat. The five-map study says as much: "most pure combat roles are unchanged because these maps add no movement obstacles or combat modifiers." The shuffled control that preserved Map D's depth histogram and symmetry but scrambled its clusters produced no robust difference in outcomes, which means the crafted routes are not yet doing work that a random arrangement of the same crystals would not.

**The AI is stronger and still not a calibrated ladder.** September fixed rule enforcement (shared legality; zero illegal actions across 17,920 games), fixed search-logic errors (opponent nodes cooperating with the root player, root expansion of only the first choice, sides flipping mid-turn in the tactical negamax, double-counted purchase costs), and added a WASM kernel that proves or disproves home rescues exhaustively within its declared scope (Medium rescued 18 of 18 fixtures where the archived engine managed 12). The reports are equally clear that easy/medium/hard are effort presets, not a measured difficulty ladder; that dense-position search can exceed its time budget; that a fast-preset AI took 573 seconds to reach the cap in one Map A game; and that no large paired league has been run. The sparring partner is now trustworthy on rules and unknown on strength.

**Nobody has played it.** Every number in this review is a bot number. The reports say so on nearly every page ("no human playtest," "targeted human matches" as the next step). The design questions that remain — is Guard compulsory, does route choice feel like a choice, can a human find the rotation, is the Lightning race fun to lose — are the ones bots cannot answer.

**First-move fairness on Map D is unmeasured.** Rotation guarantees equal geometry. The Balanced self-play samples on D were too small and too capped to say anything about white's advantage; June's null result was on the uniform map.

**Cultural naming carries risk it did not intend.** Discussed in §4. The September rename (Tanka → Inyan at tier 1, Inyansila → Tankasila at tier 3) also left the title referring to a unit that is no longer tier 1.

*Resolved since June, for the record.* The AI no longer plays illegal moves (D1, D2, D14) or reads hidden spending (D3). The tutorial no longer names the water unit Kapp, misstates Muju's mining depth, or describes damage as "the difference"; it draws its examples from the live catalogue. The fixed-Rush 35–55% target was retired rather than met, for stated reasons. Lightning is no longer a line that loses every mono matchup. Tier-4 units have a role (Cleave, Plant T4 speed). The board is no longer uniform. Attacks preview their outcome. Games have a second way to end.

---

## 7. What holds it back from being learnable

Much of the front-loading is now mitigated by the interface rather than the rules: hover previews do the kill math, the depth gauge on every cell shows what a rope of each length can reach, the shop states a specific reason a unit is unavailable, the selected unit shows attacks used against its Cleave cap, and the corner displays "Clear home this turn or lose." Those are the right fixes and they are in production.

What remains is the catalogue and the layered rules. Twenty-four units with four stats, a cost, a build time, and now a Cleave cap; a six-element chart; presence-gated tech; a three-phase turn where promotion is legal only in the first phase and only once and never on the placement turn; a hidden stockpile shown as a range; and a victory rule with a one-turn delay that must be explained in the negative (entering does not win; surviving does). The first-turn experience is still a full catalogue and a mostly-empty board, and the names, though beautiful and tiered by syllable, are opaque to most English speakers at speed.

The largest remaining lever is a starter mode: one pair against another (Fire/Lightning versus Water/Shadow, say), eight units, one edge of the chart, every rule intact. The second is a printable rules sheet generated from the same catalogue the UI reads, so that the tutorial cannot drift again; the traceability table already exists to make that mechanical. The third is post-game feedback: the lab records first blood, material curves, promotions, and home threats per game, and none of it reaches the player who just lost.

---

## 8. What holds it back from high-end play

For a game to sustain strong players it needs an opening tree that does not collapse, a midgame with positional variety, an endgame that resolves, and a roster where most choices are live. In June Muju failed all four. In September the endgame has a second door, the roster has fewer dead lines, and the opening tree has a new branch (the Lightning race and its guard) whose shape is not yet known. The midgame is the least changed: with no movement terrain and a global action pool, most pieces still never move, and the shuffled-map control suggests the crafted geography is not yet creating positions worth studying.

The structural moves that remain are the ones the reports themselves name. Move a little ore into contested deep layers so that the tall miner has work in the middle of the board. Put something on the map that movement must respect, so that routes are routes and not just distances. Decide what the hidden queue is for: give it bluffs and feints (queue what you do not intend to place, or a visible-count-hidden-type variant) or make it public and let the game be the clean puzzle it wants to be. Calibrate Cleave, since the whole catalogue was tuned without it. And run human matches, because the questions that decide whether Muju is a good game — is Guard mandatory, is the race fun, does a strong player find the rotation — cannot be answered by anything in `lab/`.

The AI is a separate ceiling. It now follows the rules and proves its rescues; it does not yet have a measured strength, a difficulty ladder with intervals, or a search budget that holds in dense positions. The AI implementation report's own next step is a held-out paired league and a real phone.

---

## 9. Vibes

In June this was a designer's game more than a player's game, and the wind tunnel was bolted to a go-kart. In September the go-kart got rebuilt. The rules kernel that was already good — the well, the rectangle, the dawn-heal, the global pool — is intact, and three things were added that each fit it exactly: a corner that means something, a map with a main and a natural and a far well, and a chain-kill rule that gives a big piece the throughput a swarm cannot match. None of those is borrowed wholesale; each is a genre idea bent to fit Muju's constraints, and each passed the board-game-ability test on the way in. The Tafl inversion in particular is the kind of thing that makes a game feel like it has an author.

What the September work did not do is subtract. The roster is still twenty-four, the elements still six, the queue still hidden, and the reports are candid that Shadow and Plant-versus-Metal are unresolved and that two of the three headline changes are uncalibrated against each other. The project's culture is to add a mechanism and measure it, which is a much better culture than most, and it has a blind spot for the option of removing something. A version of this game with one pair fewer and a public queue would be easier to learn, easier to balance, and, I suspect, not less deep.

One line: shogi drops and Magic combat on a StarCraft ladder map, with a Tafl corner to seize and a D&D Cleave to seize it with, wearing six cultures' names, now with an ending — and with a body of evidence about itself that most published games never accumulate. The players it will delight are the Into the Breach and Summoner Wars people. The players it will lose want drama, luck, or a board that surprises them. What it needs next is not another lane through the lab. It needs a table, two people, and an afternoon.
