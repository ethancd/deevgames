# E3.1 lane 7 — judgment artifacts

Report: `docs/hard-ai/e3/E3.1-JUDGMENT-CASES.md`.
Proposals: `docs/hard-ai/e3/amendments/lane7.md`.

| file | what | how it was made |
| --- | --- | --- |
| `exam-desktop.json` / `.md` | the whole `dev` stratum under `hard@desktop` at fixed 25,000 units | `npm run hard:exam -- --engine hard@desktop --stratum dev --out lab/results/hard-ai-e3/judgment/exam-desktop.json` (7.1 s) |
| `suite-desktop.json` | the `economy` and `invariants` suites under `hard@desktop`, each case at its own `budget.work` = 50,000 | `npm run hard:suite -- --suites economy,invariants --engine hard@desktop --shards 1 --out lab/results/hard-ai-e3/judgment/suite-desktop.json` (16.9 s) |
| `decompose.json` / `.md` | per-case feature decomposition, labels and counts | `node --import tsx lab/hard-ai/audit/judgment-decompose.ts --engine hard@desktop --stratum dev --work 25000 --no-heavy --out lab/results/hard-ai-e3/judgment` (7 min 1 s) |

## The numbers, as measured

- `exam-desktop.json`: exact **121/127** passed, judgment **4/22** matched.
  The two tallies are never added; `exam/run.ts` asserts there is no field that
  adds them.
- `suite-desktop.json`: `economy` **1.000** (30/30) with `wonOutright` 30,
  `invariantsEval` **0.60** (12/20), `invariantsSearched` **0.45** (9/20).
- `decompose.json` `counts`:
  - exam (22 cases): matched 4, contradictory-preference 4, weight-scale 7,
    search-not-eval 3, eval-blind 1, unresolved 3.
  - invariants (20 pairs): matched 12, weight-scale 4, engine-bug 2,
    contradictory-preference 2.
  - economy (30 rows): contradictory-preference 30.

## Three facts a reader should not miss

1. All 30 economy rows are already won for white at the root
   (`checkVictory` = `victory white`, 1 white unit, 0 black units), every legal
   turn end is a victory, and no stored key is reachable. The suite reports
   1.000 for any engine that produces a legal turn.
2. `suites/run.ts:412` builds its engine with `hardConfigFor`, which leaves the
   version-0 `placeholder-m4` weight vector in place. The searched invariant
   reading is **9/20 with those weights and 6/20 with `DEFAULT_WEIGHTS`**.
3. `invariantBits` sets the pair's own invariant for the OPPONENT as well as the
   mover on `inv3-retreat-square-violating` and `inv6-fragile-anchor-violating`,
   so the me−them feature reads 0 and a −250 cc and a −120 cc penalty contribute
   nothing. The `material` group delta is exactly 0 on all six failing pairs,
   contrary to `suites/run.ts`'s header.

Nothing here is a gate, a strength claim or a reason to edit a fixture.
`hard@desktop`'s resolved configuration hash at `{mode:'wall', ms:3000}` is
unchanged: `4e7afdf76b32fadfab2d11577cb610c8f9f1a491b5153e70b87b0774403600cd`.
