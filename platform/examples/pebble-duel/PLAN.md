# Pebble Duel: playable game on the DeevGames platform

## Context

The platform (`platform/` pnpm workspace, branch `claude/game-design-dossier-rvn8ib`) is complete: six kits, 218 tests green. `examples/pebble-duel` is currently headless — a GameDef for 3-heap subtraction Nim (take 1–3 from one heap, last take wins), a perfect-play Grundy bot, a machine-verified CSV puzzle pack, and integration tests. This plan turns it into a **playable, mobile-friendly browser game** by assembling the platform pieces. Ethan will run this plan on his computer.

Decisions made (via AskUserQuestion): **puzzle-ladder framing** (Nim is solved; the game is "find the winning line vs escalating AI from verified-winnable positions") plus a **free-play vs-AI mode** with difficulty tiers. No pass-and-play, no daily seed in V1.

**Constraints:** consume the platform packages, don't modify them (if a genuine gap is found: log it, make the minimal additive change in that package WITH tests, note it in the final report). All work stays inside `platform/examples/pebble-duel/`. Keep the existing integration tests (incl. the byte-identical REPORT.md gate) green. House ports: muju 3002, leyline 3003, lution 3004 → **pebble-duel dev server = 3005**. Never leave the dev server running while editing served files (napkin rule).

## The game design (V1)

**Puzzle Ladder** — 12 rungs. Each rung = a verified winnable-for-first starting position + an AI tier. You always play `first`; you pass the rung by winning. Star rating on completion:
- An **inaccuracy** = you were in a winning position (Grundy ≠ 0 before your move — `grundyValue` is already exported from `src/game.ts`) and your move failed to reach Grundy 0.
- 3★ = zero inaccuracies (the perfect line), 2★ = one, 1★ = won at all. Losing = retry, no penalty.
- Rungs unlock sequentially; stars persist.

**Free Play** — pick heap sizes (three steppers 0–9, default 3/5/7) and an AI tier; play either seat. The UI shows a subtle "position: winning/losing" hint chip only after the game ends (post-mortem), never during play.

**AI tiers** (difficulty = search budget, never rules — with one honest exception): `easy`/`medium`/`hard` = `makeMinimaxBot(pebbleDuel, weakEval, { budget: { depth: 2 | 4 | 8 } })` where `weakEval = composeEval([optionalityFactor(pebbleDuel)])` — deliberately game-agnostic so depth does the work (shallow search is genuinely beatable early-game; deep search converts endgames). `oracle` = the existing `perfectBot()` from `src/bots.ts` (Grundy rule). Document in code: oracle is the game's own solution, not a budget tier — the budget ladder can't reach perfection in a solved game without an eval that IS the solution.

Ladder mapping: rungs 1–3 easy, 4–6 medium, 7–9 hard, 10–12 oracle (rung 10–12 positions must therefore be winnable via the exact line only).

**Feel:** tap pebbles in a heap to select how many to take (tapping the k-th pebble from the top selects k, capped at 3) → confirm/cancel via the platform confirm machine (fat-finger protection) → AI replies after a ~350ms delay. Undo pops both plies (your move + AI reply). Reload mid-game resumes exactly. Two skins: "Zen Garden" (default: warm stone/moss palette) and "Neon Arcade" (dark synthwave — Lumen Works homage), toggled on the home screen.

## Architecture

Vanilla TS + DOM (no React — matches @deev/ui's headless-first design and Lution's house pattern), Vite app inside the existing example package. Strict separation: a **headless `AppController`** (all game/screen logic, fully unit-testable in node) and thin DOM renderers (covered by a Playwright smoke test, not unit tests).

### Platform pieces consumed (exact APIs, all verified green this session)
- `@deev/core`: `GameDef` (existing `pebbleDuel`), `mulberry32` (engine + AI rng streams — engine stream advanced only via `apply`), `UndoStack` isn't needed (no commit points, no hidden info — implement undo as replay-prefix instead, see below), `definePersistence` + `engineHash` for the save schema.
- `@deev/ai`: `makeMinimaxBot`, `composeEval`, `optionalityFactor`. Bots are lab-shaped: call `bot.choose({ view: state, seat, legal, rng })` directly in the UI turn loop.
- `@deev/content`: existing `parsePuzzleCsv`/`puzzleContent`/`puzzleVerifier` in `src/puzzles.ts`, extended for the ladder columns.
- `@deev/ui`: `src/shell.css` (import in `main.ts`), `mountShell`, `createConfirmMachine`, `defineSkin`/`createSkinManager`, `defineStore` (over a `definePersistence` spec), `createToastQueue` (driven by a 250ms interval calling `tick()`).
- `@deev/lab` (tests only): tier-sanity series.

## Files (all under `platform/examples/pebble-duel/`)

**Modified:**
- `package.json` — add devDeps: `vite@^7`; scripts: `dev: "vite --port 3005"`, `build: "vite build"`, `preview: "vite preview --port 3005"`, `e2e: "playwright test"` (+ devDep `@playwright/test`; on THIS repo's containers Chromium is preinstalled at `/opt/pw-browsers/chromium` with `PLAYWRIGHT_BROWSERS_PATH` set — do not run `playwright install`; on other machines run it once).
- `data/puzzles.csv` — extend to the 12 ladder rungs. New columns (loader already supports plain fields): `difficulty` (easy|medium|hard|oracle), `subtitle` (flavor text). Format reminder: **every row starts with the model name** (`puzzle,<id>,...`); heaps stay `m2m__int__heaps` pipe-separated. All rungs must be Grundy ≠ 0 (winnable for first).
- `src/puzzles.ts` — extend `puzzleSchema` with `difficulty: z.enum([...])` and `subtitle: z.string()`; add a seam check: rung difficulties appear in non-decreasing ladder order (easy<medium<hard<oracle). Keep the existing verifier checks untouched.

**New:**
- `index.html` — minimal shell mount point, `<meta name="viewport" ...>`, title "Pebble Duel".
- `vite.config.ts` — `base: './'`, no plugins.
- `src/app/controller.ts` — the headless heart. `createAppController({ store, now? })` managing: screen state (`home | ladder | game | freeplay-setup`), game session `{ mode, rungId?, config, seed, actions: PebbleMove[], state, aiTier, inaccuracies }`. Methods: `startRung(id)`, `startFreePlay(heaps, tier, seat)`, `selectTake(heap, count)` / `confirmMove()` / `cancelSelection()` (wraps `createConfirmMachine`), `undo()` (rebuild state by replaying `actions.slice(0, -2)` from the seed via `def.apply` — replay-prefix undo; document why: no hidden info/commit points in Nim, and it exercises the transcript discipline), `aiMove()` (tier bot, called by the UI after a delay; controller stays sync), star scoring on terminal, `save()`/`resume()` via the store after every ply. Emits change events via a tiny subscribe API.
- `src/app/tiers.ts` — `makeTierBot(tier)` as designed above; exports `TIERS` metadata (label, description).
- `src/app/persist.ts` — `definePersistence` spec v1: `{ ladder: Record<rungId, { stars: number; attempts: number }>, settings: { skinId: string }, session: { mode, rungId?, config, seed, aiTier, actions } | null }`; `defineStore({ key: 'pebble-duel:v1', persistence, engineHash: engineHash(pebbleDuel) })`. Resume rule: a saved session replays from seed+actions; if `engineHash` mismatches (game logic changed), drop the session but keep ladder progress (migrate).
- `src/app/skins.ts` — two `defineSkin` entries with `cssVars` (`--pd-bg`, `--pd-stone`, `--pd-stone-selected`, `--pd-accent`, `--pd-text`, ...); `createSkinManager` with default `zen-garden`.
- `src/render/` — `home.ts`, `ladder.ts` (rung cards: name, subtitle, tier chip, stars, lock state), `board.ts` (three heap columns of pebble buttons with `data-testid="pebble-<heap>-<idx>"`, selection highlights top-k, confirm/cancel bar in the shell dock, undo + quit buttons, toast container), `overlay.ts` (win/lose: stars earned, inaccuracy count, perfect-line replay hint, next-rung/retry). All renderers: pure `render(container, snapshot, handlers)` functions; geometry-first CSS in `src/render/app.css` (fixed board min-heights, reserved overlay slots — layout-invariance discipline; every dynamic text region gets an overflow policy).
- `src/main.ts` — wire store → controller → skin manager → shell (`mountShell`) → renderers; interval driving `toastQueue.tick()`; AI-turn scheduler (350ms `setTimeout` after human ply when it's the AI's seat).
- `tests/controller.test.ts` — start rung → play the perfect line (computed via `perfectMove`) → win with 3★; deliberately blunder once → 2★; undo removes exactly two plies and decrements nothing retroactively (inaccuracy count recomputed from replay, not mutated); resume: save mid-game, new controller from same store resumes identical state (compare `stateHash`); engineHash-mismatch session dropped but ladder kept; rung locking order.
- `tests/tiers.test.ts` — (lab) oracle tier never loses from Grundy≠0 as second... (careful: oracle as SECOND from a first-winnable start CAN lose to perfect first play — assert instead: oracle-vs-random 50-game series, oracle wins all games where it ever holds a winning position; simpler concrete gates: oracle beats `randomBot` ≥ 95% over 100 seeded games from [3,5,7] with seat rotation; hard(d8) beats easy(d2) with Wilson CI excluding 0.5 over 200 games; easy loses at least once to random over 100 games — proof it's actually beatable).
- `tests/ladder-content.test.ts` — extended CSV parses with zero warnings; 12 rungs; difficulty ordering seam passes; `verifierIssues` empty (every rung winnable + not pre-solved); negative case still caught.
- `e2e/smoke.spec.ts` + `playwright.config.ts` — build + preview server, then: home renders; enter ladder; start rung 1; click through a full winning line (drive via the same `perfectMove` logic imported into the spec, clicking `data-testid` pebbles + confirm); win overlay shows ≥1 star; reload mid-game on rung 2 resumes the board. Config uses `reuseExistingServer: false`, `webServer: { command: 'pnpm preview' }`; honor `PLAYWRIGHT_BROWSERS_PATH`/`executablePath` fallback to `/opt/pw-browsers/chromium` when present.

## Sequencing (one milestone = one commit, gates green each time)

1. **Content**: extend `data/puzzles.csv` + `src/puzzles.ts` schema/seam; `tests/ladder-content.test.ts`. Gate: package tests green (existing integration tests untouched).
2. **Headless game**: `src/app/{controller,tiers,persist,skins}.ts` + `tests/{controller,tiers}.test.ts`. Gate: all unit tests green in node env (storage injected as in-memory Map — `defineStore`'s storage is injectable).
3. **Playable UI**: vite scaffold, `src/render/*`, `src/main.ts`, app.css. Gate: `pnpm --filter @deev/example-pebble-duel dev` on :3005 → manually play rung 1 end-to-end, toggle skins, undo, reload-resume.
4. **E2E smoke**: playwright config + spec. Gate: `pnpm --filter @deev/example-pebble-duel e2e` green.
5. **Wrap**: README section in the example ("what this demonstrates" per platform piece), full workspace gates (`cd platform && pnpm -r typecheck && pnpm -r test`), commit, push to `claude/game-design-dossier-rvn8ib`.

## Verification (end-to-end)

- `cd platform && pnpm install && pnpm -r typecheck && pnpm -r test` — everything green including the pre-existing REPORT.md byte-identical gate.
- `pnpm --filter @deev/example-pebble-duel dev` → http://localhost:3005 : play rung 1 with the perfect line ([3,5,7] → take 1 from heap 0 is the unique 3★ opener... verify in-game against `grundyValue`), confirm 3★; blunder deliberately, confirm 2★; lose on purpose at oracle tier, confirm retry flow; kill the tab mid-game, reopen, confirm resume; toggle Neon Arcade skin, reload, skin persists.
- `pnpm --filter @deev/example-pebble-duel e2e` — smoke passes headless.
- Mobile check: dev server + phone on LAN (or Tailscale) at :3005 — dock stays in thumb reach with the keyboard closed, no horizontal scroll at 320px width.

## Notes for the executing session

- Read `platform/README.md` and the consumed packages' READMEs first; the exact API shapes are in `platform/packages/*/src/index.ts` — trust the code over this plan if they drift.
- ScriptedBot ctx shape is `{ view, seat, legal, rng }`; `runSeries` is async; reports carry no timestamps.
- The CSV loader expects the model name in **column 1 of every row** (this bit me once already).
- zod is `^3` — `.nonnegative()`, not `.nonneg()`.
- `@types/node` is already a devDep of the example (needed for `node:fs` in tests).
- Do not run `playwright install` on the DeevGames remote container (Chromium preinstalled); on a personal machine it may be needed once.
