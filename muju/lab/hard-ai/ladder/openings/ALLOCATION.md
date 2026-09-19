# E1 opening allocation (frozen)

Authority: `docs/hard-ai/e0/AMENDMENTS-DECIDED.md`, entry A15 and the section
"Two E1 decisions taken with these". EPIC-PLAN E1.2 and E1's "Baseline campaign
after the pilot" require the allocation to be frozen BEFORE the first
preregistered pair runs. This file is that freeze. Nothing here may be changed
by a later slice without re-opening the amendment entry; a changed file is a
different file and every row measured under the old one is superseded.

## Files

| File | Rows | Bytes | sha256 |
| --- | --- | --- | --- |
| `e0-openings.jsonl` | 16 | 3494 | `ea37cb3a1d9f1a05e6ee43d6aebe8dc18a59fba716c061945e4a543b862e0f44` |
| `e1-dev.jsonl` | 48 | 11192 | `bba8ea56b1bc2e0d5cdb58f6527e8bdec4382ef6a42906ba0674578ed02d5b55` |
| `e1-val.jsonl` | 32 | 6901 | `593714bc98cf1f4ee9ae913f828cca003f23a2ba587cec9eee15d2febc62f1cc` |
| `e1-sealed.jsonl` | 32 | 6876 | `cb51599af4b2d67425285f408f300738279eb20ed22f6f6c352edc941ff0b92d` |
| `e1-baseline.jsonl` | 50 | 11680 | `96f2944a18d3c3c487d4d97e73d9a57cd8f3be547276fc93c4adb3a3945e139f` |
| `e1-val2.jsonl` | 32 | 7747 | `fe3b9c98ad216773fc1766ef618f8aed7efa2e990f04ea409b6ed9bce49d2007` |

- `e1-baseline.jsonl` holds no opening of its own: every row is a copy of an
  `e0-openings.jsonl` or `e1-dev.jsonl` row, byte for byte, in run order.
- The JSONL format takes no comments (`openings.ts#parseOpenings`), so no
  provenance is written into the opening files. This file is the provenance.

## Commands that produced them

All four E1 files come from one command, run from `muju/`:

```
node --import tsx lab/hard-ai/ladder/openings/split.ts \
  --out-dir lab/hard-ai/ladder/openings
```

- git rev: `765d5c3f410192e0c5a8883404c6ec77d1370c68` (`claude/hard-ai-e1-lane3`).
- `split.ts` regenerates the pool in-process rather than reading a committed
  pool file, so there is no intermediate artifact to trust. The equivalent
  standalone pool command is:

```
node --import tsx lab/hard-ai/ladder/openings/generate.ts \
  --count 112 --seed 2027 --id-prefix e1- --max-attempts 20000 \
  --exclude lab/hard-ai/ladder/openings/e0-openings.jsonl \
  --out lab/hard-ai/ladder/openings/e1-pool.jsonl
```

- Pool: 112 openings accepted out of 1,056 candidates tried.
- Rejections: 451 shorter than 2 plies, 242 a prefix of an excluded opening,
  198 the h0 digest of an excluded opening, 36 a prefix of an accepted
  opening, 17 a duplicate h0 digest. No acceptance rule was relaxed to reach
  112; the generator did not saturate at the 20,000-attempt budget.
- `--id-prefix e1-` exists because ids are `g<plies>-s<attempt>` and the
  attempt counter restarts at every generation: without it the second pool
  would re-mint ids `e0-openings.jsonl` already uses, and an opening id is the
  first field of every `pairId` and a path segment of every replay filename.
- `--exclude e0-openings.jsonl` holds all 16 E0 rows against every candidate
  under the two rules the generator already applies within a file: the
  handicap-0 `gameplayDigest` must be new, and the action list may not stand in
  a prefix relation with an existing one.

## Split rule

- The pool is emitted in attempt order, which correlates ply length and driver
  bot with position (`PLY_TARGETS` and `DRIVER_BOTS` cycle over the attempt
  index). It is therefore shuffled first, with `mulberry32(2027)` — the harness
  RNG, `lab/harness/rng.ts` — under a descending Fisher-Yates.
- The shuffled pool is cut 3 : 2 : 2 into development, validation and sealed.
  Validation and sealed are floored; any remainder goes to development. At 112
  the cut is exact: 48 / 32 / 32.
- Cut points are `dev = pool[0..47]`, `val = pool[48..79]`, `sealed = pool[80..111]`.
- Ply distribution after the split — dev: 6x2, 11x3, 16x4, 15x5; val: 5x2,
  12x3, 11x4, 4x5; sealed: 8x2, 10x3, 5x4, 9x5.

## Stratum rules

- **Development** — `e0-openings.jsonl` (all 16) and `e1-dev.jsonl` (48). May
  be inspected, debugged against and tuned against.
- **Validation** — `e1-val.jsonl` (32). Drives champion/challenger equal-time
  contests in E2-E4. Never tuned against: no weight, flag or config may be
  chosen by looking at a validation result, and no validation opening may be
  inspected while iterating.
- **Sealed acceptance** — `e1-sealed.jsonl` (32). Run only by E6.2. Any earlier
  run against this file voids it as acceptance evidence and forces a new sealed
  pool.

## E0 ledger

Every row of `e0-openings.jsonl` in file order, with what claims it. A15
excludes the pilot's pairs from the preregistered sample; E1.1's eight
diagnostic pairs are reserved ahead of the baseline so the baseline and the
diagnostic set never share an opening.

| # | Id | Plies | Status |
| --- | --- | --- | --- |
| 0 | `g2-s0` | 2 | pilot |
| 1 | `g3-s1` | 3 | pilot |
| 2 | `g4-s2` | 4 | E1.1-reserved |
| 3 | `g2-s5` | 2 | E1.1-reserved |
| 4 | `g4-s6` | 4 | E1.1-reserved |
| 5 | `g5-s7` | 5 | E1.1-reserved |
| 6 | `g4-s10` | 4 | E1.1-reserved |
| 7 | `g5-s11` | 5 | E1.1-reserved |
| 8 | `g5-s15` | 5 | E1.1-reserved |
| 9 | `g2-s20` | 2 | E1.1-reserved |
| 10 | `g3-s25` | 3 | baseline |
| 11 | `g4-s30` | 4 | baseline |
| 12 | `g5-s31` | 5 | baseline |
| 13 | `g2-s40` | 2 | baseline |
| 14 | `g4-s42` | 4 | baseline |
| 15 | `g3-s45` | 3 | baseline |

- The pilot rows are `g2-s0` and `g3-s1`, pair ids `g2-s0:0:0`, `g3-s1:0:1`,
  `g2-s0:3:0`, `g3-s1:3:1` (`docs/hard-ai/e0/E0-PILOT-REPORT.md` §"Pilot 2").
- E1.1 runs eight diagnostic pairs and takes rows 2..9 with
  `--openings-skip 2` on `e0-openings.jsonl`.

## Preregistered baseline set

`e1-baseline.jsonl` is the opening list for the E1 baseline campaign:
50 pairs per handicap, `hard@desktop` vs `aiv2-hard`, `--work wall:3000`,
handicaps 0 and 3, `--shards 2`, `--legality strict`, no SPRT.

- Composition, in this exact order: `e0-openings.jsonl` rows 10..15 (6
  openings), then `e1-dev.jsonl` rows 0..43 (44 openings). Total 50.
- The order matters. `pairing.ts#buildPairs` cycles handicaps fastest and
  advances the opening list once per full handicap sweep, so
  `--handicaps 0,3 --pairs 100` consumes opening rows 0..49, each at h0 and at
  h3. A15's capacity guard is satisfied exactly: 100 pairs, 50 openings x 2
  handicaps, no reuse and no `--allow-opening-reuse`.
- No baseline row is a pilot or E1.1-reserved id. Asserted in
  `tests/lab/openings-allocation.test.ts`.
- All 50 baseline positions are distinct at handicap 0. Asserted in the same
  test.
- No shortfall: the pool yielded the full 44 development rows. Validation and
  sealed were not drawn from and must not be.

## What is tested

`tests/lab/openings-allocation.test.ts` asserts, against the committed bytes:

- The sha256 and byte size of each file match the constants in this document,
  which are parsed out of the table above rather than restated in the test.
- Every row of every file replays legally at handicap 0 and handicap 3
  (`validateOpenings`).
- Cross-file uniqueness: the 128 rows of `e0-openings.jsonl`, `e1-dev.jsonl`,
  `e1-val.jsonl` and `e1-sealed.jsonl` hold 128 distinct handicap-0
  `gameplayDigest` values and 128 distinct ids. `e1-baseline.jsonl` is excluded
  from that count because it is by construction a copy of rows from two of
  them.
- Regenerating the pool from seed 2027 and re-running the split reproduces all
  four files byte for byte.
- The baseline composition rule above, id by id and in order.

`tests/lab/openings-set.test.ts` keeps asserting that `e0-openings.jsonl` is
reproducible from seed 2026 with no id prefix and no exclusions, which is why
both new generator flags default to off.

## Second validation pool (added 2026-09-16 at 67e25d16)

`e1-val2.jsonl` (32 rows) exists because `e1-val.jsonl` was consumed by the
E1.3 pricing rows (`k96`, `action-width-wide`: rows 0-15) and the E1.5
calibration contest (rows 16-31), and EPIC-PLAN §5 campaign 4 wants a
challenger's confirmation on FRESH openings rather than a rerun of the ones
that produced the exploratory result. Generated with every existing file
excluded (digest and prefix), so the four pools plus this one hold 160 distinct
handicap-0 gameplay digests:

```
node --import tsx lab/hard-ai/ladder/openings/generate.ts --count 32 --seed 2028 \
  --id-prefix e1v2- --exclude lab/hard-ai/ladder/openings/e0-openings.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-dev.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-val.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-sealed.jsonl --max-attempts 20000 \
  --out lab/hard-ai/ladder/openings/e1-val2.jsonl
```

Stratum: VALIDATION (never tuned against). First use: the preregistered
confirmation row for `hard@ablate:action-width-wide` vs `hard@desktop` at the
P6-fixed commit.

## E2 addendum (added 2026-09-16, lane 2)

Everything above this heading is frozen and unchanged. This section adds one
file and states the rules E2 rows consume openings under. It does not re-open
the A15 freeze and changes no existing stratum.

### Third validation pool `e2-val.jsonl`

- File: `lab/hard-ai/ladder/openings/e2-val.jsonl`.
- Rows: 64.
- Bytes: 15284.
- sha256: `df0c99ccc1249445d35b746b3add51e50c2182c15261a12fcd464cb6bc333f52`.
- git rev at generation: `7c8961799a95228d0faf14f1c21000261b75f7b1`
  (`claude/hard-ai-e2-lane2`, branched from `claude/hard-ai-e1` at E1 close).
- Exact command, run from `muju/`:

```
node --import tsx lab/hard-ai/ladder/openings/generate.ts \
  --count 64 --seed 2029 --id-prefix e2- --max-attempts 20000 \
  --exclude lab/hard-ai/ladder/openings/e0-openings.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-dev.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-val.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-sealed.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-val2.jsonl \
  --out lab/hard-ai/ladder/openings/e2-val.jsonl
```

- `--exclude` repeats; the five files load as 160 excluded openings held
  against every candidate under both rules (handicap-0 `gameplayDigest` and
  prefix relation). This is what `007817b4` did for `e1-val2.jsonl`, with the
  fifth file added.
- Result: 64 of 64 accepted from 866 candidates tried. The generator did not
  saturate the 20,000-attempt budget and no acceptance rule was relaxed.
- Rejections: 368 shorter than 2 plies, 199 a prefix of an excluded opening,
  188 the h0 digest of an excluded opening, 37 a prefix of an accepted
  opening, 10 a duplicate h0 digest. Total 802; 802 + 64 = 866.
- Ply distribution: 2 plies 2, 3 plies 23, 4 plies 20, 5 plies 19.
- Distinct handicap-0 digests: 64 of 64. With the five excluded files the six
  pools hold 224 distinct handicap-0 positions.
- Every row replays legally at handicaps 0 and 3 (`validateOpenings`).
- Observation, not a rule change: every accepted row has an attempt index
  divisible by 5, so every row was driven by the `Random` bot. The same holds
  for all 112 E1 rows and 32 `e1-val2` rows. `DRIVER_BOTS` cycles mod 5 and
  `PLY_TARGETS` mod 4, and the four non-`Random` drivers pass early or repeat
  positions, so they are rejected. Filed in
  `docs/hard-ai/e2/amendments/lane2.md`; the pool is used as generated.

### Stratum and use rules

- Stratum: VALIDATION, for E2 confirmation rows. Never tuned against: no
  weight, flag or config may be chosen by looking at a result measured on this
  file, and no row may be inspected while iterating.
- One use per row. A row consumed by one confirmation row is never used again,
  by that arm or any other. 64 rows is two 32-pair confirmations, or one
  64-pair confirmation, and nothing more.
- E2 confirmation rows draw from `e2-val.jsonl` only. No confirmation may run
  on `e1-val.jsonl` or `e1-val2.jsonl`.
- E2 screening rows may use E1 validation rows at most once more each, under
  the remaining-use table below. A screening row alone retains nothing
  (`docs/hard-ai/e2/E2-PLAN.md`, "Rules E2 rows will run under").
- `e1-sealed.jsonl` stays untouched until E6.2, as frozen above.

### What the E1 validation pools have left

| File | Rows | Used by | Uses so far | Left |
| --- | --- | --- | --- | --- |
| `e1-val.jsonl` | 0-15 | E1.3 `k96`, E1.3 `action-width-wide` | 2 | screening only |
| `e1-val.jsonl` | 16-31 | E1.5 calibration contest | 1 | one screening use |
| `e1-val2.jsonl` | 0-15 | E1.4 `action-width-wide` confirmation | 1 | one screening use |
| `e1-val2.jsonl` | 16-31 | E1 `reply-wide` exit row | 1 | one screening use |

- `e1-val.jsonl` rows 0-15 are the most used block in the campaign and are the
  first rows a screening row should avoid.
- The record corrects `E1-CLOSE-CRITIQUE.md` N9 on one point: N9 was written
  before the exit `reply-wide` row (7c896179) consumed `e1-val2` rows 16-31,
  so no E1 validation block is untouched now.

### Confirmation seed rule (critique N6)

- Every E2 row runs at `seed = 20260900 + <row ordinal in the E2-PLAN.md row
  ledger>`. Row #1 is seed 20260901.
- The ordinal is assigned when the row is appended to the ledger, before
  launch. The ledger is appended, never rewritten, so a seed is never reused
  and never chosen after a result is seen.
- This replaces E1's practice, where the confirmation seed (20260916) was
  first written 18 s after its run started.

## E3 addendum (added 2026-09-17, coordinator)

Everything above is unchanged. The remaining-use table in the E2 addendum is
superseded on two rows by the E2 ledger (`docs/hard-ai/e2/E2-PLAN.md`):

| File | Rows | Used by | Uses so far | Left |
| --- | --- | --- | --- | --- |
| `e1-val.jsonl` | 16-31 | E1.5 calibration contest, E2 row #2 (`interior-place-wide` screening) | 2 | none |
| `e1-val2.jsonl` | 0-15 | E1.4 `action-width-wide` confirmation (E2 row #3 was preregistered here and closed without a row) | 1 | one screening use — E3 row #1 |
| `e1-val2.jsonl` | 16-31 | E1 `reply-wide` exit row | 1 | one screening use |
| `e2-val.jsonl` | 0-31 | reserved by E2-PLAN C3 for E2 confirmations (both closed negative; rows unused) | 0 | E2 only |
| `e2-val.jsonl` | 32-63 | — | 0 | E3 confirmations only |

E3 rows run at `seed = 20260930 + <E3 ledger ordinal>`.

## E3 close addendum (23:23:49Z 2026-09-17, coordinator)

| File | Rows | Used by | Uses so far | Left |
| --- | --- | --- | --- | --- |
| `e1-val2.jsonl` | 0-15 | E1.4 `action-width-wide` confirmation, E3 row #1 (`eval-no-safety` screening) | 2 | none |
| `e1-val2.jsonl` | 16-31 | E1 `reply-wide` exit row, E3 row #4 (`eval-correct-v1` screening) | 2 | none |
| `e2-val.jsonl` | 32-47 | E3 row #2 (`eval-no-safety` confirmation) | 1 | none |
| `e2-val.jsonl` | 48-63 | E3 row #5 (`eval-correct-v1` confirmation, preregistered 23:23:49Z) | 1 | none |
| `e2-val.jsonl` | 0-31 | reserved by E2-PLAN C3 (E2 closed with both rows negative, rows unused) | 0 | E2 only |
| `e1-sealed.jsonl` | 0-31 | — | 0 | E6 only |

No E1 or E2 validation block has a screening or confirmation use left for E4;
E4 generates `e4-val.jsonl` (seed 2030, every pool above excluded) before its
first row.

## E4 addendum (2026-09-17 23:50:36Z, coordinator)

### Fourth validation pool `e4-val.jsonl`

- File: `lab/hard-ai/ladder/openings/e4-val.jsonl`. Rows: 128. Bytes: 31311.
- sha256: `5a421b92b5daf63f1ca8052a59338e09b6821e5438de46cf1f403aaffd900afa`.
- git rev at generation: 28d33812 (`claude/hard-ai-e4` branch point).
- Exact command, run from `muju/`:

```
node --import tsx lab/hard-ai/ladder/openings/generate.ts \
  --count 128 --seed 2030 --id-prefix e4- --max-attempts 40000 \
  --exclude lab/hard-ai/ladder/openings/e0-openings.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-dev.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-val.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-sealed.jsonl \
  --exclude lab/hard-ai/ladder/openings/e1-val2.jsonl \
  --exclude lab/hard-ai/ladder/openings/e2-val.jsonl \
  --out lab/hard-ai/ladder/openings/e4-val.jsonl
```

- Result: 128 of 128 accepted from 2,711 candidates; 224 openings excluded
  from six files under both rules. Rejections: 1,145 shorter than 2 plies,
  710 the h0 digest of an excluded opening, 374 a prefix of an excluded
  opening, 335 a prefix of an accepted opening, 19 a duplicate h0 digest.
- Ply distribution: 3 plies 40, 4 plies 48, 5 plies 40. Distinct handicap-0
  digests 128 of 128; every row replays at handicaps 0 and 3.
- Stratum: VALIDATION. Eight 16-row blocks, one use each: S1–S4 = rows 0–15,
  16–31, 32–47, 48–63; C1–C4 = rows 64–79, 80–95, 96–111, 112–127. Assignment is in the
  plan and is appended, never rewritten. E4 rows run at
  `seed = 20260940 + <E4 ledger ordinal>`; E3 follow-on rows keep E3's rule.

## Phasing P1 allocation (2026-09-18)

All preceding allocations remain historical Standard evidence. Phasing uses the
new rules-bound allocation in [ALLOCATION-P1.md](ALLOCATION-P1.md); no old row is
reinterpreted or regenerated. P1 dev and val are in this directory. The sealed
64-row file (32 acceptance + 32 spare) is outside the repo; its sha256 is
`d0b088c31806fe6ab0f09dfc66c1e2b2b5a4e45d0dbee03c39d6ab298a87e058`.
