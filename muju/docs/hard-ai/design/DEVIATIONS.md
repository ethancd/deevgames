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
