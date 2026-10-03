# Teaching without text, and puzzle-select UX: research for the Muju puzzle curriculum

## Part A: How games teach mechanics with little or no text

### 1. Super Mario Bros. World 1-1: the level is the manual
- The first enemy, a Goomba, walks toward you slowly. Novices often die to it, and that death teaches the jump. Bumping a block with your head pays out coins. The second block releases a mushroom that slides into the player, so Mario grows "whether you wanted it or not." Pits appear only after the player has the tools to cross them. Pipes of rising height teach that holding jump longer makes Mario jump higher. ([Wikipedia: World 1-1](https://en.wikipedia.org/wiki/World_1-1), [Blake Crosley on Miyamoto](https://blakecrosley.com/blog/design-philosophy-shigeru-miyamoto))
- Miyamoto's stated goal was that players "gradually and naturally understand what they're doing… so that it becomes 'their game'." The Koopa Troopa was replaced by the Goomba as the first enemy because jumping on a Koopa and then kicking it "might be a little too difficult." ([BGR / Eurogamer interview summary](https://www.bgr.com/general/super-mario-bros-world-1-1-design/), [MCV](https://www.mcvuk.com/development-news/video-miyamoto-shares-his-level-design-secrets/))
- **Lessons:** The first encounter with a mechanic should be unavoidable and low-stakes, and it should use the simplest possible version (Goomba before Koopa). Consequences should arrive whether or not the player understood them yet.

### 2. Portal: checklisting, then enumeration
- Valve: "Portal is effectively an extended player training exercise… introducing a series of gameplay tools, then layering these tools into increasingly difficult puzzles." "For training purposes, there's generally just one correct solution to these early puzzles." ([Portal developer commentary](https://theportalwiki.com/wiki/Portal_developer_commentary))
- **Checklisting:** "new mechanics are broken down into the core components players must understand in order to have fun using that mechanic." Once the basics land, the team "enumerate[s] the interesting things that can be done with the mechanic," and those uses become the harder puzzles, which often invert rules the player has already learned. ([Game Informer](https://gameinformer.com/b/features/archive/2010/03/17/thinking-with-portals-making-a-test-chamber))
- **Playtest repair:** Chamber 08 introduced acid, moving platforms and energy balls together, and playtesters were frustrated, so Valve "inserted two test chambers before this one." Chamber 15 combined two new skills, which "proved to be too much," so it was cut down to one. Players also understood portals faster when they "caught a glimpse of themselves through a portal," which led to deliberate sightlines. ([commentary](https://theportalwiki.com/wiki/Portal_developer_commentary))
- **Lessons:** Write down every atomic fact about each mechanic. Each fact gets at least one puzzle that cannot be solved without it. When playtesters stall, insert a bridging puzzle rather than adding text.

### 3. The Witness: one idea per panel, in sequence
- Rules are "taught to the player without any words or explicit explanation – instead, a simple maze with a new rule has to be solved, followed by a more complex one, and so on." ([Room Escape Artist review](https://roomescapeartist.com/2018/05/18/the-witness-review/)) Each panel builds on the one before: the first teaches only where the line starts, the next teaches that a specific path is required. Most puzzles explore one idea, and they are small enough to hold every part in your head at once.
- To Blow, "a puzzle is never just a puzzle"; it is a message from the designer to the player ([GMTK, "How Jonathan Blow Designs a Puzzle"](https://amara.org/v/C3BFd)). Blow: "The key to these puzzles is in the player's head." The Witness also offers two parallel puzzle paths so a stuck player can progress via the other ([Engadget](https://www.engadget.com/2014-06-12-the-witness-and-the-joy-of-intuition.html)).
- A wrong line simply fails and you draw again at no cost, so failure is cheap and repeatable.
- **Lessons:** Use panel sequences, meaning a short run of puzzles on the same rule, each adding one wrinkle. Put the rule's visual marker on the board, not in a caption. Offer parallel paths so a player is never hard-blocked.

### 4. Kishotenketsu: introduce, develop, twist, conclude
- Koichi Hayashida (Super Mario 3D World) uses the four-act kishotenketsu structure. A mechanic is introduced in a safe environment, then developed with higher stakes. An unexpected complication follows, and finally the earlier ideas are brought together. Mark Brown summarizes these stages as "self-contained showcases for new ideas, where a mechanic can be successfully taught, developed, twisted and then thrown away in about five minutes flat." ([MCV / GMTK](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps))
- **Lessons:** This maps directly onto a puzzle arc of roughly 4 to 10 puzzles. The twist is where a red herring belongs, and the conclusion is where interleaved review belongs.

### 5. Baba Is You: one new interaction per level, and cooks become variants
- Teikari aimed for every level to "incorporate some new interaction or feature of the game system." He noted that "many of the early levels are only difficult because you don't yet understand how exactly things are going to work," and he tried to let players "trust their intuition about what should happen." ([MCV, "When We Made Baba Is You"](https://mcvuk.com/when-we-made-baba-is-you/))
- "Almost every single level I made had at least one alternative way to solve the level." He reworked levels so that "even if the player finds an alternative solution, it still showcases the interesting bits." Some unintended solutions he liked enough "to dedicate a new level to that solution alone," which is where the "Extra" variant levels come from. He also warned that a solo designer goes "blind to a lot of the difficulty." (same source)
- The map is nonlinear. Players can skip puzzles within a cluster when stuck ([Gamereactor](https://www.gamereactor.eu/baba-is-you-review/), [SCMP review](https://yp.scmp.com/entertainment/tech-and-games/article/112792/%E2%80%98baba-you%E2%80%99-game-review-logic-fun-quirky-puzzler-nintendo)).
- **Lessons:** Mechanically verify that each puzzle has no unintended solution (a "cook" in chess-problem terms). Promote a cook you like into its own puzzle. Playtest with people who are not the designer.

### 6. Snakebird and Snakebird Primer: difficulty walls and the fix
- Snakebird's steep difficulty "was a turn-off for some folks." Noumenon responded with Snakebird Primer: "more than 70 brand new levels… and a non-linear progression so even if you do end up stuck on a particular puzzle there will be others you can jump over to for a break." It has no traditional hints. ([TouchArcade](https://toucharcade.com/2019/03/01/toucharcade-game-of-the-week-snakebird-primer/), [gurugamer](https://gurugamer.com/mobile-games/snakebird-primer-is-an-easier-version-of-snakebird-coming-out-next-week-1508/amp))
- **Lessons:** For a beginner curriculum, a gentle curve plus skippability does more than hints alone. The original's spike is the cautionary tale.

### 7. Stephen's Sausage Roll: constraint as teacher (the counterexample)
- "There are no 'beginner' levels that indirectly tutorialize the mechanics; you're just thrown into the deep end." The first levels are tiny but cramped, and "making any progress at all requires multiple non-obvious realizations about basic movement." ([Carl Muckenhoupt](https://www.wurb.com/stack/?p=3136)) Levels are "cleverly designed so that advanced tricks just aren't possible before the game's ready to unveil them." ([Slant](https://www.slantmagazine.com/games/stephens-sausage-roll/))
- **Lessons:** The technique worth borrowing is the small board that makes the wrong ideas impossible to execute, which narrows the space to the lesson. The deep-end difficulty is not for beginners.

### 8. Into the Breach: perfect information makes every turn a puzzle
- Justin Ma: "We wanted to make something where every death felt like your own fault. This lead us to use of telegraphed enemy attacks as a core mechanic." "When every enemy attack is telegraphed and there's no random chance in your attack options, the game starts to feel like a puzzle." "It's important to me that when you fail at a goal, it's very clear how or why you failed." "A single additional enemy turns a battle from 'a fun challenge' to 'completely impossible', so it's a very delicate balance." ([Game Developer, Road to the IGF](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-))
- Battles take place on 8x8 grids. Each mission carries optional bonus objectives such as "protect the train" or "kill at least 7 enemies." Hover previews show targets and damage before you commit. Moves can be undone until an attack is made, and a "Reset Turn" can be used once per battle. ([Nintendo Life](https://nintendolife.com/reviews/switch-eshop/into_the_breach), [Game Informer tips](https://www.gameinformer.com/b/features/archive/2018/02/27/23-tips-to-help-you-dominate-into-the-breach.aspx), [Gamepressure](https://www.gamepressure.com/into-the-breach/beginners-guide-tips/zfaa76))
- **Lessons:** Muju is already a perfect-information game. The puzzle's job is to make all relevant information legible: show reach, kill badges and crystal counts. A one-turn puzzle should feel like an Into the Breach turn. Tune piece counts carefully, because one extra defender flips solvable to impossible.

### 9. Hitman GO and Lara Croft GO: board-game puzzles
- Levels are node-and-line boards presented as dioramas with figurines, and every enemy moves when you move. "New rules and mechanics are usually introduced on a simple map before testing the player with combining everything." ([Game-Wisdom](https://game-wisdom.com/analysis/hitman-go)) Levels go from static guards to patrolling and rotating ones, then to disguises and distractions ([Pocket Gamer](https://www.pocketgamer.com/hitman-go/review/)).
- Each level has a main goal (reach the exit or kill the target) plus bonus objectives such as "a certain number of moves" or "without killing anyone." The stars earned unlock the next chapter box. Hints and chapter unlocks are sold as in-app purchases. ([Wikipedia: Hitman Go](https://en.wikipedia.org/wiki/Hitman_Go)) One criticism: "it's impossible to undo a wrong move" ([Pocket Gamer](https://www.pocketgamer.com/hitman-go/review/)).
- Lara Croft GO's designers wanted "puzzles to have fewer elements and be completely visible without scrolling," so players could "focus instead on solving for the correct sequence." It has 5 chapters and 40 levels. ([Wikipedia: Lara Croft Go](https://en.wikipedia.org/wiki/Lara_Croft_Go))
- **Lessons:** Use a one-line goal with a terse verb, a fully visible board, and optional secondary goals. Each chapter can feel like a physical box or diorama. Provide undo.

### 10. Monument Valley: every level has something to say
- Ken Wong: "We only added a level if we had something new to say." Each level was constrained to fit on one screen as "a work of art that you can hang on a wall," and the team designed for "'normal' people – to non-gamers." ([Game Developer](https://gamedeveloper.com/design/designing-the-surprise-mobile-game-hit-i-monument-valley-i-)) Levels were tested on strangers "without giving them any hints or help." ([Treehouse](https://blog.teamtreehouse.com/designer-profile-ken-wong-monument-valley))
- **Lessons:** Cut filler puzzles. Every puzzle needs a nameable lesson. Playtest silently.

### 11. Teaching by failure
- "Failure is a positive experience when it is possible for us to learn from it." The player must be able to retest quickly: "If you cannot affirm what you have just learnt then it is very likely that the experience will be forgotten." Showing the context of the failure (Valve showed players who killed them) increases acceptance. ([Robert Hale, Game Developer](https://www.gamedeveloper.com/design/failure-and-learning))
- Lichess Learn implements this directly. On a wrong move, some levels set `showFailureFollowUp`, and the opponent then plays a reply so the learner sees the consequence. The fail panel ("Puzzle failed! Retry") restarts on a single tap anywhere. ([lichess levelCtrl.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/levelCtrl.ts), [runView.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/run/runView.ts))
- **Lessons:** Show the refutation and its cause, then make the retry cost one tap.

### 12. Red herrings: when and how
- GMTK's "What Makes a Good Puzzle?" lists mechanics, a clear goal, "the catch" (an apparent contradiction), the revelation, and a presentation that is minimal, with almost nothing extraneous. Its line: "a good puzzle should make it obvious what you have to do but not obvious how." ([ResetEra thread](https://www.resetera.com/threads/what-makes-a-good-puzzle-game-makers-toolkit.29537/), [evolve-gaming summary](https://evolve-gaming.com/what-makes-a-good-puzzle/))
- Eric Harshbarger: "I never design with red herrings. The players will create their own." Junk content such as fake puzzles and irrelevant objects punishes exploration. ([Room Escape Artist](https://roomescapeartist.com/2019/02/10/red-herrings/))
- Chess problems give the right model for a good distractor, the **try**: "a move that almost solves a problem, but is defeated by a single Black defence." A **cook** is an unintended second solution, which "invalidates a problem." ([Glossary of chess problems](https://en.wikipedia.org/wiki/Glossary_of_chess_problems))
- **Lessons:** No distractors in intro puzzles. From the twist stage on, add a tempting try that a rule the player already knows refutes. The herring itself then teaches. Never include pieces that do nothing.

### Synthesis: principles for a wordless puzzle curriculum

| Principle | Sources |
|---|---|
| The first exposure is forced, simple and safe | Mario 1-1, Portal, Witness |
| One new idea per puzzle, broken down by checklisting | Portal, Baba, Monument Valley |
| Arc = introduce, develop, twist, conclude | Hayashida / kishotenketsu |
| Only intended solutions, mechanically verified; good cooks become variants | Portal, Baba, chess problems |
| Perfect information, legible threats, clear cause of failure | Into the Breach |
| Fast failure: show the refutation, retry in one tap | Hale, lichess, The Witness |
| Board fits the screen, few elements | Lara Croft GO, Monument Valley, Witness |
| Distractors only as rule-teaching tries, after the rule is learned | GMTK, Harshbarger, chess tries |
| Silent playtesting with strangers; insert bridges where people stall | Portal, Monument Valley, Baba |

---

## Part B: Puzzle-select and progress UX

### 1. Lichess Learn: the closest analog
This is from the source code, not marketing copy.
- **Structure:** 4 categories (Chess pieces, Fundamentals, Intermediate, Advanced) contain 18 stages and **110 levels**, from 3 to 9 per stage (Rook 6, King 3, Castling 9). ([list.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/stage/list.ts), stage files)
- **Text budget:** each stage card has a title and a five-word subtitle ("It moves in straight lines"). Each level has a one- or two-line goal: "Grab all the stars!", "Take the black pieces!", "Aim at the opponent's king in one move!" The first one or two levels of a stage use drawn arrows, which disappear afterward. ([rook.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/stage/rook.ts), [learn.xml](https://github.com/lichess-org/lila/blob/master/translation/source/learn.xml))
- **Map:** cards have three states: `future`, `ongoing` and `done`. The ongoing stage gets an "attention-effect" pulse and a progress ribbon ("3 / 6"). Done stages show 1 to 3 stars. **Every card is a link, including future ones**, so gating is soft and only visual. Inside a stage, a row of numbered dots also links to each level and shows its stars. ([view.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/view.ts), [progressView.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/progressView.ts))
- **Scoring:** a level's stars come from moves against a par (`nbMoves`), plus collected targets and captures ([score.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/score.ts)).
- **Flow:** on success the game shows a rotating congratulation ("Nailed it!", "Way to go!") and auto-advances after about 1.2 seconds unless the level needs a "Next" button. On failure it shows "Puzzle failed!" and a tap anywhere retries. ([levelCtrl.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/levelCtrl.ts), [congrats.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/run/congrats.ts))
- **Exit:** the map ends with "What next?" cards: register, practice, puzzles, videos, **play people**, **play the computer**. This is exactly the handoff the Muju home screen needs.

### 2. Lichess and Chess.com puzzle trainers: hints and mistakes
- **Lichess puzzles:** a wrong move is reverted after 300 ms with "Not the move! Try something else." The "Get a hint" and "View the solution" buttons appear only after a delay of 2 seconds (casual) or 4 seconds (rated), which discourages reflexive hint use. A hint highlights only the **piece** that should move, not where it goes. Using a hint is recorded. ([ctrl.ts](https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/ctrl.ts), [feedback.ts](https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/view/feedback.ts))
- **Chess.com:** crowns are 3 for a first-try solve, 2 for one mistake or a hint, and 1 for multiple problems. Puzzles are grouped into more than 30 themes. A hint taken before your first correct move earns no progress points. ([Chess.com: improve your tactics](https://www.chess.com/article/view/improve-your-tactics-with-puzzles), [support](https://support.chess.com/en/articles/8608686-how-do-puzzles-work))

### 3. Duolingo path: linear clarity and the cost of hard gating
- In 2022 the skill tree became a single path of units. Completed nodes turn gold, a floating button jumps back to your current position, each unit has a guidebook, review is built into the path, and an optional "Legendary" challenge follows completion. ([Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)) Advanced learners can tap "Jump here?" on a locked unit and pass a short test to unlock it ([Lingoly](https://lingoly.io/duolingo-jump-here/)).
- Von Ahn's rationale was to make it so "new users understood how to best use Duolingo." The backlash was about lost choice: "sometimes you just want to do some easy lessons because you're tired," and "It forces you down a learning path that Duolingo says is best for you." ([NBC News](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655), [PiunikaWeb](https://piunikaweb.com/2022/10/17/duolingo-app-update-with-path-ui-faces-backlash-from-users/))
- **Lessons:** Recommend a single order, but let players replay and skip freely.

### 4. Angry Birds and Cut the Rope: chapter grids, stars and star gates
- Both use an episode or box screen leading to a grid of levels, with 1 to 3 stars per level. Cut the Rope gates later boxes by total stars (Fabric Box: 30 stars on mobile, 20 on desktop; Foil Box: 80). ([Cut the Rope Wiki](https://cuttherope.fandom.com/wiki/Fabric_Box)) Angry Birds 2.0 unlocked every episode, and collecting all 3-star ratings in an episode awards a Golden Egg bonus ([Giant Bomb](https://www.giantbomb.com/wd/3030-30199), [Golden Eggs](https://angrybirdsatwork.fandom.com/wiki/Golden_Eggs)).
- One critique: when a level has one intended route, players rarely replay it after earning 3 stars ([Giant Bomb review](https://giantbomb.com/cut-the-rope/3030-32889/user-reviews/2200-17423/)). For a teaching curriculum that is fine. Stars should mark mastery, not drive replay.

### 5. Hitman GO: chapter boxes as dioramas
- Chapters are physical-looking game boxes, and the loading screens show pieces "packed away in familiar boardgame boxes." Stars from bonus objectives unlock the next box. ([Pocket Gamer](https://www.pocketgamer.com/hitman-go/review/), [Wikipedia](https://en.wikipedia.org/wiki/Hitman_Go))
- **Lessons:** Give each arc a visual identity (its element's colors and glyph, a miniature of its board). Avoid making star counts a hard gate in a beginner course.

### 6. Hints: tiered, delayed, never paywalled
- Professor Layton uses three escalating hints and then a "super hint" that nearly gives the answer ([Layton Wiki](https://layton.fandom.com/wiki/Hints)). Lichess shows the piece first, then the full solution, with both buttons delayed. Hitman GO and Lara Croft GO sell hints, which a teaching curriculum should not do.

### 7. Celebration and juice
- "Juice It or Lose It" (Jonasson and Purho, GDC Europe 2012) made a game feel transformed through feedback alone: particles, screen shake, pitch-rising sounds and ticking counters ([roblog summary](https://roblog.co.uk/2024/03/juicy-games/)). Lichess keeps its celebration short (rotating words and a sound) and auto-advances. The rule is to celebrate briefly and keep the flow moving.

### 8. Mobile ergonomics
- Hoober's 1,333 field observations: 49% of phone use is one-handed, 36% cradled, 15% two-handed. About 75% of interactions are thumb-driven, and the top corners are the hardest to reach. ([UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)) Apple's HIG minimum tap target is 44x44 pt, with about 8 pt between targets ([Deque](https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size)).
- **Lessons:** Put Next, Retry, Undo and Hint at the bottom. Keep the goal line at the top, read-only. Scale the board so the whole sub-board is visible without scrolling, following Lara Croft GO.

### Gating comparison

| Product | Gate | Skip allowed | Outcome |
|---|---|---|---|
| Lichess Learn | Visual only (future is dimmed, still clickable) | Yes | Clear order, no walls |
| Duolingo path | Hard, with a test-out escape hatch | Only via a test | Clarity, but a backlash over lost choice |
| Cut the Rope, Hitman GO | Star totals | Partly (paid in Hitman GO) | Drives replay, can wall players |
| Snakebird Primer, Baba, Witness | Clusters or parallel paths | Yes | Stuck players keep moving |

---

## Implications for Muju

**Teaching design**
1. **Checklist every mechanic before writing puzzles.** List its atomic facts, for example for mining: it happens at the end of Act even after moving or attacking; it takes min(Mining, reserve); reserves deplete; Lightning and Loş mine 0; arrivals mine. Each fact gets at least one puzzle that is unsolvable without it, and a puzzle with no fact on the checklist gets cut ("only add a level if we have something new to say").
2. **Build each arc with kishotenketsu, about 5 to 10 puzzles.** Introduce on a 3x3 or 4x4 board with one piece, one goal and no noise. Develop with more actions, more squares or two pieces. Twist with something that breaks the naive idea, such as a blocker, elemental disadvantage, Poṉ's speed 0, or a depleted square. Conclude with a puzzle that combines this arc with an earlier one, which doubles as interleaved review.
3. **Make the first exposure forced and safe, Mario 1-1 style.** For example, a single Muju on a lit square with the goal "Mine 3": the only thing to do is end the turn, and the payoff animates.
4. **Use the real Muju UI as the teacher, not the gold-dot onboarding.** The existing Show reach outline, the ☠ and ⚠ KO badges, the crystal lights, the action pips, and Undo do the job that arrows did in lichess.
5. **Exploit what the badges don't show.** The ☠ badge never sums two attackers, so a combined-attack twist puzzle has no skull and two attackers can still kill. The UI's honest limits become lessons.
6. **Write goals as numbers and icons, plus one verb.** Examples: "Mine 12 this turn", "Capture the Hi this turn", "Occupy the enemy home in 2 turns", "Eliminate all enemies", "Keep your Honō". Keep the grammar consistent so players learn the sentence frames once.
7. **Keep perfect information honest.** Show every relevant piece, reserve, bank, pending summon and upkeep bill. Into the Breach's test applies: when the player fails, it must be "very clear how or why."
8. **Show the refutation on failure.** In multi-turn puzzles, let the engine or a script play the opponent's punishing reply, for example killing the home invader. In one-turn puzzles, flag failure as soon as the goal becomes unreachable (actions spent, Cleave chain ended) instead of waiting for End Turn.
9. **Use a solver to block cooks.** Muju's AI engine can enumerate four-action turns on small boards to prove that each puzzle is solvable, that the intended line is the only one in intro puzzles, and that each designed try fails. Promote a cook you like into a variant puzzle, as Baba did.
10. **Use red herrings only as tries, and only from the twist stage on.** Each one should be a tempting legal line that a known rule refutes: Fire chipping Water at −1 ends the chain, an invader sits where the defender's reach covers it, or a promotion triggers upkeep you cannot pay. Never add pieces that do nothing.
11. **Tune piece counts with care.** One extra defender flips a puzzle from fun to impossible. Playtest silently with newcomers, and insert a bridging puzzle wherever several people stall (Valve's fix for chamber 08).
12. **Check goals at the correct phase of the turn.** Kills are checked during Act, mining after END_ACTION_PHASE, promotions and summons at the end of Prepare, home occupation at your next turn start, after the defender's reply. The puzzle framework needs a goal-timing field per goal type.
13. **Pin each puzzle to a rules revision.** For example, unlimited Cleave arrived with `muju-phasing-4`. The solver should re-verify the whole catalog in CI whenever the rules change.
14. **Size the curriculum.** Lichess teaches chess in 110 levels across 18 stages of 3 to 9 each. About 15 to 20 Muju arcs of 5 to 10 puzzles lands in the requested 60 to 200.

**Puzzle-select UI**
15. **Home entry:** "Learn to Play" as the first item, subtitle "N puzzles", which becomes "23 / 120" once started. Tapping it resumes at the next unsolved puzzle; a secondary tap opens the map.
16. **Map:** a vertical scroll of arc cards, each with an element or mechanic glyph, a one- or two-word name, and an "x / y" count. Inside an arc, numbered tiles show a check or stars. The current arc and current puzzle get a pulse.
17. **Gating is soft.** Everything is tappable, and future arcs are dimmed but not locked. Recommend an order without enforcing it, avoiding Duolingo's backlash and following Snakebird Primer's "jump over for a break."
18. **Use one completion mark plus an optional mastery mark.** For example, solved, then "clean" for no hint and no reset. Never gate on stars.
19. **Puzzle player layout:** the goal line at the top. The full sub-board fits the screen with no scrolling. A bottom thumb-zone bar holds Reset, Undo (the native within-turn undo), Hint and End Turn, all at least 44 pt.
20. **Hints are tiered, delayed and free.** They appear after a few seconds: first the piece to use is highlighted, then the target square or first move, then the full solution plays as an animation. A hint costs only the mastery mark, never completion.
21. **Success flow:** a celebration of about 1 to 1.5 seconds using existing effects (crystal burst, kill effects, sound), then auto-advance or a large Next button at the bottom. Finishing an arc shows a short arc-complete card and returns to the map with the next arc pulsing.
22. **Failure flow:** show the consequence, then make retry a one-tap anywhere action, as in lichess. No text beyond a short status word, and no lives or penalties.
23. **End of the course:** a "What next?" panel with Play the AI and Play online, mirroring the home order and lichess's exit cards.
24. **Persistence:** store solved ids, marks and the last position per puzzle id and rules revision, locally and in the account when signed in. Never reuse the onboarding scenario ids or content.

## Sources
- [Wikipedia: World 1-1](https://en.wikipedia.org/wiki/World_1-1)
- [BGR / Eurogamer on World 1-1](https://www.bgr.com/general/super-mario-bros-world-1-1-design/)
- [MCV: Miyamoto video](https://www.mcvuk.com/development-news/video-miyamoto-shares-his-level-design-secrets/)
- [Blake Crosley on Miyamoto](https://blakecrosley.com/blog/design-philosophy-shigeru-miyamoto)
- [Portal developer commentary](https://theportalwiki.com/wiki/Portal_developer_commentary)
- [Game Informer: Portal 2 test chambers](https://gameinformer.com/b/features/archive/2010/03/17/thinking-with-portals-making-a-test-chamber)
- [Room Escape Artist: The Witness](https://roomescapeartist.com/2018/05/18/the-witness-review/)
- [Engadget: The Witness](https://www.engadget.com/2014-06-12-the-witness-and-the-joy-of-intuition.html)
- [GMTK: How Jonathan Blow Designs a Puzzle](https://amara.org/v/C3BFd)
- [MCV: kishotenketsu](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps)
- [MCV: When We Made Baba Is You](https://mcvuk.com/when-we-made-baba-is-you/)
- [Gamereactor: Baba Is You](https://www.gamereactor.eu/baba-is-you-review/)
- [SCMP: Baba Is You](https://yp.scmp.com/entertainment/tech-and-games/article/112792/%E2%80%98baba-you%E2%80%99-game-review-logic-fun-quirky-puzzler-nintendo)
- [TouchArcade: Snakebird Primer](https://toucharcade.com/2019/03/01/toucharcade-game-of-the-week-snakebird-primer/)
- [gurugamer: Snakebird Primer](https://gurugamer.com/mobile-games/snakebird-primer-is-an-easier-version-of-snakebird-coming-out-next-week-1508/amp)
- [wurb.com: Stephen's Sausage Roll](https://www.wurb.com/stack/?p=3136)
- [Slant: Stephen's Sausage Roll](https://www.slantmagazine.com/games/stephens-sausage-roll/)
- [Game Developer: Road to the IGF, Into the Breach](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-)
- [Nintendo Life: Into the Breach](https://nintendolife.com/reviews/switch-eshop/into_the_breach)
- [Game Informer: Into the Breach tips](https://www.gameinformer.com/b/features/archive/2018/02/27/23-tips-to-help-you-dominate-into-the-breach.aspx)
- [Gamepressure: Into the Breach guide](https://www.gamepressure.com/into-the-breach/beginners-guide-tips/zfaa76)
- [Wikipedia: Hitman Go](https://en.wikipedia.org/wiki/Hitman_Go)
- [Wikipedia: Lara Croft Go](https://en.wikipedia.org/wiki/Lara_Croft_Go)
- [Game-Wisdom: Hitman GO](https://game-wisdom.com/analysis/hitman-go)
- [Pocket Gamer: Hitman GO](https://www.pocketgamer.com/hitman-go/review/)
- [Game Developer: Monument Valley](https://gamedeveloper.com/design/designing-the-surprise-mobile-game-hit-i-monument-valley-i-)
- [Treehouse: Ken Wong](https://blog.teamtreehouse.com/designer-profile-ken-wong-monument-valley)
- [Game Developer: Failure and Learning](https://www.gamedeveloper.com/design/failure-and-learning)
- [ResetEra: What Makes a Good Puzzle](https://www.resetera.com/threads/what-makes-a-good-puzzle-game-makers-toolkit.29537/)
- [evolve-gaming: What Makes a Good Puzzle](https://evolve-gaming.com/what-makes-a-good-puzzle/)
- [Room Escape Artist: Red Herrings](https://roomescapeartist.com/2019/02/10/red-herrings/)
- [Glossary of chess problems](https://en.wikipedia.org/wiki/Glossary_of_chess_problems)
- [lichess Learn source](https://github.com/lichess-org/lila/tree/master/ui/learn/src)
- [lichess puzzle ctrl.ts](https://github.com/lichess-org/lila/blob/master/ui/puzzle/src/ctrl.ts)
- [lichess learn.xml](https://github.com/lichess-org/lila/blob/master/translation/source/learn.xml)
- [Chess.com: improve your tactics](https://www.chess.com/article/view/improve-your-tactics-with-puzzles)
- [Chess.com: how do puzzles work](https://support.chess.com/en/articles/8608686-how-do-puzzles-work)
- [Duolingo blog: new home screen](https://blog.duolingo.com/new-duolingo-home-screen-design)
- [Lingoly: Jump Here](https://lingoly.io/duolingo-jump-here/)
- [NBC News: Duolingo redesign](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655)
- [PiunikaWeb: Duolingo backlash](https://piunikaweb.com/2022/10/17/duolingo-app-update-with-path-ui-faces-backlash-from-users/)
- [Cut the Rope Wiki: Fabric Box](https://cuttherope.fandom.com/wiki/Fabric_Box)
- [Giant Bomb: Angry Birds](https://www.giantbomb.com/wd/3030-30199)
- [Golden Eggs](https://angrybirdsatwork.fandom.com/wiki/Golden_Eggs)
- [Giant Bomb: Cut the Rope review](https://giantbomb.com/cut-the-rope/3030-32889/user-reviews/2200-17423/)
- [Layton Wiki: Hints](https://layton.fandom.com/wiki/Hints)
- [roblog: Juice it or lose it](https://roblog.co.uk/2024/03/juicy-games/)
- [UXmatters: Hoober](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
- [Deque: touch target size](https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size)

Local Muju files consulted: /Users/ashkie/src/deevgames-puzzles/muju/SPEC.md, /Users/ashkie/src/deevgames-puzzles/muju/src/onboarding/PuzzleList.tsx, /Users/ashkie/src/deevgames-puzzles/muju/src/onboarding/scenarios.ts, /Users/ashkie/src/deevgames-puzzles/muju/academy/CURRICULUM-AND-BATCHES.md

