# M6 independent artifact review — 2026-09-19

Conclusion: the recorded independent legality/replica run and all18 authored
accounting goldens support their stated bounded checks. The complete M5 suite
measurement is internally consistent and valid, but **fails its preregistered
performance floors**. No integrity discrepancy or actionable source defect was
found in this audit. This is not full M6, Gate0/Gate1, strength or release
acceptance.

Scope: read existing reports and relevant source; independently rehash current
source/artifact bytes, recount rows, and recompute recorded ledger/aggregate
arithmetic with data-only scripts. No engine, canonical transition, test suite,
historical corpus, opening, val or sealed execution/read was performed. No
repository source or expected answers were changed. This report is the only new
artifact from this review.

## Source, weights and driver provenance

- `m6-independent-acceptance-1.json` binds72 source files; both golden reports
  bind75. Fresh source inventories have no additions/deletions relative to
  these maps. Every before/after pair and every current byte hash matches;
  the72 common source pins are identical across runs.
- The first and second golden runs have identical source maps and weights
  bytes. Both use weight hash `0ae24a95`, schema `muju-phasing-eval-1`, version2,
  label `phasing-accounting-bootstrap-v1`, and62 features. The weights file
  SHA256 is `e8e1cc7d7e15d9c02d148651004dfd2fe716b98a8017e3ef031b94ed74816eb3`.
- Independently parsed the canonical catalogue: all18 material entries are
  purchase cost times100. The only nonzero feature coefficients are
  `(0,100), (2,100), (3,100), (23,100), (58,1)`.
- First goldens are preserved as failed after11 attempted cases, including
  their exact driver and diagnostic. Its only failure is strict `Object.is`
  comparison of `0` and `-0` in `invalid-refund-principal/original` viewpoint
  antisymmetry. The saved driver hash matches the failed report. The complete
  driver diff contains exactly the two replacements with numeric `===` for
  expected-score and opposite-view checks; this preserves exact nonzero
  equality. No root, coefficient, source or expected ledger changed.
- Passing golden driver SHA256:
  `58b54acb59348adeaa12837358a9dfdf1d3f7b4e696388667e663ce4e84b4cba`.
  Independent44 driver SHA256:
  `0d5d38dadae8127cc5a2805f4da07fed5a9f59f9ba6216e828986024523478f8`.
  Current driver bytes equal their recorded before/after hashes.

## Independent44 acceptance

Independently recounted44 unique roots,3339 generated macros and16996 recorded
canonical actions; report counts also include16996 state comparisons,
3339 full unmakes and44 completed Hard results. All original canonical root
hashes recompute and every root records unchanged. Four verifier fault controls
reject wrong endpoint key, missing upkeep mask, premature end-action and
opponent continuation. No fallback or reported execution failure appears.

All44 generation records report zero rescue and economy proof caps. All44
search records explicitly report zero replica divergences, ordinary proof caps,
economy proof caps and preparation economy proof caps. Source assertions also
veto root-table and candidate-replay caps; those assertions completed without
failure. Fixed-work budgets remain50,000 for generation and25,000 for search.

Every generator/search uses one identity,
`1f82ba651ee99d5a4a870d66d9a227562bba00af3660c9e44fa6dd278009d0cb`.
Its identity and config hashes independently recompute. It records the resolved
production desktop configuration, EMPTY_BOOK,62-feature schema and frozen
weights, and asserts evaluator/engine agreement. This is legality, complete
macro, replica and restoration evidence on the frozen44-root domain; it is not
a strategic suite score.

## All18 authored accounting ledgers

For every row, independently recomputed catalogue material from its saved root,
bank difference, discounted live receipts and pending receipts. Live-origin
value uses the declared Q16 discount literals, subtracts paid rent and released
root-live principal at the recorded ordinal, then truncates the signed total
to whole crystals. Pending principal plus service truncates only at the final
cc boundary. All expected and actual scores, opposite viewpoints, root hashes
and per-case success/immutability markers agree.

The table lists original-root components in cc; each separately evaluated
rotated root has the signed counterpart shown. This reports the particular
fixtures, not a general rotation-equivalence claim.

| Authored motif | Material | Cash | Live forecast | Pending asset before final truncation | Original / rotated score |
|---|---:|---:|---:|---:|---:|
| Dry principal | 200 | 0 | 0 | 0 | 200 / -200 |
| Cash eight | 200 | 800 | 0 | 0 | 1000 / -1000 |
| Cash nine | 200 | 900 | 0 | 0 | 1100 / -1100 |
| Paid principal | 200 | 0 | 0 | 300 | 500 / -500 |
| Finite paid service, no intervening movement | 200 | 0 | 0 | 470.9991455078125 | 670 / -670 |
| Invalid refundable principal | -300 | 0 | 0 | 300 | 0 / 0 |
| Live finite mining | 200 | 0 | 500 | 0 | 700 / -700 |
| Unpaid Prepare release | 400 | 0 | -700 | 0 | -300 / 300 |
| Act mining funds rent | 500 | 0 | 400 | 0 | 900 / -900 |

The paid-service receipts mine one crystal at each of ordinals1 and2, with no
live-origin duplication. Invalid commitments refund3 and retain principal
value. Finite live mining receipts are3,3,1; unpaid Prepare releases cost7 at
ordinal0 and stops immediately at terminal; Act mining receives2 and pays1
at each of six reached closures. The other fixtures stop at the declared
horizon. All fixtures use elimination victory, so the golden loop does not
exercise a home-proof cutoff path; it should not be presented as broad prover
coverage. The independent canonical reference throws on unresolved home proof
when that path is applicable, and production economy cutoffs are rethrown by
the frozen engine source.

## Complete225-case suite measurement

`m6-suite-measure-1/result.json` records `valid=true`, `floorPass=false`, no source
or engine drift, and `acceptance=not-established`. Independently checked:

- Exactly225 unique row IDs, no missing/duplicate manifest IDs;245 member
  references; fixed family sizes79 tactics,20 invariant pairs,56 home-mate,
  30 economy,30 disruption,10 fortify. Row case hashes/kinds/decision units match
  the frozen manifest descriptors and the summary's exact result objects.
-149 fixed decision units,126 earned;76 zero-unit coverage checks all pass.
  Statuses are202 pass and23 fail; every failure is `predicate-miss`. There are
  no error/indeterminate rows or denominator/classification adjustments.
- Manifest and contract bytes, all six family file bytes, weights bytes and
  rows SHA256 match the declared input/result pins. Manifest/contract semantic
  hashes recompute. Before/after artifact and canonical maps are identical;
  all20 artifact pins,24 canonical pins and77 engine source pins match current
  bytes. Manifest/floor-contract have no working-tree changes.
- Author validation reports225 checks,225 cases,245 members, no errors,
  `valid=true`, and `engineExecuted=false`; it has the same exact bundle identity.
- One production adapter identity appears throughout start/result/row results
  and all nested executions:
  `06e907b23c209d35dc7ffd03cd55cffab77377c78876eb815aff82633dfdbcc7`.
  Recomputed it with the source's localeCompare stable-key ordering; its source
  aggregate and selected numerical weight identity also recompute. This adapter
  identity uses a different documented schema from independent44, so their
  different identity strings do not indicate different weights.
- The production adapter reports desktop, fixed-work, seed1, EMPTY_BOOK and
  `executionKind=production`. All199 search operations' requested budgets match
  their pinned case definitions, reported rungs match those budgets, claimed
  and verified endpoint keys agree, and none reports abort or fallback. The
  run preserves131 macro searches,32 coverage searches,36 pair searches and40
  pair full evaluations, including both members' diagnostics.
- All199 search diagnostic snapshots explicitly have zero ordinary,
  economy and preparation economy proof caps and zero replica divergences.
  All operation-level cap fields are zero. There are no adapter refusals or
  unresolved ordinary decision predicates.
- The only non-null canonical cutoff facts are the two deliberately bounded
  `node_limit` probes for structural invariant15. That pair offers0 points,
  has no search budget and explicitly tests UNKNOWN handling; those expected
  probes are not an ordinary decision proof or evidence of resolved safety.

Independently recomputed family totals and compared the unchanged preregistered
minimums:

| Family | Earned / offered | Minimum | Result |
|---|---:|---:|---|
| Tactics | 62 / 63 | 57 | Pass |
| Invariant preferences | 5 / 18 | 17 | Fail |
| Home-mate decisions | 28 / 28 | 28 | Pass |
| Economy decisions | 20 / 20 | 20 | Pass |
| Summon disruption decisions | 5 / 14 | 13 | Fail |
| Home fortification decisions | 6 / 6 | 6 | Pass |

This is an honest negative performance measurement of the sparse accounting
bootstrap. The13 invariant misses and9 disruption misses remain failures;
the single tactics miss remains in its fixed denominator even though that
family meets its floor. Nothing in this audit authorizes fitting coefficients,
changing floors, relabeling cases or claiming release readiness.

## Reviewed report hashes

| Artifact | SHA256 |
|---|---|
| independent44 report | `31e89b82196c8673ee8400550a115f23a7849945f8a6e35477bee8155cf6d4f2` |
| Failed signed-zero goldens | `1a0ac46cfa83ba46e3092e7e03f8d899f8ab6c5b3998e01c4b92b0c4b9c9aaac` |
| Passing18 goldens | `48c868bce457af9dc5ead2e0a92ee91540a746b625f83ca74b7c923b4b4b8c06` |
|225-case result | `0214739381e99842e50825897bdb3bfcf0fff6421e012d5257637454be3850f6` |
|225 JSONL rows | `32f6b531193e9f81de74860651ca8040f56dd807bd82ff4adf4acdce22111a33` |

Limits: this audit rechecks report arithmetic, provenance and source-enforced
vetoes; it does not independently rerun199 searches,16996 canonical transitions
or the suite's predicates. Wider historical harness migrations and other
migration/release gates remain outside this result.
