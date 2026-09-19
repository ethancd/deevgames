> **Current Phasing corpus:** [ALLOCATION-P1.md](ALLOCATION-P1.md) freezes P1.
> The E0/E1/E2/E4 text and files below are historical Standard evidence.
> Their original generator/tests are reproducible at `standard-final`.
> Current `generate.ts` and `split.ts` generate Phasing only; do not rerun the
> historical commands against this checkout. Archive hash/legality tests remain.

# E0 opening set

`e0-openings.jsonl` is the frozen opening set for the E0 ladder (EPIC-PLAN
E0.4). E0-PILOT-REPORT §7 P1: without `--openings` two pairs with different
seeds replay the same game.

## How it was generated

```
node --import tsx lab/hard-ai/ladder/openings/generate.ts \
  --count 16 --seed 2026 --out lab/hard-ai/ladder/openings/e0-openings.jsonl
```

Or `npm run hard:openings`.

- git rev: `1e0466de8bded8ede233b73ac1edce4edf5a293b` (`claude/hard-ai-e0`).
- seed 2026; every draw descends from it through `mulberry32`/`deriveSeed`.
- sha256: `ea37cb3a1d9f1a05e6ee43d6aebe8dc18a59fba716c061945e4a543b862e0f44`.
- 3494 bytes, 16 lines, one opening per line, no comments.
- `tests/lab/openings-set.test.ts` regenerates the set in-process at the same seed and asserts bytes and sha256.

Candidates are played from the canonical initial state by seeded scripted bots
(`Random`, `Rush`, `Greedy`, `Expand`, `Balanced`), driven as
`harness/runner.ts` drives them. One is refused unless it replays through
`applyOpening` at handicap 0 and 3, its handicap-0 `gameplayDigest` is new, and
no prefix relation ties it to an accepted opening.

## Sizes

- 16 openings, 16 distinct handicap-0 gameplay digests.
- Ply counts: 2 plies x4, 3 plies x3, 4 plies x5, 5 plies x4.
- Ids: `g<plies>-s<attempt>`; gaps are refused candidates.

## Why every opening stops inside White's first turn

h0 and h3 differ in the shape of Black's first turn, not only in Black's bank.
At h0 Black has no crystals, nothing is placeable, and the turn opens in the
action phase; at h3 Black affords a tier-1 unit and the turn opens in the place
phase. Black's first ply is a `MOVE` under one handicap and a `BUY_UNIT` or
`END_PLACE_PHASE` under the other, so no one action list is legal under both,
and every candidate reaching Black's turn was refused at h3. White's turn does
not depend on Black's bank, so a candidate is cut at the handover: five plies
at most. Deeper openings need one set per handicap, a measurement decision, not
the generator's.

## E1 must freeze the allocation before the full sample

EPIC-PLAN's baseline campaign reports canonical initial games and this set as
separate strata, freezes their allocation before the full sample, and excludes
the pilot pairs. E1.2 splits games and opening families into development,
validation and sealed acceptance sets.

A split of 8 development / 4 validation / 4 sealed acceptance was PROPOSED
here. It is SUPERSEDED: `AMENDMENTS-DECIDED.md` ("Two E1 decisions taken with
these") makes all 16 of these openings DEVELOPMENT and puts validation and
sealed acceptance in a second, larger pool. See "E1 pool and strata" below. No
opening in this file carries a stratum label; the assignment lives in
`ALLOCATION.md`.

## What this set is not

An opening set is a diagnostic source of variety: it varies the position the
engines start from, the only variance a deterministic engine responds to. It is
not proof that two engines decide independently. Engines sharing an evaluation
or a bug still agree from 16 positions, and games that start differently can
converge. Pair independence is measured on the resulting games, not conferred
by this file.

## E1 pool and strata

A second pool of 112 openings was generated at seed 2027 with `--id-prefix e1-`
and `--exclude e0-openings.jsonl`, shuffled with `mulberry32(2027)` and cut
3 : 2 : 2 into `e1-dev.jsonl` (48), `e1-val.jsonl` (32) and `e1-sealed.jsonl`
(32). `e1-baseline.jsonl` (50) is the preregistered baseline list: the six E0
openings the pilot and E1.1 do not claim, then the first 44 development rows,
in the order `pairing.ts#buildPairs` consumes them.

`ALLOCATION.md` in this directory is the freeze: per-file row counts, sha256
and byte sizes, the commands and git rev that produced them, the split rule,
the E0 ledger of which id is pilot / E1.1-reserved / baseline, the rule that
validation is never tuned against and sealed is run only by E6.2, and the
cross-file digest uniqueness the tests assert. Read it before running any E1
row; do not infer an allocation from filenames.

Two generator flags exist for that pool and default to off, so the E0 file
above is still reproducible byte for byte from `--seed 2026` alone:

- `--id-prefix <str>` — prepended to every emitted id. Ids are
  `g<plies>-s<attempt>` and the attempt counter restarts at every generation,
  so without a prefix a second pool re-mints ids this file already uses, and an
  opening id is the first field of every `pairId`.
- `--exclude <file.jsonl>` (repeatable) — loads another opening file and
  refuses any candidate whose handicap-0 `gameplayDigest` matches one of its
  rows, or whose action list stands in a prefix relation with one. These are
  the same two rules the generator applies within a file, extended across
  files.

Neither writes anything into the JSONL: the format takes no comments, so which
files were excluded from which pool is recorded in `ALLOCATION.md`.
