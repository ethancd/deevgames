HEADLINE: AIEngineV2 spends because its eval prices banked cash at 0.5/crystal, board material at 1.0/crystal (+0.4 per new tier step, no rent term at all) and its beam chains up to 8 Prepare actions; the new Hard engine prices cash == material and charges rent PV, so a promotion is worth -500 cc, AND its generator never even offers 91% of legal promotions (fire_1->fire_2: 24 of 2,175) and truncates the purchase menu to fire/lightning. Eval weights alone cannot fix it; TierClimb/material-tier bumps/Rent/BankExcess flip the eval sign, but promote.ts mission gating and purchase.ts plan truncation are code-level blockers.

## Knobs
- w[TierClimb] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (unset => 0); feature at eval/features.ts:238-251,386: now 0 (also 0 in the 43b87b6 prior); try 40 (v2 parity, only meaningful inside the mirror bundle), 600 (smallest value that flips a promotion positive: measured +100 cc), 1500 (deliberate overshoot); Same definition as v2's techTreeProgress (sum over elements of max tier - 1). First promotion in each element becomes net-positive in both the leaf eval and the K-beam within-turn score (it is a stage-1 feature).; risk: Credits only the highest tier per element, so it promotes one unit per element then stops; overshoot promotes into rent it cannot pay (RentShortfall/Inv14 weights are 0) and forces releases.
- material[tier-2 / tier-3 defs] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:506-513 (DEFAULT_MATERIAL_CC), scored at eval/evaluate.ts:122-131: now cost*100 (700/800/900 tier-2, 1500/1600/1700 tier-3); try tier-2 = cost*100+600 and tier-3 = cost*100+1200 (measured promotion +100 cc); overshoot +1500/+3000 (measured +1000 cc); could also vary per element (e.g. larger for water/plant which v2 promotes most); Every promotion (not just the first per element) becomes worth more than the cash it costs; also makes capturing enemy promoted units and protecting own ones matter more.; risk: materialIsCataloguePrior() (weights.ts:58-62) becomes false so out[F.Material] no longer equals the scored material (Texel/audit readers); overshoot => promote everything, go insolvent, release units at upkeep.
- w[Rent] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; feature eval/features.ts:172-179,189: now 0 (prior was -422); try +422 (cancels the rent PV EconDelta already charges: promotion -500 -> -78), +500, overshoot +900; Mirrors v2, which has no rent term at all. Removes the -400..-500 cc per tier step that makes every promotion negative today.; risk: A positive Rent weight literally rewards owing rent; with overshoot it holds/creates rent-bearing units it cannot fund. Do NOT restore the prior -422: with EconDelta it double-charges (known B5 'rentOnce' issue, config.ts:433-441).
- w[BankLiquid] / w[BankExcess] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:23-24; features.ts:190-191: now 100 / 100; try 50/50 (v2's 0.5), 90/25 (old prior), overshoot 100/0 and 0/0; Every crystal converted to material or a pending summon gains (100 - w) cc, breaking the exact tie that lets the pinned empty Prepare plan win (lightning_1/shadow_1 buys go 0 -> +150/+200; plant_1 +658 -> +908). Also shrinks the -cost*100 penalty purchases suffer in the stage0+1 K-beam ranking. Expect spent/gained to rise sharply.; risk: Not sufficient for promotions on its own (still -100 cc at BankExcess=0). At 0 it dumps cash into disruptable squares and keeps no rent reserve; pair with a RentShortfall or Inv14LiquidityFloor penalty.
- v2-mirror bundle: BankLiquid=50, BankExcess=50, Rent=+500, TierClimb=+40 @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (register as a weights arm in lab/hard-ai/ablate/arms.ts:256-368 rather than editing DEFAULT_WEIGHTS): now 100 / 100 / 0 / 0; try exactly this bundle first (measured: promote +240 cc = v2's +2.4; buy fire +571, plant +908, lightning +150); then scale TierClimb x10 as the overshoot; Reproduces AIEngineV2's purchase/promotion preferences in Hard's units. Best single experiment for 'does it start spending like v2'.; risk: Inherits v2's blind spot (rent is free) — tolerable for v2 because its rollouts pay rent in the tree; Hard searches depth 1-2 so it will not see the bill. Generator gating still blocks ~91% of promotions until fixed.
- promote.ts bestMission fallback (generic STRENGTH mission) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:196-197 (returns -1) and :252-253 (skip): now no mission => promotion never generated (fire_1->fire_2 offered 24 of 2,175 times; overall 339 of 3,842); try emit every legal promotion with benefit = K * (dATK + dDEF + dSPD + dMINE), K in {100, 300, 1000 overshoot}; keep maxPromotions=8 cap (config.ts:552); Makes promotions reachable by the search at all. Without this no weight change can produce fire_2/shadow_2, and water_2/plant_2 stay rare.; risk: CODE change, not a config value; more combos per Prepare node => less depth (already 1-2). Needs the contract's deviation note (M6-BOOTSTRAP-CONTRACT.md:1).
- RENT_PV in the promotion ORDERING score @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:255-256 (RENT_PV=422 at core/income.ts:47): now scoreCc = benefit + 0 - 422*deltaUpkeep (REACH = -362, INCOME ~ -296, SURVIVE water_1 = -22); try 0 for ordering only, or 211; overshoot: +422 (bonus); Promotion combos stop ranking below every promotion-less sibling, so they survive buildCombos' prune to maxPlacePlans (generate.ts:634-695), especially at interior nodes (8 plans).; risk: RENT_PV is shared with other code (tables/economy.ts); change it locally in promote.ts, not the constant.
- gen.purchase.maxPlans (and keepPerMultiset) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:543; truncation at gen/purchase.ts:443-461: now maxPlans 12, maxMultisets 35, keepPerMultiset 3 => first 4 multisets (all fire_1-led) fill the menu; cap hit at 827/914 Prepare points; try 105 (=35*3, no truncation), overshoot 200 (buffer is max(maxPlans,200)+1, generate.ts:344); or keepPerMultiset 1 with maxPlans 35; proper fix is to score all multisets then keep the top 12; plant_1/metal_1/water_1 and multi-body plans reach the combo stage, where buildCombos prunes by SCORE instead of enumeration order. Should raise income (Hard gains 62 vs v2's 88 per game) and spending.; risk: More generator work per node; pure fire-rush plans no longer favoured by accident, so behaviour vs Rush may shift either way.
- gen.maxPlacePlans and K @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:573-576 (placePlansRoot 16 / interior 8, K 24 / kInterior 16): now 16/8 and 24/16; try existing arms place-wide 32/16 (lab/hard-ai/ablate/arms.ts:495) and k48/k96 (arms.ts:481-482); overshoot place 64/32; More Prepare variety survives per Act line; fewer purchase/promotion turns displaced from the root list by the stage0+1 ranking.; risk: Depth is already 1-2 at 1.5 s; widening costs depth. An earlier note in engine-v2.ts:78-79 records that a wider beam scored worse for v2.
- One-promotion-per-Prepare limit @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/generate.ts:222-231, :646-668 (promo2 used only by runFortifyPairs :709-740): now at most 1 non-FORTIFY promotion per turn (Hard had >=2 spend actions in 3% of Prepares; v2 31%); try allow promo pairs for ordinary missions (top-2 by score), overshoot: top-3; Lets it spend down a 30-crystal bank in one Prepare the way v2's 8-step beam does.; risk: Code change; quadratic combo growth, so cap the pool like FORTIFY_PAIR_POOL (generate.ts:204).
- Within-turn (K-beam) scorer ignores pending purchases @ /Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:355-360; ranking at gen/generate.ts:879,895-927: now stage0+stage1 only: a BUY scores -cost*100 (PendingValue is stage 2, features.ts:508); try add 100*pending principal (p.pendCost) to the within-turn score, or evaluate stage 2 for the K cut; Purchase turns stop being the first candidates displaced from the root list.; risk: Code change; stage 2 in the within-turn scorer is expensive (economy forecast per line).
- Home-defence block: w[HomeInvaded], w[HomeThreat], w[HomeCountdown], w[HomePlug], w[HomeRescuers], w[Inv10HomeReachable], w[Inv11HomeBare] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; features.ts:181-185,369-372; invariants.ts:214-219; tables/home.ts:67-80: now all 0; try prior values -4000 / -400 / -180 / +220 / +90 / -400 / -250; v2-equivalent HomeInvaded is about -22000 (v2: -200 -20 eval points); overshoot: x5 on HomeThreat/Inv10; Inv10HomeReachable is literally v2's rule (corner reachable within 4 actions and no rescuer/plug, strategies.ts:31-36). Addresses the 72/82 home-checkmate losses and gives defensive buys/promotions (water_2 DEF 3, metal) a reason to exist.; risk: Contract deliberately zeroed these (M6-BOOTSTRAP-CONTRACT.md:101,104; Inv11 has stale recruitment premises); overshoot => turtling (Inv13Turtle is 0 so nothing pushes back).
- Tactical block: w[Hanging], w[KillAvailable], w[Exposure] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; features.ts:393-404,449-459,373: now 0 / 0 / 0; try prior -50 / +35 / -20; v2-equivalent is much harsher: killThreatsReceived -2.0 per crystal => Hanging about -200, threatLevel +0.4 => KillAvailable about +40; overshoot Hanging -400; Gives SURVIVE-type promotions and defensive purchases a leaf-eval payoff at depth 1-2 where the search cannot see the capture itself.; risk: Overlaps material consequences the search does see (contract line 102); too negative => passive play.
- Random-variation harness @ /Users/ethancd/src/deevgames/muju/lab/hard-ai/ablate/arms.ts:256-368,480-496 (weights arms => `hard@ablate:<name>` in the ladder): now no spend/promotion arms registered; try log-uniform random search over BankExcess [0,100], TierClimb [0,1500], Rent [-422,+900], tier material bump [0,1500], HomeThreat [-2000,0], Hanging [-400,0]; score each sample first on behaviour (promotions/game, spent/gained, final bank) in short fixed-work games vs Rush and aiv2-medium, then on results; Finds the fix/overshoot boundary cheaply; behaviour metrics move long before win rate does.; risk: The bootstrap contract says no tuning is authorized from outcomes yet; keep DEFAULT_WEIGHTS frozen and run these as named ablation arms.

## Findings
- (a) AIEngineV2 values cash at 0.5/crystal and on-board material at 1.0/crystal, so ANY conversion of cash to units gains +0.5 per crystal; there is no rent/upkeep term anywhere in its static eval. (muju/src/ai/types.ts:73-88 (unitValue 1.0, resourceAdvantage 0.5, techTreeProgress 0.4, unitHealth 0.1, killThreatsReceived -2.0); muju/src/ai/evaluation.ts:47-56 (the two terms), :137-143 (unit value = catalogue cost + pendingMaterial). upkeepDue is referenced only in shouldResign (evaluation.ts:412). scoring.ts:23-24 comment: 'Buying/promoting transfers cash into another asset; evaluatePosition already accounts for that trade, so do not penalize it twice.')
- (a) Measured v2 deltas for one Prepare action (Phasing opening, bank 20): PROMOTE = +2.40 eval (+2.30 plan score) = 0.5*4 + 0.4 techTree (+0.1 for water's +1 DEF); BUY safe fire_1 +1.38, water_1 +1.96, plant_1/metal_1 +2.54, lightning_1 +1.20; END_PLACE_PHASE = -0.60/-0.70. So ending Prepare always scores below any affordable safe buy or promotion. (Scratch probe /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/v2mirror/delta.mts. Formula sources: pending summon valued 0.9*cost if safe, 0.5*cost if disruptable (planner/summons.ts:39-42) -> net +0.4c or 0; pending income 0.9*take*0.2 (summons.ts:45-49, evaluation.ts:156-158); techTree = sum over elements of (max tier - 1) (evaluation.ts:307-314); plan score = static + 20/kill + 0.5*damage + 1.5*income - 0.1/action (planner/scoring.ts:29-35).)
- (b) There is NO explicit 'spend down the bank' rule in v2. Spend-down is emergent: beam search runs up to 8 Prepare steps (and Act beams continue +8 steps into Prepare under Phasing), every spend step adds +1.2..+2.5 vs -0.1 action cost, purchases/promotions are injected as protected root candidates, and one slot each is reserved for 'promotion_play' and 'expansion' plans. (planner/beam.ts:23 (maxSteps = actionsRemaining+1+8 in Act under Phasing, 8 in Prepare), :34-41; planner/placement.ts:24-61 (top-2 squares per definition, :50 every legal promotion its own plan, :51-59 water_1/metal_1 next-turn blockers near each enemy), :17-20 preferSafePurchases keeps risky buys if no safe one exists 'so the economy cannot freeze'; planner/strategies.ts:42-51 reserveStrategies tags; engine-v2.ts:151,199. turnFunding.ts is milliseconds-only (reserve turnBudget/8 per later segment, :53,:70-83) and phasingPreview.ts is a UI opt-in flag; neither touches crystals. Replays: v2 ends Prepare with bank<3 in 60% of Prepares (mean 7.4 left), >=2 spend actions in 31%; Hard mean 25.5 left, >=2 spend actions in 3% (scratch v2mirror/spend.py).)
- (c) v2 home defence = small static prior + big tactical overrides: -20 eval if my corner is occupied (0.08*250), -200 strategicValue if invaded, per-enemy-attacker proximity term 1.2*(5 - actions to my corner), and -2*(4-closest) if the corner is reachable this turn with NO armed defender within Manhattan 2 of home (only -0.4*(...) with one). Plus hard overrides: proved home-rescue plan scored 100000, raids verified against the defender's reply (+5000 if no rescue), terminal +/-100000 seen by 4-ply rollouts. (evaluation.ts:44; game/victory.ts:115-118; planner/strategies.ts:29 (raiding prior, symmetric so enemy proximity counts against me), :31-36 (defenders within 2, 0.4 vs 2), :38 (-200); engine-v2.ts:156-161 (home-rescue), :175-189 and :203-222 (occupation checks +5000/-150/-50); search/mcts.ts:57,83,93; evaluation.ts:237-252 killThreatsReceived (-2.0 x cost of any own unit that is one-shot by an adjacent enemy) and :269-281 spawnDenialPressure -1.5.)
- In the new Hard eval a promotion is strictly NEGATIVE: -500 cc measured for fire_1, water_1 and plant_1 alike (Material +4, BankExcess -4 cancel; EconDelta -5 = present value of the new 1/turn rent over 6 closures). Non-mining buys (lightning_1, shadow_1) are exactly 0 and therefore tie with the empty plan; mining buys on ore are +421 (fire_1) to +658 (plant_1/metal_1). (v2mirror/delta.mts feature diffs: 'PROMOTE fire_1 ... Material+4 Rent+1 BankExcess-4 TierClimb+1 EconDelta-5', 'BUY lightning_1 ... BankExcess-3 PendingValue+300 => 0'. Rent enters livePV at muju/src/ai/hard/tables/phasing-economy.ts:219 (livePVQ16 -= gamma^t * (paidRent + releasedPrincipal)); EconDelta weight 100 at eval/weights.ts:25; Material/Bank at weights.ts:22-24 and features.ts:188-191.)
- Reverting to the 43b87b6 hand-prior vector would NOT make it promote: promotions score -372 (water), -522 (fire), -882 (plant) under it, because Rent -422 and EconDelta 80 both charge the rent, TierClimb is 0 there too, and DepletionWaste/Inv7/Inv14 add more penalties. (v2mirror/delta.mts column dHardPrior (prior vector rebuilt from `git show 43b87b6:muju/src/ai/hard/eval/weights.ts`, PendingValue=1 added). TierClimb = 0 in both vectors.)
- The Hard GENERATOR does not offer most promotions. At 988 real Hard Prepare decision points from today's 96 h2h games (mean bank 29.7) a legal affordable promotion existed at 987, but planPromotions offered any candidate at only 276 (28%); 339 of 3,842 legal promotions (8.8%) were offered; fire_1->fire_2: 24 of 2,175 (FORTIFY only), water_1: 78 of 822, plant_1: 33 of 583. vs Rush: 199 of 1,717. (muju/src/ai/hard/gen/promote.ts:147-198: a promotion is emitted only with a mission (FORTIFY / SURVIVE / ANCHOR / INCOME needs plant on reserve >= 2*newMine i.e. >=10 / REACH needs a speed gain); otherwise `return -1` (:196-197) and the slot is skipped (:252-253). fire_1->fire_2 (+1 ATK only) and shadow_1->shadow_2 have no mission ever. Ordering score = benefit - 422*deltaUpkeep (:254-256, RENT_PV core/income.ts:47), e.g. REACH = 60-422 = -362. Scratch v2mirror/coverage.mts (caveat: placedThisTurn is not recoverable from replays, identical assumption on both counts).)
- The Hard purchase menu is truncated in ENUMERATION order before it is sorted, so with bank >= 6 it is almost all fire_1/lightning_1. The 12-plan cap was hit at 827 of 914 Prepare points; plant_1 was on the menu at 146/914 and metal_1 at 87/914 although affordable at 914/914. All 492 Hard purchases in the 96 h2h games were fire_1 (457) or lightning_1 (35); v2 bought 160 plant_1 and 38 water_1. (muju/src/ai/hard/gen/purchase.ts:443-461 (`for m < msCount && written < limit` then sortPlans at :463); multisets are enumerated depth-first starting with fire_1 (:145-160, catalogue order); keepPerMultiset 3 * first 4 multisets = 12 = maxPlans (config.ts:543). Scratch v2mirror/menu2.mts shows at bank 12: all 11 non-empty plans contain fire_1; v2mirror/agg.py and coverage.mts for the counts.)
- Two more structural spend limits in Hard: (1) a Prepare combo carries at most ONE non-FORTIFY promotion; (2) the root K=24 beam ranks finished turns by stage0+stage1 only, where a BUY is visible only as -cost*100 of bank (PendingValue is a stage-2 feature), so purchase turns are the first displaced. (gen/generate.ts:222-231 and :646-668 (single promo index; promo2 only for FORTIFY pairs); engine.ts:355-360 (within-turn score = evaluator.stage0 + stage1); generate.ts:879 and :895-927 (offer() displaces lowest gainCc); features.ts:508 PendingValue is extracted in stage 2; delta.mts shows BUY fire_1 changes only BankExcess(-3) in stages 0/1.)
- Candidate weight vectors measured on the static eval (delta cc for one promotion, bank 20): bootstrap -500; BankLiquid=BankExcess=50 -> -300; BankExcess=0 -> -100 (bank discount alone never flips it); Rent=+422 -> -78; TierClimb=+600 -> +100; material tier-2 +600 / tier-3 +1200 -> +100; overshoot material +1500/+3000 -> +1000; v2-mirror bundle (Bank 50/50, Rent +500, TierClimb +40) -> +240, which equals v2's +2.4 in the same units, and lifts BUY lightning_1 from 0 to +150, plant_1 from +658 to +908. (Scratch /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/v2mirror/variants.mts (uses Evaluator.full with cloned DEFAULT_WEIGHTS; no repo edits).)
- (d) Catalogue: every tier1->2 promotion costs 4 and every tier2->3 costs 8 (cost difference); upkeep is 0/1/2 per turn for tier 1/2/3; HP is the defense stat (damage resets at the attacked player's turn start); kill iff attack power (+/-1 elemental) >= defense - damage. (muju/src/game/units.ts:5-233, :278-283; game/promotion.ts:9-23; game/upkeep.ts:5; game/types.ts:83; game/combat.ts:219-226; game/elements.ts:98-110. Full table in the report.)

## Report
# Why AIEngineV2 spends and promotes under Phasing, and how to make the new Hard engine do the same

No repo files were touched. Scratch scripts are in `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/v2mirror/` (`delta.mts`, `variants.mts`, `menu.mts`, `menu2.mts`, `coverage.mts`, `rootk.mts`, `agg.py`, `spend.py`). All code paths below are under `/Users/ethancd/src/deevgames/muju/`.

## Short answer

- AIEngineV2 has no spend rule. Its evaluation simply makes every crystal in the bank worth half a crystal on the board, never charges rent, and adds a bonus per new tier.
- Its beam then chains up to 8 Prepare actions per plan, so it keeps buying and promoting until nothing is affordable.
- The new Hard engine is blocked at four separate layers:
  1. **Eval:** cash equals material, and the rent present value is charged through EconDelta, so every promotion scores −500 cc.
  2. **Promotion generator:** 91% of legal promotions are never generated. Only 339 of 3,842 legal promotions were offered, and for fire_1→fire_2 only 24 of 2,175.
  3. **Purchase generator:** the purchase menu is cut to 12 plans in enumeration order, which is fire_1 first. Hard bought 457 fire_1, 35 lightning_1, and 0 plant, water or metal in 96 games.
  4. **Combo and beam limits:** at most one promotion per Prepare, and a BUY looks like −cost×100 to the ranking that fills the root K=24 list.
- Reverting to the 43b87b6 hand-prior vector would not help. Promotions score −372 to −882 cc under it, and TierClimb is 0 there too.

## (a) How AIEngineV2 values a purchase, a promotion, a higher tier, and idle cash

The default weights are at `src/ai/types.ts:73-88`. The ladder uses them unmodified (`lab/hard-ai/ladder/engines.ts:263`, no `setWeights` call).

| Item | Value | Where |
|---|---|---|
| Unit on board | 1.0 × catalogue cost | `evaluation.ts:47-50`, `:137-143` |
| Idle cash | 0.5 × crystals | `evaluation.ts:53-56` |
| Pending summon, safe | 0.9 × cost | `planner/summons.ts:39-42` |
| Pending summon, disruptable (an enemy can reach the corner-to-square rectangle) | 0.5 × cost | `planner/summons.ts:39-42`, test at `:30-37` |
| Pending miner income | 0.2 × 0.9 × min(mining, ore); safe summons only | `summons.ts:45-49`, `evaluation.ts:156-158` |
| Higher tier | +0.4 × Σ over elements (max tier − 1) | `evaluation.ts:126-129`, `:307-314` |
| Tier stats | +0.1 × DEF (`:229-235`); attack only via threatLevel 0.4 × cost of killable adjacent targets (`:163-180`) | |
| Rent / upkeep | **none** | `upkeepDue` appears only in `shouldResign`, `evaluation.ts:412` |
| Plan score | static + 20 per kill + 0.5 × damage + 1.5 × (income gained, plus projected income in Act only) − 0.1 per action | `planner/scoring.ts:29-35` |
| Plan score in beam and at root | adds `strategicValue` | `planner/beam.ts:40` |

The comment at `scoring.ts:23-24` states the intent: "Buying/promoting transfers cash into another asset; evaluatePosition already accounts for that trade, so do not penalize it twice."

Measured on a Phasing opening with bank 20 (`delta.mts`):

| Action | v2 eval Δ | v2 plan Δ | Hard bootstrap Δ (cc) | Hard 43b87b6 prior Δ (cc) |
|---|---|---|---|---|
| PROMOTE fire_1 | +2.40 | +2.30 | −500 | −522 |
| PROMOTE water_1 | +2.50 | +2.40 | −500 | −372 |
| PROMOTE plant_1 | +2.40 | +2.30 | −500 | −882 |
| BUY fire_1 (ore 8, safe) | +1.38 | +1.28 | +421 | +646 |
| BUY lightning_1 | +1.20 | +1.10 | 0 | +225 |
| BUY water_1 | +1.96 | +1.86 | +619 | +799 |
| BUY shadow_1 | +1.60 | +1.50 | 0 | +300 |
| BUY plant_1 / metal_1 | +2.54 | +2.44 | +658 | +733 |
| END_PLACE_PHASE | −0.60 | −0.70 | n/a | n/a |

In v2 a tier-1→2 promotion (cost 4) is worth 0.5 × 4 + 0.4 = +2.4. A safe buy is worth 0.4 × cost plus 0.18 × mining take. A disruptable buy is worth exactly 0, which is why `preferSafePurchases` exists.

The Hard feature diff for a promotion is `Material+4 BankExcess-4 EconDelta-5`. Material and bank cancel, and the rent present value is charged. EconDelta includes paid rent (`src/ai/hard/tables/phasing-economy.ts:219`) with weight 100 (`eval/weights.ts:25`).

## (b) "Spend down the bank" logic in v2

There is no explicit rule. The behaviour is structural:

1. **Beam depth.**
   - In Prepare the beam runs `maxSteps = 8`.
   - In Act under Phasing it runs `actionsRemaining + 1 + 8`, so whole-turn plans continue through upkeep into purchases and promotions (`planner/beam.ts:23`).
   - Each spend step adds +1.2 to +2.5 against an action cost of −0.1.
   - END_PLACE scores lower than any affordable safe spend.
2. **Protected root candidates** (`planner/placement.ts:24-61`):
   - the top 2 squares per definition (`:38-48`);
   - every legal promotion as its own plan (`:50`);
   - water_1 and metal_1 "next-turn blockers" near each of up to 8 enemies (`:51-59`).
3. **Risky buys are kept when no safe one exists**, "so the economy cannot freeze" (`placement.ts:13-20`).
4. **Reserved root slots.** `reserveStrategies` keeps one root slot per tag, including `promotion_play` and `expansion` (`planner/strategies.ts:42-51`, used at `engine-v2.ts:199` and `beam.ts:45,49`).
5. **MCTS favours the greedy plan.** It expands root children in static-score order with prior `tanh(score/100)` and picks the most-visited (`search/mcts.ts:60-64`, `:124-131`). The greedy-by-static plan usually wins.
6. **Upkeep keep-set choice.** The keep-set is chosen by the same eval (`engine-v2.ts:128-133`). Releasing a unit loses cost × 1.0 to save rent × 0.5, so v2 keeps everything it can pay for.

Two of the files I was asked to read turned out not to touch crystals:

- `turnFunding.ts` funds time only. It reserves `turnBudget/8` per later segment so Prepare always gets search time (`:53`, `:70-83`).
- `phasingPreview.ts` is a UI opt-in flag.

Replay check, 96 h2h games (`spend.py`, `agg.py`):

| Per Prepare | AIEngineV2 | Hard |
|---|---|---|
| Ends Prepare with bank < 3 | 60% | 5% |
| Mean bank left | 7.4 | 25.5 |
| Two or more spend actions | 31% | 3% |

v2's promotions by target: water_2 115, plant_2 113, water_3 68, plant_3 65, fire_2 54, all others 33 combined. Its purchases: fire_1 576, plant_1 160, water_1 38.

## (c) How v2 values home defence and threats to its own corner

- **Static term.** `0.08 × homeOccupationPressure`, where the pressure is ±250. That is −20 when my corner is occupied and +20 when I hold theirs (`evaluation.ts:44`, `game/victory.ts:115-118`).
- **`strategicValue`** (`planner/strategies.ts:13-40`):
  - −200 if I am invaded (`:38`).
  - For every attacker, `1.2 × max(0, 5 − actions to the enemy corner)` (`:29`). The term is symmetric, so enemy attackers near my home count against me.
  - If a corner is reachable this turn: `max(0, 4 − closest) × 2` when the home owner has no armed unit within Manhattan distance 2 of home, or × 0.4 when it does (`:31-36`).
  - Disruption pressure of 0.6 × cost for enemy summons I have invalidated (`summons.ts:52-55`).
- **Tactical overrides** in `engine-v2.ts`:
  - A proved home-rescue plan scores 100000 (`:156-161`). The solver is `tactics/home.ts:18-50`, with up to 600,000 nodes on hard.
  - Raids and any plan that ends on the enemy corner are checked against the defender's full Act reply: +5000 if no rescue exists, −150 if one is proved, −50 if unknown (`:175-189`, `:203-222`).
  - An immediate win scores 1,000,000 (`:154-155`).
- **Terminal values.** ±100000 (`evaluation.ts:22`) is seen by 4-ply tree search plus 4-plan rollouts played for both sides (`search/mcts.ts:57,83`).
- **Related terms:**
  - killThreatsReceived: −2.0 × cost of any own unit an adjacent enemy can one-shot (`evaluation.ts:237-252`).
  - combinedAttackPotential: +0.8.
  - spawnDenialPressure: −1.5 per enemy standing in my spawn zone (`:269-281`).
  - spawnInfiltration: +1.0.

## (d) Unit catalogue (`src/game/units.ts:5-233`)

- **Promotion cost** is `cost(next) − cost(current)`: 4 for every tier 1→2 and 8 for every tier 2→3 (`units.ts:278-283`, `game/promotion.ts:9-23`).
- **Promotion limits:** once per unit per Prepare, and never on the turn the unit was placed (`promotion.ts:44-58`).
- **Upkeep** per turn is 0 / 1 / 2 for tier 1 / 2 / 3 (`game/upkeep.ts:5`). Tier-1 units can never be released (`:22-25`).
- **HP** is the defense stat. `damageTaken` lowers it and resets at the attacked player's next turn start (`game/types.ts:83`).
- **Kill rule:** attack power ≥ defense − damage (`game/combat.ts:219-226`), with a ±1 elemental modifier (`game/elements.ts:98-110`).
- **Starting army:** fire_1, water_1, plant_1 (`units.ts:288`).
- **Ore cells** hold 0, 4, 8 or 16 (`game/resourceMap.ts:5-19`).

| Element | Tier | Name | Cost | Promo→next | Upkeep | ATK | DEF/HP | SPD | MINE |
|---|---|---|---|---|---|---|---|---|---|
| fire | 1 | Hi | 3 | 4 | 0 | 2 | 1 | 2 | 1 |
| fire | 2 | Hono | 7 | 8 | 1 | 3 | 1 | 2 | 1 |
| fire | 3 | Kagari | 15 | – | 2 | 4 | 2 | 3 | 1 |
| lightning | 1 | Radi | 3 | 4 | 0 | 1 | 1 | 3 | 0 |
| lightning | 2 | Umeme | 7 | 8 | 1 | 2 | 1 | 4 | 0 |
| lightning | 3 | Kimubunga | 15 | – | 2 | 3 | 1 | 5 | 0 |
| water | 1 | Sjor | 4 | 4 | 0 | 2 | 2 | 1 | 2 |
| water | 2 | Straumr | 8 | 8 | 1 | 2 | 3 | 1 | 2 |
| water | 3 | Aegirinn | 16 | – | 2 | 3 | 4 | 2 | 3 |
| shadow | 1 | Göl | 4 | 4 | 0 | 2 | 2 | 2 | 0 |
| shadow | 2 | Gölge | 8 | 8 | 1 | 3 | 2 | 2 | 1 |
| shadow | 3 | Karanlık | 16 | – | 2 | 4 | 2 | 3 | 2 |
| plant | 1 | Muju | 5 | 4 | 0 | 0 | 3 | 1 | 3 |
| plant | 2 | Sachita | 9 | 8 | 1 | 1 | 3 | 1 | 5 |
| plant | 3 | Sachakuna | 17 | – | 2 | 2 | 4 | 1 | 8 |
| metal | 1 | Yan | 5 | 4 | 0 | 1 | 3 | 0 | 3 |
| metal | 2 | Mazask | 9 | 8 | 1 | 1 | 4 | 1 | 4 |
| metal | 3 | Tanka | 17 | – | 2 | 2 | 5 | 2 | 5 |

Facts that matter for promotion choices:

- **plant_1→2** adds +2 mining per turn for 4 crystals and 1 rent per turn. While ore lasts that is net +1 per turn.
- **plant_2→3** adds +3 mining for 8 crystals and 1 more rent.
- **water_1→2** adds only +1 DEF. It moves the unit out of the ATK-2 one-shot band.
- **fire_1→2** and **shadow_1→2** are pure +1 ATK upgrades.

## (e) Translation into the new Hard engine

Scale: one v2 eval point equals one crystal of material, which is 100 cc in Hard.

### Eval weights

Feature list is `src/ai/hard/eval/features.ts:66-135`; weights are `eval/weights.ts:20-28`. Measured static delta for one promotion under each variant (`variants.mts`):

| Variant | Promotion Δ (cc) |
|---|---|
| bootstrap | −500 |
| BankLiquid = BankExcess = 50 | −300 |
| BankExcess = 0 | −100 (a bank discount alone never flips the sign) |
| Rent = +422 | −78 |
| TierClimb = +600 | +100 |
| material tier-2 +600, tier-3 +1200 | +100 |
| material tier-2 +1500, tier-3 +3000 (overshoot) | +1000 |
| v2-mirror: Bank 50/50, Rent +500, TierClimb +40 | **+240** |

The v2-mirror bundle matches v2's +2.4 exactly in the same units. Under it, buys also move: fire_1 +571, plant_1 +908, lightning_1 +150 (from 0).

Mapping of v2 terms to Hard features:

| v2 term | Hard feature and suggested weight |
|---|---|
| resourceAdvantage 0.5 | BankLiquid = BankExcess = 50 (feature at `features.ts:190-191`) |
| no rent term | Rent = +422 to +500, to cancel EconDelta's rent present value (`features.ts:172-179,189`; `phasing-economy.ts:219`) |
| techTreeProgress 0.4 | TierClimb = +40; the definition is identical (`features.ts:238-251`) |
| unitHealth and stat value | material[] tier bumps (`config.ts:506-513`, scored at `evaluate.ts:122-131`) |
| pending 0.9 / 0.5 | PendingValue already exists and is richer: principal plus the present value of mining service when the summon is safe (`eval/pending.ts:116`) |
| home terms | HomeInvaded −4000 (v2-equivalent is about −22000); Inv10HomeReachable −400, which is literally v2's "reachable and no defender" test (`eval/invariants.ts:214-215`); HomeThreat −400; HomeCountdown −180; HomePlug +220; HomeRescuers +90. Semantics are at `tables/home.ts:67-80`, where `home[side]` describes side's own corner, so penalties are negative. |
| killThreatsReceived −2.0 | Hanging about −200 (prior was −50) |
| threatLevel +0.4 | KillAvailable about +40 (prior was 35) |

Three prior weights should stay at 0 if the goal is promotion:

- Rent −422 double-charges with EconDelta.
- Inv7PromoteNoRunway −600.
- Inv14LiquidityFloor −200.

### Generator rules (weights cannot fix these)

1. **Mission gating** (`src/ai/hard/gen/promote.ts:147-198`).
   - A promotion is emitted only if it has one of five missions.
   - INCOME needs a plant on a cell with reserve ≥ 2 × its new mining rate. That is ≥ 10 for plant_1→2 and 16 for plant_2→3, so only on 16-ore cells.
   - A promotion with no mission returns −1 (`:196-197`).
   - fire_1→fire_2 and shadow_1→shadow_2 can never have a mission other than FORTIFY.
   - Measured at 988 real Prepare points (`coverage.mts`; `placedThisTurn` cannot be recovered from replays, so both counts use the same assumption):
     - a legal promotion existed at 987 of them;
     - the generator offered any candidate at 276;
     - 339 of 3,842 legal promotions were offered;
     - by missions that fired: REACH 186, ANCHOR 46, FORTIFY 41, SURVIVE 40, INCOME 26.
   - Fix: add a generic fallback mission.
2. **Promotion ordering score** is `benefit − 422 × Δupkeep` (`promote.ts:254-256`).
   - Almost every candidate scores negative. REACH, for example, is 60 − 422.
   - `buildCombos` therefore ranks promotion combos below their promotion-less siblings and prunes them to 16 at the root or 8 at interior nodes (`gen/generate.ts:634-695`, `config.ts:573-576`).
3. **At most one ordinary promotion per Prepare combo** (`generate.ts:222-231`, `:646-668`).
4. **Purchase menu truncation.**
   - `planPurchases` stops writing plans at `maxPlans = 12` while enumerating multisets depth-first in catalogue order, and sorts only afterwards (`gen/purchase.ts:443-463`, `config.ts:543`).
   - With bank ≥ 6 the menu is [F], [F,F], [F,F,F], [F,F,F,F], or F+L mixes.
   - Measured: the cap was hit at 827 of 914 Prepare points. plant_1 was on the menu at 146 of 914, metal_1 at 87 of 914, and fire_1 at 914 of 914.
   - This matches play: all 492 Hard purchases across the 96 games were fire_1 or lightning_1.
   - Setting `maxPlans` to 105 removes the truncation with no code change. The plan buffer is `max(maxPlans, 200) + 1` (`generate.ts:344`).
5. **Root K = 24 ranking ignores pending purchases.**
   - Finished turns are ranked by stage 0 + stage 1 only (`src/ai/hard/engine.ts:355-360`; `generate.ts:879`, `:895-927`).
   - A BUY shows up only as −cost × 100 of bank, because PendingValue is a stage-2 feature (`features.ts:508`).
   - Purchase turns are the first to be displaced.
   - Mitigations:
     - lower BankExcess;
     - raise K or place plans, using the existing arms `k48`, `k96` and `place-wide` (`lab/hard-ai/ablate/arms.ts:481-495`);
     - or add pending principal to the within-turn score (code change).
6. **Exact ties go to the first-ordered candidate** (`config.ts:236-243`), and the empty Prepare plan is pinned first (`generate.ts:638-643`).
   - Under bootstrap weights every non-mining or risky buy is exactly 0.
   - Doing nothing therefore wins the tie.

### Suggested experiment order

Each step is cheap, and you can watch behaviour before win rate: promotions per game, spent/gained, and final bank.

1. **Config only:** `purchase.maxPlans = 105`, plus BankLiquid/BankExcess 50/50. Expect spent/gained to jump and miners to appear.
2. **Add the rest of the v2-mirror weights:** Rent +500 and TierClimb +40. Then overshoot with TierClimb 600 or 1500, or the material tier bumps. Without the mission fallback this can only raise promotions up to the roughly 9% the generator offers.
3. **Code:** a generic promotion mission, and promotion ordering without the −422. This is the step that lets promotions reach v2's 4.7 per game.
4. **Home block:** Inv10, HomeThreat and HomeInvaded, against the Rush bot (currently 1/0/31).

Process note. `docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:1,96` freezes the bootstrap vector before any outcomes and says tuning is a separately authorized stage. Run these as named `hard@ablate:*` weight and config arms (`lab/hard-ai/ablate/arms.ts:256-368`) rather than editing `DEFAULT_WEIGHTS`.