# Lane 14 amendment proposals (E3.2 correctness flag B6)

Written 2026-09-17. Lane 14 owns `src/ai/hard/tables/approach.ts` (behind the
new flag only), one optional `EvalFix` field in `src/ai/hard/config.ts`,
`lab/hard-ai/ablate/arms.ts` (the `eval-fix-b6` entry and its `evalFixKey`
line), `tests/ai/hard/eval-correct.test.ts` (a B6 block),
`tests/ai/hard/approach-tie.test.ts` (new), `tests/lab/ablate.test.ts` (the
`CORRECT_ARMS` list), `docs/hard-ai/e3/E3.2-CORRECTNESS-B6.md` and
`lab/results/hard-ai-e3/correct/b6/**`. Everything below needs a file this lane
does not own, so it is proposed here and nothing was edited.

Evidence for each item is in `E3.2-CORRECTNESS-B6.md` and
`lab/results/hard-ai-e3/correct/b6/scan.json`.

## A1. Whether B6 joins `eval-correct-v1` is the coordinator's call

- The slice forbade this lane from touching the bundle, and it did not.
- The fact that decides it: `eval-correct-v1` carries B4, so it carries B4's
  residue — 5 of 1,000 fuzz positions disagree with their own rot180 + seat-swap
  mirror on `Inv3RetreatSquare`, 250 cc each (`scan.json` `rot180[b1-b5]`, and
  the same five under B4 alone). With `approachTieOrder` beside it the corpus
  has 0 of 1,000 violations in any feature.
- B6 alone cannot be priced: with B4 off nothing reads `t.retreats`, and the
  dev-stratum exam at `fixed:25000` returns all 149 rows identical to
  `hard@desktop`, end keys included. Only a bundle that carries B4 can move.
- Proposed: if the bundle's screening row has not launched, add
  `approachTieOrder: true` to `eval-correct-v1`'s patch (its hash moves, and
  `E3.2-CORRECTNESS-ARM.md` §3's table and §6's residue bullet must be updated
  with it); if it has launched, leave the bundle alone and carry B6 as a
  separate flag so the launched row stays attributable.

## A2. `E3.2-CORRECTNESS-ARM.md` §3's `eval-correct-v1` hash is stale

- §3 records `87a0e1ab72e51326766dfcd5b89be8d048621d52407e736f21dafc2d449881a0`.
- Measured at the E3 head `6cb54e05`, from a `git archive` of the UNMODIFIED
  head extracted to a scratch directory with `node_modules` symlinked:
  `4374c63c601870f87e462f261ea75ddb11b2f538f4a79fd4af123de0eaeda08b`.
- The same value prints from this lane's branch, so lane 14 did not move it; the
  arm's patch was not touched here. `hard@desktop` and `eval-fix-b1..b5` all
  still print the hashes §3 records, so only the bundle row is wrong.
- Likely cause: §3's table was written while the bundle still carried B1, which
  `AMENDMENTS-E3.md` A-E3-2 removed.
- Proposed: correct §3's bundle row, and check any preregistration draft that
  quotes the bundle hash (§7) before a row is launched under it.
  `E3.2-CORRECTNESS-ARM.md` is lane 12's file.

## A3. `lab/hard-ai/audit/eval-audit.ts` cannot be pointed at an `evalFix` arm

- Its rot180 check is the instrument E3.1 used for exactly this class of finding,
  and `parseArgs` has no `--eval-fix` (and no `--arm`): the `Evaluator` it builds
  carries `evalFix: null`, so every audit run is the champion.
- Consequence for this lane: the corpus scan had to be re-implemented as
  `lab/results/hard-ai-e3/correct/b6/scan.ts`, the same way lane 12 re-implemented
  it as `correct/repro.ts` — two copies of one scan, neither typechecked by
  `npm run hard:types` (the `lab/hard-ai/tsconfig.json` include list does not
  cover `lab/results`).
- Proposed, with lane 12's A1 in one edit: add `--eval-fix <b1|b2|…|all>` (or
  `--arm <name>`, resolving through `ablate/arms.ts`) to `eval-audit.ts`, and
  move both reproduction scripts under `lab/hard-ai/audit/`.
  `lab/hard-ai/audit/eval-audit.ts` is lane 4's file.

## A4. The OTHER scan-order tie in `tables/approach.ts` is unmeasured

- `approachTable considerCandidate` ranks attackers by fewest move actions, then
  the more dangerous class, then an existing unit before a purchase, then the
  lowest tiebreak key — the attacker's SLOT for a unit, the catalogue's tier-1
  index for a purchase.
- A slot number is not a mirror-invariant quantity in general (it is an artifact
  of `Replica.pack`'s ordering), so two attackers tied on cost and class could in
  principle be chosen differently in the two spellings of one position, exactly
  as the attack square was.
- It is not implicated in anything measured here: the slots are mirror-stable at
  all five violating ids, and with B1–B6 on the fuzz corpus has 0 of 1,000
  violations in any feature.
- Proposed: record it as an OPEN item rather than a fixed one — B6 fixes the
  attack-square tie and nothing else — and, if it is ever wanted, break that tie
  on a mirror-invariant key (the attacker's SQUARE in its own corner-relative
  frame) behind the same flag. `E3.1-SYNTHESIS.md` §5 and
  `E3.2-CORRECTNESS-ARM.md` are not this lane's files.

## A5. For `.claude/napkin.md` (not this lane's file)

- A `NodeTables`-carried flag reaches `tables/approach.ts` for free: the module
  already takes `t`, so a sixth `EvalFix` flag needed no signature change and no
  call-site change anywhere in `src`, `lab` or `tests`. The pattern lane 12
  established is cheap to extend; the expensive part is finding the reader.
- A flag whose only consumer is gated behind ANOTHER flag is inert alone. B6
  changes `t.retreats`, and `t.retreats` has exactly one reader in the
  evaluator (`eval/invariants.ts:294`) which is itself gated on B4, so
  `hard@ablate:eval-fix-b6`'s dev exam is the champion's 149 rows, end keys
  included. Grep for the READER before predicting what a correctness flag will
  move.
- The identity of an arm's hash is worth re-measuring from a `git archive` of
  the unmodified head before blaming your own edit: `eval-correct-v1` printed a
  hash different from the one its doc records, and the difference predated this
  lane by a merge (A2).
- "Where no tie exists the value may not move" is a cheap and strong test for a
  tie-break fix: detect the tie independently from the same enumeration the code
  performs, but drop the filters that only SHRINK the candidate set (here the
  class test and the action budget), so "tie-free" is a sound under-approximation
  and the assertion cannot be accused of circularity.
