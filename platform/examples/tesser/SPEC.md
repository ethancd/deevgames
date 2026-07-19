# TESSER — V1 Specification

*Winner of the July 2026 design tournament (`docs/game-design-tournament-2026-07.md`). This spec is the single source of truth for V1. Every rule here is exact and computable; implementation stages make no game-design decisions. V1 scope per the tournament treatment: 1D/2D/3D folding only, three starting pieces, zero per-dimension abilities, minimax AI, verified campaign content, portrait mobile UI. 4D worldlines, abilities, ISMCTS, and LLM shape drops are all post-V1.*

## 1. Fantasy in one line

Every piece is conserved hypervolume worn as geometry: fold a tower into a spear, fold a spear into a slab — never gain or lose an ounce. Combat is projection; damage is overlap.

## 2. Exact rules

### 2.1 Board and seats

- Grid **6 wide × 8 tall**: cells `(x, y)`, `x ∈ 0..5`, `y ∈ 0..7`. North's back rank is `y = 0`; south's is `y = 7`.
- Seats: `'south'` and `'north'`. **South moves first.** Strictly alternating, exactly one action per turn.

### 2.2 Pieces

A piece is an axis-aligned box:

```ts
interface Piece {
  id: string;        // stable: 'S-keep', 'N-lance', ...
  seat: Seat;
  x: number; y: number;   // anchor = minimum corner of footprint
  w: number; d: number;   // footprint: x..x+w-1 (width), y..y+d-1 (depth)
  h: number;              // height
  measure: number;        // current hypervolume (HP). 1 ≤ measure ≤ w*d*h
}
```

- **Footprint** = the `w × d` cells it occupies. Footprints of distinct pieces never overlap. Footprints are always fully on board.
- **Volume** = `w * d * h`. **Invariant: `measure ≤ volume` always; immediately after a fold, `measure === volume` exactly.** A piece with `measure < volume` is *wounded* (its box has hollow cells; the box still interacts at full dims until re-folded).
- **Dimensionality class** = count of dims in `(w, d, h)` strictly greater than 1:
  `0 → 'point'`, `1 → 'line'`, `2 → 'plane'`, `3 → 'solid'`.
- **Speed** by class: point 4, line 3, plane 2, solid 1.

### 2.3 Initial position (default config)

South (total measure 18):

| id | shape (w×d×h) | anchor | covers |
|---|---|---|---|
| `S-shield` | 3×2×1 (plane, m=6) | (0,5) | x0–2, y5–6 |
| `S-keep` | 2×2×2 (solid, m=8) | (3,5) | x3–4, y5–6 |
| `S-lance` | 4×1×1 (line, m=4) | (1,7) | x1–4, y7 |

North is the exact 180° rotation (cell `(x,y)` ↔ `(5−x, 7−y)`):

| id | shape | anchor | covers |
|---|---|---|---|
| `N-shield` | 3×2×1 | (3,1) | x3–5, y1–2 |
| `N-keep` | 2×2×2 | (1,1) | x1–2, y1–2 |
| `N-lance` | 4×1×1 | (1,0) | x1–4, y0 |

### 2.4 Actions

Exactly one per turn. Discriminated union, JSON-serializable:

```ts
type Dir = 'N' | 'S' | 'E' | 'W';   // N = −y, S = +y, E = +x, W = −x
type Action =
  | { type: 'move';   piece: string; dir: Dir; steps: number }
  | { type: 'attack'; piece: string; dir: Dir; steps: number }
  | { type: 'fold';   piece: string; w: number; d: number; h: number; x: number; y: number }
  | { type: 'pass' };
```

**Move** — `steps ∈ 1..speed(class)`. Translate the whole box `steps` cells in `dir`. *Every* intermediate footprint and the final footprint must be fully on board and overlap no other piece (friendly or enemy). No jumping.

**Attack** — `steps ∈ 0..speed(class) − 1` (the strike consumes one movement point, so reach = speed). First slide `steps` cells exactly as a move (all positions clear). Then consider the **strike footprint**: the footprint translated one further cell in `dir` (cells off board are simply dropped). Legality requires the strike footprint to overlap **at least one enemy** piece and **zero friendly** pieces. Resolution, per overlapped enemy piece `E`:

- `contact = |strikeFootprint ∩ footprint(E)|` (cell count)
- `damage = contact × min(h_attacker, h_E)`, capped at `E.measure`
- `E.measure −= damage`; if it reaches 0, `E` is removed from the board.

Multiple enemies overlapped by one strike are each damaged (cleave). The attacker ends at the slid position (it never enters the enemy's cells) and takes no damage. Wounded attackers hit at full box dims — shape is what interacts; measure is what dies.

**Fold** — reshape the piece to a new box `(w, d, h)` at anchor `(x, y)`. Legal iff:
- `w * d * h === measure` **exactly** (folding a wounded piece re-forges it compact),
- `1 ≤ w ≤ 6`, `1 ≤ d ≤ 8`, `1 ≤ h ≤ 8`,
- new footprint fully on board, overlapping **no other** piece,
- new footprint shares **at least one cell** with the piece's current footprint.

**Pass** — always legal (the platform's legal-never-empty rule).

### 2.5 End of game

- A seat with zero pieces loses immediately: `{ winner: other, reason: 'elimination' }`.
- After `plyCap` total plies (config, default **100**): higher total measure wins, equal is a draw; `reason: 'adjudication'`, with `scores` = total measure per seat.

### 2.6 GameDef mapping

- `id: 'tesser'`, `version: '0.1.0'` (bump on any logic change).
- State: `{ pieces: Piece[], current: Seat, ply: number, plyCap: number }`. Pure/immutable `apply`. The game is fully deterministic — `apply` never draws from `rng`.
- Config: `{ pieces?: Piece[], plyCap?: number, firstToAct?: Seat }` — overrides for puzzles; default = §2.3.
- No `observe` (perfect information — required by `makeMinimaxBot`).
- `score(state, seat)` = `myTotalMeasure − oppTotalMeasure` (the adjudication/greedy seam; the real minimax eval lives in `eval.ts`).
- `isCommitPoint(state, action)` = true for `attack` and `fold`, false for `move`/`pass`.
- `legal()` ordering must be deterministic: pieces in `state.pieces` order; action types `move < attack < fold < pass`; dirs `N < S < E < W`; steps ascending; folds by `(w, d, h)` then anchor row-major.

### 2.7 Worked damage examples (test fixtures)

1. Lance 4×1×1 at (1,7) strikes **N** (broadside) into a slab 3×2×1 occupying x1–3, y5–6 — wait, strike requires adjacency after sliding: with lance slid to y6 (if clear), strike footprint = x1–4, y5; overlap with slab = x1–3,y5 = 3 cells; damage = 3 × min(1,1) = **3**.
2. Same lance folded to 1×4×1 (point-first, covering x1, y4–7) striking N: strike footprint = x1, y3; overlap with an enemy there = 1 cell; damage = 1 × min(1, h_def) = **1**.
3. Keep 2×2×2 strikes an adjacent 3×2×1 shield overlapping 2 cells: damage = 2 × min(2,1) = **2**.
4. A 1×1×8 column (line, speed 3) strikes a 2×2×2 keep, overlap 1 cell: damage = 1 × min(8,2) = **2**.
5. Overkill: damage 6 against a piece with measure 2 removes it; only 2 measure is lost from the board (cap).

## 3. Architecture & stage plan

Package `platform/examples/tesser` (`@deev/example-tesser`), mirroring pebble-duel's layout: `src/`, `tests/`, `data/`, plus `web/` (vite app). Same package.json shape as `platform/examples/pebble-duel/package.json` (workspace deps on all six kits), plus devDeps `vite` + `jsdom` for the web/UI tests. All commands run from `platform/`.

### Stage A — engine (`src/game.ts`, `src/index.ts`, `tests/game.test.ts`)

- Implement §2 exactly as a `GameDef` (read `platform/packages/core/src/game.ts` for the contract and `platform/examples/pebble-duel/src/game.ts` for the idiom).
- `src/persist.ts`: `definePersistence` (version 1, zod validate of the state shape) — the UI's save envelope.
- Tests must cover: every worked example in §2.7; legal-never-empty at fuzzed reachable states; no-jump sliding; fold legality (exact volume, overlap-one-cell, bounds); wounded-piece fold compaction; cleave; elimination + adjudication + draw; `legal()` determinism (two calls → identical arrays); replay convergence via `runMatch` + `assertReplayConverges` with `randomBot`-style policies; the conservation invariant (total measure never increases; decreases exactly by damage dealt).

### Stage B — AI + lab (`src/eval.ts`, `src/bots.ts`, `tests/ai.test.ts`, `REPORT.md`)

- `eval.ts`: `composeEval` (see `platform/packages/ai/src/eval.ts`) with named factors: `measure-diff` (dominant), `mobility` (own legal action count, cheap approximation fine), `threat` (best single-strike damage available to me minus opponent's, computed from the current position), `advance` (small bonus for measure closer to the enemy back rank). Weights are Stage B's to tune — but the lab gates below must pass.
- `bots.ts`: `tesserMinimaxBot(budget)` via `makeMinimaxBot` with `orderMoves` (attacks first, then folds, then moves by distance desc) and the transposition table on.
- Lab gates (mirror `platform/examples/pebble-duel/tests/integration.test.ts` and its byte-identical `REPORT.md` discipline; seeds fixed, no timestamps):
  1. Sensitivity: `greedyBot` beats `randomBot` decisively over 100 seeded games (CI excludes 0.5) — proves the harness detects advantage (platform README step 3).
  2. Strength ladder: minimax (depth ≥ 3) beats `greedyBot` with win rate whose 95% Wilson CI lower bound > 0.5 over 60 games.
  3. Invariant: conservation of measure wired as a `runSeries` invariant — zero violations across all series.
  4. First-mover check: minimax-vs-minimax (equal budget, 60 games, seat rotation on) — record the win rate in REPORT.md. Do not gate on 45–55% yet; **record it** (V1 balance target, tuned later).

### Stage C — content (`data/campaign.csv`, `src/puzzles.ts`, `tests/puzzles.test.ts`) — after Stage B

- 12 campaign missions in the self-describing CSV format (`parseContentCsv`), one `puzzle` record each: `id`, `name`, `brief` (one taught concept per mission — movement, broadside vs point, fold-to-spear, cleave, compaction after wounds, adjudication racing, …), `plyCap`, `south`, `north` piece lists. Piece encoding: semicolon-joined `[m{measure}:]WxDxH@X,Y` (measure defaults to volume, e.g. `m5:2x2x2@3,5`), ids auto-assigned `S1..`/`N1..`.
- Zod schema + `defineContent` fixtures with a seam test (unique ids, both sides non-empty, no overlapping footprints, measures ≤ volume).
- `defineVerifier` checks (pebble-duel `puzzles.ts` is the template):
  - `notPreSolved`: initial position is not terminal.
  - `solvable` (seeds [1,2,3]): south (mission player) running `tesserMinimaxBot` (Stage B, modest fixed budget) vs the same bot for north **wins by elimination within the mission's `plyCap`** via `runMatch` playout. Author positions until all 12 verify — the missions are handicapped in south's favor by construction (extra measure, better shapes, or wounded defenders).
- CI test: `verifierIssues(...) === []` for the shipped CSV (parse → schema → verify).

### Stage D — web UI (`web/`, `tests/ui.test.ts`) — after Stage A, parallel with B

- Vite vanilla-TS app (`web/index.html`, `web/main.ts`, `web/style.css`), portrait mobile-first, importing the engine + `@deev/ui` (read that package's README + `shell.ts`, `confirm.ts`, `storage.ts`, `toasts.ts`).
- Board: DOM grid (6×8), pieces as absolutely-positioned blocks spanning their footprint; render = footprint + height numeral + measure (wounded shows `measure/volume`); enemy pieces visually distinct; last-action highlight.
- Interaction (tap-select-then-confirm via `createConfirmMachine`): tap own piece → dock shows grouped actions (Move / Attack / Fold). Move & attack: board highlights destination/target cells, tap → confirm. Fold: dock lists legal `w×d×h` shapes, tap shape → board highlights legal anchors → tap anchor → confirm. Pass and Undo buttons in the dock.
- Opponent: `tesserMinimaxBot` (Stage B if landed; otherwise a local greedy policy over `def.score` — keep the seam thin either way) with three difficulty presets (search budget only). AI move applied after a short delay with a toast for damage dealt.
- Persistence: `defineStore` over Stage A's `persistence`; save on every state change; resume on load; New Game clears.
- Undo: `UndoStack` from `@deev/core` (read `undo.ts` for its commit-point semantics and use the API it actually exposes; if crossing commit points requires an explicit override, expose Undo only up to the last commit point and a Restart button for full reset).
- Tests: jsdom — mount, render initial position (6 pieces), tap-select shows actions, a scripted 3-action sequence updates the DOM, layout-invariance helper from `@deev/ui` on the board container. (Browser-mode validation stays deferred, per platform README.)

## 4. Design rationale (for future stages, not V1 work)

- One-action turns (not move+fold) keep `makeMinimaxBot`'s strict alternation, cap branching, and make folds real tempo commitments.
- Wounded = `measure < volume` avoids non-rectangular boxes while making compaction folds a genuine decision (smaller profile, exact re-forge).
- 4D re-entry (post-V1) will add `observe()` and switch the bot to `makeIsmctsBot` — the deterministic public channel is the board; the hidden channel is committed re-entry turns.
- Balance levers recorded for the lab: speeds per class, strike reach (= speed), plyCap, initial armies, per-class damage multipliers (currently none).
