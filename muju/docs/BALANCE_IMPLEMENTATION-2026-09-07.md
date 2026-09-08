> v1.6 follow-up: [upkeep and inactivity draw](UPKEEP_DRAW-2026-09-08.md) supersede the no-upkeep game lengths, cap rates and carrying values below. Historical measurements are preserved.

> Catalogue/visual-rank numbers superseded by v1.5: [tier-3 cap report](TIER3_CAP-2026-09-08.md). Historical measurements below remain unchanged.

# Muju v1.3: static unit values and applied balance changes

This continues the user's request to implement the earlier recommendations, create a pre-playtest static value solver, and improve the balance. It follows correctness commit `fc854fb`. The changes below are now in the gameplay catalogue; this document does not claim a production deployment.

## Applied changes

| Line | Stat | v1.2 | v1.3 |
|---|---|---|---|
| Lightning, tiers 1–4 | Attack | 1 / 2 / 2 / 3 | **2 / 3 / 3 / 4** |
| Plant, tiers 1–4 | Mining | 3 / 3 / 4 / 5 | **3 / 4 / 5 / 5** |
| Plant tier 4 | Speed | 1 | **2** |

These are seven numeric edits. Prices, build times, starting pieces, elemental relationships, damage/reset rules, six shared actions, spawn rectangles, hidden production and promotion rules remain intact. Fire, Water, Shadow and Metal values are unchanged.

Lightning retains DEF 1 and mining 0/0/1/1: it becomes a credible fast threat while still needing protection and financing. Fire retains its stronger late damage, greater durability at high tiers and early mining. Plant's tier-2 upgrade now provides an immediate extraction advantage over Metal. Tier 3 reaches the deepest layer; tier 4's improved relocation, attack and defense provide its next role instead of requiring an impossible sixth resource layer.

## The static solver

Run `npm run balance:static` from `muju`. Read [the model and assumptions](../lab/solver/README.md) and [current measured values](../lab/results/static-value-2026-09-07/current.md). Raw JSON records catalogue/model hashes and detailed witnesses.

The solver provides:

- Graph-aware stat distinctness and same-tier dominance checks.
- Cheapest qualifying **single-unit** roles across strike, extraction and anchor-occupation tasks, including optional mining and survival constraints. No task forces a named unit or tier.
- Exact cost/actions/bodies Pareto frontiers for bounded coordinated attacks.
- Exact finite-corridor mining optimization for every budget from zero to six actions.
- Marginal attack, defense, speed and mining values in concrete units: kill thresholds, actions, resources and conditional replacement/attack prices.
- Non-additive attack–speed effects, with a witness where neither stat alone enables the kill.
- Earliest individually financed tier access and capability frontiers for own turns 1–8, under three explicit income schedules.

The v1.2 model detects **Sachita dominated by Mazaska**. The applied v1.3 catalogue has **24 distinct profiles, zero same-tier dominance cases, and a sole-cheapest task witness for every one of the 24 types/tiers**. This is a meaningful static check, not a certificate that all 24 are equally strong or frequently optimal in complete games.

### What a stat is worth: concrete examples

**Attack:** against Inyan at distance 4, old Radi needs two distinct attackers, four shared actions and two crystals of bodies. ATK 2 crosses the three-damage threshold after elemental advantage, requiring one Radi, two actions and one crystal. In that exact situation, the attack point saves one crystal and two actions.

**Speed × attack:** old Radi at distance 8 cannot kill Inyan in three actions. ATK +1 alone still takes four actions to arrive and strike; SPD +1 alone arrives but deals insufficient damage. Together, those two marginal changes enable the kill within three actions. The report computes these interactions from discrete reach/defense thresholds rather than assigning a guessed multiplicative coefficient.

**Plant mobility:** on the solver's three-well scattered corridor, speed 2 lets the tier-4 miner collect ten resources in four actions rather than six. Even when the six-action total is unchanged, this releases two actions for the rest of the army.

**Shadow's existing niche:** Karanlık can extract two fresh layers and strike a Hi four squares away within three actions. Its price is 10; the next qualifying single piece costs 15 in the applied catalogue. That is a concrete fast mixed-purpose role. It does not imply Shadow should beat Water in a stationary mono-line contest. A coarse early mission grid omitted the mining threshold 2 and missed this role; the solver was corrected instead of buffing Shadow to satisfy a defective metric.

**Timing:** with three external crystals arriving per own action phase, Fire tier 2 can appear on turn 2, Lightning tier 2 on turn 3, Metal tier 2 on turn 4, and Plant tier 4 on turn 7. Those are lower-bound financing schedules with maintained anchors and no competing spending, not predicted play timings. Unlike an earlier review phrase about promotion downtime, actual promotion allows action immediately. The solver and current specification use that rule.

## Component tests before selection

Ten variants × sixteen matchups × forty games = **6,400 component-screen games**. Variants separately test Radi, Umeme, the complete Lightning progression, Plant tier 2, Plant tiers 2+3, Plant tier-4 speed, the Plant package, the combined package and the smaller combined alternative, against a frozen v1.2 baseline.

The screen showed why the final package is preferable to simply checking that dominance is gone:

| Variant | Adaptive economy vs Fire rush: natural wins / 40 | Caps / 40 |
|---|---:|---:|
| Baseline | 2 | 20 |
| Plant T2 mining only | 5 | 22 |
| Plant T2+T3 mining | 18 | 8 |
| Plant depth package | 18 | 8 |
| Lightning + Plant T2 only | 7 | 21 |
| Applied combined package | 20 | 6 |

Tier-4 speed alone did not change these early-game cells materially. Its inclusion rests on the static relocation/action-sharing benefit and differentiating the ultimate miner after deeper mining becomes available at tier 3. It is not credited with the package's early win-rate gains.

Lightning's changes are also non-additive in a policy simulation: Radi-only and Umeme-only each improved different cells, and their results do not sum to the complete progression's results. The complete progression has explicit tier roles in the static solver and the earlier fresh-seed evidence; the new combined package was then confirmed separately.

## Fresh-seed confirmation

Baseline and applied package each ran sixteen matchups × two hundred games = **6,400 further games**. Each matchup uses one hundred paired seed blocks and both seats. Across all **12,800 new games**, illegal actions and invariant failures were both **zero**.

The following counts are **natural victories**, excluding capped material/stockpile adjudication:

| Policy matchup (first policy's wins) | Baseline / 200 | v1.3 / 200 | Baseline → v1.3 caps |
|---|---:|---:|---:|
| Lightning / Metal | 7 | 61 | 4 → 0 |
| Lightning / Fire | 62 | 126 | 0 → 0 |
| Adaptive economy / Fire rush | 8 | 65 | 108 → 65 |
| Adaptive pressure / AntiRush | 111 | 126 | 89 → 74 |
| Plant / Shadow | 57 | 87 | 9 → 3 |
| Balanced / Lightning rush | 96 | 153 | 84 → 7 |
| Adaptive economy / Lightning rush | 28 | 44 | 167 → 46 |

The faster threat has counters: Balanced's total result against Lightning rush is **160/200**, including seven capped wins; adaptive economy's total is **90/200**, including forty-six capped wins. Pure Expand still loses to Lightning rush **189/200**. These counts support distinct pressure/response roles, not a universal opening or a requirement that every policy reach 50%.

[Complete results, paired seed-block intervals, variants and source hashes](../lab/results/e9-2026-09-07/comparison.md).

## Adversarial review and remaining weaknesses

- **Static witnesses can be contrived.** A cheapest piece in a one-unit mission need not beat two cheaper bodies or survive the opponent's best response. The coordinated-kill frontier helps expose some swarm substitutions, but no complete army optimizer or equilibrium proof is claimed. Do not maximize witness counts.
- **Lightning may still become the default pressure purchase.** It remains cheap and reaches forward spawn-denial positions quickly. Its poor mining and DEF 1 are retained deliberately. More capable opponents should test early mixed Lightning/Water armies and sacrifice-based anchor invasion.
- **Plant income can fund aggression.** This is partly desirable: an economy piece should support multiple plans. Nevertheless, improved extraction could make an obligatory Plant promotion opener. Fixed-income access tables intentionally do not model that economic feedback; the gameplay trials provide a separate check, and human opening exploration remains useful.
- **Some rigid policies still fail or stall.** Mono-Shadow versus Mono-Water remains 0/200. Mono-Plant versus Mono-Metal still has no natural wins, and its caps increase from 20 to 47. These are not declared fixed. Their individual pieces have other static roles, but mixed-army strategy and defensive conversion deserve continued attention.
- **A high total win rate can mean little finishing ability.** Balanced versus Expand still caps 182/200 games. The earlier fixed-Rush target is not reinstated; natural finishes and cap outcomes remain separate.
- **The income model is exogenous and the geometry simplified.** Paths are open, corridors are one-dimensional, local squads omit traffic and casualties, and financing assumes an intact exemplar. The reports explicitly expose these assumptions rather than assigning unsupported universal crystal prices.
- **AI strength remains a separate subject.** No static score is wired into the playing AI. Earlier correctness fixes remain, but dense-position search cost and difficulty calibration are not solved by changing unit statistics.

## Verification and maintenance

- **521 tests pass**, including thirteen static-model tests and updated combat/mining fixtures that retain their original rule assertions under the new catalogue.
- Production build, solver typecheck and `balance:check` pass.
- Tests cross-check actual combat/mining formulas, compare DP results with independent exhaustive enumeration, exercise phase-dependent financing and attack–speed complementarity, detect historical dominance, and maintain a static witness for every current unit.
- E8 reproduction now pins its historical baseline to `lab/solver/baseline-v1.2.json`; future catalogue edits will not silently relabel a new catalogue as the old baseline.
- Current `SPEC.md` tables match `src/game/units.ts`. The earlier review and historical v1.1 document remain historical records with pointers to this implementation.

Useful commands:

```sh
npm run balance:check
npm run balance:static -- baseline
npm run balance:static -- current
npm run balance:types
node --import tsx lab/experiments/e9-static-balance.ts confirm_base 100
node --import tsx lab/experiments/e9-static-balance.ts confirm_proposed 100
python3 lab/experiments/summarize-e9.py
```

Results are deterministic for the declared catalogue/scenarios/seeds; elapsed wall time is diagnostic metadata. Before rerunning, copy an output whose historical provenance should be retained because each named run overwrites its own artifact.

## Integration with the completed phone UI

The completed UI commit `8c37f3c` was integrated as `0e84932` after the balance change. Catalogue-driven displays pick up v1.3 automatically. Tutorial examples now use the actual catalogue for movement, combat and mining; the stale Water name, mining-depth numbers, and incorrect “damage equals the difference” wording were corrected. The damage example, immediate-action promotion explanation and once-per-target attack rule also match the engine.

The combined build and 521-test suite pass. All sixteen browser cases pass across the phone/landscape/desktop layouts and action flows. The added v1.3 case verifies Radi's kill threshold, Sachita's four-layer extraction and tutorial consistency. The final release build passed all sixteen cases together. The cross-game release smoke check now uses the phone UI labels and mines before ending actions, so the saved reinforcements phase has a legal purchase instead of being automatically skipped. The [updated mining tutorial](v13-mining-help.png) was visually inspected on a 390×664 viewport with no page errors.
