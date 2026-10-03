# How chess teaches beginners with puzzles: research for the Muju puzzle curriculum

## Summary

- **lichess Learn** is the closest model to what you described. It has 4 categories, 18 stages and 110 levels, with 3–9 levels per stage. Every level has one goal line. Success and failure are checked against the board state after each move, so there is no answer key of move sequences. Stars measure efficiency, not completion. The progress map never locks anything.
- **The Steps Method** has the best-tested sequencing. Each theme is taught in isolation, then mixed with no theme label. Depth is added only one ply at a time. Mate is postponed as long as possible. Its workbook pages are mostly diagrams with very little text.
- **Hints and failure, across all platforms.** A wrong move is undone right away. Hints come in stages, starting with highlighting which piece to move. A hint costs score but never blocks completion. A failure should *show* the consequence, such as the opponent's capture, rather than explain it in text.
- **Volume.** Beginner apps use about 5–8 exercises per concept. Book curricula use about 30 per concept plus hundreds of mixed problems. A 120–160 puzzle curriculum sits in the app range. Large drill volume belongs in a later library.

---

## 1. lichess Learn (lichess.org/learn)

### Structure

From the source in `ui/learn/src/stage/list.ts` and the stage files:

| Category | Stages (levels) |
|---|---|
| Chess pieces | Rook (6), Bishop (6), Queen (5), King (3), Knight (6), Pawn (8) |
| Fundamentals | Capture (5), Protection (8), Combat (5), Check in one (7), Out of check (7), Mate in one (7) |
| Intermediate | Board setup (7), Castling (9), En passant (4), Stalemate (5) |
| Advanced | Piece value (5), Check in two (7) |

That is 110 levels, about 6 per stage. Fork and Draw stages exist in the code but are commented out of the shipped list. The site appears to have trimmed rather than grown the course.

Each stage has an icon, a title, a short subtitle ("The rook — It moves in straight lines"), a one-line intro ("The rook is a powerful piece. Are you ready to command it?") and a one-line completion message.

### Level anatomy

Each level is a small data record:

- `goal`: a text line
- `fen`: the position
- `apples`: the star squares
- `nbMoves`: par, the target number of moves
- optional `success()` and `failure()` checks on the board state
- `shapes`: arrows drawn on the board
- `scenario`: scripted opponent replies
- `detectCapture`: fail if you leave a piece hanging

Success is checked after every move. The level completes the instant the check passes, then auto-advances after about 1.2 s unless the level has a Next button.

### Board reduction

lichess always uses the full 8×8 board. It shrinks the *content* instead. The piece stages contain one or two of your own pieces plus stars on an empty board. Early fundamentals levels have 2–4 enemy pieces. Only the later levels add distractors. The mate-in-one stage holds depth at one move and makes the positions busier as it goes (rook mate, smothered mate, discovered mate, then "tricky").

### How difficulty ramps inside a stage

The Rook stage shows the pattern:

1. One star, one move, with the solution arrow drawn.
2. Two stars, arrows still drawn.
3. Three stars, no arrows. The goal line changes to "The fewer moves you make, the more points you win!", which introduces optimization in the very first stage.
4. Five stars.
5. "Use two rooks to speed things up!" Par drops back to 4.
6. Two rooks, seven stars.

Par by level runs Rook 1, 2, 3, 5, 4, 7; Knight 2, 8, 5, 9, 6, 9; Pawn 4, 8, 4, 8, 8, 7, 3, 9.

The ramp is a **sawtooth**. Each new sub-idea (a second rook, promotion, capturing diagonally, the pawn's two-square first move) resets difficulty down, then it climbs again.

"Out of check" introduces each sub-rule in its own level with its own goal line:

- "Escape with the king!"
- "The king cannot escape, but you can block the attack!"
- "You can get out of check by taking the attacking piece."
- "This knight is checking through your defences!"

The final level then mixes them: "Escape with the king or block the attack!" So the course isolates and then mixes even inside a single stage.

### Failure checks that force the new idea

The pawn level that introduces the two-square first move fails if the pawn lands on e3. A one-square move cannot solve it, so the old way is ruled out. Check levels fail on any move that is not check, and mate levels fail on any move that is not mate.

On a failed mate, the opponent plays a random reply (`showFailureFollowUp`) so you *see* the king escape. Moving into check fails the level and draws red arrows from the attackers.

### The opponent stands still but punishes mistakes

In Capture, Combat and Protection, Black never moves. Levels without stars, however, default to `detectCapture: 'unprotected'`. If your move leaves a piece undefended and attacked, the level fails: a red "!" appears on the attacker, and after 600 ms the capture is played out. You get consequences without needing a full opponent AI.

The Protection stage's goal lines show the idea:

- "You're under attack! Escape the threat!"
- "There is no escape, but you can defend!"
- "Don't let them take any undefended piece!"

### Goal phrasing

Goals are imperative, often with a second line giving a constraint or reason:

- "Grab all the stars!"
- "Take the black pieces! And don't lose yours."
- "Aim at the opponent's king in one move!"
- "Attack your opponent's king in a way that cannot be defended!"
- "Capture, then promote!"
- "Take the piece with the highest value!"
- Stalemate is the only goal that gives a definition: "To stalemate black: Black cannot move anywhere; there is no check."

### Scoring (`score.ts`)

- Each star (apple) is worth 50 points. Each capture is worth 50 in capture levels; in the piece-value stage, captures score the piece's value instead.
- The level bonus depends on moves compared with par: 500 if at or under par, 300 if within par + max(1, par/8), otherwise 100.
- 3 stars means the maximum score, 2 means within 200 of it, 1 means anything else.
- The stage rank aggregates the same way. The stage-complete screen shows 1–3 stars and a score that counts up, then a button for the next stage.
- **You cannot fail for inefficiency, only earn fewer stars.**

### Progress map

- Categories are shown as rows of stage tiles.
- An unstarted tile is plain ("future"). The next tile pulses (`attention-effect`) and carries a "play!" ribbon. An in-progress tile shows "x / y". A finished tile shows its stars.
- **There are no locks.** Every tile is a link.
- The side panel shows "Progress: N%" and a "Reset my progress" button with confirmation.
- Inside a stage, a strip shows each level as its number (not yet done) or its stars (done), and each can be clicked.
- After the last stage, a "What next?" panel links to Practice, Puzzles, Videos, Play people and Play machine.

## 2. lichess Practice (lichess.org/practice)

Practice is organized as sections, then studies, then chapters:

- Checkmates: Piece Checkmates I, Checkmate Patterns I–IV, Piece Checkmates II, Knight & Bishop mate
- Fundamental Tactics: 8 studies (Pin, Skewer, Fork, Discovered Attacks, Double Check, Overloaded Pieces, Zwischenzug, X-Ray)
- Advanced Tactics: 10 studies
- Pawn Endgames
- Rook Endgames

Each study's subtitle is a joke or slogan ("Pin it to win it", "Use the fork, Luke").

**Goal types.** `PracticeGoal.scala` defines six: Mate, MateIn(n), DrawIn(n), EqualIn(n), EvalIn(cp, n) and Promotion(cp). They render as:

- "Checkmate the opponent in N moves". **N counts down live** as you play.
- "Hold the draw for N more moves"
- "Equalize in N moves"
- "Get a winning position in N moves" or "Defend for N moves"
- "Safely promote your pawn"

The engine plays the opponent's replies. This is the template for multi-move goals against a real defender.

**Feedback.** On failure, the goal text reappears with "Click to retry". On success you see "Success! Go to next exercise", with a toggle to load the next exercise immediately.

## 3. lichess Puzzles and the theme taxonomy

**The loop** (`ui/puzzle/src/ctrl.ts`, `feedback.ts`):

- The prompt is "Your turn. Find the best move for white."
- A correct move shows "Best move! Keep going…".
- A wrong move shows "That's not the move! Try something else." The move is undone after 300 ms, the result is recorded as a loss, and you can keep trying in a "try" mode.
- "Get a hint" and "View the solution" appear only after a delay: 4 s in rated mode, 2 s otherwise.
- The hint highlights the *from-square* of the next correct move. Using a hint means the attempt does not count for rating.
- **Streak mode**: puzzles get progressively harder, there is no clock, one wrong move ends the run, and you get one skip per run.
- The dashboard shows "Strengths" and "Improvement areas" by theme, and there is an easier/harder selector.

**Themes** (`PuzzleTheme.scala`). Each puzzle carries several tags along independent dimensions:

- Phases: opening, middlegame and endgame types
- Motifs: fork, pin, skewer, hanging piece, trapped piece, discovered attack and others
- Advanced motifs: attraction, clearance, deflection, interference, intermezzo, quiet move, x-ray, zugzwang
- Mates: mate in 1 to mate in 5
- About 19 named mate patterns
- Special moves: castling, en passant, promotion, underpromotion
- Goals: equality, advantage, crushing, mate
- Lengths: one move, short, long, very long
- Origin: master, master vs master, super GM

The lesson for Muju is to tag puzzles along several independent axes (concept, goal, length, phase), not just one label.

## 4. The Steps Method (Brunia and van Wijgerden)

**Scope and order.** There are six Steps, each with a trainer manual and student workbooks. Step 1 covers all the rules plus basic skills in 15 lessons:

1. The board and the pieces
2. How the pieces move
3. Attack and capture
4. The pawn
5. Defending
6. Check
7. Mate (1)
8. Mate (2)
9. Castling
10. The profitable exchange
11. The twofold attack
12. Draws
13. Mating with the queen
14. Capturing en passant
15. Notation

Two choices stand out:

- **"Learning how to mate is postponed as long as possible."** The authors say this "sounds astonishing" but works.
- The pieces are introduced "in the order of the difficulty they create," starting with the rook as the easiest.

The manual's rationale is that children treat capturing as the real aim of the game ("'You are mated' is countered by 'Yes, but I've got your queen'"). So material and safety come first, and mate, the spatially hard concept, comes later with more time spent on it.

**Workbook design.**

- The Step 1 workbook has 56 pages with about 486 positions at 12 per page, plus 13 "reminders" (one-paragraph recaps). That is roughly 30 positions per lesson theme.
- Pages are titled "Theme / Exercise type: A", then B, then C, with the difficulty stepping up across the sheets.
- The manual notes that "the first positions take a lot of effort, but after that the student solves them without problem." The first two or three items in a set do the teaching; the rest build fluency.
- Each sheet in the manual has an **Explanation / Mistake / Help** entry. The Help is usually *a simpler variant of the position*. For example: "Arrange things so that the piece which delivers mate starts from a different square," so that an indirect guard becomes a direct one. In other words, the hint is to make the problem smaller, not to give the answer.

**Exercise formats beyond "find the move":**

- Mark every square a piece can reach.
- "How many mates in one? Find as many as possible" (all solutions).
- **"Creating mate"**: a piece is drawn under the diagram and must be *placed* on the correct square.
- Castling legality: yes or no.
- "Mate, stalemate or play on?", choosing one.
- "Route planner": find a safe route to a target square.
- Stepping Stones adds "Choose the safe route."

**Isolate, then mix.**

- The base workbook is fully themed: the page title tells you the theme.
- **Extra** workbooks repeat the same themes in the first half. In the second half "there is no hint as to the theme of the exercise, with the result that they are more like a real game."
- **Plus** workbooks deepen the material and add "choose between two options" items to build board vision.
- The **Mix** workbook is 723 mixed Step 1 positions.

For mixed sets, the student runs a three-question checklist on every position:

- Can I deliver mate?
- Can I win material?
- Is one of my pieces in danger?

**Depth ladder.**

- Step 1 problems are one move (mate or win material).
- Step 2 adds a full move: "White plays, Black answers and White scores."
- Step 4 needs two and a half moves.

Depth is the main thing that separates the Steps.

**Stepping Stones (ages 6–9)** is the wordless version:

- Bigger diagrams, 6 per page instead of 12.
- "Practically no text," with no reminders at all.
- Fewer pieces per diagram.
- "Many themes have been sub-divided."
- The lesson order was retuned: castling now sits *between* the two mate lessons, and the twofold attack moved later.

**Cautions from the authors:**

- "Solving the exercises correctly is not an indication of playing strength."
- Play is indispensable: some children need 300 games, others 1,000.
- "Children who do not capture their opponents' unprotected pieces in their games are not ready for Step 2."
- On-screen solving weakens visualization, because the screen shows the position after every move and the computer's reply arrives automatically.
- Repetition: "we forget, when we do not repeat."

## 5. ChessKid, chess.com and Duolingo

**ChessKid.**

- Levels are named after pieces: Pawn (6 lessons), Knight (3), Bishop (3), Rook (5), Queen (9), King (100), SuperKing (47).
- Each level is an intro video, test questions, and stars earned from puzzles or fast chess. A certificate is awarded when you move up a level.
- Teachers see level icons next to each student.
- Its beginner articles recommend mini-games: Capture the Flag (pawns only; win by promoting, capturing every pawn, or leaving the opponent with no move) and Tom and Jerry (a queen against 8 pawns).

**chess.com Lessons.**

- A Learn path in four skill levels, each made of courses, then lessons, each with "coach" guidance plus interactive challenges.
- Tiles are **locked** (dark, with a lock icon), **available** (bright) or **completed** (tinted in the level's color).
- You can skip ahead to any unlocked lesson within a course.

**chess.com Puzzle Points.**

- 8 tiers from Wood to Legend, each with 20 levels.
- 15, 20 or 25 points per puzzle, depending on difficulty.
- **Using a hint drops the award to 1 point per correct move.**

**Duolingo Chess.**

- About 75% of the course is short puzzles. The other 25% is "mini-matches" and full games against the coach character, Oscar.
- "Lessons gradually increase in difficulty, shifting from guided 'move your bishop here' to open-ended challenges."
- Spaced repetition "revisits earlier tactics at just the right time."

**Minichess teaching** (Richard James, *Minichess Activities*) groups activities into stages:

- protochess: no pawns or kings, which trains board vision
- prechess: pawns but no kings, which trains planning
- minichess: kings, with checkmate and stalemate

It also uses 5×5 boards for the youngest learners. Shrinking the rules and the board is standard pedagogy.

## 6. László Polgár, *Chess: 5334 Problems, Combinations and Games*

The book is organized almost entirely by **solution length**, not by theme:

| Section | Problems |
|---|---|
| Mate in one | 306 |
| Mate in two | 3,412 |
| Mate in three | 744 |
| Miniature games ("find the next move" from key moments) | 600 |
| Simple endgames | 144 |
| Tournament combinations | 128 |

Per the publisher's table of contents, the combinations are grouped by target square around the king (f2/g2/h2 type). There is almost no prose. Solutions are at the back.

It is a drill book: reviewers recommend a couple of pages a day and call the mate-in-one and simple-endgame sections the beginner entry point. The design lesson is huge volume of near-variant positions on a single depth ladder. It suits fluency practice after concepts have been taught, not first exposure.

## 7. *Bobby Fischer Teaches Chess* (Margulies and Mosenfelder, 1966)

The book uses programmed instruction: **one frame per page.** Each frame is a diagram and a question. The answer is on the next page. The left-hand pages are printed upside down, so you read to the end and then turn the book over and work back.

When you choose a wrong answer, the book explains why it fails and sends you back to try again. That is Crowder-style branching: feedback specific to each wrong answer.

The scope is deliberately narrow, essentially only checkmate:

1. Elements of checkmate
2. Back-rank mates
3. Back-rank defenses and variations
4. Displacing defenders
5. Attacks on the enemy pawn cover
6. Final review (mixed)

It sold about a million copies. Critics said the content "could have been compressed to fifty pages." The repetition is the point.

The general principles of programmed instruction are: objectives defined in advance, small sequential steps, active responses, immediate feedback, self-pacing, and material revised through developmental testing.

## 8. Woodpecker, Chessable and spaced practice

- **Woodpecker** (Smith and Tikkanen): 1,128 puzzles in three tiers (easy, intermediate, advanced). You solve the whole set, then solve it again in about half the time, cycle after cycle, ending with the full set in one day. Critics note the risk of memorizing positions rather than patterns, and that its real strength is motivation: a fixed set, a clear endpoint, visible progress.
- **Chessable MoveTrainer**: default review intervals are 4 hours, 1 day, 3 days, 1 week, 2 weeks, 1 month, 3 months and 6 months. A wrong answer resets the timer. Matuschak's critique is that drilling board moves can't check whether you understand *why* a move works.
- **Interleaving research**: in Rohrer and Taylor's 2007 study, mixed practice felt harder and scored worse *during* practice, but beat blocked practice on a test a week later. Mixing forces the learner to identify which tool the problem needs. This is the experimental basis for the Steps "Mix" design.

---

## 9. Design principles across these curricula

**Exercises per concept.**

- Apps: 3–9 per stage, about 6 on average (lichess Learn).
- Workbooks: about 30 per lesson theme, plus Extra and Mix volumes of hundreds.
- Drill books: thousands.
- The curriculum teaches with about 6 per concept. Fluency comes from later mixed sets and drill libraries.

**Ramp inside a lesson.**

1. A demonstration with essentially one possible answer (lichess draws arrows; Steps uses its first, effortful items).
2. One more step.
3. Remove the guidance.
4. Introduce efficiency.
5. Introduce a twist, which resets difficulty down: the sawtooth.
6. A capstone.

Difficulty rises through distractors and number of moves before it rises through depth.

**When to mix.**

- Within a lesson: one mixed level at the end (lichess "Escape or block").
- Across lessons: a block with no theme label after a group of themes (Steps Extra, second half), and dedicated Mix sets.
- At the end: a final review (*Bobby Fischer Teaches Chess*).
- A simple checklist gives structure to mixed problems: mate, material, danger.

**Failure, retry and hints.**

- Undo the wrong move immediately (300 ms on lichess).
- Show the consequence: the opponent's capture or the king's escape.
- One-tap retry.
- Hints appear after a delay or after a failure, and escalate: the piece, then the solution.
- A hint costs score or rating but not completion.
- The Steps manual's best kind of hint is "the same idea in a simpler position."

**Goal phrasing.**

- An imperative verb and an object, plus an optional count and time horizon ("Checkmate the opponent in 3 moves", "Defend for 2 moves").
- Horizon counters tick down live.
- Text is kept to one or two short lines. The children's books (Stepping Stones) drop text entirely and rely on diagram conventions.

**Board-size reduction.**

- lichess shrinks content on the full board.
- Minichess teaching shrinks both the rules and the board (5×5).
- Stepping Stones shrinks the number of pieces and enlarges the diagrams.

**Showing progress.**

- A map of grouped tiles, with the recommended next tile pulsing.
- Per-item stars.
- An overall percentage.
- Rank names that echo the game's own pieces (ChessKid's Pawn→King).
- A "What next?" handoff to play.
- Locks are a product choice: chess.com locks lessons, lichess never does.

---

## 10. Implications for Muju

1. **Aim for about 18–22 arcs of 5–8 puzzles, plus a mixed set every 3–4 arcs.** That is roughly 120–160 puzzles, at lichess Learn's density. Do not try to match Steps volume inside the curriculum.

2. **Muju's crystals can do the job of lichess's stars.** "Mine 8 this turn" with one Muju beside an 8-crystal cell is the Muju version of "Grab the star." Movement and Speed can be taught through mining goals without gold dots or target markers.

3. **Let constraint be the hint.** Since there are no arrows or gold dots, puzzle 1 of each arc should be on a 3×3 or 4×4 board with one relevant unit and one productive action. Use 6×6 and larger only when spawn rectangles, home corners or Speed 3+ need room. Put the sub-board's corner on the player's real home so rectangle geometry stays true.

4. **Check goals against the game state after every action, not against a fixed move sequence.** Muju has many equivalent paths and attack orders, so matching move sequences would reject correct solutions. Checks such as `crystals ≥ N`, `unit X eliminated`, `own unit on enemy home at turn start` or `no own unit killable` are robust. Complete the puzzle the moment the check passes.

5. **Give every puzzle an explicit "old way" failure** (the pawn-on-e3 trick). Build positions where the arc's new idea is the *only* way through:
   - Elemental advantage: base ATK falls exactly 1 short of DEF without the advantage.
   - Cleave: four kills require one unit to keep chaining.
   - Placement: only one summon square survives the arrival check.

6. **Make End Act / End Turn the commit point.** Muju allows undo within a turn. Allow free undo and reset before the commit, and evaluate failure only on committed states. For mining goals, pressing End Act *is* part of the lesson, because mining resolves at END_ACTION_PHASE.

7. **Use a passive opponent that punishes mistakes, and show why a puzzle failed without text.** Enemies stand still. On End Turn, if any of your units can be killed by the enemy's four actions (reuse the ⚠ projection), play that kill as the failure replay. This is the Muju version of lichess's "!" and capture animation.

8. **Handle "in 2 turns" goals the way lichess Practice does.** Show a horizon that counts down live ("Occupy their home in 2 turns" becomes "…in 1 turn"). The defender should be a scripted forced reply or the hard AI. Verify each such puzzle with the solver: the goal must be forced against every defense and impossible to reach faster. Following the Steps depth ladder, keep at least 70% of puzzles "this turn," and put multi-turn puzzles in the last third.

9. **Use one goal pattern everywhere: verb + count + object + horizon.** Examples: "Mine 12 this turn", "Capture the Hi", "Capture all", "Keep every piece safe", "Occupy their home in 2 turns", "Eliminate Black", "Summon a Hi that survives". The Stalemate goal is lichess's only text definition; Muju should need none.

10. **Grade completion separately from stars.**
    - Completing a puzzle means meeting the goal.
    - Stars come from actions used compared with par, crystals over target, and hints used. Adapt lichess's ≤par / ≤par+max(1, par/8) rule to actions.
    - Never fail a player for inefficiency.
    - Arc stars add up on the map.

11. **Use a three-step hint ladder with no text.**
    - After the 1st failure: nothing.
    - After the 2nd: pulse the unit that should act.
    - After the 3rd: offer "Show me" (animate the solution), or better, Steps-style, offer a simpler sibling puzzle.
    - Using a hint caps stars but still counts the puzzle as done.

12. **Isolate, then mix, at three levels.**
    - Each arc's last puzzle mixes its sub-ideas.
    - Every 3–4 arcs, a "Mix" set with no theme icon.
    - A final graduation set.
    
    The Steps checklist translates to Muju as: can I win (home or elimination)? can I kill? am I exposed? can I earn more? The interleaving research predicts the mixed sets will feel harder but teach more.

13. **Order the arcs with home checkmate late, as Steps does with mate:** movement → mining → attack → safety → combat → element advantage → each element's identity → Cleave → buying and spawn rectangles → promotion → upkeep → elimination → home occupation → mixed.
    - Show a trivial version of home occupation early (no defender can reach it), so the win condition is understood.
    - Teach the real home-checkmate (survive the defender's full turn) only after the safety and enemy-reach arcs.

14. **Add exercise formats from Steps:**
    - "Creating mate" becomes placement puzzles: commit a summon square that survives arrival.
    - "Find all mates" becomes "Make every kill" or "Mine every crystal."
    - "Route planner / choose the safe route" becomes "Reach the 8-cell without ending inside enemy reach."
    - Skip the classification formats (yes/no, mate/stalemate/play on). They need words.

15. **Model the map on lichess Learn:**
    - Arc tiles with an icon, a title and stars.
    - The next tile pulses.
    - Nothing hard-locked, since you asked that players can choose which puzzle to do.
    - An in-arc strip of numbered or starred puzzles.
    - Auto-advance about 1 s after success.
    - An arc-complete screen with stars and "Next: …".
    - A reset option behind a confirmation.
    - Skip lichess-style subtitles under every tile, per your no-eyebrow-subtitles rule. Keep only the home entry's "N puzzles" line, which you asked for.

16. **Tag each puzzle along several independent axes**, like lichess themes: concept, goal type, horizon (action / turn / 2 turns), elements and units, and board size. Record per puzzle: attempts, hints used, stars, and whether it was solved on the first try. This makes a later "practice by theme" mode and a strengths view cheap to add.

17. **Spaced review: recycle, but vary the positions.** Failed puzzles get a "retry" badge. Mixed sets re-sample earlier concepts. Prefer mirrored or shifted variants (Polgár-style near-variants) over repeating identical positions, which is the Woodpecker critique: players memorize rather than learn the pattern.

18. **Puzzles are not play, so send players to play.** Steps insists on games alongside exercises, lichess ends Learn with a "What next?" panel, and Duolingo is 25% games. Offer "Play vs AI" at arc ends and at graduation. Consider a few "mini-match" puzzles: a short sub-board game against easy AI with a goal, such as "Mine more than Black in 3 turns."

19. **Check every puzzle with the engine before shipping.** lichess Practice depends on its engine. For each Muju puzzle, use `src/ai/hard` to confirm three things:
    - the goal is reachable
    - it is *not* reachable without the target concept
    - the position matches the current rules revision
    
    Re-verify all puzzles whenever the rules change.

---

## Sources

- lichess Learn source: [stage directory](https://github.com/lichess-org/lila/tree/master/ui/learn/src/stage), [list.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/stage/list.ts), [score.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/score.ts), [levelCtrl.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/levelCtrl.ts), [view.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/view.ts), [progressView.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/progressView.ts), [mapSideView.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/mapSideView.ts), [learn.xml strings](https://github.com/lichess-org/lila/blob/master/translation/source/learn.xml), [lichess.org/learn](https://lichess.org/learn)
- lichess Practice: [lichess.org/practice](https://lichess.org/practice), [PracticeGoal.scala](https://github.com/lichess-org/lila/blob/master/modules/practice/src/main/PracticeGoal.scala), [studyPracticeView.ts](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/study/practice/studyPracticeView.ts)
- lichess Puzzles: [PuzzleTheme.scala](https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleTheme.scala), [puzzle ctrl.ts](https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/ctrl.ts), [feedback.ts](https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/view/feedback.ts), [puzzle.xml strings](https://github.com/lichess-org/lila/blob/master/translation/source/puzzle.xml), [mintlify puzzle overview](https://mintlify.com/lichess-org/lila/features/puzzles)
- Steps Method: [Manual Step 1 excerpt (PDF)](https://www.stappenmethode.nl/en/lp/en_lp_h1.pdf), [Manual Step 4 excerpt (PDF)](https://www.stappenmethode.nl/en/lp/en_lp_h4.pdf), [Step 1 extra reminder (PDF)](https://www.stappenmethode.nl/en/gs/en_gs_1e.pdf), [Workbooks info](https://www.stappenmethode.nl/en/info/workbooks), [Step 1 materials](https://www.stappenmethode.nl/en/material/step1), [FAQ](https://www.stappenmethode.nl/en/faq), [New in Chess Workbook Step 1](https://www.newinchess.com/learning-chess-workbook-step-1), [Chess Tigers overview](https://chess-tigers.de/en/blogs/news/stappenmethode), [Chess book reviews](https://chessbookreviews.wordpress.com/2014/11/16/the-chess-steps/)
- ChessKid: [Lessons](https://www.chesskid.com/learn/lessons), [Levels feature](https://www.chesskid.com/learn/articles/new-chesskid-feature-release-levels), [Complete guide](https://chesskid.com/learn/articles/complete-guide-to-chesskid), [Walk Before You Run](https://www.chesskid.com/learn/articles/walk-before-you-run)
- chess.com: [How lessons work](https://support.chess.com/en/articles/8609703-how-do-lessons-work-on-chess-com), [Puzzle points](https://support.chess.com/en/articles/9681952-what-are-puzzle-points-on-chess-com)
- Duolingo: [Chess course blog](https://blog.duolingo.com/chess-course), [Fox10 coverage](https://www.fox10tv.com/2025/04/23/duolingos-checkmate/)
- Minichess: [Richard James, Minichess Activities (PDF)](https://www.delanceyukschoolschesschallenge.com/wp-content/uploads/2023/12/minichess-activities.pdf)
- Polgár: [chess.co.uk listing](https://chess.co.uk/products/chess-5334-problems-combinations-and-games-laszlo-polgar), [AbeBooks contents](https://www.abebooks.com/9781579125547/Chess-L%C3%A1szl%C3%B3-Polg%C3%A1r-1579125549/plp), [chess.com forum on contents](https://chess.com/forum/view/chess-equipment/content-of-polgar-5334-book)
- *Bobby Fischer Teaches Chess*: [Wikipedia](https://en.wikipedia.org/wiki/Bobby_Fischer_Teaches_Chess), [Luxor listing (format)](https://www.luxor.cz/v/1738132/bobby-fischer-teaches-chess), [Programmed learning](https://en.wikipedia.org/wiki/Programmed_learning)
- Woodpecker and Chessable: [Chess Chatter, 135 hours](https://chesschatter.substack.com/p/135-hours-of-the-woodpecker-method), [Zwischenzug, Woodpecker revisited](https://www.zwischenzug.gg/p/the-woodpecker-method-revisited), [Forward Chess](https://forwardchess.com/blog/what-is-the-woodpecker-method/), [Chessentials Chessable review](https://chessentials.com/chessable-honest-review/), [Matuschak on MoveTrainer](https://notes.andymatuschak.org/zDr94hP6bG3jJYrdYy8B5hx)
- Interleaving: [IES replication award](https://ies.ed.gov/use-work/awards/systematic-replication-study-interleaved-mathematics-practice?ID=5754), [Rohrer 2014 (PDF)](https://www.gwern.net/doc/psychology/spaced-repetition/2014-rohrer.pdf)
- Muju context: /Users/ashkie/src/deevgames-puzzles/muju/SPEC.md, /Users/ashkie/src/deevgames-puzzles/muju/academy/CURRICULUM-AND-BATCHES.md