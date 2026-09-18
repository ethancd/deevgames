# Lane 4 proposed amendments (E3.1 contributions, scale and cost)

Everything here needs a file lane 4 does not own. Nothing below was applied.
Evidence is in `../E3.1-CONTRIBUTIONS.md` and
`lab/results/hard-ai-e3/eval-audit/`.

## A1 — `Infiltration` (feature 11, w = +90) is structurally always zero

- `src/ai/hard/eval/features.ts:284` subtracts `gThem.infiltrationAnchors` from
  `gMe.infiltrationAnchors`, and the two counts are equal on every position for
  a geometric reason: `RECT[BLACK][a] ∋ s` ⟺ `s ≥ a` componentwise and
  `RECT[WHITE][s] ∋ a` ⟺ `a ≤ s` componentwise, so both sides count the same
  set of (white unit, black unit) ordered pairs
  (`tables/geometry.ts:124-137`, `core/tables.ts:95-119`,
  `src/game/board.ts:176-178`, `src/game/spawning.ts:8-29`).
- Measured: 0 nonzero on 2,151 positions across seven corpora; raw per-side
  counts reach 15 and are equal on 1,876 of 1,876 positions probed.
- Proposal: an E3.2 switchable arm (default off) that makes the feature
  directional — for instance `Σ over own units inside an enemy rectangle`
  counted only when the own unit is nearer the enemy corner than the enemy
  anchor is — priced by exam and a screening row under E3-PLAN.md's rules.
  Owner: whoever takes E3.2. Files: `src/ai/hard/tables/geometry.ts` (or
  `eval/features.ts`), which E3.1 forbids.

## A2 — `SpawnZero` and `Inv1SpawnZero` are the same predicate, scored twice

- `src/ai/hard/tables/geometry.ts:102` and `src/ai/hard/eval/invariants.ts:290`
  hold the identical condition `area === 0 && bank >= 3`.
- `w = −800` each, so the condition costs 1,600 cc, not the 800 DESIGN §5.12.1
  prints or the 800 DESIGN §5.13 prints. Measured `r = +1.000` and identical
  firing rates on every corpus.
- Proposal: E3.2 arm that zeroes one of the two weights, or DESIGN clarifies
  that the 1,600 is intended. Either way a DESIGN §5.12.1/§5.13 amendment is
  needed, which no lane may write.

## A3 — `HomeInvaded` and `CornerInfiltration` score the same square twice

- `eval/features.ts:167-171` and `eval/features.ts:384-395`: an own unit on the
  enemy corner pays `+4000` through `HomeInvaded` and `+300` through
  `CornerInfiltration`'s first clause. `r = +1.000`, same firing set.
- Proposal: E3.2 arm restricting `CornerInfiltration` to its second clause
  (both enemy corner neighbours held), which is the part `HomeInvaded` does not
  already score.

## A4 — `CornerSeal` and `Inv2CornerSeal` read the same counter

- `eval/features.ts:285` is linear in `geom.cornerNeighboursHeld`;
  `eval/invariants.ts:293` is its threshold-2 case. Sealing both neighbours
  costs 420 cc, not 300.
- Proposal: same treatment as A2, lower priority — `Inv2CornerSeal` fires on
  0.8% of `fuzz-1000`.

## A5 — two module headers disagree about `full()`'s `outFeatures[Material]`

- `src/ai/hard/eval/features.ts:28-31` says `full()` overwrites
  `out[F.Material]` with the weighted value.
- `src/ai/hard/eval/evaluate.ts:23-24` says it carries `extract`'s weight-free
  prior.
- `src/ai/hard/eval/evaluate.ts:167` does the latter (`outFeatures.set(this.f)`
  and nothing else).
- Under `DEFAULT_WEIGHTS` the two are numerically identical (measured: material
  residual 0 on 2,151 positions), so nothing is broken today. Under a tuned
  `material` block — E3.3 — `Σ w·f` computed from `outFeatures` would stop
  equalling the score, and Texel's own reporting would be the thing that
  breaks.
- Proposal: correct the `features.ts` header (a comment-only change under
  `src/ai/hard/**`, which E3.1 forbids), and have E3.3's instrument assert the
  residual rather than assume it.

## A6 — the M12 `--eval` symmetry gate reads a narrow corpus

- `lab/hard-ai/bench/run.ts:130-138` loads only `authored.jsonl`,
  `openings.jsonl` and `fuzz-1000.jsonl`, keeps only `rules.handicap === 0`,
  and never installs a position's `rules` block before packing.
- Lane 4 checked the same identity on 2,151 positions including the 613
  handicap-3 `fuzz-1000` rows and the `tactics`, `home-mate`, `invariants` and
  `exam-dev` corpora, with rules installed per position, and found no
  violation outside the three known economy features. So the narrow corpus is
  not currently hiding anything.
- Proposal (optional, low priority): widen the gate's corpus and install rules
  per position, so the gate keeps covering what it is assumed to cover. File:
  `lab/hard-ai/bench/run.ts`, not owned by this lane.

## A7 — report the rot180 economy exemption in centi-crystals

- The M12 gate counts positions (`symmetryEconMismatch`) but not size. Lane 4
  measures the disagreement at a mean of 241 cc on `openings` against a mean
  \|score\| of 754 cc, and a flat 480 cc on 8 of 56 `home-mate` positions.
- Proposal: add the cc magnitude to the gate's artifact so a future change to
  `tables/economy.ts bestRelocationTarget` can be judged by whether it shrinks,
  not only by whether the count moved. File: `lab/hard-ai/bench/run.ts`.
