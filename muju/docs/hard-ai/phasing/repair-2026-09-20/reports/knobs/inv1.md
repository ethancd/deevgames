HEADLINE: No config knob alone made the search choose a promotion. The cash weights (BankExcess/BankLiquid) decide whether it promotes, and four structural limits keep promotions and purchases rare.

## Knobs
- w[BankExcess] (evaluation weight; the decisive one) @ muju/src/ai/hard/eval/weights.ts:31: now 100 cc per crystal, the same as material, so promotion's only net effect is the forecast rent of about -408 cc; try 75, 50, 25, 10, and 0 as a deliberate overshoot; Measured at fixed 50k work on 16 positions: 100 gives a chosen PROMOTE in 0/16, 75 gives 0/16, 25 gives 8/16, 10 (with BankLiquid 50) gives 8/16, 0 gives 8/16. Chosen BUY goes from 9/16 to 13-15/16. The switch point is between 75 and 25.; risk: Cheaper cash fills the K=24 beam with Prepare variants: distinct Act lines fall from 18.75 to 14 to 5.75 (at 0/0). Pair it with K 48. The chosen-promotion rate stops rising near 50% because the mission filter proposes nothing in about two thirds of Prepare positions.
- w[BankLiquid] @ muju/src/ai/hard/eval/weights.ts:30 (the first 8 crystals per side, features.ts:190): now 100; try 90 (old prior), 50, 0 (overshoot); 100 to 90 with BankExcess 25 moved chosen PROMOTE from 8/16 to 9/16. It is a second-order effect next to BankExcess.; risk: At 0 the engine spends below its next upkeep bill, because RentShortfall, Insolvency and Inv14LiquidityFloor all have weight 0.
- bestMission filter (the hard filter) @ muju/src/ai/hard/gen/promote.ts:147-198; the rejection is at :253: now Five missions only. 40 of 531 legal promotions were proposed, and 82 of 121 Prepare positions got none.; try Add a catch-all STRENGTH mission for any attack or defence gain, with benefit d(atk+def)*ACTION_VALUE_CC. As an overshoot, propose every legal promotion with benefit 0.; PROMOTE candidates in the root list rise from 0.56 towards maxPromotions, and the ~50% ceiling seen with cheap cash goes away.; risk: This is a code edit of about 10 lines. More combos per Act endpoint crowd the K-beam; interior nodes keep only 8 place plans.
- promotion heuristic rent and benefit constants @ muju/src/ai/hard/gen/promote.ts:254-256; RENT_PV in core/income.ts:47; ACTION_VALUE_CC in tables/economy.ts:35: now RENT_PV 422, ACTION_VALUE_CC 60. REACH scores about -362, and 32 of 40 proposals score <= 0.; try A promotion-local rent constant of 200, 100 or 0. REACH benefit per speed step of 200 or 500 as an overshoot.; Promotion combos outrank bare purchase plans in buildCombos and survive the maxPlacePlans cut of 16/8.; risk: RENT_PV is shared with keep-set ranking (muju/src/ai/hard/gen/upkeep.ts:153) and eval, so add a separate constant instead of editing it. It changes ordering only; the search still needs an evaluation that likes the result.
- beam-gate scorer (ctx.score) @ muju/src/ai/hard/engine.ts:355-360; consumed at generate.ts:879 and :910-927: now stage0+stage1 only. A BUY scores -100 cc per crystal (measured -1038 cc for the best plan); a PROMOTE scores exactly 0.; try Add the pending commitment value to the gate (+cost*100 per BUY), or a flag bonus for PURCHASE and PROMOTION of +1, +100, and +500 as an overshoot.; Purchase and promotion variants stop being displaced by bare Act lines. Base keeps 7.4 BUY and 0.56 PROMOTE candidates out of 27.; risk: Code edit. It moves fixed-work determinism goldens. Too large a bonus reproduces the 0/0 collapse to 5.75 Act lines.
- offer() tie rule @ muju/src/ai/hard/gen/generate.ts:915: now `turn.gainCc <= out[worst].gainCc` rejects the offer, so exact ties (every promotion under the bootstrap) never enter a full beam.; try Reserve N beam slots for candidates flagged PROMOTION or PURCHASE, with N = 2, 4, 8, instead of changing <= to <.; A guaranteed minimum of spending variants regardless of the evaluation.; risk: Code edit. Reserved slots take room from Act variety.
- K / gen.K (root beam) @ muju/src/ai/hard/config.ts:574, 603; arms k48 and k96 at lab/hard-ai/ablate/arms.ts:481-482: now 24 on DESKTOP and LAB, 16 on MIDRANGE, 12 on PHONE; try 48 and 96, through the existing labels hard@ablate:k48 and hard@ablate:k96; K96 raised PROMOTE candidates from 0.56 to 4.75 and BUY candidates from 7.4 to 70.6, but chosen PROMOTE stayed 0/16. It pays off only together with cheaper cash, where it restores the lost Act variety.; risk: Depth fell from 1.75 to 1.00 at 50k work. At about 45 units/ms the search is already at depth 1-2.
- kInterior / genInterior.K @ muju/src/ai/hard/config.ts:574, 604; arm reply-wide at arms.ts:498-503: now 16 / 12 / 8; try 32 through hard@ablate:reply-wide; The opponent model sees more replies. No direct effect on promotions.; risk: Costs depth.
- gen.maxPlacePlans (the combo cap in buildCombos) @ muju/src/ai/hard/config.ts:574 (16 root / 8 interior); quiescence capped at 2 in engine.ts:220; arms place-wide, place-narrow, interior-place-wide at arms.ts:495-517: now 16/8 DESKTOP, 12/6 MIDRANGE, 8/4 PHONE; try 32/16 through hard@ablate:place-wide; 64/32 as an overshoot; More purchase x promotion combos per Act endpoint survive the prune.; risk: Alone it did nothing: the plans32 variant left PROMOTE candidates at 1.55 and BUY at 5.4. Everything still funnels into K=24, and GEN work is charged per combo.
- gen.maxPromotions @ muju/src/ai/hard/config.ts:552, identical on every profile: now 8; try 16 or 32, only after widening the missions; None today. The mean is 0.33 proposals per position, so the cap never binds.; risk: None on its own.
- PlaceCombo single-promotion limit @ muju/src/ai/hard/gen/generate.ts:219-232, 646-668; runCombo at :764-776: now One promotion per turn. Two are possible only as a FORTIFY pair while holding the enemy corner.; try Allow promo2 for ordinary combos, pairing the top 2 or 3 proposals; Lifts the ceiling of one promotion per turn. The old engine averages 4.7 per game, so one per turn is not yet the binding limit.; risk: Quadratic growth in combos. Do it after the mission filter and the cash weights.
- purchase.maxPlans x keepPerMultiset (DFS-order truncation) @ muju/src/ai/hard/config.ts:543; the loop is purchase.ts:443-461; the sort afterwards is at :463: now maxPlans 12, keepPerMultiset 3, maxMultisets 35, squares 8, maxBodies 4. Only the first ~4 depth-first multisets are emitted, so 93% of planned bodies are fire.; try Config only: maxPlans 36 with keepPerMultiset 1, or maxPlans 106 with keep 3 (the plan buffer holds 201, generate.ts:344). Proper fix: score every multiset and then keep the best maxPlans.; Plant and water plans become reachable, which means mining growth and INCOME promotion targets. The engine stops being mono-fire.; risk: More GEN work per node. buildCombos still keeps 16/8 by heuristic score, where homeRaceCc 5000 dominates.
- PurchaseWeights (ordering constants) @ muju/src/ai/hard/config.ts:516-527: now mineCc 1, safeCc 100, anchorCc 20, zeroSpawnCc 400, liquidityCc 50, homeRaceCc 5000. blockCc 200 and strikeCc 300 are inert (purchase.ts:200).; try mineCc 1 to 5 or 20; liquidityCc 50 to 0; homeRaceCc 5000 to 500; Changes which plans and squares rank first. It does not change whether the search likes buying.; risk: Low. Every profile shares them.
- time.ladderStep @ muju/src/ai/hard/config.ts:155; search/time.ts:225-233; arm work-fit at arms.ts:531-539: now Unset, so the x2 ladder: 49 units/ms x 1500 ms = 73.5k floors to 50k (68% of the allowance); try 'sqrt2' through hard@ablate:work-fit, giving a 71k rung; About 42% more work per turn at 1500 ms. At 6000 ms the rung goes from 200k to 283k.; risk: The abort rate rises (it is already 109 of 895), and an aborted iteration is dropped. More rung changes when the machine is loaded.
- iterationGate / searchFix.iterFit @ muju/src/ai/hard/search/pvs.ts:929-940, 1030-1047; arms deep-gate, work-fit-deep, search-iter-fit at arms.ts:541-565: now The fixed 0.45 gate. work/rung is 0.84, and 41% of searches end at depth 1.; try hard@ablate:search-iter-fit or hard@ablate:work-fit-deep. iterFit already switches on for allowances above 10 s (engine.ts:645-658).; Spends what is left of the rung on a partial iteration that can still publish a move.; risk: deep-gate alone previously spent 23% less work (docs cited at search/time.ts:448-449).
- time.rungScale (new) or ceiling-rung selection @ muju/src/ai/hard/search/time.ts:227: now Does not exist. budget = unitsPerMs x targetMs, rounded down to a rung.; try Optional `rungScale?: number` on TimeConfig, read as `* (time?.rungScale ?? 1)`. Try 1.5, 2, and 4 as an overshoot. Leave it unset on all profiles so the champion hash does not move.; Uses the full allowance, with the deadline as the hard stop. First searches are effectively at 4x and reach depth 2 in 84 of 96 games, against a 1.59 mean later.; risk: Wall-mode moves become load-dependent. A deadline-cut iteration is discarded unless iterFit is on.
- INITIAL_UNITS_PER_MS / config.profile @ muju/src/ai/hard/config.ts:587, 610; the update is time.ts:377-383: now 200 against 45-56 measured. The first search of every game is oversized 4x and deadline-cut in 91 of 96 games.; try Leave it alone. A profile patch is overwritten after the first measured search, because samples === 0 means replace, and a quarter of each new sample is blended in afterwards.; None worth having; the oversize helps.; risk: n/a
- refinement flags (useLmr, useAspiration, useFutility, useExtensions, useDfpn) @ muju/src/ai/hard/config.ts:598-608; label hard@lab-refined at bots/hard.ts:254-255: now All false; try hard@lab-refined. The orchestrator already has a w1500-labrefined run.; More depth per unit of work. No effect on promotions.; risk: Not yet gated by an SPRT run.
- evalFix.rentOnce (arm eval-fix-b5). TESTED, INERT. @ muju/src/ai/hard/tables/economy.ts:231, 335; the Phasing path is tables/phasing-economy.ts:216 into features.ts:506: now Unset; try Do not spend a run on it.; Identical to base on 16 of 16 positions. The Phasing EconDelta reads livePVcc, and the flag only edits `stream`.; risk: n/a
- MUJU_HARD_WEIGHTS / MUJU_HARD_PATCH override (new, about 25 lines) @ lab/hard-ai/bots/hard.ts:244-290 (hardConfigFor and hardEnginePatch): now Does not exist. The only injection path is a registered arm in the tracked arms.ts.; try A label prefix `env:<base>`, so `hard@env:desktop` is the base config, plus JSON.parse(MUJU_HARD_PATCH file), plus loadWeights(MUJU_HARD_WEIGHTS file).; `--a hard@env:desktop --b hard@desktop` runs candidate against champion in the real ladder. The hash differs automatically (identity.ts:339-349), and shard children inherit the environment (shard.ts:72).; risk: A JSON patch needs Int32Array conversion for gen.action.widths. The manifest records only the hash and the label, so keep the weights file with the results.

## Findings
- The bootstrap is not value-neutral for promotion or purchase. Measured on 121 real Hard-seat Prepare positions from 12 of today's replays. (Scratch probe /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/knobs/prepare-probe.ts. Best promotion vs bare END_PLACE: full evaluate() delta mean -408 cc (38 of 39 negative). Beam-gate score delta is exactly 0 in 39 of 39. Best buy plan vs bare: full eval +525 cc mean, but beam-gate delta -1038 cc mean (113 of 113 negative). The promotion penalty is the forecast rent: muju/src/ai/hard/tables/phasing-economy.ts:216 subtracts discounted paidRent from livePV. EconDelta reads livePV (muju/src/ai/hard/eval/features.ts:506) at w=100 (muju/src/ai/hard/eval/weights.ts:32). Material and cash cancel exactly.)
- The final K-beam prune is scored by the evaluation weights, but only stage0+stage1. That excludes PendingValue and EconDelta, which are both stage 2. (ctx.score = evaluator.stage0 + evaluator.stage1 (muju/src/ai/hard/engine.ts:355-360). It is written to turn.gainCc (muju/src/ai/hard/gen/generate.ts:879) and used by offer() to displace the weakest candidate (generate.ts:910-927). stage2 covers F.EconDelta through FEATURE_COUNT-1 (muju/src/ai/hard/eval/evaluate.ts:153-157); PendingValue is index 58 (features.ts:508). So a BUY scores -100 cc per crystal at the gate. A PROMOTE scores an exact tie, and ties never displace: `turn.gainCc <= out[worst].gainCc` returns at generate.ts:915.)
- The combo score that prunes purchase x promotion pairs to maxPlans uses hard-coded constants, not the evaluation weights. Most promotion proposals score negative. (buildCombos: scoreCc = plan.scoreCc + promo.scoreCc (generate.ts:651). plan.scoreCc comes from PurchaseWeights (muju/src/ai/hard/config.ts:516-527) through squareScoreCc and planScore (muju/src/ai/hard/gen/purchase.ts:203-216, 360-375). promo.scoreCc = benefit + dMaterial - cost*CC - RENT_PV*dUpkeep (muju/src/ai/hard/gen/promote.ts:254-256), with RENT_PV=422 (core/income.ts:47) and ACTION_VALUE_CC=60 (tables/economy.ts:35). A REACH promotion scores about 60 - 422 = -362. 32 of 40 proposals in the probe had scoreCc <= 0.)
- The mission filter in planPromotions is a hard filter that removes 92% of legal promotions before anything scores them. (promote.ts:252-253: `if (mission < 0) continue`. Only FORTIFY, SURVIVE, ANCHOR, INCOME (plant only) and REACH (speed gain only) exist (promote.ts:147-198). There is no attack or defence strength mission. Probe: 531 legal promotions across 121 Prepare positions, and every position had at least one. Only 40 were proposed (REACH 30, ANCHOR 5, SURVIVE 3, INCOME 2). Only 39 of 121 positions got any proposal. At the root the 27-candidate list holds 0.56 candidates with a PROMOTE.)
- planPurchases truncates to maxPlans in enumeration order before it sorts, so nearly every plan is fire-only. (purchase.ts:443-461 stops at `written < limit`, where limit = maxPlans 12 including the empty plan. sortPlans runs only afterwards (purchase.ts:463). Multisets are enumerated depth-first over tier1 sorted by cost (core/catalog.ts:186-188: fire, lightning, water, shadow, plant, metal). With keepPerMultiset 3 the first four multisets ([F], [F,F], [F,F,F], [F,F,F,F]) fill all 11 slots. Probe: 4.5 distinct multisets per position against the 35-multiset cap hit in 112 of 121 positions, and 93% of planned bodies are fire. Ladder: Hard bought 457 fire, 35 lightning, 0 plant or water in 96 games. The old engine (AIEngineV2 hard, whole-turn shape) bought 576 fire, 160 plant, 38 water.)
- Changing only the two cash weights switches promotion on in search. Widening the root beam alone does not. Cheaper cash also crowds tactical variety out of the beam. (Scratch probe .../scratchpad/knobs/rootlist-probe.ts: 16 root positions from 9 replays, fixed 50k work. Each row is BankLiquid/BankExcess (or knob): turns chosen with a PROMOTE, turns chosen with a BUY, PROMOTE candidates in the root list, distinct Act lines in the root list. Base 100/100: 0/16, 9/16, 0.56, 18.75. K96 alone: 0/16, 12/16, 4.75 (depth fell from 1.75 to 1.00). 100/75: 0/16, 12/16. 100/25: 8/16, 13/16, 10.5, 14.06. 90/25 (the old prior's values): 9/16, 14/16. 50/10: 8/16, 15/16. 0/0 (overshoot): 8/16, 15/16, distinct Act lines collapse to 5.75. evalFix.rentOnce was identical to base on 16/16: economy.ts:335 edits `stream`, which the Phasing EconDelta does not read.)
- There is no hard rule like 'do not promote without runway' or 'retain refundable purchases'. All liquidity logic is either a penalty used for ordering or a zero-weight feature. (purchase.ts:353-375: planScore subtracts liquidityCc (50) per crystal below requiredReserve and zeroSpawnCc (400). The comment at :356-358 says no plan is rejected for missing the reserve. candidateDefs keeps every affordable tier-1 unit (purchase.ts:102-110). Inv7PromoteNoRunway and Inv14LiquidityFloor are evaluation features (features.ts:116, 123) with weight 0. The remaining hard limits are: one promotion index per PlaceCombo, with promo2 used only for FORTIFY pairs (generate.ts:219-232, 646-668); HOME_RACE_EMIT=2 (generate.ts:197); INTERIOR_KEEP_SETS=4 (generate.ts:143); and the quiescence generator capped at 2 place plans (engine.ts:218-235).)
- Time: the lab seat spends about 68% of a 1500 ms allowance and about 61% of 6000 ms. The x2 work ladder rounds its budget down, and the 0.45 gate leaves rung unspent. (bots/hard.ts:363 passes targetMs = deadlineMs = allowance. engine.ts:552 uses it verbatim, so the profile minMs/maxMs/baseMs are never read in the lab. chooseTurnWork for allowances <= 10000 ms is chooseWork on WORK_LADDER capped at 3.2e6 (muju/src/ai/hard/search/time.ts:290-301, 225-233, 76-78). games.jsonl turnRows, 895 non-first searches at 1500 ms: rung 50000 in 810, mean 1019 ms, work/rung 0.84, 49 units/ms after updating, depth 1 in 366 and depth 2 in 525. At 6000 ms: rung 200000 in 276 of 309, mean 3658 ms. 49 x 1500 = 73.5k, which floors to 50k. shouldDeepen refuses a new depth once used > 0.45 x limit (muju/src/ai/hard/search/pvs.ts:930).)
- An oversized rung cut by the deadline works, judging by the first search of every game. That supports adding a rung-scale knob. (INITIAL_UNITS_PER_MS = 200 (config.ts:587, 610) gives a first-search rung of 200000 in 96 of 96 games. 91 of 96 were deadline-aborted at a mean 1498 ms, yet they completed depth 2 in 84 and depth 3 in 5, with mean work 84k. Later turns got 42k. iterativeDeepening returns the last completed depth, so an abort loses only the partial iteration (pvs.ts:1001-1006). DESKTOP_SHAPE.unitsPerMs = 600 (config.ts:575) is never the starting profile.)
- No environment variable, CLI flag or label syntax injects custom weights or a config patch into the ladder. hardEnginePatch is the single choke point for both the engine that runs and the configuration hash. (A grep of lab/hard-ai/ladder/*.ts for process.env finds only MUJU_HEAVY_* in heavy.ts:92-106. run.ts parseArgs (475-590) has no weights flag. hardConfigFor accepts fixed names or ablate:<arm> from the tracked SPECS table (lab/hard-ai/bots/hard.ts:244-269; lab/hard-ai/ablate/arms.ts:479, 986-999). createBot calls createHardBot({work, profile: label}) (ladder/engines.ts:342-349), which calls hardEnginePatch (bots/hard.ts:286-290). identity.ts:339-349 hashes the same patch, and canonicalJson serialises typed arrays (identity.ts:203). Shard children inherit the environment (shard.ts:72). loadWeights and serializeWeights already exist (muju/src/ai/hard/eval/weights.ts:89-103, 113-133). createHardBot accepts `weights` and an object `profile` (bots/hard.ts:132-140).)

## Report
# What would make the new Hard engine promote more

No config knob alone made the search choose a promotion; at best a wider root beam puts a few more promotion candidates in the list. Changing two cash weights switched promotion on in my fixed-work probe; none of this has been run through the ladder yet. Four structural limits in the generator also keep promotions and purchases rare, and one of them (purchases come out almost all fire) is a plain bug.

Scope: I edited nothing in the repo. The two scratch probes are in `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/knobs/`:

- **`prepare-probe.ts`:** 121 real Hard-seat Prepare positions from 12 of today's replays; about 2 s.
- **`rootlist-probe.ts`:** 16 real root positions from 9 replays; generation plus a fixed 50k-work search per variant.
- **`rows.cjs`:** aggregates the per-search timing rows from games.jsonl.

Evaluation scores below are in cc, the engine's hundredths of a crystal.

## 0. Correction to the working assumption: the bootstrap is not value-neutral

| Option vs bare END_PLACE | Beam-gate score (stage0+stage1) | Full evaluate() |
|---|---|---|
| Best promotion | exactly 0 in 39/39 | **-408 cc** mean (38/39 negative) |
| Best buy plan | **-1038 cc** mean (113/113 negative) | +525 cc mean |

- **Promotion.** Material gained and cash spent cancel exactly. But the Phasing economy forecast charges the discounted rent a promoted unit will pay: `muju/src/ai/hard/tables/phasing-economy.ts:216`. EconDelta reads that forecast (`muju/src/ai/hard/eval/features.ts:506`) at weight 100 (`muju/src/ai/hard/eval/weights.ts:32`). That costs about 400 cc per upkeep crystal, with no offsetting strength term because every other feature weighs 0.
- **Purchase.** The full evaluation likes a purchase through PendingValue and mining income. The beam gate is `evaluator.stage0 + evaluator.stage1` (`muju/src/ai/hard/engine.ts:355-360`), and both PendingValue (feature 58) and EconDelta (feature 23) sit in stage 2 (`muju/src/ai/hard/eval/evaluate.ts:153-157`). So at the gate a BUY is simply -100 cc per crystal.
- **`evalFix.rentOnce` does not help.** The arm `eval-fix-b5` is inert under Phasing: it edits `stream` (`tables/economy.ts:335`), which EconDelta no longer reads. It gave identical results to base on 16/16 positions.

## (a) Every non-weight parameter or filter that affects buying and promoting

| Knob | Where | DESKTOP = LAB / MIDRANGE / PHONE | What it gates | Worth trying |
|---|---|---|---|---|
| `K` (root beam) | config.ts:574-584, 603 | 24 / 16 / 12 | How many non-forced root turns survive `offer()`. Every Act line x keep set x combo competes for these slots. | `hard@ablate:k48`, `k96` |
| `kInterior` | config.ts:574, 604 | 16 / 12 / 8 | The same beam at reply nodes | `hard@ablate:reply-wide` (32) |
| action `widths` | config.ts:574 | [6,4,3,2] / [5,3,2,2] / [4,3,2,1] | Act-line beam widths | `action-width-wide`, `interior-action-wide` |
| `action.keep`, re-tuned per node | config.ts:550; generate.ts:802-809, 481 | 4, raised to ceil(K/1) = 24 (max 64) | Act lines handed to Prepare | tied to K |
| `maxPlacePlans` | config.ts:574; generate.ts:563-564 | 16/8, 12/6, 8/4; quiescence capped at 2 (engine.ts:220) | Cap on purchase x promotion combos per Act endpoint | `place-wide` (32/16); `interior-place-wide` (12) |
| `maxPromotions` | config.ts:552 | 8 on every profile | Ordinary promotion candidates kept. It never binds: 0.33 proposals per position. | 16 or 32, only after widening missions |
| **Mission filter** | promote.ts:147-198; rejection at :253 | FORTIFY, SURVIVE, ANCHOR, INCOME (plant only), REACH (speed only) | **Hard filter.** 40 of 531 legal promotions were proposed; 82 of 121 Prepare positions got none. | Add a STRENGTH mission; as an overshoot, propose every legal promotion |
| Promotion affordability | promote.ts:250 | `cost > bank` skips | Hard, but it is just legality | none |
| One promotion per combo | generate.ts:219-232, 646-668, 764-776 | 1; 2 only as a FORTIFY pair | **Hard cap** of one promotion per turn | Allow 2-3 |
| `FORTIFY_PAIR_POOL` / `MAX_FORTIFY_PAIRS` | generate.ts:204-205 | 24 / 24 | Only matters while holding the enemy corner | none |
| `purchase.maxPlans` | config.ts:543; purchase.ts:441-463 | 12, including the empty plan | **Truncates in enumeration order before sorting**, so plans are fire-only | 36 with keepPerMultiset 1, or 106 |
| `purchase.keepPerMultiset` | config.ts:543 | 3 | Placements kept per multiset | 1 |
| `purchase.maxMultisets` / `squares` / `maxBodies` | config.ts:543; purchase.ts:66-72 | 35 / 8 / 4 | Size of the enumeration | 64 / 12 / 4 |
| `PurchaseWeights` | config.ts:516-527 | mineCc 1, safeCc 100, anchorCc 20, zeroSpawnCc 400, liquidityCc 50, homeRaceCc 5000; blockCc and strikeCc inert | Plan ordering only | mineCc 5-20; liquidityCc 0; homeRaceCc 500 |
| Liquidity floor | purchase.ts:353-375, 458 | 50 cc per crystal below `requiredReserve`, once the first bill is reached | **A penalty, never a rejection** (the comment at :356-358 says so) | none |
| Zero-spawn rule | purchase.ts:372 | -400 | Penalty, never a rejection | none |
| `HOME_RACE_EMIT` | generate.ts:197 | 2 | Direct race-buy candidates (not forced) | none |
| `INTERIOR_KEEP_SETS` | generate.ts:143, 844 | 4 (the root takes all, up to 64) | Upkeep keep or release branches. They multiply the offers into K once promoted units exist. | none |
| Keep-set ranking constants | upkeep.ts:41, 49-51, 151-158 | occupier 16M, rescuer 8M, anchor 4M, then cost*100 - 422*upkeep | Which promoted bodies get released when cash is short | none |
| `offer()` tie rule | generate.ts:915 | `<=` rejects | Exact-tie promotion variants cannot enter a full beam | Reserved slots |
| Beam-gate scorer | engine.ts:355-360 | stage0+stage1 | See section 0 | Include the pending commitment value, or a flag bonus |
| Refinement flags | config.ts:598-608 | all off | Depth only | `hard@lab-refined` |

There is no "promote only with runway" or "retain refundable purchases" hard rule anywhere. `Inv7PromoteNoRunway` and `Inv14LiquidityFloor` are evaluation features with weight 0. `candidateDefs` deliberately keeps every affordable tier-1 unit (purchase.ts:101-110).

## (b) The score used to prune combos to maxPlans

`buildCombos` (generate.ts:634-695) scores a combo as `plan.scoreCc + promo.scoreCc` (generate.ts:651). Neither term reads the evaluation weights.

- **`plan.scoreCc`** is built from `PurchaseWeights` constants: mining value of the square, a disruption charge, an anchor cost, a home-race bonus, then the zero-spawn and liquidity penalties (purchase.ts:203-216, 360-375).
- **`promo.scoreCc`** is `benefit + dMaterial - cost*CC - RENT_PV*dUpkeep` (promote.ts:254-256). Material and cost cancel, leaving benefit minus 422 cc per upkeep crystal. The benefits are:
  - REACH: 60 cc per speed step.
  - SURVIVE: the unit's own cost.
  - ANCHOR: cost plus 60 cc per spawn square it alone contributes.
  - INCOME: the mining gain.

  32 of 40 proposals scored <= 0, so promotion combos sort below bare purchase plans.

Pruning happens in two stages, and the second one does depend on the evaluation weights:

1. The hard-coded heuristic keeps 16 combos at the root and 8 at reply nodes.
2. Every surviving (Act line x keep set x combo) is offered into the K-beam, ranked by `gainCc = ctx.score` (generate.ts:879, 892-928), which is stage0+stage1 only.

To make promotions reachable you need both changes. The constants and the mission filter decide whether a promotion is proposed and survives the combo cut. The cash weights (or a change to the gate) decide whether it survives the beam and gets chosen.

Dose-response on the cash weights alone (16 positions, fixed 50k work):

| BankLiquid / BankExcess | Chose PROMOTE | Chose BUY | PROMOTE candidates in root list | Distinct Act lines in root list |
|---|---|---|---|---|
| 100/100 (base) | 0/16 | 9/16 | 0.56 | 18.75 |
| 100/75 | 0/16 | 12/16 | 0.63 | 18.81 |
| 100/25 | 8/16 | 13/16 | 10.5 | 14.06 |
| 90/25 (old prior's values) | 9/16 | 14/16 | 10.5 | 14.06 |
| 50/10 | 8/16 | 15/16 | 12.4 | 13.88 |
| 0/0 (overshoot) | 8/16 | 15/16 | 12.4 | **5.75** |
| K96 alone | 0/16 | 12/16 | 4.75 | 27.5 (depth 1.75 -> 1.00) |

- **Threshold.** The switch point is a BankExcess value between 75 and 25.
- **Overshoot.** The symptom is not reckless promoting. The 24-slot beam fills with spending variants of the best one or two Act lines, and tactical breadth collapses. Pair cheaper cash with K 48.
- **Ceiling.** The plateau near 50% is my inference that the mission filter proposes nothing in most positions; widening it is the next lever.

Separate bug: purchases come out almost all fire. `planPurchases` stops writing at `maxPlans` while walking multisets depth-first in tier-1 cost order, and sorts only afterwards (purchase.ts:443-463; core/catalog.ts:186-188). The first four multisets ([F], [F,F], [F,F,F], [F,F,F,F]), at three placements each, fill all 11 slots. In the probe, 93% of planned bodies were fire. In the 96-game ladder, Hard bought 457 fire, 35 lightning and 0 plant or water. The old engine (AIEngineV2 hard, whole-turn shape) bought 576 fire, 160 plant and 38 water. Hard can never buy the plant miners that INCOME promotions need.

## (c) Time management

How the work budget is chosen (the 12-step work ladder):

- In wall mode the lab adapter passes `targetMs = deadlineMs = allowance` (bots/hard.ts:363).
- The engine uses targetMs verbatim (engine.ts:552), so the profile `minMs/maxMs/baseMs` are irrelevant in the lab.
- `chooseTurnWork` (time.ts:290-301) handles allowances up to 10,000 ms with `chooseWork`. That picks the largest rung at or under `unitsPerMs x ms` from `WORK_LADDER` = 25k x 2^k (time.ts:76-78, 225-233), capped at 3.2e6.
- The profile starts at `INITIAL_UNITS_PER_MS = 200` (config.ts:587, 610), not the 600 in `DESKTOP_SHAPE`.
- The first measured search replaces the starting figure outright; after that each new sample is blended in at one quarter (time.ts:377-383).

Measured from the games.jsonl turn rows:

| Match | Dominant rung | Mean search time | Work / rung | Depth |
|---|---|---|---|---|
| 1500 ms, 895 non-first searches | 50k in 810 | 1019 ms | 0.84 | depth 1 in 366, depth 2 in 525 |
| 6000 ms, 309 non-first searches | 200k in 276 | 3658 ms | 0.76 | depth 2 in 184, depth 3 in 106 |

Two things leave allowance unspent:

1. **The x2 ladder rounds down.** At the measured 49 units/ms, 49 x 1500 = 73.5k, which rounds down to 50k, or 68% of the allowance.
2. **The 0.45 gate.** `shouldDeepen` refuses a new depth once used work exceeds 0.45 x limit (pvs.ts:930). An iteration cut off by the work limit is thrown away.

The first search of every game is a useful natural experiment. It runs at a 200k rung, 4x oversized, and was cut by the deadline at about 1498 ms in 91 of 96 games. It still completed depth 2 in 84 and depth 3 in 5, doing 84k units of work; later turns got 42k. So oversizing the rung and letting the deadline cut it is safe.

Options, cheapest first:

1. `hard@ablate:work-fit`. A sqrt2 ladder gives a 71k rung. It already exists; no edits needed.
2. `hard@ablate:search-iter-fit` or `hard@ablate:work-fit-deep`.
3. A new optional `time.rungScale`, read at time.ts:227. Try 1.5, 2, and 4 as an overshoot. Leave it absent on every profile so the champion hash does not move.

Time is not what limits promotions: 6 s per turn still produced 0.5 promotions per game.

## (d) Running the ladder with custom weights or a config patch

**No existing mechanism does this without touching tracked files.**

- The only `process.env` reads under the ladder are `MUJU_HEAVY_*` (heavy.ts:92-106).
- `run.ts parseArgs` (475-590) has no weights flag.
- `hard@<label>` accepts fixed profile names or `ablate:<arm>` from the tracked `SPECS` table (arms.ts:479, 986-999).

**Zero-edit route (untracked driver script).** This loses SPRT, sharding and the manifest. Write an untracked driver, as my probes do, that calls:

- `playGame` (lab/harness/runner.ts:110);
- `createHardBot({work, profile: {...DESKTOP, ...patch}, weights})` (bots/hard.ts:132-140, 304-307) against `resolveEngine('aiv2-hard-turn').createBot(work)`;
- `applyLadderOpening` for the openings, as worker.ts:340-371 does.

The weights file format is the output of `serializeWeights` (weights.ts:113-133); `loadWeights` (weights.ts:89-103) parses it.

**Smallest patch, about 25 lines in `lab/hard-ai/bots/hard.ts`.** `hardEnginePatch` (lines 286-290) is the single choke point:

- `createHardBot` calls it (hard.ts:305).
- `identity.ts:339-349` hashes the same patch, and `canonicalJson` serialises typed arrays (identity.ts:203), so a custom vector gets its own config hash automatically.
- Shard workers are spawned without an `env` override (shard.ts:72), so they inherit the variables.

The patch is scoped by label so the candidate and the champion can share one run:

```ts
// in hardConfigFor, before the ablation check:
const ENV_PREFIX = 'env:';                        // hard@env:desktop
if (label.startsWith(ENV_PREFIX)) {
  const base = hardConfigFor(label.slice(ENV_PREFIX.length));
  const pf = process.env.MUJU_HARD_PATCH;         // JSON Partial<HardConfig>; widths -> Int32Array
  return pf ? { ...base, ...reviveTyped(JSON.parse(readFileSync(pf, 'utf8'))) } : base;
}
// in hardEnginePatch:
const wf = typeof profile === 'string' && profile.startsWith('env:') ? process.env.MUJU_HARD_WEIGHTS : undefined;
const envW = wf ? loadWeights(JSON.parse(readFileSync(wf, 'utf8'))) : undefined;
const resolved = weights ?? envW ?? (/* existing rule */);
```

Usage (`<opponent>` is whichever engine name the run pits it against):

```
MUJU_HARD_WEIGHTS=/path/w.json node --import tsx lab/hard-ai/ladder/run.ts --a hard@env:desktop --b <opponent> --work wall:1500 ...
```

For hard-vs-hard A/B comparisons on a CPU-saturated machine, `--work fixed:50000` avoids load effects. The rule on which engines may share a work mode restricts fixed work to hard@-vs-hard@ pairings (engines.ts:36-40).

## Suggested order of experiments

1. Cash weights: BankExcess 25, then 10, then 0, with BankLiquid 90, together with K 48. This is the one change that produced promotions in search.
2. Fix the enumeration-order truncation in `planPurchases`, or set maxPlans 36 with keepPerMultiset 1.
3. Widen the mission filter with a STRENGTH mission, and add a promotion-local rent constant lower than 422.
4. `work-fit` plus `search-iter-fit`, or a `rungScale` of 2, for depth.

Items 2-4 are code edits or arms and do not depend on item 1. The old prior's home-safety weights (HomeInvaded, HomeThreat), which address the home-checkmate losses, are a separate question outside this task.