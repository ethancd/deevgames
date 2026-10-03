# Learn to Play: the Muju puzzle curriculum

Learn to Play is a course of short puzzles that teaches every rule of Muju Hono
Irumbu except the kill clock and Black's handicap. Each puzzle is a small board
with one goal line and nothing else to read: "Mine 12 crystals this turn",
"Capture the Sjór this turn", "Occupy the enemy home in 2 turns". The player
uses the real game: tap a piece, tap a square, preview and confirm an attack,
Mine & prepare, summon, promote, End turn. The board, the attack preview, the
crystal lights, Show reach and the ☠ / ⚠ badges do the explaining.

It follows the wordless first-visit tutorial (`src/onboarding/`) but shares none
of its puzzles or its gold-dot hints.

The puzzles live in `src/learn/catalog/`, one file per arc. Every puzzle is
proved by the solver in CI (`tests/learn/catalog.test.ts`). To check one arc
while writing it, run `node --import tsx tools/learn-check.ts <arc> --board`.
The format and the authoring rules are in [AUTHORING.md](AUTHORING.md).

## What the research says, and what we took from it

The full reports are in `research/`. This section is the short version.

- **lichess Learn is the model.** It has 110 levels in 18 stages of 3–9 levels
  each, a one-line goal per level, and success judged on the board rather than
  against a move list. Its map never locks anything. We use the same scale and
  shape: about 165 puzzles in 21 arcs of 6–10 each.
- **Isolate, then mix.** The Steps Method teaches each theme on its own sheet,
  then mixes the themes with no label. The tsume books (1-move before 3-move)
  and Kano's *Graded Go Problems* (a spiral of short sections) do the same.
  Each of our arcs ends with a mixed puzzle. The six element arcs re-run
  movement, mining and combat through one element at a time, which is the
  spiral. The course ends with an unlabeled Mixed review and a Final exam.
- **Introduce, develop, twist, conclude.** This is kishōtenketsu as Nintendo
  uses it for level design. An arc's first puzzle is forced and safe, like
  World 1-1's first Goomba. Then the idea grows. The twist breaks the naive
  reading (a blocker, a Mining 0 piece, a −1 element, a chain that closes).
  The conclusion combines the arc with earlier ones.
- **One new idea per puzzle, and the old way must fail.** lichess's pawn level
  fails if the pawn stops on e3, so the one-square move cannot solve it.
  Portal's checklisting does the same job: every atomic fact of a rule gets a
  puzzle that cannot be solved without it. Every puzzle here records the
  tempting wrong line as a `try`, and CI proves that line fails.
- **Constraint is the hint.** With no arrows or dots, guidance comes from the
  position itself. Boards are small, every piece and crystal matters, and the
  bank holds exactly what the idea needs. That last one is tsume's rule that
  every piece in hand gets used. Red herrings appear only from an arc's twist
  onward, and only as tries that a rule the player already knows refutes.
- **Show the refutation instead of a red X.** IWTG, lishogi and *Minna no
  Tsume* all play the punishing reply. Muju does the same. When a puzzle has
  an enemy turn, the enemy plays the reply that refutes the player's line. A
  one-turn line that can no longer win is flagged at once, with Undo and
  Retry, rather than at the end of the turn.
- **About 75% one-turn puzzles.** One Muju turn is four actions plus
  purchases, which is already a three-move tsume. Two-turn puzzles (you, the
  reply, you) cluster in the economy and winning arcs, and every one of them
  is proved against every reply.
- **Soft gating and free hints.** Snakebird Primer, Baba and lichess let stuck
  players skip ahead. Duolingo's locked path drew a backlash. Everything is
  open, in a recommended order. A hint first pulses the piece to use, then
  offers "Show me". Using one keeps the puzzle solved but not clean.

## The course

The counts are the shipped catalog (164 puzzles); `src/learn/catalog/` is the truth.

| Part | Arc | Puzzles | What it teaches |
|---|---|---|---|
| First steps | Moving | 9 | Tap and move; Speed is squares per action; one trip rounds up once; pieces block, friends too; four actions shared by the team; Poṉ cannot move; a first look at the enemy home |
| | Mining | 9 | Mine & prepare; every piece mines the square it ends on; min(Mining, reserve); Mining 0; match buckets to squares; reserves run dry |
| Fighting | Attacking | 8 | Adjacent attack for one action; ATK ≥ DEF removes; move then attack; trip plus hit must fit; ATK 0 pieces; no zone of control |
| | Elements | 10 | Fire & Lightning beat Plant & Metal beat Water & Shadow beat Fire & Lightning; +1 / −1 attack, never defense; same pair is neutral; pick the attacker |
| | Teamwork | 7 | Damage adds up within a turn; several attackers; finishing a wounded piece; damage heals at its owner's turn start; zero-damage hits |
| | Cleave | 8 | A kill unlocks another attack by the same piece, up to the four actions; a survivor closes the chain; order the blows; move between attacks |
| | Safety | 8 | The enemy's trip plus hit; step out of reach; edges and friends block; capture the threat; hit and run |
| The six elements | Fire, Lightning, Water, Shadow, Plant, Metal | 6 each | Each element's three tiers and names, its stats and job, its matchups and one signature tactic |
| Crystals | Summoning | 10 | Prepare after Mine & prepare; tier 1 only, 3/4/5; the spawn rectangle from your home to any piece of yours; an enemy inside blocks it; this turn's income pays; arrival next turn, refund if blocked; arrivals act at once |
| | Promotion | 8 | 4 then 8 crystals, one tier, once per turn, in Prepare; income funds it; promote for a job (a threshold, a defense) |
| | Upkeep | 7 | Rent 1 / 2 for tier 2 / 3 after mining; tier 1 is free; choose what to keep when short; plan income for rent |
| Winning | Elimination | 6 | The last capture wins at once; sweep with Cleave; count the enemy |
| | Invasion | 10 | Occupy the enemy home and survive their turn; `#` when they cannot remove you; pick an invader they cannot hurt; plug the two doors; clear the home; survive your own upkeep; fortify in Prepare |
| | Defense | 8 | Front door first; remove an invader with one or two attackers; make room; stop an invasion before it lands |
| Review | Mixed review | 14 | No arc label: every rule, bigger boards |
| | Final exam | 6 | Near-game positions on the full board |

### Order and pacing

- **Movement and mining come first, as in the tutorial.** The crystals do the
  job lichess's stars do: a reason to go somewhere.
- **Combat is taught before the element chart.** The Attacking arc uses
  neutral matchups and ATK-0 pieces, so the first −1 and +1 the player sees
  are the Elements arc's twist.
- **Cleave and Safety close the Fighting part.** Safety is the "out of check"
  analog. It also teaches the enemy reply, which every later two-turn puzzle
  uses.
- **Element arcs are a spiral.** They revisit movement, mining and combat with
  each element's three tiers, so the player meets all 18 pieces by name before
  the economy arcs refer to tiers.
- **Economy is earn, then spend, then pay rent.** Summoning comes right after
  the element arcs: Mining → Summoning → Promotion → Upkeep.
- **Home checkmate is late.** The Steps Method postpones mate on purpose. The
  only early appearance is one undefended walk-in at the end of Moving, so the
  win condition is visible from the start (Doubutsu's "try"). The real `#`,
  where you survive the defender's turn, comes after Safety and Upkeep, when
  the player can count the enemy's trip plus hit and pay the invader's rent.

### Conventions the whole course shares

- **White plays, moving down from the top-left,** exactly as in the real game.
  A puzzle sets `side: 'black'` only when playing Black is the point.
- **Homes are hidden and home rules off** unless the puzzle needs them. A
  summon's rectangle starts at your home, so the economy arcs, Invasion,
  Defense and most of the review show both homes. Elimination keeps them hidden,
  so a stray walk into the enemy home cannot win by the wrong route. Without
  homes there is no shop: purchases first appear in Summoning.
- **No kill clock, no handicap,** with four actions in every turn. A puzzle may
  start with fewer actions left (mid-turn), and may start in Prepare.
- **Goal lines follow one grammar:** verb, count, object, horizon. The text
  is generated from the goal data (`goalText`), so wording stays uniform.
- **Flags** mark squares a goal names (reach, summon-on). **Rings** mark
  pieces to capture or protect. The enemy home glows for home goals. Nothing
  else on screen is puzzle-only.

## Arc briefs

These are intents, not positions. The arc authors build the positions, prove
them, and may reorder or replace an intent when the solver shows a better
puzzle. Each brief names the forced opener, the development, the twist and the
conclusion.

### Moving (`move`)

1. One step, one action: a lone Muju and a flag beside it.
2. A straight walk that uses several actions; the action pips count down.
3. Orthogonal only: a flag that looks close diagonally and needs every action.
4. Speed: a slow piece near the flag and a fast one farther away, with too few
   actions for the slow one.
5. One trip rounds up once: a Speed-2 piece whose flag is an odd distance
   away. One declared trip fits; stopping halfway wastes the half action. The
   try is the two-hop line.
6. Pieces block, friends too: a corridor with your own piece in it, and a
   detour that just fits.
7. Four actions for the team: two pieces and two flags; split the budget.
8. Speed 0: a Poṉ stands right beside the flag but cannot move; a far Radi
   must go.
9. A first look at winning: walk an Irumbu or Hi into the enemy home where no
   enemy can reach it. Goal: "Occupy the enemy home this turn". Needs
   `homes: true` and one harmless enemy piece.

### Mining (`mine`)

1. Freebie: a Muju already on crystals; just Mine & prepare.
2. Step onto crystals, then mine.
3. A smaller bucket: the near square holds too few crystals; the right one is
   farther away.
4. Everyone mines: three pieces with different Mining stats, each ending on
   crystals.
5. Mining 0: a fast Radi beside the rich square takes nothing; the slow piece
   must walk.
6. Match buckets to squares: the assignment matters (3 on the 4, 2 on the 2).
7. The big bucket: a Sach'akuna (Mining 8) belongs on the 16, not the near 4.
8. Reserves run dry, two turns: a square that empties after one payday; move on.
   This needs a harmless enemy piece so the game continues.
9. Conclusion: four pieces, blockers and a Mining 0 piece; mine a target total.

### Attacking (`attack`)

Use neutral matchups (the same pair) or ATK-0 pieces, so no ±1 appears yet.

1. An adjacent capture.
2. Move, then attack: preview and confirm.
3. The trip plus the hit must fit in four actions.
4. Not every piece can hurt: a Muju (ATK 0) stands beside the enemy; the Hi
   must come.
5. Defense matters: the closer Radi (ATK 1) cannot remove a Kagari (DEF 2);
   the Hi can.
6. Two targets, two attackers, one budget.
7. No zone of control: walk past an enemy to reach the target.
8. Conclusion: a blocker, a choice of attacker, the budget.

### Elements (`elements`)

1. Fire burns Plant: a Hi's 2 + 1 = 3 removes a Muju (the first +1 in the preview).
2. Water douses Fire: a Hi only chips a Sjór; the humble Poṉ (Metal beats
   Water: 1 + 1 = 2) removes it. The try is the Hi's attack.
3. Water beats Fire and Lightning.
4. Plant and Metal beat Water and Shadow.
5. Disadvantage: a Sjór does 2 − 1 = 1 to a Muju.
6. Same pair is neutral.
7. Defense never changes: the element is in the attack, not the shield.
8–9. Assignment: three attackers and three targets; each attacker must take the
   one it beats.
10. Conclusion: route plus element choice on a 5×5 or 6×6 board.

### Teamwork (`teamwork`)

1. Two Hi remove a Sjór together: 1 + 1 = 2.
2. Bigger walls take more hits: a Radi, then a Honō, removes an Irumbu (2 + 4).
3. A wounded piece starts the puzzle (mid-turn): even a Muju finishes a hurt
   Sjór (0 + 1 against 1).
4. Count before you swing: one attacker's damage alone is not enough.
5. Damage heals at the owner's turn start (two turns): chipping on turn 1 is a
   try that fails; gather, then strike together on turn 2.
6. A zero-damage hit is legal and useless.
7. Conclusion.

### Cleave (`cleave`)

1. A kill unlocks another attack: a Hi beside two Muju takes both.
2. Move between kills.
3. Four kills from one piece (the four actions are the only cap).
4. A survivor closes the chain: kill the weak piece first.
5. Chip with another piece first, so the chainer's blow kills and keeps going.
6. Every attack still costs an action.
7. A teammate's kill does not reopen a closed chain.
8. Conclusion.

### Safety (`safety`)

Goals here are "Keep all your pieces safe" or "Keep the X safe". The enemy
plays its best reply.

1. Step out of reach of a slow attacker.
2. Count the enemy's trip plus hit: one square too close loses (the Missing Fifth).
3. Edges and corners: fewer squares to be hit from.
4. A friend in the hallway is a wall: block the approach.
5. The best defense: capture the threat.
6. Two threats: remove one, dodge the other.
7. Hit and run: "Capture the Hi this turn and keep all your pieces safe".
8. Conclusion: save the valuable piece.

### Fire, Lightning, Water, Shadow, Plant, Metal

Six puzzles each. Every arc shows all three tiers by name, its job and its
matchups. Facts to build on (all from `units.ts`):

- **Fire** (Hi, Honō, Kagari; ATK 2/3/4, DEF 1/1/2, Speed 2/2/3, Mining 1).
  Breaks Plant and Metal. A Honō kills a Sjór (3 − 1 = 2) where a Hi cannot.
  Only a Kagari one-shots an Irumbu (4 + 1). It is fragile, so hit and run.
- **Lightning** (Radi, Umeme, Kimbunga; ATK 1/2/3, DEF 1, Speed 3/4/5,
  Mining 0). Speed buys travel, never damage. A Radi does 0 to Water and
  Shadow. A Kimbunga crosses a 10×10 in two actions. A spare action needs a job.
- **Water** (Sjór, Straumr, Ægirinn; DEF 2/3/4, Speed 1/1/2, Mining 2/2/3).
  Puts out Fire and Lightning. Two Hi remove a Sjór but not a Straumr. Only a
  Karanlık one-shots an Ægirinn. Slow and steady.
- **Shadow** (Loş, Gölge, Karanlık; ATK 2/3/4, DEF 2 at every tier, Speed
  2/2/3, Mining 0/1/2). A tier-1 Poṉ one-shots a tier-3 Karanlık (1 + 1 = 2). A
  Karanlık removes a Muju (4 − 1 = 3). Loş mines nothing.
- **Plant** (Muju, Mallki, Sach'akuna; Mining 3/5/8, Speed 1, ATK 0/1/2). The
  best miners. A Muju finishes a hurt Water or Shadow piece. A Mallki removes
  a Sjór or any Shadow (1 + 1 = 2). Big buckets want big squares.
- **Metal** (Poṉ, Veḷḷi, Irumbu; DEF 3/4/5, Speed 0/1/2, Mining 3/4/5). The
  Poṉ cannot move, but it mines, attacks beside itself and anchors. Tiers 1–2
  do 0 to Fire and Lightning. An Irumbu needs a Radi and a Honō together (2 + 4).

### Summoning (`summon`)

1. Mine & prepare, then summon a Hi beside your home.
2. The rectangle runs from your home to any piece of yours: move a piece out,
   then summon on the flag inside its new rectangle.
3. An enemy inside a rectangle blocks it; another piece's rectangle may still be clear.
4. Clear, then buy: remove the blocker in Act, then summon in Prepare.
5. This turn's income pays: bank 1, mine 3, summon a Sjór (4).
6. Prices are 3 / 4 / 5: spend the bank exactly on two pieces.
7. Arrival is next turn: "Land a new Hi" while an enemy can occupy or block
   some squares; choose one it cannot reach.
8. Arrivals act at once: summon now, capture with it next turn.
9. An enemy on your home blocks every rectangle: remove it first.
10. Conclusion.

### Promotion (`promote`)

1. Promote a Hi to Honō (bank 4).
2. Income funds it: mine, then promote.
3. Once per turn: Poṉ to Irumbu takes two turns (4, then 8).
4. Promote for a threshold: a Hi does 3 to a Veḷḷi; a Honō does 4 (two turns).
5. Promote for defense: survive the reply (Sjór to Straumr).
6. Choose which piece to promote with a bank for only one.
7. A piece that arrives this turn may promote in this turn's Prepare (two turns).
8. Conclusion.

### Upkeep (`upkeep`)

1. A Honō's rent is 1, paid after mining: move the Muju onto crystals to keep it.
2. Tier 3 rent is 2.
3. Short on crystals: choose what to keep (the keep panel).
4. Tier 1 is free and always kept: rent never takes a Hi.
5. Promotion's new rent starts next turn (two turns).
6. Keep crystals in the bank after rent.
7. Conclusion.

### Elimination (`eliminate`)

1. The last capture wins at once.
2. Two left: Cleave sweeps them.
3. Count the enemy and assign attackers.
4. Mid-turn: finish the sweep with the actions left.
5. A sweep through a blocker.
6. Conclusion.

### Invasion (`invade`)

1. Walk in where nobody can reach you: `#`.
2. Arrival is not winning: pick the invader the defenders cannot hurt.
3. A corner has two doors: plug them with friends.
4. Clear the home: capture the piece on it, then step in (Cleave helps).
5. Remove the rescuer first.
6. Survive your own upkeep: a tier-3 invader needs its rent.
7. Fortify in Prepare: promotion turns a rescue into `#`.
8. Two turns: approach without being caught, then invade.
9. The home square's crystals pay the invader's rent.
10. Conclusion.

### Defense (`defend`)

Goals are "Don't let them win" (survive their next turn without losing) or a
capture.

1. An invader sits on your home: remove it.
2. Two doors, two attackers: their hits add up.
3. Make room: your own piece blocks the door.
4. Stop the runner before it lands.
5. Front door first: ignore the juicy capture.
6. Plug the doors.
7. Out-race them: a counter-invasion does not save you; removal does.
8. Conclusion.

### Mixed review (`review`) and Final exam (`exam`)

Unlabeled mixes in the spirit of the Steps "Mix" book. A player's checklist
for every position:

1. Can I win now (home or elimination)?
2. Can I capture?
3. Am I safe?
4. Can I earn more?

The review uses 5×5 to 8×8. The exam uses the real 10×10 map's reserves around
the relevant corner.
