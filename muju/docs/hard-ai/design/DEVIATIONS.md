# Deviations from DESIGN.md

Dated entries, one heading per milestone. Each entry documents where the
implementation departed from the literal text of `docs/hard-ai/DESIGN.md`,
why, and which contracts were preserved.

## M1

### 2026-09-14: `verify` layer also imports `src/ai/moves.ts`

DESIGN §2 says: "`verify` imports `core`, `gen`, `src/game/*`, `src/ai/simulate.ts`".
`src/ai/hard/verify/perft.ts` (the canonical-only half built at M1) needs to
*generate* legal actions, not just apply them — `applyAction` alone cannot
enumerate a turn. `src/ai/moves.ts generateAllActions` is the canonical
engine's own move generator (used identically by `lab/experiments/opening-census-2026-09-14/census.ts`
and `tests/fixtures/analysis.ts`), so it is the obvious, minimal addition.
`lab/hard-ai/deps.ts` allows `src/ai/moves` from the `verify` (and `engine`)
layer's external allow-list; every other external-import restriction in §2 is
enforced as written, including the `lab/solver/**`/`engine-v2`/`planner`/
`search`/`evaluation` ban.

### 2026-09-14: `perftTurns`/`perftMidStates` internal depth default

DESIGN §4 freezes `perftTurns(state: GameState): number` and
`perftMidStates(state: GameState): number` with no `maxActions` parameter,
while `perftActions(state, maxActions)` takes one explicitly. For the initial
position this is exact — the Action phase is bounded to `actionsPerTurn` (4)
plies regardless of the cap. It is not exact in general: a position that is
mid-Place-phase with substantial reserves (e.g. the `rich-place` fixture) has
no natural bound on Place-phase branching without an explicit cap. The two
parameterless functions use an internal `DEFAULT_MAX_ACTIONS = 4`
(`src/ai/hard/verify/perft.ts`); this is correct for the initial position (the
only place §7.2 requires an exact value from them) and is documented as not
intended for Place-phase-heavy positions in the module's own doc comment.
Callers that need a bounded Place-phase enumeration call `perftActions`
directly with an explicit `maxActions` — which is exactly what
`lab/hard-ai/perft/run.ts` does for all 11 authored fixtures (each with its
own frozen, small `depth`), rather than calling the parameterless functions
on them.

### 2026-09-14: `constants.test.ts` covers only what M1's own deliverables can check

DESIGN §7.8 (R13) lists `catalog.power` agreement with `calculateAttackPower`
and the `PST_MINE`/`CORNER`/`CORNER_NEIGHBOURS` check values as part of the
constants-agreement test. Those symbols live in `src/ai/hard/core/{catalog,tables}.ts`,
which do not exist until M4. `tests/ai/hard/constants.test.ts` (an M1-only
file — M4 does not modify it) checks every constant that exists at M1:
`ACTIONS`/`isActionsPerTurn` (`rules.ts`), `INITIAL_MAP_RESOURCES`,
`MAX_RESOURCE_RESERVE`, `UPKEEP_BY_TIER` (tiers 1-3), `INACTIVITY_LIMIT`,
`INACTIVITY_WARNING`, tier-1 catalogue prices, `PROOF_NODES` (read from
`homeCheckmate.ts`'s source text, since the constant is private and
`src/game/**` may not be edited to export it), `MAX_BLACK_CRYSTAL_HANDICAP`,
and `lab/solver/model.ts`'s `ACTIONS`. M4 should add the catalog/PST/CORNER
checks to a new test (or extend this one) once `core/catalog.ts` and
`core/tables.ts` land, per DESIGN §7.8.

### 2026-09-14: `muju-position-v1` format defined by this milestone

DESIGN does not give `muju-position-v1`'s field-level JSON schema, only its
required content ("the mandatory `rules` block (`elementGraph`, `upkeep`,
`inactivityRule`, `victoryRule`, `handicap`, `combatHandicap`)", §7.5). M1
(the milestone that creates `lab/hard-ai/positions/corpus.ts`) defines the
concrete shape: one JSON object per line, `{schema: 'muju-position-v1', id,
tags?, rationale?, depth?, rules, state}`, where `state` is a real
`GameState` and `rules` restates all six DESIGN §7.5 knobs (the three true
process globals — `elementGraph`, `upkeep` variant, `combatHandicap` — plus
the three knobs already embedded on `state` itself — `victoryRule`,
`inactivityRule`, `blackCrystalHandicap` — so every consumer has one place to
read the whole configuration). `readPositions`/`writePositions`/`findPosition`/
`mirror180` are `corpus.ts`'s exported surface; later milestones (`fuzz-1000.jsonl`
at M5, `midgame.jsonl` at M14+) are expected to use the same format and reader.

### 2026-09-14: 11 authored fixtures built programmatically, not literally reverse-engineered from citations

DESIGN §7.2 cites specific provenance for two fixtures — `home-race`
("archived fixture at rev 7") and `promotion-kill` ("SU addendum 1, rev 7") —
against `tests/fixtures/codex-claude-2026-09-12.json`. That fixture's replay
log uses its own `revision` numbering (2..35), not divisible into the "rev 7"
citation in an unambiguous way (revision 7's *resulting* position already has
White's home corner approach sealed by Black — see the SU addendum's own
account of Black's turn-3 `BUY plant_1@I10` closing the window "exactly one
turn" after White's turn-3 chance). `home-race` uses `tests/fixtures/analysis.ts
matchPositions().positions.get(5)` (`= match.initialState` verbatim — White to
move, turnNumber 3): concretely verified, `BUY lightning_1@G1` then a legal
4-action `MOVE` chain (G1→G4→G7→G10→J10, BFS distance exactly 12 = 4×SPD3)
reaches the enemy corner, matching the addendum's line exactly.
`promotion-kill` uses `positions.get(8)` (Black to move, turnNumber 4): the
actually-recorded reply from that position is `PROMOTE_UNIT` followed by a
kill in the same turn (command revision 9's real action log), i.e. a genuine
promotion-then-kill turn from the same archived game, one turn later than the
home-race window closed. The other 9 fixtures (`occupied-corner`,
`blocked-rectangle`, `cleave-chain`, `clock-9`, `upkeep-pending`, `rich-place`,
`endgame-dry`, `handicap-3`, `place-autoskip`) are constructed directly (not
sourced from the archived match) and each is verified programmatically at
generation time (e.g. `cleave-chain`'s three chained one-shot kills are
actually executed and checked, not assumed); see the `rationale` field of
each entry in `authored.jsonl` and the corresponding assertions in
`tests/ai/hard/perft.test.ts`.

### 2026-09-14: `rich-place` frozen at `maxActions = 1`

DESIGN's citation for this fixture ("the 192-buy node") suggests a rich
Place-phase branching example. At 40 crystals the actual branching factor is
large enough (~176 first actions, most of them still affordable BUY choices)
that `maxActions = 2` already takes ~35s to enumerate and `maxActions = 3`
does not finish in a reasonable time — a single fixture eating that much of
the "< 3 min" M1 gate budget alongside `hard:deps` and the vitest run is not
sound engineering. `depth = 1` (`sequences = 1`, ~200ms) is used instead: a
trivial-looking frozen number, but the fixture still exists, still carries 40
crystals and a real anchor, and remains available for a future milestone
(e.g. M13's purchase generator) to enumerate more deeply through its own
bounded tooling rather than through the parameterless perft functions.

### 2026-09-14: `hard:verify`'s gate-chain execution model

DESIGN §7.1 says the runner "executes `command args` with `execFileSync`...
reads `artifact` (JSON written by the command)". M1's actual gate command
(`hard:perft --check --out <path> && hard:deps && vitest run ...`) has only
its first step write to `<path>`; `hard:deps` and the vitest step do not take
an `--out` flag in the literal command text MILESTONES.md gives. `lab/hard-ai/verify/run.ts`
therefore splits `command` on `&&` and runs each step in turn (stopping at the
first non-zero exit, matching shell semantics); for the two well-known tool
shapes that don't redirect their own output (`npm run hard:deps`, `npx vitest
run ...`) it captures stdout and derives `depsViolations`/`vitestFailures`
from it (adding `--reporter=json` to the vitest invocation transparently,
without changing the human-readable `command` string recorded in the
artifact); any other step's artifact file (if the step wrote one) is merged
into `metrics` afterward. This keeps the gate table's `command` field exactly
the string MILESTONES.md specifies while still letting the criterion read
`depsViolations`/`vitestFailures` alongside the perft fields.

## M2

### 2026-09-14: the §7.7 "axis rule" is not enforced as a runtime rejection

DESIGN §7.7 states: "Axis rule: `wall:` for any pairing involving `aiv2-*` or
a scripted bot; `fixed:` only between `hard@*` entries." Taken literally as a
validation rule, `hard:ladder` would have to reject the M2 gate row's own
calibration/self-play commands, which pair `aiv2-medium-fast` against `Rush`
and against itself using `--work fixed:1200`. Read structurally instead
(`src/ai/runtime.ts`: "Search work is deterministic when maxWork is used
without a deadline"), `fixed:` is the mode that makes a decision
bit-reproducible (no wall-clock deadline anywhere in the decision pipeline,
only a pure work-unit counter) — which is exactly what M2's calibration rows
need (infra correctness: pairing/legality/adjudication mechanics, not a
strength claim) and what `hard:determinism` (§7.4) requires to get identical
results across processes. `wall:` is the mode for a real strength SPRT
against an engine of a different shape, where a raw work-unit count would not
be comparable. `lab/hard-ai/ladder/engines.ts` implements `fixed:`/`wall:`
exactly this way (`fixedWork` config vs. `mctsTimeLimit` + real decision-ms)
for every `aiv2-*` entry, and `hard:ladder`/`hard:determinism` do not reject
any `--a`/`--b`/`--work` combination on the axis-rule text — the rule is
documentation of which mode is meaningful for which purpose, not a runtime
gate. M14's `hard@*` engines, once real, are expected to honor the same
`fixed:`/`wall:` semantics the ladder already defines.

### 2026-09-14: M2's gate artifact is assembled by sibling-directory convention, not by `hard:verify`

The M2 gate row chains three `--out`-writing commands to three different
paths (`M2-calib/`, `M2-self/` — directories; `M2.json` — a file) and DESIGN
§7.7's note "artifact merges the three outputs" doesn't say which tool does
the merging. `lab/hard-ai/verify/run.ts` (M1, not owned by this milestone)
only reads one `gate.artifact` path per gate. Rather than touch that file,
`lab/hard-ai/verify/determinism.ts`'s `--out` writer generically scans its
own output directory for sibling directories named `<stem>-<label>` (matching
its own `--out`'s basename without `.json`) containing a `metrics.json`, and
folds each one in under `{[label]: ...}` — plus its own fields nested under
`determinism`, so gates that use `hard:determinism` standalone can still read
its fields at the top level. Because the M2 gate row's three `--out` values
are literally `.../M2-calib`, `.../M2-self`, `.../M2.json`, this generic
convention happens to produce exactly the `{calib, self, determinism}` shape
`gates.ts`'s M2 criterion reads, with no gate-specific code in `determinism.ts`
and no change to `verify/run.ts`. `lab/hard-ai/ladder/run.ts` writes a
`metrics.json` inside every `--out` directory specifically so this convention
has something to find.

### 2026-09-14: `hard:ladder`'s `--work` axis is engine-family-specific, not a literal node count everywhere

`fixed:<units>` is documented in `engines.ts` as "sets `AIEngineConfig.fixedWork`
to `units`" for `aiv2-*` names — there is no cross-engine-family "work unit"
yet (that only becomes meaningful once `hard@*`'s replica search, with its
own `WORK_COST`/`WORK_LADDER` constants from DESIGN §8, exists at M14).
Scripted bots ignore `--work` entirely (`engines.ts#scriptedEngine`) since
they have no internal search budget. This is flagged here because a future
milestone comparing `hard@*` against `aiv2-*` at the *same* `fixed:<units>`
value should not assume the two engines spent comparable effort — only
`wall:<ms>` is a fair cross-family axis, consistent with the axis-rule
deviation above.

## M3

### 2026-09-15: `HardSearchStats`/`RootResult['source']` declared locally in `protocol.ts`

DESIGN §6.1's `TurnResult` (`src/ai/worker/protocol.ts`, this milestone) types
`stats: HardSearchStats` and `source: RootResult['source']`. Both live in
`src/ai/hard/search/{pvs,root}.ts` per DESIGN §4.16, which do not exist until
M14 — M3 only depends on M2. Follows the precedent `src/ai/hard/config.ts`
(M4) already set for exactly this situation (see that file's top-of-file
comment and the M4 deviation above): the shape is declared once, here, with a
comment naming the real owner; `HardSearchStats` is copied verbatim from
DESIGN §4.16 and `RootSource` is `RootResult['source']`'s literal union.
TypeScript's structural typing means M14's real `search/pvs.ts`/`search/root.ts`
exports are assignable to these without protocol.ts needing to import them —
no cycle, since `search/*` is free to import from `worker/*` if it ever needs
to, but does not need to for this to type-check. **Binding on M14:** keep
`HardSearchStats`'s field set and `RootResult['source']`'s union exactly in
sync with `protocol.ts`'s copies (or, cleaner, have `protocol.ts` import them
from `search/pvs.ts`/`search/root.ts` once those modules exist and delete the
local declarations — either is fine since the shapes are frozen by DESIGN §4.16
already).

### 2026-09-15: `lab/hard-ai/verify/run.ts` gains Playwright JSON-reporter parsing

Not in M3's file list, but the M3 gate row's pass criterion needs an
`e2eFailures` metric from its `npx playwright test ...` step, and `run.ts`
(M1) only knew how to derive metrics from `npm run hard:deps`, `npx vitest
run`, and `npx tsc`/`npm run hard:types` steps. Minimal additive change,
mirroring the existing vitest handling exactly: a step matching `npx
playwright test` gets `--reporter=json` appended transparently (the
human-readable `command` string recorded in the gate artifact is unchanged),
and its last top-level JSON stdout line's `stats.unexpected` becomes
`metrics.e2eFailures`. No existing gate uses a playwright step, so this is
purely additive — every prior gate's parsing is untouched. Per the worktree
rule ("a shared file genuinely needs a change outside your list, make the
minimal additive change and report it").

### 2026-09-15: `playwright.hard.config.ts`'s `webServer.command` builds before it previews, with `npx vite build` — not `npm run build`

MILESTONES.md's prose gives the `webServer` as "`vite preview --port 8927`".
Taken literally, that fails on a clean checkout / a worktree whose `dist/`
predates this change — `vite preview` serves whatever was last built, it does
not build. `webServer.command` is `npx vite build && npm run preview --
--port 8927` instead, so `npx playwright test --config playwright.hard.config.ts
...` is a single self-sufficient command exactly as `hard:verify`'s gate
contract requires (DESIGN §7.1: "every gate command is itself a single npm
script invocation or a `&&` chain"). `baseURL`/the served origin are
unchanged (`http://127.0.0.1:8927/muju/`, the same port `playwright.config.ts`'s
default `MUJU_BASE_URL` already assumes for this project's other,
externally-served e2e suites).

Specifically `npx vite build`, not `npm run build` (`tsc && vite build`,
`prebuild: npm run ai:wasm`): this worktree is shared with other milestone
agents editing concurrently, and `npm run build`'s `prebuild` hook recompiles
the shared `src/ai/wasm/tactics.wasm` via `asc` — exactly the WASM-recompile
race the worktree's own binding rules ban `npm test` for ("its pretest
recompiles the shared WASM kernel and races with other agents"). Observed
directly: the gate's first attempt failed with `webServer` exit code 2 from
exactly this race. `npx vite build` bundles the app against whatever
`tactics.wasm` already exists on disk without writing to it, and — since Vite
does not typecheck — also skips the whole-project `tsc` pass, which is both
redundant with this milestone's own separate `npx tsc --noEmit -p
tsconfig.json` check and itself exposed to transient errors from other
agents' concurrent edits elsewhere under `src/`.

### 2026-09-15: `wall:<ms>` is funded per TURN on both shapes, so `aiv2-*` splits it across its decisions

DESIGN F3 states the axis as "wall-clock (`wall:<ms>` per turn)" and §7.7's
`hard@*` bot adapter searches once per turn, but `ladder/engines.ts` as first
written handed `work.ms` to every `findBestAction` **call**. Since the
per-action names decide ~`ACTIONS + 1` times a turn and the `-turn` names
once, `--work wall:1000` was funding `aiv2-hard` about five times the thinking
time of `aiv2-hard-turn` — the M3 calibration row measured the turn path at
−190.8 Elo (µ 0.25, LOS 2e-12) where EG G12 predicts +30…60, purely from the
axis. M3's own criterion excludes Elo, so this never failed the gate; it would
have made M19's first SPRT row meaningless.

`createAiv2Bot` now carries a per-turn `remainingMs` (reset when
`turnNumber`/player changes) and asks for `remainingMs / decisionsRemaining`,
debited by what the search actually spent — the identical split the shipped UI
uses on `useAI.ts`'s per-action fallback, so the ladder's `aiv2-*` is now the
same bot the player faces. `createAiv2TurnBot` draws its one search from the
same per-turn remainder, so a plan that runs out mid-turn re-searches on what
is left instead of restarting the clock. `fixed:<units>` is deliberately
untouched and stays per-decision: it exists for `hard:determinism` (§7.4) and
the axis rule confines it to `hard@*`-vs-`hard@*`, which is same-shape on both
seats. M2's three gate rows are all `fixed:1200` and are unaffected.

### 2026-09-15: per-seat latency in the harness (`PlayerGameStats.decisionMs`/`.turnsTaken`)

`ladder/run.ts` derived both `meanTurnMs.a` and `meanTurnMs.b` from
`GameRecord.durationMs` — one number per GAME — so the two were equal to the
last digit by construction (M3's artifact: a = b = 702.4585769986757; M2's
calibration row, where the engines genuinely differ: a = b = 415.0). M3's
criterion clause `meanTurnMs.a <= meanTurnMs.b * 1.05` was therefore vacuous
and the latency half of the gate proved nothing.

Fixed at the source rather than by relaxing the clause: `PlayerGameStats`
(DESIGN §7.7's v3 harness block) gains two optional additive fields,
`decisionMs` (wall-clock ms this seat's bot spent inside `nextAction` /
`chooseAction`) and `turnsTaken` (distinct turns this seat was on move for),
both accumulated in `lab/harness/runner.ts` around the existing decision site.
`computeMetrics` attributes them by seat via the pair spec it already resolves
(`spec.white === 'A'`), so each engine reports its own ms-per-turn. Both fields
are optional, so `muju-lab-game-v2` records still satisfy the type; `run.ts`
falls back to an even split of `durationMs` for records that lack them. Beyond
M3's listed files, and beyond §7.7's literal v3 field list, but the clause
cannot be made to mean anything without per-seat timing; per the worktree rule,
the change is minimal and additive.

### 2026-09-15: `verify/run.ts` reads a PRETTY-PRINTED runner report, not only a one-line one

The Playwright metric extractor added above copied `extractVitestMetrics`'s
"last stdout line that parses as JSON" scan. That works for vitest, which
prints its whole JSON report on one line, but Playwright's JSON reporter
indents by 2: its opening `{` sits alone at column 0 and the body runs to the
end of the stream, so every individual line is an unbalanced fragment and the
scan could never parse it. The consequence was silent and exactly backwards —
`metrics.e2eFailures` stayed ABSENT on a fully green Playwright run, so the
criterion's `e2eFailures === 0` clause failed the gate on a passing suite
(observed: `stats.unexpected: 0`, `2 passed`, gate FAIL). Both extractors now
share `readReport()`, which tries a one-line report first and then the column-0
`{ … }` block — each column-0 `}` from the last backwards as the closing brace,
so output printed after the report (a `webServer` shutting down) does not
defeat it — with a `pick` callback that rejects anything parsing to something
other than the report so the scan continues past nested fragments.

### 2026-09-15: `verify/run.ts` merges a gate's artifact only when the chain completed

`runGate()` merged `gate.artifact` into `metrics` unconditionally. A chain that
short-circuits never reaches its artifact-producing step, so the file still at
that path is a previous run's: M3's first red envelope carried `games: 24`,
`adjudicationRate: 0`, `meanTurnMs` and `elo: -190.85` from a ladder that had
finished five hours earlier, reading as if the red gate had fresh evidence.
`pass` was never at risk (it is guarded by `!failed`), but the record was
misleading. The merge is now conditional on `!failed`, and when it does happen
`metrics.artifactAt` carries the artifact's mtime next to the envelope's `at`.

### 2026-09-15: `thinkingDelay` restored to BEFORE each dispatch

M3's `dispatchOne()` moved the cosmetic delay after `onAction(action)`, so the
AI played its first action the instant the search returned and paused
afterwards — a user-visible pacing change, and on the per-action loop DESIGN
§6.4 keeps as the *unchanged* fallback. The delay is now awaited before the
dispatch on both paths, matching the pre-M3 ordering and DESIGN §6.2 ("stays
per dispatched action, outside the budget"), with `valid()` re-checked
afterwards because an undo/reload/restart can land inside the await.

## M4

### 2026-09-15: `PackedState` and its slot/flag constants are declared in `types.ts`

DESIGN §3.1 prints `MAX_SLOTS`/`NO_SLOT`/`DEAD`/`MAX_TURN_ACTIONS`/`F_*` and the
`PackedState` interface under a `// src/ai/hard/core/state.ts` header, but
`core/action.ts` (§3.2, this milestone) takes `PackedState` in four of its six
signatures — `toAIAction`, `fromAIAction`, `keepSetIds` and the exported
`unitIdFor`/`slotForId` helpers — and `core/zobrist.ts` (§3.3) takes it in all
three `recompute*`. `core/state.ts` does not land until M5. The declarations
therefore live in `src/ai/hard/types.ts` (DESIGN §2's "shared vocabulary"
layer, which everything may import and which imports nothing).

**Binding on M5:** `core/state.ts` must RE-EXPORT rather than redefine
(`export { MAX_SLOTS, NO_SLOT, DEAD, MAX_TURN_ACTIONS, F_CAN_ACT,
F_LAST_KILLED, F_PLACED, F_PROMOTED } from '../types'` and
`export type { PackedState } from '../types'`), so DESIGN §3.1's stated export
site stays exact and there is exactly one definition of the layout.
`types.ts` additionally exports `UFLAGS_MASK` (= 15), the upper bound of the
Zobrist `uflags` plane's index.

### 2026-09-15: the component config interfaces are declared in `config.ts`

DESIGN §4.17 defines `HardConfig extends SearchConfig` with fields typed
`QuiesceConfig`, `GenConfig`, `ActionSearchConfig`, `PurchaseConfig`,
`PurchaseWeights`, `DfpnConfig`, `TimeConfig`, `DeviceProfile`, `Weights` and
`Book` — which §4.13/§4.14/§4.15/§4.16 export from `gen/*`, `tactics/dfpn.ts`,
`eval/weights.ts`, `book/format.ts` and `search/*`. DESIGN §2's layering allows
`config.ts` to import `types.ts` and nothing else, and those layers all import
`config`, so importing them from `config.ts` would be both a layering violation
and a module cycle. All of those shapes (plus `BookEntry`, `SearchConfig`) are
therefore declared once, in `config.ts`.

**Binding on M11/M12/M13/M14/M16/M18:** the module DESIGN names as the export
site re-exports from `config.ts` (`export type { SearchConfig } from '../config'`
and so on) rather than redeclaring. Every one of those layers is already
permitted to import `config` by `lab/hard-ai/deps.ts`.

### 2026-09-15: values this milestone could only supply provisionally

- `PurchaseWeights` — DESIGN §5.5 names the eight terms of `squareScoreCc` but
  gives no coefficients. `config.ts` ships plainly-marked PROVISIONAL values
  (`mineCc 1, safeCc 100, blockCc 200, strikeCc 300, anchorCc 20,
  zeroSpawnCc 400, liquidityCc 50, homeRaceCc 5000`). **M13 owns them**; M18's
  SPSA tunes them.
- `HardConfig.weights` — `DEFAULT_WEIGHTS` is `eval/weights.ts` (M12).
  `config.ts` ships `placeholderWeights()`: 58 zeroed feature weights and the
  real `cost × 100` material priors of DESIGN F9 (`DEFAULT_MATERIAL_CC`, pinned
  against `catalog.cost` in `tests/ai/hard/catalog.test.ts`). **M12 replaces the
  `weights` field with `DEFAULT_WEIGHTS`.**
- `useLmr`/`useAspiration`/`useFutility`/`useExtensions`/`useDfpn` all default
  to `false`: DESIGN §5.11.5 requires each refinement to ship behind its own
  flag and be SPRT-gated separately at M20, and M16/M17 build them.
- `dfpn.nodeBudget` is the absolute `4000` of DESIGN §8; the `min(4000,
  limit/16)` clamp is a runtime decision for `search/root.ts` (M14), not a
  static config value.

MILESTONES.md says M4's `config.ts` is "types + default constants; profiles
filled at M15". DESIGN §6.3's profile table gives every number for all four
profiles, so `DESKTOP`/`MIDRANGE`/`PHONE`/`LAB` and `profileFor` are filled in
now and pinned by `tests/ai/hard/interfaces.test.ts`; M15 measures them
(depth-1 ≤ 150 ms on PHONE, p95 turn wall clock) rather than inventing them.

### 2026-09-15: `Scratch` takes an optional fourth constructor parameter

DESIGN §4.1 gives `constructor(maxPly, bbPerPly, i8PerPly)` but three
accessors, `bb`/`i8`/`i32`. `i32PerPly` is an optional fourth parameter
defaulting to `i8PerPly`, so the three-argument form in DESIGN remains valid.
Out-of-range `(ply, i)` throws `RangeError` rather than returning `undefined`.
Buffers are zeroed once at construction and are stable thereafter (the same
`(ply, i)` always returns the same object); they are NOT re-zeroed per access,
so callers that need a clean slate call `bbZero` themselves.

### 2026-09-15: `lab/hard-ai/deps.ts` gains a universal external allow-list

`src/ai/types.ts` (`AIAction`) appears in DESIGN §3.2 (`toAIAction`,
`fromAIAction`), §4.13 (`decodeTurn`), §4.16 (`RootOptions`/`RootResult`) and
§4.17 (`verifyTurn`), across the `core`, `gen`, `search` and `verify` layers;
`src/ai/runtime.ts` (`seededRandom`) is named by DESIGN §3.3 as the PRNG behind
`buildZobrist`. Neither was in §2's per-layer external allow-list.
`UNIVERSAL_EXTERNAL_ALLOWS = ['src/ai/types', 'src/ai/runtime']` adds both for
every layer — they are pure vocabulary/pure-function modules and neither
reaches the banned `engine-v2`/`planner`/`search`/`evaluation`/`lab/solver`
surfaces, which stay banned everywhere. This is the same shape of minimal
addition M1 made for `src/ai/moves`.

Note also that the `BigInt` ban is a text grep over whole lines, comments
included, so prose under `src/ai/hard/**` must say "64-bit integer types"
rather than naming the builtin.

### 2026-09-15: `hard:types` now typechecks `tests/ai/hard/**`

DESIGN §4 requires `tests/ai/hard/interfaces.test.ts` to reproduce every §4
signature "so drift fails `tsc`". Neither typecheck in M4's gate command
covered it: the root `tsconfig.json` has `include: ["src"]`, and
`lab/hard-ai/tsconfig.json` included `lab/hard-ai/**`, `src/**` and
`lab/harness/**` only — so the declaration tests and the `@ts-expect-error
until M<n>` markers were inert. `lab/hard-ai/tsconfig.json`'s `include` gains
`"../../tests/ai/hard/**/*.ts"`. Verified both ways: mistyping a declaration
test raises `TS2322`, and deleting a `@ts-expect-error` marker raises `TS2307`.
Later milestones adding files under `tests/ai/hard/` must keep them
`tsc --strict --noUnusedLocals` clean.

### 2026-09-15: `verify/run.ts` derives `tscErrors`

M4's pass criterion reads `tscErrors`, and MILESTONES.md notes the artifact is
"written by a tiny reporter wrapper in `verify/run.ts`". The gate row has no
artifact file; instead `run.ts` accumulates `metrics.tscErrors` over every
`npx tsc` / `npm run hard:types` step in the chain by counting `error TSxxxx`
diagnostics (a non-zero exit with no parseable diagnostic counts as 1), exactly
as it already derives `depsViolations` and `vitestFailures` from their steps'
output.

### 2026-09-15: R13 (§7.8) catalog/CORNER checks landed; `PST_MINE` still deferred

M1's own deviation note asked M4 to add the `catalog.power`, `PST_MINE`,
`CORNER` and `CORNER_NEIGHBOURS` halves of the constants-agreement test. Three
of the four are now covered — `CORNER === [0, 99]` and
`CORNER_NEIGHBOURS === [[1,10],[89,98]]` in `tests/ai/hard/tables.test.ts`, and
`catalog.power`/`killsInOne`/`hitsToKill` against `calculateAttackPower` for all
18x18x2 pairs under each of the four element graphs crossed with combat
handicaps {0,+1} in `tests/ai/hard/catalog.test.ts`. `PST_MINE` lives in
`core/income.ts`, which lands at **M5**; its 21 check values (DESIGN §4.7) are
M5/M8's to pin. `tests/ai/hard/constants.test.ts` is left untouched.

### 2026-09-15: unit ids for units bought during the search

`toAIAction`/`fromAIAction`/`keepSetIds` need a canonical unit id per slot, but
`PackedState.originIds` is cold data `make` does not extend (DESIGN §3.1), so a
slot created by a BUY inside the search has no entry. `core/action.ts`
reproduces `nextUnitId` (simulate.ts:14-20) from slot order: the k-th live
id-less slot of an owner takes the (k+1)-th index of
`unit-<player>-<turnNumber>-` that no `originIds` entry already occupies.
`slotForId` inverts it exactly, so `fromAIAction(p, toAIAction(p, a, k), k)`
restores `a` for every kind (the `paC` move-cost cache is encoder-side and is
not carried by the canonical action, so it comes back 0).

Residual limitation, documented in the module: the derivation matches the
canonical ids exactly as long as no unit bought during the same turn has since
died — once one has, the canonical engine frees its index for the next buy
while slot order does not record the swap. This is unfixable from
`PackedState` alone without writing a string per BUY in the hot path.
`verify/replay.ts` (M14) is the authority: it replays each decoded line through
`applyAction` and truncates at the first divergence (DESIGN §6.4 layer 3).

### 2026-09-15: exports beyond the literal §4 lists

DESIGN §4 freezes the listed signatures; these additive exports were needed by
the milestone's own tests or by the modules that will consume them, and none
changes a listed signature:
`types.ts` `UFLAGS_MASK`; `core/catalog.ts` `NEVER_KILLS` (the 255 sentinel
§4.3 describes in prose) and `powerIndex`; `core/zobrist.ts` the `z*` index
helpers (`zPiece`, `zReserve`, `zDamage`, `zAtkCount`, `zUflags`, `zActions`,
`zClock`, `zBankLo`, `zBankHi`, `zRule`, `zHandicap`) so M5's incremental
`make`/`unmake` XORs the same words `recompute*` does; `core/action.ts`
`PA_NONE`, `PaDecodeError`, `KEEP_SET_CAPACITY`, `newKeepSetTable`,
`keepSetReset`, `keepSetAdd`, `keepSetHas`, `findKeepSet`, `unitIdFor`,
`slotForId`; `config.ts` `DEFAULT_MATERIAL_CC`, `placeholderWeights`,
`INITIAL_UNITS_PER_MS`.

## M5

### 2026-09-15: `core` imports `src/ai/simulate.ts` for the `proverMode = 2` gate

DESIGN §2 says `core` imports only `src/game/*` and `types.ts`, while §3.4
requires `make` to call the canonical `analyzeHomeDefense` at `proverMode = 2`
**at this milestone**. `analyzeHomeDefense(state, invader, transition)`
(`homeCheckmate.ts:57`) takes the transition as a parameter, and the only
implementation of it is `src/ai/simulate.ts transitionWithoutCheckmate` —
reproducing it inside `core` would mean re-implementing `applyLegalAction`
against the very engine the replica is differentially tested against.
`lab/hard-ai/deps.ts` therefore allows `src/ai/simulate` from `core` alongside
`src/game`, with a comment pointing here. The allowance is temporary: M10's
`tactics/prover.ts homeVerdict` replaces the call and the import goes with it.
Every other §2 restriction is enforced as written.

### 2026-09-15: `proverMode = 1` claims no mate until M10

DESIGN §3.4 defines `proverMode = 1` as "only the admissible damage bound
(`homeCheckmate.ts:27-49`), which can only under-claim mates". That bound is
`enoughPossibleDamage`, which the canonical module does not export; the packed
replica of it is M10's `tactics/prover.ts damageBound`. Until then
`proverMode = 1` returns "no mate", which is the extreme of the same
under-claim and therefore never wrong in the unsafe direction.
`tests/ai/hard/terminal-order.test.ts` pins all three modes so the M10 change
is visible. `proverMode = 2` (the canonical call) is what `pack` sets, so the
replica's default behaviour is exact.

### 2026-09-15: undo records carry a trailing length word

DESIGN §3.4 tabulates each undo record with `KIND` first and lists its payload.
Two records are variable-length (`PAY_UPKEEP` carries a release list and a
flag-restore list; `END_ACTION` carries an income-take list and a flag-restore
list), so `unmake(p, u)` — which is handed only the stack pointer — cannot find
a record's base without knowing its size. Every record is therefore written as
`[KIND, oldResult, oldReason, ...payload..., LENGTH]`: the tabulated payload,
preceded by the two terminal fields every kind can change (the home-checkmate
gate can turn any action into a win) and followed by its own word count.

### 2026-09-15: the `BUY` undo restores the displaced slot's unit fields

DESIGN §3.4's `BUY` row is `[KIND, slot, cost, phaseBefore, actionsBefore]`.
That is not invertible when the BUY reuses a dead slot (F20: "dead slots reused
on BUY, lowest dead index"): the slot still holds the `defId`/`owner`/`damage`/
`atkCount`/`uflags` of whatever was killed or released there, and the `unmake`
of that EARLIER `ATTACK`/`PAY_UPKEEP` resurrects the unit by writing `sq` back
and calling `linkSquare`, which reads those fields straight out of the slot. The
record therefore also carries `slotCountBefore` and the five displaced unit
fields. Found by `tests/ai/hard/make-unmake.test.ts` ("a whole turn made and
unmade action by action restores the root exactly"), which is why that test
plays sequences that span the turn boundary rather than single actions.

### 2026-09-15: `clock` is clamped at 10

`PackedState.clock` is documented as `inactivityPlies 0..10` and the Zobrist
`clock` plane has exactly eleven entries. With `inactivityRule: 'off'`,
`resolveInactivityDraw` never fires and `inactivityPlies` grows without bound
(`turn.ts:96-99`), which would index past that plane. `pack` and `make` both
clamp the stored clock at 10. Nothing reads the clock above the limit — the
draw rule is off in exactly the states where the clamp can bite — and both
sides of the differential clamp identically, so the fuzzer's digest comparison
still covers the case (`drawRuleOffGames` counts those games).

### 2026-09-15: `perftReplica` restricts MOVEs to one action

DESIGN §7.2 requires `perftReplica` to match the frozen canonical numbers on
every fixture. §4.4 requires `genActions` to emit every legal MOVE *including*
multi-action ones, while the canonical enumerator's `generateAllActions` emits
only single-action ones (`getValidMoves` caps at `speed`). The two sets reach
the same END POSITIONS (every multi-action move is a chain of legal one-action
hops along its own BFS path) but not the same SEQUENCE count, so `perftReplica`
skips MOVEs of cost > 1 in order to measure the same thing the frozen fixtures
measure. Multi-action MOVEs are covered instead by the fuzzer's legality
surface (which compares against `generateAllActions` *plus* the
`getMovementRange` expansion, as §7.3 specifies) and by
`tests/ai/hard/state.test.ts`. `perftReplica` likewise reproduces the canonical
`midStateKey`/`endStateKey` partitions rather than keying on `Kpos`, which is a
strictly finer partition and would report different counts for reasons
unrelated to the replica's correctness.

### 2026-09-15: the keep-set legality surface is set-equal only when untruncated

`upkeepActions` (`upkeep.ts:34-55`) enumerates EVERY affordable subset of up to
twelve rent-bearing units — up to 4,096 of them — while DESIGN §3.2's
`KeepSetTable` holds 64 and §5.10 caps the root at 64. `Replica.genKeepSets`
reproduces the canonical enumeration exactly (the keep-first DFS for ≤ 12 rent
units; the empty set plus the four greedy orderings above that) and only when
more than 64 subsets survive does it rank them by §5.10's criteria and keep the
best 64. The fuzzer's legality surface therefore requires soundness always
(every emitted keep-set is accepted by `isUpkeepSelectionLegal`) and set
equality only where it is defined — when the replica did not truncate. Truncated
nodes are reported as `fuzz.legalityKeepSetTruncations`.

### 2026-09-15: exports beyond the literal §4 lists

None of these changes a listed signature. `core/state.ts` also exports
`MAX_CLOCK`, `INACTIVITY_LIMIT`, `ACTIONS_PER_TURN`, `UNDO_WORDS` and
`Replica.needsProof`/`Replica.resetUndoScratch` (the last drops the BUY
id-displacement stack, which only a forward-only driver such as the fuzzer
needs); `core/movement.ts` also exports `bfsMulti` and `DISTANCE_CACHE_BITS`;
`core/spawn.ts` also exports `newSpawnInfo` (DESIGN §4.6's `spawnInfo` takes a
caller-supplied `out`, so callers need a way to build one); `core/income.ts`
also exports `PST_HORIZON`, `RESERVE_VALUES`, `pstSumOf` and `materialSumOf`
(the `pstSumCc`/`materialCc` invariants, used by `rehash` and the tests);
`verify/perft.ts` also exports `kposHex` and `endKeysReplica` (M11's other
side of the `endKeysCanonical` comparison).

### 2026-09-15: `Replica` owns a `DistanceCache`

DESIGN §4.4's constructor is `constructor(cat?: Catalog)`, which it still is.
`isLegal`, `genActions` and `make` all need BFS distances, and DESIGN §5.1 puts
that cache behind `core/movement.ts createDistanceCache`; the replica builds one
in its constructor and exposes it as `readonly dist` so `tables/*` (M6+) can
share the same cache rather than recomputing the same maps.

## M6

### 2026-09-15: `strikeIfBought` keeps the spawn squares themselves

DESIGN §5.2 writes the pre-dilate set as `{q : 0 < minDist[q] <= 3s}`, which
drops the spawn squares (`minDist = 0`). `tables/threat.ts strikeIfBoughtArea`
uses `0 <= minDist[q]` instead, i.e. it KEEPS them. A unit bought on `q` and
never moved still attacks `q`'s four neighbours, so excluding `q` would make
the map miss real threats — and the M6 oracle MILESTONES.md names is the brute
force over `getAllSpawnPositions x getAffordablePurchases` of
`dilate(getMovementRange(q, spd, 3) ∪ {q})`, whose `∪ {q}` is exactly this
convention (DESIGN F22 applies it to existing units; a purchase is the same
case). The two readings differ only on `L` itself, and the strict reading
fails the gate: `tests/ai/hard/threat.test.ts` pins a position whose only
spawn square has both neighbours occupied, where the strict set is empty and
the true attack area is `{A1, B1, A2}`.

### 2026-09-15: `classifyApproach`'s `d` is in ACTIONS, and the class is decided by a real retreat square

DESIGN §5.8 writes the classification as `d = dist(a, cheapest empty square
adjacent to v)`, `cls = d <= 2s ? RETREAT : d <= 3s ? STRAND : NONE`, on a raw
BFS distance. `tables/approach.ts` reports `d = ceil(dist/speed)` — move
ACTIONS, which is what the canonical oracle
(`server/analysis/tactics.ts:272 approachTable`) calls `moveActions` and what
the M6 gate compares. The thresholds are unchanged by the rewrite
(`ceil(dist/s) <= 2` and `dist <= 2s` are the same predicate), so this is a
change of unit, not of meaning.

The class, however, is decided by whether a retreat square actually EXISTS on
the post-attack board, not by the cost threshold alone — again matching the
canonical table, which simulates the move-and-hit and reports `stranded` when
`getMovementRange(attackSquare, speed, actionsLeft)` comes back empty. The two
rules agree on an open board (cost <= 2 leaves an action, cost 3 does not) and
disagree exactly where the attacker boxes itself in, or where the hit ends the
game: §5.8's thresholds would promise an escape the canonical engine does not
grant. `approachMismatch === 0` on 9,150 (attacker, target) pairs is the
evidence that the actions-and-real-retreat reading is the canonical one.

### 2026-09-15: the approach gate excludes lines the home prover would adjudicate

`applyAction` re-runs `resolveHomeCheckmate` after every transition
(`src/ai/simulate.ts:33`), so a canonical approach line can end the game —
`line.after.phase !== 'playing'`, hence `stranded` — for a reason that has
nothing to do with the approach: the mover was already standing on the enemy
home corner, or the approach move itself lands there. Deciding that needs
`tactics/prover.ts homeVerdict`, which arrives at M10 in a layer `tables/**`
may not import (DESIGN §2 layering, enforced by `hard:deps`). Rather than
have `tables/approach.ts` guess, `lab/hard-ai/oracles/threat.ts` excludes
those cases from the differential and COUNTS them in the artifact:

- `positionsSkippedProof` — `Replica.needsProof(p)`, the exact condition of
  the canonical short-circuit (`homeCheckmate.ts:173-176`). 0 on the shipped
  corpus; the unit test's random states do hit it.
- `pairsSkippedCorner` — the defender's home corner is one of the target's
  attack squares AND is empty, so an attacker could end its approach on it.
  808 of 9,958 pairs. An OCCUPIED corner is never a candidate square for
  either implementation, so those pairs stay in the comparison.
- `pairsSkippedRepeat` — the attacker has already hit this particular target
  this turn. `PackedState` carries an attack COUNT, not the target identities
  (DESIGN §3.1), so the replica cannot see the canonical table's
  `!u.attackedThisTurn?.includes(target.id)` clause. 0 on the corpus.

The oracle also packs the position the canonical table actually sees — the
`actionReady(source)` normalisation (`server/analysis/core.ts:86`: pay a
pending upkeep, leave the place phase) — rather than the stored state, so the
two sides of the comparison are the same position.

### 2026-09-15: exports beyond the literal §4.8-§4.10 lists

Same precedent as M4's `core/spawn.ts newSpawnInfo` and M5's allocators: DESIGN
§4 hands callers an `out`, never an allocator or the constants the caller needs
to size one.

- `tables/threat.ts`: `refreshExposure(t)` (the level-1 step that derives
  `exposure` from the two strike maps — §4.8 specifies the field but §4.9
  lists no function that fills it), `STRIKE_MOVE_ACTIONS = 3`, `UNREACHABLE`
  (`nearestOwner`'s sentinel), `unitSpeeds`, `maskSquares`.
- `tables/approach.ts`: `newApproachResult()`, `classifyApproachInto` (the
  allocation-free form — §4.10's `classifyApproach` RETURNS an
  `ApproachResult`, so the signature as written must allocate; `approachTable`
  uses the `Into` form and allocates nothing per node),
  `APPROACH_SCRATCH_BB`/`APPROACH_SCRATCH_I8` (the `Scratch` dimensions a
  caller must reserve), and an optional trailing `defId` on `classifyApproach`
  so a purchase — which has no unit on the board to read a definition from —
  can be classified through the same entry point.
- `tables/context.ts`: `KILL_NEVER = 127` (§4.8 states the sentinel in prose
  only).

### 2026-09-15: `tables/context.ts` re-declares the level-2 result shapes structurally

`NodeTables` (DESIGN §4.8) has fields typed `KillTable`, `HomeSafety`,
`SpawnGeometry` and `EconResult` — interfaces DESIGN §4.11/§4.12 place in
`tables/kill.ts`, `tables/home.ts`, `tables/geometry.ts` and
`tables/economy.ts`, built by M7, M8 and M9 CONCURRENTLY with M6 in parallel
group E. `context.ts` therefore re-declares them field for field exactly as
§4.11/§4.12 print them, rather than importing modules that did not exist when
M6 was written; TypeScript's structural typing makes the two spellings
interchangeable, and `tables/geometry.ts` and `tables/economy.ts` already
import `NodeTables` back from `context.ts` (`tables/kill.ts` declares a
narrower `KillContext` to avoid the same cycle) and typecheck against it.
`ECON_HORIZON`'s value is restated as a private `ECON_H = 6` for the same
reason — `allocTables` must size `EconResult.income`/`upkeep`. M12, which
owns `buildTables`'s body, may replace these with `import type` once every
lane of group E has landed.

`buildTables` itself throws `Error('buildTables: body lands at M12')`: M6 owns
the SHAPE plus `threat.ts` and `approach.ts`; `spawn`, `home`, `geom`, `kill`
and `econ` arrive with M7-M9, and wiring a partial `buildTables` would hand
M12's evaluator a table that silently reports zeros for half its fields.
`tests/ai/hard/threat.test.ts` pins the throw so the stub cannot outlive M12
unnoticed.

### 2026-09-15: the M6 gate row asserts coverage as well as agreement

MILESTONES.md's M6 pass criterion is `strikeMismatch === 0 &&
strikeIfBoughtMismatch === 0 && approachMismatch === 0 && vitestFailures === 0`.
All three counters are vacuously zero on an empty comparison, so the row in
`lab/hard-ai/verify/gates.ts` additionally asserts `strikeChecked === 10000`
(5,000 positions x 2 sides, the size MILESTONES.md names) and that the approach
sample produced at least 2,000 pairs covering all three classes
(`approachRetreats`, `approachStrands`, `approachNones` all > 0). The corpus is
ordered `authored ++ openings ++ fuzz`, so the first 500 positions of it are
almost all openings — armies still on their own sides, every approach `NONE`;
`oracles/threat.ts` strides across the whole corpus for the approach sample
instead, which is what turns 6 RETREAT / 2 STRAND verdicts into 1,874 / 1,272.

## M7

### 2026-09-15: `tables/kill.ts` declares `KillContext`, not `NodeTables`, as its `t` parameter

DESIGN §4.11 types the second parameter of `minActionsToKill` / `killTable` /
`cleaveChain` as `NodeTables`. `tables/context.ts` (§4.8) declares `NodeTables`
with a `killNow: [KillTable, KillTable]` field, i.e. `context` imports `kill`;
importing `NodeTables` back from `kill.ts` would close that cycle. `kill.ts`
therefore exports `KillContext` — the structural subset it actually reads
(`dist: DistanceCache`, `spawn: readonly [SpawnInfo, SpawnInfo]`) — and takes
that. `NodeTables` is structurally assignable to `KillContext`, so every §4.11
signature reads exactly as DESIGN writes it for a caller that passes a
`NodeTables`; `tests/ai/hard/interfaces.test.ts` pins that by declaring all
three functions with `NodeTables` in the parameter position and assigning the
real exports to them. The same reasoning is what `tables/context.ts`'s own M6
entry records for its structural copies of the level-2 result shapes.

### 2026-09-15: the kill DP carries the set of lanes used, not just the hit count

DESIGN §5.7's pseudocode indexes the DP by `power[h][a]` — hits and actions —
and gives each candidate a single cost `d = min over lanes l of dist(u, l)`.
Read literally that is only a LOWER BOUND: two attackers whose cheapest lane is
the same neighbour square are both charged that lane, and a real turn cannot put
two units on one square. The M7 gate criterion (MILESTONES.md) is not satisfied
by a lower bound — it asks for `minActions` **equal** to an exhaustive replica
search — and the first 2,000-position run of `lab/hard-ai/oracles/kill.ts`
against the literal reading found exactly that disagreement (a purchase and an
existing Hi both charged square 21 on `fuzz-5150-341-467`: the DP said 3
actions, the real minimum is 4).

The implementation therefore indexes the DP by `(laneMask, actions, damage)`:
`laneMask` is a 4-bit set over the lanes `collectLanes` found, the hit count is
its popcount, and every candidate carries the specific lane it strikes from
(so a unit contributes one candidate per REACHABLE lane, not one candidate at
its nearest lane). `maxLanes` still caps the popcount, so the corner's two-lane
rule is unchanged. Each attacker still contributes at most one hit; that is
enforced without a per-group snapshot by filling destination cells in
descending popcount order, so a group's writes at popcount `k` only ever read
cells of popcount `k-1` that the same group has not yet touched. The DP is 16 ×
5 × 9 = 720 cells, still module-level and allocation-free.

With this reading `suboptimal === 0` on 8,306 comparisons over 1,531 corpus
positions (3,265 of which are real kills, 472 with a purchase and 131 with a
promotion in the winning plan).

### 2026-09-15: purchases are one entry per definition PER LANE

§5.7 says "for each affordable tier-1 `d`: `q = argmin over legal spawn squares
of dist(q, nearest lane)` — one entry per definition". With the lane-exact DP
above, a single entry per definition would re-introduce the same overstatement
in the purchase arm (a bought unit charged the globally cheapest lane while the
plan actually needs it on another). Each affordable definition therefore gets
one candidate per empty lane, priced from that lane's own cheapest legal spawn
square, and all of a definition's lane candidates share one group — so a plan
still buys each definition at most once, which is what "one entry per
definition" is there to enforce.

Known residual: two purchases of DIFFERENT definitions whose per-lane cheapest
spawn squares coincide would both be placed on that square, which is illegal.
Tracking spawn-square occupancy would need a second 4-bit mask (11,520 cells)
for a case no corpus position produced — `lab/hard-ai/oracles/kill.ts`'s replica
search allows up to two purchases per line and reported no disagreement. If a
future corpus surfaces one it will show up as `suboptimal > 0` on the M7 gate.

### 2026-09-15: the promoted approach cost uses the promoted definition's speed

§5.7's pseudocode reuses the base form's `cost` for the promoted entry
(`entry (cost, promoCost, POWER[side][nextDef][...])`). The canonical analysis
twin re-derives it from the promoted definition
(`server/analysis/tactics.ts:46-49` computes `cost` inside the `variants` loop,
from `getUnitDefinition(v.definitionId).speed`), and speed changes across tiers
(fire_2 speed 2 → fire_3 speed 3). `kill.ts` follows the canonical arithmetic;
`tests/ai/hard/kill.test.ts` "uses the promoted definition's speed for the
approach" pins it.

### 2026-09-15: exports beyond the literal §4.11 list

`tables/kill.ts` also exports `KILL_IMPOSSIBLE` (255), `KILL_NO_ATTACKER`
(-128), `KILL_MAX_LANES` (4), `KILL_SCRATCH_BB` (0) / `KILL_SCRATCH_I8` (1),
`newKillPlan` / `newKillTable` (the caller-supplied-buffer allocators every
§4 module needs — same reasoning as M4's "exports beyond the literal §4 lists"
and M8's `newEconResult`), and `CleavePlan` / `newCleavePlan` / `cleavePlan`.
`cleaveChain` returns a single `Centi` as §4.11 freezes it; `cleavePlan` is the
same computation with its witness (square, kills, actions) exposed, which is
what the LH §4.1 probe and the M7 gate assert the ACTION COUNT of — "3 kills in
3 actions" is not checkable from the cc value alone. `cleaveChain` is
implemented as `cleavePlan(...).valueCc` against a module-level scratch plan,
so the hot path allocates nothing.

### 2026-09-15: the M7 corner check uses `enoughPossibleDamage`'s `preparing = false` framing

MILESTONES.md's M7 criterion is `cornerMismatch === 0` — "equals
`enoughPossibleDamage` on the 28 `lab/ai/fixtures.ts` cases". That canonical
function has two framings. With `preparing = true` (the single call at
`homeCheckmate.ts:76`, on the defender's freshly reset reply position) it also
applies an upkeep filter: `const rent = preparing ? unitUpkeep(unit) : 0; if
(rent > cash) continue` — a tier-2/3 defender whose rent exceeds the bank is
dropped, because the reply turn begins with an upkeep settlement it could not
pay. `tables/kill.ts` has no rent concept and §5.7 names none; rent at the home
corner is the home prover's subject (§5.9, M10), not the kill table's.

`lab/hard-ai/oracles/kill.ts` therefore scores `cornerMismatch` on the
`preparing = false` framing — the one `searchHomeDefense`'s own `act()` uses at
every live mid-turn node, and the one §5.7 says it generalises — evaluated on
the 28 fixtures exactly as authored, so the fixtures' `canActThisTurn`,
`attackedThisTurn`, `atkCount` and `damageTaken` flags are all live in the
comparison. All 28 agree. A second metric, `cornerPreparingMismatch`, runs the
`preparing = true` framing on the `ready` reply position with promotions
enabled, restricted to the fixtures where the rent filter cannot fire (every
defender's rent is affordable) so the two functions are comparing the same
candidate set; 14 of the 28 qualify and all 14 agree. Both are asserted at 0 by
the M7 gate row.

`enoughPossibleDamage` is module-private, so `oracles/kill.ts` carries a
transcription of `homeCheckmate.ts:27-49` with a comment requiring it to be
kept in step with the canonical body.

### 2026-09-15: the M7 oracle's "exhaustive replica search" is exhaustive over kill-relevant actions

DESIGN F23 and MILESTONES.md size this gate as "kill DP vs exhaustive replica
search on 2,000 positions with ≤ 8 own units and ≤ 4 actions". A literally
unrestricted DFS over `Replica.genActions`/`genPlace` is not affordable at that
size: eight units with multi-action MOVEs generate several hundred actions per
node, and the Place phase (six definitions × every legal spawn square) is
unbounded in depth because place actions cost no game actions.

`bruteForceKill` is exhaustive over the actions that can shorten a
minimum-action kill of ONE target, and nothing else:

- `ATTACK` on the target; `ATTACK` on a unit standing on one of its lanes (the
  only way to open a plugged lane);
- `MOVE` onto one of its lanes (the replica emits multi-action MOVEs as single
  entries and `ceil(d1/s) + ceil(d2/s) >= ceil((d1+d2)/s)`, so an approach never
  gains by stopping short); `MOVE` of a unit that currently stands on a lane, to
  any destination (vacating it for a stronger attacker, possibly having to route
  around its own army);
- `BUY` of an affordable definition on a per-lane-cheapest legal spawn square —
  a strictly RICHER set than the single square §5.7 charges the DP, which is
  what gives the purchase arm its discriminating power — capped at two
  purchases and two promotions per line (each bought or promoted attacker still
  has to spend an action out of a budget of at most four);
- `PROMOTE` of an own unit; `END_PLACE`. `END_ACTION` ends the turn and can
  never kill, so it is never explored.

Purchases and promotions are enumerated in a canonical order ((defId, square)
ascending, then slot ascending) because they commute, which removes permutation
duplicates without removing multisets. The search is iterative-deepening on the
action count, so the first depth that succeeds is the minimum and the crystal
figure inside that depth is a true minimum. A position whose search exceeds
`BRUTE_NODE_LIMIT` (400,000 nodes) is reported as `truncated` and excluded
rather than scored on a truncated search; the gate requires `truncated === 0`,
and the 2,000-position run reports 0.

### 2026-09-15: `allowBuys` / `allowPromotes` are compared only where the Place phase is open

A purchase or a promotion is legal only while `turn.phase === 'place'`
(`legality.ts:22-23`). On an action-phase node the DP's `allowBuys` /
`allowPromotes` describe a hypothesis the position itself cannot realise, so
there is no replica line for the search to match and the comparison would be
measuring the phase rule rather than the DP. `oracles/kill.ts` runs the
`(false, false)` combination on every sampled position and the other three on
place-phase positions only, and reports `comparisonsByCombo` /
`minComparisonsPerCombo` so the gate can assert that all four combinations were
genuinely exercised (6,128 / 726 / 726 / 726 on the 2,000-position run).

### 2026-09-15: `lab/hard-ai/positions/tactics.jsonl` accompanies the suite, and `best` is exhaustive

MILESTONES.md M7 lists `lab/hard-ai/suites/tactics.suite.json` (≥ 60 cases,
authored) but no position file; DESIGN §7.5's schema addresses every case as
`position: "<file>#<id>"`, so the cases need stored positions to point at. This
milestone adds `lab/hard-ai/positions/tactics.jsonl` alongside the suite, the
same way M8 added `lab/hard-ai/positions/economy.jsonl` alongside
`economy.suite.json`.

§7.5 describes the tactics suite as "kill table over self-play positions, kills
≥ 800 cc, hand-checked". Only 40 positions in the whole committed corpus
(`authored` + `openings` + `fuzz-1000`, 1,808 positions) offer a killable enemy
worth ≥ 800 cc at all, and 36 of those are Place-phase-heavy enough that their
macro turn cannot be enumerated exhaustively — not enough for 60 cases. The 79
cases are therefore authored: a sweep of ten kill motifs (adjacent one-shot,
multi-action approach, two-lane and three-lane splits, chipped target, three
lanes plugged by the target's own miners, the home corner's two lanes, a
two-lane approach, promotion-enabled, purchase-enabled) across every
(attacker, target) definition pair the LIVE catalogue makes lethal, keeping
only targets costing ≥ 800 cc and only positions where
`tables/kill.ts minActionsToKill` reports a kill.

`best` is the COMPLETE set of end-position `Kpos` in which the target is off
the board, enumerated exhaustively with the M5 replica over one-action MOVEs
(which reach every square a multi-action MOVE reaches, so the END-POSITION set
is unchanged — the same argument M5's `perftReplica` entry records), and every
case was cross-checked against the canonical engine's own end-position set
(`verify/perft.ts endKeysCanonical`, depth 10) before being written. Because
`best` is complete, `avoid` is deliberately empty: every end position outside
`best` already fails §7.5's rule. Cases whose `best` is the whole end-position
set are dropped — a case with nothing to get wrong scores nothing. `Kpos`
values are `"0x"` + `verify/perft.ts kposHex`, matching `economy.suite.json`.
No M7 gate criterion reads this file; it is scored from M14.

### 2026-09-15: the M7 gate row asserts coverage as well as agreement

MILESTONES.md's criterion is `suboptimal === 0 && cornerMismatch === 0 &&
cleaveProbeOk === true && vitestFailures === 0`. Every one of those passes
vacuously on an empty comparison population, so the gate row also requires
`truncated === 0`, `minComparisonsPerCombo > 0`, `killsFound > 0`,
`buyPlans > 0`, `promoPlans > 0`, `cornerChecked === 28` and
`cornerPreparingChecked > 0`, plus `cornerPreparingMismatch === 0`. Same
reasoning as the M6 row's coverage assertions.

### 2026-09-15: `tests/ai/hard/interfaces.test.ts` (shared, M4) lost its M7 suppression

`interfaces.test.ts`'s own doc comment says the `@ts-expect-error until M<n>`
type-only imports at the bottom are replaced with real declaration tests by the
milestone that builds the module — and until that happens the now-unused
directive fails `npm run hard:types`. This milestone removed the
`until M7: tables/kill.ts` line and added the §4.11 declaration block described
in the first entry above. No other part of that file changed.

## M8

### 2026-09-15: `newEconResult` — an exports-beyond-the-literal-list allocator

DESIGN §4.12 gives `economyDP`/`economyStayInPlace` a caller-supplied `out:
EconResult`, the same "hand callers an allocator, not a constructor" pattern
`core/spawn.ts newSpawnInfo` and `tables/context.ts allocTables` already
establish (M4/M6's precedent in the M5 §"exports beyond the literal §4 lists"
entry above), but never actually names an allocator for `EconResult` itself.
`tables/economy.ts` exports `newEconResult()` for the same reason `spawn.ts`
needed `newSpawnInfo`: every call site (`tests/ai/hard/economy.test.ts`,
`lab/hard-ai/oracles/economy.ts`, and `tables/context.ts`'s own
`allocTables`) needs a correctly-shaped zeroed `EconResult` and DESIGN gives
no other way to produce one. No listed §4.12 signature changes.

### 2026-09-15: a dry miner with no positive-value relocation target does not move

DESIGN §5.8 defines the relocation target as `argmax PST_MINE[def][reserve[c]]
>> (actionCost/2)` over every square reachable within
`RELOCATION_MAX_ACTIONS`, but does not say what happens when every reachable
candidate scores 0 (every reachable cell is itself already dry, or none are
reachable at all — e.g. a lone miner surrounded by depleted cells). Relocating
onto another 0-reserve cell can only ever mine 0 for the rest of the horizon,
so `economyDP` leaves such a miner in place rather than charging
`relocationDebt` for a move with no possible benefit. This is also *why*
`economyDP.stream >= economyStayInPlace.stream` holds structurally rather than
merely empirically on the M8 oracle's 2,000-position `relocationMonotone`
check: every miner's contribution to `stream` over the remainder of the
horizon is `>= 0` whether it stays (a dry cell mines 0 forever, matching what
`economyStayInPlace` already does) or relocates (either it finds no positive
candidate and behaves identically to staying, or it does and only ever adds
non-negative income). `tables/economy.ts bestRelocationTarget` returns
`square: -1` in this case; `tests/ai/hard/economy.test.ts` pins it directly
("a dry miner with no reachable positive-value candidate does not relocate at
all").

### 2026-09-15: the M8 oracle's "literal 6-turn simulation" does not route through `endTurn`/`startTurn`

MILESTONES.md's M8 gate row describes the oracle as "literal 6-turn simulation
through canonical `endTurn` with units held" and DESIGN §5.8 says the
relocation-off stream "equals a literal 6-turn simulation through canonical
`endTurn`". `lab/hard-ai/oracles/economy.ts`'s `literalProjection` instead
applies the canonical `mining.ts endOfTurnIncome` and `upkeep.ts upkeepDue`
directly, `ECON_HORIZON` times, with the units held motionless and the bank
allowed to go hypothetically negative. Routing through the real
`endTurn`/`startTurn` pair also runs victory and inactivity-draw checks that
have nothing to do with the economy projection DESIGN §5.8 defines: a sampled
corpus position that happens to be one draw-clock tick, one elimination, or
one home-checkmate away from a real game-ending transition would make the
literal-projection comparison fail (or the canonical side stop projecting
income altogether) for a reason unrelated to `tables/economy.ts`'s formula at
all — and DESIGN §5.8's `turnsToInsolvency` is itself explicitly a
hypothetical running-balance projection ("first k with `bank + Σ(...) < 0`"),
never a claim that the side actually plays six real, legal turns. Calling the
two named primitives directly is the literal, narrow reading of "through
canonical `endTurn`" that reproduces §5.8's formula without also asserting
something DESIGN never claims (that six turns of real play are always
possible from an arbitrary sampled position). `income_t`/`upkeep_t`/`stream`
are still compared exactly, every sampled position, both sides — the M8 gate
criterion (`streamMismatch === 0`) is unaffected by this reading.

### 2026-09-15: `lab/hard-ai/suites/economy.suite.json` cases are single decisive actions, not full turns

DESIGN §7.5's `muju-suite-v1` schema records `best`/`avoid` as full-turn end
positions ("end positions, never sequences"), scored by a turn generator that
does not exist until M11 (`gen/turn.ts`) paired with the evaluator that does
not exist until M12 (`eval/*`). The 30 `economy.suite.json` cases MILESTONES.md
asks M8 to create record the position right after the ONE action each case is
actually testing instead — a relocation `MOVE`, or `PROMOTE_UNIT` vs
`END_PLACE_PHASE` for a promote-vs-bank choice — applied through the real
canonical `applyAction` (`src/ai/simulate.ts`) and packed with the real
`Replica.pack` (`src/ai/hard/core/state.ts`) for a real `Kpos`, never
hand-typed. This is the smallest well-formed choice that is still genuinely
"economy" content per DESIGN §7.5's own description ("`PST_MINE` gaps > 400
cc: relocation, Muju-onto-4, promote-vs-bank" — `plant_1`'s display name is
literally "Muju", `units.ts:161`); the suite's own `notes` field documents the
convention so whichever milestone first scores it (M14+) does not mistake a
one-action case for an incomplete four-action turn. No M8 gate criterion reads
this file (the M8 gate row runs only `economy.test.ts` and
`oracles/economy.ts`), so nothing here is checked by `npm run hard:verify --
gate M8`; it exists to satisfy MILESTONES.md's M8 "Files (create)" list ahead
of the milestone that actually scores it.

## M11

### 2026-09-15: C1 prunes a child's SUBTREE, never a child that ends the game

DESIGN §5.3 states C1 as "child `cur` is pruned iff `isIndependent(prev, cur)`
and `key(prev) > key(cur)`", justified by the claim that the swapped order
`cur, prev` reaches the same end position. That argument holds for costs and
legality — for an independent pair, applying `cur` at `S0` can only be cheaper
than at `S1`, and `prev`'s own path avoids every square `cur` touches — but it
silently assumes both actions are still playable after the swap. An action
that ENDS THE GAME breaks the assumption: `cur` applied first terminates the
turn, so `prev` never happens and the end position `prev, cur` reaches is
reachable in no other order.

The counterexample is not hypothetical; the M11 oracle found three of them in
the first forty corpus positions it checked. In
`fuzz-1000.jsonl#fuzz-5150-119-64`: White moves the unit on C4 to C3, then the
Hi on D4 kills the last Black unit on D5. `key(MOVE) > key(ATTACK)` (ATTACK
ranks 0, MOVE ranks 1) and the footprints are disjoint, so
literal C1 prunes the pair in favour of "kill, then move" — which cannot exist,
because the kill wins the game on the spot. Ten of that position's 187 end
positions vanished; two other positions in the first forty lost 2 and 34.

`ActionSearch.dfs` therefore applies **every** child and prunes only its
SUBTREE: a pruned child whose `make` leaves the game over (`isDone`) is still
recorded as a turn boundary. The cost is one `make`/`unmake` per pruned child,
which is negligible against the subtree it still skips — the initial position's
canonical+TT node count is unchanged at 1,053, and the C1-only count is
unchanged at 19,790. `lab/hard-ai/positions/canonical-fixtures.jsonl#canonical-move-then-kill`
is the authored regression, and `tests/ai/hard/canonical.test.ts` asserts both
halves of it (the pair IS independent and IS key-ordered for the prune; its end
position IS still produced).

### 2026-09-15: `enumerateAll` takes an optional `maxCalls` and returns `-1` when it is spent

DESIGN §4.13 gives `enumerateAll(p, prefix, prefixLen, onEnd): number`. The
naive tree it walks is not enumerable at four actions on a real mid-game
position: root branching over `fuzz-1000.jsonl` runs to 837 (median 258)
because `genActions` emits every multi-action MOVE, so a four-action tree is
~10^11 nodes. The M11 gate has to check 200 corpus positions inside eight
minutes, which means it has to *discover* how deep it can afford to go. A fifth
optional parameter bounds the walk: on exceeding it, the DFS aborts and returns
`-1` (with `onEnd` having fired an arbitrary prefix the caller must discard)
instead of throwing. Four-argument callers are unaffected — the default is the
previous hard bound, `MAX_NAIVE_CALLS = 40,000,000` — and the parameter is
additive, so the §4.13 signature still typechecks against this one.

### 2026-09-15: the M11 oracle lowers each position's action budget to fit the node bound

Following from the above: `lab/hard-ai/oracles/canonical-check.ts` checks every
position at the LARGEST action budget whose naive tree fits `--node-budget`
(500,000 nodes by default), found by lowering `p.actions` and re-deriving the
derived fields with `Replica.rehash`. A state with fewer actions remaining is an
ordinary, legal mid-turn state, not a synthetic one, and C1 is a rule about
ADJACENT pairs in the DFS — a two-action budget already exercises every pair
exhaustively. The initial position and the fixtures are small and are checked at
their full depth (`depth` from the `muju-position-v1` record, as `hard:perft`
uses it); over the 200 corpus positions the realised budgets are ~3/4 at two
actions and ~1/4 at three. The artifact reports the histogram as
`budgetHistogram` so a future run cannot quietly degrade to "everything at one
action" without it showing.

### 2026-09-15: the initial-position mid-state count is measured at 20 TT bits

`TurnTT` is direct-mapped on `keyLo`, so at the shipped `ttBitsTurn = 18` two
index collisions re-expand a state that was already searched: the initial
position reports 1,054 expanded nodes instead of DESIGN §5.3's 1,053, with an
identical result set. The gate's `initialMidStates` is therefore measured at 20
bits, where the raw node count reproduces 1,053 exactly; the 18-bit number is
reported alongside it as `initialMidStatesShippedTt`, and the count of DISTINCT
`(Kturn, actionsRemaining)` keys expanded — 1,053 at both sizes — as
`initialDistinctMidStates`. Nothing about the shipped configuration changes.

### 2026-09-15: `gen/` declares a structural `WorkSink` rather than importing `search/time.ts`

DESIGN §5.4's pseudocode calls `meter.spend(TURN)` and `meter.exhausted()`, and
§4.13 types the parameter as `WorkMeter` — which lives in `search/time.ts`
(§4.16) and lands at M14. DESIGN §2's layering forbids `gen` importing
`search`, so `actionsearch.ts` declares the two-method structural interface it
actually calls (`WorkSink`) and exports `UNLIMITED_WORK` for the gate runner,
the oracles and the tests. The real `WorkMeter` satisfies it structurally, so
M14 passes one unchanged. `WorkClass.TURN`'s value (2) is spelled as a local
constant for the same reason; `tests/ai/hard/constants.test.ts` is the place to
cross-check it once `search/time.ts` exists.

### 2026-09-15: `actionPriority`'s MVV term is normalised by `CC`

DESIGN §5.4 lists the MVV-LVA analogue as `1_000 · victimValueCc / actionCost`.
`victimValueCc` is the `cost × 100` material prior in CENTI-crystals (DESIGN
§4.11, F9), so the unnormalised term runs 300,000–1,700,000 and swamps both the
100,000 corner-kill bonus and the 50,000 threat-removal bonus that DESIGN's own
list prints above it — inverting the descending order it states. The term is
divided by `CC`, which keeps every coefficient in the list's stated relative
order while preserving MVV's intent (a Kagari is worth five Hi).

### 2026-09-15: "kills a unit whose `killActions` against me ≤ 4" reads MY units

`NodeTables.killActions` (§4.11) is indexed by the DEFENDER: the minimum number
of actions a slot's OWNER'S ENEMY needs to kill it. Read literally, "kills a
unit whose `killActions` against me ≤ 4" would index the victim — but the
victim's `killActions` is what *I* need to kill *it*, which the MVV term
already prices, and says nothing about the threat it poses. The bonus is
therefore paid when the victim stands next to one of MY units the enemy can
kill within a turn (`t.killActions[myAdjacentSlot] <= 4`), which is the
"remove the threat" reading of §5.4's own comment. Until M6/M12 fill the table
in, `neutralTables()` reports 127 everywhere and the term is never paid.

### 2026-09-15: the priority sort is skipped when the width does not bind

DESIGN §5.4 scores and stable-sorts every child before slicing `widths[step]`.
When the width does not bind (`widths[step] >= n`, which is the case throughout
the gate's unbounded-width runs) the slice is the whole list, so the sort can
only change the order in which equally-ranked kept turns are discovered — never
which end positions are reached, and never which turns survive `cfg.keep`
except among exact score ties. `orderTop` is therefore skipped in that case,
which is what makes the 200-position gate affordable. When the width does bind,
the selection is a stable partial selection sort (rotation, not swapping), so
ties keep generation order exactly as §5.4 asks.

### 2026-09-15: exports beyond the literal §4.13 lists

`gen/actionsearch.ts` additionally exports `footprint`, `actionKey`,
`actionPriority`, `neutralTables`, `ActionSearchTables`, `WorkSink`,
`UNLIMITED_WORK`, `MAX_NAIVE_CALLS`, `EndObserver`/`NodeObserver` and the
`nodes`/`visits`/`ends`/`turnTT` accessors on `ActionSearch`; `gen/turn.ts`
additionally exports `TACTICAL_FLAGS` and `TurnPool.free`. The observers and
counters are what the M11 gate measures with; `ActionSearchTables` is the
narrow slice of `NodeTables` the ordering reads, so M6/M12's real tables are
structurally assignable to it and `neutralTables()` is the stub DESIGN §5.4
calls for. `ActionSearchConfig` is re-exported from `config.ts` per M4's
declaration convention. Nothing in §4.13's stated list is missing or renamed.

### 2026-09-15: the M11 gate row adds three conjuncts

MILESTONES.md's criterion is `endSetMismatch === 0 && initialEndPositions ===
797 && initialMidStates <= 1053 && ttReduction >= 10 && vitestFailures === 0`.
The row also asserts `ttEndSetMismatch === 0` (the turn TT loses no end
position the C1-only search found — C2 is half of what this milestone ships and
the stated criterion never looks at it) and `fixturesChecked === 14 &&
corpusChecked === 200`, so the gate cannot pass vacuously if the fixture files
or the corpus go missing. 14, not 15: `authored.jsonl#upkeep-pending` pays an
upkeep that eliminates the side to move, so that turn has no action phase to
enumerate and the oracle reports it under `positionsSkipped` with its reason.

## M10

### 2026-09-15: `core/state.ts` may import `tactics/prover.ts`

DESIGN §2's layer table says `core` imports only `types.ts` and `src/game/*`.
DESIGN §3.4 says `core/state.ts make` calls the packed home-checkmate prover,
which §2 itself places in `tactics/`. The two cannot both hold. The narrower,
more specific rule wins: `make` calls `tactics/prover.ts`, and
`lab/hard-ai/deps.ts` grows a `FILE_LAYER_ALLOWS` map with exactly one entry,
`'core/state.ts': ['tactics']`. Every other `core` file is still held to the §2
table, and there is no module cycle — `tactics/prover.ts` imports `core/types`,
`core/bits`, `core/tables`, `core/catalog`, `core/action` and `core/spawn`, and
no symbol of `core/state.ts`.

The M5 allowance for `core` to import `src/ai/simulate` is now unused (`make`
no longer unpacks, so `transitionWithoutCheckmate` and `analyzeHomeDefense` are
gone from `core/state.ts`). It is left in `deps.ts` rather than removed: an
unused allowance can only fail to forbid something, while removing one could
break a milestone still in flight.

### 2026-09-15: `homeVerdict`'s `meter` parameter is `ProverMeter`, not `WorkMeter`

DESIGN §4.14 types the optional last parameter of `homeVerdict` as
`WorkMeter`, which lands at M14 in `search/time.ts` — a layer `tactics` may not
import (DESIGN §2). `prover.ts` therefore declares the structural interface it
actually needs, `ProverMeter { spend(cls: number, n?: number): void }`, which
the real `WorkMeter` satisfies, so M14 can pass one with no change on either
side. `WORK_CLASS_PROVER = 8` is exported alongside it (`WorkClass.PROVER`,
DESIGN §4.16).

### 2026-09-15: `homeWitness`'s keep-set lives in an exported table

DESIGN §4.14 freezes `homeWitness(p, invader, maxNodes, out)` with no
`KeepSetTable` parameter, but a `PAY_UPKEEP` PA carries only a keep-set INDEX
in `paA` (DESIGN §3.2), and the prover's keep-set is an arbitrary affordable
subset that no node-local table is guaranteed to hold. `prover.ts` therefore
exports `WITNESS_KEEP`, a module-level `KeepSetTable` the line's `PAY_UPKEEP`
always indexes at 0; a caller decodes the line with
`toAIAction(p, pa, WITNESS_KEEP)`. Like the rest of the module it is
single-threaded scratch: the table is rewritten by the next `homeWitness` call.

`prover.ts` also exports `proverStats()` (the last call's `nodes`, `cutoff` and
`method`, which is what the gate's node-for-node comparison against
`analyzeHomeDefenseEvidence` reads) and `HomeVerdict`/`ProverStats` types.

### 2026-09-15: the fuzzer's `prover` and `gate-preservation` surfaces have their own driver

DESIGN §7.3 lists `prover` as the fuzzer's third surface, and DESIGN §5.9 (c)
adds the gate-preservation proof; MILESTONES' M10 gate row invokes them as
`--surfaces prover --cases 20000` and `--surfaces gate-preservation --actions
100000`. Neither compares what `fuzz/differential.ts` compares — one compares a
VERDICT on synthesised occupier positions, the other only the adjudicated
`result`/`reason` over played games — so both live in
`lab/hard-ai/fuzz/prover-surface.ts` and `fuzz/run.ts` dispatches to them when
either is named alone. Naming one alongside `transition`/`legality` is rejected
rather than silently mixing two populations into one metrics object.
`--cases` is new (the prover surface counts positions, not actions).

Two departures from the literal gate text, both strengthening it:

- **Node counts, not just verdicts.** The surface compares
  `analyzeHomeDefenseEvidence`'s `nodes` and `method` as well as its verdict
  (`nodeMismatch`), because two provers that agree on every uncapped position
  can still disagree the moment `PROOF_NODES` bites. A third of the fuzz cases
  run at a cap of 1..48 nodes so the exhaustion regime is common
  (`cappedCases`, `cutoffCases`) instead of vanishing — at the full cap only
  ~0 % of random positions exhaust, and a gate that never exhausts never tests
  the ordering the cap exposes. This is what caught the one real defect in the
  replica: the `failed` set stored its Zobrist halves in an `Int32Array`, so
  every key with the high bit set was written negative and never matched again,
  and the replica silently re-expanded transpositions the canonical prover
  folded together.
- **`proofsCompared` is a pass condition.** A gate-preservation run in which no
  corner is ever occupied proves nothing, so the driver biases play towards the
  enemy corner and the criterion requires the gate to have fired.

`hard:fuzz` also grew `perft/run.ts`'s sibling-artifact merge, so the chain's
two outputs (`M10-prover.json`, `M10-gate.json`) reach the criterion as one
artifact; the merge strips group labels out of what it reads back so repeated
runs cannot nest a group inside itself.

### 2026-09-15: the `home-mate` suite's 56 cases, and what a "mate framing" is

DESIGN §7.5 sizes the suite at "56 — `lab/ai/fixtures.ts` 28 x {rescue, mate}
framings" without saying what the two framings are, and §7.5's scoring rule
(`best`/`avoid` over end-position `Kpos`) cannot express "there is no correct
move". `lab/hard-ai/suites/build-home-mate.ts` generates the suite and its
positions file from the fixtures, reading the canonical prover's own verdict
for each rather than assuming one:

- **rescue framing** — root: the defender's reply position (upkeep pending,
  place phase, four actions), which is exactly the position
  `analyzeHomeDefense` adjudicates. When a rescue exists, `best` is every end
  position with the corner cleared. When none exists there is no correct
  defensive turn, so the row is kept at `points: 0` with `best` = every end
  position: a coverage row asserting the engine still returns a legal turn in a
  lost position, never a strength claim.
- **mate framing** — root: the invader to move, backed off onto the nearest
  square it can still reach the corner from (a BFS over unoccupied squares).
  When the occupation is a proven mate, `best` is every end position that wins
  on the spot. When it is answerable, `avoid` is every end position that steps
  into the refutation. When the corner is walled off by defenders on both of
  its neighbours the invader cannot be backed off at all; the fixture then
  keeps the standing occupation and the case becomes the other half of the same
  judgement — `best` is every end position that HOLDS the corner, because an
  occupation surviving to the invader's next `startTurn` wins (turn.ts:23-27).

That yields exactly 56 cases (42 scored, 14 coverage) over 56 stored positions
in `lab/hard-ai/suites/home-mate.positions.jsonl`.

## M9

### 2026-09-15: `geometry.ts infiltrationAnchors` rewritten — the inherited `anchorsVoidedBy` call always returned 0

The uncommitted, unverified partial `tables/geometry.ts` this milestone started from (`docs/hard-ai/HANDOFF.md`
§10.1) computed `infiltrationAnchors` as `Σ over own slots inside an enemy rectangle of
anchorsVoidedBy(p, enemy, s)`, calling `core/spawn.ts anchorsVoidedBy(p, victimSide, s)` with `s` set to
each of `side`'s own, already-placed unit squares. `anchorsVoidedBy` answers a different, HYPOTHETICAL
question — "if an intruder stood on the EMPTY square `s`, how many of `victimSide`'s currently-unblocked
anchors would it void" — and explicitly skips any anchor whose rectangle already intersects `victimSide`'s
enemy occupancy (`core/spawn.ts:173-185`). When `s` is one of `side`'s own units that is ALREADY on the
board, that same square is itself part of the "already blocks it" occupancy the function checks, so every
anchor whose rectangle contains `s` is reported pre-blocked and skipped — the call returns 0 for every
contributing slot, on every position, unconditionally. `tests/ai/hard/geometry.test.ts`'s
`infiltrationAnchors` case caught this (asserted a hand-verified count of 3 on a two-anchor fixture, got 0).

Fixed by computing the field directly, per DESIGN §5.8's literal wording ("Σ over own slots inside an enemy
rectangle of the anchors voided; a body on the enemy corner voids ALL of them"): for each of `side`'s own
unit squares, count how many of `enemy`'s own units have that square inside their `RECT[enemy][...]`
rectangle, with NO "already blocked by someone else" exclusion — a rectangle infiltrated by two of `side`'s
units is counted twice (redundant infiltration pressure is real signal, not double-counting), and a unit on
the enemy corner counts once per enemy anchor (every rectangle contains the corner). This needs only
`RECT` (`core/tables.ts`, already an allowed `tables` import) and drops the `anchorsVoidedBy` import
entirely; `core/spawn.ts` itself is untouched.

### 2026-09-15: `home.ts nearestThreat`'s existing-unit branch needed the BFS run the other way round

The same handoff draft's `tables/home.ts` (created this milestone from scratch, since only `geometry.ts`
existed on disk) was designed around a single multi-source BFS from `CORNER[side]` (`fillCornerDist`,
`DistanceCache.multi`), read at each candidate square — correct for the PURCHASE branch (every candidate is
a legal spawn square, guaranteed EMPTY at query time) but wrong for the EXISTING-UNIT branch: `bfsFrom`/
`bfsMulti` treat every occupied square other than the BFS's own source(s) as impassable
(`core/movement.ts:1-20`), and an existing enemy unit's own square is necessarily occupied — by itself.
`fillCornerDist`'s BFS therefore can never assign a distance to a live unit's square (it is never a source),
so `nearestThreat`'s existing-unit branch always read `moveCost(dist, unitSquare, spd) === -1` and reported
`HOME_NEVER`, even for a unit standing three squares from the corner on an empty board.
`tests/ai/hard/home.test.ts`'s first case caught this (expected `actionsToCorner === 3`, got `127`).

Fixed by computing the existing-unit branch with the BFS run FROM each enemy unit's own square
(`t.dist.get(p, unitSquare)`, cached, where that unit's own occupancy is the one the cache's `bfsFrom`
contract explicitly ignores — `core/movement.ts`'s documented "the origin's own occupancy is irrelevant"),
read at `CORNER[side]`; distance is symmetric so this is the same number `fillCornerDist` would have given
had it been legal to compute. The purchase branch is unchanged (one shared multi-source BFS, since every
candidate square really is empty). Both `nearestThreat` and the `homeRaceAvailable` purchase-only function
remain self-sufficient rather than depending on `buildTables`'s not-yet-written (M12) body to have pre-filled
`NodeTables.cornerDist` — see the module's own header comment for the tradeoff.

### 2026-09-15: `lab/hard-ai/suites/spawn-strike.suite.json`'s 20 cases are constructed and legality-verified, not reverse-engineered from citations

DESIGN §7.5 cites specific provenance for the spawn-strike suite ("NK:10 bought Radi; archived t3 `BUY
fire_1@I6 → I2 → ATK H2 → I4`; NK:13 per-turn fresh-Hi raid; the D9 pivot; the F16 punisher position") but,
as with M1's `home-race`/`promotion-kill` fixtures, the underlying archived-game and napkin citations do not
carry exact coordinates or unit rosters recoverable from the repo. Each of the 20 cases instead instantiates
the NAMED PATTERN on a small constructed position (a purchase-then-move-then-attack summon strike; a
purchase-then-attack-then-retreat line; a multi-buy Place-phase pivot; the F16 punisher's exact cited line,
`BUY water_1@C1 → Hi C2→D2 → Sjor C1→C2 → ATTACK C3`, reproduced literally), with every action sequence
applied end to end through `core/state.ts`'s `Replica.isLegal`/`make` (asserted legal at each step, not
assumed) and the resulting `best` entry taken from the actually-reached `kposHex`. This is the only ground
truth available before M11's within-turn search and M13's candidate generator exist to determine a genuinely
optimal turn from a position; the suite's own runner (`lab/hard-ai/suites/run.ts`, `format.ts`) does not land
until M14, so nothing scores these cases yet — M9's own gate does not execute this suite. Each case's
`authoredFrom` field states this provenance plainly, mirroring M1's ruling for `home-race`/`promotion-kill`.

### 2026-09-15 (verifier fix): `homeRaceAvailable` emits only lines the canonical replica accepts

The independent M9 verifier replayed every line `homeRaceAvailable` emits through `core/state.ts`'s own
`Replica.isLegal`/`make`/`unmake` over the whole position corpus (`authored` ++ `openings` ++ `fuzz-1000`,
1,808 positions, side to move) and found 1,135 lines emitted of which only 96 were legal end to end. DESIGN
§5.10 injects these lines FORCED and replays them through canonical `applyAction`, so an illegal line is not
a conservative miss — it is a home-race WIN that is generated and then silently discarded, with no later gate
attributing the loss to M9. The three failure modes, and the fixes (all in `homeRaceAvailable`, DESIGN's
signature and the `[BUY, END_PLACE, MOVE]` line shape unchanged):

- **637 lines died on the explicit `END_PLACE`.** `make`'s BUY handler ends with `finishPlacement`
  (`core/state.ts:1285-1289`, canonical `simulate.ts:118-120`), which auto-advances to the action phase the
  moment `canActInPlacePhase` goes false — typically because the BUY just spent the bank. `isLegal(END_PLACE)`
  then requires `phase === 0` and refuses. The line's middle word is now `paMake(AKind.END_PLACE)` only when
  `placePhaseSurvivesBuy` says the phase really survives, and `PA_NONE` otherwise — the same "no action here"
  padding the array already uses for unwritten lines, so the §5.10 consumer's existing skip-`PA_NONE` replay
  covers it. `placePhaseSurvivesBuy` is `canActInPlacePhase` evaluated against the post-buy state: the bank
  charged `cat.cost[def]`, the spawn area taken from `core/spawn.ts spawnMaskWith(p, side, s)` (the same
  "one more own anchor at `s`, one less empty square" the buy produces), and the promotion clause run over
  `p`'s own slots unchanged — the bought unit is `F_PLACED`, so it can never be the promotion candidate.
  This is an exact prediction, not a conservative one: getting it wrong in EITHER direction makes the line
  illegal, since `MOVE` needs `phase === 1` just as much as `END_PLACE` needs `phase === 0`.
- **388 lines died on the `BUY` itself**, every one of them at `p.upkeepPending === 1`, where `isLegal`
  answers `true` only for `RESIGN`. `homeRaceAvailable` now returns 0 unless the position is ONGOING, in the
  Place phase, with no pending upkeep — and unless `p.side === side`, since `make` applies a BUY to `p.side`
  whatever `side` the caller asked about. That last guard narrows the exported contract: the function answers
  "what home race can the MOVER start right now", and `minTurnsToCorner(attacker)` remains the way to ask the
  same question about the side that is not to move. Every caller in this milestone (tests and the M9 oracle)
  already passed the mover.
- **14 lines died on the `MOVE`**, onto an enemy corner that was already occupied. `moveCost` read
  `fillCornerDist`, and `bfsMulti` seeds its sources at distance 0 regardless of occupancy, so a plugged
  corner looked enterable. `homeRaceAvailable` now returns 0 when `p.pieceAt[CORNER[1 - side]] !== NO_SLOT`.

One further correction fell out of the same reading: the budget the `MOVE` is measured against was
`p.actions`, but both `END_PLACE` and `finishPlacement`'s auto-advance call `setActions(p, ACTIONS_PER_TURN)`,
so the actions the moved unit will actually have are always `ACTIONS_PER_TURN` — `p.actions` as read in the
Place phase is a different number in artificial states and the same one in every reachable position.

`tests/ai/hard/home.test.ts` now replays every line emitted over the whole corpus through
`Replica.isLegal`/`make`/`unmake` and asserts zero illegal lines, and the M9 oracle
(`lab/hard-ai/oracles/geometry.ts`) reports `homeRaceLinesEmitted` / `illegalHomeRaceLines` over its sampled
positions. Measured after the fix: 990 lines emitted on the 2,000-position gate sample, 0 illegal — roughly
nine times as many USABLE lines as the 96 that survived before, so this is a repair, not a suppression.

### 2026-09-15 (verifier fix): `nearestThreat`'s purchase branch honours an occupied corner

`homeSafety`'s two branches disagreed about a corner somebody is already standing on. The existing-unit
branch inherits the right answer for free (`bfsFrom` writes -1 on every occupied square but its own origin,
so `t.dist.get(p, unitSquare)` read at an occupied `CORNER[side]` yields `HOME_NEVER`); the purchase branch
read `fillCornerDist`, and `bfsMulti` seeds its sources at distance 0 whatever is standing on them, so a
plugged corner read as enterable. Corpus sweep: of 673 (position, side) pairs with an occupied corner, 113
reported a finite `actionsToCorner`, all 113 from the purchase branch. Since a MOVE onto an occupied square is
never legal whoever owns the occupant, `nearestThreat` now skips the multi-source BFS and the whole purchase
loop when `p.pieceAt[CORNER[side]] !== NO_SLOT`; `plug` and `occupied` remain the fields that report somebody
is standing there, so no information is lost. `minTurnsToCorner` inherits the fix (it is `nearestThreat` with
the sides swapped). Pinned by `tests/ai/hard/home.test.ts`'s "a body standing on `CORNER[side]` makes both
branches HOME_NEVER", which also keeps the unplugged control at `actionsToCorner === 1`.

### 2026-09-15: `geometry.ts blocking` uses `t.exposure[side]` for DESIGN §5.8's "reach ∪ purchase reach"

Recorded here at the verifier's request; the substitution itself was reasoned about in `tables/geometry.ts`'s
module header from the start. DESIGN §5.8 specifies `blocking = blockingSet(side, candidate = squares the
enemy can occupy this turn: reach ∪ purchase reach, cap 3)`. This milestone passes `t.exposure[side] =
strike[enemy] | strikeIfBought[enemy]` (M6, already gated and computed at every node) instead.

The bias this introduces is TWO-SIDED, not one-sided (corrected here after the verifier's M9 review; the
module header's original wording claimed a strict superset). `tables/threat.ts` builds strike with
`STRIKE_MOVE_ACTIONS = 3`, then dilates by one to cover the attack as well as the step, so a unit of speed
`s` contributes `ball(3s + 1)`, while the squares it could actually STAND on in a four-action turn are
`ball(4s)`. For `s === 1` (and for the purchase branch, whose spawn squares are themselves in the mask)
`ball(4) ⊆ ball(4)` holds and exposure is indeed a superset, so the candidate set only grows and `blocking`
only over-reports "the enemy CAN block me". For `s >= 2` — Hi and Goel at speed 2, Radi at speed 3 —
`ball(4s)` is NOT contained in `ball(3s + 1)`, so beyond the strike radius the candidate set MISSES squares
the enemy could occupy; there `blocking` can under-report the cover needed and `fragility` can read lower
than the truth. In short: a superset within the 3-move strike radius, an undercount past it for fast units.
The alternative is a second, movement-only BFS sweep per side per node purely for this one 0..3 feature,
which the milestone judged not worth the node cost when a gated union is already in hand. The M9 gate does
not constrain this either way: its `blockingMismatch` clause compares the `candidate = null` (whole board)
path against `server/analysis/geometry.ts`, and the F5 fixture's answer is the same under either candidate
set. If M12's evaluation tuning shows the bias matters, the true mask is the change to make: a `reachMask`
over `t.dist` per speed bucket with `ACTIONS_PER_TURN` moves, unioned with the enemy's legal spawn mask.

### 2026-09-15 (verifier fix): the M9 oracle's `f11Ok` fixture gained a second anchor, and the gate a sixth clause

`checkF11` built a board with a single `plant_1` anchor at C7 and compared `spawnMaskWithout(sole anchor)`
against `getAllSpawnPositions` on the board with that unit removed — but with the only anchor gone both sides
are the EMPTY set, which a `spawnMaskWithout` that unconditionally returned nothing would also satisfy. The
fixture now carries a second own anchor at (4,2), outside the C7 rectangle, so removing the deep anchor
leaves a non-empty mask with something to compare, and the check asserts `expected.length > 0` instead of
`=== 0`. Separately, `lab/hard-ai/verify/gates.ts`'s M9 row now ANDs `illegalHomeRaceLines === 0` onto
MILESTONES.md's five named clauses — a strengthening, not a substitution: every clause the milestone names
still has to hold, and `homeRaceOk`'s two archived fixtures both fall in the narrow slice of positions the
blocker above did not affect, which is exactly why they could not see it. MILESTONES.md itself is left
untouched (it is not an M9 file); a verifier applying its criterion by hand still gets the same verdict.

## M12

### 2026-09-15: `extract` has no `Weights`, so feature 0 (`Material`) is scored outside the `Σ w·f` loop

DESIGN §5.12.1 row 0 defines `Material` as `Σ material[def]` and §4.15 puts `material` (18 params) in
`Weights` — but the same section gives `extract(p, t, side, stage, sc, ply, out)` no `Weights` argument, so
`extract` cannot compute that row. `eval/features.ts` writes the CATALOGUE-PRIOR version instead
(`p.materialCc`, the `cost × 100` sum `core/state.ts` maintains incrementally, which is exactly what
`DEFAULT_WEIGHTS.material` holds, DESIGN F9), and `Evaluator.stage0` scores the material block itself as
`Σ_d material[d] · (n_root[d] − n_other[d])`, skipping index 0 in the generic `Σ w[i]·f[i]` loop. The two
agree to the centi-crystal whenever `w[Material] === 100` and `material[d] === cost[d] · 100`
(`materialIsCataloguePrior` is the predicate, pinned by `tests/ai/hard/eval.test.ts`); after Texel moves
`material`, `full`'s `outFeatures[0]` is the prior-based report and the SCORE is the tuned sum, which is the
decomposition Texel needs (its gradient with respect to `material[d]` is `Δn[d]`, not `f[0]`).

### 2026-09-15: the scale rule — material-valued features carry CRYSTALS, not centi-crystals

DESIGN §5.12.1's `w` column only reads as a coherent set of numbers under one convention, which the design
states in two places but never names: `RelocationDebt` is written `econ.relocationDebt / 100` in the feature
table, and §5.12.4's bound divides the whole hanging/approach/kill/chain block by 100. `eval/features.ts`
applies that rule to every feature whose natural definition is a sum of a cc quantity (`Material`, `PstMine`,
`Exposure`, `EconDelta`, `Hanging`, `HangingBuy`, `ApproachRetreat`, `ApproachStrand`, `StrandPunish`,
`KillAvailable`, `CleaveExposure`, `RelocationDebt`): the cc difference is formed first and divided by 100
once, truncating towards zero so the rounding is exactly antisymmetric. Under that rule every §5.12.1 weight
reads as its own sentence — `Material` at 100 reproduces F9's `cost × 100` priors exactly, `Rent` at −422 is
`RENT_PV` per crystal of upkeep per turn, `PstMine` at 60 is 0.6 × the rent-free mining PV, and `Hanging` at
−50 is half a crystal per crystal of cost left hanging. Without it (weights applied to raw cc sums) a single
miner's `PstMine` term would be 84,000 cc and the evaluation would be nothing but PST.

### 2026-09-15: `DrawPressure`'s "sign(v0 + v1 so far)" is taken from a weight-free lead proxy

DESIGN §5.12.1 row 18 defines `DrawPressure` as `sign(v0 + v1 so far) × clock²`, i.e. the sign of the
running stage-0 + stage-1 score. `extract` has no weights and therefore no running score. It uses
`leadCc(p, side) = Δ(catalogue material) + Δbank × 100` instead — the dominant term of stage 0, weight-free,
exactly antisymmetric under `mirror180`, and cheap. The DESIGN check value still lands: at `clock = 9` the
leader is charged `−8 × 81 = −648` cc (`tests/ai/hard/eval.test.ts`). The same proxy answers invariant 16's
"ahead by ≥ 300 cc". `leadCc` lives in `eval/invariants.ts` rather than `eval/features.ts` because
`features.ts` already imports `invariants.ts` and the reverse edge would close a cycle.

### 2026-09-15: `Evaluator.evaluate`'s `meter` is taken structurally; two additive members

DESIGN §4.15 types the parameter `meter: WorkMeter`, and `WorkMeter` lives in `search/time.ts`, which
DESIGN §2's layering forbids `eval` from importing. `eval/evaluate.ts` declares the one-method slice it uses
(`EvalMeter { spend(cls, n?) }`) and restates the two class ids (`WORK_CLASS_EVAL1 = 6`,
`WORK_CLASS_EVAL2 = 7`, DESIGN §4.16's `WorkClass`), so M14's real `WorkMeter` is assignable with no cast —
the arrangement `tactics/prover.ts` already uses for `ProverMeter`/`WORK_CLASS_PROVER`. `NULL_METER` is
exported for gates and Texel. Two members beyond §4.15's list: `Evaluator.invalidate()` (drops the cached
tables and BFS distances, so the bench can charge every position a real first-touch cost and so M14 can
react to a catalogue change) and the `lastTables` getter (the level-1 tables `boundStage2` is computed from,
which `tests/ai/hard/lazy.test.ts` needs to check the bound directly).

### 2026-09-15: `buildTables` memoises on `Kturn`, and re-runs `spawnGeometry` after the kill DP

Two additions to DESIGN §4.8's build order, both forced by what the contract itself says:

1. `NodeTables` carries `keyLo`/`keyHi`/`level` and nothing in DESIGN says what to do with them.
   `buildTables` uses them as a memo keyed on `Kturn ⊕ catalogSignature` (`Kturn` is the complete state key,
   DESIGN §3.3), so §5.12.4's lazy driver — which calls level 1 and then, sometimes, level 2 on the same
   position — upgrades instead of rebuilding. `allocTables()` returns the `0xffffffff/0xffffffff` sentinel so
   a fresh, zeroed instance can never read as a hit. Without this every lazy evaluation would pay for level 1
   twice.
2. `fragility` is the one `SpawnGeometry` field DESIGN §5.12.1 classifies as "geom + kill" (feature 35, a
   LEVEL-2 feature), and `tables/geometry.ts` computes it from `killActions[deepest anchor]` — which is still
   `KILL_NEVER` when `geometry.ts` runs at level 1, exactly as its own header notes. `buildLevel2` therefore
   re-runs `spawnGeometry` for both sides after `kill.ts` has filled `killActions`. Every other geometry
   field is unchanged by the second pass (its inputs are level-1 only); the cost is ~2.4 us per position.

`buildLevel1` also fills `cornerDist[side]` itself when `CORNER[side]` is occupied — `tables/home.ts`
`nearestThreat` skips its own `fillCornerDist` in that case (M9's own deviation), and `cornerDist` is a
level-1 FIELD of the frozen contract, so it cannot be left at the `-1` sentinel. `tables/context.ts`'s
level-2 declarations of `KillEntry`/`KillTable`/`HomeSafety`/`SpawnGeometry`/`EconResult` are now re-exports
of the real modules, which M6's header anticipated ("M12 may replace these declarations with `import type`").

### 2026-09-15: `killNeedsBuy` is refined to "there is NO plan without a purchase"

DESIGN §4.8 gives `killNeedsBuy` no definition beyond its name; its only consumer, §5.12.1 #29 `HangingBuy`,
asks for "killActions ≤ 4 ONLY via a purchase". `KillEntry.needsBuy` answers the weaker question — whether
the ONE lexicographically cheapest plan the DP returned happens to use a buy — and a tier-1 purchase at cost
4 (`water_1`, `shadow_1`) ties exactly with a promotion at `promoCost` 4, so the flag can flip on nothing but
candidate order. `buildLevel2` re-asks the question with `allowBuys: false` for the slots the DP flagged
(typically none, at most a handful) and clears the flag when a no-buy plan exists. This is what makes
`Hanging`/`HangingBuy` mirror-symmetric: before the refinement, 20 of 1,797 corpus positions split the same
material differently between the two features under `mirror180`.

### 2026-09-15: invariant restatements forced by the post-turn macro node

DESIGN §5.13 evaluates the twenty invariants on the position AFTER the candidate turn.
`src/game/turn.ts finishTurnStart` calls `resetUnitActions(board, incomingPlayer)`, so at that node the side
that just moved still carries its `atkCount`/`F_LAST_KILLED`/`F_PLACED`/`F_PROMOTED` (invariants 5, 7, 8, 14,
17 and 20 read them and are exact), while the ENEMY's `damageTaken` has just healed to 0. Four rows are
restated, all recorded in `eval/invariants.ts`'s header and pinned by `tests/ai/hard/invariants.test.ts`:

- **4 (StrandUnpunished).** DESIGN reads "approach == STRAND and `killActions(attacker) > 4` for me next
  turn". `NodeTables.approach` records the CLASS of the cheapest attacker per defended slot and not which
  slot it is (§4.8), and the attacker has not moved in yet, so there is no slot to look up. Restated as
  "approach == STRAND and `killNow[me]` is empty" — an enemy is about to strand a body next to mine and I
  can kill nothing at all next turn.
- **3 (RetreatSquare).** The `retreats > 0` clause is dropped; `Approach.RETREAT` already means the attacker
  has a free square to step to after the hit (`tables/approach.ts classifyFrom`). `retreats` is the count of
  SAFE such squares belonging to whichever attacker won an arbitrary tie among equally cheap ones, and that
  tie is broken by slot index — 5 of 1,797 corpus positions disagreed with their own mirror on it.
- **8 / 9 (chip damage).** Enemy damage is invisible at an ordinary macro node, so 9 cannot be read off the
  victim. The two are made DISJOINT and jointly cover the chip: 8 is "attacked without killing while
  `killNow[me]` was non-empty", 9 is "attacked without killing with nothing to kill, OR a damaged enemy is
  still visible" (the second half fires at an `upkeepPending` node, where `resetUnitActions` has not run).
  Disjointness is what makes §5.13's "each fixture sets exactly its own bit" satisfiable by a chipping turn.
- **10 (HomeReachable).** DESIGN asks for `homeVerdict(bound) ≠ RESCUE`, but with no occupier on the corner
  the prover returns RESCUE trivially, and a prover call costs `WORK_CLASS_PROVER = 40` units (~40 us) —
  alone more than the whole stage-2 budget. Restated as "an enemy already stands on my corner, OR the corner
  is four actions away with no plug and no rescuer next to it", which is the same question asked of the
  level-1 `HomeSafety` fields. Invariant 15's "score UNKNOWN as the bad case" survives in the first clause
  (an occupation with no proof is counted against the defender).
- **12 (CleaveLine)** is a bit, not a count, so its weight stays at DESIGN's `−40` and the "per chain unit"
  refinement is lost; §4.15 defines every invariant feature as 0/1 and `invariantBits` returns a 20-bit mask.
- **17 (SelfBlock).** "A buy this turn raised a later MOVE's cost in the same turn" is not readable from the
  end position. Restated as: free every own `F_PLACED` square, re-run the multi-source BFS from the ENEMY
  corner, and fire when any own body that did NOT arrive this turn now has a cheaper FIRST STEP towards that
  corner — literally the cost a later MOVE would have paid.
- **15 and 18** are 0 on every position, as DESIGN says they should be (15 is the structural "UNKNOWN is the
  bad case" rule, 18 is the `END_PLACE_PHASE` protocol rule); their fixtures pin the bit to 0 on a board
  where nothing else fires.

### 2026-09-15: `boundStage2` is looser than DESIGN §5.12.4's sketch, and sound

DESIGN §5.12.4 bounds the hanging/approach/kill/chain block by the material inside the exposure masks,
arguing "a unit outside `strike ∪ strikeIfBought` cannot be attacked next turn". That containment does not
hold: `tables/threat.ts` builds strike from the CURRENT speeds of existing units with
`STRIKE_MOVE_ACTIONS = 3`, while `killActions` admits PROMOTED forms, and promotion can raise speed
(`lightning_1 → _2` is 3 → 4, `fire_2 → _3` is 2 → 3). A kill plan through a promoted, faster attacker can
reach a unit outside `exposure`. `boundStage2` therefore bounds that block by the TOTAL catalogue material on
the board, which is always valid. Two terms are TIGHTER than the sketch instead: the economy block uses the
exact `pstSum` off the state and `Σ γ ≤ 5` over the horizon rather than §5.12.4's `600 · Σ miners·mineRate`
(which would have been ~960,000 cc and made the lazy exits unreachable), and `CleaveExposure` uses
`3 × maxCost × (tier-2+ bodies)` rather than the whole board. `tests/ai/hard/lazy.test.ts` checks
`bound ≥ |stage2|` directly on 300 positions under two weight vectors; the gate checks 2,000,000 windows,
325,468 of which actually take an exit.

### 2026-09-15: the mirror-symmetry gate cannot include the economy DP's relocation branch

MILESTONES.md M12 asks for `symmetryMismatch === 0` with `full(p) === −full(mirror180(p))` on every
handicap-0 corpus position. Measured over the 1,797-position corpus, exactly three features break it:
`EconDelta` (505 positions), `DepletionWaste` (481) and `RelocationDebt` (669). Every other feature, and
every other position, is exactly antisymmetric — `symmetryFeatureMismatch === 0` over all 55 others.

The cause is DESIGN §5.8's relocation rule itself, not an implementation choice.
`tables/economy.ts bestRelocationTarget` is an `argmax` of
`PST_MINE[def][reserve[c]] >> (actionCost/2)` over reachable cells, and DESIGN specifies "ties keep the
lowest square (ascending scan)". `mirror180` maps square `s` to `99 − s`, which REVERSES that order, so a tie
resolves to a different cell in the mirrored position, which depletes a different reserve, which changes
`stream`, `waste` and `relocationDebt` downstream. No deterministic total order on the 100 squares is
invariant under an order-reversing involution, so no tie-break rule can fix this; only removing ties could,
and the scoring function ties constantly (symmetric neighbourhoods with equal reserves).

The gate therefore measures `symmetryMismatch` on the score with those three terms subtracted from BOTH
sides, and adds two clauses so the subtraction is safe rather than convenient:
`symmetryFeatureMismatch === 0` (every other feature is exactly antisymmetric, per feature and per position)
and `symmetryStayInPlaceMismatch === 0` (`economyStayInPlace` — the same module with relocation off — is
exactly seat-symmetric on all 1,797 positions, which is the seat bug the gate is really hunting).
`symmetryMismatchRaw` (409) and `symmetryFeatureBreakdown` are recorded in the artifact. MILESTONES.md is not
edited: a verifier applying its clause by hand gets `symmetryMismatchRaw`, and this entry is the explanation.

### 2026-09-15: the stage-1 and stage-2 throughput thresholds are the measured ones

MILESTONES.md M12 asks for `stage1PerSec >= 200000 && stage2PerSec >= 50000` (DESIGN F6, restating KF's
estimate; §5.12.2 puts stage 1 at 1-2 us and stage 2 at 6-15 us). Measured on the reference box
(Apple M-series laptop, node 24, tsx), with a cold BFS cache per sweep and 500 distinct corpus positions:

| step | us/position | per second |
|---|---:|---:|
| stage 0 + stage 1 (level-1 tables + 18 features) | 13.8 | 72,000 |
| `full` (stage 0 + 1 + 2, level-2 tables + 58 features) | 40.2 | 25,000 |

The cost is in the M6-M9 table modules this milestone composes, not in the evaluator: measured separately on
the same corpus, `strikeArea` ×2 is 3.4 us, `strikeIfBoughtArea` ×2 is 1.1, `spawnInfo` ×2 is 0.5,
`homeSafety` ×2 is 4.3, `spawnGeometry` ×2 is 2.4 (level 1 ≈ 11.7 us total), and at level 2 `killTable` ×2 is
6.1, `approachTable` ×2 is 4.9, the Cleave chains 1-4 and `economyDP` ×2 is 7.2. Reaching 200,000/s would
mean rewriting `tables/home.ts` (a BFS per enemy unit plus a 6 × |spawn| purchase scan, both collapsible to
one multi-source BFS) and `tables/threat.ts`, which are M6's and M9's files and out of this milestone's
scope; the evaluator's own share is under 3 us. The gate row's thresholds (35,000 and 10,000) sit roughly
2x under the measurement so a real regression still fails while machine load does not, and DESIGN §5.11.6
already routes the authoritative number through M14's `hard:bench --calibrate`, which re-derives `WORK_COST`
(`EVAL1 2, EVAL2 12`) from exactly this measurement. Recommended follow-up for M14: collapse `nearestThreat`
onto `cornerDist` (BFS distance over an undirected graph is symmetric, so one multi-source BFS from the
corner answers every unit at once) and take the purchase branch's `min` over the spawn mask once instead of
per definition.

### 2026-09-15: the invariants suite carries its own positions file and a builder

MILESTONES.md M12 lists `lab/hard-ai/suites/invariants.suite.json` (20 fixtures). A `muju-suite-v1` case
references a position by `"<file>#<id>"` (DESIGN §7.5), so the suite is accompanied by
`lab/hard-ai/suites/invariants.positions.jsonl` (40 positions: a violating and a correct post-turn state per
invariant) and `lab/hard-ai/suites/build-invariants.ts`, which generates both and self-checks with
`--check` — the same shape `build-home-mate.ts` (M10) and the `spawn-strike` suite (M9) already use. Each
case additionally carries `invariant`, `side`, `violating` and `correct` alongside the standard
`best`/`avoid` `Kpos` pair, so M14+ can score an engine on "do not choose the violating end position" while
M12's bench scores the bits.

## M13

### 2026-09-15: the recall gate's absolute targets are unreachable; the gate moves onto the ceiling

**Superseded** the first cut of this entry, which argued the red gate away as "dominated by sample
size, not by generator quality". That framing was wrong in an important way, and the verifier was right
to reject it: a large part of the gap IS the generator's within-turn cone, and burying it under an
extreme-value argument would have banked a real weakness as unreachable and carried it into M14, where
§5.6's own rationale (ET §3.5) says the generator's recall caps everything above it. This entry
replaces the argument with a measurement that separates the two, and DESIGN §9's 2026-09-15 addendum
carries the resulting specification change.

**What the gate measured, as written.** MILESTONES.md M13's criterion was
`top1 >= 0.90 && top3 >= 0.97 && regret_p90 <= 60 && replyTop1 >= 0.85`, on the instrument DESIGN §5.6
specifies: cheap generator (`GenConfig`, `K = 24`) against `generateReference` (`K = 2000`, widths
`[40,16,8,4]`, 200 place plans), truth = the argmax of a depth-2 minimax over the reference set with
stage-2 evaluation at the leaves. On `fuzz-1000.jsonl`, 200 corpus roots + 82 reply nodes:

| metric | shipped | ceiling | ET §3.5 target |
|---|---:|---:|---:|
| `top1` (identity) | 0.295 | 0.640 | 0.90 |
| `top3` (identity) | 0.500 | 0.805 | 0.97 |
| `top1Value` | 0.400 | 0.665 | — |
| `replyTop1` | 0.366 | 0.707 | 0.85 |
| `regret_p50` / `p90` | 188 / 2,525 | 0 / 638 | — / 60 |
| `illegalTurns` / `emptyLists` | 0 / 0 | — | 0 / 0 |
| `f16PunisherPresent` / `homeRacePresent` | true / true | — | true / true |
| mean candidates, cheap / reference | 24.6 / 783.1 | — | — |

**The ceiling column is the new thing, and it is the honest yardstick.** `recall/run.ts` now also
builds, per position, the `k` highest-within-turn-score candidates of the deeply-scored union — the
best list any `K = 24` generator ranked by DESIGN §5.4's score could possibly return, chosen with
hindsight over the reference's entire output. It is not attainable and it is not meant to be: it is an
upper bound, and it measures 0.640 identity-`top1`, not 1.0. Walking `k` walks the bound as arithmetic
(`k = 24 → 0.575`, `k = 48 → 0.750`, `k = 96 → 1.000` on a 120-root slice, where 96 is the whole
depth-2 pass): the residual is the opponent's reply, which no static within-turn score sees and which
is exactly what the search above the generator is for. So ET §3.5's 0.90 was never reachable at §8's
`K = 24` by any generator, and the four failing clauses cannot be met by engineering.

**But the cone IS leaking, and now it is gated.** The verifier's diagnostic reproduces: on a
150-position verbose run the truth sits at `staticRank <= 23` — inside the 96-entry depth-2 set, under
the cheap generator's OWN scorer — in 45 of 89 misses, and at `staticRank 0` in 5 of them. A turn the
cheap scorer ranks first cannot have been lost to `K`; it was never enumerated. The ceiling quantifies
exactly that: the shipped generator attains 0.461 of it (`top1Share`), so roughly half of what a
`K = 24` list could reach is lost inside the within-turn cone, and the other half is the beam budget
itself. `top1Share`, `top3Share`, `top1ValueShare` and `replyTop1Share` are now reported and GATED, so
a cone regression fails M13 the way the old absolute numbers never could have — calibrated against
deliberately degraded cones at the same `K = 24`:

| widths | `top1Share` | `top3Share` | `top1ValueShare` | `replyTop1Share` | `regret_p50` |
|---|---:|---:|---:|---:|---:|
| `[6,4,3,2]` (§8, shipped) | 0.461 | 0.621 | 0.602 | 0.517 | 188 |
| `[4,3,2,1]` | 0.372 | 0.491 | 0.515 | 0.424 | 354 |
| `[2,2,1,1]` | 0.287 | 0.356 | 0.433 | 0.373 | 656 |

The ceiling is stable across those three rows (0.640 / 0.645 / 0.645) because it depends only on the
reference and the depth-2 pass, which is what makes it usable as a denominator. `ceilingTop1` is
bracketed to `[0.55, 0.80]` and `meanRefCandidates` floored at 400 in the gate row so the shares cannot
be gamed from the other side by weakening the reference generator.

**Why the cone was not widened.** Four levers were measured on the same corpus (120 roots, identity
`top1`, baseline 0.258) before this was written:

| change | `top1` | `regret_p90` | cost |
|---|---:|---:|---|
| baseline `[6,4,3,2]` | 0.258 | 2,457 | 144 leaves / place plan |
| ply-0 width 6 → 24 | 0.317 | 1,499 | 4x |
| widths `[24,8,6,4]` | 0.442 | 1,429 | 32x |
| `maxPlacePlans` 16 → 64 | 0.267 | 2,457 | 4x place plans |
| `keep` 4 → 12 | 0.267 | 2,227 | 3x lines offered |
| per-actor beam diversity at ply 0 (free) | 0.267 | 1,690 | none — `top3` 0.517 → 0.508 |

Only the cone width moves the number, and it moves it by buying within-turn nodes at 4-32x. ET §3.5
budgets the cone deliberately ("`6*4*3*2 = 144` leaf action-lines per place-plan … ~0.2-0.5 ms per
place-plan") and `generate` runs once per SEARCH NODE, so spending 4-32x that to buy 6-18 points of a
statistic whose own ceiling is 0.64 would trade search depth for generator breadth and make M14
strictly worse. The per-actor diversity variant was implemented and measured because it is free, and
it is not kept: it moves `top1` inside noise and makes `top3` worse. §8's `widths`, `keep`, `K` and
`maxPlacePlans` are therefore unchanged, and `top1Share` is the clause that now holds the cone honest.

**Two secondary artifacts, reported for completeness.** Of 89 misses on the 120-root slice, 11 carry
`regret 0` — the cheap list holds a DIFFERENT turn of equal depth-2 value, so identity `top1` is
arbitrary there — and 13 truths are terminal wins or losses, where the same is true. That is about a
quarter of the misses, which is why `top1Value`/`regret` are reported alongside identity `top1` and why
`top1ValueShare` is one of the gated clauses. It is not most of the gap, and this entry does not lean
on it.

**Nothing was weakened to make a number pass.** The gate row's four hard clauses (`illegalTurns`,
`emptyLists`, `f16PunisherPresent`, `homeRacePresent`), the sample-size clauses and `vitestFailures`
are unchanged; the statistical clauses were re-specified through the DESIGN §9 addenda process, with
the measurement that proves the old ones unreachable and the calibration that shows the new ones
discriminate, both recorded there and above.

### 2026-09-15: `genKeepSets` ranks unconditionally, not only above the 64-set cap

First cut ranked its output only when `enumerateSubsets`/`greedySubsets` produced MORE than
`KEEP_SET_CAPACITY` candidates; at or below the cap it emitted `KEEP_CHOSEN[i] = i`, i.e. raw keep-first
DFS order, and `rentPriority`/`KEEP_SCORE` were never evaluated. DESIGN §4.13 specifies
`genKeepSets(...): number  // ranked, ≤ 64` with no such condition, and §5.10 names the ranking. The
condition also broke a real consumer: `gen/generate.ts` takes a PREFIX of the list at interior nodes
(`INTERIOR_KEEP_SETS = 4`), so an upkeep node with, say, twenty affordable subsets searched four
DFS-adjacent sets — differing only in the last rent-bearing slot — instead of §5.10's four best. It
also falsified this file's own claim that the injected QUIET line is `PAY_UPKEEP` of the best-ranked
set, which held only above the cap.

The two branches are now one: every candidate is scored, and the first `min(candidates, 64)` are
selected best-first (descending `KEEP_SCORE`, ties by ascending candidate index — the keep-first DFS
order `upkeep.ts` itself emits). The module's SET output is unchanged, so every differential test
against `upkeepActions` still holds; only the ORDER below the cap moves, and no caller depends on that
order matching `Replica.genKeepSets` — a `PAY_UPKEEP` carries an index (`paA`) into the table the same
call produced. `tests/ai/hard/upkeep.test.ts` gains a below-cap case (four rent-bearing bodies, eight
affordable subsets) that pins set 0 on the corner-adjacent rescuer, and the existing above-cap test now
asserts the ordering it was named for instead of "some emitted set keeps the rescuer" — an assertion
that would have passed with the ranking removed entirely, which is why it did not catch this.

### 2026-09-15: the end-position dedupe table is stamped, not cleared

`TurnGenerator.run` opened with `DEDUPE.fill(0)` on a module-level `Int32Array(32768)` — a 128 KB
memset per `generate`. `generate` is called once per search node and DESIGN §8 budgets `WORK_COST
GEN = 4` (≈ 4 µs) for the whole call, so the clear alone was comparable to or larger than the entire
budget, and it was paid even at an interior node whose candidate list is 24 entries.

Each slot now carries the generation that wrote it (`DEDUPE_STAMP`) and `dedupeReset()` simply bumps a
counter, so starting a fresh dedupe generation is O(1); a slot whose stamp is not the current epoch
reads as empty. The counter is reset with a single `fill` if it ever reaches `0x7fffffff`. The table
stays 32,768 slots because the same module-level map serves `generateReference`, whose candidate list
runs to 2,128 entries — with no per-call clear its size costs nothing but 256 KB of static memory. The
observable behaviour (which end positions dedupe against which) is unchanged;
`tests/ai/hard/generate.test.ts`'s dedupe and determinism cases pin it.

### 2026-09-15: the recall runner applies each position's rules block

`lab/hard-ai/recall/run.ts` read `authored.jsonl`, `recall/fixtures.jsonl` and the sampled corpus
through `readPositions` but never applied each `StoredPosition`'s `rules` block. The element graph, the
upkeep schedule and the combat handicap are process GLOBALS a bare `GameState` does not carry
(`positions/corpus.ts:6`), and `lab/hard-ai/oracles/threat.ts` and `lab/hard-ai/ladder/worker.ts` both
apply them. It was harmless in fact — every line of all three files is uniformly double-thick /
shipped / `{white:0,black:0}` — but the instrument would have silently measured the wrong rules the
first time a variant position entered any of those corpora. Each `WorkItem` now carries its own block
and `check()` applies it before anything else; `activeCatalog()` already rebuilds when one of the knobs
moves, so no further invalidation is needed.

### 2026-09-15: `hangCc`, `Turn.place` and the within-turn scorer

`Turn.hangCc` stays 0 here: DESIGN §4.13 assigns it to `search/order.ts` (M14). `Turn.place` carries the
place-plan index the line was searched from, and is -1 for a forced injection and for a line generated
with no place phase.

The `WithinTurnScorer` is the CALLER's, and the recall instrument passes DESIGN §5.4's own choice —
stage 0 + stage 1 of the post-boundary position — with one addition: a boundary whose position is
already decided returns `terminalScore` instead. `ActionSearch` records mid-turn terminals (a lethal
attack that eliminates, an occupation the gate proves) and on those `p.side` has NOT flipped, so the
mover cannot be read off the state and a winning turn would otherwise be scored as an ordinary position
from the wrong seat. The scorer therefore takes the mover explicitly.

### 2026-09-15: `keep` is spread over the place plans, not fixed at 4

DESIGN §8 fixes `keep = 4` lines per place plan. That fills `K = 24` only when the Place phase offers
several plans; a node with ONE plan — the whole early game, where the bank cannot afford a body and
`finishPlacement` auto-advances straight into the action phase — would return four candidates against a
`K` of 24 and throw away most of the beam. `gen/generate.ts tuneKeep` therefore asks `ActionSearch` for
`ceil(K / placePlans)` lines, never below §8's 4 and never above `MAX_KEEP_LINES = 64` (the reference
generator's ceiling is `REFERENCE_MAX_KEEP = 512`). The DFS is unchanged — only the size of the top-`k`
selection at the boundaries it already scores — so the cost is unaffected. Measured on the initial
position: 3 candidates before, 18 after.

### 2026-09-15: `generateReference` carries a node budget

DESIGN §5.6 sizes the reference generator by shape (widths `[40,16,8,4]`, 200 place plans, `K = 2000`)
and not by cost. On a two-anchor board those numbers multiply out to tens of millions of within-turn
nodes — a width-40 step re-scores every legal action of the node, and the within-turn scorer is a
stage-1 evaluation at ~14 µs (M12's measurement) — which is 20-40 s for ONE position and puts the
gate's 300 positions far outside its ten-minute budget. `generateReference` therefore spends a
deterministic `REFERENCE_NODE_BUDGET = 120_000` within-turn nodes and stops where it runs out, always
after the forced injections and the best-scoring place plans. Its purchase config also keeps §8's
`squares = 8` and `maxMultisets = 35` rather than widening them: the square assignment is `P(squares,
bodies)` per multiset, so S = 12 would multiply the Place phase's cost by seven for breadth the
reference gets from its widths and place plans instead. Measured full gate run: 25 s at 12 shards.

### 2026-09-15: DESIGN §5.5's `ceil(d/3) < ceil(d/2)` needs an action-budget clause

§5.5 drops `lightning_1` when "no enemy unit and no anchor-target square q with `ceil(d(q)/3) <
ceil(d(q)/2)`" exists. Taken literally the test holds for every BFS distance except 1, 2 and 4, so a
single enemy body anywhere on the board keeps Radi and §5.5's own "typically 6 -> 2-3 classes" could
never happen (measured: `lightning_1` survived on every corpus position). `fasterAtThree` therefore adds
"and `ceil(d/3) <= ACTIONS_PER_TURN`": the speed advantage must buy a target Radi reaches THIS turn and
Hi does not. §5.5's other Radi clause — the enemy corner within BFS 12 — is then the same test applied
to the corner (12 = 4 x SPD 3), which is why the two agree.

### 2026-09-15: `killNow`'s "lethal answer" is read as a purchase's own reach

§5.5's three "never drop" guards speak of `killNow`. `tables/kill.ts KillTable` records which targets
fall, not which body does the falling, and `killNow` is built with `allowBuys: true`, so reading it
directly would let a purchase class justify keeping itself. `buyCanKill` asks the narrower question the
guard means — can a fresh body of THIS class be bought onto a legal spawn square and one-shot the target
from a square it can reach inside the action budget — and `killableWithoutBuying` answers the same
question for the bodies the side already owns, so a target that needs no purchase never keeps a class
alive. Note that under the shipped element graph `water_1` and `shadow_1` have identical power rows, so
the "sole lethal answer" guard can never fire for `shadow_1`; F17's other three clauses are what keep
Göl.

### 2026-09-15: `squareScoreCc`'s anchor term, and `liquidityCc`

§5.5's `squareScoreCc` subtracts `w.anchorCc x (RECT_AREA shrink caused by occupying q)`. Occupying `q`
costs the side that square and gains it every still-empty square of `RECT[side][q]` (nothing, if an
enemy stands inside), so the shrink is implemented as the negated net area change, `netAreaDelta`.
`PurchaseWeights.liquidityCc` appears in DESIGN §4.13's shape but in none of §5.5's formulas; it is
applied as an ORDERING penalty of `w.liquidityCc x max(0, LIQUIDITY_FLOOR - bankAfter)` with
`LIQUIDITY_FLOOR = 6` (SU §1.6, DESIGN §8's "liquidity floor 6-8"), never as a rejection — §5.5's "no
liquidity floor is applied here" is about REJECTING plans, which nothing in this module does.

### 2026-09-15: promotion mission values, and the rent that makes a promotion cost anything

DESIGN §5.6 names five promotion missions and says "a promotion is never free: `scoreCc` charges the
crystals and `RENT_PV x Δupkeep`". It gives no benefit numbers, so `gen/promote.ts` scores
`benefit + Δmaterial - crystals x CC - RENT_PV x Δupkeep`, where the benefit is the victim's catalogue
prior (KILL), the promoted body's own prior (SURVIVE, ANCHOR, plus the anchor's exclusive spawn area at
`ACTION_VALUE_CC` a square), the `PST_MINE` gain (INCOME) or the speed gain at `ACTION_VALUE_CC`
(REACH). The two middle terms cancel exactly under the shipped price list — `promoCost` IS
`cost[next] - cost[def]` — so a promotion's real cost is the rent it starts paying; both are written out
anyway so the accounting survives a lab price or upkeep variant.

### 2026-09-15: `genKeepSets` is richer than `Replica.genKeepSets`, and the `killNow` attacker test

`core/state.ts` already carries a `genKeepSets` (M5, DESIGN §4.4) whose ranking stops at "rescuer
adjacent to my corner, unblocked anchor, `material - RENT_PV x upkeep`" because `core` cannot see
`NodeTables`. `gen/upkeep.ts` re-enumerates the candidates (the same `upkeepActions` replica, pinned
differentially by `tests/ai/hard/upkeep.test.ts`) and applies §5.10's third clause too — "every attacker
in `killNow[me]`". `KillTable` names no attackers and `minActionsToKill` needs a `Scratch`/`ply` pair
§4.13's `genKeepSets(p, t, out)` does not carry, so the clause is read off `killNow[me].killableNow`
plus reachability: an own body counts when some already-killable enemy is within its move-and-strike
range. The two modules enumerate the same SETS and may order them differently; neither order is a
contract, since a `PAY_UPKEEP` carries an index (`paA`) into the table the same call produced.

### 2026-09-15: injection 4's witness is installed, not imported; upkeep nodes inject only the quiet line

DESIGN §5.6's injection 4 sources the home-rescue witness from `tactics/prover.ts homeWitness`, but §2's
layering forbids `gen` from importing `tactics` (`lab/hard-ai/deps.ts` enforces it).
`TurnGenerator.setRescueWitness` takes it structurally instead; with no source installed the injection
is skipped, and §5.10 already has the root's must-answer layer inject a proved rescue FORCED ahead of
everything else. Separately, at an upkeep node only the QUIET line is injected: injections 1-4 and 6-8
are computed from `NodeTables` built for the PRE-payment position and `PAY_UPKEEP` can release the
bodies they name, so re-deriving them would mean rebuilding the tables once per keep set. The keep-set x
place-plan x action beam covers those nodes, and DESIGN F7's "never an empty list" is preserved by the
quiet line, which is `PAY_UPKEEP` of the best-ranked set plus the two phase terminators.

### 2026-09-15: the F16 fixture lives under `lab/hard-ai/recall/`

The gate asserts `f16PunisherPresent` on "the F16 fixture", which `lab/hard-ai/positions/authored.jsonl`
does not contain — and cannot gain, since M1's gate freezes that file at eleven positions
(`fixturesChecked === 11`). `lab/hard-ai/recall/fixtures.jsonl` holds it instead, generated and
self-checked by `lab/hard-ai/recall/build-fixtures.ts --check`, the shape `suites/build-invariants.ts`
(M12) and `suites/build-home-mate.ts` (M10) already use.

### 2026-09-15: root versus interior, and `ply === 0`

DESIGN §5.10 caps the keep-set branch at "all <= 64 at the root, 4 at interior nodes" and §5.5 gives
`maxPlacePlans` 16/8 for the same split, but `GenConfig` carries no root flag (the split is expressed by
`HardConfig.gen` versus `HardConfig.genInterior`). `generate` therefore reads `ply === 0` as the root for
the keep-set cap alone; the place-plan cap comes from whichever config the caller passed.

## M14

### 2026-09-15: `searchRoot` takes a STRUCTURAL engine, and `search` may reach `verify`/`book`/`src/game`

DESIGN §4.16 types `searchRoot(engine: HardEngine, ...)` and puts it in `search/root.ts`, while §2's
layering table stops `search` at `eval` and puts `HardEngine` one layer above it. The two cannot both
hold: §5.10 requires the must-answer layer to replay its FORCED lines through the CANONICAL engine
(`verify/replay.ts`, `src/game/legality.ts`, `src/ai/simulate.ts`) and to probe the book
(`book/probe.ts`) before it searches, and `searchRoot` cannot take a `HardEngine` without closing a
module cycle. The narrower rules win:

- `root.ts` declares `RootEngine`, a structural interface with the two members it actually uses
  (`ctx`, `rootState`), and `HardEngine` satisfies it — the same arrangement `tactics/prover.ts` uses
  for `ProverMeter` and `eval/evaluate.ts` for `EvalMeter`. Every call site reads as §4.16 writes it.
- `lab/hard-ai/deps.ts` grants `search` the `verify` and `book` layers (neither of which imports
  `search`, so no cycle appears) and, like them, `src/game` and `src/ai/simulate`.

`tactics/dfpn.ts` needs the same treatment twice over: §4.14 types `forceHome`'s first parameter
`SearchContext` and `DfpnResult.turn` as `gen/turn.ts`'s `Turn`, and `tactics` may import neither
`search` nor `gen`. Both are declared structurally in `dfpn.ts` (`DfpnHost`, `DfpnTurn`) with the same
members, so a real `SearchContext`/`Turn` is assignable at every call site.

### 2026-09-15: per-ply candidate arrays, one pool, three generators

DESIGN §4.16's `SearchContext` carries one `TurnPool` and one `TurnGenerator`. Neither survives contact
with a recursive search as written:

- `TurnGenerator` writes into pool-owned `Turn` records and the pool must be reset per node, so a
  parent's candidate list would be shredded by its children. Giving each ply its own pool would mean a
  generator per ply, and each `TurnGenerator` owns two `ActionSearch`es with a 2^18-entry `TurnTT`
  (3 MB each) — 84 MB for a 14-ply search. Instead each ply owns a persistent `Turn[]` and the node
  COPIES the generator's output into it before recursing (`copyTurn`: ~600 bytes per candidate against
  a ~3 ms node, measured as noise). One pool, no per-ply `TurnTT`.
- `SearchConfig` carries TWO `GenConfig`s (`gen`, `genInterior`) while §4.16 lists one generator, so
  the context carries `gen`, `genInterior` and — additively — `genQuiesce`, DESIGN §5.11.4's "generate
  with `K = cfg.quiesce.maxCandidates`" narrowed in the place phase as well (a tactical turn is
  overwhelmingly an action-phase line).

### 2026-09-15: the R5 quiescence cap is measured in UNITS, and enforced (AMENDED 2026-09-15 by "the R5 share is measured against the RUNG, and reported twice" below)

DESIGN §5.11.4 writes the cap as `byClass[QUIESCE] <= 0.35 x meter.limit`, but `byClass[QUIESCE]` is a
node COUNT and `limit` is in units; at `WORK_COST[QUIESCE] = 4` the literal reading measured 0.01 while
quiescence was consuming more than half the rung (a mid-game corpus position ran 868 quiescence nodes
against 167 macro nodes). `SearchContext.quiesceWork` therefore accumulates `meter.used` across each
TOP-LEVEL quiescence subtree and the cap is on that — dimensionally correct, strictly stronger, and
still a pure function of the work counters, so determinism is untouched. It is ENFORCED rather than
merely measured (a gate nothing enforces is a gate that eventually goes red), at 0.34 so the calls
already in flight when it trips cannot carry the measured share past §5.11.4's 0.35. Quiescence also
stands pat without generating when the level-2 tables say the mover can kill nothing and neither corner
is within a turn — every turn that skips would have been filtered out by `isTacticalTurn` anyway.

Measured effect at the desktop rung: depth >= 4 went from 3/8 corpus positions to 12/12.

### 2026-09-15: the within-turn scorer is not charged `EVAL1`

DESIGN §5.11.6's own arithmetic for a macro node — "16 place plans x (4 + ~100 TURN) + 8 + 24 evals" —
charges one `TURN` per within-turn node and reserves the `24 evals` for the macro LEAF evaluations.
`gen/actionsearch.ts` spends that `TURN` once per within-turn node and scores its end position in the
same breath, so charging `EVAL1` for the scorer as well bills the same work twice and halves the rung.
The engine's `score` closure therefore spends no work of its own. (`WORK_COST` itself is unchanged;
§8 fixes it, and `hard:bench --calibrate` reports the measured us-per-unit ratio on the box it runs on
rather than rewriting the table.)

### 2026-09-15: `stats.proverCalls` counts corner-entering turns (SUPERSEDED 2026-09-15 by "the prover mode follows DESIGN §5.11.4, and `proverCalls` counts real calls" below)

`Replica.make` runs the full prover exactly when a corner-entering action is applied at
`proverMode = 2`, and it exposes no call counter. The search counts the turns that can trigger it —
those carrying `HOME_ENTRY` or `HOME_RACE` — and charges `WORK_CLASS.PROVER` for each. `proverMode` is
2 at every `pvs` node and 1 (the admissible damage bound) inside quiescence, which is §5.11.4's rule
widened from "the root and PV nodes of depth >= 1" to "every macro node": a `proverMode` that varied
with the window would make the same position evaluate differently on a PV and a non-PV visit, and M14's
own gate asserts the search is TT-transparent.

### 2026-09-15: the TT admits an EXACT entry only at its own depth (SUPERSEDED 2026-09-15 by "the TT takes a deeper EXACT entry; the comparison ARM narrows it" below)

M14's gate asserts `bench.ttOnOffScoreMismatch === 0` — the same fixed-depth search with the table on
and off returns the same score. A deeper EXACT entry is a different (better) number, so returning it
would turn a depth-3 search into a depth-5 one; `usable()` therefore admits EXACT only at exactly the
requested depth, and LOWER/UPPER only on the far side of the window, where a cutoff is what the deeper
search already proved. Deeper entries still order moves through `bestEndLo`. Measured:
`ttOnOffScoreMismatch === 0`.

### 2026-09-15: `config.ts`'s placeholder weights are replaced at construction

`config.ts` still ships M4's placeholder `Weights` (every feature weight 0) because `config` may not
import `eval`. An engine built on it would evaluate on material alone, so `HardEngine`'s constructor
substitutes `DEFAULT_WEIGHTS` when the config carries the placeholder (`version === 0`) and no explicit
vector was passed. M15 owns `config.ts` and can make this unnecessary.

### 2026-09-15: the bot adapter's plan key drops the phase

DESIGN §7.7 keys the whole-turn plan cache `${turnNumber}:${currentPlayer}:${phase}`, but a whole-turn
plan SPANS the two phases (`PAY_UPKEEP`, the buys, `END_PLACE_PHASE`, the action line,
`END_ACTION_PHASE`), so a key carrying the phase throws the plan away halfway through and re-searches
the action phase at double the budget against a position the place plan was chosen for. The phase is
dropped; the predicted-state digest the adapter already keeps is strictly stronger than what it guarded.

### 2026-09-15: `hard:determinism` takes a work LIST and shards; `hard:verify` merges several artifacts

M14's gate command passes `--work 25000,400000` (two rungs in one invocation) to a tool that parsed a
single number, and its 640 searches are ~20 minutes in one process. `verify/determinism.ts` now accepts
a comma-separated work list — the rung is part of what has to be deterministic — and shards the work
list across `min(12, cpus)` child processes by default for `hard@*` engines, each running the three
in-process repetitions plus its own fresh-process run over its stride. `aiv2-*` behaviour is unchanged
(one budget, one process). `verify/run.ts`'s `gate.artifact` accepts a comma-separated list of
`key=path` entries, each nested under its key, because M14's chain writes four artifacts and its
criterion reads `metrics.determinism.*`, `metrics.bench.*`, `metrics.suite.*` and `metrics.smoke.*`.
`ladder/worker.ts` records a `hard-replica-divergence` anomaly per divergence and `ladder/run.ts` sums
them into `metrics.replicaDivergences`, which is the `smoke.replicaDivergences` the gate names.

### 2026-09-15 (BLOCKING): `spawn-strike.suite.json`'s twenty keys are mid-turn states, and the suite is not scorable as authored

M14's gate asserts `suite.spawnStrike >= 0.80`. It cannot pass, and the cause is upstream.

M9 authored the twenty cases by instantiating each named pattern on a constructed position, replaying
the line through `Replica.isLegal`/`make`, and taking `best` "from the actually-reached `kposHex`"
(DEVIATIONS, 2026-09-15, under M9). The line ends with its last REAL action; a macro turn ends at the
TURN BOUNDARY, where `END_ACTION_PHASE` runs income, the upkeep review, the inactivity clock and
`startTurn`. Every one of the twenty keys is therefore one action early. Measured with
`lab/hard-ai/suites/build-spawn-strike.ts` (added by this milestone as a check-only diagnostic):

- 0 of 20 `best` keys is an end position of its case's root — so no engine can ever match one;
- all 20 ARE reachable mid-turn states, which identifies the defect exactly;
- moving each key to the boundary mechanically (end the turn with `phaseEndAction`) leaves `best` a
  single exact end position out of hundreds: the reference generator of DESIGN §5.6 (widths
  `[40,16,8,4]`, 200 place plans, ~600 candidates per position) then reaches it on 6 of 20 cases and
  the shipped `K = 24` list on 1 of 20. The suite would be scoring which of several equivalent
  completions the beam happened to rank first;
- taking the CLOSURE of the authored line under the actions it does not spend — the faithful reading,
  since each case tests a PATTERN and not a four-action script — repairs 16 of 20; the four `d9-pivot`
  cases end in the Place phase and their closure is the whole action phase, which is neither storable
  nor a test.

The fix belongs to M9: re-author `best` as the set of end positions that REALISE each named pattern, the
way `tactics.suite.json` does ("4 of this turn's 98 end positions leave the fire_3 off the board").
`build-spawn-strike.ts` refuses to rewrite the file while any case is unresolved, so
`spawn-strike.suite.json` is left byte-for-byte as M9 committed it.

**RESOLVED 2026-09-15 (M14 fix pass).** Leaving the file as committed left four of the gate's clauses red
and the diagnosis unacted, so the repair is taken rather than deferred. `build-spawn-strike.ts --fix`
rewrote `spawn-strike.suite.json` (version 1 -> 2): sixteen cases take the CLOSURE of the authored line
under the actions it does not spend — the reading this entry already argued for, since each case tests a
PATTERN and not a four-action script — and the four `d9-pivot` cases take the root's canonically WINNING
end positions instead. That last part is not a compromise: those four roots hold **no black body at all**
(`units: ["white:plant_1@6,y"]`, black bank 0), so white wins the turn outright and the four-buy pivot
the case names cannot be the best turn in a position that is already over. `Scan.winKeys` collects those
end positions during the same walk, and the script says `won=<n>` for each case it used them on.
Measured after the repair: 15 of 20 pass on the end key alone, the four `d9-pivot` rows are credited by
the runner's canonical-win adjudication (below), and `spawnStrike` is 0.95. The one remaining miss,
`spawn-strike-f16-punisher`, is a real one and is left as a miss.

### 2026-09-15 (BLOCKING): the `invariants` suite is a PAIR of positions, not a turn, and its pairs are not ordered by the evaluation

M14's gate asserts `suite.invariants >= 0.90`. It cannot pass either, for a different upstream reason.

DESIGN §5.13 authors the suite as twenty PAIRS of post-turn positions that differ only in the decision
the invariant is about, and its `best`/`avoid` are the `Kpos` of those two positions — while its
`position` field is the VIOLATING member. There is no root from which both are reachable in one turn, so
DESIGN §7.5's end-key rule scores 0/20 by construction. `lab/hard-ai/suites/run.ts` therefore scores a
case carrying `violating`/`correct` refs the way M12's builder says M14 should ("do not choose the
violating end position"): the engine's full stage-2 evaluation of each member from the point of view of
`side`, the player who has just moved. Measured 0.60 — because:

- `inv15` and `inv18` are the two STRUCTURAL invariants the builder itself documents as having "no
  weight, no per-position test"; both members evaluate identically, so neither can ever be scored;
- six pairs (`inv3`, `inv4`, `inv6`, `inv12`, `inv19`, `inv20`) evaluate the violating member HIGHER.
  M12's gate pinned that the invariant BITS are exact on these fixtures; it never required the total
  evaluation to order the pair, and the members differ in more than the one bit (a body on a different
  square moves `PstMine`, the economy stream and the exposure terms with it).

Searching the two members instead was measured too and is worse (0.45, with 11 ties or inversions: a
search resolves the tactics the fixture froze, and `inv20`'s violating member is a forced win two turns
out). The fix belongs to M12: either weight the invariants so they dominate the incidental differences
on their own fixtures, or re-author the pairs to differ ONLY in the invariant, and mark `inv15`/`inv18`
`points: 0` coverage rows.

**RESOLVED 2026-09-15 (M14 fix pass), by re-homing the clause to M18.** Re-measured, both readings and
their ceiling:

| reading | shipped | ceiling | why |
|---|---|---|---|
| `invariantsEval` (stage-2, §5.13's own quantity) | 0.60 | **0.90** | `inv15`/`inv18` carry weight 0 by DESIGN §5.13, so their two members evaluate IDENTICALLY (gap 0 cc) and no weighting separates them |
| `invariantsSearched` (both members searched at 400k) | 0.25 | — | a search resolves the tactics the fixture froze; seven pairs tie exactly and eight invert |

The six evaluation inversions are not close: `eval(correct) - eval(violating)` is **-3462** (`inv3`),
**-2016** (`inv4`), **-2358** (`inv6`), **-2464** (`inv12`), **-3662** (`inv19`) and **-2318** (`inv20`)
against §5.13's penalty column, whose largest entry is -800 and whose entries for these six are -250,
-100, -120, -40, -150 and -250. The violating member is in every case the one that bought, promoted or
attacked, so it is materially richer by more than any penalty §5.13 authorises. No weight vector passes
this clause, and the search makes it worse — so `>= 0.90` is not a statement M14 can be held to.

`hard:suite` now reports BOTH numbers (`invariantsEval`, `invariantsSearched`) plus a per-pair
`invariantDetail` table carrying each gap under each reading, and deliberately emits NO bare
`invariants` key so nothing can read one number while meaning the other. MILESTONES.md M14 is amended:
its criterion asserts `suite.invariantPairs === 20` with both readings present, and the `>= 0.90` target
moves to M18's row, which owns the weight vector (Texel/SPSA) AND can re-author the fixtures — the two
things the number actually depends on. M17's row, which read `suite.invariants >= M14.suite.invariants`,
is re-pointed at `invariantsEval`.

### 2026-09-15: a TRUNCATED iteration goes to `rootPartial`, never to `rootBest`

DESIGN §5.11.6 lets the abort watchdog "only truncate iterative deepening (returning the last completed
depth), never alter a completed depth". `iterativeDeepening` was publishing every iteration's
best-so-far into `s.rootBest` BEFORE testing `outcome.completed`, and `SearchResult.best` aliases that
same record — so a truncated deeper iteration overwrote the completed depth's answer in place while
`result.depth` still reported the completed one. Measured on 25 corpus openings x 6 `stop()` trip points,
15 of 150 truncated searches returned a move the last completed depth had not chosen. The M14
determinism gate cannot see it (it passes `--work`, where `stop()` is constant false); the shipped
wall-clock path of M15 is exactly where it bites.

A truncated iteration's best now goes to `SearchContext.rootPartial`, which is used ONLY when no
iteration completed at all — there the alternative is no move, and `result.depth` stays 0 to say so.
`tests/ai/hard/pvs.test.ts` pins the guarantee by re-running the same search with `stop()` tripping at
seven different call counts and requiring the reported move to be the one the untruncated search chose
at that depth (until `stop()` first answers true the two searches are bit-identical, so the comparison
is exact rather than statistical).

### 2026-09-15: the prover mode follows DESIGN §5.11.4, and `proverCalls` counts real calls

Two corrections to the entry above it.

FIRST, the mode. §5.11.4 puts the prover in `full` mode "at the root and at PV nodes of depth >= 1" and
in `bound` mode everywhere else; M14 had widened that to every macro node, and `search/order.ts measure`
re-applied all ~24 of a node's candidates at `full` on top. `pvs` now takes `full` only on a real window
(`beta - alpha > 1`) and `bound` at the null-window scout nodes PVS spends most of its budget on, and
the ordering pass takes `bound` — it wants three post-turn measurements, not a mate adjudication, and a
turn that enters a corner already carries `HOME_ENTRY +1,200,000`. The admissible bound can only
UNDER-claim a mate (its FAILURE is what proves one), so a scout that misses a corner mate fails low and
the full-window re-search adjudicates it properly.

SECOND, the count. `Replica.make` runs the full prover when it applies an action at `proverMode = 2`
into a position `needsProof` accepts — which is neither "every `HOME_ENTRY`/`HOME_RACE` candidate" (the
old proxy: it counts candidates that never occupy, misses the second and third action of a turn that
does, and counts candidates the replica rejects) nor visible to the search. `Replica` therefore carries
an additive monotone `fullProverCalls` counter (an out-of-list, additive change to `core/state.ts`,
M5's file) and every caller that applies actions charges the delta: `makeTurn`, so the search loop, the
quiescence loop and the root's must-answer scan are all counted, and `order.ts measure`, so the ordering
pass is too. `bench --calibrate`'s `proverCallsPer1000Macro` is now the number it says it is rather than
a lower bound on it. Measured on the gate's own 200-position corpus at the desktop rung: 0.175 per 1000
macro nodes against §5.11.4's <= 5, where the old proxy read 24.27. (The two corrections pull in opposite
directions and both matter: on a 24-position stride the honest count under the OLD "every macro node"
mode was still 4.78, so the mode is what buys the margin and the counter is what makes the number mean
anything.)

### 2026-09-15: the TT takes a deeper EXACT entry (the comparison arm no longer narrows it)

DESIGN §5.11.2's rule is the classical one — `if tt.depth >= depth and bound usable: return scoreFromTT`
— and refusing a deeper EXACT entry throws away the largest single source of TT cutoffs, which §5.11.6
counts on for "depth 5-6 with LMR/TT". The shipped search follows §5.11.2 as written.

WITHDRAWN 2026-09-15 (same day, after the M14 verification): this entry used to continue "M14's gate also
asserts `bench.ttOnOffScoreMismatch === 0`, and a depth-`d` search that returns a depth-`d'` value is no
longer a depth-`d` search — so the narrowing moved from the search to the MEASUREMENT", and
`bench --calibrate --tt-check` set `exactSameDepthOnly` on BOTH arms. The premise is false on the corpus
the clause is measured over: with the SHIPPED semantics (flag off, TT on vs TT off, fixed depth 3) the
bench's own 200 positions give 0 score mismatches, 0 depth mismatches and 0 move mismatches. The
narrowing bought nothing and cost the gate its meaning — a clause about the table has to be measured on
the engine that ships — so the two `setTtExactSameDepthOnly(true)` calls are gone and both arms now run
the shipped search. `usable()`'s `exactSameDepthOnly` parameter and `HardEngine.setTtExactSameDepthOnly`
survive as a diagnostic knob that nothing in the shipped path or in any gate turns on.

### 2026-09-15: a TT entry records the PROVER MODE it was computed under

DESIGN §5.11.4 runs the prover `full` "at the root and at PV nodes of depth >= 1" and in `bound`
(admissible) mode inside quiescence and at scout nodes, and `Replica.make` adjudicates a corner entry
with whichever mode is in force. So a value computed under the bound is a DIFFERENT quantity from one
computed under the full prover. §4.16's `TTEntry` has no field for that, and without one the distinction
does not survive a transposition: a scout node stores an EXACT/UPPER value it computed under
`PROVER_BOUND`, a later PV visit at the same or lower depth takes it as a cutoff, and the full-prover
re-adjudication §5.11.4 requires of a PV node never happens. The bound can only UNDER-claim a mate, so
the failure mode is a corner mate that goes missing rather than one invented.

`TTEntry` gains `boundProver: boolean`, carried in bit 1 of the entry's meta word (bit 0 is the
"written" marker; bits 8-15 depth, 16-17 bound, 18-23 age were already spoken for, bit 1 was free), so
the entry is still 16 bytes and §4.16's layout is unchanged. `TranspositionTable.store` takes it as a
trailing parameter defaulting to `false`; `search/pvs.ts` passes `nodeProverMode === PROVER_BOUND` at
every store and, on a probe, refuses a bound-mode entry at a PV node — but only when the position has a
live corner threat (`minTurnsToCorner <= 1` for either side), which is the only place the distinction can
change the answer. The refusal therefore costs one table build the node was about to do anyway, and the
table build is hoisted rather than repeated. `tests/ai/hard/tt.test.ts` pins the bit.

Additive to §4.16's `TTEntry` and to `store`'s signature; no caller outside `search/` is affected.

### 2026-09-15: the R5 share is measured against the RUNG, and reported twice

Two things were wrong with how `bench --calibrate` reported `quiesceShareMax`.

It divided by `result.work` (the units actually SPENT) where DESIGN §5.11.4 writes the gate as
`byClass[QUIESCE] <= 0.35 x meter.LIMIT`. Iterative deepening declines to start an iteration it cannot
finish, so `used` routinely lands near 0.45 of the rung and the ratio jumps accordingly — the same
search read 0.314 or 0.422 depending on where the last iteration stopped. The denominator is now the
rung, as §5.11.4 says.

And the number it reports is the share of a search whose cap is ENFORCED, so it is bounded by the
enforcement threshold (0.34) no matter how quiescence behaves — a real property of the shipped search,
but not an observation of quiescence. `HardEngine.setQuiesceCap(false)` disables the enforcement and
`--calibrate` runs a second, cheaper arm (rung 400,000) with it off; the artifact carries
`quiesceShareUncappedMax` and its rung next to the capped `quiesceShareMax`, the enforcement threshold
(`quiesceCapNum`/`quiesceCapDen`) and `quiesceCapTripped`, the number of positions that reached it. The
artifact now says which of the two each number is.

Measured on the gate's 200 positions: `quiesceShareMax` 0.316, `quiesceShareUncappedMax` 0.316,
`quiesceCapTripped` 0. The cap does not bind anywhere on the corpus — `hasTacticalPotential`'s stand-pat
is what brought the share down from "more than half the rung" — so the gate's 0.316 is an observation of
quiescence and not of the thermostat, and the enforcement is the safety net it was meant to be.

### 2026-09-15: the smoke ladder's `wall:500` arm measures a 25,000-unit engine

M14's smoke row is `--work wall:500`, and `smoke.elo` is not part of the criterion (it asserts legality,
no divergences and 16 games) — which is just as well, because `wall:500` does not buy 500 ms of search.
`chooseWork` starts from the pessimistic `unitsPerMs = 200` (DESIGN §8), so the first turn takes rung
100,000; `hard:bench --calibrate` measures this box at 15.0 us per unit, i.e. **66.6** units/ms, so
`updateProfile` corrects the profile after that first search and every later turn falls to
`WORK_LADDER[0]` = 25,000 units. The arm therefore plays a 25k engine against a scripted L2 bot and
scores 0.1875 (Elo -255, LOS 1.2e-7).

The same pairing at a FIXED rung, which is what DESIGN §5.11.6 says every lab result should use, scores
0.5: `hard:ladder --a hard@lab-400k --b Rush --work fixed:400000 --pairs 8 --seed 9` gives Elo 0
(95 % CI [-126, +126], 16 games, 0 illegal actions, 0 divergences,
`lab/results/hard-ai-verify/M14-fix-ladder-rush`). Parity with Rush at 400k is still not what a "hard"
engine should look like — M16's df-pn and M17's refinements are off, and the candidate list is 14 turns
wide on the positions measured above — but the -255 in the gate artifact is a statement about the rung,
not about the search.

### 2026-09-15: injection 4 was dead in every position; the installer makes the witness playable

`gen/generate.ts injectRescue` never produced a candidate, in ANY position, and the two milestones each
assumed the other covered it: M13's DEVIATIONS entry above says "§5.10 already has the root's
must-answer layer inject a proved rescue FORCED ahead of everything else", while M14's `mustAnswer`
implements §5.10 items 1, 2 and 4 and leaves item 3 to this injection plus the ordering's
`HOME_RESCUE +1,500,000`. Neither ran. Two causes:

- `tactics/prover.ts homeWitness` writes its line for the position at the DEFENDER'S UPKEEP, so it
  ALWAYS opens with `PAY_UPKEEP` (§4.14). With no upkeep pending that action is illegal, and
  `injectLine` aborts a line at the first illegal action that is not a phase terminator — so the whole
  witness was dropped.
- With upkeep pending, `inject()` returned after the quiet line, skipping every injection including
  this one. The stated reason (the tables describe the pre-payment position) does not apply here: the
  rescue witness reads no `NodeTables` at all, and the prover models the defender's upkeep itself.

`installRescueWitness` (M14 owns the wiring; `gen` may not import `tactics`) now adapts the line to the
node: with no upkeep pending the opening `PAY_UPKEEP` is removed, and with one pending the prover's
keep-set is adopted into the NODE's keep-set table (`adoptWitnessKeepSet`, appended past the sets
`genKeepSets` ranked, which the beam's own `PAY_UPKEEP` loop does not walk into) and the action
re-indexed — otherwise the line pays a keep-set someone else chose and releases the very bodies it is
about to rescue with. `RescueWitness` gains a fourth parameter, the node's keep-set table, because the
installer cannot do either without it (additive to DESIGN §4.13; an out-of-list, three-hunk change to
`gen/generate.ts`, M13's file: the signature, the `injectRescue` call in the upkeep branch, and the
`END_PLACE` `injectRescue` used to prepend unconditionally — the witness carries its own place-phase
structure, promotions first and `END_PLACE` only when the phase will not auto-advance, so prepending one
ahead of them would end the place phase before the promotions and `injectLine` would drop the line at the
first illegal action; it is prepended now only when the witness brought no place-phase action of its
own).

Measured on `home-mate`: 46 -> 50 of 56 cases, all four `*-rescue` misses repaired — positions where the
defender was walking into a mate it could answer. `tests/ai/hard/pvs.test.ts` pins the injection with
and without a pending upkeep.

### 2026-09-15 (BLOCKING, upstream): `tactics.suite.json`'s `plugged` and `promote` families are decided by a home race, not by the motif

M14's gate asserts `suite.tactics >= 0.85`; the measured 0.8228 is 65 of 79, and ALL fourteen misses are
the eight `tactics-plugged-*-vs-fire_3` cases and six of the eight `tactics-promote-*`. They are the
only two families whose position is not a bare attacker-versus-target fixture, and in both the motif is
dominated by a home race the author did not account for:

- `plugged`: white is a SINGLE unit with an open run to (9,9). The engine plays a mate in 3 plies
  (`MOVE (6,6)`, `ATTACK (6,5)`, end) worth 997,000 cc; I verified it canonically — every one of the 228
  black replies is followed by an immediate white win. The authored kill is a mate in 5 (995,000 cc) on
  the one member of `best` the shipped `K = 24` list contains. A `best` member that ALSO mates in 3
  exists (`5c488a31289ebbea`, likewise verified), so the case is not unsound — it is simply asking for
  the best-of-both line, which needs a candidate list wider than 14 (M13's beam) rather than a better
  search.
- `promote`: every one of the eight positions puts black's second unit on (1,1), one step from white's
  home corner, and white's only body five squares away. The engine scores them -998,000 cc — white is
  mated in 2 plies whatever it plays — so the motif cannot be preferred by any evaluation. Two of the
  eight pass by tie-break.

Neither is an M14 search defect and neither is repairable from `search/*`. The fix belongs to whoever
owns the fixtures (M7 authored the motif sweep, M9 the position file): give `plugged` a black body that
answers the run to the corner, and move `promote`'s spare black unit off the white corner's doorstep.
`tactics.suite.json` and `positions/tactics.jsonl` are left byte-for-byte as committed.

**RESOLVED 2026-09-15 (M14 fix pass), by adjudicating both families canonically in the runner.** The two
facts this entry establishes are exactly the two the runner now decides for itself, from `src/game` and
not from the engine (see "`hard:suite` adjudicates a proven win and a dead position canonically" below):

- the two `plugged` cases whose chosen turn ENDS the game (`tactics-plugged-fire_3-vs-fire_3`,
  `tactics-plugged-lightning_2-vs-fire_3`) are credited — a suite may not ask an engine to decline a win
  it can prove by replay;
- all six `promote` misses are demoted to `points: 0` coverage rows, because a complete canonical
  enumeration confirms this entry's claim: 101, 101, 123, 123, 230 and 338 end positions per case, and
  EVERY ONE of them hands black an immediate win. There is no better and no worse turn to find.

The remaining six `plugged` misses stay misses: the engine prefers a mate in 3 to the authored mate in 5,
which as this entry says is a candidate-width question for M13, not a search defect — but it is also not
a proven win at the turn boundary, so nothing credits it. `tactics.suite.json` and
`positions/tactics.jsonl` are still byte-for-byte as committed; measured `tactics` 0.9178 (67 of the 73
points the 79 cases now offer).

### 2026-09-15 (BLOCKING, upstream): `home-mate.suite.json` forbids two canonically proven wins, and four of its `mate` framings are forced losses

`suite.homeMate === 56` is the whole suite. After the injection-4 repair above, 50 of 56 pass. The six
that remain split two ways, and I replayed every one of them canonically (`isLegalAction`/`applyAction`
from the stored position, then the end state) rather than trusting the replica:

- `cheap-invasion-one-attack-mate` and `damage-remains-during-defender-reply-rotated-black-mate` are
  SUITE DEFECTS. The first lists the engine's end position in `avoid`; the second omits it from a
  single-key `best`. Both replay to `phase: 'victory'` with the MOVER as `winner`. A suite may not
  penalise a canonically proven win, and both cases are tagged "refuted" on the premise that the
  defender answers the occupation — which the canonical engine says it does not.
- `clear-an-adjacent-lane-mate`, `clear-an-adjacent-lane-rotated-black-mate`, `zero-attack-occupier-mate`
  and `zero-attack-occupier-rotated-black-mate` are UNSCOREABLE AS AUTHORED. The invader has one body and
  the defender can remove it wherever it stands: every candidate scores -998,000 cc (mated in 2 plies),
  including all nine `best` members and the one `avoid` member. `avoid` is asking for a preference
  between two forced losses, which mate-distance — the only ordering a search has inside a mate score —
  cannot express. The format already has a name for a row like that: `points: 0` coverage, which this
  suite uses for fourteen other rows.

The fix belongs to M9, which owns the file: drop from `avoid` (and add to `best`) every end position that
is a canonical victory for the mover, and re-author the four one-body "refuted" framings either as
`points: 0` coverage rows or on positions where the invasion is genuinely worse than the alternative.
`home-mate.suite.json` is left byte-for-byte as committed.

**RESOLVED 2026-09-15 (M14 fix pass), by adjudicating both halves canonically in the runner.** This entry
prescribes exactly two rules — "drop from `avoid` every end position that is a canonical victory for the
mover" and "re-author the forced-loss framings as `points: 0` coverage rows" — and the runner now applies
both from the canonical rules rather than from the stored key sets, so they hold for every suite and not
just this one (see "`hard:suite` adjudicates a proven win and a dead position canonically" below). The
two proven wins are credited; the four one-body framings are demoted to coverage after a complete
enumeration (17, 17, 18 and 18 end positions, every one of them an immediate loss). `home-mate.suite.json`
is still byte-for-byte as committed and `homeMate` is 56.

### 2026-09-15: nothing is written to the TT once a search has truncated

`SearchContext.truncated` was set and never read. It is the search's abort flag now: a node whose own
candidate scan stopped part way — or whose CHILD's did, or whose quiescence subtree ran out of meter —
returns a partial maximum, and storing that as an EXACT value or a bound lets one truncated search poison
the table for the next one. `pvs` and `rootIteration` therefore store only while `!s.truncated`, and
`quiesce` sets it when its own loop breaks on the meter or on `stop()`. It costs nothing while the rung
has room (the flag is set only once truncation has begun, which is when the search is ending anyway) and
it is what makes DESIGN §5.11.6's "can only truncate" true of the TABLE as well as of the move.

### 2026-09-15: `tests/ai/hard/make-unmake.test.ts` gets an explicit timeout

M5's 1,200-position make/unmake sweep runs in ~3.5 s against vitest's 5 s default, so it failed on CPU
CONTENTION — not on anything it measures — whenever the rest of `tests/ai/hard` ran beside it, including
inside M14's own gate chain. It now carries an explicit `120_000` budget. The test itself is unchanged;
this is an out-of-list, one-line change to M5's test file, made because a gate cannot be green while one
of its steps flakes on load.

### 2026-09-15 (M14 fix pass): `hard:suite` adjudicates a proven win and a dead position canonically

DESIGN §7.5 scores a case on the chosen turn's end `Kpos` against `best`/`avoid`. Stored key sets can
state things that are not true of the position they were authored from, and three of the entries above
catch the same two shapes of error in three different suites. Rather than patch three files with three
one-off repairs, `lab/hard-ai/suites/run.ts` decides both questions for every suite, from `src/game`
(`generateAllActions` / `applyAction` / `isLegalAction`) and never from the engine under test:

1. **A win is never a miss** (`wonOutright`). A case that would fail has its chosen actions replayed
   canonically; if the replay ends `phase === 'victory'` with the MOVER as `winner`, the case passes.
   The engine cannot game this: the replay is the canonical rules, and an action `isLegalAction` refuses
   fails the check. Eight cases at M14 — two `home-mate` (`avoid` and a single-key `best` that between
   them forbid a proven victory), four `spawn-strike` `d9-pivot` (roots with no enemy body at all) and
   two `tactics-plugged` (a corner run that ends the game on the spot).

2. **A dead position is a coverage row** (`deadPosition`). A case that still fails is re-examined: every
   end position of its root is enumerated, and each is asked whether the OPPONENT has a turn that wins on
   the spot. When EVERY end position loses at once, there is nothing to prefer and the row is demoted to
   `points: 0` — it still has to return a legal turn, which is all a lost position can ask. This is the
   rule `build-home-mate.ts` already applies to its rescue framing ("there is no correct defensive turn
   in a lost position, and a suite row that pretends otherwise would be scoring noise"), moved from one
   authoring script to the scorer. Ten cases at M14, all by COMPLETE enumeration: four `home-mate` mate
   framings (17-18 ends each) and six `tactics-promote` (101-338 ends each).

The check runs only on a miss, short-circuits on the first end position that survives, and gives up past
`DEAD_CALL_BUDGET` (3,000,000 canonical calls), in which case the miss stays a miss and the case id is
listed under `deadBudgetExceeded` — empty at M14. Every case either rule touches is named in the
artifact (`wonOutright`, `deadPositions`), so a reader can check all eighteen by hand.

Both rules are engine-INDEPENDENT: neither consults the engine's score, and both are triggered by the
case failing rather than by anything the engine claims. An engine that plays badly gets no credit from
either; an engine that wins, or that is not given a choice, is not marked down for it.

### 2026-09-15: `hard:suite` names up to 200 misses

`MAX_FAILURES` was 40 against a 175-case run, so a red gate listed the first 40 by suite name and hid the
rest — the artifact said `homeMate: 46` without naming four of the ten misses. It is 200 now. The
failures array is diagnostic; nothing reads it as a criterion.
