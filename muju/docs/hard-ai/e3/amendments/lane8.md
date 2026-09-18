# Lane 8 proposed amendments (E3.3 tuning instrument, 2026-09-17)

Lane 8 owns `lab/hard-ai/tune/**`, `tests/lab/texel.test.ts`,
`docs/hard-ai/e3/E3.3-TUNING-INSTRUMENT.md` and
`lab/results/hard-ai-e3/tune/**`. Each item below needs a file this lane may
not edit. Nothing here was applied.

## A8.1 — `features.ts`'s header contradicts `evaluate.ts` on `F.Material`

- File needed: `src/ai/hard/eval/features.ts` (comment only, lines 26-31).
  Forbidden to E3.1 lanes by `E3-PLAN.md` ("No lane edits `src/ai/hard/**`").
- The header says `Evaluator.stage0` "overwrites `out[F.Material]` with the
  weighted value in `full()`, so `score === Σ w·f` stays exact under tuning".
- `evaluate.ts:163-167` `full()` is `stage0 + stage1 + stage2` then
  `outFeatures.set(this.f)`; there is no assignment to index 0 anywhere in the
  class, and `evaluate.ts`'s own header (lines 22-25) says the opposite:
  "`full`'s `outFeatures[Material]` carries `extract`'s weight-free prior
  version for Texel's reporting".
- Measured: `Σ_{i≥1} w[i]·f[i] + Σ_d material[d]·counts[d]` equals `full()`'s
  return on 730 of 730 macro nodes from 20 `hard-ai-e1/baseline` replays, 665
  of which have `f[F.Material] != 0`. Adding `w[0]·f[0]` breaks the identity on
  those 665.
- Consequence if left: a reader of `features.ts` will tune `w[F.Material]` and
  measure nothing. DESIGN §5.15's "coordinate descent over the 58 weights and
  18 material values" is 74 free integers in this tree, not 76.
- Proposal: correct the `features.ts` header to match the code, or (a larger
  change, for E3.2) make `full()` actually write the weighted value so that
  `score === Σ w·f` holds and `w[0]` becomes tunable.

## A8.2 — validation openings in a tuning corpus: two rules disagree

- Files needed: `lab/hard-ai/ladder/openings/ALLOCATION.md` and/or
  `docs/hard-ai/e3/E3-PLAN.md`. Both are coordinator-owned.
- `ALLOCATION.md` "Stratum rules": **Validation** — `e1-val.jsonl` — "Never
  tuned against: no weight, flag or config may be chosen by looking at a
  validation result". The E2 addendum says the same of `e2-val.jsonl` and
  `e1-val2.jsonl`.
- Lane 8's brief says the openings that may ever be trained on are
  "development and the E1 validation blocks already spent".
- These are not the same rule. In the smoke corpus, 894 of 1,335 rows (67 %)
  come from `e1-val.jsonl` (556) and `e1-val2.jsonl` (338) games; only 441 come
  from `e1-baseline.jsonl`, which is the development stratum.
- Lane 8 did not resolve it. The corpus tool records `pool` on every row and
  `perPool` in the manifest, and takes `--refuse-pool <file>` so a corpus can
  exclude validation without a code change. `e1-sealed.jsonl` and
  `e2-val.jsonl` are refused unconditionally either way.
- Proposal: the coordinator rules one of (a) a spent validation block may be
  trained on, recorded as a dated addendum to `ALLOCATION.md` with the
  consequence spelled out (those blocks can then never price a tuned arm), or
  (b) tuning corpora are development-only, in which case every future
  `hard:corpus` run carries `--refuse-pool e1-val.jsonl --refuse-pool
  e1-val2.jsonl` and the development stratum must be enlarged.

## A8.3 — M18's corpus bar is unreachable from recorded replays

- File needed: none to change today; this is a sequencing note for whoever
  schedules M18.
- M18's gate is `corpus.positions >= 10000 && corpus.drawShare < 0.70`.
- The hard-AI result directories hold 678 games with recorded replays in total
  (E0 38, E1 568, E2 72); the smoke corpus used 520 of them. At the measured
  2.57 quiet rows per game, 10,000 positions needs about 3,900 games.
- The gate therefore cannot be met without the self-play generator DESIGN §5.15
  specifies (`--games --work --handicaps --shards`), which is not in this slice.
- Proposal: either schedule the self-play generator as its own slice before any
  M18 attempt, or amend M18's gate to name the corpus source it will actually
  run on.

## A8.4 — `hard:spsa` points at a file that does not exist

- File needed: `package.json` (coordinator-owned; one script line) or a future
  lane that writes `lab/hard-ai/tune/spsa.ts`.
- `package.json` maps `hard:spsa` to `node --import tsx
  lab/hard-ai/tune/spsa.ts`. That file was not in this slice and was not
  written, so the script fails with a module-not-found error.
- `hard:corpus` and `hard:texel` now resolve, so `hard:spsa` is the last of the
  three §5.15 entry points still dangling.
- Proposal: leave the script line alone and write `spsa.ts` in a later slice
  (M20 needs it), or note the gap in M18's row so nobody reads the failure as a
  regression.
