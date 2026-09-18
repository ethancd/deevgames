# Lane 2 amendment proposals (E3.1 invariants audit)

Files lane 2 does not own. Each item names the file, what lane 2 found, and
what it proposes. Nothing here is applied; the coordinator decides. Evidence is
in `../E3.1-INVARIANTS-AUDIT.md` and
`lab/results/hard-ai-e3/inv-audit/pairs.json`.

## A1 — `src/ai/hard/eval/invariants.ts` header contradicts the code (L2-F2)

- Lines 25-28 say invariants 8 and 9 are "deliberately DISJOINT (a chip with a
  kill available is 8, a chip without one is 9)".
- Line 316 is `if (damagedEnemy || (chipped && !killAvailable)) bits |= bit(9)`,
  so a chip that leaves visible damage while a kill was available sets both.
- Reproduced on a constructed `upkeepPending` variant of
  `inv8-no-pre-adjacency-violating` (`pairs.json` `chipDemo`): bits 8 and 9
  both set, −300 cc instead of −150 cc.
- Proposal, in order of preference:
  - correct the header to say the two limbs are disjoint only on nodes where
    the enemy's damage has already healed, which is every macro node except an
    `upkeepPending` one; OR
  - make the code match the header as an E3.2 arm, default off, by gating the
    `damagedEnemy` limb on `!killAvailable`.
- Either way the DESIGN §5.13 gate ("each fixture sets exactly its own bit")
  still passes: the twenty authored pairs never reach the overlapping case
  (measured, 20/20 clean).

## A2 — `tests/ai/hard/invariants.test.ts:161` asserts a false invariant

- The test title is "8 and 9 split a chip by whether a kill was on the table,
  and never both fire". The three boards it builds cannot reach the
  `damagedEnemy` limb, so the "never both fire" half is never exercised.
- Proposal: whichever way A1 is resolved, add the fourth board (a chip at an
  `upkeepPending` node with a kill still available) and assert the resolved
  behaviour. Lane 2 has the construction ready in
  `lab/hard-ai/audit/inv-pairs.ts chipDemo`.

## A3 — record the DESIGN §5.13 row 3 contradiction in DEVIATIONS (L2-F5)

- DESIGN §5.13 row 3 reads "some own unit with `material ≥ 400` has
  `approach == RETREAT` **and the attacker has `retreats > 0`**".
- `eval/invariants.ts:281-283` never reads `t.retreats`.
- The one fixture authored for invariant 3
  (`inv3-retreat-square-violating`, white `plant_1` on (7,5), turn 6) has
  `retreats === 0`, so the fixture and DESIGN's written test disagree.
- Lane 2 did not edit DESIGN, the fixture or the suite, per the plan's "no
  fixture is repaired because the engine disagrees with it".
- Proposal: the coordinator records the contradiction under M12 in
  `docs/hard-ai/design/DEVIATIONS.md`, naming both sources, and decides in E3.2
  whether the clause or the fixture is the intended rule. Lane 2's reading is
  that `retreats` (escape squares outside our strike map) is the more useful
  quantity and the fixture is the one that should move, but that is a judgment
  for the owner.

## A4 — two candidate E3.2 concepts from the duplication audit

Both change `src/ai/hard/eval/**`, which E3.1 forbids; both are offered as
switchable arms for E3.2, default off, each priced by a screening and a
confirmation row under the plan's rules.

- **A4a: the spawn cliff is priced twice.** `tables/geometry.ts:102`'s
  `zeroCliff` and `eval/invariants.ts:290`'s invariant 1 are the same
  expression, both at −800 (`eval/weights.ts:66,97`). Arm: zero one of the two
  weights and price the arm.
- **A4b: home reachability is priced two to three times.** `HomeThreat` −400,
  `Inv10HomeReachable` −400 and `HomeCountdown` −180 per turn fire on nested
  predicates; measured non-zero together on 11 of the 40 suite positions at
  980-1,160 cc for the one fact. Arm: keep `HomeCountdown` as the graded term
  and zero one of the two −400 step terms.

## A5 — `DrawPressure`'s definition differs from DESIGN §5.12.1 row 18 (L2-F7)

- DESIGN row 18: `sign(v0 + v1 so far) × clock²`.
- `eval/features.ts:293-294`: `sign(leadCc) × clock²`, where `leadCc` is
  catalogue material plus bank only.
- Measured: the two signs disagree on 6 of 40 suite positions.
- Proposal: the coordinator decides whether DESIGN row 18 or the code is the
  intended definition and records it. If DESIGN is intended, the fix is an
  E3.2 arm; if the code is intended, DESIGN §5.12.1 row 18 wants an
  amendment and `eval/invariants.ts:366-372`'s note should say so.
- Related, not proposed as a fix here: the feature is a step in
  `sign(leadCc)`, so the swing across `leadCc = 0` is 1,296 cc at clock 9
  against `Material`'s 100 cc per crystal of catalogue cost. Any E3.2 arm that
  touches this feature should consider a bounded ramp instead of a step.

## A6 — invariant 16 has no "behind and the clock is near 10" half (L2-F7 context)

- SU §7 row 16's second clause ("never force a losing exchange when behind and
  the clock is near 10") is not implemented in `eval/invariants.ts:351` and is
  expressed only through `DrawPressure`'s sign flip.
- Proposal: no code change is asked for in E3.1. The coordinator may want a
  line in the E3.1 summary noting that one authored invariant is half
  implemented by design, so a later reader does not treat it as a bug.
