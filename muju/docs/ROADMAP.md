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
- **Say "start summoning" vs "successfully summon", and "start occupying" vs "occupy
  until your next turn", everywhere** (added 2026-10-03). Learn to Play's goal
  lines already do: "Start summoning a Hi on the flag this turn" means commit the
  summon, "Successfully summon a Hi" means it lands at your next turn start,
  and "Occupy the enemy home until your next turn" is the win, while merely
  standing on it is "start occupying". Bring the rest of the game's wording in
  line where it blurs these:
  - the shop's "Summon Hi · 3 crystals" buttons only start a summon;
  - home notices and the How to play deck should keep "arrive" separate from
    "hold until your next turn";
  - so should the MCP rules text and the Academy.

## Learn to Play follow-ups (added 2026-10-03)

Left open when the 164-puzzle course shipped. See
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
