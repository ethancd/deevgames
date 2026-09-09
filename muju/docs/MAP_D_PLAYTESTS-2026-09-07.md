> **Historical baseline — superseded on the v2.1 feature branch (2026-09-09).**
> The well, depth, mine action, build queue/times, hidden economy and three-phase
> teaching below are historical. Current rules use passive 0/4/8/10 reserves
> (520 total), public tier-1 purchase and later-turn promotion. See [SPEC](../SPEC.md),
> [mining report](MINING_SIMPLIFICATION-2026-09-09.md) and
> [placement report](PLACEMENT_SIMPLIFICATION-2026-09-09.md). Old measurements
> remain labeled by their original versions; none establishes v2.1 balance.
> This branch has not been deployed.

> v1.6 follow-up: [upkeep and inactivity draw](UPKEEP_DRAW-2026-09-08.md) supersede the no-upkeep game lengths, cap rates and carrying values below. Historical measurements are preserved.

> Catalogue/visual-rank numbers superseded by v1.5: [tier-3 cap report](TIER3_CAP-2026-09-08.md). Historical measurements below remain unchanged.

# Map D: production launch and post-deployment playtests

> Historical release/report: the later [empty-approaches update](EMPTY_APPROACHES-2026-09-07.md) changes new games to 308 crystals. The measurements below describe the original 340-crystal map.

**Map D, “Unequal routes,” is live at [deevgames.pages.dev/muju](https://deevgames.pages.dev/muju/).** New games use the fixed 10×10 layout with 340 crystals. The v1.3 unit catalogue is unchanged. Existing saved games retain their original board.

**Recommendation: keep D as the current playtest map, with a specific concern about the return on deep mining.** Deliberate Plant investment and expansion remain useful in these tests. D also strengthens some cheap-pressure strategies and sharply reduces the economic premium of higher-tier miners. These results do not certify that all 24 units are competitively viable, or that D is the best arrangement of its minerals.

## What shipped and when

Release commit: `326f04386ff11a0bfc6b6a36c33fc40e8bcf2acb`. Production deployment: [98d645bc](https://98d645bc.deevgames.pages.dev/muju/).

- Exact map D from the reviewed five-map study; 180° rotation, 20 five-layer cells, 16 four-layer cells, 48 three-layer cells, 16 two-layer cells.
- Fresh shallow wells begin at depth 1. Their missing lower layers are absent resources, not already-mined layers.
- Initial capacities travel with new saves. Old schema-2 saves continue unchanged with their legacy resource budget.
- Updated tutorial, menu explanation, accessible cell depths, and conservation tests.
- 562 unit/property tests and 17 browser tests passed. Full-site phone/tablet checks passed for Muju, FORGE and Oracle. Screenshots were inspected. The actual Cloudflare workflow passed; production HTML/JS/CSS matched the local build byte for byte.

[Production phone screenshot](../lab/results/map-d-playtests-2026-09-07/production-phone.png).

Production browser verification finished **16:24:51 UTC**. The first comparative games began **16:26:04 UTC**, after deployment and verification, as requested. A later byte comparison at 16:30:41 UTC independently reconfirmed the live assets.

The separate legacy GitHub Pages/Jekyll job failed while parsing unchanged React example syntax in `mythgarden/specs/unclaimed-achievements.md`. This does not publish the Cloudflare production site and did not affect this launch. Its failure is recorded rather than described as passing CI.

## Study design

| Batch | Completed games | Comparison | Purpose |
|---|---:|---|---|
| Broad screen | 3,840 | A vs D; 24 matchups × 40 seeds × 2 seats × 2 maps | Rush, defense, expansion, all six mono-element lines, routing and self-play |
| Deliberate investment | 1,280 | A vs D; 8 matchups × 40 seeds × 2 seats × 2 maps | Save for one lead Plant at tier 2, 3 or 4; compare basic miners and staying home |
| Mineral-stock control | 640 | Shuffled D vs D; 8 matchups × 20 seeds × 2 seats × 2 maps | Hold total stock, depth histogram, rotation and full starting 2×2 homes constant |
| Search-AI calibration | 6 | Four fully paired rush games; two white-seat expansion games | Check real search-engine behavior with a reduced computation preset |

The **5,760 scripted games applied 5,441,108 actions with zero illegal actions, invariant failures or no-op anomalies**. Six completed search-AI games applied another 2,257 actions with none of those failures.

Every scripted game uses the production action/rules engine, a public-information bot view, strict legality checks, and invariants after every action. All maps use the same v1.3 units, whose catalogue hash is `7a5fdecdcd77f0dce8c81b0aad357ec439ddcf6f584a7f79f08b212955a2bc43`. No unit statistics were modified in any batch.

A seed block includes both seats on both maps. The self-play controls repeat the same seeded identical-bot game when the labels are reversed; **160 runs are such repeated controls**, not extra independent observations. Confidence intervals resample whole seed blocks, not individual games. They measure tie-breaking variability for these fixed policies, not uncertainty over human strategies. The exploratory 95% intervals are not corrected for the many comparisons.

Scripted games stop at 120 full rounds or 8,000 actions. A cap is **unfinished**, even if the harness assigns a material-plus-cash winner. Across all three scripted batches, **3,009/5,760 (52.2%)** reached a cap; 2,751 ended naturally. This is a major limitation, not evidence that half the games were valid strategic wins.

## Findings

### 1. The map reduces the payoff to deep mining

With opposing players actively building and contesting resources, the income premium of advanced Plant investment becomes much smaller on D.

| Policies facing each other | Mean gross-income lead by round 20 on A | On D | Change in lead, 95% paired interval |
|---|---:|---:|---:|
| Tier-2 Plant investment vs basic Plant | +10.9 | +3.0 | −7.9 [−15.3, −1.2] |
| Tier-3 Plant investment vs basic Plant | +22.1 | +2.8 | −19.3 [−28.2, −10.6] |
| Tier-4 Plant investment vs tier-3 Plant | +17.7 | +1.5 | −16.2 [−25.5, −7.6] |

These are **policy-versus-policy gross-income differences**, not isolated stat prices or net profits. Upgrades also change combat strength, survival, spending and movement. Income after a game ends is carried forward to the fixed round-20 horizon, avoiding survivor-only averages.

In the tier-4-versus-tier-3 matchup, the tier-4 policy harvested an average **52.7 fourth/fifth-layer crystals on A versus 19.0 on D** over the game. The topology has less work for a mining-5 unit: D contains only 20 fifth-layer crystals, versus 100 on A. The previous static concern therefore survives contact with active play.

The original static solver proved an equal optimal starter-income ceiling of 11/20/29/38/47 through rounds 1–5. That remains a statement about its opponent-pass opening problem. Actual strategies do not necessarily follow that optimum: the tier-3 policy versus basic miners earned 48.9 gross crystals by round 5 on A and 45.9 on D, after promotions and reinforcement choices.

### 2. Investment remains viable against pressure

A crucial correction to the test harness: the first routing probes usually spent their cash during the build phase, leaving little for deliberate Plant promotion. Their “Tech” names overstated what they exercised. They remain recorded as the original screen; the follow-up explicitly reserves the next promotion cost for one lead Plant and uses fixed tier targets on both maps.

| Tier-3 investment against… | A: natural wins / losses / unfinished | D: natural wins / losses / unfinished |
|---|---:|---:|
| Fire rush | 43 / 7 / 30 | **44 / 3 / 33** |
| Lightning rush | 39 / 13 / 28 | **35 / 9 / 36** |
| Mining denial | 47 / 10 / 23 | **50 / 6 / 24** |

So “fewer deep layers makes Plant tech useless” is too strong. Saving for tech, using its combat improvement, and moving to fresh ore can still beat these pressure policies. The unresolved games prevent turning these counts into a blanket win-rate claim.

Tier 4 also has demonstrated uses: against tier-3 investment on D, the tier-4 policy finished **20 wins, 1 loss and 59 capped games**. Its speed and combat upgrades matter in the full game, even when its mining premium shrinks. This is evidence of a useful policy, not proof of optimal tier-4 pricing.

### 3. Cheap pressure gains against some opponents

- Lightning rush versus naive expansion: **75 wins / 2 losses / 3 caps on A → 80 / 0 / 0 on D**.
- Tier-1 spam versus Balanced: **12 / 67 / 1 → 26 / 53 / 1**. Cheap flooding improves, but Balanced still wins most of this matchup.
- Mining denial versus Turtle: **29 / 0 / 51 → 38 / 0 / 42**. More games finish, but many remain unresolved.
- Mono-Plant versus Mono-Shadow: **33 / 45 / 2 → 23 / 54 / 3**. This is a warning for Plant-dependent compositions under this policy.

These effects are opponent-specific. Explicit investment handles pressure much better than naive expansion. Treating every economy bot as the same “playstyle” would have produced a misleading recommendation.

### 4. Leaving home earns more, but the bots often fail to finish

With both policies targeting Plant tier 3, the roaming policy earned **186.8 crystals by round 20 on D**, versus **73.1** for the home-limited policy. A produced 202.0 versus 79.8. Thus expansion has a large economic payoff on both maps; this study does not show that D uniquely creates it.

Despite that enormous income gap, the D matchup finished only **1 natural win and 79 capped games**. This exposes weak conversion of economic advantage into elimination, and possibly difficult late-game positions. A material adjudication cannot establish that home play is strategically defeated.

### 5. D's particular arrangement is not yet vindicated

The shuffled control preserves **all of D's depth counts, 340 total crystals, 180° symmetry and full starting homes**. Only one deterministic shuffled layout was tested; its exact cells are archived.

The eight topology comparisons produced no clear, robust improvement for D in the exploratory cap-inclusive score intervals. Natural outcomes also varied by opponent. For example, tier-3 investment versus denial finished 22 wins / 1 loss / 17 caps on the shuffled control and 28 / 3 / 9 on D.

This means the current evidence supports claims about **resource scarcity and particular matchups**, not that the crafted shelves and routes are superior to every equally funded arrangement. The control preserves histogram and home stock, but changes travel distances and clustering together; it is not a clean estimate of a single geometric feature.

### 6. Seat fairness and universal unit viability remain open

Rotation guarantees equal geometry, not equal first-move advantage. In 40 distinct Balanced self-play seeds per map, white received 25 cap-inclusive wins on both A and D; D had only three naturally finished games, all white wins. Those samples are too small and too capped to conclude fairness. Reversing identical bot labels must not be mistaken for cancelling the first-move effect.

Mono-Fire and Mono-Shadow each lost all 80 games to Mono-Water on both A and D under the greedy mono policies. Such intentionally bad counter-matchups do not prove an element has no place in mixed armies. Conversely, queue/promotion counts cannot prove that all 24 unit types and tiers have distinct, competitive roles. No human playtest or best-response search has been substituted by these automated runs.

## Real search-AI calibration and performance

The calibration used the actual `AIEngineV2` easy preset with the existing lab's **fast** overrides: 120 ms MCTS target, 60 iterations and 10 particles. It replans after every action and masks hidden information as in gameplay. This is not the full shipped difficulty/timing preset, and time-limited search is not fully seed-reproducible.

Against Fire rush, the AI won by elimination as white at round 19 on both maps. As black it led the material adjudication on both maps at the 20-round cap. Those four games completed legally.

Against the routing economy probe as white, A reached the cap after **573.4 seconds**, while D finished by elimination at round 10 after **111.8 seconds**. The D game finished during shutdown; the reversed-seat A attempt was interrupted and reversed-seat D was not run. Neither a partial result nor the missing pair is counted as a win, loss or completed game. The tiny, incomplete and time-dependent sample supports a correctness/performance check, not a balance conclusion.

The nominal MCTS budget does not bound an entire move's planning work. Dense-position search performance deserves a separate fix or profiling pass before relying on large real-AI tournaments.

## Recommendation

1. **Keep D available as the current map**, with v1.3 units and the board size fixed. It offers a legible expansion choice, and no correctness regression appeared in the completed tests.
2. **Treat deep-mining returns as the primary balance concern.** A useful next map experiment would move a small amount of existing ore into contested fourth/fifth layers while retaining total stock and D's simple regional structure. Test it before making another production change.
3. **Improve the economic test opponents and real-AI planning budget.** Cash reservation materially changed the conclusion. Add deposit-aware tech decisions and better conversion of income into attacks before interpreting capped economic games as strategic success.
4. **Use targeted human matches and stronger mixed-composition opponents** to evaluate readability, meaningful route choice, high-tier niches and first-move advantage. The 5,760-game count does not answer those questions by itself.

No post-test balance changes were pushed into gameplay. Production remains the exact approved D layout.

## Reproduction and evidence

The release is on production/master; the post-deployment study is preserved on `codex/muju-map-d-launch`. Game records are compressed losslessly as JSONL, with source hashes, seeds, options, per-player telemetry and timestamps. Representative full replays are also compressed. `deployment-verification.json` records production hashes and browser-check timing.

From `muju/`, with its dependencies installed:

```sh
# Separate processes may use shard indices; each owns a distinct output file.
node --import tsx lab/experiments/e10-map-d.ts 40 0 4 scripted
node --import tsx lab/experiments/e10-map-d.ts 40 1 4 scripted
node --import tsx lab/experiments/e10-map-d.ts 40 2 4 scripted
node --import tsx lab/experiments/e10-map-d.ts 40 3 4 scripted
node --import tsx lab/experiments/e11-map-d-investment.ts 40 0 2
node --import tsx lab/experiments/e11-map-d-investment.ts 40 1 2
node --import tsx lab/experiments/e12-map-d-topology.ts 20 0 2
node --import tsx lab/experiments/e12-map-d-topology.ts 20 1 2
python3 lab/experiments/analyze-map-d.py scripted
python3 lab/experiments/analyze-map-d.py investment
python3 lab/experiments/analyze-map-d.py topology
python3 lab/experiments/map-d-income.py
```

The analyzers read either freshly generated JSONL or the archived `.jsonl.gz`. The first screen's code is committed at `2003651`; later commits add explicitly labelled follow-ups. Whole-experiment source hashes also include other experiment TypeScript files, so adding a later experiment changes that hash without changing the v1.3 unit hash.

## Full results

Each row below has 80 games per map in the first two batches and 40 in the topology control. “Score” counts a win as 1 and a draw as 0.5 **including material adjudication at caps**. It is shown for audit and sensitivity analysis, not as the headline measure of competitive strength. W–L columns count only natural finishes; caps are separate. Self-play score differences cancel when identical labels are reversed and are uninformative about seat bias.

### Broad screen: A versus D

| Matchup (first style) | A natural W–L / caps | D natural W–L / caps | Δ score incl. cap adjudication, pp (95% CI) |
|---|---:|---:|---:|
| Rush vs AntiRush | 9–0 / 71 | 9–0 / 71 | +0.0 (-3.8, +3.8) |
| Rush vs Expand | 68–4 / 8 | 68–0 / 12 | +0.0 (-8.8, +8.8) |
| LightningRush vs AntiRush | 36–0 / 44 | 35–0 / 45 | -1.2 (-6.2, +2.5) |
| LightningRush vs Turtle | 58–0 / 22 | 62–0 / 18 | +5.0 (-3.8, +12.5) |
| LightningRush vs Expand | 75–2 / 3 | 80–0 / 0 | +6.2 (+1.2, +11.2) |
| Balanced vs Expand | 5–0 / 75 | 8–0 / 72 | +6.9 (-8.1, +21.9) |
| MiningDenial vs Turtle | 29–0 / 51 | 38–0 / 42 | +16.2 (+1.9, +30.6) |
| Tier1Spam vs Balanced | 12–67 / 1 | 26–53 / 1 | +17.5 (+8.8, +27.5) |
| Mono-lightning vs Mono-metal | 22–58 / 0 | 28–52 / 0 | +7.5 (-2.5, +17.5) |
| Mono-lightning vs Mono-fire | 44–36 / 0 | 43–37 / 0 | -1.2 (-3.8, +0.0) |
| Mono-shadow vs Mono-water | 0–80 / 0 | 0–80 / 0 | +0.0 (+0.0, +0.0) |
| Mono-plant vs Mono-metal | 0–63 / 17 | 0–64 / 16 | -7.5 (-16.2, +0.0) |
| Mono-plant vs Mono-shadow | 33–45 / 2 | 23–54 / 3 | -11.2 (-20.0, -3.8) |
| Mono-fire vs Mono-water | 0–80 / 0 | 0–80 / 0 | +0.0 (+0.0, +0.0) |
| RouteTech vs Rush | 23–26 / 31 | 30–33 / 17 | -8.8 (-18.8, +1.2) |
| RouteTech vs LightningRush | 17–31 / 32 | 26–36 / 18 | -6.2 (-16.2, +2.5) |
| RouteBasic vs Rush | 24–21 / 35 | 27–24 / 29 | -3.8 (-12.5, +5.0) |
| RouteBasic vs LightningRush | 19–27 / 34 | 21–29 / 30 | -2.5 (-10.0, +5.0) |
| RouteTech vs HomeTech | 0–0 / 80 | 0–0 / 80 | +0.0 (+0.0, +0.0) |
| RouteBasic vs HomeTech | 0–0 / 80 | 0–0 / 80 | +0.0 (+0.0, +0.0) |
| RouteTech vs RouteBasic | 0–0 / 80 | 0–0 / 80 | +0.0 (+0.0, +0.0) |
| RouteTech vs MiningDenial | 23–16 / 41 | 16–24 / 40 | -10.0 (-22.5, +2.5) |
| Balanced vs Balanced | 17–17 / 46 | 3–3 / 74 | +0.0 (+0.0, +0.0) |
| RouteTech vs RouteTech | 0–0 / 80 | 0–0 / 80 | +0.0 (+0.0, +0.0) |

### Explicit investment: A versus D

| Matchup (first style) | A natural W–L / caps | D natural W–L / caps | Δ score incl. cap adjudication, pp (95% CI) |
|---|---:|---:|---:|
| InvestT3 vs Rush | 43–7 / 30 | 44–3 / 33 | +5.0 (+0.0, +11.2) |
| InvestT3 vs LightningRush | 39–13 / 28 | 35–9 / 36 | +5.0 (-1.2, +12.5) |
| InvestT3 vs MiningDenial | 47–10 / 23 | 50–6 / 24 | +5.0 (-5.0, +15.0) |
| InvestT3 vs InvestT1 | 2–0 / 78 | 3–0 / 77 | -14.4 (-26.2, -1.9) |
| InvestT2 vs InvestT1 | 0–0 / 80 | 0–0 / 80 | -5.6 (-16.2, +5.0) |
| InvestT4 vs InvestT3 | 27–0 / 53 | 20–1 / 59 | -1.9 (-15.0, +11.2) |
| InvestT3 vs HomeT3 | 0–0 / 80 | 1–0 / 79 | +0.0 (+0.0, +0.0) |
| InvestT3 vs Balanced | 2–2 / 76 | 0–0 / 80 | +13.8 (+5.0, +22.5) |

### Fixed shuffled control S versus D

| Matchup (first style) | S natural W–L / caps | D natural W–L / caps | Δ score incl. cap adjudication, pp (95% CI) |
|---|---:|---:|---:|
| InvestT3 vs Rush | 26–0 / 14 | 25–0 / 15 | +0.0 (+0.0, +0.0) |
| InvestT3 vs LightningRush | 25–4 / 11 | 21–5 / 14 | -2.5 (-12.5, +7.5) |
| InvestT3 vs MiningDenial | 22–1 / 17 | 28–3 / 9 | -5.0 (-12.5, +0.0) |
| InvestT3 vs InvestT1 | 0–0 / 40 | 0–0 / 40 | +0.0 (-17.5, +17.5) |
| InvestT2 vs InvestT1 | 0–1 / 39 | 0–0 / 40 | -18.8 (-37.5, +0.0) |
| InvestT4 vs InvestT3 | 10–2 / 28 | 11–0 / 29 | +0.0 (-17.5, +20.0) |
| InvestT3 vs HomeT3 | 0–0 / 40 | 1–0 / 39 | +0.0 (+0.0, +0.0) |
| InvestT3 vs Balanced | 1–0 / 39 | 2–0 / 38 | +5.0 (-5.0, +15.0) |
