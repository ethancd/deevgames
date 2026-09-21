HEADLINE: Under the bootstrap a promotion is not value-neutral: it scores about -400 cc, the generator never proposes 91% of legal promotions, and the material tables below raise promoting turns from 0/34 to 15/34 (moderate) and 17/34 (overshoot).

## Knobs
- material[] T2/T3 entries (T1 held at cost x 100) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:506 (DEFAULT_MATERIAL_CC); consumed at /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/evaluate.ts:122-131. Inject in the lab with HardEngine.setWeights (/Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:387).: now [300,700,1500,300,700,1500,400,800,1600,400,800,1600,500,900,1700,500,900,1700]; try moderate [300,1275,2650,300,1175,2300,400,1575,3250,400,1275,2750,500,1400,2925,500,1625,3200]; overshoot [300,1875,3850,300,1575,2800,400,2575,5450,400,1675,3950,500,1850,4275,500,2525,5100]; reference break-even [300,1122,2344,300,1122,2344,400,1222,2444,400,1222,2444,500,1322,2544,500,1322,2544]; Every generated promotion becomes statically positive: +53 to +453 cc under moderate, +453 to +1653 under overshoot, with lightning_2->3 held near zero on purpose. At fixed work 50,000 on 34 real positions, turns with a promotion went 0 -> 15 -> 17. Expect roughly one promotion on each turn where the generator proposes one and the bank allows it, mostly water, metal, lightning and plant_2->3. Hi->Hono stays at zero until the generator gate changes.; risk: Exchange values change. An enemy Aegirinn is worth about 8 Hi net of rent under moderate and about 15 under overshoot, so the engine may over-commit to killing aiv2's promoted units or go passive with its own. Lightning is always generated through REACH, so overshoot may pour crystals into Umeme. Forced releases are under-penalised (phasing-economy.ts:216), so pair this with the Inv7 guardrail. It changes weightsHash, the book weightsKey and the pinned desktop config hash; tests/ai/hard/catalog.test.ts pins material to cost. Test through an ablate arm or setWeights instead of editing defaults. finishArmWeights copies base.material (muju/lab/hard-ai/ablate/arms.ts:303-313), so a material arm needs a small extension.
- w[TierClimb] (feature 21) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (not set, so 0); definition at /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features.ts:237-251: now 0; try 450 (just past break-even), 600 (equals the moderate table's mean net of +200 to +250), 1500 (overshoot); +w for the first unit of each element to reach each tier. Measured at 600: every legal promotion scored +122 to +244 cc, and the search promoted on 6 of 22 turns. It leaves exchange values at cost, so it is the safer overshoot test.; risk: It ignores element, so a useless Radi->Umeme->Kimubunga earns the same 2w as Sjor->Aegirinn, and lightning is always generated. It pays nothing for a second unit of the same element and tier, and losing a duplicate costs nothing. It is capped at 12 for the whole army. The sign flips when the enemy climbs.
- promotion mission gate (add an attack mission, widen SURVIVE) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:252-253 (gate); :147-198 (bestMission); :85-106 (oneShotBand counts single hits only): now A promotion is proposed only for FORTIFY, SURVIVE, ANCHOR, INCOME or REACH. Hi->Hono and Gol->Golge are never proposed, Sjor->Straumr 10% of the time, Muju->Sachita 6%.; try (a) Add a mission for an ATK gain that newly one-shots an enemy body within next-Act reach. (b) Let SURVIVE fire when the hits needed to kill the unit rise, for example 2 Hi to 3 Hi for Sjor->Straumr. (c) Overshoot: propose every affordable promotion, with a default mission at benefit 0.; Opens the 91% of legal promotions that never reach the search, above all Hi->Hono (2,940 of 5,525 opportunities, since Hard buys 93% fire_1) and Sjor->Straumr against Hi swarms. This is the knob that removes the saturation seen between the moderate and overshoot tables.; risk: More combos compete for 16 root and 8 interior plan slots, so useful purchase plans may be pruned unless maxPlacePlans rises. More candidates at a fixed rung reduces depth, which is already 1-2. A Hono has DEF 1 and sits through a full enemy turn before it can attack.
- promotion combo score: rent term and material source @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:254-256: now scoreCc = benefit + (cat.cost[next] - cat.cost[def]) x 100 - cost x 100 - 422 x d_upkeep. REACH scores -362 (-302 for metal_1->2).; try Use weights.material[next] - weights.material[def] for the gain, so the ranking follows the eval. Or drop the RENT_PV term (0 instead of 422) as an overshoot.; Promotion combos stop ranking below their bare purchase plan and survive buildCombos pruning, at interior nodes as well.; risk: planPromotions has no access to Weights today, so the signature changes. Purchase-plus-promotion combos may crowd out pure purchases.
- cfg.gen.maxPlacePlans (placePlansRoot / placePlansInterior) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:574 (DESKTOP_SHAPE); pruning at /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/generate.ts:634-659: now 16 root, 8 interior; try 24/12, and 48/16 as the overshoot; More purchase-and-promotion combos reach the search. At interior nodes the engine starts to see its own later promotions and the opponent's.; risk: Cost grows linearly per node at a fixed work rung, so depth drops. maxPromotions=8 (config.ts:552) is not the limit; the one-promotion-per-combo structure is (generate.ts:222-230).
- w[Inv7PromoteNoRunway] (guardrail to pair with inflated material) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (0); predicate at /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/invariants.ts:198: now 0 (the old prior had -600); try -600 with the moderate table; -2000 with the overshoot table; No effect in normal positions: it fired on 0 of 5,525 legal promotions. It stops a promotion whose next bill cannot be paid, which inflated material would otherwise score as positive.; risk: Little. It covers only the promoting turn; Inv14LiquidityFloor (invariants.ts:240) covers later turns and is also 0.
- w[RentShortfall] (feature 61, crystals) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (0); feature at /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features.ts:511: now 0; try -300 per missing crystal; -1000 as the overshoot; A graded alternative to Inv7: it prices the cash missing at the next bill and also makes the engine hold a reserve before it spends down.; risk: It can count the same loss as the released-principal charge in EconDelta (M6-BOOTSTRAP-CONTRACT.md:82).
- released-principal valuation in the forecast @ /Users/ethancd/src/deevgames/muju/src/ai/hard/tables/phasing-economy.ts:216: now cat.cost[def] x 100; try weights.material[def], so a forced release costs what the eval says the body is worth; Keeps the accounting consistent once material differs from cost, and removes the promote-into-release loophole without a separate penalty.; risk: It needs Weights passed into the economy table. It also changes the pass-only forecast oracle contract (M6-BOOTSTRAP-CONTRACT.md:38).
- random variation of the 12 T2/T3 material entries @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:33 (material) via cloneWeights; tuners under /Users/ethancd/src/deevgames/muju/lab/hard-ai/tune: now fixed at cost x 100; try Sample each T2/T3 entry uniformly between break-even - 200 and the overshoot value. Enforce T1 < T2 < T3. Keep all six T1 entries fixed so fire_1 = 300 pins the scale and BUY/pending conservation holds (muju/src/ai/hard/eval/pending.ts:116). Use SPSA steps of about +/-150 cc.; A dose-response curve of promotions per game and score against material premium, per element line. The probes suggest the response is a step at break-even that flattens above the moderate values.; risk: Any signal is confounded by the generator gate: entries for fire_2 and shadow_2 are nearly unidentifiable while they are never generated. Match-based tuning is CPU-heavy.

## Findings
- A promotion is not value-neutral under the bootstrap. It is a static loss of about 4 crystals, because EconDelta (weight 100) charges six discounted turns of the new rent. (Each bill subtracts GAMMA x (paidRent + releasedPrincipal) x 100 from livePV (muju/src/ai/hard/tables/phasing-economy.ts:219). GAMMA is 0.9^k (muju/src/ai/hard/core/income.ts:35-41), so six bills sum to 4.217 crystals, which is RENT_PV=422 (income.ts:47). Material gain (cost x 100, muju/src/ai/hard/config.ts:506-513) exactly cancels the bank debit (muju/src/ai/hard/eval/weights.ts:23-24). Measured with scratchpad/material/promo-delta.ts on all 128 replays: 1,526 real Hard Prepare positions and 5,525 legal promotions. Mean static change under the cost table was -356 to -478 cc by promotion type, except the rare Gol->Golge at -86 (n=7); it was positive in under 1% of cases.)
- The move generator is a second gate, in series with the eval. It proposed only 504 of 5,525 legal promotions (9%), and never proposes Hi->Hono or Gol->Golge outside FORTIFY. (planPromotions skips any slot with no mission (muju/src/ai/hard/gen/promote.ts:252-253). The missions are FORTIFY, SURVIVE, ANCHOR, INCOME and REACH (promote.ts:147-198). There is no attack mission; the header says Phasing replaced KILL with FORTIFY (promote.ts:11-20). Hi->Hono changes neither DEF nor SPD, so nothing fires. Measured proposal rates: fire_1->2 1/2,940, shadow_1->2 0/7, plant_1->2 57/929 (6%), water_1->2 128/1,276 (10%), plant_2->3 8/63. Lightning, metal, fire_2->3 and water_2->3 were proposed 100% of the time through REACH. Hard's purchases in the 96 h2h games were 457 fire_1 and 35 lightning_1, so its most common legal promotion is the one that is never generated. Its replay promotions match the gate: water_2, water_3, lightning_2, metal_2 and plant_2, with a single fire_2 across the four runs inspected (the two replay sets plus the t6000 and per-action h2h runs).)
- A proposed promotion is also ranked low before search. It carries -RENT_PV in its combo score, only one ordinary promotion fits in a turn, and combos are pruned to 16 (root) or 8 (interior). (scoreCc = benefit + (cat.cost[next] - cat.cost[def]) x CC - cost x CC - RENT_PV x d_upkeep (promote.ts:254-256). It uses cat.cost, not weights.material. A REACH promotion therefore scores 60 x speedGain - 422, which is -362 for a one-point gain and -302 for metal_1->2. A combo holds one promo index, and promo2 is filled only by FORTIFY pairs (muju/src/ai/hard/gen/generate.ts:222-230). trace.ts:109-110 calls a two-promotion turn unrepresentable. buildCombos prunes by plan.scoreCc + promo.scoreCc (generate.ts:634-659) to placePlansRoot 16 / placePlansInterior 8 (config.ts:574).)
- The break-even material step is cost step plus about 422 cc per crystal of added rent. That is T2 = T1 + 822 and T3 = T2 + 1222; anything lower is a static loss. (Under a rent-neutral table [300,1122,2344 / 400,1222,2444 / 500,1322,2544], the measured mean change was +28 cc for fire_1->2, +23 for water_1->2 and +37 for plant_1->2 on the h2h replays (first promo-delta run, scratchpad/material/tables.json). The residual is positive because EconDelta truncates to whole crystals (muju/src/ai/hard/eval/features.ts:506), so the real charge is about -4.0 crystals rather than -4.22.)
- At fixed work, material alone moved promoting turns from 0/34 to 15/34 (moderate) and 17/34 (overshoot). The effect saturates because the generator gate becomes binding. (scratchpad/material/search-probe.ts ran HardEngine.searchTurn with work=50,000, the rung the ladder actually funded, from real mid-game Hard turn starts, injecting weights with engine.setWeights (muju/src/ai/hard/engine.ts:387-390). On 22 positions from the h2h games, turns containing a promotion were: cost 0, cost+TierClimb600 6, moderate 9, overshoot 10. On 12 positions from the Rush games: cost 0, moderate 6, overshoot 7. Bodies bought also rose on the h2h positions (13, 22, 24). Positions with Hi-heavy armies promoted under no table. These are single-turn decisions, not strength evidence.)
- Combat value concentrates in the DEF-raising promotions. Straumr, Aegirinn, Mazask, Sachakuna and Tanka cannot be one-shot by any tier-1 unit. Hono, Umeme, Kimubunga, Golge, Karanlik and Sachita are as fragile as their tier-1 form. (scratchpad/material/killtable.ts builds the v2.9 matrix from activeCatalog(), so it uses the engine's own power table (muju/src/ai/hard/core/catalog.ts:191-206). Single-hit tier-1 killers: Sjor has 3, Straumr 0, Aegirinn 0 (its only single killer is Karanlik); Muju, Yan and Sachita die to Hi; Sachakuna, Mazask and Tanka have 0. Hi units needed to kill: Sjor 2, Straumr 3, Aegirinn 4, Mazask/Sachakuna/Tanka 2. The enemy armies are Hi-dominated: aiv2-hard-turn bought 576 fire_1 of 774 bodies, and Rush bought 2,914 fire_1 and nothing else. Under Phasing a promotion applies at once but the unit cannot act until the next turn (muju/docs/PHASING-2026-09-16.md:23-26), so the DEF gain works through the enemy's next turn while the ATK gain waits a turn. aiv2-hard-turn's promotion mix agrees: water_2 115, plant_2 113, water_3 68, plant_3 65, fire_2 54.)
- The kill table in STRATEGIC_UNDERSTANDING is stale for v2.9 in the Mazask row. (muju/docs/hard-ai/STRATEGIC_UNDERSTANDING.md:328 gives Mazask ATK 2, killing Hi and Radi. muju/src/game/units.ts:210-220 now has Mazask at ATK 1, so its row equals Yan's: it one-shots only Sjor and the shadow line, and has power 0 against fire and lightning. The net-income table at :141-150 is also stale for Metal, which is now +3/+3/+3 (mining 3/4/5 minus upkeep 0/1/2).)
- TierClimb (feature 21) is the sum over owned elements of (max tier - 1), taken as me minus them. It rewards only the first unit of an element to reach a tier, and its weight is 0 now and was 0 in the old prior. (muju/src/ai/hard/eval/features.ts:237-251 and :386. git show 43b87b6:muju/src/ai/hard/eval/weights.ts has w[F.TierClimb] = 0 and material = DEFAULT_MATERIAL_CC. Every legal promotion in the sample moved TierClimb by exactly +1, because Hard's armies are all tier 1. With w=600 the mean static change was +122 to +244 per promotion, and the fixed-work probe promoted on 6/22 turns against 9/22 for the moderate table. The break-even weight is about 400-425. 600 matches the moderate table's mean net (+230). 1500 matches the overshoot table.)
- Restoring the old Standard-era prior would not make it promote. That prior was more promotion-averse than the bootstrap. (The 43b87b6 vector had Rent -422 and also EconDelta 80 over a stream that already subtracts upkeep, a double charge of 1.72 x RENT_PV (muju/src/ai/hard/tables/economy.ts:318-327), plus Inv7 -600, TierClimb 0 and material at cost. It rewards tier nowhere.)
- Rent rises with tier (0/1/2 per own turn), but at Hard's measured bank and income a promotion is almost never wrong on cash grounds. (muju/src/game/upkeep.ts:5. Under Phasing rent is paid after mining, from the turn after the promotion (PHASING-2026-09-16.md:20-26). Across the 1,526 Hard Prepare positions, bank p10/p50/p90 was 10/32/63, income 1/4/7, and upkeep p50 0, p90 1, max 2. Of the 5,525 legal promotions, 0 failed the next-bill test (bank_after + income < upkeep_after), 2 failed the six-turn runway test (bank_after + 6 x (I - U) < 6), and Inv7 fired 0 times (muju/src/ai/hard/eval/invariants.ts:198). Hard ends games holding 43.6 crystals on average (4,182 over 96 games). aiv2-hard-turn pays 26 upkeep a game, about 2.4 a turn on 8.2 income, and ends with 12.)
- Inflated material weakens the forecast's penalty for promoting into a forced release, so a guardrail weight should go with it. (The forecast charges a released unit at cat.cost x 100 (muju/src/ai/hard/tables/phasing-economy.ts:216), while the static material term still counts the body at material[]. Under the overshoot table an unaffordable water_1->2 scores about +1775 - 0.9 x 800 = +1055, still positive. Under the cost table it is 0 - 720. Inv7PromoteNoRunway and RentShortfall both have weight 0 now (weights.ts:20-28). Inv7's Phasing meaning is 'promoted this turn and rentShortfall > 0' (invariants.ts:198), so restoring it costs nothing in normal positions.)

## Report
# What tier-2 and tier-3 units are worth, and what that means for material[]

Nothing in the repo was edited. The scratch scripts and their inputs are under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/material/`:
- `killtable.ts` builds the kill matrix.
- `promo-delta.ts` measures the static eval change of every legal promotion.
- `search-probe.ts` runs fixed-work searches under different weight vectors.
- `tables.json`, `tables2.json`, `tables3.json` hold the material tables used.

## Correction to the lead

A promotion is not value-neutral under the bootstrap; it scores about -400 cc. Material goes up by the promotion cost x 100 (`muju/src/ai/hard/config.ts:506-513`) and bank goes down by the same amount (`muju/src/ai/hard/eval/weights.ts:23-24`), so those two cancel. But EconDelta has weight 100 (`weights.ts:25`), and its forecast subtracts every paid rent bill, discounted by 0.9^k over six closures (`muju/src/ai/hard/tables/phasing-economy.ts:219`, `muju/src/ai/hard/core/income.ts:35-47`). That is 4.22 crystals per crystal of new rent, the same number as `RENT_PV = 422`.

I measured this on all 128 replays: 1,526 real Hard Prepare positions containing 5,525 legal promotions. Under the cost table the mean static change was -356 to -478 cc by promotion type, and it was positive in under 1% of cases. The one outlier is the rare Göl→Gölge (n=7) at -86.

There are two gates in series:
1. **Generator gate.** `planPromotions` drops any unit with no mission (`muju/src/ai/hard/gen/promote.ts:252-253`). Only 504 of the 5,525 legal promotions (9%) were ever proposed.
2. **Eval gate.** The ones that are proposed score about -400 cc.

Material can only open the second gate.

## (a) The 18 definitions in NDEF order

Catalogue cost already equals the cumulative crystals to reach that tier, because the promotion steps are 4 and 8 for every element. Upkeep per own turn is 0/1/2 by tier (`muju/src/game/upkeep.ts:5`).

| idx | id | name | element | tier | cost = cumulative | step | upkeep | ATK/DEF/SPD/MINE | mine - upkeep on a live cell |
|---|---|---|---|---|---|---|---|---|---|
| 0 | fire_1 | Hi | fire | 1 | 3 | - | 0 | 2/1/2/1 | +1 |
| 1 | fire_2 | Hono | fire | 2 | 7 | 4 | 1 | 3/1/2/1 | 0 |
| 2 | fire_3 | Kagari | fire | 3 | 15 | 8 | 2 | 4/2/3/1 | -1 |
| 3 | lightning_1 | Radi | lightning | 1 | 3 | - | 0 | 1/1/3/0 | 0 |
| 4 | lightning_2 | Umeme | lightning | 2 | 7 | 4 | 1 | 2/1/4/0 | -1 |
| 5 | lightning_3 | Kimubunga | lightning | 3 | 15 | 8 | 2 | 3/1/5/0 | -2 |
| 6 | water_1 | Sjor | water | 1 | 4 | - | 0 | 2/2/1/2 | +2 |
| 7 | water_2 | Straumr | water | 2 | 8 | 4 | 1 | 2/3/1/2 | +1 |
| 8 | water_3 | Aegirinn | water | 3 | 16 | 8 | 2 | 3/4/2/3 | +1 |
| 9 | shadow_1 | Göl | shadow | 1 | 4 | - | 0 | 2/2/2/0 | 0 |
| 10 | shadow_2 | Gölge | shadow | 2 | 8 | 4 | 1 | 3/2/2/1 | 0 |
| 11 | shadow_3 | Karanlık | shadow | 3 | 16 | 8 | 2 | 4/2/3/2 | 0 |
| 12 | plant_1 | Muju | plant | 1 | 5 | - | 0 | 0/3/1/3 | +3 |
| 13 | plant_2 | Sachita | plant | 2 | 9 | 4 | 1 | 1/3/1/5 | +4 |
| 14 | plant_3 | Sachakuna | plant | 3 | 17 | 8 | 2 | 2/4/1/8 | +6 |
| 15 | metal_1 | Yan | metal | 1 | 5 | - | 0 | 1/3/0/3 | +3 |
| 16 | metal_2 | Mazask | metal | 2 | 9 | 4 | 1 | 1/4/1/4 | +3 |
| 17 | metal_3 | Tanka | metal | 3 | 17 | 8 | 2 | 2/5/2/5 | +3 |

Sources: `muju/src/game/units.ts:5-233`; NDEF order and the upkeep plane in `muju/src/ai/hard/core/catalog.ts:25-28,177`.

## (b) Combat-grounded value

`killtable.ts` recomputes the kill matrix from `activeCatalog()`, so it uses the engine's own power table (`catalog.ts:191-206`). The table in `muju/docs/hard-ai/STRATEGIC_UNDERSTANDING.md:305-329` is stale for v2.9: line 328 gives Mazask ATK 2, but it is now ATK 1 (`units.ts:210-220`), so its row equals Yan's and it has power 0 against fire and lightning.

What each promoted unit gains over its tier-1 form, against tier-1 bodies. "Hi needed" is the number of Hi attacks it takes to kill the unit. Reach is 3 moves plus 1 attack.

| unit | newly one-shots (T1) | newly survives (single T1 hit) | T1 single killers | Hi needed | cheapest T1 kill set | cheapest single killer | cleave | reach |
|---|---|---|---|---|---|---|---|---|
| Hono | Sjor, Göl (plus Gölge, Karanlık, Sachakuna, Mazask) | none | Hi, Radi, Sjor, Göl | 1 | Hi, 3c | Hi 3 | 2 | 7 |
| Kagari | Sjor, Göl (plus Straumr, Tanka) | Radi | Hi, Sjor, Göl | 1 | Hi, 3c | Hi 3 | 3 | 10 |
| Umeme | Muju, Yan | none | Hi, Radi, Sjor, Göl | 1 | Hi, 3c | Hi 3 | 2 | 13 |
| Kimubunga | Sjor, Göl, Muju, Yan | none | Hi, Radi, Sjor, Göl | 1 | Hi, 3c | Hi 3 | 3 | 16 |
| Straumr | none | **Sjor, Göl, Yan (all T1)** | **none** | 3 | Hi+Sjor, 7c, 2 attackers | Gölge 8 | 2 | 4 |
| Aegirinn | none at T1 (adds Straumr) | all T1 | **none** | 4 | Sjor+Sjor, 8c | Karanlık 16 | 3 | 7 |
| Gölge | none at T1 (adds Straumr) | none | Sjor, Göl, Yan | 2 | Sjor, 4c | Sjor 4 | 2 | 7 |
| Karanlık | Muju, Yan (adds Aegirinn, Sachita) | none | Sjor, Göl, Yan | 2 | Sjor, 4c | Sjor 4 | 3 | 10 |
| Sachita | Sjor, Göl | none | Hi | 1 | Hi, 3c | Hi 3 | 2 | 4 |
| Sachakuna | Hi, Radi, Sjor, Göl | **Hi** | **none** | 2 | Hi+Hi, 6c | Hono 7 | 3 | 4 |
| Mazask | none (same as Yan) | **Hi**; becomes mobile (SPD 0 to 1) | **none** | 2 | Hi+Hi, 6c | Hono 7 | 2 | 4 |
| Tanka | Hi, Radi | Hi | **none** | 2 | Hi+Hi, 6c | Kagari 15 | 3 | 7 |

Three things drive the value estimate:
- **The enemy is a Hi swarm.** aiv2-hard-turn bought 576 fire_1 out of 774 bodies, and Rush bought 2,914 fire_1 and nothing else. Seventy-two of Hard's 82 losses were home-checkmates.
- **The corner has two neighbours.** A Straumr or Aegirinn on the home corner cannot be killed by a Hi-only army, because two Hi deal 2 damage against DEF 3 or 4. A Sjor there dies to two Hi.
- **Phasing delays the attack gain.** A promotion applies at once, but the unit cannot act until the next turn (`muju/docs/PHASING-2026-09-16.md:23-26`). The DEF gain works through the enemy's next turn; the ATK gain waits a turn, on a body that usually still has DEF 1.

aiv2-hard-turn's own promotion mix fits this: water_2 115, plant_2 113, water_3 68, plant_3 65, fire_2 54.

### The value model

material[] is gross of rent, because the eval charges rent separately (DESIGN F9; `muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:106` allows material to become a distinct utility model).
- T1 stays at cost x 100. That keeps BUY and pending conservation intact (`muju/src/ai/hard/eval/pending.ts:116` values a commitment at paid cost) and keeps the fire_1 = 300 scale pin.
- A promotion is break-even at T2 = T1 + 400 + 422 and T3 = T2 + 800 + 422.
- Moderate adds a combat premium on top of break-even. Overshoot adds three times that premium plus a flat 300.

Premiums for the T2 step, in cc: fire 150, lightning 50, water 350, shadow 50, plant 75, metal 300. For the T3 step: fire 150, lightning -100, water 450, shadow 250, plant 300, metal 350. Lightning_3 is set below break-even on purpose: REACH proposes lightning promotions 100% of the time, and they are the weakest investment (DEF 1, mines 0, net -2 a turn).

| def | cost (current) | break-even | moderate | overshoot | moderate net of rent vs cost |
|---|---|---|---|---|---|
| fire_1 Hi | 300 | 300 | 300 | 300 | |
| fire_2 Hono | 700 | 1122 | 1275 | 1875 | 853 vs 700 |
| fire_3 Kagari | 1500 | 2344 | 2650 | 3850 | 1806 vs 1500 |
| lightning_1 Radi | 300 | 300 | 300 | 300 | |
| lightning_2 Umeme | 700 | 1122 | 1175 | 1575 | 753 vs 700 |
| lightning_3 Kimubunga | 1500 | 2344 | 2300 | 2800 | 1456 vs 1500 |
| water_1 Sjor | 400 | 400 | 400 | 400 | |
| water_2 Straumr | 800 | 1222 | 1575 | 2575 | 1153 vs 800 |
| water_3 Aegirinn | 1600 | 2444 | 3250 | 5450 | 2406 vs 1600 |
| shadow_1 Göl | 400 | 400 | 400 | 400 | |
| shadow_2 Gölge | 800 | 1222 | 1275 | 1675 | 853 vs 800 |
| shadow_3 Karanlık | 1600 | 2444 | 2750 | 3950 | 1906 vs 1600 |
| plant_1 Muju | 500 | 500 | 500 | 500 | |
| plant_2 Sachita | 900 | 1322 | 1400 | 1850 | 978 vs 900 |
| plant_3 Sachakuna | 1700 | 2544 | 2925 | 4275 | 2081 vs 1700 |
| metal_1 Yan | 500 | 500 | 500 | 500 | |
| metal_2 Mazask | 900 | 1322 | 1625 | 2525 | 1203 vs 900 |
| metal_3 Tanka | 1700 | 2544 | 3200 | 5100 | 2356 vs 1700 |

### The three arrays, NDEF order

```json
{"cost":      [300,700,1500,300,700,1500,400,800,1600,400,800,1600,500,900,1700,500,900,1700],
 "moderate":  [300,1275,2650,300,1175,2300,400,1575,3250,400,1275,2750,500,1400,2925,500,1625,3200],
 "overshoot": [300,1875,3850,300,1575,2800,400,2575,5450,400,1675,3950,500,1850,4275,500,2525,5100]}
```

For reference, break-even is `[300,1122,2344,300,1122,2344,400,1222,2444,400,1222,2444,500,1322,2544,500,1322,2544]`.

### Static change of a promotion under each table

This is the mean static change over the 5,525 legal promotions at real Hard Prepare positions, with how often the generator proposed each one.

| promotion | legal n | generator proposed | cost | cost + TierClimb 600 | moderate | overshoot |
|---|---|---|---|---|---|---|
| fire_1→2 | 2940 | 1 (0%) | -401 | +196 | +174 | +774 |
| fire_2→3 | 16 | 16 (100%, REACH/ANCHOR) | -419 | +181 | +156 | +756 |
| lightning_1→2 | 117 | 117 (100%, REACH) | -392 | +208 | +83 | +483 |
| lightning_2→3 | 1 | 1 | -400 | +200 | -75 | +25 |
| water_1→2 | 1276 | 128 (10%, ANCHOR/SURVIVE) | -408 | +192 | +367 | +1367 |
| water_2→3 | 57 | 57 (100%, REACH) | -356 | +244 | +519 | +1719 |
| shadow_1→2 | 7 | 0 | -86 | +514 | +389 | +789 |
| plant_1→2 | 929 | 57 (6%, INCOME) | -395 | +205 | +105 | +555 |
| plant_2→3 | 63 | 8 (13%, SURVIVE) | -478 | +122 | +247 | +1147 |
| metal_1→2 | 99 | 99 (100%, REACH/SURVIVE) | -397 | +203 | +328 | +1228 |
| metal_2→3 | 20 | 20 (100%) | -455 | +145 | +320 | +1320 |

### Does it change what the engine plays?

I ran `HardEngine.searchTurn` at fixed work 50,000, the rung the ladder actually funded, from real mid-game Hard turn starts. Weights were injected with `engine.setWeights` (`muju/src/ai/hard/engine.ts:387-390`).

| sample | cost | cost + TierClimb 600 | moderate | overshoot |
|---|---|---|---|---|
| 22 positions, h2h vs aiv2-hard-turn: turns with a promotion | 0 | 6 | 9 | 10 |
| 22 positions, h2h: bodies bought | 13 | 18 | 22 | 24 |
| 12 positions, vs Rush: turns with a promotion | 0 | not run | 6 | 7 |

- **What got promoted:** water_1, water_2, metal_1, metal_2, lightning_1, fire_2 and plant_2. That is exactly the set the generator proposes.
- **What never promoted:** Hi-heavy armies, under any table. The response therefore saturates between moderate and overshoot.

These are single-turn decisions, not strength evidence.

## (c) TierClimb

`tierClimb(p, side)` is the sum, over the elements the side owns, of (highest tier of that element - 1). The feature is that value for me minus the same for the opponent (`muju/src/ai/hard/eval/features.ts:237-251,386`). It ranges 0-12 per side. Its weight is 0 now and was 0 in the old prior (`git show 43b87b6:muju/src/ai/hard/eval/weights.ts`).
- It is a tech feature, not a per-body value. The second Straumr earns nothing, and losing a duplicate costs nothing.
- In Hard's actual positions every legal promotion moved it by exactly +1, because the armies are all tier 1.

**Equivalent weights:** break-even is about 400-425. `w[TierClimb] = 600` matches the moderate table's mean net of about +230, and measured +122 to +244. `1500` matches overshoot.

**Trade-off:** TierClimb leaves exchange values at cost, so it is the safer overshoot experiment. But it ignores element, so a useless Radi→Umeme→Kimubunga earns the same as Sjor→Aegirinn. It produced 6/22 promoting turns against 9/22 for the moderate table.

## (d) Upkeep and rent under Phasing, and when promoting is wrong

Rent is 0/1/2 by tier (`muju/src/game/upkeep.ts:5`). It is paid after mining each own turn, starting the turn after the promotion (`PHASING-2026-09-16.md:20-26`). An unpaid unit is released and its whole cumulative cost is lost. The default keep order is most expensive first (`upkeep.ts:56-60`).

While the unit stands on reserve, per-unit mining minus upkeep is:
- Plant: +3 / +4 / +6.
- Metal: +3 / +3 / +3 at v2.9 (the +2/+2/+2 at STRATEGIC_UNDERSTANDING:141-150 is stale).
- Water: +2 / +1 / +1.
- Shadow: 0 / 0 / 0.
- Fire: +1 / 0 / -1.
- Lightning: 0 / -1 / -2.

So plant, metal and shadow promotions fund their own rent on a live cell. Water, fire and lightning lose 1 crystal a turn for each tier step taken, except water_2→3, which breaks even.

Let B be the bank before promoting, s the step (4 or 8), I the income per own turn, U' the total upkeep afterwards, and H = 6 to match the eval horizon. Promoting is wrong when:
1. **Next-bill floor:** B - s + I < U'. The unit, or a cheaper renter, is released next turn. This is what Inv7 tests now (`muju/src/ai/hard/eval/invariants.ts:198`).
2. **Runway floor** (STRATEGIC_UNDERSTANDING invariant 7, :642): B - s + H x (I - U') < 6. If I >= U', you only need B >= 10 for a T2 step and 14 for a T3 step. With dry stacks (I = 0), a T2 step needs B >= 16 at U'=1, 22 at U'=2 and 28 at U'=3; a T3 step needs 26 at U'=2 and 38 at U'=4.
3. **Opportunity cost:** a fire, lightning or water T2 that lives L turns costs 4 + L crystals. At L = 8 that is 12 crystals, about 4 Hi. It is wrong only if those crystals would otherwise become useful bodies.

Measured at Hard's 1,526 Prepare positions:
- Bank p10/p50/p90 was 10/32/63, income 1/4/7, and upkeep p50 0, p90 1, max 2.
- Of the 5,525 legal promotions, 0 failed the next-bill floor, 2 failed the runway floor, and Inv7 fired 0 times.
- Hard ends games with 43.6 crystals unspent on average. aiv2-hard-turn pays about 2.4 upkeep a turn on 8.2 income and ends with 12.

Rent is not what is holding promotions back, and promoting is essentially never wrong on cash grounds at these levels.

One interaction to guard against: the forecast charges a forced release at `cat.cost x 100` (`phasing-economy.ts:216`), but the static material term keeps the body at material[]. With inflated material, a promotion the bank cannot sustain still scores positive; for water_1→2 under overshoot that is about +1775 - 720. Pair the material change with `w[Inv7PromoteNoRunway] = -600` for moderate or `-2000` for overshoot, or with `w[RentShortfall] = -300`. Inv7 never fires in normal positions, so this costs nothing.

## What I would try, in order

1. **Moderate table plus Inv7 = -600,** through a lab weights arm or `setWeights`. Expect promotions to go from about 0.1 a game to a few a game, all water, metal, lightning and plant_2→3.
2. **Open the generator gate:** add an attack mission and a "more hits needed" SURVIVE at `muju/src/ai/hard/gen/promote.ts:147-198,252-253`. Without it Hi→Hono and most Sjor→Straumr promotions can never happen, and the material response saturates.
3. **Overshoot table, or `w[TierClimb] = 1500` as the exchange-neutral variant,** to find where it over-promotes. The most likely failure is Umeme spam, since lightning is always generated.

Restoring the old Standard prior will not help. It had TierClimb 0, material at cost, Rent -422, and a second rent charge inside EconDelta (`muju/src/ai/hard/tables/economy.ts:318-327`).

Process notes:
- Changing the default material moves weightsHash, the book weightsKey (`muju/src/ai/hard/book/probe.ts:91`) and the pinned desktop config hash. `tests/ai/hard/catalog.test.ts` pins material to cost.
- `finishArmWeights` in `muju/lab/hard-ai/ablate/arms.ts:303-313` copies the base material, so a material arm needs a small extension.
- Per CLAUDE.md, an AI change goes through `python3 tools/muju-content-dag.py plan`.