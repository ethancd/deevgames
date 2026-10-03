# Muju Academy and player-facing docs: teaching content extracted for the puzzle curriculum

Everything below was checked against `/Users/ashkie/src/deevgames-puzzles/muju/SPEC.md` (v3.4, `muju-phasing-4`) and spot-checked in `src/game/` (`combat.ts`, `movement.ts`, `legality.ts`, `spawning.ts`, `summoning.ts`, `turn.ts`, `homeCheckmate.ts`, `ai/simulate.ts`). No files were edited.

---

## 0. Sources and how current each one is

| Source | Status |
|---|---|
| `academy/README.md`, `academy/STATUS.md` | Current for release status. They list five pending notices (turn order, rename, kill clock, Cleave, komi), each "prepared, not deployed". The recordings are v7 or v8, made under rules v2.8/v2.9 with the old turn order and old names. |
| `academy/production/R01–R16/episode.json` | These are the current lesson sources. Each line carries speaker, text and `[board:]`/`[card:]` directions. `academy/ALL-SCRIPTS.md` is the same speech with the directions removed. |
| `academy/BIBLE.md` | The style rules still apply. Its R17–R27 plan, prices, six actions, coordinate-caption rules and "Tanka DEF 6" are historical. |
| `academy/CURRICULUM-AND-BATCHES.md` | Historical v2.2 plan for 27 lessons. Only R01–R16 are published. R17–R27 were withdrawn. Their transcripts are in `academy/archive/strategy-withdrawal/` and use six actions, v2.2 prices and the old turn order. |
| `academy/catalog.json`, `rules-verification.json` | Current stats and names. The verification file covers 324 matchups and lists R03 and R09 as stale. |
| `docs/PROMPT_new_player_onboarding.md`, `docs/changes/2026-10-02-new-player-onboarding.md`, `src/onboarding/scenarios.ts` | Current. This is the wordless three-puzzle tutorial that must not be copied (see §5). |
| `src/components/InstructionsModal.tsx` | Current rules deck, one deck since Standard was retired. It is accurate to SPEC. |
| `src/components/MicroRules.tsx` | Current, but for MICRO MUJU only: 6×6 board, Fire>Plant>Water triangle, no Cleave, no promotion, no upkeep. Useful as a precedent for teaching with a subset of the rules. |
| `src/components/VisualKey.tsx` | Current. Covers crystal lights, army styling, rank marks and the two KO badges. The header "Phasing summons" is leftover naming and harmless. |
| `docs/STRATEGY_GUIDE-2026-09-12.md` | Historical. It predates v2.9, Phasing, the rename and uncapped Cleave. Several matchup claims are now false (§3.3). |
| `docs/changes/m4-search-2026-09-19/m5-new-suite-candidates-2026-09-19.json` | Bonus find: 40 authored Phasing edge-case positions, each with a one-line intent (SUMMON-DISRUPTION and HOME-FORTIFY families). It is very good raw material for the buying and home arcs. Recorded under `muju-phasing-1` (tier-capped Cleave), but none of the intents depend on the cap. |

Coordinates used below: letter = column x (A–J), number = row y+1. White's home A1 is drawn top-left and Black's home J10 bottom-right.

---

## 1. The current Academy lesson sequence (published R01–R16)

How the course is built: R01–R06 cover the board, movement, combat, mining, buying and promotion. R07–R10 cover upkeep, safety, the clock and one integrated turn. R11–R16 revisit the rules through the six elements. Each lesson follows Invitation → Recall → Show → Try (one question, a thinking hold with no timer) → Explain → Transfer ("change one thing") → Exit. Upkeep is deliberately kept out of R01–R02.

**R01 The Board Has Two Front Doors** (v7)
- **Teaches:** the 10×10 board, the starting teams, and both ways to win. Elimination ("Last piece gone? The game is done.") and occupying the enemy home until your next turn starts. Your own home threatens nobody. Arriving is not winning.
- **Example:** the start position is White Hi B1, Sjór B2, Muju A2 against Black Hi I10, Sjór I9, Muju J9. Practice: a White Hi walks I10→J10. On Black's turn, the Black Sjór on J9 attacks J10 and removes it (2+1=3 ≥ DEF 1). The attacker never steps onto the home square. Transfer: a Black Hi stands on A1.
- **Pattern / cue:** the Two Front Doors. "Arrive. Survive. Next turn: high five."
- **Status:** valid. Home checkmate (`#`) is never taught anywhere in the Academy.

**R02 Four Actions, Zero Octopus Exceptions** (v7)
- **Teaches:** four actions shared by the team ("Four a turn, for the team. Not four each."). Orthogonal movement. Speed means squares per action. Each declared trip rounds up on its own ("One ticket. No change."). Pieces block, friends included. Walking is not attacking.
- **Example:** a Hi (Speed 2) on C3. C3→C6 is 3 squares, costing 2 of the 4 actions. A later C6→C7 is a third action. Transfer: a Black Sjór on C4 forces the detour B3-B4-B5-B6-C6, which is 5 squares and 3 actions. The Hi walks past the Sjór and nothing happens.
- **Status:** valid.

**R03 The Bonk Lab** (v7)
- **Teaches:** attacks are adjacent and cost 1 action. Elements are ±1 to attack, never to defense, with a floor of 0. Damage from several attackers adds up. A survivor closes that attacker's chain ("the Closed Chain"). Damage heals at the owner's next turn. There is no retaliation. It introduces the three-pair wheel and the nicknames Sparks, Garden Wall and Deep End.
- **Example:** Hi D5 and Hi F5 against a Black Sjór on E5, with a spare Black Muju on J9. The first Hi does 2−1=1. The second does 1 more, which is 2 ≥ DEF 2, and the Sjór is removed. Dare: swap in a Straumr (DEF 3) and the two Hi are not enough. An extra segment has a Honō beside two Muju: 4 ≥ 3 kills one and unlocks a second attack, which kills the other.
- **Status:** **stale.** The narration and a card state the tier cap ("T1 at most 1 / T2 2 / T3 3"; "cannot attack a third time"). Under current rules every kill unlocks another attack at any tier, up to 4 per turn.

**R04 The Crystal Payday** (v7)
- **Teaches:** mining is passive at your own turn end. The take is min(Mining, reserve). Squares never refill. Moving or attacking does not forfeit income. Mining 0 takes nothing. Bank is not the same as total income. It also covers the map facts (8/16/4/8 values, 504 total).
- **Example:** a Muju (Mining 3) on a 4-crystal square takes 3, leaving 1. Next turn it takes 1, leaving 0, so the payday after that is empty ("the Empty Payday"). Transfer: a Radi (Mining 0) on 16 takes 0. Cue: "Bucket or puddle. You carry the smaller one."
- **Status:** mostly valid. **Stale:** the extra segment and a card say pieces "bought or promoted that turn" also collect. Today a purchase is a pending summon that never mines, and a piece promoted in Prepare mined at its old rate, because mining comes before promotion.

**R05 The Shop Delivers Rectangles** (v8)
- **Teaches:** buy tier-1 pieces only. A spawn rectangle runs from your home corner to any friendly anchor, edges included. Any enemy inside blocks the whole rectangle ("the Blocked Rectangle"). Another anchor may still have a clear rectangle. Prices are 3/4/5. An enemy on your home blocks every rectangle.
- **Example:** bank 4, White Muju on D4 as anchor, so the rectangle is A1–D4. C3 is empty, and a Hi bought there costs 3. A Black Hi on H8 is outside the rectangle. In the puzzle, a Black Hi on B2 is inside, so the anchor cannot deliver to C3. G7 is outside the rectangle.
- **Status:** **stale.** It teaches buying in a Place step before movement, the piece arriving "right now" and acting immediately, and a "shutter" that means killing the blocker during actions does not reopen the shop. Under current rules all of that is inverted: Act comes first, then mining and upkeep, then Prepare. Clearing a blocker during Act does let you buy in that same turn's Prepare. The purchase arrives at your next turn start. A board direction also says "Bank ticks 4 to 2" for a 3-crystal Hi; that is v2.2 residue and should read 4→1.

**R06 The Promotion Staircase** (v8)
- **Teaches:** pay the price gap, one step up, same element, once per piece per turn, tier 3 is the top. Promotions cost 4 (tier 1→2) and 8 (tier 2→3) for every element. The names teach the ladder: small fire → flame → watch-fire; stone → wall → great.
- **Example:** a Sjór promoted to Straumr costs 8−4 = 4, taking the bank from 4 to 0. In the puzzle, a Hi on D4 tagged "here before this turn" and a Hi on C3 tagged "arrived today", with bank 4. Only the D4 Hi may climb.
- **Status:** **stale in a way that changes the answer.** A piece that arrived this turn is now eligible to promote, so both Hi qualify and the bank limits you to one. Other stale points: promotion is said to happen in the Place step and "a promoted piece can act immediately" (now it cannot act until next turn). The Fire price card says 2/6/12 (current 3/7/15).

**R07 Bigger Pieces Have Bills** (v7)
- **Teaches:** upkeep is 0, 1 or 2 by tier. Tier 1 can never be let go. There is no partial payment ("We keep less of us"). When the bank falls short you choose an affordable set of pieces to keep. Losing your last piece loses the game. A newly promoted piece starts paying next turn.
- **Example:** a Hi, a Honō and an Irumbu (shown as Tanka) with bank 2. All three would cost 3. The Hi plus the Irumbu cost 2, so the Honō is let go. Cue: "Nothing, one, two. And tier one always stays." Pattern: the Standing Bill.
- **Status:** **stale timing.** The lesson says upkeep is paid "at your own turn start, before healing and payday" and that you cannot pay this turn's bill from this turn's income (Pip's IOU joke). Under current rules upkeep is paid at Mine & prepare, after this turn's mining, so this turn's income does pay this turn's bill. The joke is now the rule.

**R08 Keep Your Pieces Safe** (v7)
- **Teaches:** a danger is the enemy's trip plus its hit, paid from the same four actions. Safety holds only against a given attacker for a given turn.
- **Example:** White Hi on D4, Black Sjór (Speed 1) on D7. The Sjór hits for 2+1 = 3 against DEF 1. If the Hi retreats to D3, the Sjór walks D7→D4 (3 actions) and hits with the 4th. If the Hi goes to D2 (one action at Speed 2), the Sjór needs D7→D3 (4 actions) and has nothing left to hit with ("the Missing Fifth"). Transfer: the same squares against a Speed-2 visitor take 2 actions plus the hit, which fits.
- **Status:** valid.

**R09 The Ten Quiet Turns** (v7)
- **Teaches:** the old inactivity draw.
- **Status:** **stale.** Twenty plies and then the kill clock replaced it. Kill clock is out of scope here. Its one cross-cutting idea: a quiet turn is one with no kill by attack, and income, chip damage, promotion, buying and releases do not count as kills.

**R10 One Turn at the Practice Table** (v7)
- **Teaches:** one integrated turn. Income versus bank. Ending early is allowed.
- **Example:** bank 5. Honō on D4 standing on 1 crystal, Muju on B2 on 3, Black Sjór on I9. Pay 1 for the Honō (bank 4). Buy a Hi on C3 for 3 (bank 1). The Hi steps to C4. Mining adds 1+3+0 = 4, so the bank ends at 5.
- **Status:** **stale.** It teaches "Pay. Place. Act. Mine.", says "the game skips straight to actions" when nothing is affordable, and describes a 1–20 starting gift. Under current rules the order is Act → Mine & prepare (mine, then upkeep) → Prepare (promote, summon) → End turn. Prepare always ends explicitly. Some board directions still say "Bank 2 to 6", which is v2.2 residue; the speech and card say 1→5.

**R11 Fire: The Toast Department** (v8)
- **Teaches:** attack thresholds, chip damage versus a finish, two units cooperating in one turn, and Fire's fragile defense.
- **Example:** a Hi against a fresh Poṉ: 2+1 = 3 ≥ 3, so the Poṉ dies. A Honō against a fresh Irumbu: 4 < 5, so it survives at 1 and the Honō is finished attacking. With a Radi hitting first (1+1 = 2) and the Honō after (4), the total 6 ≥ 5 removes it. A Honō on 1 crystal takes 1. Fire roster: 2/1/2/1, 3/1/2/1, 4/2/3/1, buy price 3. The lesson includes full one-hit matrices per tier. Cue: "Never declare breakfast early."
- **Status:** valid apart from the minor timing line "if it survives and pays its bill, it heals at its next turn start".

**R12 Lightning: Express Delivery** (v8)
- **Teaches:** Speed lowers travel cost but never adds damage. A saved action needs a job. Every Lightning tier has Mining 0.
- **Example:** a Radi (Speed 3) needs 2 actions for 4 squares and still 2 for 5 squares. A Kimbunga (Speed 5) needs 1 action for 5 squares. A Radi on 16 crystals takes 0. A Radi against a Poṉ does 1+1 = 2 < 3, so the Poṉ survives. Exit dare: 9 squares cost a Radi 3 actions and a Kimbunga 2. Cue: "Fast feet. Small hit. Empty bucket."
- **Status:** valid.

**R13 Water: Captain Bucket** (v8)
- **Teaches:** defense thresholds, the need for enough attackers, slow movement, steady income.
- **Example:** two Hi against a Sjór: 1+1 = 2 ≥ 2, removed. Two Hi against a fresh Straumr: 2 < 3, it survives (this pays off R03's dare). A Sjór on 4 crystals takes 2, leaving 2. Water roster: DEF 2/3/4, Speed 1/1/2, Mining 2/2/3. Cue: "Big shield. Slow boat."
- **Status:** valid.

**R14 Shadow: The Visible Detective** (v8)
- **Teaches:** count the rounded-up trip plus the hit. Shadow obeys ordinary movement. Friendly blockers matter. All information is public.
- **Example:** a Loş on C3 against a Black Hi on C7. The walk C3→C6 is 3 squares at Speed 2, so 2 actions, plus 1 for the hit (2+1 = 3 ≥ 1): 3 actions in all. Transfer: a friendly Muju on C5 forces a longer path. A Gölge on 3 crystals takes 1. A Loş takes 0.
- **Status:** valid. One direction has four-action residue: "Three tokens are gone. Three are still sitting there." Only one should remain.

**R15 Plant: The Payday Garden** (v8)
- **Teaches:** a large Mining stat is still capped by the reserve. Depleted squares force a move. Plant's attack of 0 becomes 1 against Water or Shadow.
- **Example:** a Muju on 8 takes 3, leaving 5. A Sach'akuna (Mining 8) on 2 takes 2, and the next payday there is 0. A Muju against a Sjór does 0+1 = 1 < 2, which is not a finish. Plant roster: DEF 3/3/4, Mining 3/5/8, Speed 1. Cue: "Pick where you end. Collect what's there."
- **Status:** valid.

**R16 Metal: The Moving Fortress** (v8)
- **Teaches:** strong defense is still finite. Poṉ cannot move until promoted. Mining is capped by the reserve.
- **Example:** a Honō against an Irumbu leaves it at 1. An Irumbu (Mining 5) on 3 crystals takes 3. Mission: a Poṉ on C3 with one action left cannot reach C4, because Speed is 0. Metal roster: 1/3/0/3, 1/4/1/4, 2/5/2/5. Cue: "Strong is useful. Invincible is a different word."
- **Status:** valid, with two errors. Click says "Mining four" for the Irumbu (it is 5; 4 is Veḷḷi), and the bill timing line is stale ("owes two crystals when its turn starts").

**Withdrawn R17–R27** (v2.2 rules: six actions and old prices; the concepts are reusable, the numbers are not)
- R17: attack order decides which piece earns the extra Cleave attack; every attack costs an action; a teammate's kill never reopens a closed chain.
- R18: "Enough damage is not enough actions." Being one square closer last turn changes this turn's count.
- R19: promote for a concrete threshold. A Hi does 3 to a Veḷḷi (DEF 4); as a Honō it does 4. **Under current rules promotion comes after Act, so a promotion is a next-turn threat the opponent can see.**
- R20: a raid that blocks rectangles. **Inverted today:** Black can remove the raider in Act and still buy in Prepare. The raid now matters by refunding Black's pending summons at Black's turn start.
- R21: budgeting across three moments. Now the order is income → rent → spend.
- R22: name the job before you pay. A Loş and a Sjór both cost 4. The Loş walks 3 squares and attacks in 3 actions; the Sjór needs 4. The Sjór mines 2; the Loş mines 0.
- R23: can expected income fund a purchase? **Inverted today: yes,** because Prepare comes after mining.
- R24: "Check your own front door first." A Black Hi sits on A1. The White Sjór on A2 hits for 3 and removes it, and a far capture still fits in the same turn.
- R25: facts versus possibilities versus guesses about the opponent; find one move useful either way.
- R26: clock endings. Out of scope.
- R27: three recap stations.

---

## 2. Inventory of teachable concepts (current rules, deduplicated, in a suggested order)

The arc order is a suggestion. Earlier arcs need no later rules. The final column says what kind of goal fits:
- **1T**: solvable within one turn.
- **Prep**: involves the Prepare phase.
- **2T**: needs an opponent reply, so it requires a scripted reply or a solver or prover.

### Arc A: Orientation (order 1)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| A1 | Board and homes | White's home A1 (top-left), Black's home J10. On an n×n sub-board the homes are (0,0) and (n−1,n−1). | 1T |
| A2 | Pieces | Six elements × three tiers. The base shows 1–3 rank marks, tier 3 has an inner rim, and damage shows as a red badge. | — |
| A3 | Public information | Every piece, bank, reserve, pending summon, promotion and upkeep is visible. | — |
| A4 | Two ways to win (outside the clock) | Eliminate every enemy piece, or occupy the enemy home (§2 Arc M). | — |
| A5 | Start position | White: Hi B1, Sjór B2, Muju A2. Black: Hi I10, Sjór I9, Muju J9. Both banks are 0 and White moves first. | — |

### Arc B: Actions and movement (order 2)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| B1 | Four shared actions | The whole team shares 4 actions per turn, not 4 each. | 1T |
| B2 | Orthogonal only | Moves go up, down, left or right; never diagonal. | 1T |
| B3 | Speed | Squares per action. One declared move costs ceil(path length / Speed). | 1T |
| B4 | Leftover is lost | Each declared move rounds up on its own, so two short hops can cost more than one long trip. In the UI, tapping a square moves immediately, so tapping intermediate squares wastes actions. | 1T |
| B5 | Blockers | Any piece, friend or foe, blocks. The path routes around blockers, so count the detour. | 1T |
| B6 | No zone of control | Walking past enemies never triggers combat. | 1T |
| B7 | Repeat moves | A piece may move several times, and may move after attacking. | 1T |
| B8 | Speed 0 | A Poṉ cannot move. It can attack adjacent enemies, mine, anchor and be promoted to a Veḷḷi, which has Speed 1. | 1T |
| B9 | Unused actions vanish | You may end Act early. Nothing carries over. | 1T |
| B10 | Reach | Pure travel covers Speed × 4 squares. Attack reach is Speed × 3 plus one adjacent square; "Show reach" draws this. | 1T |
| B11 | Pending squares are traversable | A summon marker does not block movement. | 1T |

### Arc C: Mining (order 3; can come before combat, as the onboarding did)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| C1 | Passive mining | At Mine & prepare, every one of your pieces takes from the square it **ends** on, not the square it left. | 1T |
| C2 | The take | min(Mining, reserve). | 1T |
| C3 | Finite reserves | Reserves never refill. A square's lights show its count: 4 at the edge midpoints, 8 adds the corners, 16 adds two more per edge. | 1T |
| C4 | Mining 0 | Radi, Umeme, Kimbunga and Loş take nothing, even standing on 16. | 1T |
| C5 | Moving does not cost income | A piece that moved or attacked still mines. | 1T |
| C6 | One piece per square | You cannot stack miners. Standing on a square also denies it to the enemy. | 1T |
| C7 | Mining by element | Fire 1/1/1, Lightning 0/0/0, Water 2/2/3, Shadow 0/1/2, Plant 3/5/8, Metal 3/4/5. | 1T |
| C8 | Match Mining to reserve | A Sach'akuna on 16 takes 8; on 2 it takes 2. Do not waste big buckets on small squares. | 1T |
| C9 | Map values | Home cluster of 8s at A1, B1, C1, A2, B2, A3 (mirrored for Black). Expansions of 16 at H2, I2, H3, I3 and B8, C8, B9, C9. A middle cluster of 8s at F4, D5, E5, F5, E6, F6, G6, E7. Empty roads D1–F3 and E8–G10. Everything else is 4. | — |
| C10 | Bank, income, total | Bank is spendable. Income is this turn's takes. The mined total never decreases. Use income for goals like "Mine N this turn". | 1T |
| C11 | Arrivals and promotions | Arrived pieces mine on their arrival turn. Pending summons never mine. A piece promoted this turn already mined at its old rate. | Prep |
| C12 | Plant climb | A Plant that arrives on a 16 and is promoted each turn collects 3 + 5 + 8 = 16 over three turns. | multi-turn |

### Arc D: Combat basics (order 4)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| D1 | Attack | Target an orthogonally adjacent enemy for 1 action. The attacker stays put and never moves onto the emptied square. | 1T |
| D2 | Kill threshold | Effective attack ≥ current defense eliminates the target. | 1T |
| D3 | Chip damage | Otherwise the damage stays and lowers current defense: DEF_eff = DEF − damage. | 1T |
| D4 | Combine attackers | Several pieces' hits in the same turn add up. | 1T |
| D5 | Heal | All damage clears at the start of the defender's own turn, so a kill must be finished this turn. | 1T / 2T |
| D6 | No retaliation | Attacking costs nothing except position. | 1T |
| D7 | Zero-damage hits | They are legal but pointless, and they close the attacker's chain. | 1T |
| D8 | Move then attack | The UI previews an attack together with its approach and needs Confirm. The skull badge marks an enemy your selected piece can kill with its next attack; the warning badge marks one of your pieces an inspected enemy can kill next turn. | 1T |

### Arc E: Elements (order 5)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| E1 | Three pairs | Fire & Lightning beat Plant & Metal, which beat Water & Shadow, which beat Fire & Lightning. | 1T |
| E2 | ±1 attack | +1 against the pair you beat, −1 against the pair that beats you, floor 0. | 1T |
| E3 | Neutral | Elements in the same pair, and the same element, are neutral. | 1T |
| E4 | Defense never changes | Elements only modify attack. | 1T |
| E5 | Pick the right attacker | The attacker with advantage often turns a chip into a kill. | 1T |
| E6 | Zero-damage matchups | Muju against Fire, Lightning, Plant and Metal. Radi against Water and Shadow. Mallki, Poṉ and Veḷḷi against Fire and Lightning. | 1T |
| E7 | Design intent | Rush beating Expand is intended (Ethan ruling 2026-06-09). | — |

### Arc F: Cleave (order 6)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| F1 | One attack to start | Every piece begins its turn able to attack once. | 1T |
| F2 | Kills unlock attacks | Each kill unlocks another attack by the same piece, at any tier, with no cap. A Hi with four Muju around it kills all four with 4 actions. | 1T |
| F3 | Each attack costs an action | Earned attacks are not free. | 1T |
| F4 | Closed chain | A surviving target, including after a zero-damage hit, ends that piece's attacks for the turn. A teammate's later kill does not reopen it. | 1T |
| F5 | Moving between attacks | Allowed at normal cost; it neither restores nor uses up attack eligibility. | 1T |
| F6 | Attack order | Chip with pieces that cannot continue; give the killing blow to the piece that can keep chaining. | 1T |
| F7 | Arrivals can Cleave | A piece on its arrival turn attacks and chains like any other. | 2T |
| F8 | Last kill ends the game | Killing the last enemy piece wins immediately by elimination, so Cleave puzzles need a spare enemy piece somewhere else (the Academy convention). | 1T |

### Arc G: Element identity sub-arcs (order 7; one mini-arc each, using their one-hit facts)

Stats are ATK/DEF/SPD/MINE; tier-1 prices 3/3/4/4/5/5.

| Element | Pieces | One-hit facts at full health |
|---|---|---|
| **Fire** | Hi 2/1/2/1, Honō 3/1/2/1, Kagari 4/2/3/1 | A Hi kills Muju, Mallki and Poṉ but only chips a Sjór (1). A Honō kills a Sjór (3−1 = 2) and a Veḷḷi (4). **A Kagari is the only piece that one-shots an Irumbu** (5). Fire defense is 1/1/2. |
| **Lightning** | Radi 1/1/3/0, Umeme 2/1/4/0, Kimbunga 3/1/5/0 | Defense 1 at every tier. Mining 0 at every tier. A Radi does 0 damage to Water and Shadow. A Kimbunga crosses 9 squares in 2 actions. |
| **Water** | Sjór 2/2/1/2, Straumr 2/3/1/2, Ægirinn 3/4/2/3 | Slow walls that earn steady income and kill Fire and Lightning. Two Hi kill a Sjór but not a Straumr. **Only a Karanlık one-shots an Ægirinn** (4 against 4). |
| **Shadow** | Loş 2/2/2/0, Gölge 3/2/2/1, Karanlık 4/2/3/2 | Defense 2 at every tier, so **a tier-1 Poṉ one-shots a tier-3 Karanlık** (1+1 = 2). A Karanlık kills a Muju (4−1 = 3); lower Shadow tiers cannot. |
| **Plant** | Muju 0/3/1/3, Mallki 1/3/1/5, Sach'akuna 2/4/1/8 | A Muju kills nothing at full health but can finish a damaged Sjór or Loş (it hits for 1). A Mallki one-shots any Shadow and a Sjór. Speed 1 at every tier. |
| **Metal** | Poṉ 1/3/0/3, Veḷḷi 1/4/1/4, Irumbu 2/5/2/5 | A Poṉ is immobile. Metal tiers 1–2 one-shot a Sjór and every Shadow tier but do 0 to Fire and Lightning. An Irumbu takes a Radi then a Honō (2+4) to remove. |

### Arc H: Buying, the spawn rectangle and arrival (order 8)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| H1 | Prepare phase | Buying happens after mining and upkeep. It costs crystals and no actions. | Prep |
| H2 | Tier 1 only | Fire and Lightning cost 3, Water and Shadow 4, Plant and Metal 5. Higher tiers are reached only by promotion. | Prep |
| H3 | Spawn rectangle | From your home corner to any friendly anchor, edges included. Any piece can anchor, a Poṉ included. | Prep |
| H4 | Blocked rectangle | Any enemy anywhere inside blocks that whole rectangle, not only the squares near it. | Prep |
| H5 | Other anchors | Legal squares are the union of all clear rectangles. A forward anchor makes a large rectangle. | Prep |
| H6 | Commit rules | The square must be empty and legal when you commit. One own commitment per square. Commit as many as you can afford. | Prep |
| H7 | Public pending summon | It arrives at your next turn start, never on the turn you paid ("no summon-and-strike"). | 2T |
| H8 | Arrival re-test | At arrival the square must be empty and inside **any** clear rectangle; otherwise the summon vanishes and refunds its exact price. Only the arrival-time board matters, so a temporary intrusion is harmless. | 2T |
| H9 | No bootstrapping | Summons arriving together cannot anchor each other. | 2T |
| H10 | Arrivals act at once | On its arrival turn a piece moves, attacks, Cleaves, mines, and may promote in that turn's Prepare. | 2T |
| H11 | A pending summon is not a piece | It cannot block, be attacked, mine, anchor, occupy a home or stop elimination. | 2T |
| H12 | This turn's income can buy | Prepare comes after mining. Refunds can also be re-spent in the same turn's Prepare. | Prep |
| H13 | Clear, then buy | Killing a rectangle blocker during Act opens the rectangle for this turn's Prepare. This inverts R05 and R20. | 1T+Prep |
| H14 | Disrupting enemy summons | End your turn on their landing square, stand inside the rectangle supporting it, or kill its only anchor. Wounding the anchor is not enough. | 2T |
| H15 | Home blocks everything | An enemy on your home blocks every rectangle and refunds every pending arrival. | 2T |
| H16 | Full shutdown | Two pieces on the neighbors of the enemy home (I10 and J9 against Black) block every Black rectangle. | 2T |
| H17 | Upkeep releases a blocker | A blocker released at its own upkeep is gone before arrival, so the summon survives (advanced, M5 SD-27). | 2T |

### Arc I: Promotion (order 9)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| I1 | Pay the gap | In Prepare, a piece moves up one tier of its own element in place: 4 crystals for tier 1→2, 8 for tier 2→3. | Prep |
| I2 | Limits | Once per piece per turn. No skipping tiers. Tier 3 is the top. | Prep |
| I3 | Who is eligible | A piece that arrived this turn is eligible. Pending summons are not. This inverts R06. | Prep |
| I4 | When the new stats work | The promoted piece cannot act until next turn, but its new defense already protects it during the opponent's reply. | 2T |
| I5 | Funding and rent | This turn's mining can pay for it. The new tier's rent starts next own turn. | Prep |
| I6 | Promote for a job | Hi → Honō to one-shot a Veḷḷi or Sjór. Muju → Mallki to gain attack. Poṉ → Veḷḷi to gain movement. Sjór → Straumr to survive two Hi. | Prep/2T |
| I7 | Some promotions do not add defense | Fire tier 1→2, Lightning (all tiers), Shadow (all tiers), Plant tier 1→2. These cannot fortify (M5 HF-05 to HF-07). | 2T |
| I8 | Fastest climb | Commit on turn N, arrive on N+1, tier 2 at the end of N+1, tier 3 at the end of N+2. The opponent sees every step. | multi |

### Arc J: Upkeep (order 10)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| J1 | Rent | Tier 2 pays 1 and tier 3 pays 2, after mining, at Mine & prepare. Tier 1 is free. | 1T |
| J2 | Income pays rent | Mining settles first, so this turn's income funds this turn's rent. | 1T |
| J3 | Keep set | If the bank is short, choose an affordable set of pieces to keep. Unpaid pieces are lost. Tier-1 pieces are always kept. There is no partial payment. | 1T |
| J4 | Releases are not kills | A release adds no combat history and triggers no Cleave. | — |
| J5 | Self-elimination | Releasing your last piece loses the game. | 1T |
| J6 | Invader upkeep | An invader must survive its own upkeep before home checkmate can be awarded (the onboarding banks 2 crystals for exactly this). | 1T |
| J7 | Walls cost income | Plan to position miners so they cover rent ("the Standing Bill"). | multi |

### Arc K: Home occupation, the attack side (order 11)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| K1 | Occupation win | If your piece is on the enemy home at the start of your next turn, you win. This is checked before arrivals and healing. | 2T |
| K2 | Any piece counts | Any element and tier qualifies, even an attack-0 Muju. | 2T |
| K3 | Removal by adjacency | The defender gets one full turn. A visitor can be removed by an adjacent attack without anyone stepping onto the home. | 2T |
| K4 | Home checkmate (`#`) | If the defender has no legal rescue, you win at once. This is checked when you enter Prepare and again after every Prepare action, so a promotion can deliver it. | 1T |
| K5 | What a rescue may use | Only the defender's existing army and 4 actions. No promotions first, no summons (the home blocks every rectangle) and no releases. | 1T |
| K6 | Two neighbors | A corner has only two neighbor squares, so at most two attackers can stand adjacent. Plug both and the invader cannot be reached. | 1T |
| K7 | Out-defend the rescue | Pick an invader whose defense exceeds the total damage the rescuers can actually deliver. | 1T |
| K8 | Clear the home first | If a defender stands on its own home, kill it, then step in with the actions left. | 1T |
| K9 | Fortify in Prepare | Promote the invader to raise its defense past the rescue (M5 HF-01 to HF-04, HF-08). | Prep |
| K10 | Invader income | An invader mines the enemy home square (8 crystals), which can pay its rent or its fortification (HF-09). | Prep |
| K11 | Side effects | An invader on the home also refunds the defender's pending summons and blocks its purchases. | 2T |
| K12 | Races | The earlier occupation wins and a counter-invasion cannot steal it. `#` is not awarded while your own home is occupied. | 2T |

### Arc L: Home defense (order 12)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| L1 | Front door first | Remove the invader before anything else. A far capture is fine only if it also fits. | 1T |
| L2 | Combined removal | The invader needs attack ≥ defense, possibly from two attackers using the two doors. | 1T |
| L3 | Keep a rescuer | Keep a piece within trip-plus-hit reach of your home's neighbor squares. | 2T |
| L4 | Plug the doors | Occupy your home or its neighbor squares so the enemy cannot enter or attack. | 2T |
| L5 | Make room | Clear your own blocker so a second attacker can reach a neighbor square (rotation). | 1T |

### Arc M: Elimination (order 13)

| ID | Concept | Definition | Fits |
|---|---|---|---|
| M1 | Zero pieces loses | A player with no pieces on the board loses, whatever the bank or pending summons (M5 SD-14). | 1T |
| M2 | Immediate win | Killing the last enemy piece wins at once, mid-turn. | 1T |
| M3 | Sweep | Count the enemy's pieces and use a Cleave chain to finish them. | 1T |
| M4 | Races | Elimination can beat an occupation race. | 2T |

### Arc N: Tactics, beginner to intermediate (order 14)

| ID | Concept | Definition |
|---|---|---|
| N1 | Count the enemy's trip plus hit | Classify each square: a 2-action approach lets them hit and run, a 3-action approach leaves the attacker stranded, and beyond that you are safe. |
| N2 | Retreat out of reach | Use an edge or corner to cut the number of attack squares. |
| N3 | Block the approach | Put a friendly piece in the way. A friend in the hallway is still a wall. |
| N4 | Hit and run | Attack, then retreat with the actions left. |
| N5 | Fork or double threat | One piece or move threatens two targets, such as a capture plus the home. |
| N6 | Chip, then finish | Order attacks by element and by who can chain. |
| N7 | Action economy | "Enough damage is not enough actions." A saved action needs a job. |
| N8 | Preparation tempo | Being one square closer last turn makes this turn's combination fit. |
| N9 | Punish a stranded attacker | Include a summon that arrives in time to take part. |
| N10 | Deny summons | Stand on the landing square, sit inside the rectangle, or kill the only anchor. |
| N11 | Deny crystals | Stand on the square the opponent wants. |
| N12 | Protect anchors | Losing your only anchor refunds your summons. |
| N13 | End-of-turn position decides | Where your pieces end decides your income, which enemy summons arrive, and whether a home occupation stands. |

### Arc O: Strategy seeds (order 15, light)

| ID | Concept | Definition |
|---|---|---|
| O1 | Crystals run out | Relocate miners as squares empty. |
| O2 | Name the job before you pay | A Loş and a Sjór cost the same 4 crystals but do different jobs. |
| O3 | Budget by phase | Income, then rent, then spending. |
| O4 | Tier walls need income | Big pieces depend on continuing rent. |
| O5 | Facts, possibilities, guesses | Find a move that is useful whichever option the opponent picks. |
| O6 | Three questions per square | Can it earn? Can it anchor next turn? Can the enemy hit it back? |

**Out of scope (noted only):**
- Kill clock: 10 plies without a kill, then the higher mined total wins. It can also block `#` when c ≥ 9. Puzzle states should set `inactivityRule: 'off'`, as the tutorial does.
- Komi and handicap: Black starts with 0.5–18.5 crystals.
- Online time controls and resignation.

---

## 3. Misconceptions and gotchas

### 3.1 Called out by the Academy and still true

- **Arrival is not victory.** You must still be on the home at your next turn start, and the defender gets a full turn (R01, R26). The defender removes a visitor by attacking from an adjacent square, not by stepping on the home.
- **Your own home threatens nobody** (R01).
- **Actions belong to the team**, not to each piece (R02, R27).
- **A partly used action is gone.** Leftover distance does not carry over, and a new walk counts on its own (R02, R12, R14).
- **Friends block too** (R02, R14, R18).
- **Walking past an enemy is not an attack**, and there is no zone of control (R02, R26).
- **Elements change attack, never defense.** "The spoon is not an attack bonus." "Defense: unchanged. That is the entire product." (R03, R11, R16)
- **Leaving the target standing closes that piece's attacks,** including after a zero-damage hit, and a teammate's kill does not reopen them (R03, R11, R12, R16, R17).
- **Earned attacks still cost an action** ("Free. It earned it." is Pip's wrong answer in R17).
- **Chip damage heals at the owner's turn start** (R03, R11).
- **A bigger Mining number does not mean a bigger take.** Pip answers "Three" and "Eight"; both are wrong (R04, R15, R16).
- **There is no Mining button and squares never refill** (R04, R15).
- **Income comes from the square you end on,** never the one you left (R13, R14, R15).
- **Mining 0 on a 16 is still zero** (R04, R12).
- **One enemy anywhere in the rectangle blocks all of it,** not just nearby squares. Another anchor may still be clear (R05, R20).
- **Only tier 1 is for sale.** There is no hidden queue and no direct purchase of a higher tier (R05, R25).
- **One step per promotion, same element, no tier 4** ("No secret fourth-floor elevator", R06).
- **Tier 1 is always kept and can never be released.** Releasing a Hi saves nothing (R07).
- **You cannot pay part of a bill;** you keep fewer pieces (R07).
- **Safety is per attacker and per turn.** "Safe from: this Sjór, this turn." A safe square depends on the enemy's speed, not on the square itself (R08).
- **Speed buys travel, never damage** (R12, R14).
- **A saved action is not yet useful** until it has a job (R12).
- **Shadow obeys ordinary movement;** it cannot pass through pieces (R14).
- **High defense is finite.** "Strong is useful. Invincible is a different word." (R16)
- **A Poṉ cannot move** until it is promoted (R16).
- **"Enough damage is not enough actions"** (R18).
- **"A hat with no job is just a hat":** promote for a threshold (R19).
- **Check your own front door before a juicy capture** (R24).
- **Crystals prove a possibility, not a plan** (R25).

### 3.2 Inverted or stale in the Academy (do not carry these into puzzles)

1. **Cleave tier cap** (R03, withdrawn R17). There is no cap now.
2. **Turn order** (R05, R06, R07, R10, withdrawn R20/R21/R23). The current order is Act → mine → upkeep → Prepare. This flips four Academy answers:
   - Killing a blocker during Act **does** open this turn's shop.
   - This turn's income **can** fund this turn's purchases and rent.
   - A promotion **cannot** be followed by an attack in the same turn.
   - A purchase **does not** arrive or act until your next turn.
3. **Arrival-turn promotion is now allowed** (R06 says it is not, and so does R27's station). The R06 puzzle answer changes.
4. **Upkeep timing.** R07, R10, R11 and R16 say "at turn start, before healing and payday". It is now paid after this turn's mining.
5. **Purchases mining on their purchase turn** (R04 extra segment). Pending summons never mine, and a piece promoted this turn mined at its old rate.
6. **Raid logic** (withdrawn R20). A raider now matters by being inside the rectangle at the defender's **turn start**, when it refunds arrivals. It no longer stops a same-turn purchase, because the defender can remove it in Act and then buy.
7. **Residue in board directions:**
   - R05 says "Bank 4 to 2" for a Hi costing 3.
   - R06 shows the Fire price card as 2/6/12; it is 3/7/15.
   - R10 says "Bank 2 to 6"; it is 1→5.
   - R14 says "three tokens still sitting there"; one remains.
   - R16 says "Mining four" for the Irumbu; it is 5.
8. **Old names in every recording:** Sjor, Hono, Tanka, Yan, Mazask, Göl, Sachita, Sachakuna, Aegirinn, Kimubunga. Only R04 has none.
9. **R09/R10 clock and starting-gift content.** Retired, and out of scope anyway.

### 3.3 Stale claims in `docs/STRATEGY_GUIDE-2026-09-12.md`

- "Only fire and lightning tier 2+ kill plants." False now: a Hi kills a Muju (3 vs 3), and a Karanlık kills one too.
- "Water, metal and shadow cannot scratch a Muju." False: they deal 1 to 3 damage.
- "Fire cannot kill a Sjór." True only for the Hi; a Honō kills it.
- "Fresh purchases act immediately" and "spawn-strike". False under Phasing.
- "10-stacks", "Plants and Yan move one square", "Kagari chain-kills three". All stale.

Ideas from the guide that still hold:
- Classify every approach square as a 2-action hit-and-run, a 3-action stranding, or unreachable.
- Two pieces on the enemy home's neighbor squares shut its shop.
- A defender standing on its own home is cheap insurance against invasion.
- Upkeep starves heavy armies.

### 3.4 Puzzle-design gotchas found in the code and docs

- **Killing the last enemy piece ends the game by elimination,** which cuts off Cleave and multi-step goals. Keep a spare enemy piece off to the side. The Academy does this (R03 has a spare Muju on J9; R12 has "a spare Black piece remains elsewhere").
- **A summon arrival or an occupation win can only be shown across a turn boundary.** That needs a scripted reply, an AI reply, or a prover. `analyzeHomeDefense` in `homeCheckmate.ts` already proves "no rescue".
- **`#` needs the invader to survive its own upkeep.** A tier-2 or tier-3 invader with no crystals to mine needs banked crystals.
- **`#` is evaluated when Prepare opens and after every Prepare action.** So "occupy the home this turn" can be satisfied by promoting in Prepare.
- **Rebuild positions explicitly for a new trial.** The BIBLE says never to animate a reset as if it were a free move.

---

## 4. Owner preferences on teaching style found in the docs

**From the Academy BIBLE** (owner-approved correction pass, 10 Sep):
- Show first, name second: "The board acts, then the rule is named." "Hit first, name second." "Shade the rectangle before defining it."
- One idea and one number per sentence. Every number in the question is on screen before it is asked.
- An answerable pause with no timer. "This video has no answer timer." Never praise speed. Stopping is always fine.
- Distinguish demonstrations, guided questions and independent checks. Never give the answer before the independent attempt.
- Show a wrong answer as its consequence on the board rather than a bare "No."
- A new trial resets pieces, damage, attack eligibility, actions, bank and reserves explicitly.
- Keep a spare opposing piece in combat exercises that should not end the game.
- Printed movement means squares per action. Mining is a maximum taken at your own turn end. Speak every condition that changes the answer.
- Transfer works by changing one thing.
- Name the patterns and reuse them: Two Front Doors, Closed Chain, Empty Payday, Blocked Rectangle, Standing Bill, Missing Fifth. The ChessKid lesson they cite is that a pattern with a sayable name is something a player can use at the board.
- Keep the reference chart available: "This is a lab, not a memory test."
- Pair nicknames (Sparks, Garden Wall, Deep End) are optional and always shown beside the literal element pairs.
- Correctness comes before word or line quotas.
- Upkeep stays out of the first two lessons.
- The agent persona "Sam" is not real child feedback.

**From the onboarding plan and change record:**
- Wordless. The only on-screen words are "Skip Tutorial →" and the piece names. Teach with light, motion and sound. Screen readers get the instructions in words.
- A wrong tap shakes, plays a soft sound, and restarts the hint.
- Orientation matches the real board: White's home top-left, never flipped.
- "Same world" continuity: pieces from earlier boards carry over when the view zooms out.
- Puzzle geometry is verified by unit tests computed from the live catalogue, so a stat change fails CI.
- Honor reduced motion. Phone first, with tap targets of at least 44 px.
- A puzzle is a plain data object. Never persist puzzle states, and never use `useGameState`, which autosaves.
- Play moves only through `applyAction`. Celebrate a home win only when the real prover returns `#`.
- Mining and map layouts were deliberately left for later lessons.

**Coordinates.** No doc says "no coordinates in captions." The Academy README's current convention is numeric coordinates in captions ("J10", spoken "J ten"), and kid-facing lines sometimes say "Column C, row three". The wordless onboarding shows no coordinates at all, since it shows no words.

**Design intent:** Rush beating Expand on the element chart is intended (SPEC §6).

**Your auto-memory** (not repo docs, but it applies): American spelling and plain prose; no small muted sub-labels under labels. Your request for a "N puzzles" subtitle under Learn to Play is explicit and overrides the latter there.

---

## 5. Do not copy: the existing tutorial (`src/onboarding/scenarios.ts`)

1. **3×3:** a Muju walks A1→C3 (4 actions) and mines 3 of 8.
2. **6×6, player as Black:** a Honō F6 approaches via F5, D4, C4 (3 actions) and kills the White Muju on C3 (4 ≥ 3).
3. **10×10:** an Irumbu runs J2→J10 in four 2-square hops. White starts with 2 banked crystals for upkeep. The only defender, a Honō, cannot hurt it (4 < 5), so it is `#`.

All three use gold-dot routes and a ghost-finger hint, which the new puzzles must not.

**Reusable plumbing, not content:**
- The `Scenario` format: size, pieces, reserves, goal kinds `move`, `kill` and `invade`, banks.
- `buildScenarioState` (Phasing, 4 actions, kill clock off, banks 0).
- `playScenario` and `finishScenario`. Mining goes through `endOfTurnIncome`; checkmate goes through `END_ACTION_PHASE` via `applyAction`.
- `tests/onboarding/scenarios.test.ts` as a pattern for geometry tests.
- `ModeSelect.tsx` currently shows Play vs AI, Play online, Puzzles (the third opens `PuzzleList` with the three tutorial scenarios), then "Other ways to play ⌄". The new "Learn to Play" entry would replace Puzzles and move to the top.

The 40 M5 cases in `docs/changes/m4-search-2026-09-19/m5-new-suite-candidates-2026-09-19.json` are authored Phasing positions with stated intents. They map directly onto Arcs H, I, J and K and are a ready source of puzzle positions.