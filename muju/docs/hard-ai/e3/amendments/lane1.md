# Lane 1 proposed amendments (E3.1 feature semantics audit, 2026-09-17)

Proposals only. Lane 1 owns `docs/hard-ai/e3/E3.1-FEATURE-AUDIT.md` and nothing
else; nothing below has been applied. Every item names the file it would touch,
the evidence in `E3.1-FEATURE-AUDIT.md`, and who would own the change.

Under the E3 plan all of these are E3.2 candidates, i.e. switchable arms
defaulting off, priced by a screening row and a confirmation row. None is a
`src/ai/hard/**` edit in E3.1.

## A. Candidate E3.2 concepts, ranked as lane 1 would rank them

1. **Charge rent once.** `src/ai/hard/eval/features.ts:415` or
   `src/ai/hard/tables/economy.ts:221`. Either subtract the upkeep leg from
   `EconDelta` (make the feature `stream − pstSum + upkeepPV`) or give
   `economyDP` a rent-free `stream` and leave `Rent` alone. Evidence: audit
   §(a) "Rent vs EconDelta", −727 cc per crystal of upkeep against the design's
   −422. Owner: whoever takes E3.2; coordinate with lane 3 (economy audit),
   whose worked numbers should agree before either lands.
2. **Collapse the vulnerability stack.** `features.ts:290, 423-435`. The same
   body is charged through Exposure + Hanging + Approach* + KillAvailable to a
   mean 313 cc against a mean prior of 391 cc. The minimal arm is to make
   `Exposure` count only units NOT already counted by `Hanging`/`HangingBuy`
   (DESIGN §5.12.1 row 17's own rationale is "coarse hanging; refined at stage
   2"), which is a stage-2 subtraction and costs nothing extra to compute.
3. **Restore `Inv3RetreatSquare`'s missing conjunct.**
   `src/ai/hard/eval/invariants.ts:281-283`: add `&& t.retreats[slot] > 0`,
   which DESIGN §5.13 row 3 states and `NodeTables.retreats`
   (`tables/context.ts:103`) already holds. Evidence: 943 of 965 firings are
   the excluded case. This is the cheapest arm in the list — one conjunct — and
   the one with the clearest authored judge.
4. **Price `blocking ≤ 1` once.** `tables/geometry.ts:169` gives `fragility` a
   +2 jump on it, `features.ts:437` charges it again as `BlockingDeficit`, and
   `invariants.ts:300` a third time. Proposal: drop the `blocking` term from
   `fragility` (leaving it as the kill-ability of the deepest anchor, 0..1) and
   keep `BlockingDeficit` as the single blocking term.
5. **Make `Inv4StrandUnpunished` ask its own question.**
   `invariants.ts:284`/`97-110`: `adjacentAttackerKillable` scans enemy units
   ALREADY orthogonally adjacent, but a STRAND attacker is by definition one
   that arrives; 1,693 of 1,747 STRAND units have no adjacent enemy. The
   approach table knows the attacker's post-attack square; exposing it (or the
   attacker slot) would let the invariant test the real punisher. Touches
   `tables/approach.ts`'s output shape, which is a frozen DESIGN §4.8 contract —
   so this needs a DESIGN §4.8 amendment, not just a code change, and should go
   to the coordinator before anyone writes it.

## B. Documentation corrections (no behaviour change)

6. `src/ai/hard/eval/features.ts:28-31` claims `full()` overwrites
   `out[F.Material]` with the weighted value. `evaluate.ts:165-169` copies
   `this.f` unchanged. The comment should say that feature 0 is the catalogue
   prior and that `Σ w·f` equals the score only while `material[d] === cost[d] ×
   100`. Matters to lane 4, whose instrument reconstructs the score from the
   feature vector.
7. `DESIGN.md` §5.12.1 row 11 (`Infiltration`) describes a quantity whose
   symmetric difference is identically zero for every legal position (audit
   §(b)). Either the definition or the weight is wrong; DESIGN is not lane 1's
   file and no lane owns §5.12.1, so this goes to the coordinator as a design
   question, not a code fix.
8. `DESIGN.md` §5.12.1 row 19 (`ActionsLeft`) says "0 at macro nodes". True
   inside the search, not true of `features.ts:296` in general (any phase-1
   node scores ±40 × actions). Worth one clarifying clause.

## C. Requests to other lanes

9. Lane 4 (contributions instrument): please report `Exposure`, `Hanging`,
   `HangingBuy`, `ApproachRetreat`, `ApproachStrand`, `KillAvailable` and
   `CleaveExposure` as a GROUP sum as well as individually — the audit's
   per-unit measurement says the group, not any member, is the size of the
   effect.
10. Lane 4: the rot180 / side-swap checks should also assert the four
    side-asymmetric SOURCES named in audit §(c) (turn flags, `ActionsLeft`,
    `killNow` budgets, handicap), since antisymmetry of `extract` holds
    (0 violations on 1,000 positions) while the two sides are still asked
    different questions.
11. Lane 3 (economy): please independently derive the upkeep leg of
    `econ.stream` and the `waste ≡ 6·Σmine − Σincome` identity on your own
    corpus. Two of this audit's top five findings rest on them.
12. Lane 5 (group ablation): a "no-duplicate-invariants" arm (Inv1, Inv2, Inv3,
    Inv4, Inv6, Inv10, Inv14 off, their feature-side partners left on) would
    price §(a) directly and is cheaper than seven separate arms.
