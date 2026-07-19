# @deev/content

Schema-first content pipeline: zod schemas + canonical fixtures with
cross-fixture "seam" checks, a JSON registry loader that turns data problems
into warnings instead of crashes, a self-describing CSV loader generalized
from a real production content pipeline, and a machine-verification harness
for puzzle/level content.

## Provenance (honest, per-module)

| Module | Source | Notes |
|---|---|---|
| `schema.ts` | `might-and-magic-spire/packages/schema` — the fixtures + `fixtures.test.ts` drift-test pattern (including its `describe('the Source → Card seam is wired correctly', ...)` cross-fixture assertions) | Factored into a reusable `defineContent`/`fixtureDriftTest` pair instead of one bespoke describe block per package. |
| `csv.ts` | `mythgarden/mythgarden/management/commands/seed_database.py` (the `Command.handle` CSV reader + `parse_fk_cell`/`parse_m2m_cell`/`parse_goc_m2m_cell`) | Same column-kind vocabulary and blank-row/header/data state machine; **one deliberate format deviation** — see below. |
| `registry.ts` | New — no single reference source; a plain "load array of JSON-shaped content, never throw on bad data" loader in the spirit of the CSV loader's warning-collecting philosophy. | |
| `verify.ts` | **RECONSTRUCTED from the dossier's description of LUMENGRID.** The original artifact is not in this repo — there is no source file to read or copy from. The `solvable`/`notPreSolved`/`survivable` combinator shapes and the "checks must be given explicit seeds or refuse to run" rule are this package's own design, built to match the dossier's description as closely as a description (not code) permits. | Flagged here so nobody mistakes this for a port. |

## `schema.ts` — `defineContent` / `fixtureDriftTest`

```ts
const content = defineContent({
  name: 'creature',
  schema: Creature,       // a zod schema
  fixtures: [fixtureCreature],
  seams: [
    {
      name: 'card.sourceId -> creature.id',
      check(fixtures) { /* throw if wiring is broken */ },
    },
  ],
});

content.parse(raw);          // zod .parse with a contextual error message
content.fixtureIssues();     // string[] — empty means healthy; never throws
fixtureDriftTest(content);   // same as fixtureIssues(); call it from your own describe()/it()
```

`fixtureIssues()` collects *both* per-fixture schema failures and seam-check
throws into one flat string array. It never throws itself — that's what
makes it usable directly in a test assertion (`expect(fixtureIssues()).toEqual([])`)
without a surrounding try/catch, and usable in any test runner since
`fixtureDriftTest` has no vitest import.

## `registry.ts` — `loadRegistry`

Loads an array of `unknown` items against a schema. Every *data* problem
becomes a warning, never a thrown error and never a silently-dropped item
with no trace:

- a schema-validation failure on an item → warning, item excluded
- a duplicate id (per `idOf`) → warning, first occurrence wins, the rest excluded
- a dangling reference (per a `refs` entry) → warning, item still included
  (a dangling ref is a data-quality problem, not disqualifying)

Only a malformed **shape** — `items` not actually being an array — throws,
since that's an integration bug, not bad content.

```ts
loadRegistry({
  items: rawArray,
  schema: CardDef,
  idOf: (card) => card.id,
  refs: [
    { name: 'card.sourceId -> creature', from: (c) => [c.sourceId], toIds: (allIds) => allIds },
  ],
});
// => { items: CardDef[], warnings: string[] }
```

`toIds` can be a fixed `Set<string>` (referencing a separate content set) or
a function of "all successfully-loaded ids from this same load" (self-referential
refs within one registry).

## `csv.ts` — `parseContentCsv`

The Mythgarden self-describing format:

```
Model_A, field_1, field_2, field_3
Model_A, value,   value,   value
Model_A, value,   value,   value
[blank row]
Model_B, field_1, field_2
...
```

Column-kind conventions, read off the header cell name (verbatim from
`seed_database.py`'s regexes/prefixes):

| Prefix | Example | Behavior |
|---|---|---|
| *(none)* | `name` | value goes straight into that field |
| `fk__<type>__<field>` | `fk__creature__sourceId` | cell is a natural key; resolved via `resolveFk(type, cell)` into `field` |
| `m2m__<type>__<field>` | `m2m__tag__tags` | cell is a list; each item resolved via `resolveFk(type, item)` into an array assigned to `field` |
| `goc_m2m__<type>__<field>` | `goc_m2m__ability__abilities` | **identical loader-side handling to `m2m__`.** The only difference is semantic and lives entirely in the resolver you pass — Mythgarden's `goc_m2m` resolver calls a model's `get_or_create_from_string` instead of a strict natural-key lookup. This loader doesn't know or care which kind of lookup `resolveFk` does; document your own resolver's behavior per type at the call site. |

**Mythgarden's `SKIP_VALUES` sentinel**, read directly off `seed_database.py`
(`Command.SKIP_VALUES`): `['default', 'none', 'null', 'skip']`. This is the
default `skipValues` here too. A cell whose raw string equals one of these
omits that field from the record entirely (the key is absent, not set to
`null`/`undefined`) — mirroring Mythgarden's kwargs filter. For `m2m__`/`goc_m2m__`
list cells, an individual **list item** equal to a skip value is dropped from
the list; the *whole cell* being a skip value (e.g. `none`) omits the field
entirely, same as a plain/fk field.

**Deliberate deviation from Mythgarden — list separator.** Mythgarden splits
`m2m`/`goc_m2m` cells on `", "` (comma-space), because its cells never
contain commas. Since this loader's cells can be quoted CSV cells containing
commas (and a natural key might too), list items here are `|`-separated
instead — keeping "split this cell into a list" orthogonal to "split this
row into cells." Called out explicitly, not silently changed.

**Blank-cell alignment quirk kept intentionally**, also straight from
Mythgarden: header and data rows both have **every** blank cell stripped
(not just trailing ones) before header names are zipped against row values —
`[v for v in row[1:] if v != '']` in the original. This supports
variable-width rows (later records in the same model omitting trailing
optional columns) but means a blank cell is only safe at a position where
the header cell is never itself blank. Use a skip-sentinel string
(`"none"`/`"skip"`/etc.), not an empty cell, for "no value here" in a
non-trailing column.

**Unknown column kinds**: a header cell that splits into exactly 3
`__`-joined parts with an unrecognized first part (anything other than
`fk`, `m2m`, `goc_m2m`), or that has some *other* number of `__`-joined parts
(2, 4, ...), is treated as an unknown column kind: a warning is emitted once
at header-parse time and that column's values are ignored for every
subsequent data row. (Corollary: a genuinely plain field name that happens
to contain a double underscore, e.g. `created__at`, will misclassify as
"unknown" — avoid double underscores in plain field names.)

Returns:

```ts
{
  records: Array<{ type: string; fields: Record<string, unknown> }>,
  counts: Record<string, number>,   // per-type record counts, ragged/dropped rows excluded
  warnings: string[],               // unknown column kinds, resolver failures, ragged rows
}
```

No CSV parsing library is used — `parseCsvRows` is a small hand-rolled
tokenizer supporting quoted cells (commas and newlines inside quotes) and
escaped quotes (`""` → `"`), per the no-new-dependency constraint.

## `verify.ts` — `defineVerifier` / `runVerifier`

```ts
const verifier = defineVerifier({
  name: 'level-pack-verifier',
  checks: [
    notPreSolved({ isSolved: (level) => level.startsSolved }),
    solvable({ solver: (level, seed) => solve(level, seed), seeds: [1, 2, 3] }),
  ],
});

const result = runVerifier(verifier, levels, { itemName: (l) => l.id });
// => { pass: boolean, failures: Array<{ item, check, detail }> }

formatVerifierReport(result); // plain text, for CLI use
verifierIssues(verifier, levels, { itemName: (l) => l.id }); // string[] sugar for tests
```

**The house rule, non-negotiable: every stochastic check requires explicit
seeds in its own config.** There is no `Math.random` anywhere in this module.
`solvable` and `survivable` both validate their `seeds` array is non-empty
**at the moment you call the combinator** (i.e. at content-verifier
*definition* time), not when the check later runs — an unseeded stochastic
check is a configuration error loud enough to fail your test suite, never a
silent pass because it had nothing to iterate over. `notPreSolved` takes no
seeds because it's deterministic (`isSolved` is a pure predicate).

A tiny local `mulberry32` Rng is included so this package doesn't need a
dependency on `@deev/core` (its only declared dependency is `zod`); pass your
own `rngFactory` to `runVerifier` if you want a richer Rng.

Every failure's `detail` string names the failing seed (for `solvable`/`survivable`)
or the reason (for `notPreSolved`), and `formatVerifierReport` renders one
line per failure keyed by item name and check name.
