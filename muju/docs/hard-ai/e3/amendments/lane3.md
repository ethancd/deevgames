# Lane 3 amendment proposals (E3.1 economy audit, 2026-09-17)

Proposals only. Nothing here was applied. Each names the file lane 3 does not
own, the finding in `../E3.1-ECONOMY-AUDIT.md` that motivates it, and the judge
that supports it. All four are E3.2-shaped: a switchable arm, default off,
priced by a screening row and a confirmation row under the E3-PLAN rules.

## A3-1 — stop charging rent twice (finding 1)

- File: `src/ai/hard/eval/weights.ts` (or `src/ai/hard/tables/economy.ts`).
- Problem: `Rent` at −422 is the six-turn present value of one crystal per turn
  of upkeep, and `EconDelta`'s stream subtracts the same standing bill over the
  same six turns at w = 80, for −725.6 cc derived and −742 cc measured against
  a stated `RENT_PV` of 422.
- Options: (a) set `w[Rent] = 0` and let `EconDelta` carry the whole rent PV;
  (b) drop the upkeep leg from `stream` and let `Rent` carry it. Option (b)
  changes `economyStayInPlace`, which is the M8 oracle target, so option (a)
  is the cheaper arm.
- Judge: 3 (DESIGN §5.12.1 row 1's own rationale, "RENT_PV"), plus arithmetic.

## A3-2 — make the mining PV one coefficient, not two (finding 2)

- File: `src/ai/hard/eval/weights.ts` and/or `src/ai/hard/eval/features.ts`.
- Problem: `EconDelta = stream − pstSum` is the design's own double-count
  correction (DESIGN.md:1377, "no double count"), and it is exact only when
  `w[EconDelta] == w[PstMine]`. At 80 against 60 the correction over-shoots by
  a third, and past `ECON_HORIZON` it inverts: crystals a miner reaches on
  own-turns 7–12 are scored at −0.20 γᵗ × 100 cc each (measured −40 cc over a
  mine-1 miner's crystals 7–12).
- Options: (a) tie `w[EconDelta] := w[PstMine]` as one parameter; (b) truncate
  `pstSum` to `ECON_HORIZON` inside `EconDelta` so the subtraction covers the
  same turns as the stream; (c) raise `PST_HORIZON`/`ECON_HORIZON` to agree.
- Judge: 3 (DESIGN.md:1377's own annotation; SU §1.2 on rich-square
  assignment), plus the measured sweep in `lab/results/hard-ai-e3/econ-audit/
  ledger.json` (`reserve-sweep-mine1`).

## A3-3 — relocate on value, not on emptiness (finding 3)

- File: `src/ai/hard/tables/economy.ts:206`.
- Problem: the DP relocates only when `take === 0`, so one residual crystal
  delays a relocation by a whole turn. Measured at
  `lab/hard-ai/exam/cases/dev.jsonl` `loss-g2-s5_0_2-A-white-t4`, White to
  move, turn 4: adding one crystal under White's `water_1` at B2 moved
  projected six-turn income from 25 to 24 crystals and the score by −130 cc.
- Option: trigger when `PST_MINE[def][reserve[c]]` falls below the best
  reachable candidate discounted by its action cost — the comparison
  `bestRelocationTarget` already computes — rather than when the take is zero.
  That also makes `economyDP.stream ≥ economyStayInPlace.stream` no longer
  free, so the M8 oracle's `relocationMonotone` check has to be re-derived
  before the arm is measurable.
- Judge: 4 (the board strictly gained a crystal and nothing else changed).

## A3-4 — one predicate, one penalty (findings 6 and 9)

- Files: `src/ai/hard/eval/weights.ts`, `src/ai/hard/eval/invariants.ts:290`.
- Problem: `SpawnZero` (`geometry.ts:102`, w −800) and `Inv1SpawnZero`
  (`invariants.ts:290`, w −800) are the identical predicate `area == 0 ∧
  bank ≥ 3`, scored twice for −1600 cc. `RunwayCliff` (−600) and `Insolvency`
  (−150 × 5 at `turnsToInsolvency = 1`) likewise both fire on
  `bank + income₁ < upkeep₁`, for −1350 cc.
- Option: zero one weight of each pair rather than change either predicate, so
  the arm is a weight change and the feature vector's shape is untouched.
- Judge: 3 (DESIGN §5.12.1 row 9 and §5.13 invariant 1 state the same
  condition), plus arithmetic.

## Not proposed

- `Inv14LiquidityFloor` (finding 8) tests a state where SU §7.14 forbids a
  spend. Fixing it needs a "spent this turn" fact the packed state does not
  carry at a macro node, so it is a representation change, not a weight change,
  and lane 3 does not have the evidence to price it.
- `DepletionWaste` (finding 4) contradicts SU §1.2 on mining rate, but the
  feature is also the only term that prices idle capacity at all. Lane 5's
  group ablation should say whether the economy group carries strength before
  a lane proposes removing it.
