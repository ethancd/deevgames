> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> Production release status is tracked by the repository’s deployment workflow.

# Game design elegance: comparison organisms for Muju Hono Tanka

Analysis date: September 9, 2026. MHT baseline: v1.9 at local commit `16ccfd7af9a850bd347d2079c78eeaab325fff12`. This is a design assessment grounded in rules and existing studies, not a new playtest, balance certification, or proposed production change.

The most useful development target is **more consequential meanings per familiar decision**. MHT's strongest candidate is its coupling of position, mining, reinforcement geometry, and home invasion. Its main uncertainty is how often the many technically available plans remain credible against competent opposition.

## Scope and interpretation

The comparison uses American/English 8×8 checkers with unrestricted openings; standard chess; 19×19 Go with AGA-style rules; standard shogi; Flash Duel second edition revised, ordinary two-player full mode; original Yomi second edition, ordinary versus mode; original North American Smash 64, one-on-one stock play with items off on a fixed stage; and StarCraft II's Legacy of the Void-style one-on-one melee structure. SC2 judgments concern stable systems, not a particular September 2026 patch's balance or map pool. Smash Remix, later Smash games, Yomi 2, campaigns, raids, and party modes are outside the primary comparison.

Flash Duel's small Simple Mode is a useful internal control. Likewise, compare one Yomi matchup to its full roster and one SC2 matchup to its full three-race ecosystem. A roster expands a game's total descriptive burden even when a particular match uses only part of it. Excluding alternative modes consistently avoids penalizing one game for the size of its entire commercial package.

I interpret shibui as restrained, coherent expression whose subtlety becomes more rewarding with familiarity. This is an operational adaptation to game design, not a claim to measure Japanese aesthetic authenticity. Paul Haimes's discussion emphasizes subdued elegance, refinement, and sensitivity that deepens with time. [Aesthetics in Japan, §6](https://www.ritsumei.ac.jp/~haimes/japanesedesign/pdfs/EJD_combined.pdf)

## A repeatable rubric

These are **analyst-assigned ordinal bands**, not established industry measurements. Ranges indicate judgment uncertainty or sensitivity to scope; they are not statistical confidence intervals. A 5 is not five times a 1. No overall score or depth-to-complexity quotient is calculated. Shibui overlaps partly with the other dimensions, so adding them would double-count some virtues.

### 1. Rule description length: L

The ideal measurement is the length of a complete, economical gameplay specification in a common language:

`L = shared rules + irreducible content data + timing/exception rules + required setup data`.

Use the same template for every game: setup and objective; information; actions and timing; resolution; resources; content; terminal conditions. Specify the underlying operations once, exploit genuine repetition in tables, and retain the values and exceptions that distinguish actual play. Exclude lore, strategy advice, redundant examples, tournament administration, graphics, and implementation boilerplate. Include relevant collision, timing, and character data for digital games; the engine enforcing something does not make that rule disappear. Required map data counts, but every interchangeable competitive map need not be bundled into one fixed-map comparison.

Count natural-language words and structured entries separately when doing a literal audit: one compact number is not automatically the same cognitive burden as one familiar word. Publish the specification and encoding convention alongside any count. Neither source-code lines nor published manual pages are equivalent to this measurement.

For this assessment I have **not written and counted nine equivalently complete specifications**. I therefore use the following structural proxy for their likely description lengths:

| L | Anchor |
|---|---|
| 1 | Tiny grammar; almost no differentiated content |
| 2 | Compact rules plus a small catalog and bounded exceptions |
| 3 | Several interacting subsystems plus a moderate table of content |
| 4 | Extensive bespoke content or detailed movement/combat timing machinery |
| 5 | Large simulation with multiple substantial systems and content families |

Report both the shared **core** and the **full selected mode with its roster**. The distinction captures why Smash can be easy to start while expensive to describe faithfully. Separately observe human learning time, rules errors, bookkeeping, and motor burden. Short rules can be hard to use; an extensive digital model can be learned through direct feedback.

### 2. Interesting optionality: O

The unit of interest is a **distinct credible plan at the player's information set**, not a legal input, permutation, or hypothetical line available to an omniscient evaluator.

Apply four questions consistently:

1. **Viability:** Do materially different plans remain credible against competent replies?
2. **Context dependence:** Do position, resources, timing, or opponent beliefs change their relative attractiveness?
3. **Coupling:** Does choosing one plan create consequences in other parts of the game?
4. **Renewal:** Do these choices support further learning and new strategic interpretations over repeated play?

Anchors: 1 means mostly equivalent or automatic choices; 2 a few narrow recurring choices; 3 several substantial context-dependent plans; 4 rich interacting choices and continued reinterpretation; 5 an exceptional, sustained range of local and longer-horizon strategic judgments. These bands describe useful human play, not game-tree size or a proof of maximum possible depth.

Forced tactics can carry the consequences of an earlier rich choice. A state with one good move is not automatically bad, nor is a state with fifty indistinguishable moves good. Measure across phases and both players' experiences. A large random tree and a large menu of losing units earn no automatic credit. This emphasis is compatible with Sirlin's distinction between available and viable options. [Viable Options](https://www.sirlin.net/articles/balancing-multiplayer-games-part-2-viable-options)

Elo-based skill depth is a useful separate concept, but this report does not compare raw rating spreads across unrelated player pools. Such comparisons require assumptions about populations, opponents, and the rating model. [Cauwet et al., Depth, balancing, and limits of the Elo model](https://arxiv.org/abs/1511.02006)

### 3. Shibui: S

Evaluate three qualities together:

- **Restraint:** How little special machinery insists on attention during play?
- **Coherence:** How consistently do representations and mechanics express the same relationships?
- **Unfolding subtlety:** Does experience reveal more in familiar elements, with understandable consequences?

Anchors: 1 foregrounds machinery or spectacle; 2 contains coherent pockets amid substantial activity; 3 has a recognizable unifying language with visible complexity; 4 has a restrained surface and recurring subtle relationships; 5 is an exceptional example of economical expression sustaining deeper appreciation.

Low S is not low quality. Spectacle, character performance, and frantic multitasking can be excellent goals. Also distinguish aesthetic opacity from strategic uncertainty: rules should become clear even when choosing well remains difficult.

## Comparison

All ratings are judgments under the rubric above. Full L includes the selected mode's roster, not just the two characters currently in a match. O and S are not inferred from the L number.

| Game | L core → full; lower is shorter | O; higher is richer | S; higher is more shibui | Quality judgment and principal use for MHT |
|---|---:|---:|---:|---|
| Checkers | 1 → 1 | 3–4 | 4 | Excellent constraint-driven tactical design; control for useful restriction |
| Chess | 2 → 2 | 5 | 4 | Exceptional tactical/positional integration; control for legible differentiated roles |
| Go | 1 → 1 | 5 | 5 | Strongest compression exemplar here; control for multiple meanings of one placement |
| Shogi | 2 → 2–3 | 5 | 4 | Exceptional regeneration of tactical threats; control for reinforcement and empty-space value |
| Flash Duel | 2 → 3 | 3 | 3–4 | Very efficient short spatial duel; control for distance-dependent valuation |
| Yomi | 3 → 4 | 4 | 3 | Strong opponent-reading and resource conversion; control for legible uncertainty |
| Smash 64 | 2 → 4 | 4–5 | 2–3 | Strong embodied expression; control for a shared action vocabulary yielding varied uses |
| StarCraft II | 3 → 5 | 5 | 2 | Exceptional economic/positional/temporal interaction; primary macro comparison |
| MHT v1.9 | 3 → 3 | 3–4, provisional | 3 | Promising integrated design; practical strategic breadth and clarity remain unestablished |

The most robust comparisons are broad: Go's small ruleset versus SC2's extensive model; MHT's bounded catalog versus Yomi's full bespoke roster; the shared high strategic richness of chess, Go, shogi, and SC2. Differences of one ordinal step should not decide an MHT feature. Mature games have much stronger evidence of sustained human practice than MHT; uncertainty about MHT is distinct from a demonstrated defect.

### Checkers: restriction can produce expression

Compulsory capture lets a player use an offered piece to constrain the opponent's next move; successive jumps make the implications propagate. The same limited movement vocabulary supports sacrifices, tempo, formations, and promotion races. Choice can reside in creating a future forced sequence. These rules are explicit in the WCDF version. [WCDF rules, especially 1.19–1.21](https://nccheckers.org/NCCA/WCDF%20Checker%20-%20Draughts%20-%20English%20Rules.htm)

Its strategic vocabulary is narrower than Go's or SC2's, which explains the lower O band; narrower does not mean trivial. Solving the initial game as a draw under perfect play does not remove the challenge for humans. [Schaeffer et al., Checkers Is Solved](https://pubmed.ncbi.nlm.nih.gov/17641166/)

**MHT lens:** Watch how committing an attacker, blocking a route, or threatening home makes the other player spend their six actions. Count the decisions that caused the constraint, not only the constrained turn. Cleave can create expressive sequencing, but more kills alone are not evidence of more interesting interaction.

### Chess: roles earn meaning through geometry

Chess pays for differentiated movement and exceptions such as castling, en passant, and promotion. The return is that role and location interact: a piece can simultaneously defend, obstruct, threaten, and support king safety. A pawn's importance can change drastically without its intrinsic movement rule changing. [FIDE Laws of Chess](https://handbook.fide.com/chapter/e012023)

Its high S is supported by persistent visible state and stable piece identities. The costs are a less uniform grammar than Go and a substantial gap between knowing legal moves and understanding a position. Familiarity can make historically unusual rules feel more natural than they are to a new learner.

**MHT lens:** Require each unit profile to have intelligible positional jobs. An 18-row catalog is worthwhile when those rows create recognizable choices. A tiny ATK or DEF change that secretly flips a kill threshold may be strategically rich, but the UI and teaching must expose the breakpoint.

### Go: the same object acquires more meanings

One stone and one placement action support connection, separation, liberties, enclosure, and capture. Local survival affects broader territorial decisions. The essentials are small, although ko, end-of-game agreement, and scoring still require explicit rules. [AGA short rules, hosted by the British Go Association](https://www.britgo.org/rules/agashort.html)

My high scores concern how much interpretation emerges from that common language: a move can pursue territory, strengthen a group, threaten a cut, and influence distant choices at once. The quality cost is that novices may see legal freedom without knowing what matters or when play is finished. Minimal rules do not guarantee immediate comprehension.

**MHT lens:** Ask whether a move to one square improves mining access, threatens a route, changes spawn geometry, and affects home defense. MHT has no Go-like territory scoring; its relationship to Go is this possible multiplicity of positional meaning. Preserve that distinction when diagnosing whether the comparison is actually useful.

### Shogi: reinforcement changes the meaning of empty space

Captured pieces can return as unpromoted drops, subject to restrictions. Promotion and differentiated movement add further rules, including specific pawn-drop restrictions. Captures therefore change future deployment possibilities as well as the current board. [Japan Shogi Association rules](https://www.shogi.or.jp/match/taikyoku_rules/)

The return on those rules is unusually high: an empty square can matter because of what might be placed there, and exchanges can renew threats rather than simply simplify the game. The cost is harder threat accounting, with material both on and off the board. These are reasons for high O and slightly less compression than chess, not a claim that shogi is universally a better game.

**MHT lens:** This is the closest reference for reinforcement geography and urgency. MHT's production is purchased and hidden, while shogi's captured reserves are visible; MHT also permits placement and several actions in a single turn. Study the resulting response windows directly. A spawn zone should feel like meaningful positional pressure, and home invasion should give a comprehensible defensive task.

### Flash Duel: positional value can replace a larger combat system

The revised game ties numerical cards to movement distance, exact attack range, matching blocks, and dashing strikes. Advancing also matters for timeout. Full mode adds three abilities per character. [Revised rules v5.7](https://www.sirlingames.com/s/flashduel_2rev_rulebook_5-7.pdf), [ability reference v5.8](https://www.sirlingames.com/s/flash_duel_quick_reference_5-8.pdf)

My central design reading is that a larger number is not simply a better card: geometry changes its use. A tiny spatial model gives the hand changing meaning. Its strategic commitments are shorter and less numerous than those of an economic war game, which is appropriate for the experience. Full-mode exceptions buy matchup personality while reducing the restraint of Simple Mode.

**MHT lens:** Give a stat value a situational job before giving units additional verbs. A speed or mining breakpoint that changes with geography is more promising than a uniform efficiency increase. Compare Simple versus Full Flash Duel to calibrate whether an additional rule creates enough new play to justify learning it.

### Yomi: observable incentives make uncertainty interesting

Yomi combines simultaneous combat selection with attack/throw/block/dodge interactions, variable speed and damage, combos, power-ups, and character abilities. A card has multiple uses in the hand economy. [Yomi second-edition rules](https://www.sirlingames.com/s/yomi_rulebook_v41-2.pdf)

The important design mechanism is the information available about incentives: a player short of cards has a reason to seek a block, but that reason can itself be exploited. Sirlin explicitly describes unequal, context-dependent payoffs as the ingredient that develops the basic counter cycle into a valuation and opponent-reading game. [Designing Yomi](https://www.sirlin.net/articles/designing-yomi)

The full roster is much longer to specify than the core counter diagram suggests. It nevertheless buys character identity and changing matchups while avoiding the dexterity requirements of its inspiration. This is strong selective abstraction.

**MHT lens:** Its elemental triangle is a combat modifier, not by itself a Yomi-like guessing game: current board units are visible. The hidden queue earns its cost when public income, tech, and deployment give opponents reasons to infer, hedge, or pressure. Test whether players change plans because of those clues. Hidden information that produces only unexplained surprises is a weaker result.

### Smash 64: a compact vocabulary can support embodied discovery

Nintendo's control grammar reuses direction and buttons for attack families; its damage meter affects how easily a fighter is knocked away. The relationship between accumulated damage, location, and leaving the stage gives attacks more than one purpose. [Original Nintendo manual transcription](https://world-of-nintendo.com/manuals/nintendo_64/super_smash_bros.shtml)

The design inference is that damage, setup, displacement, recovery, and finishing can emerge from learning the same moves in different situations. Its low teaching burden should not be confused with a short full specification: character motion, timing, and collision behavior still determine outcomes. Execution is part of its expressive space and also an accessibility cost. Spectacle and character performance explain its lower S without detracting from those goals.

**MHT lens:** Seek units whose familiar actions support several purposes and a victory condition that gives location intrinsic meaning. Home occupation already gives a low-cost unit a possible decisive role. Also examine both players' agency: a satisfying attack sequence for its owner may provide the defender little useful decision-making. Do not transfer conclusions about motor execution into MHT unchanged.

### StarCraft II: investments matter because opponents can attack the plan

Workers, mineral and gas income, production, and defense form a spatial economy. Imperfect information makes scouting and responding to possible strategies part of the problem. [Blizzard's resource guide](https://news.blizzard.com/en-us/article/4488900/game-guide-resources), [DeepMind's account of the SC2 research environment](https://deepmind.google/blog/alphastar-mastering-the-real-time-strategy-game-starcraft-ii/)

My high O rating comes from the coupling: expansion needs protection; production competes with immediate units; technology buys future power at present cost; pressure can change which investment is safe. These dependencies create timing windows. Large catalogs, asymmetric systems, and real-time demands explain high L and low S. The game remains a strong quality reference because economic planning, opponent inference, and execution can all contribute to expression.

**MHT lens:** This is the main macro organism. Test whether mining, tech, deployment, and pressure create exploitable windows. But MHT has a different economy: mines consume the same fixed six actions as combat, while SC2 workers continue working alongside military orders. An extra MHT miner increases access and flexibility without automatically increasing parallel throughput. MHT's action scarcity deserves its own analysis.

## MHT: what currently earns its complexity

The current [specification](../SPEC.md) and implementation establish six elements in three counter pairs, 18 unit profiles, the finite 308-crystal map, six shared actions, hidden queue and bank, geometric spawning, promotion, temporary damage, Cleave, upkeep, and home occupation. Production code was inspected for mining, spawn rectangles, unit stats, and the inactivity rule. No new matches or engine tests were run for this analysis.

The strongest reusable ideas are:

1. **A single action budget prices different ambitions.** Moving, mining, and attacking compete directly. A tempting profitable mine can be strategically wrong because it consumes the action that would defend home. More army does not create more actions, although passive occupancy and wider spawn coverage still matter.
2. **Mining changes geography over time.** A location can become dry for a shallow miner while retaining deeper value. Depletion produces different maps of opportunity for different units without adding a new action type.
3. **Position governs production access.** An anchor defines a corner-to-unit rectangle; an enemy anywhere in it invalidates that anchor. Infiltration can deny deployment without killing the anchor. This follows from one shared rule.
4. **Home invasion reuses reinforcement geometry.** An enemy on home lies inside every spawn rectangle. It therefore blocks reinforcement and threatens victory at the invader's next turn start. The opponent has an intervening turn to respond. This is unusually economical coupling, although the resulting denial is also very strong.
5. **The roster shares a grammar.** Eighteen units use ATK, DEF, speed, mining, cost, and build time; they do not require eighteen separate ability systems. Six element names reduce to three counter classes. Names and art can reinforce those patterns, but naming alone does not create mechanical differentiation.

These relationships support an O estimate of 3–4. A higher proven rating would require stronger human evidence that several distinct plans survive competent counterplay over repeated games. A catalog's size and a search engine's difficulty do not establish that.

### Where complexity may not yet be earning enough

**Numeric thresholds and timing can overshadow the positional language.** Temporary damage, elemental ±1, kill-dependent Cleave, tier attack caps, free placement/promotion, tech rechecks, upkeep timing, and draw precedence all affect what is possible. Much of this is coherent individually. Their combined burden is whether players can predict consequences reliably while still finding the choice difficult.

**The six-action constraint makes some roster breadth passive.** Additional units may offer new locations and anchors while most remain idle. Count credible whole-turn plans rather than multiplying move counts by unit count. Also distinguish useful sequencing from rearrangements of independent actions.

**Upkeep changes strategic identity, not just pacing.** It charges ongoing rent for advanced units while tier 1 remains free. Cleave can oppose cheap swarms, but its users may themselves incur rent. More income can be spent maintaining an army instead of advancing a plan. Neither upkeep nor Cleave should be evaluated independently of the army and action economies.

**A termination rule can protect the session while truncating a plan.** Ten consecutive quiet player turns draw immediately at turn end. Movement, production, promotion, and nonlethal attacks do not reset the clock; positive mining and enemy attack kills do. Consequently, a remaining reachable crystal has a clock-management role. A draw can occur before the next home-occupation check. That is current v1.9 behavior, not an implementation allegation. Test whether purposeful maneuver is being cut short and whether manipulating the clock is enjoyable. [Ten-turn rule and historical evidence](DRAW_TEN-2026-09-08.md)

### A concrete valuation test: Plant III

Under the current catalog, Plant II→III costs six crystals, increases upkeep from one to two per own turn, and adds access to layer five. Each fifth layer is worth one crystal. For the same mining route, its *extra mining* return is therefore:

`fifth layers harvested − 6 − additional upkeep paid`.

This is only a marginal mining ledger. It omits attack and defense improvements, Cleave capacity, timing, survival, and the army actions that an alternative plan could use. It would be wrong to credit all Plant III income to the upgrade: Plant II can already harvest layers one through four.

Metal III has the same total cost and upkeep as Plant III, the same attack, more speed and defense, and mining four instead of five. On shallow ground it has the stronger local stat profile; on deep ground Plant has exclusive access. Tech lineage, the existing unit's position, promotion cost versus new production, and timing prevent that local comparison from proving global dominance. [Canonical unit definitions](../src/game/units.ts)

This is an excellent test of optionality. The intended success is a recurring situation where promoting is attractive on a secure deep route, unattractive on depleted ground, and vulnerable to timely pressure. Making promotion universally profitable would reduce that particular choice's interest.

The existing [absolute-depth study](../lab/results/depth-economy-2026-09-09/REPORT.md) is relevant, with explicit limits. It compares A = current equal-value layers, B = 1/1/1/2/3, and C = 1/2/3/4/5 in isolated copies. Neither variant is current production.

- In the final reserve-policy screen, A records 435 natural finishes and 525 inactivity draws out of 960 games; C records 364 natural finishes and 596 draws. Mean income per player grows from 95.6 to 196.9. More spending capacity did not produce more decisive play in that screen.
- None of A's 524 observed Plant II→III promotions repays the upgrade and added rent from attributed fifth-layer income alone. This does not price tactical benefits or establish that every promotion was bad.
- The study includes a home-defense witness where the promotion's attack increase saves a game that queuing replacements cannot save in time. Economic payback is not equivalent to strategic value.
- B supplies a conditional mining investment window, but its lifetime returns and drawn matchups remain concerns. The study recommends human comparison with unchanged A, not adoption.

These are results reported by existing fixed-policy experiments, inspected here but not independently rerun. They do not establish a general MHT draw rate, optimal strategies, or expert balance. They do justify prioritizing the conversion of purchases and upgrades into playable plans over increasing the option count.

## How to use the organisms in development

Use three close organisms and several controls, each with a question:

| Organism | Development question | MHT observation |
|---|---|---|
| Go | How many important meanings can one placement carry? | Count consequences of contested-square choices |
| Shogi | How do potential reinforcements alter current threats? | Review anchors, empty squares, infiltration, and defensive response windows |
| StarCraft II | When does investment become vulnerable to pressure? | Compare mine/tech/deploy/attack windows using actual action and rent costs |
| Chess | Are roles and threats legible before calculating everything? | Ask players to identify a unit's job and a dangerous breakpoint |
| Checkers | Can restriction create expressive setup? | Trace forced defenses back to the earlier commitments that created them |
| Flash Duel | Can position reverse a simple value ranking? | Compare the same unit or upgrade across different resource geometries |
| Yomi | Does uncertainty have readable incentives? | Compare plans under different plausible queues with the same public board |
| Smash 64 | Do familiar actions gain new purposes with skill? | Record discoveries that reuse move, attack, mine, and occupy |

### A small repeatable measurement protocol

Begin with a diagnostic sample, not a claim of statistical coverage: twelve saved decision points, four each from opening, contact, and late play. Include tactical, economic, and quiet positions. Save each player's permitted information and the complete rules version. Add positions when results expose a missing class.

For each position, have players propose up to three *different plan families*, including placement, promotion, the six actions, queue commitment, and relevant next-turn upkeep. Examples are defend while mining; invade while conceding income; promote for a deep route; or preserve cash and deploy a counter. Do not force three when only one is credible.

Record:

- **Credible alternatives:** number and identity, plus why competent opposition does not immediately refute each. Label the evaluator and search budget; bot disagreement alone is not proof of viability.
- **Choice reversals:** whether a controlled change in depth, threat, available cash, or plausible hidden production changes the preferred plan for an intelligible reason. Use legal states and information-consistent alternatives.
- **Coupled consequences:** which other decisions the commitment changes. Distinguish real effects from simply naming several subsystems.
- **Agency distribution:** who made the important choice, how long its forced consequences lasted, and whether the defender had earlier prevention or meaningful counterplay.
- **Comprehension and rediscovery:** ask players to predict legal consequences, then explain what strategic relationship they noticed after reviewing the continuation. Record rules errors separately from interesting strategic uncertainty.
- **Session quality:** decision time, natural wins, draws, frustrating waiting, and whether players want another game. Outcome rate alone is insufficient.

A practical optionality statistic is the median number of credible, distinct plans per sampled information set, reported by phase and skill group. Pair it with the rate of intelligible choice reversals and descriptions of the changed plans. An entropy of move usage would mostly measure a particular player population's behavior, so it should not substitute for this audit.

### Feature review and ablation

For any proposed mechanic, record its additional rule clauses, state tracking, and distinct recurring decisions. Ask whether the same benefit can emerge through an existing rule's parameters or geography. A parameter adjustment can still have substantial comprehension and balance costs; it is not automatically free.

When comparing variants, preserve initial conditions where possible, give players time to learn each, alternate seats, and record behavior changes as well as wins. A deletion can destabilize complementary rules, so one bad ablation is not proof that the deleted mechanic is indispensable. Test closely linked systems together when needed, and keep changes separately attributable.

Three particularly useful investigations are:

1. **Visibility:** compare private versus public production in a lab version. Does hidden production add informed hedging and misdirection, and do those benefits outweigh comprehension costs?
2. **Catalog roles:** test whether paired elements create distinct recurring jobs, beyond a rare authored mission. Preserve meaningful tech paths when constructing a smaller-roster control.
3. **Conversion and pacing:** trace how upkeep, Cleave, finite mining, home occupation, and the quiet clock jointly turn advantages into endings. Separate healthy comeback opportunities from positions neither player can make progress in.

No production edits are implied by this protocol. The existing richer-depth B study is already a candidate for a controlled human test, so it should not be bundled with unrelated price, upkeep, or combat changes.

## Working design judgment

MHT presently looks like a compact economic tactics game with a strong positional identity and a still-visible layer of numeric and procedural machinery. It has a credible path toward higher elegance through better reuse and comprehension of its existing mechanisms. Its full description burden is well below SC2's, but it has not yet demonstrated comparable recurring strategic richness.

The most useful feature criterion is: **Does this make a familiar decision matter in another recurring, understandable way?** Protect the mining/position/spawning/home relationships; demand evidence that the catalog, timing rules, and hidden economy regularly contribute equally valuable decisions.
