# M6 bootstrap contract proposal — 2026-09-19

**Proposal for review before implementation or tuning.** This is an accounting-first, deliberately sparse bootstrap; it is not a strength claim or an accepted floor. It supplies a concrete nonzero pending-asset value before self-play without inventing empirical probabilities or carrying unsupported old tactical coefficients forward.

Source: `work/deevgames-phasing-m4`, HEAD `5d31740791b8c3aa17797a29f9a5eac87a85b844`; read AGENTS/CONTENT_DAG, `work/m6-continuation-map.md`, and frozen plan §4e. The map describes an earlier source revision; hashes at the end pin the actual code inspected for this proposal. Only this work document was written for M6. No engine, canonical probe, suite, corpus, tuning, val, sealed, or outcome command ran. No coefficients below are inferred from Gate 1, M4 acceptance, game results, or prior fitted weights. Source discovery returned some historical file paths; those data files were not opened.

## 1. Freeze the units and accounting identity

Preserve indices 0–57 and append 58 `PendingValue`, 59 `ArrivalThreat`, 60 `DisruptPressure`, 61 `RentShortfall`; `FEATURE_COUNT=62`. Preserve the invariant block as exactly 20 entries at 38–57. Append all four at stage 2; update bounds before any lazy exit may omit them.

Use 100 centi-crystals (cc) per crystal. Bootstrap live material is each definition’s catalogue purchase cost times 100, exactly the current material prior. BankLiquid and BankExcess both have weight 100, so their existing split at eight is algebraically irrelevant: total cash value is exactly `100 * bank`, with no reactive-purchase option premium. Only spendable bank finances a bill; escrow is an asset, not liquidity.

For each side define:

`V = current live catalogue principal + 100*bank + pending principal + live-origin forecast + discounted pending-origin service`.

Each principal and each future income/rent/release event has one owner in that identity. A future refund is a transfer from pending principal to bank, not income. Arrival is a transfer from pending principal to live principal, not a second purchase gain. A real BUY decreases bank and creates exactly one equal-cost principal. Consequently BUY, arrival and refund preserve principal alone; mining, rent, unit loss and the explicitly stated service forecast change value. A terminal evaluator result still overrides this static formula.

This proposal changes the **meaning**, not the index, of feature 23 `EconDelta`: it becomes the live-origin, phase-aware net forecast below, in its existing whole-crystal unit. It no longer subtracts the old twelve-turn PST. Feature 5 `PstMine` and feature 1 `Rent` have bootstrap weight zero. This intentionally replaces the two overlapping economy ledgers with one. It requires a new feature/rules schema identity, not just padding a 58-element vector.

## 2. One bounded, declared economic forecast

Retain the existing gamma convention `GAMMA_Q16[k] = round(0.9^k * 65536)` and six future own income closures per side. These are inherited design assumptions, not fitted numbers. A side’s first **not-yet-collected** income closure has ordinal 1; later closures have ordinals 2–6. Do not add a second arbitrary arrival discount: an arrival which misses an existing Act’s income begins earning at ordinal 2, while a commitment in settled Prepare can first earn at the next own Act closure, ordinal 1. The current bank already contains any income collected earlier in Prepare.

The forecast policy is: no MOVE/ATTACK/BUY/PROMOTE; end the current phase, pay legal upkeep with canonical `defaultUpkeepAction(state, false)` when required, and continue alternating. Stop at the first canonical terminal state or once both sides have six future income closures. The reference must use actual canonical transitions, a bounded step counter (a conservatively derived maximum such as 48 phase actions for this horizon), and fail if the bound is exhausted before a legitimate stop. This is a **conditional pass-only forecast**, not a prediction of optimal opposition. Do not award future terminal-win utility from that policy: record its stopping reason and price only events actually reached. Root terminal scoring remains authoritative.

The optimized packed table must reproduce this named policy to the crystal on bounded authored references, including release order and legal terminal stops. Canonical and packed implementations must not share the calculation under test. No default corpus loader is allowed for those checks. The old relocation DP may remain a separately named diagnostic, but its stream/relocation terms have zero bootstrap weight and must not be called this exact reference.

At each future income closure: mine each actual live unit from finite reserves; then determine due rent; then settle a legal keep set. New arrivals join only at their owner’s incoming Act after occupation/elimination checks, resolve as a simultaneous batch against the same board, then heal/reset. Opponent arrivals may precede the current mover’s following arrival; upkeep releases can remove an anchor or obstruction, so a static mask alone does not replace chronological forecast state. Stop immediately if the actual canonical lifecycle terminates before a batch or income event.

Keep two ledgers:

- **Cash-flow ledger:** actual bank, income, refund, paid rent and retained/released bodies after each event. It never enters debt and never spends unresolved escrow. Record `cashBeforeIncome`, `income`, `cashBeforeRent`, `fullArmyDue`, `paidRent`, released IDs, and `cashAfterRent`.
- **Valuation ledger:** discount future earned income and actually paid rent; also subtract the catalogue principal of each root-live body that the declared policy releases, once at its release event. Principal loss must not be hidden merely because rent becomes affordable after releasing a unit. Do not subtract future refund transfers, or add future arrival principal. Do not charge full original rent after a release.

Partition event attribution by root identity: income from a root-live unit belongs to live-origin forecast; income from a root commitment’s eventual body belongs to that commitment’s service. Since legal commitments are tier I and the forecast never promotes, pending-origin bodies owe no rent. All rent and released principal in this policy belong to root-live identities. This identity partition prevents pending mining from appearing in both `EconDelta` and `PendingValue`.

An unpaid current Prepare bill is an immediate event at discount ordinal 0: income was already collected. A future bill following income ordinal k is discounted at k. A settled Prepare phase has no current bill left. This makes promotion after settled rent affect the next bill, never retroactively the bill already paid. A policy-driven release due to an immediate shortfall uses ordinal 0 too.

For valuation, accumulate integer Q16 contributions per event, form the signed side difference, then truncate toward zero at a documented final boundary; never round each side by a different rule. Feature 23 keeps its whole-crystal convention: `trunc((livePVcc_me-livePVcc_other)/100)` with weight 100, so its quantization error is less than 100 cc and exactly antisymmetric. Keep exact per-event ledgers in diagnostics; a rounded feature is not the “to-the-crystal” oracle output. New `PendingValue` uses integer **cc** with weight 1 so small delayed service is not erased by another whole-crystal truncation. Use safe integer multiplication rather than signed 32-bit shifts on unproved large totals.

## 3. Appended feature contracts

### 58 — PendingValue (cc, signed asset difference; bootstrap weight +1)

For each commitment q:

`pendingAsset(q) = 100*paidCost(q) + (1-risk(q))*servicePVcc(q)`.

`servicePVcc(q)` is only its finite, discounted pending-origin mining in the above chronological held policy. It excludes body cost, refund cash, generic spawn area, attack pressure and all other units’ production. Even a presently invalid commitment keeps its full refundable principal until canonical resolution. A currently valid commitment is not treated as a live anchor, blocker or miner now.

Use a deterministic binary **conservative exposure selector**, not a claimed statistical probability: risk is 1 if the commitment fails the named no-move arrival projection, or a bounded legal enemy move ending before its arrival can invalidate the target/all supporting rectangles; otherwise 0. Check every alternative anchor. Enemy occupation of the target itself is sufficient; voiding one of several surviving rectangles is insufficient. Count only a legal endpoint reachable in the actually available intervening Act: current enemy Act uses remaining AP/current flags; a future enemy Act uses the canonical reset and full AP; settled enemy Prepare immediately preceding the victim’s incoming Act provides no new enemy movement window. If the movement-only calculation omits captures, combinations or new arrivals, disclose that omission; risk 0 means “not marked by this probe,” never proved safe. An unresolved/capped optional probe uses risk 1 and records the cutoff; it must not silently become risk 0 or be described as a proved disruption.

This selector discards the vulnerable service estimate, never the refundable principal. It is a hand-declared conservative bootstrap, not a calibrated expected value. Refund eventually restores bank under actual resolution; no fictitious material destruction or second liquidity penalty is charged here.

### 59 — ArrivalThreat (cc, signed opportunity difference; bootstrap weight 0)

Use the declared next-own-Act horizon, with canonical owner healing, actual paid batches, preceding opponent batch when relevant, projected occupancy, and four AP. Identify enemy root-live target identities which the live-plus-arrivals attack construction can remove but its **same-horizon live-only** comparison cannot. For that comparison retain identical projected occupancy and defender state but disable the newly arrived friendly bodies as attackers in the live-only counterfactual; label it a controlled table diagnostic, not a separately reachable position. Count each target’s catalogue principal once. An arrival merely appearing in one chosen plan does not establish necessity if a live-only plan exists. A non-exhaustive table comparison describes table-detected extra opportunities, not a complete kill proof; expose that provenance.

Implement meaningful differential controls, but keep the bootstrap coefficient zero. The old `HangingBuy` slot29 may be renamed/redefined to hanging-to-arrivals under the new schema; an arrival-specific victim penalty and an attacker bonus are the same event viewed twice. Until one disjoint signed ownership rule is selected, neither it nor ArrivalThreat gets a guessed nonzero bonus. Current kills still affect actual search material and terminal values.

### 60 — DisruptPressure (cc, signed conditional denied-service opportunity; bootstrap weight 0)

For an acting side, enumerate the bounded legal single-mover endpoint opportunities before the enemy’s next arrival. For each endpoint sum the **undiscounted-by-risk** servicePV of currently valid enemy commitments that it would invalidate, each commitment once and only after checking all alternative anchors. Take the maximum across mutually exclusive endpoint choices; do not sum every possible move or price refunded principal as captured material. Preserve root live occupancy and simultaneous-batch semantics. Mark the probe’s limitation to one movement continuation explicitly.

Bootstrap zero is intentional: PendingValue already removes exposed service via its binary selector. Adding the same denied-service opportunity as a separate gain would count it twice. This feature remains available for a later preregistered disjoint residual model; no coefficient is derived from search outcomes now.

### 61 — RentShortfall (crystals, signed missing-spendable-cash difference; bootstrap weight 0)

At the side’s first unpaid rent event, define `reserveRequired=max(0, due_next-income_before_that_bill)` and `shortfall=max(0,reserveRequired-spendable_before_that_income)`. An arrival refund may enter spendable cash **only after the projected arrival boundary actually resolves**; pending principal never finances an earlier bill. Current unpaid Prepare uses income=0 and the current bank. Current Act uses current remaining-board income before rent. Waiting side/settled Prepare use chronological future arrival, income and rent.

Record required reserve and missing amount separately; the feature is the latter. Replace fixed-six cash thresholds in generator/invariant integrations with this named reserve, with explicit horizon and a narrow lease; do not turn a diagnostic missing amount into a hard purchase-legality filter.

Bootstrap zero avoids charging a second speculative liquidation loss: the forecast already subtracts actually released catalogue principal and pays rent once. “One missing crystal costs one crystal of material” is not a universally exact utility claim, because releasing a costly liability can improve future cash flow. The exact shortfall remains tested and reported even with zero score weight.

## 4. Complete bootstrap weight proposal

Propose feature schema `muju-phasing-eval-1`, bootstrap label `phasing-accounting-bootstrap-v1`, nonzero weights version 2 **subject to coordinator collision check**. Freeze a 62-element all-zero vector, then assign only:

| Index | Feature | Weight | Reason |
|---|---|---:|---|
| 0 | Material | 100 (informational) | Actual evaluator uses the 18 catalogue-cost material entries directly. |
| 2 | BankLiquid | 100 | One spendable crystal is 100 cc. |
| 3 | BankExcess | 100 | No arbitrary discount on cash above eight. |
| 23 | EconDelta, new contract above | 100 | One whole crystal of net future cash/principal change is 100 cc. |
| 58 | PendingValue, cc unit | 1 | Full escrow plus only its separately attributed delayed service. |

All other 57 slots are zero. Explicitly preserve this as a deliberately sparse reference baseline; it may fail a preregistered M5 performance floor, in which case record that failure rather than fitting new coefficients to the floor or declaring it release-ready. Full-strength tuning remains a separate authorized stage. The entire vector, material vector, discount convention, schema, source/config identity and goldens must be pinned before any data generation.

Specific reasons for zeroing old terms:

- Rent1/PstMine5/old Econ correction overlap is replaced by the single forecast. DepletionWaste24, RunwayCliff25, Insolvency26 and RelocationDebt27 must not re-price already counted finite mining, unpaid bills or policy releases. Relocation is outside this bootstrap policy.
- BankConvertible6, ElementCoverage22, SpawnZero9/Inv1, and HomeBare/Inv11 contain future recruitment or old cash-option assumptions. SpawnArea/Reserve/AnchorDepth/Infiltration and home countdown/plug/rescuer quantities can remain tested diagnostics, but their old cc multipliers have no hand-derived Phasing valuation here.
- Hanging28/HangingBuy29, Exposure17, approach/strand/cleave/kill bonuses30–34, and structural geometry35–37 overlap material consequences and each other. Their tables remain useful to search; assigning them zero leaf weight avoids importing old non-accounting coefficients without derivation.
- Inv5/17 have stale immediate-live-placement semantics; Inv7/14/19 have wrong old rent/threshold/bank premises; Inv18 remains protocol-only zero and must never punish a legal END_PLACE; Inv15 remains structural zero. Other invariant indicators are not universally priced utility facts. Preserve indices and independently port their semantics/tests, but do not carry old penalties by habit.
- HomeInvaded4, HomeThreat13 and similar urgency values are deliberately not a substitute for canonical terminal/prover/search handling. This is a limitation of the sparse bootstrap, not a claim that home threats lack value. DrawPressure18/Inv16 also remain zero; `leadCc` must still include pending principal if used as a diagnostic so BUY does not manufacture a material deficit.

Freeze weights2/3 at100 and58 at1 during any initial Texel integration unless the accounting model is explicitly revised: freely scaling feature58 scales escrow principal as well as service and breaks the full-refund contract. Do not silently allow tuning to violate the prerequisite that made the bootstrap coherent. Material parameters may be a future distinct utility model, but bootstrap conservation claims apply to catalogue priors only.

## 5. Required pre-outcome controls and acceptance boundaries

Authored canonical checks must cover BUY debit/pending principal, safe arrival transfer, invalid refund transfer, sibling non-anchoring, cross-owner arrival precedence, zero-bank paid arrival, disrupted service without lost escrow, alternative anchors, no intervening movement window, paid/unpaid Prepare versus Act with equal banks, income enabling rent, no double income, promotion changing only a future bill, finite depletion, deterministic forced release/principal loss, and first terminal stopping. Mirror each timing/control across sides. No pending body may leak into current live features.

Add independent score-ledger identities with the bootstrap: principal-only BUY/arrival/refund conservation; exact named mining and paid rent once; counterpart with released material charged once; harmless cash split at eight; signed-vector antisymmetry; full/staged score agreement and lazy-bound conservatism for unequal pending sets. Bounds must include up to all pending escrow, all finite remaining resource service and all forecast releases; derive from supported representation/catalogue limits, not empirical maxima. Temporarily full evaluation is preferable to an unproved early-exit bound.

An optimized economy output matching a named pass-only reference is correctness evidence, not strategic superiority. M5 classifications/floors must freeze independently, and any canonical unknown/invalidity remains veto/indeterminate per contract. No new floor is proposed here. No opening or self-play generation is authorized by this document. BK03 compatibility, feature/weight schema rejection, dev-only pre-open allowlisting, selected weight identity and val/sealed boundaries remain coordinator prerequisites from the continuation map.

## 6. Bounded source ownership proposal

1. **Economy/reference owner:** `tables/economy.ts`, a new pure lower-layer forecast/arrival helper if needed, `lab/hard-ai/oracles/economy.ts`, and unique economy fixtures/tests. Own chronological cash flow and principal attribution; no eval weights or feature indices. First publish `EconResult` additions (livePVcc, per-root-commitment servicePVcc, phase-specific reserve/shortfall and event diagnostics), with exact side/horizon conventions.
2. **Features/identity owner:** `eval/features.ts`, `eval/evaluate.ts`, `eval/weights.ts`, config’s checked feature count/schema, serializer/load rejection, feature grouping and tests. Own 58–61, vector units, new23 semantics, bounds, bootstrap vector and immutable hash. Wait for economy API; do not duplicate its ledger.
3. **Provenance/invariant owner:** `tables/context.ts`/kill arrival-dependence additions only under an explicit lease; `eval/invariants.ts`; the narrow purchase cash-threshold integration; corresponding unique tests. Own live-only/paid-arrival comparisons, phase-aware shortfall consumers and removal of stale cash/immediate-buy premises. Coordinate any `core/spawn.ts` helper with economy owner so neither edits it concurrently.
4. **Coordinator:** contract approval, final file leases, shared-queue test scheduling/source freezes, global feature/schema/book/tuner integration, independent review and DAG completion record. Runtime source/library/book work is separate from generating or reading data. Only start scoped execution after interfaces settle; no private queue or parallel mutation during evidence runs.

Suggested dependency order: agree ledger/API and bootstrap schema → independent canonical economy reference → packed implementation → feature extraction/bounds/weights → invariant consumers → focused tests/types/dependencies and independent review → freeze hand vector/M5 contract/goldens → separately authorized dev-only data/tuning. This document chooses no engine result, golden numeric score or suite floor.

## Source pins

All paths below relative to the reviewed M4 checkout.

| Path | SHA-256 |
|---|---|
| muju/src/ai/hard/eval/features.ts | d09b2ec2aec09690dcd3e7b3c178a048b41ffffa40c83a1ecc696b82ac9837f0 |
| muju/src/ai/hard/eval/weights.ts | 1d70666c7eb2ab109852fa8b75cb6aa7d1be9b992857d3857da4641295f3cf97 |
| muju/src/ai/hard/eval/evaluate.ts | 3cb129d2732ac4d05d33642edb1dd533ed7f164d22bbefde640874e1430bd914 |
| muju/src/ai/hard/eval/invariants.ts | 4ae63feb1b1581b8da186e9ae1b17ff9b0b497e34a8ce26aa431d799d9a38834 |
| muju/src/ai/hard/tables/economy.ts | 9ed1b1ad839ca790ab73ae37698128042453e8b3127e7a8681d853c43c4b2731 |
| muju/src/ai/hard/core/income.ts | ab4052a230479281bb972ba32c39c9b6df22336743f958402710c0fe38194f3e |
| muju/src/ai/hard/core/spawn.ts | b36ee5c74c5a622b4283d24bbc55da7e87beb6be9f0ecd3393f33a4d45fb9075 |
| muju/src/ai/hard/gen/purchase.ts | 0539d2e0816dba24ad082730a4be38626eddbf48069516ef52956db09eb5cbdd |
| muju/src/game/turn.ts | 49513b3f769a8295f002db6d2f9457b7e8eec6af0f4c0f24f1d295c08ff155ce |
| muju/src/game/upkeep.ts | b5f7d8cdab734f42a4686b7ba72d88cc8df4e8757a17e1fd519c2656b7967e57 |
| muju/src/game/summoning.ts | b38f3523a92f4fb264acc0c60aca91795a93a84187287e662d6e66de269b01ce |

Verification performed: read-only source inspection, source SHA-256 inventory and `git rev-parse HEAD`. No test result or runtime parity is claimed. The proposed changes affect Hard evaluation, deterministic AI, strength harness/provenance and their release checks in the DAG; deployment/Academy/current public claims remain outside this proposal and require coordinator disposition rather than an inferred releasegreen statement.
