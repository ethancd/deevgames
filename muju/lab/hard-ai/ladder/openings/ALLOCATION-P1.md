# P1 Phasing opening allocation — frozen 2026-09-18

Rules: **muju-phasing-1**. Generated before any V2 sanity or Hard strength row.
Source base: `2922375ef8c1f828f4bc5c1a411d1e19cdc2b6fd` plus the uncommitted T1
changes on `codex/phasing-harness`. No engine under test generated or evaluated
these openings. [P1-SOURCES.json](P1-SOURCES.json) pins the generator, scripted
policies, replay helpers and canonical rule source bytes. Standard E0/E1/E2/E4 files and their allocation evidence remain
unchanged, with byte regeneration available at `standard-final`.

| File | Rows | Bytes | sha256 |
| --- | ---: | ---: | --- |
| `p1-dev.jsonl` | 48 | 13588 | `a58ca9d8aad304d82824ef38d7b12c776ea1547ba61a10cbfba1e387e78335c7` |
| `p1-val.jsonl` | 32 | 10295 | `cbd427dfd2ee88d7f9ef1722267c254568c973df7d4aa9c32dfba36acab35119` |
| `p1-sealed.jsonl` | 64 | 18786 | `d0b088c31806fe6ab0f09dfc66c1e2b2b5a4e45d0dbee03c39d6ab298a87e058` |

The sealed file is **only** at
`/Users/ashkie/src/deevgames-wizards/sealed/p1-sealed.jsonl`, mode 0600.
Claude must not read it. Rows 0–31 are the acceptance allocation; rows 32–63
are unused spare. Spare rows require a dated preregistration amendment before
use; they are not a second attempt after an unfavorable sealed result. Normal
tests never read or regenerate the sealed allocation. Only its hash and aggregate
provenance are published here. Dev is for tuning; val is for model selection;
sealed is consumed once under the preregistered run.

## Reproducible generation and split

Run from `muju/`, only for initial allocation (it refuses to overwrite any split):

```sh
node --import tsx lab/hard-ai/ladder/openings/split.ts
```

- Generator and shuffle seed: **20260954**. `mulberry32` / `deriveSeed` only.
- Scripted drivers cycle `Random`, `Rush`, `Greedy`, `Expand`, `Balanced`;
  driver is attempt index modulo 5. No V2 or Hard search is called.
- Act decision targets cycle 1, 2, 3, 4, indexed by attempt modulo 4.
- 144 openings accepted from 571 candidates; 427 duplicate-position rejections.
- Generator accepts only legal replays at both h0 and h3, distinct h0 digests,
  and no pair of action lists in a prefix relation. These checks run across the
  whole pool before splitting. Digests include rules identity and sorted public
  pending summons (owner, type, square, paid cost); minted IDs are excluded.
- Descending Fisher–Yates shuffle of the accepted pool with `mulberry32(20260954)`;
  cuts are `[0,48)` dev, `[48,80)` val, `[80,144)` sealed including spare.
- Aggregate decision lengths: 2: 1, 3: 9, 4: 32, 5: 21, 6: 36, 7: 34, 8: 11.
  These are single decisions, not completed turns.

## Why an opening ends here

Both handicaps start White **and Black** in Act. Standard's claim that h0 and h3
start Black in different phases is inapplicable. White takes up to the selected
number of Act decisions (or ends early), ends Act, mines and settles upkeep,
then lets the same scripted bot finish Prepare. The opening includes that final
`END_PLACE_PHASE` and ends at **Black's first Act root**, four actions available.

White has completed one entire player turn. Its public commitments remain
pending through Black's reply; none has mined, blocked, or attacked. Black has
made no bank-dependent decision, so the identical square-based action list is
legal at h0 and h3. The only difference is Black's three-crystal starting grant.
A two-decision opening is legal: White passes Act, then Prepare; it still changes
income, the quiet clock, and the side to move. We do not truncate inside Prepare
or pretend `END_ACTION_PHASE` hands over. There is no claim that deeper shared
openings are impossible; this stop rule is a deliberate common boundary.

A 207-decision guard bounds one turn: four Act decisions, up to 100 promotions,
up to 100 commitments, two phase ends, and one upkeep choice. A terminal candidate
is rejected; a simulator no-op or illegal scripted emission aborts generation.

## Consumer boundary and verification

Use `openings/phasing.ts` exports `initialStateFor`, `applyOpening`,
`gameplayDigest`, and `validateOpenings`. `OpeningSpec` remains `{id, actions}`;
P1 IDs start with `p1-`. The helper rejects older corpus IDs and non-Phasing
digests. The shared `../openings.ts` loader and replay analyst still implement
Standard and belong to Claude; their port is a prerequisite for a ladder row.
Do not feed their Standard starting states to the Phasing harness.

Generation validated all 144 rows at h0 and h3 before writing, without displaying
sealed positions. `tests/lab/openings-p1.test.ts` verifies dev/val byte pins,
replay boundaries and uniqueness, and tests deterministic generation on unrelated
test seeds. It does not open the sealed file or reconstruct its seed allocation.

## 2026-09-19 — the book is accepted under `muju-phasing-2`, unchanged

Preregistration amendment A4 (owner decision, 2026-09-19) moved the inactivity
draw clock from **10 plies to 20** (warning 7 -> 17) and advanced the rules
revision from `muju-phasing-1` to **`muju-phasing-2`**. That voided every row
measured under the old revision. It did **not** void this allocation: the three
files keep their bytes, their row counts and the sha256 hashes pinned in the
table above, and nothing was regenerated, re-split or re-shuffled. The loader
accepts them under `muju-phasing-2`, and the justification is recorded here
rather than left to the reader.

**Why the bytes are still valid.** The only rule that changed is when the
inactivity draw fires. An opening is therefore affected only if it hands a run a
clock value the two limits treat differently. By the stop rule in "Why an
opening ends here" — every opening ends at Black's first Act root, after White
has completed exactly one player turn and handed off once — no opening can. The
claim is measured, not assumed: replaying all 48 dev and all 32 val rows at both
handicaps (160 replays) gives `inactivityPlies` of **exactly 1 at every single
one**, with `progressThisTurn` false; the maximum over the unsealed corpus is 1.
That is six below the old warning threshold of 7 and nineteen below the new
limit of 20, so no opening position sits anywhere near either boundary, and no
opening could have ended, warned or scored differently under either revision.
`tests/lab/openings-p1.test.ts` performs those 160 replays and pins the result,
so the claim is re-checked on every run rather than resting on this note.

**The sealed book was not opened**, here or by that test. It was generated by the
same generator, in the same pool, under the same stop rule, in the same session
as dev and val — all 144 rows were validated together before splitting, as
recorded above — so the property holds for it by construction. A4 states the
same reasoning and explicitly declines to read the sealed bytes to confirm it.
The sealed allocation, its hash and its one-use rule are unchanged.

**What did change.** `openings/phasing.ts#RULES_VERSION` is now
`muju-phasing-2`, so every `gameplayDigest` of a P1 position moves with it: a
phasing-1 digest and a phasing-2 digest of the same board are different strings
and cannot be mistaken for one another. The digests recorded in
`P1-SOURCES.json` and the source-byte hashes it pins belong to the phasing-1
generation run and stay as they are — they are a record of how these files were
made, not a claim about which revision may replay them.
