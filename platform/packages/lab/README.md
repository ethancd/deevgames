# @deev/lab

Headless balance lab over any `@deev/core` `GameDef`: bots, a seeded series
runner, Wilson confidence intervals, markdown reports, and config-sweep
experiments.

**Provenance:** generalized from `muju/lab/harness` (`types.ts`, `runner.ts`,
`stats.ts`, `invariants.ts`, and the `EngineBot` half of the bot roster).
`muju/` was read-only reference and is untouched. Where this package's
behavior is a judgment call rather than a direct port, it's noted below and
in `judgment-log.md`.

## Bots (`src/bots.ts`)

Two policy shapes, matching muju's `ScriptedBot` / `EngineBot` split:

- **`ScriptedBot<O, A>`** — `choose({ view, seat, legal, rng }): A`. Sees only
  its `observe()`-masked view and the pre-filtered legal set. There is no
  null-pass anywhere on the platform: `legal` is never empty for an acting
  seat (games reify pass/end-turn as an action), so a `ScriptedBot` always
  returns one of `legal`. The runner throws if it doesn't.
- **`RawBot<S, A>`** — `nextAction(state, seat): Promise<A | null>`. Sees the
  full engine state (muju's `EngineBot`, generalized: a real AI engine does
  its own internal masking). `null` means "the engine emitted nothing this
  ply" and is never treated as a pass — see Legality below.

Built-ins:

- `randomBot(name?)` — uniform over whatever legal set it's handed.
- `greedyBot(def, scoreFn?, name?)` — one-ply lookahead: applies every legal
  action and scores the successor with `scoreFn ?? def.score`, picking the
  argmax. Perfect-info only (throws at construction if `def.observe` is
  defined) and requires an eval function (throws at construction if neither
  `scoreFn` nor `def.score` exists). Each candidate's preview `apply` runs
  against a scratch rng forked off the bot's own stream
  (`rng.fork('greedy-preview:<i>')`) — forking is an observation, not a draw,
  so previewing N candidate moves can never perturb the bot's real stream or
  the engine's, and giving every candidate its own fork means preview order
  can't affect which preview "used up" randomness.

## Legality modes (`src/runner.ts`)

`runSeries({ ..., legality })` governs what happens when a `RawBot` emits an
action outside `legal()` (checked by deep equality on `stableStringify`).
This mirrors the *spirit* of muju runner.ts's D1/D2 handling, adapted to a
generic engine that (unlike muju's) has no "end phase" fallback to reach for:

- **`'as-shipped'`** (default): the illegal action is applied anyway —
  "measure the engine as it ships." Counted in `illegalActions`, never
  silently substituted.
- **`'strict'`**: the bot is re-asked once for the same seat/state. If the
  retry is also illegal (or null), the game ends immediately with
  `{ winner: null, reason: 'illegal-action' }`. **This package's specific
  choice** (not fully specified by the plan): every illegal emission observed
  — the first attempt *and* a still-illegal retry — increments
  `illegalActions`, so the counter reflects total illegal emissions, not
  distinct incidents. If a future consumer wants "incidents" instead of
  "emissions," that's a one-line change in `runner.ts`'s strict branch.

A `RawBot` returning `null` is **never** a pass, in either mode: it's counted
alongside `illegalActions` and the game ends immediately with
`{ winner: null, reason: 'engine-emitted-nothing' }`.

`ScriptedBot`s aren't subject to any of this — the type/runtime contract
guarantees they only ever return a legal action, so there's nothing to
measure.

## Invariants

`invariants?: Array<(state: S) => void>` — each function throws on violation.
A throw **aborts only that one game**: the record gets
`{ winner: null, reason: 'invariant-violation' }`, the series-level
`invariantViolations` counter increments, and the series continues with the
next game. There is no continue-past-violation-within-a-game option — that
matches muju's actual behavior (an invariant violation means the state may be
corrupted, so nothing after it in that game is trustworthy). Invariant-
violation games are excluded from `byBot` win/loss/draw tallying (same as
muju's `summarize()` excluding `winType === 'invariant-violation'`), since
they didn't produce a real contest outcome.

## Seat rotation

Rotation happens **at the series level only**: game `i`'s seat assignment is
`bots[(seatIndex + i) % bots.length]` (when `seatRotation` is true, the
default). Per-ply turn order always comes from `def.toAct(state)` — the
runner never reorders whose turn it is within a game. `bots.length` must
equal `def.seats(config).length`; a length-1 roster is simply what a
single-seat (solo) game looks like — "sweep mode" isn't a separate code path,
it falls out of there being one seat.

## Reports (`src/report.ts`)

- `matchupReport(series)` — win/loss/draw + 95% Wilson CI per bot, plus
  `engineHash`, `configHash`, `seedStart`, and the illegal/invariant counters.
  Intended for 2-seat runs but doesn't hard-reject other seat counts.
- `sweepReport(series)` — for single-bot (solo) runs: success rate defined as
  `winner === that seat`, reported with a Wilson CI, **and**, whenever the
  game reports `result.scores`, a mean score plus the raw per-game
  distribution. Throws if handed a series with more than one bot.

**No timestamps, no durations, no wall-clock anything** appears in report
output — both functions are pure over their `SeriesResult` input, which is
what makes "run the same series twice, get byte-identical markdown" possible.
Ordering is always deterministic (bot names sorted alphabetically; records in
`gameIndex` order).

## Experiments (`src/experiments.ts`)

`runExperiment({ name, game, variants: [{ label, config }], gamesPerVariant,
bots, seedStart, ... })` runs one `runSeries` per variant, in the order
given, and returns `{ name, variants: [{ label, series }] }` in that same
order — labels are never re-sorted.

## Judgment log

`judgment-log.md` is a template (columns: Options / Ruling / Rationale /
Blast radius / Reversal cost, mirroring `muju/JUDGMENT_LOG.md`) for recording
autonomous rulings made during a specific game's balance-lab work. This
package's own judgment calls (the legality-mode semantics above) are
documented inline in this README instead, since they're framework decisions
rather than a particular game's balance rulings.

## Tests

`tests/fixtures/nim.ts` is a standalone 3-heap take-1..3 Nim clone (Grundy
mod-4 rule) written for this package's own tests. It is **not** imported from
`examples/pebble-duel` — that example depends on `@deev/lab`, so importing it
back here would create a workspace cycle.

Notable tests:

- `tests/sensitivity.test.ts` — the sensitivity gate: `perfectBot` vs
  `randomBot` over 200 pinned-seed games, asserting the Wilson CI lower bound
  for `perfectBot`'s win rate is `> 0.5`; plus `greedyBot`'s construction
  guards and a short pinned-seed series showing it beats `randomBot` (on Nim,
  a one-ply-exact evaluator *is* perfect play, so this also is a real
  sensitivity check, not just a smoke test).
- `tests/runner.test.ts` — series determinism (two same-seedStart runs deep-
  equal), invariant-violation abort/continue semantics, `RawBot` illegal- and
  null-emission handling in both legality modes, and single-bot sweep mode.
- `tests/report.test.ts` — exact markdown snapshots for both report modes.
- `tests/experiments.test.ts` — two-variant experiment, results keyed and
  ordered by label.
