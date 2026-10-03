# Learn to Play: a 174-puzzle course (2026-10-03)

No rule change and no rules-revision bump. The course is browser-only. The
wording change below also reaches the MCP host's rules and tool text, without
changing any behavior or field. The Academy is unchanged. The design is in
[`../learn/CURRICULUM.md`](../learn/CURRICULUM.md), the craft in
[`../learn/AUTHORING.md`](../learn/AUTHORING.md), and the research behind both in
[`../learn/research/`](../learn/research/).

## What changed

**Home screen.** **Learn to Play** is the first item, with the subtitle
"174 puzzles" (or "k / 174 puzzles" once started). Play vs AI and Play online
follow, then the collapsed **Other ways to play**, which still includes
**Replay tutorial**. The old **Puzzles** button and `PuzzleList`, which only
replayed the tutorial's three scenarios, are gone. The tutorial itself is
unchanged and still ends on this screen.

**The course.** 174 puzzles in 22 arcs and six parts. Each puzzle is a small
board with one goal line ("Mine 6 crystals this turn", "Capture the Sjór this
turn", "Within 2 turns, occupy the enemy home until your next turn", "Start
summoning a Hi on the flag this turn", "Keep all your pieces safe", "Don't
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
| Stopping summons | 106–115 | Their summon lands only if its square is empty and a clear rectangle still covers it: stand on the landing square, step into the rectangle, kill the only anchor (a wound is not enough), kill two anchors, two pieces in two rectangles, one piece in the overlap, a piece on their home stops every summon, plug both doors when they sit on their home |
| Promotion | 116–123 | 4 then 8 crystals in Prepare; once per piece per turn; income funds it; promote for a threshold or for defense; choose which piece; an arrival may promote |
| Upkeep | 124–130 | Rent 1 / 2 after mining; tier 1 is free and always kept; the keep panel; a promotion's rent starts next turn; the bank after rent |
| Elimination | 131–136 | The last capture wins at once; Cleave sweeps; count and assign; a pending summon is not a piece |
| Invasion | 137–146 | `#` when their whole army cannot remove you; pick the invader they cannot hurt; plug both doors; clear the home; remove the rescuer; survive your own upkeep; the home's crystals pay rent; fortify in Prepare; a two-turn approach |
| Defense | 147–154 | Remove the invader now; two doors, two attackers; make room; stop the runner; the front door before a juicy capture; plug the doors; a counter-invasion does not save you |
| Mixed review | 155–168 | Unlabeled mixes: win now? capture? safe (including your own rent and pending summons)? earn? |
| Final exam | 169–174 | 10×10 positions from the real map |

**Later additions the same day.**

- **Stopping summons.** A tenth arc of the economy part, with a new goal kind
  (`deny`). It is judged right after your hand-over, when the enemy's pending
  summons land or are refunded. Goal lines read "Stop the enemy Hi from landing",
  and the enemy's landing squares get a dashed red ring.
- **Home puzzles play the defender's turn.** A home checkmate ends a real game
  at once. In a home puzzle, the defender still takes its turn, so you see it
  fail. It goes after your invader (move-9's Sjór steps up next to the Hi), and
  the win is judged when your occupation stands at your next turn start. The
  checkmate moment is quiet, so there is one celebration. Other goals that end by
  `#` keep the real rule.
- **One-press End turn.** When Prepare would offer nothing, the Act button reads
  "End turn" and hands over in one press. Before the economy arcs (homes hidden)
  there is no shop and no promotion, so the turn always ends in one press;
  from Summoning on, "Mine & prepare" appears exactly when Prepare has a choice.
  The solver agrees: puzzles without homes never summon or promote.
- **The home notice** in normal play now speaks to the human seat (vs AI,
  online, puzzles) rather than to whoever is moving. During the AI's turn it no
  longer tells you to "clear E5 this turn".
- **Proof fixes:**
  - an enemy that releases its last pieces at its own upkeep has lost;
  - invade-3 and invade-8 bank Black's rent, so Black no longer loses at its own
    upkeep whatever you play;
  - a home goal's own win must be a real home win;
  - lines already lost at the hand-over need no live refutation.

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
174 puzzles by tapping the real board in Chrome, using the solver for later
turns from the live position.

**Small changes to the shared game screen.** The home-occupation notice now
respects `victoryRule`, and the attack preview no longer shows NaN for a
Speed-0 piece attacking in place.

## Wording

Owner decision, 2026-10-03. Two actions each have two moments, and every string
a player reads (in the browser or over MCP) now keeps them apart.

- **Summoning.** Committing a summon in Prepare only starts it. The piece
  arrives at your next turn start if its square is still empty and inside a
  clear rectangle; otherwise it is refunded. The commitment is "start
  summoning": the goal line "Start summoning a Hi on the flag this turn", shop
  buttons named "Start summoning Hi · 3 crystals", the puzzle hint "Hint: start
  summoning a piece.", the replay caption "Started summoning Hi at A1", and the
  AI turn recap "Started summoning a unit at (x, y)" ("1 summon started"). The
  arrival is "successfully summon", "arrives" or "lands", and arrival records
  say "arrived" ("White’s summons · 1 arrived"). The bare verb "summon" (and
  "summonable") is gone from player text; nouns such as "pending summon" and
  "summon commitments" stay. The Prepare footer label "Summon & promote" is
  now "Prepare", because any longer wording clipped End turn at 320 px. The
  Prepare panel title "Place & upgrade" is also "Prepare", and observers read
  "White is preparing (promotions and summon commitments)" instead of
  "placing and promoting".
- **Home.** Stepping onto the enemy home only starts occupying it. The win is
  occupying it until your next turn: "Occupy the enemy home until your next
  turn", the notice "Occupy J10 until your next turn", and the result "You
  occupied the enemy home until your next turn!" Checkmate text says the
  invader "cannot be removed before its owner’s next turn".

This covers the How to play deck, MICRO MUJU's rules, the shop, the arrival
status, the keep panel, the home notice and victory screen, the Learn hint,
the tutorial's narration (stepping onto the home, then checkmate), the AI turn
recap, the online agent prompt, `muju_rules` (`victory` and `checkmate`, for
both the full game and MICRO MUJU), the `muju_play` description, three
checkmate-analysis reasons, SPEC.md §2, §5.2 and §9 (which now defines home
checkmate explicitly), the agent skill and the MCP TAPs.
Machine-readable output is unchanged: `victoryReason` values,
`lastSummoning.summoned`, `pendingSummons`, enum values and ids. Dated records
and the Academy keep their words. The Academy narration never says "summon",
and its home lesson already separates arriving from surviving ("Arrive.
Survive."), so no Academy follow-up is needed.

## How it was made

The research and design are summarized in CURRICULUM.md. Process:

1. Four research reports: chess, shogi and Go curricula; wordless teaching and
   puzzle-select UX; the Academy's concept inventory.
2. One author per arc, then a reviewer per part.
3. A whole-course review, a code review and a browser playtest.
4. Every fix proved again.

## Content DAG

`python3 tools/muju-content-dag.py plan --kind ui`, plus `--kind mcp` for the
wording change:

| Node | Disposition |
|---|---|
| browser-ui | Changed: mode screen, Learn map and puzzle screen, GameView puzzle seam, `useGameState` options, and the wording above. Verified by the unit, proof and e2e results below at phone and desktop sizes. |
| mcp-tools | Changed, wording only: `muju_rules` `victory` and `checkmate` (full game and MICRO MUJU), the `muju_play` description and three `checkmate` analysis reasons. No tool, schema, field or behavior changed. Verified by both type checks and the server tests in the vitest run below. |
| agent-guides | Changed: `public/skills/muju-hono-irumbu/SKILL.md` (three phrases) and one row of `docs/MCP_TOOL_TAPS.md`. The retired `muju-hono-tanka` copy keeps its old text. Not yet compared against a live host. |
| academy-lessons, academy-audio, academy-video, academy-package, academy-deploy | Verified unchanged. No rule, stat or taught fact changed, and the lessons show no mode screen. |
| advantage-explorer | Changed: a wording-only transition in two hashed files (the `rules` text in `server/observation.ts` and the replay caption in `src/game/replay.ts`), with no engine or rules change. The owner approved the audit, recorded in [`2026-10-03-explorer-wording-audit.md`](2026-10-03-explorer-wording-audit.md) and `server/explorer/compatibility.ts`. Saved experiments continue. |
| game-validation | See Verification. |
| static-package | Built and checked: GitHub run 37132988112 on merge `5790adc2` passed the build, the rules, multiplayer and MCP checks, and the browser and phone/tablet gameplay smoke. |
| static-deploy | Not published. The workflow skips publishing without a Cloudflare credential, and Pages releases are a manual local Wrangler step. The Pages hub links Muju to the Render host (live, below). Only the bundled mirror at `deevgames.pages.dev/muju/` still serves the previous build (`index-BgBPKubz.js`). |
| server-package, server-deploy | Changed and live. Render service `srv-dahbp4ht0dsc73fdqn10` auto-deployed merge `5790adc2`. Evidence is in the Release section. |
| release-verification | Done; see the Release section. |

## Verification

- `node --import tsx tools/learn-check.ts`: 174 / 174 puzzles proved, with
  every first-turn scan. `--live`: 148 of the 151 one-turn puzzles judge every
  position after one or two actions within the live budget. In safety-6,
  review-13 and exam-5, some positions are over budget; there the refutation is
  shown at the hand-over instead of at once.
- `npx vitest run` (the whole repository): everything passes, including `tests/server/explorer-provenance.test.ts` after the audited transition.
- `npx tsc --noEmit` is clean. `npx vite build` puts Learn in its own lazy chunk
  (38.7 kB JS, 15.7 kB CSS). Main JS went from 587.5 to 552.8 kB.
- Playwright against the dev server: `e2e/learn-catalog.spec.ts` (all 174
  puzzles solved by tapping, including the defender's turn in home puzzles),
  `e2e/learn.spec.ts` and `e2e/onboarding.spec.ts`: everything passes except
  the onboarding "gold dot" test, which fails at the same rate on the unmodified
  base commit.
- The wording change: both `tsc` checks are clean. The explorer provenance tests
  pass after the audited transition (see advantage-explorer above). Playwright against the dev server
  (learn, learn-catalog, onboarding, mobile, phasing, sounds, upkeep-undo,
  home-checkmate) passed every case that runs without the room API, except
  the onboarding "gold dot" test noted above. The room cases (phone-playback,
  the online phasing, sounds and MCP checkmate cases) were not run. Screenshots
  at 320×568, 375×667, 390×844, 844×390 and 1280×800 checked the shop, the
  Prepare footer and the How to play deck.
- A browser playtest of 38 puzzles at 390×844, 1280×800, 844×390 and 320×568.
  Its findings were fixed, except these, which are left for later: board shift
  when the income and replay rows appear, wordy shop text, the keep panel at
  844×390, and no markers for enemy moves.

## Release (2026-10-03)

- **Merge:** PR #52 was merged as `5790adc2`. Its tree is identical to `e3e97bbb`.
- **Node/MCP host (Render):** the service auto-deployed master. It briefly
  returned a 502 while swapping instances, then served the new build.
  - `/api/muju/health` returns ok.
  - `muju_rules` serves the new victory text ("occupy the enemy home until your
    next own turn starts").
  - `/SKILL.md` is byte-identical to the repository.
  - `tools/list` returns all 16 tools.
  - `https://deevgames-muju.onrender.com/muju/` and
    `https://deevgames.ashkie.com/muju/` (Render behind Cloudflare) both serve
    `index-ba0RO8Es.js`. That bundle contains the Stopping summons arc
    (`deny-10`) and "Start summoning". Its lazy chunk `LearnRoot-Dkm9VTi6.js`
    contains "Successfully summon", "from landing" and "Start occupying the
    enemy home".
  - A disposable room (`d45aff35…`, "release smoke 2026-10-03") was created,
    joined, and accepted White's Mine & prepare (revision 2, both seats ready).
- **Static site (Cloudflare Pages):** see static-deploy above. GitHub run
  37132988112 passed every check. Publishing awaits the manual Wrangler step.

