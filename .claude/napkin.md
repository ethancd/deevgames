# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-06-20 | self | Changed all seed costs to sunlight, user wanted only sunflower=sun, lily=water, rest=life_essence | Ask before changing resource types in game economy — the user has specific intent for each resource's role |
| 2026-06-20 | self | isGridTileOccupied skipped motes with progress>=1, causing stacking at leyline endpoints | Never filter motes by progress in occupancy checks; use excludeMote parameter for self-exclusion in chaining |
| 2026-06-20 | user | Weather feed was on its own timer (WEATHER_FEED_INTERVAL), should be on emit ticks | Plant/tree feeding should be tied to the emit tick counter, not a separate ms timer — every 6th emit tick = every 15s |
| 2026-06-20 | self | hasPlantNear() counted mature source plants, blocking hole relay even though source plants never consume motes | hasPlantNear guard should only count plants that can actually accept resources — not mature source plants |
| 2026-06-20 | user | Used diamond polygons for isometric glows (holes, crystals) — looked wrong, user wanted ellipses | For isometric glow effects, use ellipses with 2:1 aspect ratio (HALF_W × HALF_H), not literal diamond polygons |
| 2026-06-20 | user | Added separate glow circle overlay for mature plants — user only wanted the sprite itself to glow | Don't add extra decorative overlays; just move the existing sprite above the lighting layer to make it "glow" |

## User Preferences
- Muju balance work: commit/push checkpoints to `claude/refine-muju-balance-nulzjj` as you go; do NOT open a PR unless asked.
- Record every autonomous design ruling in `muju/JUDGMENT_LOG.md`.
- Design rulings E-1..E-3 are settled — do not re-litigate (rush>expand intended; mass-Fire_1 rush target 35-55% WR vs competent defense; no persistent per-unit HP).

## Patterns That Work
- Harness invariant checks pay off: the occupancy check caught a real engine bug (D13: Date.now()+3-char IDs collide same-ms → by-ID MOVE teleports two units). When generating IDs in this codebase, always include a monotonic counter.
- For Phaser keyboard input: use `createCursorKeys()` + `addKey()` for polled movement keys, and a DOM `window.addEventListener('keydown')` for instant-action keys like tool switching and interact. Phaser's key event naming is inconsistent for symbols (`?`, `+`, `=`), so the DOM handler with `event.key` is more reliable for those. Clean up the DOM listener in `shutdown()`.
- Muju engine knobs for experiments: keep them additive + default-off (setElementGraph, setCombatHandicap, AIEngineV2.setConfig), pin defaults with tests.
- chrome-devtools MCP `upload_file` rejects paths outside workspace roots (e.g. /tmp) — copy test fixtures into the repo temporarily, then delete.
- Verified file:// single-page tools end-to-end via chrome-devtools MCP: new_page → upload_file on the picker button → evaluate_script to drive state → screenshot + list_console_messages.

## Patterns That Don't Work
- Phaser tweens on `player.y` conflict with manual movement in `update()` — the tween continuously overwrites the position. Use a manual sine-wave offset tracked in a separate `baseY` variable instead.
- `this.add.graphics()` in Phaser BootScene can prevent `scene.start()` from working (graphics objects added to display list interfere with scene transitions). Use `(this.make as any).graphics({ add: false })` for texture generation.
- `game.destroy(true)` in HMR cleanup can nuke scene classes for the replacement Phaser instance, leaving zero scenes registered. Don't destroy old Phaser games during HMR in development.
- Preview tool's headless browser has `document.hidden: true` → `requestAnimationFrame` never fires → Phaser game loop doesn't tick. Can't verify runtime movement in preview; must test on phone or real browser.

## Domain Notes
- Muju Hono Tanka: custom board game app in `muju/`. Player IDs are 'white'/'black' (not 'player'/'ai').
- AI's real moves bypass validation (APPLY_AI_ACTION → ai/simulate.ts skips meetsTechRequirement + isValidSpawnPosition) — D1-D3 in SPEC_AUDIT.md, deferred to Phase 4a per J-002.
- resourcesSpent updates at queue-time (human) vs place-time (AI) — leaks hidden queue info into AI belief model.
- Lab replay schema `muju-lab-replay-v1` (viewer at muju/lab/tools/replay-viewer.html): steps are full snapshots; ATTACK steps carry only unitId+targetPosition, so the attacker's square is NOT recoverable from snapshots — viewer highlights target only. MOVE origin / MINE square ARE recoverable by diffing the previous step.
- `npm test` in muju/ — 460 tests green as of handoff. Property tests slow (~65s) because vitest runs everything in jsdom; consider `// @vitest-environment node` for tests/game/**.
