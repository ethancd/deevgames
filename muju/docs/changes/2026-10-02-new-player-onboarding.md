# New player onboarding and board effects (2026-10-02)

Browser site only. No rule change, no rules revision bump, and no server, MCP or
Academy change. Plan and decisions: [`../PROMPT_new_player_onboarding.md`](../PROMPT_new_player_onboarding.md).

## What changed

**Board effects, shared with the real game.** `src/effects/` adds one canvas over the
board (`BoardEffects`, pointer-events none) and a pure model (`effectModel.ts`).
Every attack shows its attacker's element: Fire ember burst, Lightning fork flash,
Water ripple splash, Shadow ink bloom, Plant leaf scatter, Metal spark shards. The
elemental modifier sets the magnitude: resisted ×0.6, normal ×1, vulnerable ×1.6.
That scales particle count, radius, duration and a small board shake. A kill adds a
token shatter in the defender's army colors. A home win or home checkmate fires a
full-board confetti burst in the winner's colors. `useGameEffects` diffs the board
actually on screen, the same way `useGameSounds` does, so live play, AI turns,
incoming online moves and instant replay all get the effects; undo and reloads
produce none. Reduced motion gets one short flash with no particles or shake.
`/muju/?effects=1` is a gallery of every effect.

**Sounds.** Still synthesized in `src/sound/effects.ts`, with no files: `hint`,
`collect`, `reveal`, `checkmate`, `wrong`, plus one kill layer per element
(`killFire` … `killMetal`). `play(effects, { rate })` repitches a call, so heavier
blows play lower. Everything follows the existing `muju:sfx:v1` toggle and level.

**Wordless onboarding.** `src/onboarding/`:

- `scenarios.ts` is the data format: size, pieces (`inert` for scenery), reserves,
  goal (`move` / `kill` / `invade`) and reveal. A builder makes White-to-move Phasing
  states with four actions, `inactivityRule: 'off'` and Black's bank at 0. Moves are
  played only through `applyAction`. Positions are never persisted, and
  `useGameState` is never used.
- The only crystals in the tutorial are the Muju's square: 8 on the 3×3, then the
  5 it leaves behind on every later board.
- Puzzle 1, Muju: 3×3, home markers hidden. A1 to C3 costs four actions, then the
  real mining rule takes 3 of the 8 crystals.
- Puzzle 2, Honō: 6×6, and the player plays **Black**. The black Honō on F6
  approaches the white Muju from puzzle 1 (still on C3) by `findAttackApproach`
  (F5, D4, C4: three actions) and kills it with the fourth (fire on plant, 4 ≥ 3).
- Puzzle 3, Irumbu: the real 10×10, keeping the 6×6 in its top-left corner. The
  Irumbu runs J2 to J10 in four hops of two. The only defender is the Honō, which
  cannot hurt the Irumbu (4 < 5). With nothing to mine, White starts with exactly
  the Irumbu's upkeep (2) banked, because the prover only awards `#` to an invader
  that survives its own upkeep. The tutorial asks the real prover
  (`END_ACTION_PHASE` through `applyAction`) and celebrates only on
  `home-checkmate`. Only three pieces appear in the whole tutorial: the white Muju,
  the black Honō and the white Irumbu.
- `useScenario` runs `hint-piece → hint-target → playing → solved`. The active
  piece pulses. After 2 s idle a ghost fingertip taps it; the tip is anchored on
  the square's centre, measured inside the board. Selecting lights gold dots in
  sequence along the route, on exactly the squares where the piece can stop and
  still win (`scenarioStops`: every square for the speed-1 Muju, every second
  square for the Irumbu). Tapping a dot moves the piece there and the hint
  continues; tapping the goal finishes. A wrong tap shakes, plays `wrong` and
  restarts the hint. Inert pieces ignore taps.
- Pieces glide: every move is one continuous slide through each square of its
  route (`glideMs`: 260 ms plus 140 ms per square, eased at both ends), however
  many actions it spends. The rules apply the moves at once; the slide is a
  transform animation that keeps its clock if the piece re-renders mid-slide.
- Home squares in the tutorial carry a large white or black house pentagon in the
  centre, drawn under any piece.
- `Onboarding` sequences intro → puzzle → name → zoom out → … → fade to the mode
  screen. The only visible words are a small **Skip Tutorial →** at the bottom right
  and each piece's name, which fades in at the top middle after its puzzle and fades
  away without leaving text behind. The zoom renders the next board underneath,
  scaled so its top-left cells sit on the old ones (measured live), and shrinks it
  to fit over 1.5 s. The old board shrinks with it, pinned to the same point, so
  the two never drift apart while it fades. Reduced motion cuts. An
  `aria-live` region narrates each step for screen readers. Keyboard players get
  focus moved to the square that matters next; pointer players get no focus ring.

**Mode screen and gating.** `ModeSelect` puts **Muju Hono Irumbu** at the top,
then three large buttons: **Play vs AI**, **Play online**, **Puzzles**. Below them,
**Other ways to play ⌄** expands Pass & Play, Watch AI, Analysis board, MICRO MUJU
and Replay tutorial. Its open state is remembered in `muju:other-modes-open:v1`.
Start Game appears once a mode is chosen. `PuzzleList` replays each scenario with
its name; a new puzzle is one more scenario object.

## Storage key and gating

`localStorage['muju:onboarding:v1'] = { completed: true, at: <ISO>, version: 1 }`,
written by completion or Skip. `App.tsx` shows the tutorial only on `/muju/` when
the key is absent, the URL has no `?online=1`, `?room=`, join or watch path, and
`loadGameState()` finds no save. Explorer, painter, `/muju/micro/` and
`/muju/analysis` are never gated. `?tutorial=1` always plays it, and the param is
removed on finish. Unreadable storage counts as completed, so nobody is trapped.

## Tests and e2e seeding

- `tests/onboarding/scenarios.test.ts` recomputes every puzzle cost from the live
  catalogue: 4-action Muju walk and mining, a 3-action Honō approach plus the
  kill, a 4-action Irumbu run with the prover returning `mate`, and carry-over of
  pieces and reserves between boards.
- `tests/effects/effectModel.test.ts` covers magnitude, element and shake
  selection, kill detection and undo silence.
- `e2e/fixtures.ts` seeds the flag, and "Other ways to play" open, through
  `context.addInitScript`. Every existing spec imports `test` from it. Specs that open their own contexts use
  `seededContext(browser, …)`. `e2e/onboarding.spec.ts` starts as a first-time
  visitor and covers first visit (including that no words but Skip Tutorial and
  the names are visible), completion, return visit, Skip, `?tutorial=1`,
  Replay, deep links, saved games, wrong taps, inert pieces, reduced motion,
  keyboard play and the Puzzles list. `e2e/effects.spec.ts` captures each element
  at each magnitude, the reduced-motion flash and the checkmate burst.
- `tools/smoke-site.cjs` checks the first-visit tutorial and Skip, then continues
  as a returning player, opening "Other ways to play" for Pass & Play.
- Mode-screen selectors that named "vs AI" now name "Play vs AI".

Frame strips of the full flow at phone portrait (390×664), landscape (844×390) and
desktop (1280×800) are in [`../onboarding/`](../onboarding/). The sheet
`effects-kill-magnitudes.jpg` there has every element at every magnitude, the
reduced-motion flash and the checkmate burst. Set `MUJU_EFFECT_FRAMES=<dir>` while
running `e2e/effects.spec.ts` to regenerate the raw frames.

## Content DAG

`python3 tools/muju-content-dag.py plan --kind ui`:

| Node | Disposition |
|---|---|
| browser-ui | Changed: mode screen, onboarding, board effects, sounds. Verified by the unit, e2e and smoke results below, at phone and desktop sizes. |
| academy-lessons, academy-audio, academy-video, academy-package, academy-deploy | Verified unchanged. No rule, stat or taught fact changed, and the lessons show no mode screen. |
| advantage-explorer | Verified unchanged. No engine or rules input changed. |
| game-validation | See the verification section. |
| static-package, static-deploy | See the release section. |
| server-package, server-deploy | No server code changed. Render serves the same `dist` build after `master` updates. |
| release-verification | See the release section. |
