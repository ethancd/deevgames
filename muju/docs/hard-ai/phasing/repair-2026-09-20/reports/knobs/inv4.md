HEADLINE: Promotions and purchases fail at three separate points in the new Hard engine. Swapping in the old priors roughly doubles buying but does not make it promote.

## Knobs
- w[BankLiquid], w[BankExcess] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:23-24: now 100 / 100 (cash equals units); try 75/50, 50/50 (measured), overshoot 25/0; Spending becomes positive at the leaf. Measured 50/50: promotions 0/12 to 6/12, crystals spent 7% to 18% (32% with K=96).; risk: An overshoot spends into the upkeep bill (RunwayCliff and Insolvency have weight 0 in the bootstrap) and spams fire_1 while purchase plans stay fire-only.
- material[tier-2 defs], material[tier-3 defs] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:506-513 (DEFAULT_MATERIAL_CC, copied at eval/weights.ts:33): now cost x 100 (700-900 / 1500-1700); try x1.25, x1.5 (measured), overshoot x2; A promotion is worth +(mult-1) x cost instead of 0, which beats the -400 rent charge. Measured x1.5: promotions 5/12 (6/12 at K=96).; risk: Over-promotes and bleeds rent. It also revalues enemy tier-2/3 kills. materialIsCataloguePrior (weights.ts:58) becomes false, which is informational only.
- w[Rent] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (unset, so 0; old vector -422): now 0. Rent is already charged about -422 cc per upkeep crystal through EconDelta (tables/phasing-economy.ts:219).; try +200, +422 (cancels the EconDelta rent leg exactly), overshoot +600. If the old priors are restored, set it to 0 instead of -422 to stop charging rent twice.; Removes the fixed -400 cc penalty on every promotion without touching purchase valuation.; risk: At +422 a promotion is exactly neutral and still loses ties; it needs to be slightly positive. An overshoot rewards upkeep for its own sake.
- w[TierClimb] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (feature defined at eval/features.ts:238-251): now 0; try 150, 300 (measured), overshoot 800; Rewards the first body of each element to reach a new tier. Measured 300: promotions 3/12.; risk: Pays only once per element per tier, so it caps near 6-12 promotions per game. An overshoot forces early promotions onto bad bodies.
- old tactical/home block (HomeInvaded, HomeThreat, HomeCountdown, HomePlug, HomeRescuers, Hanging, KillAvailable, Exposure, SpawnZero, ...) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; values from git show 43b87b6:muju/src/ai/hard/eval/weights.ts: now all 0; try old values (-4000/-400/-180/220/90/-50/35/-20/-800); also x0.5 and x2; Measured as the whole old vector: bodies 7 to 16, promotions 0 to 1 per 12 positions. It mainly addresses the home-checkmate losses and gives buys non-zero value.; risk: Rent is charged twice unless w[Rent] is zeroed. The values were tuned for Standard, not Phasing (see M6-BOOTSTRAP-CONTRACT.md).
- w[PendingValue] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:26: now 1 (the feature is already in cc, so 1 means 100%); try 2 is the only available integer step and is itself the overshoot; Every pending body is worth twice its price at the leaf.; risk: Very coarse: integer weights on a cc-valued feature allow no 1.25x. Prefer lowering the cash weights.
- w[EconDelta] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:25: now 100; try Leave alone; do not lower it by itself; Measured at 0: the promotion difference goes from -400 to 0 (still loses ties), but bodies bought fall from 7 to 4 because the service-PV reward disappears.; risk: A counter-productive knob.
- cfg.gen.K (DESKTOP_SHAPE.K) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:574: now 24 (kInterior 16); try 48, 96 (measured), overshoot 200; Multi-body buy turns stop being displaced: searched lists containing a multi-body BUY rise from 1/12 to 5/12 (bootstrap). Bodies 7 to 11 (bootstrap) and 16 to 28 (old priors); promotions 1 to 4 (old priors).; risk: Average depth 1.83 to 1.08 at 100k work. The engine already reaches only depth 1-2 at 1.5 s.
- within-turn scorer (SearchContext.score) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:355-360; beam cut at gen/generate.ts:892-928: now stage0 + stage1, which excludes PendingValue (#58, stage 2). Each BUY reads as -cost x 100 cc in the ordering.; try Code change: add CC x sum of the mover's pendCost to the score, or reserve N beam slots for PURCHASE/PROMOTION-flagged turns per Act line.; Removes the ordering penalty at K=24 with no depth cost. Expect the multi-body-BUY coverage seen at K=96 (5-10 of 12) without widening the beam.; risk: Changes the hard@desktop identity hash and the determinism pins. It needs its own ablation arm.
- purchase.maxPlans / keepPerMultiset / maxMultisets @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:543; loop at gen/purchase.ts:441-461; ceiling MAX_MULTISETS=64 at purchase.ts:70: now 12 / 3 / 35. With bank >= 14 that yields only 1-4 fire_1, max spend 12.; try maxPlans 36 + keepPerMultiset 1 (measured), maxMultisets 64, overshoot maxPlans 200 (REFERENCE_PLACE_PLANS). Better: enumerate multisets by score rather than cheapest-first depth-first order.; Measured with K=96 and maxPlacePlans 32: bodies 22 to 28, non-fire bodies 1 to 12, spend 32% to 39%.; risk: More Prepare plans per Act endpoint costs work. One position reached depth 0 at 100k. maxBodies is hard-capped at 4 (purchase.ts:66), so buys still top out near 20 crystals per turn.
- cfg.gen.maxPlacePlans (placePlansRoot / placePlansInterior) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:574; used at gen/generate.ts:563-564: now 16 / 8; try 32/16, overshoot 64/32; Buy-plus-promotion combos (which score about -362 below purchase-only combos) stop being cut in buildCombos.; risk: Roughly linear work per Act line.
- promotion mission gate (bestMission) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:147-198, 252-253: now Only FORTIFY/SURVIVE/ANCHOR/INCOME/REACH: 51 legal promotions produced 8 candidates.; try Code change: a fallback STRENGTH mission (benefit = attack/defence gain x ACTION_VALUE_CC) so every legal promotion is emitted up to maxPromotions=8.; Lifts the ceiling: 4 of 12 positions currently have no PROMOTE turn at any K, so no weight setting can promote there.; risk: More combos compete for maxPlacePlans and K; pair it with the scorer fix.
- RENT_PV term in the promotion ordering score @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:255-256 (RENT_PV=422 at core/income.ts:47): now 422 x extra upkeep, which makes REACH -362 cc and SURVIVE -22 cc; try 211, 0 (ordering only; keep the eval charge); Promotion combos rank level with purchase-only combos in buildCombos instead of below them.; risk: Ordering only, so it has no effect until the leaf eval stops scoring promotions at -400.
- pending risk rule (service PV dropped when at risk) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/pending.ts:79, 96-97, 116: now All-or-nothing: if any single enemy mover could void the commitment, the purchase is worth exactly 0 (9 of 12 positions).; try Code change: credit a fraction (25%, 50%, overshoot 100%) of service PV when at risk; Buys become strictly positive rather than tie-losers against an aggressive opponent.; risk: Over-credits buys that will be disrupted and refunded (a tempo loss, not a material loss).
- purchaseWeights.liquidityCc / safeCc @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:516-527 (used at gen/purchase.ts:210, 373): now 50 / 100; try 0 / 0, overshoot -50; Only reorders purchase plans among themselves. A minor lever, worth adding to a random sweep.; risk: Low.

## Findings
- Promotions mostly fail at (c): the leaf eval scores every generated promotion at exactly -400 cc (once -300), never above 0. The engine promoted in 0 of 12 positions. (I compared each promotion-bearing candidate with the identical turn without the PROMOTE: 860 pairs across 12 positions, median difference in static eval -400, maximum 0. The material gain equals the bank loss (weights.ts:22-24, features.ts:188-191), so stage 0 nets to zero. EconDelta then charges the new upkeep: phasing-economy.ts:219 subtracts paidRent at gamma 0.9 over 6 turns, which is 4.22 crystals, truncated to 4 at features.ts:506 and multiplied by w=100. With w[EconDelta]=0 the difference becomes exactly 0. Every feature that could repay a promotion has weight 0 (weights.ts:20-28).)
- Promotions are also (a) never generated for most legal cases: 51 legal promotions across the 12 positions produced 8 candidates. (planPromotions only emits a slot when bestMission finds FORTIFY, SURVIVE, ANCHOR, INCOME or REACH (promote.ts:147-198; `if (mission < 0) continue` at :252-253). There is no attack or general-strength mission. Five of 12 positions had 0 planned at the pass-Act Prepare endpoint. Four of 12 had no PROMOTE turn even with K=1200. maxPromotions=8 (config.ts:552) never binds. The ordering score is benefit - 422 x extra upkeep (promote.ts:254-256): REACH scores -362 cc, SURVIVE -22 cc. Promotion combos therefore rank below purchase-only combos in buildCombos (generate.ts:634-695), which is cut at maxPlacePlans 16 (config.ts:574).)
- Purchases fail at (b): the K=24 beam is cut by a score that cannot see pending bodies, so each BUY costs -300 cc per fire_1 (its price x 100) in ordering while the leaf eval values it at 0 to about +370 cc. (Turn.gainCc = ctx.score (generate.ts:879) = stage0 + stage1 only (engine.ts:355-360). PendingValue is feature 58, which is stage 2 (features.ts:131, 153). offer() displaces the lowest gainCc and ties lose (generate.ts:910-918). Measured under the bootstrap: median order difference per body -300, median static difference 0 (up to +585). The best-static BUY turn was in the K=24 list in 2 of 12 positions (ranks 200-507 of 250-530 in four positions). Only 1 of 12 searched lists had a multi-body BUY turn, versus 5 of 12 at K=96 with the same weights.)
- Purchases also meet (c): the bootstrap values a BUY at exactly 0 in 9 of 12 positions, and the root breaks ties toward not buying. (PendingValue = principal + service PV, and service is dropped whenever the commitment is flagged at risk (pending.ts:79, 96-97, 116). A lone enemy mover able to void the spawn rectangle is enough to set the flag. Principal exactly cancels the bank loss. rootIteration keeps the first candidate on strict `score > best` (pvs.ts:873), and scoreTurns orders by within/16 (order.ts:419-423), so the plain turn comes first. Result: at most 1 body per turn, 7 bodies over 12 positions, about 21 of 284 available crystals (7%).)
- (d) A generator cap is independent of the weights: with bank >= 14, every purchase plan is 1-4 fire_1 bodies, so a turn can spend at most 12 crystals on buys. (purchaseMultisets enumerates depth-first from the cheapest unit (purchase.ts:145-159). planPurchases walks the multisets in that order until `written < limit` = maxPlans 12 (purchase.ts:441-461), with keepPerMultiset 3 (config.ts:543). That leaves only [f], [ff], [fff], [ffff]. I printed the plans at bank 39, 38 and 14: all 11 plans are fire_1 and the top spend is 12. At bank >= 14, all 35 multisets contain a fire_1. In the first six runs at most 2 of up to 31 bodies bought per variant were non-fire; the rest were fire_1.)
- Swapping in the old hand priors (43b87b6) alone more than doubles bodies bought (7 to 16) but yields 1 promotion in 12 positions and spends about 18% of the bank. (Old priors at K=24: engine turn has PROMOTE 1/12, BUY 8/12, about 52 of 284 crystals. Promotions remain negative: median static difference -172 (above 0 in only 1 of 8 positions, though the maximum exceeds 0 in 7 of 8). Rent is charged twice, once by w[Rent]=-422 and again by the rent leg of EconDelta=80. The ordering penalty persists at -108 cc per body, and the best-static BUY turn is in the K=24 list in only 4 of 12 positions. Old priors at K=96: PROMOTE 4/12, 28 bodies, about 35% spent.)
- Weights alone can make the engine promote when tier is valued above its price or cash below a unit-crystal; buying volume additionally needs the beam or purchase plans widened. (Same 12 positions, fixed work 100k. boot+cash50 (BankLiquid=BankExcess=50): PROMOTE 6/12, 9 bodies. boot+tier-2/3 material x1.5: 5/12, 7 bodies. boot+TierClimb 300: 3/12, 7 bodies. boot+EconDelta 0: 1/12, 4 bodies (worse). boot+cash50+K96: 6/12, 22 bodies, 32% spent. Adding maxPlans 36, keepPerMultiset 1 and maxPlacePlans 32: 5/12, 28 bodies (12 non-fire), 39% spent. Promotions never reached 8/12 because 4 of 12 positions generate no PROMOTE turn at all.)
- Widening the beam costs search depth at fixed work. (Average depth fell from 1.83 (K=24) to 1.08 (K=96) at 100k units. One position under old+K96+plans completed no depth at all. I did not measure match strength; these are single-turn decisions on 12 replay positions, not ladder results.)

## Report
## What I ran

All work is in scratch; nothing in the repo was touched.

- Main probe: `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/promo-probe/probe.ts`
- Helpers in the same directory: `plans.ts`, `multisets.ts`
- Outputs in the same directory: `runA.txt`, `runB.txt`, `runC.txt`, `runD.txt`, `runE.txt`, `runF.txt`, `runG.txt` and `report-*.json`

The probe took 12 real positions from today's replays: 10 from `h2h-desktop-vs-aiv2hardturn-w1500` and 2 from `w1500-desktop-vs-Rush`. Each position is the hard@desktop seat at the start of its Act, with bank >= 4 and at least one legal PROMOTE after a pass-Act plus default upkeep. Positions were rebuilt with `lab/hard-ai/analyze/replay.ts` (`reconstruct`), under `withMatchRules`.

For each position and variant the probe did four things:

1. **Production list.** Built a `HardEngine` with `hardEnginePatch('desktop', weights)` and replayed the root prologue (`pack`, `PROVER_FULL`, `buildSearchTables`, `generateAt`) to get the K=24 candidate list.
2. **Unbounded list.** Repeated with `gen.K=1200` to see what `offer()` had displaced. With K=1200 `tuneKeep` also retains up to 64 Act lines instead of 24, so this list is a superset of what production offers, not only the cut candidates.
3. **Static eval.** Applied every candidate with `makeTurn` and took `Evaluator.full` from the root's side. Each PROMOTE or BUY turn was paired with the identical turn without it, to get a marginal value.
4. **Real search.** Ran `searchTurn(state, {work: 100000, expose: true})` and read the chosen actions.

One thing to know about the numbers: the searched scores exposed for non-best candidates are fail-hard bounds equal to alpha. So I compare static evals and the chosen turn, not per-candidate search scores.

## Verdict

**Promotions fail mainly at (c), and at (a) for about 84% of legal promotions.**

- **(c) scored negative by the leaf eval.** Under the bootstrap every promotion is worth exactly -400 cc relative to the same turn without it: 860 sibling pairs, median -400, maximum 0. The material gain (`promoCost` x 100) equals the bank loss (weights.ts:22-24, features.ts:188-191). EconDelta then charges the new upkeep: phasing-economy.ts:219 subtracts `paidRent` at gamma 0.9 over six turns, which is 4.22 crystals, truncated to 4 at features.ts:506 and multiplied by 100. With `w[EconDelta]=0` the difference is exactly 0. No feature that would repay a promotion has a non-zero weight.
- **(a) never generated.** `bestMission` (promote.ts:147-198) admits only FORTIFY, SURVIVE, ANCHOR, INCOME and REACH. Across the 12 positions, 51 legal promotions became 8 candidates. Five positions had none at the pass-Act endpoint, and four had no PROMOTE turn even at K=1200.
- **(b) displaced from the beam matters once (c) is fixed.** The best-static PROMOTE turn was in the K=24 list in only 2 of the 8 positions that generated one.

**Purchases fail at (b) and at (c), plus a generator cap (d).**

- **(b) displaced from the beam.** The beam is cut on `gainCc = stage0 + stage1` (generate.ts:879, engine.ts:355-360). PendingValue is a stage-2 feature, so each BUY reads as -300 cc per fire_1 in the ordering while the leaf values it at 0 to about +370 cc. The best-static BUY turn was in the K=24 list in 2 of 12 positions. A multi-body BUY appeared in only 1 of 12 searched lists.
- **(c) exactly neutral.** In 9 of 12 positions a BUY is worth exactly 0, because service PV is dropped when the commitment is flagged at risk (pending.ts:79, 96-97, 116). The root keeps the first candidate on strict `score > best` (pvs.ts:873), and plain turns are ordered first.
- **(d) structural cap.** With bank >= 14 the only purchase plans are 1-4 fire_1 bodies, so a turn spends at most 12 crystals on buys. This comes from the cheapest-first depth-first enumeration (purchase.ts:145-159), the in-order `written < limit` loop (purchase.ts:441-461) and `maxPlans 12, keepPerMultiset 3` (config.ts:543). I confirmed it by printing the plans at bank 39, 38 and 14.

## Do the old priors alone flip it?

Partly for buying, not for promotion. All rows are 12 positions at fixed work 100k.

| variant | turns with PROMOTE | turns with BUY | bodies (non-fire) | ~crystals spent of 284 | avg depth |
|---|---|---|---|---|---|
| bootstrap (shipped) | 0/12 | 7/12 | 7 (0) | 21 (7%) | 1.83 |
| old priors 43b87b6 | 1/12 | 8/12 | 16 (0) | 52 (18%) | 1.83 |
| bootstrap + K96 | 0/12 | 8/12 | 11 (1) | 34 (12%) | 1.08 |
| old priors + K96 | 4/12 | 10/12 | 28 (1) | 100 (35%) | 1.08 |
| boot + cash 50/50 | 6/12 | 8/12 | 9 (2) | 52 (18%) | 1.83 |
| boot + cash50 + K96 | 6/12 | 11/12 | 22 (1) | 91 (32%) | 1.08 |
| boot + tier-2/3 material x1.5 | 5/12 | 6/12 | 7 (1) | 41 (14%) | 1.83 |
| boot + mat x1.5 + K96 | 6/12 | 10/12 | 15 (0) | 69 (24%) | 1.08 |
| boot + TierClimb 300 | 3/12 | 7/12 | 7 (1) | 33 (12%) | 1.83 |
| boot + EconDelta 0 | 1/12 | 4/12 | 4 (0) | 16 (6%) | 1.83 |
| old + cash 50/10 | 2/12 | 8/12 | 18 (0) | 62 (22%) | 1.92 |
| old + cash50 + K96 | 4/12 | 11/12 | 31 (1) | 109 (38%) | 1.08 |
| boot + cash50 + K96 + maxPlans 36, keepPerMultiset 1, maxPlacePlans 32 | 5/12 | 11/12 | 28 (12) | 112 (39%) | 1.08 |
| old + K96 + same plan knobs | 3/12 | 10/12 | 33 (14) | 118 (42%) | 1.00 (min 0) |

Under the old priors promotions are still net negative: median sibling difference -172, above 0 in 1 of 8 positions, though the maximum exceeds 0 in 7 of 8. Rent is charged twice, by `w[Rent]=-422` and again by the rent leg of `EconDelta=80`. The ordering penalty per body is still -108 cc.

## Per-position table, bootstrap weights

Columns:
- **bank** is bank at Prepare.
- **promos** is legal promotions to planned candidates.
- **PROMOTE** and **BUY** are turns in the K=24 list / unbounded list; the BUY column shows multi-body turns in parentheses.
- **best PROMOTE** and **best BUY** are order score, rank, whether it is in the K=24 list, and static eval.
- **plain** is the best plain turn's static eval.
- **dS promo** and **dS buy/body** are marginal static differences, median/max.
- **engine** is depth, promotions, bodies bought.

| pos | bank | promos | K24 n (forced) | PROMOTE | BUY | best PROMOTE | best BUY | plain | dS promo | dS buy/body | engine |
|---|---|---|---|---|---|---|---|---|---|---|---|
| h2h g3-s4_0_8-B t3 | 14 | 5 to 1 | 27 (3) | 4/179 | 12 (0)/357 | -1300, #312, no, 1399 | -1600, #406, no, 2209 | 800 | -400/-400 | 366/512 | d2 P0 B1 |
| h2h g3-s4_0_8-B t7 | 39 | 6 to 0 | 29 (5) | 0/6 | 1 (0)/279 | -1000, #112, no, 5700 | -700, #39, no, 6000 | 6000 | -300/-300 | 0/0 | d2 P0 B0 |
| h2h g4-s260_0_37-A t3 | 14 | 5 to 1 | 27 (3) | 5/98 | 6 (0)/218 | 200, #206, no, 3065 | -100, #242, no, 3774 | 2200 | -400/-400 | 384/585 | d2 P0 B1 |
| h2h g4-s260_0_37-A t6 | 34 | 5 to 0 | 28 (4) | 0/0 | 2 (0)/492 | none generated | -100, #507, no, 4553 | 4300 | n/a | 0/309 | d2 P0 B0 |
| h2h g4-s400_0_30-B t3 | 14 | 3 to 1 | 27 (3) | 13/13 | 11 (0)/12 | -600, #1, yes, -300 | -900, #14, yes, 0 | 400 | -400/-400 | 0/0 | d2 P0 B0 |
| h2h g5-s145_0_31-A t3 | 10 | 2 to 1 | 27 (3) | 12/72 | 11 (0)/271 | -100, #14, no, 721 | -800, #245, no, 1846 | 700 | -400/-300 | 0/504 | d2 P0 B1 |
| h2h g5-s145_0_31-A t6 | 20 | 2 to 1 | 25 (1) | 4/118 | 2 (0)/349 | -1200, #122, no, 1880 | -1600, #328, no, 2312 | 2000 | -400/-400 | 0/309 | d2 P0 B1 |
| h2h g5-s485_0_15-B t3 | 14 | 5 to 0 | 25 (1) | 0/0 | 5 (0)/220 | none generated | -900, #200, no, 3238 | 2000 | n/a | 347/422 | d2 P0 B1 |
| h2h g5-s485_0_15-B t7 | 38 | 5 to 0 | 28 (4) | 0/0 | 5 (0)/385 | none generated | 700, #35, no, 5989 | 5900 | n/a | 0/89 | d2 P0 B1 |
| h2h g6-s305_0_32-A t3 | 9 | 6 to 1 | 131 (107) | 103/295 | 19 (13)/854 | 500, #339, no, 4243 | 200, #627, no, 4852 | 3900 | -400/0 | 0/422 | d1 P0 B0 |
| rush g3-s570_0_12-A t8 | 31 | 3 to 2 | 37 (13) | 16/92 | 4 (0)/89 | -4300, #3, yes, -10200 | -4600, #29, no, -9700 | -9700 | -400/-400 | 0/0 | d1 P0 B0 |
| rush g4-s72_0_10-B t11 | 47 | 4 to 0 | 32 (8) | 0/0 | 17 (0)/209 | none generated | -6400, #8, yes, -7000 | -7000 | n/a | 0/0 | d2 P0 B1 |

The matching old-priors table is in `runA.txt`. Its shape is the same, with PROMOTE turns in 5 of 12 lists, multi-body BUY in 9 of 12 lists, and the best-static BUY in the list in 4 of 12.

## What would make it promote more, in order of leverage

1. **Fix the leaf valuation of a promotion.** Any one of these works: tier-2/3 `material[]` x1.25-1.5; `BankLiquid`/`BankExcess` at 50-75; or `w[Rent]` around +450 to cancel the rent leg already inside EconDelta. Each took promotions from 0/12 to 5-6/12 here. Do not zero EconDelta: buying got worse.
2. **Open the mission gate** (promote.ts:147-198). A third of the positions can never promote at any weight setting.
3. **Make the beam score see pending bodies** (engine.ts:355-360). Raising K to 96 has the same effect but costs about a ply of depth.
4. **Un-cap purchase plans** (config.ts:543). Setting maxPlans 36 and keepPerMultiset 1 gave mixed armies and about 40% spend. The real fix is enumeration order in purchase.ts:145-159 and 441-461.
5. **For random variation**, these are independent and cheap to sweep: BankLiquid, BankExcess, the tier-2/3 material multiplier, TierClimb, Rent, and K in {24, 48, 96}. PendingValue cannot be swept: it takes integer weights on a cc-valued feature, so the only step is 1 to 2.

## Caveats

These are 12 positions, single-turn decisions at fixed work 100k. They are not match results. Changes to K or plan width trade against search depth (1.83 down to 1.08, and one position at depth 0). The engine reaches only depth 1-2 at 1.5 s, so any widening should be checked on the ladder.