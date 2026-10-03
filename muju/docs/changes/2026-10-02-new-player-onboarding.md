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
- Puzzle 1, Muju: 3×3, home markers hidden. A1 to C3 costs four actions, then the
  real mining rule takes 3 of the 8 crystals.
- Puzzle 2, Honō: 6×6. The Honō on B2 approaches the black Muju on E5 by
  `findAttackApproach` (B3, D4, E4: three actions) and kills it with the fourth
  (fire on plant, 4 ≥ 3).
- Puzzle 3, Irumbu: the real 10×10, keeping the 6×6 in its top-left corner. The
  Irumbu runs J2 to J10 in four hops of two. The tutorial then asks the real
  prover (`END_ACTION_PHASE` through `applyAction`) and celebrates only on
  `home-checkmate`.
- `useScenario` runs `hint-piece → hint-target → playing → solved`. The active
  piece pulses. After 2 s idle a ghost pointer taps it. Selecting lights the
  path dots in sequence, and the goal pulses gold. A wrong tap shakes, plays
  `wrong` and restarts the hint. Inert pieces ignore taps.
- `Onboarding` sequences intro → puzzle → reveal → zoom → … → assembled title →
  fade to the mode screen. The zoom renders the next board underneath, scaled so
  its top-left cells sit on the old ones (measured live), and tweens it to 1 while
  the old board fades. Reduced motion cuts. Skip is always visible. An
  `aria-live` region narrates each step, and focus moves to the square that
  matters next, so keyboard users can finish.

**Mode screen and gating.** `ModeSelect` now leads with three large buttons:
**Play vs AI**, **Play online**, **Puzzles**. Pass & Play, Watch AI, Analysis board
and MICRO MUJU sit below as smaller choices, followed by **Replay tutorial**.
`PuzzleList` replays each scenario with its own reveal; a new puzzle is one more
scenario object.

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
- `e2e/fixtures.ts` seeds the flag through `context.addInitScript`. Every existing
  spec imports `test` from it. Specs that open their own contexts use
  `seededContext(browser, …)`. `e2e/onboarding.spec.ts` starts as a first-time
  visitor and covers first visit, completion, return visit, Skip, `?tutorial=1`,
  Replay, deep links, saved games, wrong taps, inert pieces, reduced motion,
  keyboard play and the Puzzles list. `e2e/effects.spec.ts` captures each element
  at each magnitude, the reduced-motion flash and the checkmate burst.
- `tools/smoke-site.cjs` checks the first-visit tutorial and Skip, then continues
  as a returning player.
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
