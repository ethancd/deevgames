# E3 lane 7 — proposed amendments

Lane 7 owns `docs/hard-ai/e3/E3.1-JUDGMENT-CASES.md`,
`lab/hard-ai/audit/judgment-*.ts` and `lab/results/hard-ai-e3/judgment/**`.
Everything below needs a file this lane does not own. Nothing here was applied.
Evidence for each is in `E3.1-JUDGMENT-CASES.md` and
`lab/results/hard-ai-e3/judgment/decompose.json`.

## A7-1 — `suites/run.ts` runs the engine with placeholder weights (E0's I2 again)

**File:** `lab/hard-ai/suites/run.ts:412`.
**Now:** `const patch = hardConfigFor(args.engine…)`.
**Proposed:** `const patch = hardEnginePatch(args.engine…)`.

`hardConfigFor('desktop')` returns `{...DESKTOP}`, whose `weights` field is
PRESENT and is `placeholder-m4`, `version: 0`, all 58 feature weights zero.
`HardEngine`'s substitution at `engine.ts:221` is guarded by
`cfg.weights === undefined`, so it does not fire; measured,
`new HardEngine(hardConfigFor('desktop')).config.weights.label` is
`placeholder-m4` and `new HardEngine(hardEnginePatch('desktop'))…` is
`default-v1`.

E3-PLAN.md's rules section already states the rule this violates: "Any lab
script that constructs an engine goes through `hardEnginePatch`/`createHardBot`
or asserts `weights.version !== 0`."

Measured consequence on the invariants suite at each pair's own 50,000-unit
budget: `invariantsSearched` is **9/20 with the placeholder vector** (which is
exactly the 0.45 `hard:suite` reports) and **6/20 with `DEFAULT_WEIGHTS`**. The
`tactics`, `spawn-strike` and `home-mate` baselines in A6 were measured the same
way and are therefore material-only numbers; A6's thresholds would have to be
re-measured, not merely re-run, which is why this is a proposal and not a fix.
The EVAL reading is unaffected (`run.ts:409` builds `new Evaluator(PAIR_REPLICA)`
with no weights, and `Evaluator`'s constructor defaults to `DEFAULT_WEIGHTS`).

**Owner:** whoever owns `lab/hard-ai/suites/run.ts` plus the A6 baselines.

## A7-2 — "a win is never a miss" does not reach judgment cases

**File:** `lab/hard-ai/exam/run.ts`, the judgment arm of `runExam`.
**Now:** exact rows get `row.passed = (inWitness && !inAvoid) || won`;
judgment rows get `row.matched = preferred && !avoided`, with no `won` clause,
even though `wonOutright` is already computed and stored on the row.
**Proposed:** report a third judgment outcome — `matched`, `unmatched`, and
`wonOutright` — rather than folding a win into either tally, and name the cases
in the artifact the way the exact arm names its adjudications.

Two of the 22 judgment cases are affected today:
`authored-home-mate-cheap-invasion-one-attack-mate-preference` (end key
`ee6291a21d7ef452`, in `avoidKeys`) and `e21-purchase-plus-promotion` (end key
`c2eb8e48fcd82e18`, in neither list). In both the champion's own actions,
replayed through `src/game`, leave `phase: 'victory'` with the mover as
`winner`. `run.ts`'s own header says "A case cannot legitimately ask an engine
to decline winning the game".

Deliberately NOT proposed: silently passing such a case. A judgment match is
not a pass, and adding a win to the match count would launder the same opinion
the header refuses to launder.

## A7-3 — the dead-position proof never reaches a judgment carry

**File:** `lab/hard-ai/exam/seed.ts`.
**Now:** the authored-judgment carry is at `seed.ts:226-254`; the
dead-position proof is at `seed.ts:288-296` and is guarded by
`if (picked.claim !== 'win')` on the EXACT path, after a `continue` the
judgment path never reaches.
**Proposed:** run the same proof before a judgment carry, under the same
`DEAD_CHECK_MAX_ENDS` guard, and record the skip in `seed-report.json`.

Measured with `witness.ts deadPosition` at a 3,000,000-call budget:
`authored-home-mate-clear-an-adjacent-lane-mate-preference`,
`authored-home-mate-clear-an-adjacent-lane-rotated-black-mate-preference`,
`authored-home-mate-zero-attack-occupier-mate-preference` and
`authored-home-mate-zero-attack-occupier-rotated-black-mate-preference` are all
`true`: every one of their 17 or 18 legal turn ends hands the opponent a win on
the spot. Two of them are counted as judgment MISSES and two as judgment
MATCHES in the 4/22 tally, and neither number means anything.

`suites/run.ts` already demotes such a suite row to a coverage row, and
`build-home-mate.ts` already refuses to author one ("there is no correct
defensive turn in a lost position"). This proposal only extends the rule the
repo already holds to the one path it does not cover.

## A7-4 — the invariants fixtures constrain only the mover's bits

**Files:** `lab/hard-ai/suites/build-invariants.ts` (the contract) and the
positions it writes.
**Now:** the header's contract is "`invariantBits(violating, side)` must set
EXACTLY the fixture's own bit" and "`invariantBits(correct, side)` must set NO
bit at all". Measured, that contract holds: 18 of 20 violating members set
exactly their own bit for the mover (inv15 and inv18 set none, as their own
rationales say they must), and 20 of 20 correct members set none for the mover.
**The contract says nothing about the OPPONENT's bits**, and `eval/features.ts
extract` writes `f(me) − f(them)` (DESIGN §5.12.1), so an opponent bit on the
same invariant cancels the penalty outright.

Measured on all 40 members:

- the opponent carries at least one bit on **all 20 correct members**, most
  often invariant 13 (turtle) and 14 (liquidity floor);
- `inv3-retreat-square-violating`: mover `[3]`, opponent `[3, 6, 10, 11, 14, 19]`
  — `f[Inv3RetreatSquare] = 0`, so a −250 cc penalty contributes 0 cc;
- `inv6-fragile-anchor-violating`: mover `[6]`, opponent `[6, 10, 14, 19]` —
  `f[Inv6FragileAnchor] = 0`, so a −120 cc penalty contributes 0 cc;
- `inv14-liquidity-floor`: the pair passes on the opponent's invariant-14 bit in
  the CORRECT member (+200 cc), not on the mover's violation.

**Proposed:** extend the builder's contract to the opponent (`invariantBits(p,
t, 1 − side)` must not set the fixture's own bit on either member), re-author
the two affected boards, and state in DESIGN §5.13 which of the two readings —
the M12 bit gate or the M14 eval comparison — the fixtures are authored for.
The two are measuring different quantities today and only the first is
constrained.

**Not proposed:** editing the fixtures in this lane. E3-PLAN.md forbids
repairing a fixture because the engine disagrees with it, and this is the
adjacent case — the engine and the fixture agree bit for bit, and the
DIFFERENCE the evaluator takes is where they part.

## A7-5 — the economy suite is not in `--all`, and should stay out until it is rebuilt

**File:** `lab/hard-ai/suites/economy.suite.json` and its positions.
**Measured, all 30 rows:** 1 white unit, 0 black units,
`checkVictory(root.board)` = `{status: 'victory', winner: 'white'}` before any
action, every legal turn end `phase: 'victory'`, and neither the `best` nor the
`avoid` key is an end position of any legal turn (0/30 for both; 22 of the 30
enumerations closed inside a 3,000,000-call budget, the other 8 reached
179,942–298,756 ends without the key). `hard:suite` scores it 1.000 (30/30)
with all 30 credited by the won-outright adjudication.

**Proposed:** keep `economy` out of `--all` (A6 already does), and mark the file
in `E1.2-EXAM-SET.md` §1.1 as measuring nothing rather than as "not carried".
If finite crystal reserves are to be examined — EPIC-PLAN §1's row with no case
at all — the positions need a second player, not a repaired key set.

**Not proposed:** deriving new keys for the existing positions. The rationales
are real economic statements (`relocate-fire_1-e`: "east neighbour (reserve 16)
beats west neighbour (reserve 4) by `PST_MINE[fire_1][16] −
PST_MINE[fire_1][4]`") and deserve a corpus built for them.

## A7-6 — two labels the plan's vocabulary does not cover

**File:** `docs/hard-ai/e3/E3-PLAN.md`, lane 7's row.
**Now:** failures are labelled contradictory-preference, weight-scale or
engine-bug (with search-not-eval added in the lane brief).
**Proposed:** add two, both used in `E3.1-JUDGMENT-CASES.md`:

- `eval-blind` — the expected and chosen end positions have IDENTICAL 58-feature
  vectors, so the static evaluation returns the same number for both and no
  weight vector separates them. `weight-scale` is wrong because there is no
  magnitude to lose to, and `search-not-eval` is wrong because the search has
  nothing to disagree with. One case:
  `loss-g2-s20_3_15-A-white-t3`, two distinct `Kpos` values both at 2293 cc.
- `unresolved` — the canonical enumeration hit its call budget without reaching
  the expected end position, so no comparison exists. Three cases
  (`loss-g4-s6_0_4-A-white-t4` and the duplicate pair
  `loss-g4-s6_3_5-A-white-t4` / `loss-g5-s7_3_7-A-white-t4`), at 374,833 and
  337,511 end positions after 3,000,000 calls. Reporting these as
  `engine-bug` — which a three-label vocabulary forces — would be a claim the
  measurement does not support.

## A7-7 — a `package.json` script line for the decomposer

**File:** `muju/package.json`, scripts block (lane 4 owns the one script line it
added; this is a second one).
**Proposed:**

```json
"hard:judgment": "node --import tsx lab/hard-ai/audit/judgment-decompose.ts",
```

Run today as
`node --import tsx lab/hard-ai/audit/judgment-decompose.ts --engine hard@desktop
--stratum dev --work 25000 --no-heavy --out lab/results/hard-ai-e3/judgment`
(7 min 1 s, one process, no heavy slot; `--heavy` takes one when the enumeration
budget is raised).

## A7-8 — the 22 judgment cases cover 20 distinct positions

**File:** `lab/hard-ai/exam/cases/dev.jsonl` (or the extractor that wrote it).
`loss-g4-s6_3_5-A-white-t4` and `loss-g5-s7_3_7-A-white-t4` have the same root
`Kpos` `97c641a8c4838571` and the same `stateDigest`
`906c4ab4c6cba9a7…`; `loss-g4-s6_3_5-B-white-t1` and
`loss-g5-s7_3_7-B-white-t1` have `74b71f89ae7abb64` and
`38c7e20b68460af2…`. Both pairs return the same end key, the same work and the
same depth under the champion.

**Proposed:** report `distinctPositions` next to `judgment.cases` in
`exam/run.ts`'s artifact, the way the ladder reports `distinctGames`. The rate
4/22 is 4/20 on distinct positions, and E2's napkin lesson ("count DISTINCT
positions, not games/turns") applies to this set too.

**Not proposed:** deleting a case. The two openings genuinely transpose and both
losses are real; the count is what needs to say so.
