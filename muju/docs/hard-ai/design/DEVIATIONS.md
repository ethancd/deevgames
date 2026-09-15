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
