# Shogi and Go beginner puzzle curricula: research for the Muju puzzle curriculum

## Summary

- **Tsume-shogi already looks like what Muju wants.** A problem is a corner diagram, the pieces in hand, and one label, "3手詰" ("mate in 3"). The move count is the goal statement, and it is also the biggest hint.
- **Every strong beginner course starts with the most concrete win event.** Go starts with capture. Shogi starts with piece movement and then capture. Each attack topic comes before its defense topic: capture before saving stones, check before getting out of check. The full rules and the full board come late.
- **The good courses spiral.** *Graded Go Problems for Beginners* Vol. 1 has 239 problems in 4 levels, and each level runs through the same topics again (capture, saving, connecting, ko, ladders, life and death, opening, endgame) at higher difficulty. A section holds 2–26 problems, usually 4–10.
- **A wrong move gets its refutation played out.** The opponent's punishing reply appears on the board, followed by "failed" and "retry". Apps that only say "the group is dead" get criticized for it.
- **Boards start tiny and grow.** Go goes 4×4/5×5 → 7×7 → 9×9 → 13×13 → 19×19. Shogi goes 3×3 (9-square shogi) → 3×4 (Doubutsu) → 5×6 → 9×9. Tsume problems show only a corner of the real board.

---

## 1. Shogi

### 1.1 The tsume-shogi format

A tsume problem is a forced-mate puzzle with strict conventions. Every attacking move must be check. The defender plays the reply that delays mate longest and holds every piece that is not on the board or in the attacker's hand. Futile interpositions are not allowed. Problems are named by length in plies ("mate in _n_"), so attack, reply, mate counts as a three-mover, and the diagram usually shows only the relevant corner of the board ([Wikipedia: Tsume shogi](https://en.wikipedia.org/wiki/Tsume_shogi)). Composers also follow an economy convention: every piece matters, and every piece in hand must be used.

The goal statement is almost nothing. Japanese books print the diagram, a box of pieces in hand, and "1手詰" or "3手詰". Wikibooks' 1-move set uses one sentence for every problem: "You are sente. Mate the opponent's king in one move from this position" ([ja.wikibooks 1手詰](https://ja.wikibooks.org/wiki/%E5%B0%86%E6%A3%8B/%E8%A9%B0%E5%B0%86%E6%A3%8B_1%E6%89%8B%E8%A9%B0)). Those five problems are ordered by tactical theme, not by piece type: a dragon-and-gold mate, then a knight promotion decision, a promotion, a double-piece check, and choosing the right knight of two.

The move count is a hint, and teachers know it. All About notes that some problems state the count and some do not. One recommended app gives problems without a stated count, which is closer to real games ([All About, tsume study](https://allabout.co.jp/gm/gc/413530/)). A Japanese search summary also mentions apps that deal 1- and 3-move problems in random order to remove the hint, but I could not trace that claim to a specific source.

### 1.2 The 1 → 3 → 5 ladder, with real numbers

| Resource | 1-move | 3-move | 5-move | Notes |
|---|---|---|---|---|
| Urano Masahiko, *1手詰ハンドブック* (Handbook series) | **300** (whole book) | 200 (own book) | 200 (own book) | Best-selling first tsume book; the series passed 220,000 copies by 2018 ([wowma listing](https://wowma.jp/item/528923258), [All About](https://allabout.co.jp/gm/gc/413530/)) |
| *子ども詰将棋チャレンジ!!220問* (Habu supervised; Tsume Paradise) | **80** | **100** | **40** | **5 difficulty levels**; prints **common wrong answers** next to the right one; all new compositions; furigana ([Kinokuniya](https://www.kinokuniya.co.jp/f/dsg-01-9784405065826)) |
| *Minna no Tsumeshogi Nyumon-hen* (Switch) | **160** | **180** | **160** | When you play a wrong move, the AI answers it so you can see why it fails; hints, auto-replay, completion tracking ([DekuDeals](https://www.dekudeals.com/items/minna-no-tsumeshougi-nyuomon-hen)) |
| *どんどん強くなる こども詰将棋1手詰め* | all 1-move | — | — | A "Basic 30" section of core patterns, then a drill section; problems taken from real games ([learnnatively](https://learnnatively.com/book/c089c63cc2), [Maruzen Junkudo](https://www.maruzenjunkudo.co.jp/products/9784262101538)) |

What the teaching advice agrees on:

- **Repeat problems until you see the answer at once.** "Tsume isn't over once you solve it; solving the same problems again and again until you memorize the mating patterns is the shortcut" ([All About](https://allabout.co.jp/gm/gc/413530/)). Finishing the 1-move book is the usual signal to move on to 3-move problems.
- **Multi-move problems take a large share of a kids' course**, roughly 45–65% (100+40 of 220; 340 of 500). But the multi-move tier only begins after a 1-move block.

### 1.3 Lishogi "Learn": a full interactive beginner course, inspected in source

Lishogi is the lichess fork for shogi. Its course lives in [`ui/learn/src`](https://github.com/WandererXII/lishogi/tree/master/ui/learn/src) (`categories.ts`, `stages/*.ts`, `level.ts`, `progress.ts`, `translation/source/learn.xml`).

- **Structure:** 5 categories, 17 stages, and about 120 levels.
  - **Introduction** (3 levels).
  - **Pieces:** King 3, Gold 5, Silver 6, Knight 4, Lance 4, Bishop 5, Rook 5, Pawn 4.
  - **Fundamentals:** Capture 6, **Drops 9**, Protection 13, Check-in-one 5, Out-of-check 12, **Mate-in-one 16**.
  - **Intermediate:** Board setup 9, Repetition 3.
  - **Advanced:** Piece value 9.
- **Promotion is not its own stage.** It is shown once in the intro (the promotion zone) and then taught inside each piece's stage. The rook stage covers rook, then "rook promotes to dragon", then the dragon's moves. Promoted knight, lance and pawn are each pointed back to "moves like the gold general".
- **Drops come right after Capture** ("Reuse captured pieces!"). One drop level shows the forbidden drop squares as red circles, so the rule is visible instead of written out. The two-pawns-in-a-file rule is taught as a puzzle.
- **The initial position comes late.** Board setup sits in "Intermediate", after mate-in-one. Players learn the pieces and tactics on mostly empty boards before they see the full army.
- **Goal lines are short imperatives:**
  - "Grab all the stars!"
  - "Take the enemy pieces! And don't lose yours."
  - "Escape with the king or block the attack!"
  - "Attack your opponent's king in a way that cannot be defended!"
  - "Choose your piece carefully!"
- **Each level is data plus checks.** A level is `{goal, sfen, nbMoves, success, failure, drawShapes?, showFailureMove?}`. Success and failure are composable checks: `extinct(color)`, `checkmate`, `obstaclesCaptured`, `anyCapture`, `unprotectedCapture`, `pieceOn`, combined with `and/or/not`.
  - In the mate-in-one stage, all remaining pieces sit in the defender's hand, which is the tsume convention.
  - One level is a deliberate trap. Success is `and(checkmate, not(pawn dropped on 1d))`, because "Mate with a dropped pawn is illegal". The tempting answer breaks a rule, and that is the lesson.
- **Hints fade.** Gold level 1 draws arrows along the path. Levels 2–3 have none. The last level highlights the gold's move squares as a summary.
- **Scoring is par-based stars.** `nbMoves` is the par: 3 stars at or under par, 2 at par+1, otherwise 1 ("The fewer moves you make, the more points you win!"). Progress is a per-stage array of best scores, saved only when it improves, in localStorage for guests or on the server when logged in.
- **Failure shows the punishment.** `showFailureMove: 'capture'` animates the enemy capture that punished a hanging piece.

### 1.4 Reduced-board teaching variants

- **9-square shogi (9マス将棋), Aono Teruichi 9-dan, endorsed by the JSA.** A 3×3 board using 8 piece types. It ships with **40 starting setups graded 入門/初級/中級/上級** (intro, beginner, intermediate, advanced). Some setups start with pieces in hand. Promotion happens only on the far rank. It is aimed at "people who want to start shogi or have just learned how the pieces move" ([Gentosha GOLD Online](https://gentosha-go.com/articles/-/4461)). This is the closest existing analog to what Muju needs: same rules, tiny window, a graded set of hand-built positions.
- **Doubutsu shogi ("Let's Catch the Lion!"), Kitao Madoka and Fujita Maiko.** A 3×4 board with 4 pieces a side ([Wikipedia](https://en.wikipedia.org/wiki/D%C5%8Dbutsu_sh%C5%8Dgi)).
  - **Movement is printed on the pieces as dots**, so children don't need to memorize it. The app adds a color-coded reach display ([Gamer](https://www.gamer.ne.jp/news/202304130083/)).
  - It has **two win conditions from the very first game**: capture the Lion, or "try" by moving your Lion onto the far rank where it is not in check. That second rule is structurally the same as Muju's home occupation: arrive, then survive the reply.
  - Rules are simplified at the edges: a captured Hen comes back as a Chick, and the usual drop restrictions don't apply.
  - The game is strongly solved (second player wins), which makes no difference for teaching.
- **Board growth:** Gorogoro Doubutsu shogi (5×6) and a 9×9 animal version bridge to full shogi ([Wikipedia](https://en.wikipedia.org/wiki/D%C5%8Dbutsu_sh%C5%8Dgi)). Parenting media recommend Doubutsu as the whole entry ramp ([HugKum](https://hugkum.sho.jp/4727)).

### 1.5 Other shogi resources

[lishogi.org/resources](https://lishogi.org/resources) recommends this order: rules videos first (Hidetchi #1–20; Shogi Harbour's *Shogi 101*), then tsume (KillerDucky and karakoro beginner studies, PlayShogi's 5-minute "survival mode"), with openings last. I could not find a published lesson order for 81Dojo's or Shogi Harbour's beginner material, so treat both as video-first, not puzzle curricula.

---

## 2. Go

### 2.1 Capture first: Yasuda's capture game

Yasuda Yasutoshi 9-dan's capture game ("atari go", "first capture go") uses the normal rules, but **the first capture wins**. There is no ko, no life and death, and no scoring. The rules take about two minutes to learn, so a teacher can have a whole class playing at once. It is played on 9×9 or even 7×7.

The progression changes **only the win condition**: first capture → 5 or 10 captures → most captures → real Go ([USGO archive](https://www.usgo-archive.org/node/548), [Wikipedia: Capture go](https://en.wikipedia.org/wiki/Capture_go)). Other courses follow the same pattern:

- The KGS tutorial puts Capture Go sixth of its 14 lessons, right after Chains, Liberties and Captures, as a game against a weak bot: "after a few tries you should be able to win" ([KGS](https://gokgs.com/tutorial/captureGo.jsp)).
- The British Go Association's cartoon intro teaches capture go first ([BGA](https://britgo.org/howtoplay)).
- AI Sensei's free course is 8 lessons: Welcome, Capturing, Connecting, More Capturing, **Capture in Two Moves**, Capture Tactics, Eyes, Counting ([AI Sensei](https://ai-sensei.com/learn-go)). Two-move capture gets its own explicit step.
- A 5×5 teaching method starts with "the winner is the only one with pieces left on the board", which is elimination, and adds territory scoring later ([LessWrong, simple 5×5 Go](https://www.greaterwrong.com/posts/vwxs3HREyZnLsRPWB/simple-5x5-go)).

### 2.2 *The Interactive Way to Go* (Hiroki Mori, playgo.to)

I read the original pages archived in [edbrannin/interactive-way-to-go](https://github.com/edbrannin/interactive-way-to-go) (`original/playgo.to/iwtg/en/TOC.html`, `P50K.html`, `BlackHeaven.html`, `xml/*.xml`).

- **Four chapters, with lesson pages and problem pages alternating:**
  - Rules: intro, capturing, **50 kyu, 49 kyu, 48 kyu**, *Take a break*, 47 kyu, illegal moves, 46 kyu.
  - Techniques: 45k ladder, 44k two eyes, 43k semeai, 42k snapback, 41k, ko, 40k, 39k false eyes, 38k, 37k.
  - Progression: opening, 36k, endgame, cutting, defending, jumps, 35k, 34k.
  - Preparation: examples, komi, corners.
- **Problem pages are named by rank**, counting down from 50 kyu to 34 kyu, so progress reads like ranking up. Each page has only **2–4 problems** (50k: 3, 46k: 4, 45k: 2, …).
- **Boards are 9×9:** "The smaller board is recommended for beginners."
- **Goal lines:**
  - "Black's turn. Capture the white stone in atari."
  - "Two white stones are in atari. Capture them with one move!"
  - "Even if there are other stones nearby, just do the same."
  - "Save the three black stones…"
- **Wrong moves are refuted, and answers are never given.** "If you make a wrong move, your stones will be killed instead!" The site says: "I don't provide answers to problems because you will eventually find them by yourself after retrying many times."
- **Problem data is a move tree with a wildcard.** `<play pos="ed" res="ee">` is a correct move plus the scripted reply. `<play pos="zz" res="ec" message="failed">` means any other move gets this refutation.
- **"Take a break" is a breather puzzle.** Only Black moves, and the goal is to capture every white stone "with as few stones as possible… You need 33." It is a par-based optimization puzzle with no opponent.
- **Its known weakness is the difficulty curve.** A learner reported it "became harder about two-thirds of the way through" and set it aside ([L19 thread](https://lifein19x19.com/viewtopic.php?p=204115)). The same poster liked a tutor app that went Points → Liberties → Connections → Capture.

### 2.3 *Graded Go Problems for Beginners* Vol. 1 (Kano Yoshinori, Nihon Ki-in/Kiseido; 30–25 kyu)

The book has 239 problems, mostly on 9×9 boards. Each solution shows the correct answer and an incorrect alternative ([Goodreads](https://www.goodreads.com/book/show/910564); [gobooks.info](https://www.gobooks.info/h3.html): "the first problems ask you to capture stones that are already in atari"). One learner's study log lists every section ([Burnett Nov](https://people.uleth.ca/~d.burnett/Learn06/200611November/11GO.htm), [Dec](https://people.uleth.ca/~d.burnett/Learn06/200612December/12GO.htm)):

| Level 1 (1–60) | Level 2 (61–120) | Level 3 (121–182) | Level 4 (183–239) |
|---|---|---|---|
| Capture stones 14 | Capture stones 10 | **Making life 26** | Atari 10 |
| Save endangered stones 8 | Save endangered 2 | **Killing groups 21** | Capturing races 4 |
| Recognize atari 8 | Give atari 14 | Life & death 3 | Nets 4 |
| Connect/separate 4 | Ladders 2 | Seki 4 | Snapback 4 |
| Ko 4 | Snapback 4 | Ko 4 | Oiotoshi 4 |
| Ladders 2 | Connect/separate 6 | Capturing races 4 | Brilliant vs bad moves 3 |
| Living/dead groups 6 | Living/dead 14 | | Seki 4, Connect/separate 6 |
| Opening 4 | Ko 4 | | Living/dead 12 |
| Endgame & other 10 | Opening 2, Endgame 2 | | Opening 2, Endgame 4 |

What the table shows:

- **It is a spiral.** Each level runs through nearly every topic again. Ko appears in levels 1, 2 and 3. Living and dead groups appear in all four.
- **Levels are about 60 problems each.** Sections run 2–26 problems, typically 4–10. The section on the topic a level is really about is large (26 problems on making life).
- **Within a section, problems start trivial and end hard.** The learner called problems 1–14 "trivially easy", missed only the last connect/separate problem (#34), and "had to think" on ko.
- **Repetition is part of the method.** Reviewers describe it as building "muscle memory". The learner redid the sections he missed and played three 9×9 games against a computer each session alongside the problems.

### 2.4 Apps and graded databases

- **Tsumego Pro:** 2,840 problems in five levels (level 1 ≈ 15–13k; a "Beginner" pack is extra). Six daily problems, two each of easy, medium and hard. A progress mode adjusts difficulty to the player. It stores "all valid answers and a lot of bad variations, to help you know why you are wrong" ([App Store](https://apps.apple.com/app/id892041876)). Reviewers call it "only for people who know the game".
- **BadukPop:** more than 4,000 problems with interactive lessons from beginner to advanced. Rated mode raises or lowers difficulty with each answer. Reviewers complain that feedback like "Oops, the group is dead" never says *why* ([App Store](https://apps.apple.com/us/app/-/id1472684271)).
- **101weiqi:** a very large graded collection in Chinese ([r/baduk wiki, via search](https://lr.eu.psf.lt/r/baduk/wiki/tsumegos)).
- **Cho Chikun's *Encyclopedia of Life and Death*** (elementary / intermediate / advanced) is the standard after Kano. Problems are grouped by shape family: second-line shapes, six-space corner eyes, combs, carpenter's square ([excerpt PDF](https://csclub.uwaterloo.ca/~h363kim/chochikun.pdf)).
- **How hard problems should be** ([Go Magic](https://gomagic.org/where-and-how-to-solve-go-problems/)):
  - Cho: use books where you solve **80%**, and "60 simple problems at a minute each is far better than one massive problem".
  - Dinerstein: you should solve **2 of 3 within 5 minutes**.
  - Time targets: 1–5-move problems in **≤10 seconds**.
  - Mark misses and redo them later.

### 2.5 Board sizes and Janice Kim's books

- **Board sizes:** 5×5 lets a small child count the whole board, and one family went down to 4×4 with home-made puzzles ([Pandanet](https://www.pandanet.co.jp/English/soudan/htm/1007-2s.htm)). Classes typically go 9×9 → 13×13 → 19×19 around 16–20 kyu. Most simple tsumego fit on a 9×9.
- **Janice Kim, *Learn to Play Go* vol. 1:** 14 chapters of 10–15 minutes each, every one ending in a "try it yourself" set ([Schachversand](https://www.schachversand.de/en/product/LGKIMLTPG1.html)). Vol. 2 "repeat[s] something mentioned in the first volume and then go[es] on to… slightly more advanced techniques", which is a spiral at book scale ([gobooks.info](https://www.gobooks.info/learn2.html)).

---

## 3. Design principles across both games

| Dimension | What the best curricula do |
|---|---|
| **Concept order** | Movement or placement → the win event (capture or mate) → its defense (save, out of check) → reuse or economy (drops) → patterns (ladder, snapback, mate shapes) → full setup and opening, last. Win conditions show up early in trivial form and come back in depth later. |
| **Single-move vs multi-move share** | The first block is entirely 1-move (Urano: 300; lishogi: every mate level is mate-in-1; Kano L1: capture stones already in atari). After that, kids' books are about 35% 1-move, 45% 3-move, 20% 5-move (80/100/40), or about one third each (160/180/160). Two-move problems get their own explicit step ("Capture in Two Moves"). |
| **Goal statement** | Side to move + verb + object (+ length): "Black to play and capture", "Black to live", "Mate in 3". Text shrinks as the course goes on. Stating the length helps, and hiding it is a later-stage difficulty lever. |
| **Problems per concept** | 2–16 per micro-topic (lishogi 3–16; Kano 2–26, median about 4–6; IWTG 2–4 per page). Each pass at a topic opens with an easy problem and ends with a hard one. |
| **Overall size** | A first-contact course is about 120 (lishogi), about 50 plus lessons (IWTG), 220–500 (kids' tsume), or 239 (Kano Vol. 1). |
| **Failure feedback** | Play the opponent's refutation, then show "failed" and offer a retry (IWTG, lishogi, Minna no Tsume AI, Tsumego Pro). Kids' books print common mistakes. Withholding answers is a deliberate choice (IWTG). A bare verdict with no reason draws complaints (BadukPop). |
| **Reduced boards** | Tiny graded windows (3×3 with 40 setups, 3×4, 4×4/5×5), then 7×7/9×9, then full. Tsume uses corner windows of the real board with an explicit convention for everything off-screen. |
| **Scaffolding** | Rules printed on pieces (Doubutsu); hint arrows on the first level only, then removed (lishogi); forbidden squares drawn on the board; rule exceptions taught through trap puzzles. |
| **Progress and motivation** | Rank labels per page (50k → 34k), stars against a par, best scores saved only when they improve, daily sets, breather puzzles, re-solving misses. |

---

## 4. Implications for Muju

1. **Use the tsume format directly.** Show the diagram, the bank, and one goal line that includes the turn count: "Capture the Hi · this turn", "Occupy the enemy home · 2 turns". Keep the count visible through the beginner arcs. A late mixed-review arc can hide which concept applies, the way tsume apps hide the move count.
2. **Count Muju puzzle length in turns, and remember one turn is already big.** One Muju turn is up to 4 actions plus purchases, which is closer to a 3-move tsume than a 1-move one. So the beginner set should be about 75% 1-turn puzzles, about 20% 2-turn (you, the opponent's reply, you, which is the 3-move analog), and at most 5% 3-turn capstones. Inside 1-turn puzzles, build a smaller ladder: 1 action, then 2, then all 4 actions plus Prepare.
3. **Show the win event first, and teach each attack topic before its defense.** Suggested arc order:
   - Move (speed, cost rounding, blockers).
   - Eliminate a target (ATK ≥ DEF).
   - Mining payday (min(MINE, reserve), depletion).
   - Combined chip damage and the owner-turn heal.
   - Cleave chains.
   - One arc per element pair, then the element-advantage arc.
   - Buy and spawn rectangles.
   - Promotion.
   - Upkeep.
   - Keep your pieces safe (the "out of check" analog).
   - Home occupation.
   - Elimination.
   - Mixed review.

   Show home occupation once early in a trivial form, as Doubutsu teaches the "try" from the first game, and come back to it with defenders at the end.
4. **Spiral like Kano.** Plan 3–4 passes, each revisiting movement, combat, economy and win conditions at higher difficulty:
   - L1: tier-1 units on 3×3–5×5.
   - L2: elements, advantage and Cleave on 5×5–6×6.
   - L3: buy, promote and upkeep in corner windows.
   - L4: full-turn integration on 7×7–10×10.

   Each pass should be roughly 30–60 puzzles, about 150 in total.
5. **Keep sections small.** Use 4–8 puzzles per micro-concept. The first should be close to a freebie, like Kano's "capture the stone already in atari". The last should be the test. Sections that cover a major idea (Cleave, spawn rectangles, element advantage) can run to 10–15.
6. **Aim for about an 80% first-try solve rate and under a minute per early puzzle.** Many short puzzles teach better than a few hard ones. Watch for an IWTG-style wall about two thirds of the way through, and insert an easier section before each new mechanic.
7. **Constrain the position instead of annotating it.** With the gold dots off the table, guide through construction: tiny windows, one acting unit, one target, and a bank holding exactly the cost needed. That last one is the analog of the tsume rule that every piece in hand gets used. Every unit and every crystal on the board should matter, and decoys should appear only once a concept is solid.
8. **On failure, play the opponent's turn instead of showing a red X.** Animate what actually happens: your exposed Hi dies, a summon is refunded because an enemy sits inside the rectangle, the unpaid tier-2 is lost, the chip damage heals. Then offer one-tap Retry. Reveal the answer only after several failures, if at all (IWTG never does). This is how a nearly wordless course can still explain *why*.
9. **Check goals with predicates, not move trees.** Muju has too many action orderings for IWTG-style answer trees. Use lishogi-style composable checks evaluated at turn end:
   - `minedThisTurn >= 12`, `eliminated(target)`, `noOwnLosses`, `tier(unit) == 2`, `bank >= n`, `occupies(enemyHome) at next own turn start`, `enemyUnits == 0`.
   - Immediate-failure checks: `lostUnit`, `cleaveChainClosed`.
10. **In 2-turn puzzles, let the AI play the defender.** Follow the tsume convention that the defender plays the reply that best resists, by running the existing AI search. Allow an authored reply to be pinned where a deterministic teaching line matters.
11. **Use trap puzzles for the "why didn't that work" rules.** Lishogi teaches illegal pawn-drop mate this way. Give 2–3 puzzles each to the rules beginners trip on:
    - Chip damage heals at the owner's turn start.
    - A non-lethal hit closes that unit's Cleave chain.
    - An enemy inside a rectangle blocks spawning from that anchor.
    - Summons arrive next turn, not this one.
    - Upkeep comes after mining.
    - A home invader must survive one reply.
12. **Teach tier ladders inside element arcs and economy as earn-then-spend.** Like lishogi's promotion inside each piece stage, teach Hi → Honō → Kagari inside the Fire arc. Like Capture → Drops, put Buy immediately after Mining, with Promotion right after Buy.
13. **Use sub-boards as windows of a real board, and write the convention down.** Tsume says all off-board pieces belong to the defender. Muju should say:
    - Squares outside the window don't exist.
    - Kill clock and handicap are off.
    - Elimination and home-occupation checks are active only when the puzzle declares them.

    Anchor economy and home puzzles on a visible home corner, because spawn rectangles and occupation are defined from the corners.
14. **Grow the board.** Use 3×3–4×4 for movement and kills, 5×5–6×6 for elements, Cleave and mining routes, corner windows of about 5×5–7×7 for spawning, promotion and home defense, and full 10×10 only for the capstones. 9-square shogi's 40 graded setups on a 3×3 board show how far a tiny window can stretch.
15. **Keep the real game's on-board cues switched on.** Doubutsu prints movement on the pieces. Muju's equivalents are the stat chips, Show reach, the ☠/⚠ badges, crystal lights, and the +1/−1 element modifier in attack preview. They are the wordless explanation layer, so puzzles should use the same affordances as real play, with nothing puzzle-only.
16. **Grade only optimization puzzles.** Most puzzles should be pass/fail. For "Mine as many as you can" or "Clear the field" puzzles, use par stars (lishogi: at par = 3, par+1 = 2) or crystal thresholds. Add an IWTG-style "Take a break" puzzle with no opponent every 10–15 puzzles.
17. **Progress screen: one row per arc, with per-puzzle status and a count.** Save only improvements, locally for guests. A rank label per arc, the way IWTG names pages "50 kyu"… "34 kyu", gives a cheap sense of advancement. The home-screen tile "Learn to Play: N puzzles" can come straight from the catalog length.
18. **Build in repetition and interleave with play.** Add a "Review" queue of puzzles failed on the first try. End each pass with a mixed set that hides the arc label. Point to "Play vs AI" after each pass, as the Kano learner played three games per problem session and capture go is *played*, not solved.