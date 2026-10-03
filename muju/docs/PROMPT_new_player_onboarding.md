# New player onboarding: plan and implementation prompt

**Status:** built 2026-10-02 on `claude/muju-onboarding`; see [the change record](changes/2026-10-02-new-player-onboarding.md).
Revised the same day after review: three pieces in all (white Muju, black Honō, white Irumbu), the
player plays Black in puzzle 2 (overriding decision 1 below), no words on screen except
"Skip Tutorial →" and the three names, and "Other ways to play" collapses the secondary modes.

Written 2026-10-02 from a read-only survey of `muju/` at commit `c6ce6342`. Part 1 is the
plan (what to build and why, with the decisions already made). Part 2 is the prompt to hand
to an implementing session. Nothing here has been built.

---

## Part 1: Plan

### Goal

A first-time visitor to `/muju/` plays three wordless mini-puzzles in under a minute, learns
the three verbs of the game (move and collect, attack, invade the home), sees the three title
words appear one by one, and lands on a three-button screen: play vs AI, play online, play
puzzles. Returning visitors never see it again unless they ask.

### What exists today (facts that shape the design)

- Client is React 19 + TypeScript + Vite 7 + Tailwind 4. No router: `src/App.tsx` branches on
  `window.location.pathname` and shows `ModeSelect` when there is no game config.
- The board is a DOM CSS grid (`src/components/Board.tsx`, `Cell.tsx`) with inline SVG pieces
  (`Unit.tsx`, `UnitArtwork.tsx`) and SVG crystal lights (`CrystalLights.tsx`). Grid size comes
  from `--board-size` and `boardSize(board) = cells.length`, and the engine is size-aware
  (MICRO MUJU ships a 6×6). A 3×3 board renders and plays with no engine change.
- There is no scenario or puzzle format. A position is a hand-built `GameState`;
  `createMicroGameState` in `src/game/micro.ts` is the template. `applyAction` in
  `src/ai/simulate.ts` is the pure, validated way to play a move.
- There are no move tweens, hit or kill effects, particles or confetti. The only keyframe is
  `summon-doomed-drift`. `prefers-reduced-motion` disables all animation.
- Sound effects are synthesized in Web Audio (`src/sound/effects.ts`): move, attack, capture,
  phase, arrive, promote, turnEnd, turnStart, yourTurn, opponentAction. No audio files are
  loaded. Audio unlocks on the first gesture.
- Persistence is all localStorage with a `muju:` prefix and `:v1` suffix. No cookies, no
  "seen tutorial" flag.
- Attacks in the real UI require a text "Confirm attack" button. `useGameState` autosaves to
  `elemental-tactics-save`, so the tutorial must not use it.
- Twenty Playwright specs and `tools/smoke-site.cjs` open `/muju/` and click mode buttons by
  name. A first-visit overlay breaks them unless they seed the "seen" flag.

### Rule facts the puzzles are built on

| Piece | id | ATK | DEF | SPD | MINE |
|---|---|---|---|---|---|
| Muju | plant_1 | 0 | 3 | 1 | 3 |
| Honō | fire_2 | 3 | 1 | 2 | 1 |
| Irumbu | metal_3 | 2 | 5 | 2 | 5 |
| Hi | fire_1 | 2 | 1 | 2 | 1 |

- Four shared actions per turn. Moving costs `ceil(squares / speed)` actions, orthogonal only,
  BFS around blockers. Attack costs one action and needs orthogonal adjacency.
- Fire and Lightning beat Plant and Metal, which beat Water and Shadow, which beat Fire and
  Lightning. Advantage is +1 ATK, disadvantage is −1 ATK. Attack ≥ current DEF eliminates.
- Honō attacking Muju is fire on plant: 3 + 1 = 4 ≥ 3, a one-hit kill and the "vulnerable" case.
- Home occupation wins at the start of the invader's next turn. Home checkmate (`#`) is proved
  by `resolveHomeCheckmate` in `src/game/homeCheckmate.ts` when the defender has no rescue.
- White's home is (0,0), drawn top-left by `Board.tsx`. Black's home is the far corner.

### The three puzzles

All three are played as White. The player's active piece is the only thing that glows.

**Puzzle 1, "Muju": move and collect.** 3×3 board. White Muju on White's home corner (0,0).
Eight crystals on the opposite corner (2,2); every other square holds zero. Muju has speed 1,
so the four-square trip costs exactly four actions: one click on the far corner uses the whole
turn. On arrival, the Muju mines three of the eight lights (the real mining rule) and the word
**Muju** appears. Home markers are hidden on this board so the corner reads as "crystals", not
"enemy home".

**Puzzle 2, "Honō": attack.** Zoom out to 6×6. A white Honō at (1,1). A black Muju at (4,4),
six squares away. Honō has speed 2: five squares to adjacency is three actions, the attack is
the fourth. One click on the Honō, one click on the black Muju; the tutorial plans the approach
with `findAttackApproach`, hops two squares per beat, then strikes. Fire on plant is the
vulnerable case, so this is the biggest kill effect in the game. The word **Honō** appears.

**Puzzle 3, "Irumbu": invade.** Zoom out to the real 10×10. A white Irumbu at (9,1), eight
squares straight down the J file from Black's home at (9,9). Speed 2 means four moves of two:
the entire turn, barely. A black Muju sits at (8,9) beside the home (a visible but helpless
defender, ATK 0) and a black Hi at (2,8), too far to reach the invader's square and too weak to
kill DEF 5 even if it could. Black's bank is 0 so nothing can be summoned. After the fourth
hop lands on the home, the tutorial runs the real checkmate prover; on `#` it fires the biggest
celebration, and the word **Irumbu** appears. The three words then slide together into the
title **Muju Hono Irumbu** (ASCII `Hono` in the title, macron on the piece, per SPEC §7) and
the screen fades to the end screen.

Geometry is enforced by unit tests that compute the costs from the live catalogue, so a future
stat change that breaks a puzzle fails CI instead of shipping a broken tutorial.

### Wordless guidance

- The active piece pulses (soft ring plus a slow bob). After about two seconds idle, a ghost
  pointer taps it. Selecting it plays a soft chime and lights the path dots in sequence toward
  the target, which pulses in gold. Idle again, the ghost pointer taps the target.
- Wrong tap: the tapped thing shakes slightly, a soft low tap sounds, and the hint restarts.
  Nothing else on the board is interactive.
- Reveals: the word fades in large over the board with the piece's glyph beside it, holds for
  about 1.5 s, and advances on tap or timeout.
- Pieces from earlier puzzles stay on the larger board, dimmed and inert, so the zoom reads as
  "the same world, pulled back".
- A small "Skip" link is always visible. Words are avoided for teaching, not for escape hatches.
- Screen readers get a live region with the instruction in words ("Tap the Muju"), and cells
  stay keyboard-operable.

### Zoom transitions

There is no camera. Implement the zoom as a transform: render the next board underneath,
scaled so its top-left n×n cells coincide exactly with the current board's cells, then tween
its scale to 1 while the old board crossfades out. White's home is top-left on every board, so
the pulled-back view always keeps the previous scene in place. Reduced motion gets a cut.

### Hit and kill effects (shared with the real game)

A `BoardEffects` overlay layer (absolute, pointer-events none, positioned by cell coordinate)
driven by an effect queue, used by the tutorial and by `GameScreen` and replays alike.

- One hit effect per attacker element: Fire ember burst, Lightning fork flash, Water ripple
  splash, Shadow ink bloom, Plant leaf scatter, Metal spark shards. Colors come from
  `ELEMENT_HEX` in `src/utils/colors.ts`.
- Three magnitudes from the elemental modifier: resisted (−1) at roughly 0.6×, normal at 1×,
  vulnerable (+1) at about 1.6×, scaling particle count, radius, duration and a small board
  shake. A surviving hit shows the element effect at its magnitude; a kill adds a token
  shatter and a brighter burst.
- Checkmate and home win: a full-board burst (confetti in the winner's army colors) plus a
  sound fanfare.
- Reduced motion: single short flash, no particles, no shake.

### Sounds

Extend the synthesized set, no files: `hint` (soft chime pulse), `collect` (crystal pickup
tick per light), element kill layers (one short timbre per element, pitched by magnitude),
`reveal` (word appearance), `checkmate` (short fanfare). Settings and level follow the existing
`muju:sfx:v1` panel. The hint before the very first click is silent because audio has not
unlocked yet; that is acceptable.

### Gating and persistence

- Key `muju:onboarding:v1` holding `{ completed: true, at: <ISO date>, version: 1 }`.
  localStorage, not a cookie, to match every other setting in the client.
- `App.tsx` shows `Onboarding` instead of `ModeSelect` when the key is absent, the URL has no
  `?online=1`, `?room=`, join or watch path, and no saved game exists. Deep links to
  `/muju/micro/`, `/muju/analysis`, explorer and painter are never gated.
- `?tutorial=1` always replays it. A "Replay tutorial" link on the mode screen does the same.
- Skipping sets the same flag.

### End screen and "Play puzzles"

The end screen is a restyled `ModeSelect` showing three large buttons first: Play vs AI,
Play online, Puzzles. Existing options (Pass & Play, Watch AI, Analysis board, MICRO MUJU)
stay below as smaller links. There is no puzzle mode today, so the scenario engine built for
the tutorial doubles as the puzzle engine: Puzzles opens a list containing the three tutorial
puzzles, replayable, with the scenario format designed so more puzzles are plain data files.

### Decisions made and assumptions

1. **Player stays White for all three puzzles.** The request described "a black Hono" attacking
   "the Muju". Read as: the player gets a Honō and the target is a black Muju. Fire on plant is
   the vulnerable case, which shows the biggest kill effect; and keeping one seat avoids teaching
   a side swap mid-tutorial. If the intent was the player attacking their own Muju from puzzle 1,
   swap the piece colors in `scenarios.ts`; nothing else changes.
2. **Orientation follows the real board.** The request said lower-left to upper-right. The game
   draws White's home at top-left, so the Muju travels top-left to bottom-right, matching what
   the player sees in every real game afterwards. Flipping the tutorial would teach the wrong
   mental map.
3. **Board sizes 3 → 6 → 10.** The 6×6 middle step reuses MICRO MUJU's proven size and makes the
   two zooms feel even.
4. **"P1" read as Player 1 = White**, which is also plant tier 1 = Muju. Both readings agree.
5. **Puzzle 1 uses real mining** (three of eight lights). It costs nothing and teaches the economy
   without words. Drop it if it reads as noise in testing.
6. **"Puzzles" is the third button**, backed by the three tutorial scenarios. MICRO MUJU and
   Academy remain links, not headline buttons.

### Phasing and verification

| Phase | Deliverable | Verification |
|---|---|---|
| 1 | `BoardEffects` layer, element hit and kill effects, three magnitudes, checkmate burst, new sounds, wired into `GameScreen` and replays | Unit tests for effect selection; Playwright screenshots of each element at each magnitude; reduced-motion case |
| 2 | Scenario engine (`src/onboarding/`), three scenarios as data, hint system, reveals, geometry tests | Vitest geometry tests against the live catalogue; prover returns `#` for puzzle 3; component tests for hint and wrong-tap |
| 3 | Zoom transitions, title assembly, end screen, gating, `?tutorial=1`, Skip, Replay link, Puzzles list | Playwright: first visit, completion, return visit, skip, replay; phone portrait 390×664, landscape, desktop |
| 4 | Seed the flag in every existing e2e spec and `tools/smoke-site.cjs`; docs change record; CONTENT DAG `ui` node review | Full `npm test`, `npm run test:e2e`, online e2e config, smoke script, `npm run build` |

Release target is the browser site only (Cloudflare Pages via `build-all.sh`, and Render,
which serves the same build). No rule changes, no rules revision bump, no server change.
Record the work under `muju/docs/changes/` per `docs/CONTENT_DAG.md`.

---

## Part 2: Implementation prompt

Copy from here down into a fresh session started in `/Users/ashkie/src/deevgames`.

````
You are implementing a wordless first-visit onboarding for Muju Hono Irumbu, the browser game
in `muju/`. Read `muju/docs/PROMPT_new_player_onboarding.md` Part 1 first; it contains the
survey, the rule facts, the three puzzle layouts and the decisions already made. Do not
re-litigate those decisions. Work on a new branch `claude/muju-onboarding` from `master`.

Follow `CLAUDE.md`: run `python3 tools/muju-content-dag.py plan --kind ui` (or the closest
documented kind) before starting and record changed / verified-unchanged / blocked nodes at
the end. This is a site UI change only: no rule change, no rules revision bump, no server or
MCP change, no Academy change.

### Ground rules

- Never use `useGameState` or `GameScreen` to drive the tutorial; both autosave to
  `elemental-tactics-save`. Build positions by hand the way `createMicroGameState`
  (`src/game/micro.ts`) does, play moves with `applyAction` from `src/ai/simulate.ts`, and
  render with `Board` plus a fake `game` object the way `AnalysisScreen.tsx:122-140` does.
- Set `inactivityRule: 'off'` and Black's bank to 0 on every tutorial state.
- Do not persist tutorial boards; `persistence.ts` only accepts 10×10 and 6×6.
- The tutorial teaches with light, motion and sound, not words. Words appear only as the
  three reveals, the assembled title, the Skip link, and screen-reader text.
- Every effect honors `prefers-reduced-motion` (existing rule at `index.css:134`).
- New sounds are synthesized in `src/sound/effects.ts` like the existing ones. No audio files.
- Keep tsconfig strict. `ActionsPerTurn` is typed `2 | 4`; use 4.

### Phase 1: effects layer (shared with the real game)

1. Add `src/effects/BoardEffects.tsx` and `boardEffects.ts`: an absolutely positioned,
   pointer-events-none overlay inside `.board-stage` that maps cell coordinates to pixels
   from the grid's bounding box and plays queued effects. Particles on a small canvas, glows
   and flashes as CSS keyframes. Export a `useBoardEffects()` hook returning `emit(effect)`.
2. Effect types: `hit` and `kill`, each with `{ x, y, attackerElement, magnitude }` where
   magnitude is `'resisted' | 'normal' | 'vulnerable'` derived from the elemental modifier in
   `src/game/elements.ts` (−1, 0, +1). One distinct look per attacker element: Fire ember
   burst, Lightning fork flash, Water ripple, Shadow ink bloom, Plant leaf scatter, Metal
   spark shards. Colors from `ELEMENT_HEX` in `src/utils/colors.ts`. Scale particle count,
   radius, duration and a small board shake by magnitude at roughly 0.6× / 1× / 1.6×. A kill
   adds a token shatter of the defender and a brighter burst. Add `collect` (lights fly from
   a square to the bank), `checkmate` (full-board burst in the winner's army colors) and
   `reveal`.
3. Wire the layer into `GameScreen` and `TurnReplay` beside the existing state-diff sound
   logic in `src/sound/useGameSounds.ts`: every attack in a real game, replay or incoming
   online move now shows its element effect at the right magnitude, and every kill shows the
   kill effect. Home win and checkmate show the celebration.
4. Sounds: add `hint`, `collect`, `reveal`, `checkmate`, and one short kill timbre per
   element pitched by magnitude. Respect the existing effects toggle and level.
5. Tests: unit tests for magnitude and element selection; Playwright screenshots of each
   element at each magnitude (18 frames) and one reduced-motion frame.

### Phase 2: scenario engine and the three puzzles

1. Create `src/onboarding/scenarios.ts` with a data format:
   `{ id, size, hideHomeMarkers, pieces: [{ owner, type, x, y, inert? }], reserves: [{ x, y, crystals }],
   goal: { kind: 'move', to } | { kind: 'kill', target } | { kind: 'invade' }, reveal: { word, glyphElement } }`.
   Add a builder that returns a `GameState` from a scenario, White to move, four actions.
2. The three scenarios exactly as in Part 1: 3×3 Muju to (2,2) with 8 crystals; 6×6 white
   Honō (1,1) versus black Muju (4,4); 10×10 white Irumbu (9,1), black Muju (8,9), black Hi
   (2,8). Earlier puzzles' white pieces carry over on the larger boards as `inert: true`,
   dimmed to 60% and ignoring taps.
3. Geometry tests in `tests/onboarding/scenarios.test.ts` computed from the live catalogue,
   not hard-coded numbers: puzzle 1's move costs exactly 4 actions; puzzle 2's
   `findAttackApproach` yields 3 move actions plus the attack and `resolveCombat` kills;
   puzzle 3's path to (9,9) costs exactly 4 actions, and after the move
   `resolveHomeCheckmate` (or `analyzeHomeDefense`) reports checkmate for White. If a stat
   change ever breaks a puzzle, these fail.
4. `src/onboarding/useScenario.ts`: a controller holding `{ state, phase, activeUnitId,
   selected, hint }` with phases `hint-piece → hint-target → playing → reveal → done`.
   Click handling: active piece selects; the goal square or target plays the scripted
   sequence (multi-square moves split into speed-sized hops at about 220 ms each, like the
   replay playback in `docs/PHONE_UI_PLAYBACK-2026-09-17.md`); anything else shakes and
   restarts the hint. Puzzle 1 ends with the real mining step so three of the eight lights
   leave the square with the `collect` effect. Puzzle 3 runs the real prover after the last
   hop and only celebrates on `#`.
5. Hint rendering: a pulsing ring and bob on the active piece; a ghost pointer that taps the
   piece after ~2 s idle; on selection, path dots light in sequence to the target and the
   target pulses gold; the ghost pointer taps the target after idle. Reuse the existing
   `range-marker` and `destination` classes where they fit; add keyframes in `index.css`.
6. `Reveal.tsx`: the word in the display font, large, with the piece glyph, fade in, hold
   ~1.5 s, advance on tap or timeout. After puzzle 3, the three words slide together into
   "Muju Hono Irumbu" (ASCII Hono in the title) before the fade.
7. A `aria-live="polite"` region narrates each step in words for screen readers. Cells remain
   buttons so keyboard users can complete the flow.

### Phase 3: transitions, gating and the end screen

1. `ZoomTransition.tsx`: render the next board scaled so its top-left n×n cells coincide with
   the current board's cells, tween `transform: scale()` to 1 over ~700 ms with the old board
   crossfading out. Use `.board-stage` container sizing so both boards measure the same.
   Reduced motion: a cut.
2. `src/onboarding/Onboarding.tsx` sequences intro (a beat of the empty 3×3 with the Muju
   fading in) → puzzle 1 → reveal → zoom → puzzle 2 → reveal → zoom → puzzle 3 → checkmate
   celebration → reveal → title → fade to end screen. Target under 60 s with no idling. Skip
   link always visible top-right.
3. Gating in `App.tsx`: show `Onboarding` when `muju:onboarding:v1` is absent and the URL
   has no `?online=1`, `?room=`, join or watch path, and `loadGameState()` returns no save.
   Never gate `/muju/micro/`, `/muju/analysis`, explorer or painter. `?tutorial=1` always
   plays it. Completion or Skip writes `{ completed: true, at, version: 1 }`.
4. End screen: restyle `ModeSelect` so three large buttons come first: "Play vs AI",
   "Play online", "Puzzles". Keep Pass & Play, Watch AI, Analysis board and MICRO MUJU as
   smaller links below, and add "Replay tutorial". The first render after the tutorial fades
   in from the title.
5. Puzzles: a `PuzzleList` screen listing the three scenarios by their word and glyph, each
   replayable through the same controller with its own reveal and no zooms. Design the list
   so adding a puzzle is adding a scenario object.
6. Phone first: verify at 390×664 portrait, 844×390 landscape and desktop. Tap targets at
   least 44 px. Zoom uses transforms only.

### Phase 4: tests, docs, verification

1. Seed `localStorage['muju:onboarding:v1']` through `page.addInitScript` in a shared
   Playwright fixture used by every existing spec that opens `./`, and in
   `tools/smoke-site.cjs`, so nothing existing regresses. Add `e2e/onboarding.spec.ts`:
   first visit shows the tutorial; completing all three puzzles by clicking lands on the end
   screen and sets the flag; a return visit shows the mode screen directly; Skip sets the
   flag; `?tutorial=1` replays; wrong taps do not advance; reduced motion completes.
2. Run `npm run build`, `npm test`, `npm run test:e2e`, the online config
   `npm run test:online:e2e`, and `node ../tools/smoke-site.cjs` against a served build.
   Report results verbatim, including anything that failed.
3. Record a short screen capture or a frame strip of the full flow at phone and desktop sizes
   and save them under `muju/docs/onboarding/`.
4. Write `muju/docs/changes/2026-MM-DD-new-player-onboarding.md` describing what changed, the
   storage key, the gating rules, the e2e seeding, and the DAG nodes reviewed. Update
   `muju/docs/PROMPT_new_player_onboarding.md` only with a short "Status" line at the top.
5. Commit in small steps per phase. Do not push or open a PR unless asked.

### Report back

Finish with: what shipped per phase, the exact test commands and their outcomes, the storage
key and gating rules, screenshots or capture paths, and anything left out with the reason.
````
