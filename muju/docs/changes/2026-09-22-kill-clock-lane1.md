# Kill clock — Lane 1 (rules, persistence, browser UI, docs, tests)

Branch `claude/muju-kill-clock`, worktree `/Users/ashkie/src/deevgames-killclock`, seed
`62a5703f`. This lane owns everything outside `src/ai/hard/**` + `lab/**` + `docs/hard-ai/**`
(lane 2) and `server/**` + `src/online/**` + Academy/MCP docs (lane 3). Per the coordinator's
instructions, nothing here was committed, pushed or deployed.

## Decisions taken

- **Home-checkmate gate confirmed, not re-implemented.** The seed already wires
  `killClockForbidsCheckmate` into `resolveHomeCheckmate` (`src/game/homeCheckmate.ts`) and
  `resolveInactivityDraw` (aliased `resolveKillClock`) into `handOffTurn` (`src/game/turn.ts`),
  with the kill-clock verdict resolved and returned *before* `startTurn` runs for the next
  player — confirmed by reading, not by editing. Verified by new tests (d)/(e) below.
- **`GameResult.reason` gains `'kill-clock'`.** `getGameResult` (`src/game/victory.ts`) only
  special-cased `victoryReason === 'inactivity'` for a draw's `reason` field; a kill-clock tie
  (`victoryReason: 'kill-clock'`, `winner: null`) was falling through to a bare `{status:'draw'}`.
  Fixed so both archived and live draw reasons surface through `getGameResult`.
- **Persistence: three stacked legacy clocks, not two.** Schema went 9 → 10. Pre-schema-10 saves
  now split into two legacy branches instead of one: schema 5-7 (`muju-phasing-1`, ten-ply draw)
  and schema 8-9 (`muju-phasing-2`, twenty-ply draw). `LEGACY_INACTIVITY_LIMIT` was repurposed by
  the seed's `inactivity.ts` to mean the *twenty*-ply limit (previously it meant the *ten*-ply
  one), so the old ten-ply legacy value needed a new, separately-pinned name:
  `PHASING_1_DRAW_LIMIT = 10` in `src/utils/persistence.ts`, explicit precisely because it is
  numerically identical to the live kill clock's own limit but a different rule (draw vs.
  mined-total). Each legacy branch is adjudicated once under its own recorded (limit, verdict);
  a still-playing position then restarts its clock at 0 for the live kill clock — this now
  applies to schema 8 *and* 9 (both `muju-phasing-2`), where the old code only restarted schema
  <8 saves, because schema 8/9 used to be the *live* schema and now are *both* legacy.
- **Kill-clock lead marker placement.** Placed beside the primary `◆ {resources}` bank figure in
  the score-strip (not beside "Gained N"), since that is what a player perceives as "the crystal
  count"; computed once per render (`whiteMined`/`blackMined` via `minedTotal`) and reused for
  both the marker and the `VictoryScreen` `minedTotals` prop.
- **VictoryScreen gained a `minedTotals` prop.** Needed for the spec's literal wording ("…ended
  the kill clock ahead on mined crystals, N to M"). Only `GameScreen.tsx` renders `VictoryScreen`
  (online and local games share this one path), so `state.players` was already in scope; no
  lane-3 (`src/online/**`) file needed a change for this.
- **`INACTIVITY_LIMIT`/`INACTIVITY_WARNING` already flow through the UI dynamically** (progress
  clock, `InstructionsModal`, `ModeSelect`) from before this change; only the prose around them
  (draw → kill-clock verdict, checkmate gate) needed rewriting.
- **SPEC.md's stacked "Retained from vX" banners.** Removed the now-superseded "Retained from
  v3.0" banner (its twenty-ply-clock claim is fully replaced by the new top banner and already
  duplicated in the historical "History:" list) rather than leaving two contradictory current-tense
  claims in the same document.
- **Test files outside the literally-named list.** `tests/ai/upkeep-clock.test.ts` (under
  `tests/ai/*.test.ts`, not caught by a constant-name grep) encoded a scenario whose premise
  inverted under the new rule — see "AI incentive change" below — and was rewritten rather than
  patched. `tests/game/tier3-cap.test.ts` pinned `SCHEMA_VERSION` as an incidental assertion and
  was fixed in place.

## AI incentive change (real behavior, not a bug)

`tests/ai/upkeep-clock.test.ts` originally asserted "Medium takes a kill to reset an imminent
draw despite passive income," with White already ahead on mined total. Under the kill clock,
that premise is backwards: a side ahead on mined total can rationally let the clock expire
instead of trading, because coasting to the terminal *is* the win. Measured: Medium, given that
exact original position, now correctly lets the clock decide and wins by kill-clock rather than
attacking — this is verified as a new passing test rather than dismissed as a regression. The
"must not let the clock run out" case was rebuilt with White *behind* on mined total, where a
kill genuinely is necessary to avoid a clock loss; that is covered directly at the
`evaluatePosition`/rules level (a loss scores below −1000 vs. a live position after the kill),
since full-search tactical strength is out of this lane's scope (SPEC's "tuning deferred").

## Node-by-node dispositions

### 1. rule-contract — `SPEC.md`, `JUDGMENT_LOG.md`

**CHANGED.** `SPEC.md` v3.2 → v3.3: new top banner, §9 "Kill clock" bullet fully rewritten
(limit 10, amber at 7, mined-total verdict, Black's handicap counted, the `c` checkmate gate
spelled out with its ≤8/=9/=10 cases), §9 home-occupation bullet gained the checkmate-gate
paragraph, §1 "Stored artefacts by rules revision" updated (`muju-phasing-3` playable rooms,
`muju-phasing-2` added to the retired list, schema 10), §2's `END_PLACE_PHASE` line, §10's
schema mention, and a new History entry. Removed the now-stale "Retained from v3.0" banner
(see Decisions). `JUDGMENT_LOG.md` gains **J-024**, superseding J-021's threshold and draw
verdict, recording the handicap-counts decision, the `c ≥ 9` checkmate rule, and what stayed
deliberately unchanged (what counts as progress, the clock's cadence, the `off` escape hatch).
Evidence: `tests/game/upkeep-draw.test.ts` describe block `muju-phasing-3 kill clock` pins
`INACTIVITY_LIMIT === 10`, `INACTIVITY_WARNING === 7`, `LEGACY_INACTIVITY_LIMIT === 20` outright.

### 3. board-rules — `src/game/board.ts`

**VERIFIED UNCHANGED.** `grep -n "inactivity|draw|quiet" src/game/board.ts` returns only the
`inactivityPlies: 0, progressThisTurn: false` initial-state fields (unchanged values, unchanged
comments — there are none to update). No reserve, budget or handicap constant touched.

### 4. transitions — `src/game/*`, `src/ai/simulate.ts`, `src/hooks/*`

**CHANGED** (mostly already done by the seed; confirmed and completed here).
- `src/game/inactivity.ts`, `src/game/homeCheckmate.ts`, `src/game/types.ts`: seed-committed,
  read and confirmed correct — `resolveInactivityDraw`'s default verdict is `'mined-total'`,
  `handOffTurn` in `src/game/turn.ts` resolves it and returns before `startTurn` when the game
  ends (`if (completed.phase === 'victory') return completed;`), so no turn-start home-occupation
  check, upkeep or healing can override the kill clock — verified by reading, not editing.
  `killClockForbidsCheckmate` is wired into `resolveHomeCheckmate` with the `c ≥ 9` gate exactly
  as the spec computes it (`progressThisTurn ? 0 : inactivityPlies + 1`).
- `src/game/victory.ts`: **CHANGED** — `GameResult`'s `reason` union gained `'kill-clock'`;
  `getGameResult` now surfaces it for a kill-clock tie, not just an archived `'inactivity'` draw.
- `src/game/moveHistory.ts`: **VERIFIED UNCHANGED.** `describeTransition`'s `result` event notation
  (`'Draw'` / `'{winner} wins'`) and `description` (`reason.replaceAll('-', ' ')`) are already
  reason-agnostic; `VictoryReason` already includes `'kill-clock'` (seed). Confirmed by the
  existing e2e assertion `controls.getByRole('status')).toHaveText('Draw')` passing unmodified.
- `src/game/replay.ts`: **VERIFIED UNCHANGED.** Contains no call to `resolveInactivityDraw`, no
  clock constant and no victory-reason branch — it only replays already-computed frames, so an
  archived `muju-phasing-2` record's stored frames display exactly as recorded regardless of the
  live constant's new meaning.
- `src/game/migrate.ts`: **VERIFIED UNCHANGED.** `migrateLegacyGame` is the pre-schema-5,
  six-action migration; unrelated to this clock revision (its own comment already explains why
  it zeroes the clock, for a different historical reason).
- `src/ai/simulate.ts`: **VERIFIED UNCHANGED.** The kill-reset line
  (`{...state, inactivityPlies: 0, progressThisTurn: true}`) and the `resolveHomeCheckmate` call
  sites are exactly what the spec says stays unchanged ("what resets the clock is unchanged").
- `src/hooks/useAI.ts`, `src/hooks/useGameState.ts`: **VERIFIED UNCHANGED** (grep: no clock
  constant, reason string or victory branch in either).
- `src/ai/evaluation.ts`, `src/ai/planner/scoring.ts`: **VERIFIED UNCHANGED, and already
  correct.** Both key off `getGameResult(...).status`, not a hardcoded "inactivity is always a
  draw" assumption: a decisive kill-clock terminal already returns `status: 'victory'` (scored
  ±100000 same as any other win/loss); only a genuine tied mined total returns `status: 'draw'`
  (scored 0, which is correct — it *is* a real draw). New test
  (`tests/ai/upkeep-clock.test.ts`, "scores an imminent kill-clock loss far below the kill that
  avoids it") proves this at the evaluation level: a same-turn pass that lets the clock decide
  against White scores below −1000; taking the available kill instead scores over 1000 higher.
- Evidence: `npx vitest run tests/game tests/ai/phasing.test.ts tests/hooks tests/ai/upkeep-clock.test.ts`
  and the rest of `tests/ai/*.test.ts` (below).

### 5. rules-docs — `SPEC.md` + others

**CHANGED** (`SPEC.md`, `JUDGMENT_LOG.md` — see node 1). **VERIFIED UNCHANGED, checked and left
alone:** `muju/docs/AI_IMPLEMENTATION_STATUS.md` (its one hit is a v1.6-era historical link,
not a current claim), `docs/game-design-dossier.md`, `portfolio/index.html`,
`muju/docs/PROMPT_scripted_bots_online.md` — a full-repo grep for `inactivity|quiet turn|draw
clock|20 quiet|twenty.ply|kill.clock` found no hits in any of these four files.

### 6. browser-ui — `src/components/**`, `src/index.css`, `src/App.tsx`

**CHANGED.**
- `src/components/GameScreen.tsx`: added `minedTotal` import, `whiteMined`/`blackMined`/
  `minedLeader` computation, the `▲` marker span beside each side's `◆` bank figure (visible only
  for the leading side, nothing on a tie), and threaded `minedTotals` into `VictoryScreen`. The
  `x/10` clock and amber-at-7 warning were already generic (`INACTIVITY_LIMIT`/
  `INACTIVITY_WARNING`), unchanged.
- `src/components/VictoryScreen.tsx`: new optional `minedTotals` prop; heading branches
  `'Draw by kill clock'` vs. the legacy `'Draw by inactivity'` (archived reason); body text for a
  decisive kill-clock win reads "…ended the kill clock ahead on mined crystals, N to M" and for
  a tie states the clock and the tied total, per the spec's literal wording.
- `src/components/InstructionsModal.tsx`: "Win the game" page rewritten (mined-total verdict,
  Black's handicap counted, the checkmate-gate clause added to the home-occupation paragraph);
  "Controls & undo" page's "quiet clock" renamed "kill clock".
- `src/components/ModeSelect.tsx`: mode blurb rewritten from "Draw after N…" to "…higher mined
  crystals wins (a tie draws)."
- `src/index.css`: new `.mined-lead` rule (8px, 70% opacity, same gold as the bank figure) —
  intentionally understated per the owner's "subtle marker" instruction.
- **VERIFIED UNCHANGED:** `src/App.tsx`, `src/components/TurnReplay.tsx` (no draw/inactivity/
  clock text at all), `AIThinkingTimer.tsx` (its "draw"/"amber" hits are canvas-drawing and
  hue-interpolation code, unrelated).
- Evidence/screenshot: `docs/changes/2026-09-22-kill-clock-evidence/hud.png` — captured via a
  short Playwright script (the `chrome-devtools` MCP screenshot tool timed out repeatedly in
  this environment regardless of page/tab; Playwright, already proven working by the e2e runs
  below, was used instead) against the real built app with a seeded save
  (`inactivityPlies: 7`, White `resourcesGained: 12` vs. Black `5`). It shows "7/10 turns without
  a kill" in amber and a small `▲` beside White's `◆ 12` only. **Judgment on legibility:** the
  marker is genuinely subtle at normal viewing size (small, low-opacity, no color distinct from
  the existing bank-figure gold) but reads clearly on inspection/zoom, and Player 2's lower total
  correctly shows no marker — this matches "a small caret/dot… not a banner."

### 7. persistence — `src/game/migrate.ts`, `src/game/replay.ts`, `src/game/moveHistory.ts`, `src/utils/persistence.ts`

**CHANGED** (`persistence.ts`; the other three are covered under node 4 as verified-unchanged
since their disposition is about the clock's plumbing, not schema versioning).
`src/utils/persistence.ts`: `SCHEMA_VERSION` 9 → 10; `READABLE_SCHEMA_VERSIONS` gained explicit
`9`; new exported `PHASING_1_DRAW_LIMIT = 10` (see Decisions); `loadGameState`'s legacy-clock
branch now picks `{limit, verdict}` from schema (5-7 → `{10, 'draw'}`, 8-9 → `{20, 'draw'}`, 10 →
live default), adjudicates once, and restarts a still-playing position's clock at 0 exactly as
the old code did for schema <8 — now correctly covering schema 8 and 9 too, since both are
legacy relative to the new schema 10.
Evidence: `tests/save-rules-revision.test.ts` (11 tests) — pins the three-clock mapping, restart
behavior for both legacy tiers independently, finished-draw preservation for both tiers,
leaves-a-v10-save-alone, and case (g) directly ("a schema-9 unfinished save restarts at 0 and
stamps muju-phasing-3; a finished schema-9 draw stays a draw"). `tests/game/standard-save-archive.test.ts`
"resumes a Phasing schema-8 save…" was updated to expect the restart (previously schema 8 was
the live schema and wasn't restarted; now it is legacy and is).

### wasm-tactics — VERIFIED UNCHANGED (not a numbered node I own to change, confirmed per instructions)

`grep -rniE 'inactiv|progress|draw|clock|quiet|kill' assembly src/ai/wasm/kernel.ts` returns only
combat "killed" flag bits (`lastAttackKilled`), unrelated to the kill clock. `git diff --stat --
assembly src/ai/wasm` is empty. The kernel has no clock term; `npm run ai:wasm` was correctly run
by `npm run build`'s `prebuild` hook regardless (unconditional), and the committed `.wasm` is
unaffected.

### ai-search — `src/ai/` outside `hard/`

**CHANGED** (`tests/ai/upkeep-clock.test.ts`, `tests/ai/phasing.test.ts`; source files covered
under node 4). No source file outside `hard/` needed a code change beyond what node 4 already
covers — `evaluation.ts`/`scoring.ts` were already correct by construction (see node 4). Full
sweep of every `tests/ai/*.test.ts` except `hard/`: 20 files, all green except the one
cross-lane dependency below.

### balance-analysis — VERIFIED UNCHANGED

`grep -rni 'inactiv|quiet|draw' lab/solver/*.ts` returns zero hits; `git diff --stat --
lab/solver lab/results/current-static` is empty. The static solver has no clock, quiet-turn or
draw term at all, so `current-static`'s dominance/witness results cannot move with this rule —
correctly NOT regenerated (regenerating an unchanged report would only add diff noise).

## Tests added (spec §5)

- (a) kill on the ninth kill-free ply resets the clock and play continues —
  `tests/game/upkeep-draw.test.ts`.
- (b) tenth kill-free ply ends on mined totals, Black's handicap counted —
  `tests/game/upkeep-draw.test.ts`.
- (c) a tie is a draw, winner null — `tests/game/upkeep-draw.test.ts`.
- (d) invader at `c = 8` gets `#`, at `c = 9` does not — `tests/game/home-checkmate.test.ts`,
  built on the same "unanswerable arrival" fixture already proven to be a real mate.
- (e) `c = 10` hand-off ends on totals, never pre-empted by a mate award —
  `tests/game/home-checkmate.test.ts`.
- (f) an occupier at the tenth ply does not win by occupation —
  `tests/game/upkeep-draw.test.ts` ("ends before the next home win, healing or upkeep"), which
  places an occupier on the enemy corner and confirms the result is `kill-clock`, not
  `home-occupation`, and that `startTurn` on the now-finished game is a no-op.
- (g) a schema-9 unfinished save restarts at 0 and stamps `muju-phasing-3`; a finished schema-9
  draw stays a draw — `tests/save-rules-revision.test.ts`, both halves as one test.

## Blocked / cross-lane dependencies (2 tests, both outside this lane's file ownership)

Both are real target-behavior assertions, not weakened to pass, and both should turn green once
the named lane-2 file is updated — nothing on this lane's side is missing.

1. `tests/ai/phasing.test.ts` — "fixed-work Phasing self-play is reproducible, purchases and
   terminates legally": asserts `a.rules === 'muju-phasing-3'` (via `LADDER_RULES_VERSION` from
   `lab/hard-ai/ladder/ruleset.ts`, lane 2's file). That constant is still `'muju-phasing-2'` as
   of this writing. **Not a rules bug on this lane's side** — `src/ai/hard/config.ts`'s
   `PHASING_RULES_REVISION` (also lane 2's, already bumped) is what `positionReport.ts` and the
   compact-report tests read, and both already pass at `'muju-phasing-3'`.
2. `tests/ai/upkeep-clock.test.ts` — "harness records a real kill-clock terminal separately from
   its safety cap": asserts `record.inactivityDraw === true` for a kill-clock termination.
   `lab/harness/runner.ts:397` (lane 2's file) computes
   `inactivityDraw: state.victoryReason === 'inactivity'`, a literal that does not yet also
   match `'kill-clock'`. Note: `winType` on the same record already correctly reads `'kill-clock'`
   (that line already does `state.victoryReason ?? …`, no literal to update), so only this one
   field is stale.

## Test counts (exact)

- Owned unit/component suite (`tests/game`, `tests/ai/phasing.test.ts`,
  `tests/save-rules-revision.test.ts`, `tests/hooks`, `tests/ai/wasm-tactics.test.ts`,
  `tests/compact-report.test.ts`, `tests/replay.test.ts`, `tests/components`,
  `tests/ai/upkeep-clock.test.ts`): **55 files, 696 tests, 694 passed, 2 failed** (both listed
  above, both cross-lane).
- Remaining `tests/ai/*.test.ts` (excluding `hard/`, excluding the two above): **19 files, 200
  tests, all passed.**
- Combined owned AI+game+hooks+components scope: **74 files, 896 tests, 894 passed, 2 blocked.**
- `npx tsc -p tsconfig.json --noEmit`: clean, 0 errors.
- `npm run build`: succeeded (`tsc && vite build`, WASM prebuild included).
- e2e against a served build:
  - `e2e/upkeep-draw.spec.ts`, `e2e/metal.spec.ts`, `e2e/mobile.spec.ts`,
    `e2e/action-budget.spec.ts` (via `npx vite preview` on 8927): **26/26 passed.**
  - `e2e/analysis.spec.ts` local-only subset (same static preview): **6/6 passed**; its 11
    online-room subtests need the authoritative server (the file's own online subtests are also
    listed in `playwright.online.config.ts`'s `testMatch`, which the default
    `playwright.config.ts` doesn't run) — run under `npx playwright test --config
    playwright.online.config.ts e2e/analysis.spec.ts`: **17/17 passed**, confirming the earlier
    failures under a hand-started server were an artifact of that ad hoc setup (missing
    `PUBLIC_URL`/CORS wiring the online config's own `webServer` block supplies), not a
    kill-clock regression — the room-side state independently verified correct via direct
    `curl` calls to the hand-started server (`phase: victory, winner: white, victoryReason:
    resignation`) before switching to the proper config.

## Screenshot

`docs/changes/2026-09-22-kill-clock-evidence/hud.png` — see node 6 above for how it was captured
and the legibility judgment.
