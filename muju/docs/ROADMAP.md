# Muju roadmap

Owner-stated future work that has no other home. Items here are intentions, not
commitments; each becomes a dated `docs/changes/` record when it is executed.

- **Metal soundtrack with Tamil instruments** (added 2026-09-22). The Metal pieces are
  now Poṉ / Veḷḷi / Irumbu (Tamil). The shipped Metal track "Tanka / Weight Without Hurry"
  and its Lakota/Dakota flute accent predate the rename and were deliberately left as-is at
  the rename. Redo the Metal track with Tamil instrumentation (for example nadaswaram,
  thavil, veena, mridangam) and retitle it; the soundtrack pages and `public/music/`
  filenames follow at that time. Until then the soundtrack keeps its historical titles.
- **Pieces perfectly centered in their squares at every board size** (added 2026-10-03).
  Today a piece can sit visibly off-center in its square. A ring around it makes
  this obvious. In a Learn to Play puzzle on a 4×4 board at phone size, the enemy
  Sjór and its red capture ring sit up and to the left of the square's center.
  Fix it at the source in the board, cell and piece layout, not per screen, so
  normal play, Learn, MICRO MUJU, analysis and replays all agree. Cover:
  - every board size from 3×3 to 10×10;
  - both armies' piece shapes;
  - pieces with and without selection, rings, damage badges and the lifted
    piece cap in Learn puzzles;
  - phone and desktop layouts.

  Guard it with an e2e check that measures each piece's center against its
  cell's center.
- **Rename Cleave to "Bonus Attacks" everywhere players see it** (added 2026-10-03).
  The rule is unchanged: each kill unlocks one more attack by the same piece, up
  to the four shared actions. Remove the word "Cleave" from the rules and the
  website.
  - **Rules:** `SPEC.md` §4.2 and the rules text the MCP host serves.
  - **The site:** the How to play deck ("Combat & Cleave"), the attack status in
    the piece panel ("Cleave ready · 1 action"), MICRO MUJU's rules ("No
    Cleave") and the Learn to Play arc title.
  - **Learn ids:** the Learn arc's ids (`cleave-1`…`cleave-8`) are progress keys.
    Rename them before Learn ships; after that, keep them stable.
  - **The Academy:** R03 says "Cleave" in narration and on cards. Changing
    spoken words means new audio and video through the content DAG, so decide
    whether to re-record or leave the published lessons as dated history.
  - **History stays:** dated `docs/changes/`, `JUDGMENT_LOG.md` and lab records
    keep their wording.
  - **Code names:** internal identifiers (`cleave-status`, test names, lab
    tooling) can follow later.

## Learn to Play follow-ups (added 2026-10-03)

Left open when the 174-puzzle course shipped. See
`docs/changes/2026-10-03-learn-to-play.md`, and the playtest and review notes
behind it.

- **The board shifts when rows appear.** After Mine & prepare, the "collected"
  income row and the Instant replay row appear under the board and push it up
  about 16 px at 390×844. Now that "Show me" plays through the enemy's turn,
  this happens more often. Reserve their space, or overlay them, so the board
  never moves mid-puzzle.
- **The shop's Prepare text is wordy.** "Choose a tier-1 piece and commit its
  square. Or select a materialized piece to promote." is jargon on a screen
  that should carry almost no text. Shorten it or drop it in puzzles (the goal
  line already says what to summon), and consider the same for the normal game.
- **The keep panel is cramped on a landscape phone.** At 844×390 the piece you
  must keep and "Pay upkeep & continue" sit below the fold. The dialog scrolls,
  but nothing shows that it does. upkeep-4 reproduces it. This affects the
  normal game too.
- **Enemy moves leave no trail.** During a reply, pieces jump between squares
  with no from/to marker, so a forced move can look like a blunder (promote-4's
  Veḷḷi steps next to your Honō). Add a from/to highlight for the last enemy
  action, or point players to Instant replay after a reply.
- **Three puzzles flag a dead line late.** In safety-6, review-13 and exam-5, some
  positions after the first one or two actions exceed the live "can I still
  win?" budget (30k nodes), so a wrong line is shown at the hand-over instead of
  at once. `node --import tsx tools/learn-check.ts --live` measures this.
  Either make the positions smaller or speed up the search.

### Puzzle revisions queued for the next session

- **move-7: "Reach the flag", not "Get the Hi to the flag"** (owner, 2026-10-03).
  Today the flag (a1) is four squares from the row Muju (e1), so the goal must
  name the Hi, or the Muju would simply walk there. Move the flag so it is
  five squares from that Muju, out of its reach at Speed 1 with four actions,
  and drop `piece` from the goal. The player then discovers by themselves that
  the boxed-in Hi is the only piece that can make it, and that the Muju must
  first step out of its way. Keep the lesson (friends block too; making way
  costs one of the team's actions) and the tries (the Muju stepping along the
  row; the other Muju moving; the Muju walking toward the flag). Re-prove with
  `node --import tsx tools/learn-check.ts move --board --puzzle move-7`; the
  only winning line should still be step aside, then run.

- **move-9: make "End turn" unmissable** (owner, 2026-10-03). move-9 is the first
  puzzle where the player must press End turn. Every earlier Moving puzzle ends
  the moment the flag is reached. Once the Hi stands on the enemy home, the End
  turn button should glow strongly, unprompted: a warm pulsing halo, brighter
  than the hint pulse, perhaps with a gentle motion toward it. It should not
  wait for a hint. Generalize it as a per-puzzle `spotlight` field naming a
  control to light the first time it is needed, when the solver's next winning
  action uses it:
  - End turn in move-9;
  - Mine & prepare in the first economy puzzle that shows it;
  - the shop in summon-1;
  - the Promote button in promote-1;
  - the keep panel in the first upkeep choice.

  Keep it wordless, and respect reduced motion.

- **mine-3 and mine-6: no fail grade before End turn** (owner, 2026-10-03).
  - **mine-3.** Today, walking the Muju onto the 1 or the 2 shows the failure card
    at once, because the live "can I still win?" check flags it. Instead, let the
    player press End turn and watch the real consequence: the Muju mines 1 or 2
    (the collect effect, and the goal counter reading "1 / 3" or "2 / 3"). Only
    then show the failure card, after the collect animation finishes. That is
    the min(Mining, reserve) lesson told by the board.
  - **mine-6** (match buckets to squares). The nearest-square assignment (the Muju
    on the 2, the Sjór on the 4) is flagged the same way. After End turn it
    should visibly mine 2 + 2 = 4, with crystals flying off both squares and the
    counter stopping at "4 / 5". Then the card appears, so the player sees that
    the Muju's bigger bucket was wasted on the small square.
  - Do this for every mining goal, and consider making End turn the commit point
    for all one-turn puzzles: the early check becomes a soft cue, such as Undo
    gently pulsing, rather than a verdict, so the end-of-turn consequence is
    always what explains the failure.
  - Keep Undo available on the card after the turn's mining, as it is today.

- **Celebrate what the goal measured, not every piece** (owner, 2026-10-03).
  Today a solved puzzle sparkles every piece you own plus the flags
  (`sparkle` in `src/learn/PuzzleScreen.tsx`), so on mine-5 the Radi, which mined
  0, gets a win ring. "Only pieces that moved" is no better: the Radi moved, a
  Poṉ that captures in place never moves, and nothing moves in mine-1. Instead,
  attribute the celebration to whatever the goal measured:

  | Goal | What sparkles |
  |---|---|
  | mine | pieces whose take this turn is above 0 (the same set the collect effect uses) |
  | capture, eliminate | pieces that landed a blow |
  | reach | pieces on the flags |
  | home | the invader |
  | summon | the new commitment's square |
  | promote | the promoted piece |
  | keep, survive | the protected pieces |
  | deny | the denied landing squares |

  Pieces that only made way (a Mining-0 Radi stepping aside) do not sparkle. Use
  the same rule for "Show me".

### Also noted by the reviewers

- **exam-6 is the heaviest puzzle.** About 1.4M proof nodes, far over the live
  reply budget. White can buy on turn 1 and Black has no piece inside White's
  rectangle, so every summon square is searched. A harmless Black piece inside
  it would collapse the search, but it would change an exam position.
- **Undo after a no-enemy Mine & prepare acts like Retry.** The game is over at
  that point, so Undo rewinds to the turn start (move-2's idle try).
- **Keyboard players cannot Tab to Retry, Hint or ← Learn during their turn,**
  because the game's Tab and Enter shortcuts take over. This is existing game
  behavior.
- **Safari 15 may truncate the puzzle thumb bar's labels.** The fit relies on
  container queries, which need Safari 16 or later. The build still targets
  Safari 15.
- **The main chunk still carries the arc data** (about 108 kB of source, including
  the author-only `idea` notes, which contain full solutions), because
  ModeSelect counts puzzles from it. Generate the count at build time, or strip
  `idea` from shipped builds.
- **Curriculum coverage gaps that no puzzle forces yet:**
  - only a Karanlık one-shots an Ægirinn;
  - killing an enemy's only anchor refunds its summon;
  - a fork or double threat;
  - elimination beating an occupation race;
  - pending-summon squares are walkable;
  - an arrival can Cleave;
  - two pieces on the enemy home's neighbors shut its shop;
  - tier 1 is always kept (shown in upkeep-4's panel, never forced).
- **Variety:**
  - the six element arcs share one skeleton for 36 puzzles;
  - the harmless bottom-right Black Poṉ is the only scenery for long stretches;
  - four exam positions reuse the same two White Poṉs;
  - no puzzle plays Black.
- **Proof tooling:** multi-turn puzzles report no "wins W/T" count, so a second
  solution there (mine-8 had one through the shop, now closed) is only found
  by hand. Count winning first turns for multi-turn puzzles too.

## Learn to Play, the advanced course: about 200 more puzzles (added 2026-10-03)

The beginner course teaches every rule, mostly one turn at a time. An advanced
course would teach combinations: plans that take two or three turns, and that
win against the opponent's best reply. Arc ideas are below, with example goal
lines. Use the current vocabulary throughout: "Bonus Attacks", not "Cleave";
"start summoning" versus "successfully summon"; "occupy the enemy home until
your next turn". Counts are rough.

### Economy over several turns

- **Mining plans** (about 12). For example: "Mine 30 crystals in 3 turns".
  - Relocate miners as squares run dry.
  - Route a slow Plant through rich squares.
  - Choose between the near 4 now and the far 16 later.
  - "Mine 20 in 3 turns" with a Radi clearing the road.
  - Mine while a raider threatens your best square.
- **Invest or save** (about 12). For example: "Mine 25 crystals in 3 turns" from
  a bank of 5.
  - Buy a Muju now so it pays back by turn 3, or promote the Muju already on a 16.
  - The Plant climb 3 + 5 + 8.
  - "Keep 10 crystals in the bank in 3 turns" when rent eats into income.
  - When saving beats spending.
- **Starve and squeeze** (about 10).
  - Stand on their income squares so their tier-3 piece cannot pay its rent and
    is released (a new "release" goal: "Make them release the Kagari in 2 turns").
  - Kill the miner that funds their wall.
  - Trade one of your rents for two of theirs.
- **The crystal race** (about 10). For example: "Mine more than Black in 3 turns"
  (a new comparative goal).
  - Deny the contested 16s.
  - Block their route to the center 8s.
  - Mine and deny with the same move.

### Promotion and summon combinations

- **Promote the right piece** (about 14). The promotion pays off next turn, so the
  goal is the follow-up. For example: "Capture the Veḷḷi in 2 turns" with three
  candidates and money for one.
  - Hi → Honō to one-shot a Sjór or Veḷḷi.
  - Sjór → Straumr to survive the reply.
  - Poṉ → Veḷḷi to gain a step.
  - Muju → Mallki to gain the 1 attack that finishes a Shadow piece.
  - Radi → Umeme for the reach to invade.
  - Promote the invader in Prepare for `#`.
  - "Capture the Ægirinn in 3 turns" needs a Karanlık: summon a Loş, then promote
    it twice. Each step is visible to the enemy and must survive its replies.
- **Summon tactics** (about 12).
  - Summon and strike: an arrival acts at once, so place it where it captures next
    turn and cannot be blocked. For example: "Capture the Honō in 2 turns".
  - Summon a wall in the door.
  - Summon a second anchor for a deeper rectangle.
  - Summon so a Bonus Attacks chain becomes possible.
  - Protect your anchor so the summon is not refunded.
  - Summon where their likely reply walks into it.
- **Army building** (about 12). Choose purchases by matchup over several turns.
  - Answer a Fire rush with Water.
  - Answer a Water wall with Plant and Metal.
  - Answer a Kimbunga raid with Shadow, which takes no damage from Lightning.

### Combination tactics (the Steps Method's motifs, in Muju)

- **Setup moves** (about 12): a quiet first turn after which every reply loses
  something. For example: "Capture a piece in 2 turns" against every defense.
- **Forks and double threats** (about 12).
  - One piece threatens two captures.
  - A capture threat and a home threat at once, so they cannot answer both.
  - One summon threatens two squares.
- **Decoy, deflection and overloading** (about 12).
  - Lure the rescuer off its door with bait.
  - One defender must guard both doors and cannot.
  - Threaten their miner so the guard steps away.
- **Clearance and interference** (about 10).
  - Move your own blocker to open a lane or a door.
  - Drop a piece into their rescue path.
  - Use a Bonus Attacks chain to clear the road and arrive in the same turn.
- **Tempo** (about 8).
  - Win the action count: arrive with the hit still in hand.
  - Make them spend actions on threats so their counterattack is one short.

### Winning and defending over several turns

- **Mates in 2 and 3** (about 16). For example: "Within 2 turns, occupy the enemy
  home until your next turn", and the same within 3 turns.
  - Plug the doors over two turns.
  - Fortify the invader in time.
  - Plan the invader's rent across turns.
  - Break a high-defense guard with chip blows, then step in.
  - Invade with an ATK-0 Muju that nothing can remove.
- **Invasion races** (about 10).
  - Count who lands first.
  - The first occupation wins, and a counter-invasion does not save you.
  - Win the race by removing their runner with a tempo move.
  - Elimination beats occupation.
- **Defense over two turns** (about 14). For example: "Don't let them win in 2
  turns" (a two-turn `hold`).
  - Keep a rescuer in reach.
  - Plug the doors before the runner arrives.
  - Stop a summon-and-strike.
  - Counterattack instead of defending.
  - Give up a piece to save the home.
- **Endgames** (about 12): a few pieces each.
  - The lone invader against the lone defender.
  - Winning with only a Muju by occupation.
  - Corner geometry, like the opposition in chess.
  - Converting a material lead into a home win.

### Real positions and practice

- **The real map, 10×10** (about 10).
  - Opening plans for the first three turns.
  - Contesting the central 8s.
  - Taking an expansion of 16s.
  - Surviving an early Radi rush.
- **From real games** (about 16). Harvest positions from AI-vs-AI and online games
  where the solver proves a forced win in one or two turns, the way lichess
  builds its puzzles from games, then curate them.
- **Optimization with par** (about 10). For example: "Mine as many as you can this
  turn" or "Capture all with the fewest actions", with stars against par
  (lichess Learn's scoring), never pass or fail.
- **Black's side** (mixed in, about 8): defend and invade toward a1.
- **Optional clock and handicap arc.** It is out of the beginner course by owner
  decision, but advanced players meet the kill clock. "Win on mined totals before
  the clock" is a candidate if wanted.

### What the framework needs first

- **Three-turn search.** Today's exhaustive ∃∀∃ proof is fine for two turns on
  small boards. Three turns need iterative deepening, move-order heuristics and a
  persistent transposition table. Live hints and replies need it too, or
  precomputed reply tables per puzzle.
- **Enemy purchases in replies,** which matter from three turns on
  (`opponentBuys`), with tight banks so the search stays small.
- **New goal kinds:**
  - comparative mining ("mine more than Black");
  - enemy income caps;
  - forcing a release at upkeep;
  - "win by any means";
  - multi-turn `hold`;
  - par scoring.
- **Uniqueness checks for multi-turn puzzles:** count winning first turns, as
  one-turn puzzles already do, so cooks are found automatically.
- **A position harvester:** scan recorded games for solver-proved forced wins,
  rank them by how few winning lines there are, and tag motifs automatically
  (fork, deflection, Bonus Attacks chain, door plug).
- **Progress features at scale:**
  - puzzle ratings, like lichess's puzzle Glicko;
  - a review queue that resurfaces failed puzzles as near-variants (spaced
    repetition, not rote repeats);
  - practice by theme;
  - a daily puzzle.
