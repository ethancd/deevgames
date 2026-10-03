# Learn to Play: a 164-puzzle course (2026-10-03)

Browser site only. No rule change, no rules-revision bump, and no change to the
server, MCP or Academy. The design is in
[`../learn/CURRICULUM.md`](../learn/CURRICULUM.md), the craft in
[`../learn/AUTHORING.md`](../learn/AUTHORING.md), and the research behind both in
[`../learn/research/`](../learn/research/).

## What changed

**Home screen.** **Learn to Play** is the first item, with the subtitle
"164 puzzles" (or "k / 164 puzzles" once started). Play vs AI and Play online
follow, then the collapsed **Other ways to play**, which still includes
**Replay tutorial**. The old **Puzzles** button and `PuzzleList`, which only
replayed the tutorial's three scenarios, are gone. The tutorial itself is
unchanged and still ends on this screen.

**The course.** 164 puzzles in 21 arcs and six parts. Each puzzle is a small
board with one goal line ("Mine 6 crystals this turn", "Capture the Sjór this
turn", "Occupy the enemy home in 2 turns", "Keep all your pieces safe", "Don't
let them win"). It is played with the real game controls, and it is judged on
the board, not against a move list.

| Arc | Puzzles | What it teaches |
|---|---|---|
| Moving | 1–9 | Tap and move; Speed is squares per action; one trip rounds up once; pieces (friends too) block; four actions shared; Poṉ cannot move; a first undefended walk into the enemy home |
| Mining | 10–18 | Mine & prepare; every piece mines the square it ends on; min(Mining, reserve); Mining 0; match buckets to squares; reserves run dry |
| Attacking | 19–26 | Adjacent attack for one action; ATK ≥ DEF removes; move then attack; trip plus hit must fit; ATK 0; DEF matters; no zone of control |
| Elements | 27–36 | The three pairs; +1 / −1 on attack only; same pair is neutral; defense never changes; assign each attacker to the target it beats |
| Teamwork | 37–43 | Damage adds up in a turn; finish a wounded piece; count before swinging; damage heals at the owner's turn start; zero-damage hits |
| Cleave | 44–51 | A kill unlocks another attack; move between kills; a survivor closes the chain; chip first and let the chainer finish; every attack costs an action; a teammate's kill does not reopen a chain |
| Safety | 52–59 | The enemy's trip plus hit; edges and corners; a friend as a wall; capture the threat; two threats; hit and run; save the valuable piece |
| Fire | 60–65 | Hi / Honō / Kagari; +1 on Plant and Metal; only a Kagari one-shots an Irumbu; mines 1 at every tier; fragile, so hit and run |
| Lightning | 66–71 | Radi / Umeme / Kimbunga; Speed buys travel, never damage; 0 against Water and Shadow; Mining 0 |
| Water | 72–77 | Sjór / Straumr / Ægirinn; puts out Fire and Lightning; the defense ladder; steady mining under fire |
| Shadow | 78–83 | Loş / Gölge / Karanlık; DEF 2 at every tier, so a Poṉ removes a Karanlık; Mining 0 / 1 / 2 |
| Plant | 84–89 | Muju / Mallki / Sach'akuna; Mining 3 / 5 / 8, big buckets on big squares; finishes Water and Shadow; loses to Fire |
| Metal | 90–95 | Poṉ / Veḷḷi / Irumbu; Mining 3 / 4 / 5; tiers 1–2 do 0 to Fire and Lightning; hit and stand |
| Summoning | 96–105 | Prepare after Mine & prepare; tier 1 only at 3 / 4 / 5; the rectangle from your home to any piece; an enemy inside blocks it; clear, then buy; income pays; the summon lands next turn or refunds; arrivals act at once; an enemy on your home blocks everything |
| Promotion | 106–113 | 4 then 8 crystals in Prepare; once per piece per turn; income funds it; promote for a threshold or for defense; choose which piece; an arrival may promote |
| Upkeep | 114–120 | Rent 1 / 2 after mining; tier 1 is free and always kept; the keep panel; a promotion's rent starts next turn; the bank after rent |
| Elimination | 121–126 | The last capture wins at once; Cleave sweeps; count and assign; a pending summon is not a piece |
| Invasion | 127–136 | `#` when their whole army cannot remove you; pick the invader they cannot hurt; plug both doors; clear the home; remove the rescuer; survive your own upkeep; the home's crystals pay rent; fortify in Prepare; a two-turn approach |
| Defense | 137–144 | Remove the invader now; two doors, two attackers; make room; stop the runner; the front door before a juicy capture; plug the doors; a counter-invasion does not save you |
| Mixed review | 145–158 | Unlabeled mixes: win now? capture? safe (including your own rent and pending summons)? earn? |
| Final exam | 159–164 | 10×10 positions from the real map |

**The Learn screens** (`src/learn/`):

- **The map** groups arcs by part. Each arc shows numbered tiles, a check on each
  solved one, and a pulse on the recommended next one. Nothing is locked.
  Continue opens the first unsolved puzzle, and Reset progress asks first.
- **The puzzle screen** is the real `GameView` with a `puzzle` seam: the goal
  line (with live progress for mining goals), flags on goal squares, rings on
  pieces to capture or protect, a glow on the enemy home for home goals,
  Retry, Hint (the piece or control to use first, then "Show me"), and success
  and failure cards.
- **Judging.** Every state is judged with `evaluate`. On the player's final
  turn, a line that can no longer win is flagged at once, with Undo and Retry.
  When the enemy replies, it plays the reply that refutes the player's line,
  through the same path the AI uses, so the failure is shown on the board. The
  solver runs in a module worker with node budgets.
- **Progress** is stored in `localStorage['muju:learn:v1']`. Puzzles never
  touch the saved match: `useGameState` gained `initialState` and
  `persist: false`.
- **Deep links:** `/muju/?learn=1` opens the map and `/muju/?learn=<id>` opens
  a puzzle. Both skip the first-visit gate, and browser Back works.

**Proofs.** `src/learn/verify.ts` proves every puzzle against the live rules:

- it builds, the goal is undecided at the start, and idling does not solve it;
- the author's line wins, every recorded try is a dead end, and the live reply
  finds each try's refutation within the app's budget;
- the solver agrees (∃ your turn ∀ replies ∃ your next turn);
- a two-turn puzzle cannot be done in one;
- no first turn wins the game while failing the puzzle, or wins a home or
  eliminate goal by the other route.

`tests/learn/catalog.test.ts` runs all of this in CI. `tools/learn-check.ts` is
the author's tool (`--board`, `--live`). `e2e/learn-catalog.spec.ts` solves all
164 puzzles by tapping the real board in Chrome, using the solver for later
turns from the live position.

**Small changes to the shared game screen.** The home-occupation notice now
respects `victoryRule`, and the attack preview no longer shows NaN for a
Speed-0 piece attacking in place.

## How it was made

The research and design are summarized in CURRICULUM.md. Process:

1. Four research reports: chess, shogi and Go curricula; wordless teaching and
   puzzle-select UX; the Academy's concept inventory.
2. One author per arc, then a reviewer per part.
3. A whole-course review, a code review and a browser playtest.
4. Every fix proved again.

## Content DAG

`python3 tools/muju-content-dag.py plan --kind ui`:

| Node | Disposition |
|---|---|
| browser-ui | Changed: mode screen, Learn map and puzzle screen, GameView puzzle seam, `useGameState` options. Verified by the unit, proof and e2e results below at phone and desktop sizes. |
| academy-lessons, academy-audio, academy-video, academy-package, academy-deploy | Verified unchanged. No rule, stat or taught fact changed, and the lessons show no mode screen. |
| advantage-explorer | Verified unchanged. No engine or rules input changed (`src/game` and `src/ai` are untouched). |
| game-validation | See Verification. |
| static-package, static-deploy | Not yet released from this branch. |
| server-package, server-deploy | No server code changed. |
| release-verification | Pending release. |

## Verification

- `node --import tsx tools/learn-check.ts`: 164 / 164 puzzles proved, with
  every first-turn scan. `--live`: 148 of the 151 one-turn puzzles judge every
  position after one or two actions within the live budget. In safety-6,
  review-13 and exam-5, some positions are over budget; there the refutation is
  shown at the hand-over instead of at once.
- `npx vitest run` (the whole repository): 257 files, 3715 tests passed, 17 skipped.
- `npx tsc --noEmit` is clean. `npx vite build` puts Learn in its own lazy chunk
  (38.7 kB JS, 15.7 kB CSS). Main JS went from 587.5 to 552.8 kB.
- Playwright against the dev server: `e2e/learn-catalog.spec.ts` (all 164
  puzzles solved by tapping), `e2e/learn.spec.ts` and `e2e/onboarding.spec.ts`
  gave 202 passed and 1 failed. The failure is the onboarding "gold dot" test,
  which fails at the same rate on the unmodified base commit.
- A browser playtest of 38 puzzles at 390×844, 1280×800, 844×390 and 320×568.
  Its findings were fixed, except these, which are left for later: board shift
  when the income and replay rows appear, wordy shop text, the keep panel at
  844×390, and no markers for enemy moves.
