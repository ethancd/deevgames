# Lane 12 amendment proposals (E3.2 correctness arm)

Written 2026-09-17. Lane 12 owns `src/ai/hard/{config.ts,engine.ts,eval/evaluate.ts,
eval/features.ts,eval/invariants.ts,tables/context.ts,tables/economy.ts}` (gated
edits only), `lab/hard-ai/oracles/economy.ts`, `lab/hard-ai/ablate/arms.ts`,
`tests/ai/hard/eval-correct.test.ts`, extensions to
`tests/ai/hard/{geometry,invariants,economy,eval}.test.ts`,
`tests/lab/ablate.test.ts`, `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md` and
`lab/results/hard-ai-e3/correct/**`. Everything below needs a file this lane does
not own, so it is proposed here and nothing was edited.

Evidence for each item is in `E3.2-CORRECTNESS-ARM.md` and
`lab/results/hard-ai-e3/correct/`.

## A1. The reproduction instrument belongs under `lab/hard-ai/audit/`

- Today it is `lab/results/hard-ai-e3/correct/repro.ts`, because that is the only
  lab path this lane owns. Results directories should hold results.
- Proposed: move it to `lab/hard-ai/audit/correct-repro.ts`, with a
  `package.json` script line next to `hard:eval-audit`:
  ```json
  "hard:correct-repro": "node --import tsx lab/hard-ai/audit/correct-repro.ts"
  ```
- Consequence of leaving it where it is: `lab/hard-ai/tsconfig.json`'s include
  list (`**/*.ts` under `lab/hard-ai`, plus `src`, `lab/harness`,
  `tests/ai/hard`, `tests/lab`) does not cover `lab/results`, so
  `npm run hard:types` does not typecheck the script. The assertions that must
  hold are in `tests/ai/hard/eval-correct.test.ts`, which is typechecked and run,
  but the script itself is unguarded until it moves.

## A2. `tables/approach.ts`'s `retreats` is not rot180-invariant

- New finding, judge 4, measured on `fuzz-1000` with B4 on: five positions —
  `fuzz-5150-4-132`, `fuzz-5150-1525-94`, `fuzz-5150-1103-127`,
  `fuzz-5150-263-483`, `fuzz-5150-263-488` — disagree with their own rot180 +
  seat-swap mirror on `Inv3RetreatSquare`, 250 cc each (`repro.json`
  `b2.scans`, arm `all`; the five are the only violations left when all five
  flags are on).
- Traced on `fuzz-5150-4-132` (the victim is slot 1, a `plant_1` at square 1 in
  the position and at square 98 in the mirror):
  - There is exactly ONE lethal attacker in each spelling, and they are mirror
    images of each other: square 43 in the position, square 56 in the mirror.
  - `classifyApproach` returns the same class (RETREAT) and the same cost
    (`d = 2`) for both, and `retreats` **0 in the position, 1 in the mirror**.
  - So it is not a choice between attackers. `retreats` is
    `|reach(attackSquare, speed, 1) \ strike[defender]|`, and `attackSquare` is
    "the CHEAPEST square adjacent to the target" — when two adjacent squares tie
    on cost, the scan keeps the first one it meets, and rot180 reverses that
    order. Two different attack squares have two different reach sets.
- The champion never saw this because it ignored `retreats` entirely, so B4
  surfaces a latent asymmetry rather than creating one.
- Proposed: break the attack-square tie in the same frame B2 uses in
  `bestRelocationTarget` — among squares tied on cost, keep the one lowest in
  the MOVER'S OWN corner-relative frame (`s` for White, `99 − s` for Black) —
  behind a sixth `EvalFix` flag (`approachTieOrder`), default off, so
  `hard@desktop`'s hash does not move. `tables/approach.ts` is not this lane's
  file.
- Bounded task before that lands: confirm on the other four ids that the cause
  is the attack-square tie and not the `reach`/`strike` masks themselves; one
  probe per id, no engine.
- Until it lands, `E3.2-CORRECTNESS-ARM.md` §6 carries the residue as a known
  caveat of the bundle.

## A3. The bench gate's rot180 exemption can be narrowed once B2 is default

- `lab/hard-ai/bench/run.ts:86` exempts `EconDelta`, `DepletionWaste` and
  `RelocationDebt` from its rot180 check, and the check reads three position
  files at handicap 0 only.
- With `rot180TieOrder` on, all three agree with their mirror on 1,000 of 1,000
  fuzz positions (0 violations, any feature).
- Proposed, in the order the synthesis §4 asks for: (1) add the four suite
  corpora and handicap 3 to the bench rot180 check; (2) when B2 becomes a
  default, delete the three-feature exemption; (3) until then, run the check in
  both configurations and record both numbers.
- `lab/hard-ai/bench/run.ts` is not this lane's file.

## A4. `design/DEVIATIONS.md` M9 describes the pair count as the fix

- The M9 entry (2026-09-15) records that `anchorsVoidedBy` "always returned 0"
  and that the field was rewritten as a per-pair count. That rewrite is what
  makes `Infiltration` identically zero as a DIFFERENCE, on every legal position.
- The M9 reasoning is right about `anchorsVoidedBy`'s hypothetical question and
  wrong about the replacement: the quantity DESIGN §5.8 asks for is the ANCHORS
  VOIDED, and counting distinct voided anchors avoids both the always-zero call
  and the symmetric pair relation.
- Proposed: when `infiltrationPerAnchor` becomes a default, append a dated M9
  paragraph recording the second correction, with `E3.2-CORRECTNESS-ARM.md` §2
  B3 as the evidence (294 of 1,000 fuzz positions non-zero, median 180 cc,
  10-vs-2 at `fuzz-5150-4-377`). `DEVIATIONS.md` is not this lane's file.
- Note for whoever writes it: `tables/geometry.ts infiltrationAnchors` is
  untouched by this lane. The flag computes the fixed quantity in
  `eval/features.ts` (the field stays available to anything else that reads it),
  so making it a default is a second edit, in `geometry.ts`, that this lane did
  not make.

## A5. DESIGN contradicts itself about rent, and B5 chose a side

- DESIGN §5.8's `stream` formula is `Σ γ^{t+1} × (income_t − upkeep_t) × CC`;
  DESIGN.md:1348 says rent is "charged **once**, as `Rent`". The engine
  implements both, so one crystal per turn of upkeep costs 1.72 × `RENT_PV`.
- `rentOnce` takes DESIGN.md:1348 as the specification and drops the §5.8 leg.
  The alternative reading — keep the leg, delete the `Rent` feature — would
  remove a stage-0 feature and change the lazy stage-1 bound, and no E3.1 finding
  supports it.
- Proposed: whichever way it is settled, DESIGN §5.8's formula line and
  DESIGN.md:1348 must be made to agree in the document, with a dated note. Both
  are in `docs/hard-ai/DESIGN.md`, which no lane may edit.

## A6. MILESTONES M8's pass criterion and the reserve check

- `lab/hard-ai/oracles/economy.ts` now reports `reserveMonotone` /
  `reserveViolations`; it is NOT in M8's pass criterion and sets the exit code
  only under `--require-reserve-monotone`, because with the flags off it is
  `false` (4,102 of 13,183 perturbations at `--positions 2000`) and M8 would go
  red for every milestone downstream.
- Proposed: when `relocationCompare` becomes a default, add
  `reserveViolations === 0` (or a stated ceiling covering the 10 residual
  horizon-edge cases of §2) to the M8 pass criterion in
  `docs/hard-ai/MILESTONES.md`, which no lane may edit.

## A7. The E3 row ledger entry for the correctness row

- `E3.2-CORRECTNESS-ARM.md` §7 is a preregistration DRAFT. E3-PLAN's row ledger
  and the seed rule (`20260930 + ordinal`) live in `E3-PLAN.md`, which no lane
  may edit, and the plan puts this row after row #1/#2.
- Proposed: the coordinator appends the §7 draft as the next ledger row when
  row #1/#2 have reported, fixing the ordinal and therefore the seed, and
  records the openings use (`e1-val2.jsonl` rows 16–31, the second and last E3
  screening block) in `ALLOCATION.md`'s remaining-use table.

## A8. `recall/run.ts` cannot see an `evalFix` arm either

- Lane 5 already recorded that `recall/run.ts:356` builds its own `Evaluator`
  with `DEFAULT_WEIGHTS`, so a `weights` arm is invisible to every recall column.
- The same line, plus its own `allocTables()` at `:354-355`, makes an `evalFix`
  arm invisible: `NodeTables.evalFix` is `null` there whatever `--arm` says.
- Proposed with lane 5's amendment, in one edit: build the recall evaluator and
  its tables from `hardEnginePatch(arm)`'s resolved config, so both arm families
  reach the recall instrument. `lab/hard-ai/recall/run.ts` is not this lane's
  file; no result in this lane depends on it.

## A9. For `.claude/napkin.md` (not this lane's file)

Five things this lane learned the hard way; the coordinator owns the napkin.

- `eval/invariants.ts bit(i)` is `1 << (i - 1)`, so invariant 3 is bit index 2.
  Reading `(bits >> 3) & 1` gives invariant 4 and makes a real change look like
  no change — it cost one wrong measurement here (965 firings read as 1,073).
- `tests/ai/hard/p6-stoppable-generation.test.ts` asserts a 15 s WALL-CLOCK
  allowance. Under a whole-directory `vitest run tests/ai/hard` (46 files in
  parallel, other lanes busy) it measured 22.9 s and failed; alone on the same
  branch it passes. Re-run a wall-clock failure in isolation before calling it a
  regression.
- To run a lab script at an OLD commit without a second worktree:
  `git archive <sha> | tar -x -C <scratch>` and symlink `muju/node_modules` into
  the extracted tree. `hard:cross-commit --states-in` then compares two engines
  on byte-identical positions, and no other worktree is touched.
- `ladder/identity.ts canonicalJson` drops keys whose value is `undefined`. An
  OPTIONAL config block that no profile writes therefore leaves the champion's
  hash alone; writing `{}` or `{flag: false}` into a profile would move it.
- `eval/features.ts extract` writes `f(me) − f(them)` for the INVARIANT
  penalties too, with a negative weight: the side that carries the bit reads
  `+1`, not `−1`.
