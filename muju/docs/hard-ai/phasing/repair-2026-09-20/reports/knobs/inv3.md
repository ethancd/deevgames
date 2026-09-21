HEADLINE: The bootstrap prices every promotion at about -4 crystals, and bank weights alone cannot fix that; a hand vector "phasing-priors-v1" turns promotions to +3 to +15 crystals

## Knobs
- material[tier2], material[tier3] (multiplier on cost x 100; keep tier 1 at 1.0) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:506 (DEFAULT_MATERIAL_CC), copied at src/ai/hard/eval/weights.ts:33; scored at src/ai/hard/eval/evaluate.ts:122-131: now x1.0 for all tiers (fire_2 = 700, fire_3 = 1500, ...); try x1.5 (about break-even: fire 1->2 +163 from excess cash at v1 bank weights), x1.75 (v1: +343), x2.5 (deliberate overshoot: +868, promotes whenever it has 4 crystals); This is the primary lever for promoting more. It makes a promoted unit worth cost + rent present value + about 15%. Because stage 0 includes material, promotions also rank higher in the generator's within-turn K cut (measured within-turn delta +799). Killing promoted enemy units is then valued properly: +1393 cc versus +307.; risk: It over-promotes into rent it cannot pay; pair with w[RentShortfall] < 0. Moving tier 1 off 1.0 breaks BUY -> arrival continuity with PendingValue principal. It changes the book weightsKey and the bootstrap goldens, so test through a cloned Weights object and do not edit DEFAULT_WEIGHTS.
- w[Rent] (index 1), used with a POSITIVE sign @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (absent, so 0); feature at src/ai/hard/eval/features.ts:172-179, 189: now 0 (the old Standard prior was -422); try +422 (exactly cancels EconDelta's rent), +525 (equivalent to the x1.75 multipliers), +1000 (overshoot); A single scalar that does the same job as the tier multipliers. Measured: v1 with multipliers at 1 and Rent +525 gives AUC 0.764 versus 0.768 and promotion delta +471 versus +518. Added alone to the bootstrap it lifts AUC from 0.681 to 0.731 and the value of killing a promoted unit to +940 cc.; risk: It is collinear with the tier multipliers; do not use both. Never negative: that repeats the rent already inside EconDelta.
- w[BankExcess] (index 3) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:24; feature at src/ai/hard/eval/features.ts:191: now 100; try 40 (v1), 0 (a BUY from excess cash becomes neutral to the within-turn scorer, so buy turns stop losing the K cut), -25 (overshoot: cash above 8 is a liability); Every conversion of hoarded cash into units gains (100 - B) per crystal at the leaf. The generator's BUY penalty shrinks from -100 x cost to -B x cost. Hard averages +14.6 (against AIEngineV2) to +26 (against Rush) crystals of excess cash while 19 to 79 crystals of material behind.; risk: It can spend on zero-value summons on dry squares and leave no cash for a SURVIVE or FORTIFY promotion. It breaks the contract's 2/3 = 100 pin (docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:106) and the accounting goldens.
- w[BankLiquid] (index 2) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:23; feature at src/ai/hard/eval/features.ts:190: now 100; try 85 (v1), 60 (overshoot); Makes spending the first 8 crystals mildly positive (+15 per crystal). It stays at 85 because rent and reactive promotions are paid from liquid cash.; risk: Too low and the engine cannot pay rent, which releases units; RentShortfall guards against that.
- w[EconDelta] (index 23) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:25; feature at src/ai/hard/eval/features.ts:506; ledger at src/ai/hard/tables/phasing-economy.ts:183, 219: now 100; try 60 together with PstMine 40 and tier multiplier 1.5 (variant 'v1b': AUC 0.773, sign agreement 0.602); 0 (overshoot: a material and PstMine engine); Scales both the rent charge (422 cc per upkeep crystal at 100) and the forecast-release phantom (+11.7 crystals credited to Hard per position against an opponent that spends to zero).; risk: It also scales live mining income, so compensate with PstMine. Below 100, an arriving miner's value steps down from its PendingValue service, which is weighted 100%.
- Home block: w[HomeThreat], w[HomeCountdown], w[Inv10HomeReachable], w[HomePlug], w[HomeInvaded], w[Inv11HomeBare], w[HomeRescuers] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28 (all absent); features at src/ai/hard/eval/features.ts:192, 369-372 and src/ai/hard/eval/invariants.ts:214-219; tables at src/ai/hard/tables/home.ts:36-86: now all 0; try v1: -400 / -180 / -400 / +200 / -3000 / -150 / +90. Overshoot x2.5: -1000 / -450 / -1000 / +500 / -7500 / -375 / +225; Gives the depth-1 to depth-2 search a gradient one to three turns before a corner invasion; 72 of 82 losses were home-checkmate. Plugging the corner removes the threat terms entirely (home.ts:42). Because every feature is a difference, it also rewards Hard's own runs at the enemy corner.; risk: At the overshoot it turtles (hence Inv13Turtle -100). If quiescence is work-capped, HomeInvaded can make it sacrifice a unit on a corner dive that the opponent simply rescues.
- w[PstMine] (index 5) and the other stage-1 geometry terms (SpawnArea, AnchorDepth, SpawnZero, Exposure) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; features at src/ai/hard/eval/features.ts:358-373: now all 0, so every quiet turn ties in the generator's within-turn score; try PstMine 25 (overshoot 60); SpawnArea 10 (30 is an overshoot: p90 |f| = 47 to 85 squares); AnchorDepth 15; SpawnZero -400; Exposure -10 (overshoot -30); Restores a ranking signal to the stage0+stage1 scorer that feeds the K cut (src/ai/hard/engine.ts:355-360): miners head for rich cells, anchors advance, exposed endpoints rank lower.; risk: PstMine partly repeats EconDelta income. High Exposure makes it passive. SpawnArea at the old 30 swings about 2,500 cc.
- w[Hanging], w[HangingBuy], w[KillAvailable], w[CleaveExposure] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; features at src/ai/hard/eval/features.ts:523-535; tables at src/ai/hard/tables/context.ts:285-304: now all 0; try v1: -30 / -30 / +25 / -30. Overshoot: -80 / -80 / +60 / -60; Stops it leaving units where the enemy can kill them when quiescence is capped (30 of 31 Rush losses were by elimination) and gives credit for available kills.; risk: The kill tables are optimistic and count the same enemy actions for several victims, so large weights make it timid. Hanging and KillAvailable count the same victims at a leaf where the opponent is to move.
- w[RentShortfall] (index 61), optionally w[Inv7PromoteNoRunway] @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/weights.ts:20-28; feature at src/ai/hard/eval/features.ts:511; ledger at src/ai/hard/tables/phasing-economy.ts:184-188; src/ai/hard/eval/invariants.ts:198: now 0; try -150 per missing crystal (v1); -500 (overshoot, if the multiplier overshoot causes release spirals); Inv7 -200 as an optional binary guard; Counterweight to the promotion premium. EconDelta prices a forced release at catalogue cost while v1 values the unit at 1.75x.; risk: It repeats the release principal already in EconDelta; keep it small.
- w[TierClimb] (index 21) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features.ts:238-251, 386: now 0 (the old prior was also 0); try +300 as an alternative; +800 as an overshoot; Pays only for the first promotion in each element (sum over elements of max tier - 1), a 'diversify tiers' nudge. It does not pay for a second fire_2.; risk: It does not value promoted enemy units killed unless they were the enemy's only one in that element; the material multipliers are better.
- Random-variation design (if sampling vectors) @ scratch harness: new HardEngine({weights}) at /Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:262-269, or setWeights at :387-390: now not applicable; try Sample five group scales log-uniformly in [0.4, 2.5] around v1: tier premium, (100 - bank weights), home block, tactical block, geometry block. Keep fixed: PendingValue = 1, tier-1 material = cost x 100, and zeros on the dead or broken features (11, 24, 25, 26, 27, 32, 42, 52, 54, 55, 59, 60).; Five degrees of freedom rather than 62; each one maps to a behaviour (promote, spend, defend home, avoid loss, expand).; risk: Hard is deterministic, so games across openings are the only source of variance; about 96 opening cells cap the distinct trajectories (docs/hard-ai/phasing/M6-STATUS.md:175).
- Code, not weights: gen/promote.ts mission gate @ /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/promote.ts:196-197, 252-253; cfg.maxPromotions at /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:552: now Only FORTIFY, SURVIVE, ANCHOR, INCOME (plant) and REACH produce candidates; fire_1->2 and shadow_1->2 are never offered outside FORTIFY; try Add a generic or ATTACK mission so every affordable promotion becomes a candidate; Without this, no weight vector can produce the most common promotion (fire 1->2 was 437 of 847 measured opportunities).; risk: More Prepare combinations per node and so less depth; out of scope for a weights-only test.
- Code, not weights: within-turn scorer omits pending principal @ /Users/ethancd/src/deevgames/muju/src/ai/hard/engine.ts:355-360; consumed at /Users/ethancd/src/deevgames/muju/src/ai/hard/gen/generate.ts:879, 913-915: now score = stage0 + stage1, so a BUY is exactly -w[bank] x cost; try Add 100 x (pendCostSum[mover] - pendCostSum[other]) to the scorer; weights-only workaround: BankExcess <= 0; Buy turns stop being the first ones evicted by the K cut.; risk: It changes generator ordering and the engine identity hash.
- evalFix.infiltrationPerAnchor (revives feature 11) @ /Users/ethancd/src/deevgames/muju/src/ai/hard/config.ts:415-425, 481-488; reader at /Users/ethancd/src/deevgames/muju/src/ai/hard/eval/features.ts:364-367: now absent on every profile, so Infiltration is identically 0; try evalFix: { infiltrationPerAnchor: true } with w[Infiltration] around +60; Prices voiding enemy spawn anchors, which under Phasing also refunds their pending summons.; risk: The flag changes the configuration hash, and the weight is unvalidated under Phasing.

## Findings
- Under the bootstrap a promotion is not value-neutral: it costs about 4 crystals, and no term credits the better unit. (The promotion cost equals the catalogue cost difference (src/game/units.ts:278-283) and material is cost x 100 (src/ai/hard/config.ts:506-513), so bank and material cancel exactly. EconDelta then subtracts the new rent on six closures at 0.9^k, about 422 cc per upkeep crystal (src/ai/hard/tables/phasing-economy.ts:219, src/ai/hard/core/income.ts:35-47). Measured at 847 real promotion opportunities (spend-delta.ts, 24 h2h replays): mean -391 cc, median -400, positive 0%. After promoting, a fire_2 nets 700 - 422 = 278 cc, less than the fire_1 it replaced (300).)
- Bank weights alone cannot make tier 1->2 promotions positive; a tier premium is required. (Delta = (100 - B) x costDiff - 422 x upkeepDiff. For tier 1->2 (4 crystals, +1 upkeep) break-even needs B = -5.5 cc per crystal, and +1 crystal of gain needs B <= -30. For tier 2->3 (8 crystals) break-even is B = 47. Even the old BankExcess = 25 leaves fire 1->2 at -122. The premium must come from the tier-2/3 material entries or the collinear w[Rent] > 0; keep tier-1 material at cost x 100 so BUY -> arrival stays continuous with PendingValue principal (src/ai/hard/eval/pending.ts:116).)
- Restoring the old Standard vector (43b87b6) as-is would make promotions worse and is the worst of the three at tracking results. (Old-vector promotion delta on the same 847 opportunities: mean -361 to -922 by subset, plant 1->2 -922. Rent -422 and EconDelta both charge the same rent. Over 1918 decisive-game positions, agreement of static score with the final result (AUC): old 0.645, bootstrap 0.681, v1 0.768. Deleting one enemy promoted unit (mean cost 9.8 crystals, n=464) has a median value of -208 cc under the old vector and is <= 0 in 57% of cases.)
- The bootstrap believes it is about 20 crystals ahead while being mated, mainly because EconDelta scores the opponent's promoted army as a liability. (In the 82 games lost to AIEngineV2 (72 by home-checkmate), mean bootstrap score at Hard's last turn start is +2128 cc; v1 gives -3022 (traj.cjs). econ-split.ts over 2019 positions: EconDelta averages +21.4 crystals for Hard, of which 11.67 is released principal the pass-only forecast charges the opponent (it predicts an enemy release in 1071 of 2019 positions) and 6.08 is the opponent's paid rent. In the actual games the opponent released 71 units in 1028 turns; Hard released none.)
- The bootstrap barely rewards killing promoted enemy units. (kill-value.ts: removing one enemy tier-2/3 unit (mean catalogue cost 9.8 crystals) changes the bootstrap score by a mean of +307 cc (median +200; <= 0 in 15% of 464 positions), and by +119 cc when the forecast already has the opponent short of rent. Under v1 the mean is +1393 cc and it is <= 0 in 1%.)
- The generator's within-turn scorer sees a BUY as a pure cash loss, so buy turns rank last in the K cut. (The scorer is stage0 + stage1 only (src/ai/hard/engine.ts:355-360); PendingValue is stage 2 (index 58, src/ai/hard/eval/features.ts:153, 508). turn.gainCc comes from that scorer (src/ai/hard/gen/generate.ts:879) and the K cut evicts the lowest gainCc (generate.ts:913-915). Measured within-turn delta of a BUY under the bootstrap is exactly -100 x cost (mean -400 over 1248 cases); the leaf delta has median 0 and is positive in only 32%. With the bootstrap every stage-1 weight is 0, so all quiet turns tie. Under v1 the BUY within-turn delta is -128 and the leaf delta +447 (99% positive).)
- No weight can produce a promotion the generator never offers. (planPromotions emits a slot only if bestMission returns FORTIFY, SURVIVE, ANCHOR, INCOME (plant only, reserve >= 2 x new mining) or REACH (speed gain); otherwise it returns -1 and the slot is skipped (src/ai/hard/gen/promote.ts:147-198, 252-253). fire_1->fire_2 (ATK +1 only) and shadow_1->2 are therefore never generated outside FORTIFY. fire 1->2 was 437 of the 847 affordable promotion opportunities measured.)
- Eight of the 62 features are dead or structurally zero under Phasing. (Infiltration(11) is a symmetric pair count unless evalFix.infiltrationPerAnchor is set, and evalFix is absent on every profile (src/ai/hard/eval/features.ts:364-367, src/ai/hard/config.ts:481-488). RelocationDebt(27) is reset to 0 and economyDP is no longer called (phasing-economy.ts:90, src/ai/hard/tables/context.ts:326-333). Inv5, Inv15, Inv17 and Inv18 are structural zeros (src/ai/hard/eval/invariants.ts:191-192, 242-245, 256-262). All six measured non-zero in 0 of 3128 positions. StrandPunish(32) is non-zero in 0.1% and Corridor(20) in at most 1%.)
- DepletionWaste(24) is broken under Phasing: about ten times larger and empirically the wrong sign. (waste now sums (mining - take) for every live body over six closures of a no-move forecast (phasing-economy.ts:165-168); it used to be measured after the relocation DP. Mean |f| is 36.8 against AIEngineV2 and 145 against Rush (p90 92 and 340); at the old -30 that is 2,760 to 10,200 cc. Univariate AUC is 0.761 in favour of the side with more waste, because waste scales with the number of miners.)
- Several old terms now charge twice for something EconDelta or PendingValue already counts. (Rent(1) at a negative weight repeats EconDelta's paid rent. Insolvency(26), RunwayCliff(25), Inv7 and Inv14 repeat the released principal EconDelta already subtracts (phasing-economy.ts:189-190, 216-219; invariants.ts:198, 240). Inv1 has the same predicate as SpawnZero(9) (invariants.ts:184 vs src/ai/hard/tables/geometry.ts:102; identical measured fire rates). HangingBuy(29) is -ArrivalThreat(59)/100 (features.ts:509, 522-524). DisruptPressure(60) repeats the service that PendingValue already zeroes at risk (pending.ts:99-101, 116). The cc-unit features 59 and 60 take integer weights, so the smallest non-zero weight values them at 100%.)
- The home-safety features are ported to Phasing and fire in the losses; they are the most valuable old priors to switch back on. (src/ai/hard/tables/home.ts:36-65 computes reach to the corner on the next-Act board, with paid pending arrivals as threats. In the 82 games lost to AIEngineV2, HomeThreat is 0.52, HomeCountdown 1.07 and Inv10 0.39 at Hard's last turn start. Against Rush they average 0.35, 1.19 and 0.31 over all positions, and HomePlug is -0.40 (Rush plugs its corner, Hard does not). Univariate AUCs have the expected sign: HomeCountdown 0.326, HomeThreat 0.415, Inv10 0.435, Inv11 0.401, HomePlug 0.653.)
- v1 turns every measured promotion positive and makes buying positive, and it is loadable without touching the repo. (spend-delta.ts under v1: promotions +518 mean (98% positive); fire 1->2 +561 (median +365), water 1->2 +392, plant 1->2 +463, metal 1->2 +516; tier 2->3 promotions +596 to +1436 mean (86-100% positive); BUY +447 (99% positive). The file scratchpad/feature-audit/phasing-priors-v1.weights.json round-trips through loadWeights (hash fd5a13e5) and can be applied with new HardEngine({weights}) or engine.setWeights(w) (src/ai/hard/engine.ts:262-269, 387-390). No games were played with v1; all evidence is static.)

## Report
# Phasing feature audit and the recommended vector "phasing-priors-v1"

Nothing in the repo was edited; scratch work is under `/private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/feature-audit/`. Every number here is a static evaluation on positions rebuilt from today's replays (96 games against AIEngineV2 hard whole-turn, 32 against Rush). No games were played with any candidate vector, because no ladder runs were allowed.

## 1. Why the engine does not promote

**Promotion under the bootstrap costs about 4 crystals; it is not neutral.**
- The promotion cost is `cost[next] - cost[cur]` (`src/game/units.ts:278-283`), and material is `cost x 100` (`src/ai/hard/config.ts:506-513`, scored at `src/ai/hard/eval/evaluate.ts:122-131`).
- Bank is worth 100 cc per crystal on both sides of the 8 split (`src/ai/hard/eval/weights.ts:23-24`, `src/ai/hard/eval/features.ts:190-191`), so bank and material cancel exactly.
- EconDelta then forecasts the new rent. Tier 2 pays 1 per turn and tier 3 pays 2 (`src/game/upkeep.ts:5`), over six closures at 0.9^k, which sums to 4.217, so -422 cc per upkeep crystal (`src/ai/hard/tables/phasing-economy.ts:219`, `src/ai/hard/core/income.ts:35-47`).
- Measured at 847 real affordable opportunities: mean -391 cc, median -400, positive 0%. That holds for every element, including plant 1->2 at -387, because Hard's plants sit on depleted cells.
- A fire_2 therefore nets 700 - 422 = 278 cc, which is less than the fire_1 it replaced (300).

**Buying under the bootstrap is neutral apart from the service forecast.**
- Bank drops by 100c and PendingValue principal rises by 100c (`src/ai/hard/eval/pending.ts:116`). On arrival that principal becomes material at the same value.
- The only net is the discounted mining ("service") of the summoned unit, and only when it is not flagged at risk. lightning_1 and shadow_1 do not mine, so for them it is always 0.
- Measured over 1248 buys: median 0, positive in 32%.
- The generator's within-turn scorer is stage0 + stage1 (`src/ai/hard/engine.ts:355-360`) and does not see PendingValue, which is stage 2. A BUY therefore ranks at -100 x cost in `gainCc` (`src/ai/hard/gen/generate.ts:879`) and is evicted first by the K cut (`generate.ts:913-915`).

**Bank weights alone cannot fix tier 1->2.**

The promotion delta is `(100 - B) x costDiff - 422 x upkeepDiff`, where B is the bank weight in cc per crystal.

| Promotion | Cost | Break-even B | B needed for +1 crystal of gain |
|---|---:|---:|---:|
| Tier 1->2 | 4 | -5.5 | <= -30 |
| Tier 2->3 | 8 | 47 | <= 35 |

The old BankExcess = 25 gives tier 2->3 +178 but leaves fire 1->2 at -122. A tier premium is needed.

General formula, with m the material multiplier and w23 the EconDelta weight:
`delta = 100 x (m_next x cost_next - m_cur x cost_cur) - B x costDiff - 4.22 x w23 x upkeepDiff + 4.22 x w23 x miningGain + w5 x PST gain`

Promotion deltas under v1, paid from excess cash (B = 40, m = 1.75 for tiers 2 and 3):

| Promotion | Delta (cc) |
|---|---:|
| fire or lightning 1->2 | +343 |
| water or shadow 1->2 | +418 (shadow also gains mining) |
| plant or metal 1->2 | +493 (plus mining) |
| any 2->3 | about +658 |

Paid from liquid cash (B = 85), subtract about 180 for a tier 1->2 promotion and 360 for a tier 2->3. Measured medians under v1: fire +365, water +440, plant +475, metal +515; tier 2->3 +605 to +1575.

**Three further problems the measurements showed.**
- **The forecast scores the opponent's promoted army as a liability.**
  - EconDelta averages +21.4 crystals for Hard. Of that, 11.67 is released principal that the pass-only forecast charges the opponent (in 1071 of 2019 positions), and 6.08 is their paid rent.
  - In the actual games they released 71 units in 1028 turns.
  - In the 82 lost games the bootstrap scores Hard's last turn start at +2128 cc.
- **Killing a promoted enemy unit is barely rewarded.** For a unit of mean cost 9.8 crystals the bootstrap gives +307 cc (<= 0 in 15% of cases). The old vector gives a median of -208. v1 gives +1393.
- **The generator only offers mission promotions** (`src/ai/hard/gen/promote.ts:147-198, 252-253`). fire_1->2 and shadow_1->2 are never generated outside FORTIFY, and fire 1->2 was 437 of the 847 opportunities. Weights cannot fix that.

**Do not restore the old vector wholesale.** Measured against final game results, it is the worst of the three and its promotion deltas are mostly negative.

| Vector | AUC | Sign agreement | Promotion delta |
|---|---:|---:|---|
| Old Standard vector | 0.645 | 0.309 | -196 to -922 (all 1->2 subsets) |
| Bootstrap | 0.681 | 0.295 | -391 |
| v1 | 0.768 | 0.556 | +518 |

The harmful old terms are Rent -422 (the rent is charged twice), DepletionWaste -30, Insolvency -150, RunwayCliff -600, BankConvertible +20 and ElementCoverage +150.

## 2. Per-feature audit

Each feature is f(me) - f(them), so a penalty needs a negative weight. "Size" is mean |f| / p90 on the AIEngineV2 positions, with Rush in brackets where it differs; nz is the share of positions where the feature is non-zero. Features 58-60 are in cc, 61 in crystals, 38-57 are 0/1 flags.

### Stage 0 (no tables; visible to the generator's within-turn scorer)

| # | Feature | Measures now | Size | Old | v1 | Verdict |
|---|---|---|---|---:|---:|---|
| 0 | Material | Catalogue cost of live units, in crystals. | 20/43 [Rush 80/179]; Hard averages -19 against AIEngineV2 and -79 against Rush | 100 | 100 | w[0] is informational; the real knob is `material[]` (`evaluate.ts:144`). Pending summons are not counted here; they are in PendingValue. |
| 1 | Rent | Upkeep per turn (`features.ts:172-179`). | 2.5/5 | -422 | 0 | A negative weight repeats EconDelta's paid rent. A positive weight is a clean promotion premium (+525 is equivalent to v1's multipliers). AUC 0.54, positive direction. |
| 2 | BankLiquid | min(bank, 8). | 4.3/8 | 90 | 85 | Same meaning. The option value of cash is lower under Phasing because a purchase arrives next turn, but rent and reactive promotions still need it. |
| 3 | BankExcess | max(0, bank - 8). | 16/39 [27/53] | 25 | 40 | Same meaning. This is the direct lever on hoarding and on the BUY penalty in the K cut. |
| 4 | HomeInvaded | An enemy unit stands on my corner. | nz 0.4% at turn starts | -4000 | -3000 | Under Phasing a non-terminal invaded leaf usually means a rescue exists or the proof was capped, so it is slightly softer than the old value. |

### Stage 1 (level-1 tables; visible to the within-turn scorer)

| # | Feature | Measures now | Size | Old | v1 | Verdict |
|---|---|---|---|---:|---:|---|
| 5 | PstMine | 12-turn discounted mining from current squares, no rent. | 8/18 [25/57] | 60 | 25 | Partly repeats EconDelta income. Kept small because it is the only economy signal the generator's scorer can see. |
| 6 | BankConvertible | min(bank, 5 x spawn area) (`features.ts:359`). | 19/43 | 20 | 0 | Stale. It is a third term on cash, it rewards hoarding, and "5 x area" assumed immediate placement. |
| 7 | SpawnArea | Number of legal summon squares. | 19/47, max 87 | 30 | 10 | Same meaning. The old 30 swings about 2,500 cc. |
| 8 | SpawnReserve | Reserve under the spawn area, divided by 4. | 18/51 | 8 | 0 | Collinear with SpawnArea; reserve at an actual summon square is already in PendingValue service. |
| 9 | SpawnZero | Spawn area is 0 and bank >= 3 (`src/ai/hard/tables/geometry.ts:102`). | nz 12% [24%] | -800 | -400 | Same meaning. Identical to Inv1, so weight only one of them. |
| 10 | AnchorDepth | Depth of the deepest unblocked anchor. | 4.7/10 | 25 | 15 | Same meaning. AUC 0.615 in the expected positive direction. |
| 11 | Infiltration | Symmetric pair count (`features.ts:364-367`). | 0 always | 90 | 0 | DEAD unless `evalFix.infiltrationPerAnchor` is set. |
| 12 | CornerSeal | Own speed-1 units on the squares next to my corner (`geometry.ts:139-147`). | 0.56 | -60 | 0 | It penalises exactly the bodies that HomeRescuers rewards, and 72 of 82 losses were home-checkmate. |
| 13 | HomeThreat | The enemy can reach my corner in at most 4 actions at its next Act, counting paid arrivals (`src/ai/hard/tables/home.ts:36-65`). | nz 15% [36%] | -400 | -400 | Ported to Phasing. AUC 0.415, negative direction as expected. |
| 14 | HomeCountdown | max(0, 4 - turns for the enemy to reach my corner). | 0.9/3 [1.3] | -180 | -180 | Ported. AUC 0.326; it gives the earliest warning. |
| 15 | HomePlug | My own unit stands on my corner. | nz 48% | 220 | 200 | Same meaning. A plug also switches off 13 and 14 (`home.ts:42`). Rush plugs (-0.40 on average); Hard does not. |
| 16 | HomeRescuers | Own units next to my corner that can damage the nearest threat. | nz 17% | 90 | 90 | Ported. |
| 17 | Exposure | Cost of my units inside the enemy's next-Act strike area, paid arrivals included (`src/ai/hard/tables/threat.ts:83-86`). | 10/26 | -20 | -10 | Ported. Kept low because it also penalises approaching the enemy. |
| 18 | DrawPressure | sign(lead) x clock^2, rescaled to 0..100 for the 20-ply clock (`features.ts:223-235, 375-382`). | 1.9/4 | -8 | -5 | The rescale is correct. `leadCc` counts bank 1:1 (`src/ai/hard/eval/invariants.ts:278-282`), so a hoarder always looks ahead. |
| 19 | ActionsLeft | +/- remaining actions during Act, 0 during Prepare (`features.ts:384`). | constant 4 at turn starts | 40 | 0 | Meaning shifted. It is constant over complete-turn leaves and would pay for stopping the Act with actions unspent relative to a Prepare node. |
| 20 | Corridor | Lightning units in the corridor. | nz 1% | 0 | 0 | Dead. |
| 21 | TierClimb | Sum over elements of (max tier - 1). | 2.3/4 | 0 | 0 | Collinear with the tier premium, and only pays for the first promotion in each element. An optional alternative knob. |
| 22 | ElementCoverage | An own unit, or an affordable tier-1 purchase, one-shots the enemy's most common tough body (`features.ts:281-296`). | nz 41% | 150 | 0 | Stale. "Purchasable now" no longer holds because there is no summon-and-strike, it rewards holding cash, and AUC 0.396 is the wrong direction. |

### Stage 2

| # | Feature | Measures now | Size | Old | v1 | Verdict |
|---|---|---|---|---:|---:|---|
| 23 | EconDelta | Pass-only forecast over 6 closures: mining of current live units, minus rent actually paid, minus the cost of units the forecast releases (`phasing-economy.ts:183, 219`). | 22/44 | 80 | 100 | Meaning changed. It charges rent once, and it carries the +11.7-crystal release phantom against opponents that spend to zero. Try 60. |
| 24 | DepletionWaste | Unused mining capacity over 6 closures, all units, no movement (`phasing-economy.ts:165-168`). | 37/92 [145/340] | -30 | 0 | BROKEN. About ten times larger than before; AUC 0.761 in favour of more waste, because waste scales with the number of miners. |
| 25 | RunwayCliff | Root bank + first-closure income < first-closure rent (`features.ts:513-514`). | nz 17% | -600 | 0 | Stale. It ignores an unpaid current bill and refunds, and feature 61 replaces it. |
| 26 | Insolvency | 6 minus the first forecast turn at which rent exceeds cash. | 1.7/5 | -150 | 0 | Repeats the release principal already in 23. It fires for AIEngineV2 in 48% of positions although real releases are rare. |
| 27 | RelocationDebt | Never written: reset to 0 and `economyDP` is no longer called. | 0 always | -60 | 0 | DEAD (`phasing-economy.ts:90`, `src/ai/hard/tables/context.ts:326-333`). |
| 28 | Hanging | Cost of my units the enemy can kill at its next Act, excluding victims that depend on its arrivals (`features.ts:523`). | 3.6/10 [9/21] | -50 | -30 | Ported. The kill table is optimistic and counts each victim separately. |
| 29 | HangingBuy | Now the arrival-dependent victims, which is -ArrivalThreat/100. `killNeedsBuy` is always 0 (`context.ts:302-303`). | nz 3% | -30 | -30 | Meaning changed. Weight this one and leave 59 at 0. |
| 30 | ApproachRetreat | Cost of my units whose attacker can hit and retreat safely. | 2.0/6 | -25 | 0 | A subset of Hanging, so it would count the same loss a third time. |
| 31 | ApproachStrand | Same, but the attacker would be stranded. | 2.5/8 | -10 | 0 | Same reason. |
| 32 | StrandPunish | Stranded enemy attackers I can kill now. | nz 0.1% | 20 | 0 | Effectively dead under the next-Act approach tables. |
| 33 | KillAvailable | Sum of target value / minimum actions for kills available this turn; the mover has no budget in Prepare; no buys or promotions (`context.ts:235-238, 285-293`). | 0.95/3 [3/8] | 35 | 25 | Ported; it respects the no-summon-and-strike rule. It overlaps Hanging at a leaf where the opponent is to move. |
| 34 | CleaveExposure | Value that enemy tier-2+ units can take from me by Cleave. | 1.7/5 | -40 | -30 | Same meaning. More relevant against promoted armies. |
| 35 | AnchorFragility | 0..3: 2 if the enemy needs at most one body to void all my spawn rectangles, +1 if my deepest anchor is killable. | 0.57/2 | -120 | -60 | More meaningful under Phasing, because voiding rectangles also refunds pending summons. AUC 0.353. |
| 36 | BlockingDeficit | max(0, 2 - number of enemy bodies needed to void my spawn rectangles). | 0.17/1 | -150 | -80 | Same; it overlaps 35. |
| 37 | CornerInfiltration | I stand on the enemy corner or hold both squares next to it. | nz 0.4% | 300 | 300 | Same meaning. |

### Invariants (0/1 flags, difference between sides)

| # | Flag | nz (h2h [Rush]) | Old | v1 | Verdict |
|---|---|---|---:|---:|---|
| 38 | Inv1SpawnZero | 12% [24%] | -800 | 0 | Identical to feature 9, so it would charge twice. |
| 39 | Inv2CornerSeal | 7% | -300 | 0 | Penalises home defenders. |
| 40 | Inv3RetreatSquare | 16% [28%] | -250 | 0 | Noisy without `evalFix.inv3RetreatConjunct`: it fires on the excluded case 943 of 965 times (`invariants.ts:161-177`). |
| 41 | Inv4StrandUnpunished | 28% [42%] | -100 | 0 | Fires constantly; AUC 0.541 is the wrong direction. |
| 42 | Inv5PoorMinerSquare | 0 | -400 | 0 | Structural zero (`invariants.ts:191-192`). |
| 43 | Inv6FragileAnchor | 9% | -120 | 0 | A third count of the same blocking number as 35 and 36. |
| 44 | Inv7PromoteNoRunway | 4% | -600 | 0 | Anti-promotion, and repeats the release charge in 23. Optional guard at -200. |
| 45 | Inv8NoPreAdjacency | 0.3% [7%] | -150 | -100 | Still valid: an attack that did not kill while a kill was available. |
| 46 | Inv9ChipAcrossTurn | 1% [6%] | -150 | -100 | Still valid: the owner's units heal at its turn start, so chip damage is wasted. |
| 47 | Inv10HomeReachable | 12% [32%] | -400 | -400 | Ported. 0.39 at Hard's last turn in lost games. |
| 48 | Inv11HomeBare | 11% | -250 | -150 | Half stale: the "enemy bank >= 3" branch (`invariants.ts:304`) assumes an immediate purchase. The runner branch still holds. |
| 49 | Inv12CleaveLine | 4% [13%] | -40 | 0 | Covered by 34. |
| 50 | Inv13Turtle | 40% | -200 | -100 | Same meaning. It counterbalances the home block. |
| 51 | Inv14LiquidityFloor | 12% | -200 | 0 | The binary form of 61. |
| 52 | Inv15 | 0 | 0 | 0 | Structural zero. |
| 53 | Inv16ClockDiscipline | 0.4% | -200 | -200 | Ported to the 17-ply warning (`invariants.ts:254`). |
| 54 | Inv17 | 0 | -60 | 0 | Structural zero. |
| 55 | Inv18 | 0 | 0 | 0 | Protocol-only. |
| 56 | Inv19SoftMinerExposed | 6% [14%] | -150 | 0 | Overlaps 29; its static-projection limitation is flagged in `docs/hard-ai/phasing/M6-STATUS.md:101`. |
| 57 | Inv20StrandNoRetreat | 14% [32%] | -250 | 0 | Penalises the trades the engine needs to make against Rush. |

### Phasing accounting features

| # | Feature | Size | v1 | Verdict |
|---|---|---|---:|---|
| 58 | PendingValue (cc) | 357/1019 [1182/3094] | 1 | Must stay 1: the weight scales refundable principal (`pending.ts:116`). With bank weights below 100, a forced refund now costs the owner something, so summon disruption finally shows up in the score. |
| 59 | ArrivalThreat (cc) | nz 3%, max 3600 | 0 | The same quantity as 29; an integer weight of 1 would value it at 100%, which is too coarse. |
| 60 | DisruptPressure (cc) | 65/309 [198/731] | 0 | Repeats the service that 58 already zeroes when a summon is at risk. |
| 61 | RentShortfall (crystals) | 0.35/1 | -150 | The exact replacement for 25. Kept small; it covers the gap between a release priced at catalogue cost in 23 and v1's inflated tier material. |

## 3. Recommended vector

```json
{
  "label": "phasing-priors-v1",
  "w": {
    "Material": 100, "BankLiquid": 85, "BankExcess": 40, "HomeInvaded": -3000,
    "PstMine": 25, "SpawnArea": 10, "SpawnZero": -400, "AnchorDepth": 15,
    "HomeThreat": -400, "HomeCountdown": -180, "HomePlug": 200, "HomeRescuers": 90,
    "Exposure": -10, "DrawPressure": -5,
    "EconDelta": 100, "Hanging": -30, "HangingBuy": -30, "KillAvailable": 25, "CleaveExposure": -30,
    "AnchorFragility": -60, "BlockingDeficit": -80, "CornerInfiltration": 300,
    "Inv8NoPreAdjacency": -100, "Inv9ChipAcrossTurn": -100, "Inv10HomeReachable": -400, "Inv11HomeBare": -150,
    "Inv13Turtle": -100, "Inv16ClockDiscipline": -200,
    "PendingValue": 1, "RentShortfall": -150
  },
  "materialMultiplierByTier": { "1": 1.0, "2": 1.75, "3": 1.75 }
}
```

All other features are 0. The resulting `material[]` is 300, 1225, 2625 (fire and lightning), 400, 1400, 2800 (water and shadow), and 500, 1575, 2975 (plant and metal).

A loadable copy is at `.../scratchpad/feature-audit/phasing-priors-v1.weights.json` (schema `muju-weights-phasing-v1`, hash `fd5a13e5`). Apply it in a scratch harness with `new HardEngine({ weights: loadWeights(json) })` or `engine.setWeights(w)` (`src/ai/hard/engine.ts:262-269, 387-390`); no repo edit is needed.

**Why each entry has its value.**
- **Tier multipliers 1.75.** A promoted unit is valued at cost + rent present value + about 15%. Net of rent, fire_2 is 803 cc (1.15 x cost) and fire_3 is 1782 (1.19 x). Tier 1 stays at 1.0 so that BUY -> arrival is continuous with PendingValue principal.
- **Bank 85 / 40.** Units are worth more than idle cash, so spending is +15 to +60 per crystal, and the generator's BUY penalty drops from -400 to -128.
- **HomeThreat, HomeCountdown, Inv10, Inv11, HomePlug, HomeRescuers, HomeInvaded.** These are the only defence a depth-1 to depth-2 search has against the mode that produced 72 of the 82 losses.
- **PstMine, SpawnArea, AnchorDepth, SpawnZero, Exposure.** They give the stage-1 scorer a ranking signal; under the bootstrap every quiet turn ties.
- **Hanging, HangingBuy, KillAvailable, CleaveExposure, Inv8, Inv9.** Loss avoidance when quiescence is capped; the Rush losses are almost all by elimination.
- **AnchorFragility, BlockingDeficit.** Summon-disruption risk, which matters more under Phasing.
- **RentShortfall -150.** The guard against over-promoting.
- **Inv13 and Inv16.** Guards against turtling and against sitting on a lead while the draw clock runs.

Average contributions on the AIEngineV2 positions: EconDelta about 2240 cc, Material about 2000, BankExcess 650, BankLiquid 370, PendingValue 360, and nothing else above 210.

**Static results for v1.**
- Promotions +518 mean, 98% positive. Buys +447, 99% positive.
- Killing a promoted enemy unit +1393 cc.
- In lost games the mean score at Hard's last turn start is -3022, against +2128 for the bootstrap.
- AUC 0.768 and sign agreement 0.556.
- Variant v1b (EconDelta 60, PstMine 40, multiplier 1.5) gives AUC 0.773 and sign agreement 0.602. It roughly halves the forecast-release phantom and is the first alternative to try.
- The equivalent Rent form (multipliers at 1, Rent +525) gives AUC 0.764.

## 4. Features that should stay at 0

- **Dead:** 11 Infiltration, 27 RelocationDebt, 42 Inv5, 52 Inv15, 54 Inv17, 55 Inv18, 32 StrandPunish (about 0.1%), 20 Corridor.
- **Broken or wrong sign:** 24 DepletionWaste.
- **Stale premise:** 6 BankConvertible, 22 ElementCoverage, 25 RunwayCliff, 19 ActionsLeft, and the bank branch of 48 Inv11.
- **Charges the same thing twice:** 1 Rent at a negative weight, 26 Insolvency, 44 Inv7, 51 Inv14, 38 Inv1, 43 Inv6, 59 ArrivalThreat, 60 DisruptPressure.
- **Works against the engine right now:** 12 CornerSeal, 39 Inv2, 57 Inv20, 40 Inv3, 41 Inv4.

## 5. Caveats

- All evidence is static evaluation on positions from games the bootstrap engine played. v1 has not played a game.
- The AUC figures are in-sample: 11 won games, 214 positions from wins, and positions within a game are correlated. I used them only to check signs and to show that the bootstrap and the old vector point the wrong way.
- The Rush set has a single win, so its AUC means nothing.
- I picked some v1 signs and sizes after looking at outcome correlations from ladder replays. They came from ladder games, not from M5 suite misses, but they are still outcome-informed and should be validated on VAL openings before anything is pinned.
- Moving weights 2 and 3 off 100, or touching material, departs from the contract's pins (`docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:106`, `docs/hard-ai/phasing/M6-STATUS.md:66`) and would break the accounting goldens and the book `weightsKey`. Test with a cloned Weights object, not by editing `DEFAULT_WEIGHTS`.
- Two blockers are outside weights: the generator's mission gate (fire_1->2 is never offered) and the within-turn scorer leaving out pending principal. Both are listed as knobs.

## 6. Scratch artifacts

All in `.../scratchpad/feature-audit/`:
- Scripts: `vectors.ts`, `feature-stats.ts`, `spend-delta.ts`, `kill-value.ts`, `econ-split.ts`, `traj.cjs`, `uni.cjs`, `emit-v1.ts`.
- Outputs: `stats-h2h.json`, `stats-rush.json`, `matrix-h2h.json`, `matrix-rush.json`, `traj-*.json`, `spend-h2h.json`, `phasing-priors-v1.weights.json`.
- Each script runs in under 15 seconds, single process, from the muju directory with `node --import tsx <script> <replayDir> <n> <tag>`.
