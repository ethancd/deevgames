HEADLINE: The binding cause of the hoarding is candidate 1. The within-turn scorer (engine.ts:355-360, stage0 + stage1) prices a BUY at minus its full cost, because PendingValue is feature 58 in stage 2. The generator's K=24 cut and its ordering therefore evict nearly every multi-body purchase before the search sees it. Across 341 real Hard roots the mean Prepare bank was 30.8 crystals, but the largest spend left in the root list averaged 3.5 (played 2.05 per turn against 6.04 income, matching the measured 35%). Patching only that scorer at runtime, with weights untouched, raised spend from 19% to 47-55% and purchases from about 5 to 38-45 per game in 6 scratch games. Adding a bank discount as well reached 71-80%. Leaf neutrality (candidate 2) is a real secondary cause. Rent inside EconDelta (candidate 3) is real but not binding. Purchase plans are not pruned away (candidate 4), but planPurchases has a separate defect: at bank 12 or more it offers only fire_1 bodies, capped at 12 crystals per turn.

## Remaining work
- S - Fix the within-turn scorer so a BUY is not charged its full cost. The minimal version adds CC*(pendCostSum[mover]-pendCostSum[other]) at muju/src/ai/hard/engine.ts:359. A better version scores complete turns (after hand-off) with the full leaf. Mirror the change in the 8 lab and test copies of the closure. Blocked by: gen and recall tests that pin candidate lists, plus the gates and ladder baselines that must be re-measured. The full-leaf variant also costs an economy forecast per candidate.
- S/M - Fix the planPurchases enumeration (muju/src/ai/hard/gen/purchase.ts:145-160, 441-461). Rank multisets by score, or interleave definitions, instead of depth-first order with truncation. That lets plant_1, water_1 and mixed plans reach the list at bank 12 or more. Reconsider the cap of 12 crystals and 4 bodies per turn (PURCHASE_MAX_BODIES, maxPlans 12). Blocked by: tests/ai/hard purchase tests (25 cases) and DESIGN 5.5 bounds.
- M - Decouple the K budget: Act-line diversity and Prepare-plan diversity share one flat K=24 list (generate.ts:892-928). Once a BUY is score-neutral, line 0's 16 combos fill the list first and ties reject later Act lines, so tactical breadth collapses. Give each retained Act line a small Prepare quota (for example the best 1-2 plans by full leaf), or choose Prepare separately after the Act choice. Blocked by: a generator design decision and work-budget accounting.
- M - Give bodies a positive price over cash at the leaf. At par, the static leaf is exactly neutral at high bank (92 of 186 roots against AIEngineV2 at Prepare banks of 25 or more; 157 of 330 roots against Rush). Either hand-set a bank discount as an interim measure (90/25 gave 4-0 and 47.5% spend in scratch), or unpin w[2], w[3] and w[58] in lab/hard-ai/tune/texel.ts:82 so the tuner can learn it. Blocked by: the M6 bootstrap contract declares these pins, so it needs an amendment or preregistration.
- S/M - Promotion valuation: a tier-2 combat promotion scores about -400 cc (rent PV) with no offsetting term. Let material[] for tiers 2 and 3 rise above catalogue cost (Texel may already fit material[], except the fire_1 pin), or add a tier or combat feature weight. Blocked by: a non-degenerate training corpus, and current self-play is hoard-dominated.
- M - Confirm at ladder scale. Apply the scorer fix on a branch and run lab/hard-ai/ladder/run.ts for hard@desktop against aiv2-hard-turn and against Rush at wall:1500, 32 games each. Roughly 10-15 minutes per row on 8 shards, going by this session's chain2 runs. Pre-state the spend-ratio and Elo expectations. Blocked by: requires a source edit, which was out of scope for this read-only pass.
- S - Conversion and closing weakness: one principal-arm game reached 33 units against 1 and was still undecided at the 80-turn cap, which is consistent with all home-threat and positional weights being zero. The run did not establish whether the game would actually have ended by the inactivity rule; the 'inactivity' reason string it recorded contradicts winner=null. Track this as a separate item from hoarding.

## Open questions
- Against Rush, 79 of 330 roots have the best buy candidate statically below the best no-spend candidate (p10 margin -400 cc), even though BUY conserves principal. Two candidate causes: the lower bank causes forecast rent releases (releasedPrincipal is subtracted at phasing-economy.ts:219), or the arrival changes the pass-only forecast's terminal timing. This was not isolated. A 10-minute feature-diff of one such root with scratchpad/hoard/prepare-root.ts would settle it.
- How much of the scorer-patched arms' 18-game win record is strength and how much is artefact? The 'cut' arm's extra evaluations are not charged to the work meter, the sample is 2 openings with deterministic engines, and the opponent is the hoarding baseline rather than AIEngineV2. Only a ladder run against aiv2-hard-turn and Rush answers this.
- Should complete turns be scored by the full leaf (arm 'cut': 54.8% spend, costs a forecast per candidate) or by principal only (arm 'principal': 46.6%, free, but turns the K cut into a tie-order lottery)? The answer depends on the K-budget redesign.
- At the Prepare root for turn 5 the search chose the 3-body plan although the 4-body plan had the higher exact child value (3400 against 3200). Non-first candidates return fail-low bounds and the first candidate to reach the bound wins. Is this first-searched tie rule worth fixing on its own, along the lines of E4.2's tieBreak work?
- Is any Standard-era gate or suite result still treated as evidence for Phasing generator recall? The recall and coverage instruments copy the same stage0 + stage1 scorer, so they measure recall against a reference that shares the bias. The reference K is 2000, so that bias is smaller in the reference.

## Findings
- [verified-in-code-or-results] The within-turn scorer is stage0 + stage1 only. Stage 0 carries cash at 100 cc per crystal (BankLiquid and BankExcess, both weight 100). PendingValue is feature 58 in stage 2, and addPending never touches materialCc. A BUY of cost c therefore scores exactly -100*c in the scorer that sets Turn.gainCc. (muju/src/ai/hard/engine.ts:355-360; muju/src/ai/hard/eval/features.ts:190-191 and 131,153; muju/src/ai/hard/eval/weights.ts:20-28; muju/src/ai/hard/core/state.ts:465-472. Measured: in 195 of 338 roots the best buy candidate's within-turn score is exactly 300 cc below the best no-spend candidate, and it is at least 300 cc below in all 338 (scratchpad/hoard/agg.py over roots-default-t6000-desktop-vs-aiv2hardturn.jsonl).)
- [verified-in-code-or-results] gainCc is what the K cut and the beam ordering use. recordPrefixTerminal scores every complete turn with ctx.score. offer() evicts the lowest-gainCc non-forced candidate and rejects ties. finish() sorts by gainCc, and search/order.ts adds within/16 to the ordering key. With K=24 Act lines and up to 16 Prepare combos each, about 250 complete turns compete for 24 slots, and every buy sibling scores 300 cc or more below its no-buy sibling. (muju/src/ai/hard/gen/generate.ts:869-884 (gainCc = ctx.score), 904-927 (K cut, `turn.gainCc <= out[worst].gainCc` rejects), 963-978 (sort), 802-809 (tuneKeep); muju/src/ai/hard/search/order.ts:395,421; muju/src/ai/hard/config.ts:574 (K 24, placePlansRoot 16).)
- [verified-in-code-or-results] On the 341 real Hard-seat roots of the wall:6000 ladder (A record 7/1/24), the generator offered purchases at 338 roots, and 88.4% of the 84,670 offered complete turns carried a BUY. After the K cut only 30.1% of the 9,694 final-list candidates carried a BUY, and 85% of those (2,478 of 2,917) were a single 3-crystal body. The mean Prepare bank was 30.8 crystals. The mean largest offered spend was 11.1, the mean largest spend left in the root list was 3.5, and the mean played spend was 2.05 per turn. Thirty roots (8.9%) kept no buy candidate at all. (scratchpad/hoard/hoard-trace.ts, which runs the production DESKTOP.gen generator with an instrumented scorer on positions rebuilt by lab/hard-ai/analyze/replay.ts reconstruct; output in scratchpad/hoard/roots-default-t6000-desktop-vs-aiv2hardturn.jsonl; aggregated with scratchpad/hoard/agg.py.)
- [verified-in-code-or-results] That ceiling matches the measured behaviour. The Hard seat in those 32 games gained 2,224 crystals and spent 779, which is 35.0% (6.04 gained and 2.12 spent per turn). Even if the search always chose the largest spend left in its root list, it could reach only about 3.5 / 6.04 = 58%. (Replay meta players[].resourcesGained and resourcesSpent, summed over scratchpad/ladder/t6000-desktop-vs-aiv2hardturn/replays/*.json (python one-off, this session).)
- [verified-in-code-or-results] In 210 of 338 roots the full static leaf prefers some buy candidate over the best no-spend candidate. In 209 of those 210 the buy candidate the leaf likes best was cut before the search saw it (median lost margin 938 cc). The engine's own evaluator disagrees with its generator scorer. (scratchpad/hoard/agg.py output: 'static FULL leaf ... {buy>: 210, buy<: 30, tie: 98}; best-by-full buy candidate was CUT: 209/210 = 99.5% median margin cc 938'.)
- [verified-in-code-or-results] Prepare-root trace. At a Prepare root all 12 candidates fit under K, so the K cut is absent, and the same engine prefers buying. At turn 5 (bank 33) the exact child-search values were 2200 for no spend, 2800-2900 for one fire_1 and 3300-3400 for four. The within-turn scores ran the opposite way: 1700, 1400 and 500. At turn 8 (bank 50, 3 units) the full static leaf was exactly 5500 for all 12 candidates, yet exact child values rose from 4800 (no spend) to 5900 (four bodies), and the Prepare-root search chose 4x fire_1. In the recorded game, searched from the Act root, the engine spent nothing that turn. (scratchpad/hoard/prepare-root.ts on scratchpad/ladder/t6000-desktop-vs-aiv2hardturn/replays/p1-g3-s4_0_8-A-white.json, turns 5 and 8, root work 100k, child work 50k (command output, this session).)
- [verified-in-code-or-results] Runtime counterfactual: fixed work 50k, each arm against the unmodified engine, 18 games on 2 p1-dev openings, anecdotal. Unmodified seats pooled: spend 19.1%, 4.7 buys and 0.67 promotions per game. Arm 'principal' (within-turn score plus 100 cc per pending crystal, nothing else): 46.6%, 38.5 buys per game, results 1-0 with one game unfinished at the 80-turn cap on a 33-unit to 1-unit board (its recorded reason was 'inactivity', and winner was null, so it ended undecided). Arm 'cut' (complete turns scored by the full leaf, weights untouched): 54.8%, 45 buys per game, 4-0. Arm 'tilt' (weights only, bank 90/25): 47.5%, 21 buys and 5 promotions per game, 4-0. Arm 'principal+tilt': 80.4%, 2-0. Arm 'cut+tilt': 71.1%, 2-0. Arm 'rent' (w[Rent] = +422): 28.7%, 6.8 buys and 2.75 promotions per game, 1-3. (scratchpad/hoard/hoard-ab.ts (monkey-patches engine.ctx.score in memory only; repo untouched, `git status` clean); results in scratchpad/hoard/ab-*-w50000.jsonl. Caveat: the 'cut' arm's extra full evaluations are not charged to the work meter, so its win record overstates strength. Spend and buy counts are not affected by that.)
- [verified-in-code-or-results] Candidate 2 (leaf neutrality) is real and secondary. The bootstrap vector has five non-zero weights (Material, BankLiquid, BankExcess, EconDelta at 100, PendingValue at 1), so cash, pending principal and live material all trade at par. A purchase is worth only its mining service PV, and only when the square is not flagged at risk. At Prepare banks of 25 or more the static margin between buying and not buying is exactly 0 in 92 of 186 roots against AIEngineV2. Against Rush it is 0 in 157 of 330 roots and negative in 79. The tilt weights act through both channels: the final-list buy share rises from 30.1% to 46.6%, and the leaf prefers buying at 332 of 338 roots. (muju/src/ai/hard/eval/weights.ts:20-28; muju/src/ai/hard/eval/pending.ts:116; scratchpad/hoard/roots-default-w1500-desktop-vs-Rush.jsonl and roots-bank25-t6000-desktop-vs-aiv2hardturn.jsonl via agg.py.)
- [verified-in-code-or-results] Candidate 3 is true but not binding. Paid rent and released principal are subtracted inside the EconDelta forecast. A tier-2 promotion therefore scores about -400 cc at the static leaf (RENT_PV is 422, truncated to whole crystals), unless it raises mining: plant 3 to 5 does, fire 1 to 1 does not. Promotion cost equals the material gained, so nothing else offsets it. Across 171 promo-offering roots the median static margin of the best promotion over the best no-spend was -400, with 118 negative. Against Rush it was negative in 139 of 156. Cancelling rent alone barely moved behaviour. The tilt arm, which makes cash cheaper than material, produced 5 promotions per game. (muju/src/ai/hard/tables/phasing-economy.ts:183 and 219; muju/src/ai/hard/core/income.ts RENT_PV = 422; muju/src/game/units.ts:279-284 (promotion cost = next.cost - current.cost); muju/src/game/upkeep.ts:5; agg.py promo lines; ab-rent and ab-tilt results.)
- [verified-in-code-or-results] Candidate 4 as stated is false: Prepare plan generation does not prune purchases away. planPurchases has a separate structural defect. It enumerates multisets depth-first in catalogue order and stops at maxPlans = 12 with keepPerMultiset = 3. At bank 12 or more, every emitted plan is fire_1 x 1..4 (12 crystals at most per turn). At banks of 35, 44 and 50, all 11 emitted plans were fire_1 only. In play, Hard bought fire_1 in 220 of 230 purchases against AIEngineV2-hard-turn, 130 of 137 against Rush, 217 of 232 against Balanced and 267 of 279 against aiv2-medium. It bought plant_1, the 3-mining body AIEngineV2 buys 83 of 200 times, 0 to 1 times per 32 games. The scorer-patched arms still averaged 3.0-3.1 crystals per buy. (muju/src/ai/hard/gen/purchase.ts:145-160 (DFS order), 441-461 (`written < limit` truncation); muju/src/ai/hard/config.ts:543 (maxPlans 12, keepPerMultiset 3, maxBodies 4); scratchpad/hoard/plans.ts output; replay meta.purchases tallies (this session).)
- [verified-in-code-or-results] The Texel tuner, as configured, cannot learn a price for cash or pending value. w[2], w[3] and w[58] are pinned and excluded from the free parameter list. TUNED_WEIGHTS is identical to DEFAULT_WEIGHTS, and hard@* ladder seats resolve to DEFAULT_WEIGHTS. (muju/lab/hard-ai/tune/texel.ts:82,87-88,259; muju/src/ai/hard/eval/weights.generated.ts:13-17; muju/lab/hard-ai/bots/hard.ts:286-290.)
- [inferred] The M6 bootstrap contract states the conservation identity (a BUY debits the bank and creates equal principal, so value is preserved). It even warns that leadCc must include pending principal so that a BUY does not manufacture a material deficit. But it appended PendingValue at stage 2, and nothing updated the within-turn scorer. This is a port oversight. Under Standard a BUY produced a live body that stage 0 counted as material. No doc in the repo diagnoses Hard-engine hoarding. (muju/docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:11,17-19,104; `grep -rni hoard muju/docs/hard-ai` returns only an unrelated line in understand/completeness-critique.md:181. The Standard-era behaviour is inferred from the header comment at gen/generate.ts:186-196, not read from old code.)
- [verified-in-code-or-results] The within-turn scorer closure is duplicated in 8 lab and test files. Any fix to engine.ts:359 has to be mirrored in each, or the analyzers and recall instruments will describe a different generator from the one that plays. (grep for `stage0(p, mover) + ... stage1(`: lab/hard-ai/analyze/engine.ts:180, lab/hard-ai/recall/run.ts:492, lab/hard-ai/audit/score.ts:59, lab/hard-ai/audit/gen-view.ts:75, lab/hard-ai/coverage/run.ts:221, lab/hard-ai/bench/p6-turn-time.ts:159, tests/ai/hard/generate.test.ts:52, tests/ai/hard/gen-trace.test.ts:52. (src/ai/hard/search/pvs.ts:694 also uses the same sum for futility, which is off.))

## Report
# Why Phasing Hard hoards: gap-fill report (read-only; all scratch output under scratchpad/hoard/)

## The mechanism

Candidate 1 is the binding cause. The defect is in the scorer and generator, not the weights. No weight vector fixes it fully while cash and pending value stay pinned at par, though a bank discount softens it.

A Phasing turn is an Act line followed by a Prepare plan, completed through the END_PLACE hand-off. The generator keeps 24 Act lines at the root (`tuneKeep`, `generate.ts:802-809`; K=24 in `config.ts:574`). For each line it enumerates up to 16 Prepare combos, so about 250 complete turns compete for the 24 slots of the root list.

Each complete turn is scored by `ctx.score` in `recordPrefixTerminal` (`generate.ts:879`). `offer()` then evicts the lowest `gainCc` and rejects ties (`generate.ts:915`). `ctx.score` is `stage0 + stage1` (`engine.ts:355-360`), and those two stages price a purchase wrongly:

- Stage 0 holds cash at 100 cc per crystal (`features.ts:190-191`; `weights.ts:23-24`).
- Pending principal is feature 58, in stage 2 (`features.ts:131,153`).
- `addPending` does not touch `materialCc` (`state.ts:465-472`).
- Every stage-1 weight is zero in the bootstrap vector (`weights.ts:20-28`).

A turn that buys a body of cost c therefore scores exactly 100*c cc below its own no-buy sibling. Two consequences follow. The K cut fills with the 24 no-spend Act endpoints, and the only buy that regularly survives is the cheapest body (fire_1, -300 cc) attached to the best Act line. Survivors are also ordered last: `finish()` sorts by `gainCc` (`generate.ts:963-978`), and `order.ts:421` adds `within/16` to the ordering key.

The M6 bootstrap contract (`docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md:17-19,104`) states the conservation identity: BUY preserves principal. It even warns that `leadCc` must include pending principal. But it appended PendingValue at stage 2, and nobody updated the within-turn scorer. I infer this is a port oversight: under Standard a BUY produced live material that stage 0 counted.

## Measured on real games

I rebuilt all 341 Hard-seat turn-start roots from the wall:6000 ladder against aiv2-hard-turn (A record 7/1/24). I ran the production root generator with an instrumented scorer (`scratchpad/hoard/hoard-trace.ts`, summarised by `agg.py`).

- The generator offers purchases at 338 of 341 roots, and 88.4% of the 84,670 offered complete turns carry a BUY. Candidate 4 as stated is false.
- After the K cut, 30.1% of 9,694 final-list candidates carry a BUY, and 85% of those are a single 3-crystal body. Thirty roots (8.9%) keep no buy at all, and 49 (14.5%) keep one or none.
- The within-turn gap between the best no-spend and the best buy is exactly 300 cc in 195 roots and at least 300 cc in all 338.
- The mean Prepare bank is 30.8 crystals. The mean largest offered spend is 11.1. The mean largest spend surviving into the root list is 3.5. The mean played spend is 2.05 per turn.
- From replay meta, the Hard seat gained 2,224 and spent 779, which is 35.0% (6.04 gained and 2.12 spent per turn). The ceiling implied by the surviving list is 3.5 / 6.04 = 58%, so the observed 26-35% follows from the generator.
- The full static leaf prefers some buy at 210 of 338 roots. In 209 of those 210, the buy the leaf likes best had already been cut (median lost margin 938 cc).

Against Rush (347 roots) the pattern is the same but worse:

- The mean Prepare bank is 43.9 with 2-4 units.
- The final-list buy share is 27.9%.
- The mean largest surviving spend is 3.1.
- The played spend is 0.73 per turn.

## The Prepare-root trace

A Prepare root has one Act endpoint and at most 16 combos, so nothing is lost to K. I used `prepare-root.ts` on p1-g3-s4_0_8-A-white.

- **Turn 5, bank 33.** Exact child-search values rise with spend while within-turn scores fall:

| Spend | Exact child value | Within-turn score |
| --- | --- | --- |
| None | 2200 | 1700 |
| One body | 2800-2900 | 1400 |
| Four bodies | 3300-3400 | 500 |

- **Turn 8, bank 50, 3 units.** The full static leaf is exactly 5500 for all 12 candidates. Exact child values still rise from 4800 (no spend) to 5900 (four bodies), and the Prepare-root search chooses 4x fire_1. In the recorded game, searched from the Act root, the engine spent nothing on that turn.

So with a neutral leaf, the search still values bodies once it is allowed to see them. The K cut is what binds.

## Counterfactual games

The arms are runtime monkey-patches of `engine.ctx.score`, run at fixed work 50k against the unmodified engine. There are 18 games on 2 p1-dev openings, so this is anecdotal.

| Arm | Games | Spend / income | Buys per game | Promotions per game | Result against baseline |
| --- | --- | --- | --- | --- | --- |
| baseline seats, pooled | 18 | 19.1% | 4.7 | 0.67 | not applicable |
| rent (w[Rent] = +422) | 4 | 28.7% | 6.8 | 2.75 | 1-3 |
| tilt (bank weights 90/25 only) | 4 | 47.5% | 21.2 | 5.0 | 4-0 |
| principal (scorer + 100 cc per pending crystal) | 2 | 46.6% | 38.5 | 1 | 1-0, one game undecided at the 80-turn cap |
| cut (complete turns scored by full leaf, weights untouched) | 4 | 54.8% | 45 | 1.5 | 4-0 |
| principal + tilt | 2 | 80.4% | 48 | 1 | 2-0 |
| cut + tilt | 2 | 71.1% | 50.5 | 1 | 2-0 |

- **Spend.** Fixing only the scorer moves spend from 19% to about 50% and purchases roughly ninefold. Adding a bank discount reaches 71-80%, close to AIEngineV2's 86-96%. In every game the patched seat bought 37-57 bodies against 2-11 for the baseline.
- **Strength caveat.** The cut arm's extra evaluations are not charged to the work meter, so its win record overstates strength. The buy counts are unaffected.
- **Tilt.** The tilt arm works through both channels. A BUY costs -25 cc per crystal in the K cut, and the leaf prefers buying at 332 of 338 roots. Even so, its best buy candidate is still cut at 93% of roots, and its largest surviving spend is only 5.4.

## The other candidates

- **Candidate 2, leaf neutral between cash and pending.** This is real and secondary. At Prepare banks of 25 or more the static margin is exactly 0 in 92 of 186 roots against AIEngineV2. Against Rush it is 0 in 157 of 330 roots and negative in 79. The negative cases are unexplained; rent-release effects in the forecast are the likely cause. The tilt runs show that a positive price for bodies over cash is needed to move from about 50% to about 80%.
- **Candidate 3, rent inside EconDelta.** This is true (`phasing-economy.ts:219` subtracts paid rent and released principal; `RENT_PV` = 422).
  - A tier-2 combat promotion is about -400 cc at the static leaf with no offset, because promotion cost equals the material gained.
  - The median static margin of the best promotion over the best no-spend is -400, negative at 118 of 171 roots.
  - Cancelling rent alone barely moved behaviour (2.75 against 1.25 promotions per game).
  - Discounting cash produced 5 promotions per game.
  - Rent is the promotion valuation problem, not the hoarding cause.
- **Candidate 4.** Purchases are not pruned away, but `planPurchases` has a separate structural defect.
  - **Code.** It enumerates multisets depth-first in catalogue order and stops at `maxPlans` = 12 with `keepPerMultiset` = 3 (`purchase.ts:145-160`, `441-461`; `config.ts:543`). At bank 12 or more, every emitted plan is fire_1 x 1..4, capped at 12 crystals per turn.
  - **Plan trace.** `plans.ts` confirmed this at banks 35, 44 and 50.
  - **Play.** Hard bought fire_1 in 220 of 230 purchases against AIEngineV2, 130 of 137 against Rush, 217 of 232 against Balanced and 267 of 279 against aiv2-medium. It almost never bought plant_1, the 3-mining body AIEngineV2 buys constantly. The patched arms still averaged 3.0-3.1 crystals per buy.

## Tuner

`texel.ts:82` pins w[2], w[3] and w[58] and excludes them from the free parameters (`texel.ts:259`). `TUNED_WEIGHTS` equals `DEFAULT_WEIGHTS`, and `hard@*` ladder seats resolve to `DEFAULT_WEIGHTS`. Texel cannot learn the cash price. Any corpus from current self-play is also dominated by hoarding.

## What would make it rigorous

Apply the scorer fix on a branch and update the 8 duplicated closures in lab and tests. Then run `lab/hard-ai/ladder/run.ts` for hard@desktop against aiv2-hard-turn and against Rush at wall:1500, 32 games each. That is roughly 10-15 minutes per row on 8 shards. Record the spend ratio and the Elo expectation before the run starts.

## Pragmatic order of work

1. Fix the scorer (S).
2. Fix the purchase-plan enumeration (S/M).
3. Decouple the K quota between Act lines and Prepare plans (M).
4. Give bodies a price above cash: unpin w[2], w[3] and w[58], or hand-set an interim discount (M; needs a contract amendment).
5. Fix promotion valuation (S/M).
6. Only then run Texel.

Files are in /private/tmp/claude-501/-Users-ethancd-src-deevgames/d0196f82-8636-4254-b748-56de209f4b8e/scratchpad/hoard:
- hoard-trace.ts
- agg.py
- roots-*.jsonl
- prepare-root.ts
- plans.ts
- hoard-ab.ts
- ab-*-w50000.jsonl