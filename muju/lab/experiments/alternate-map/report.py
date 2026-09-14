import json, pathlib
BASE=pathlib.Path(__file__).resolve().parents[3]
ROOT=BASE/'lab/results/alternate-map-2026-09-12'
s=json.loads((ROOT/'summary.json').read_text())
def wld(v):return f"{v['wins']} / {v['losses']} / {v['draws']}"
text='''# Alternate Muju map: strategic assessment and playtests

12 September 2026. Screenshot 1 is the alternate. Screenshot 2 exactly matched production at the start of this study. The F7 highlight in screenshot 1 denotes reserve 4, not another central 8. No production gameplay or map files were changed during the study. After reviewing the results, the designer chose the alternate for aesthetic reasons; it was deployed as the new-game default. Existing games retain their stored maps. See [release verification](../lab/results/alternate-map-2026-09-12/release-verification/live.json).

**Judgment:** the alternate is a credible variation with a more concentrated opening economy and a better-paying central battlefield. These tests do not establish that it improves overall balance, forces early central control, or makes games faster. Its clearest benefit is allowing economic income and military presence to overlap more often. Its main tradeoff is weakening the current map's distinctive side-economy routes.

## 1. Assessment before playtests

The pre-result hypotheses were saved in [PLAN.md](../lab/experiments/alternate-map/PLAN.md). This section preserves that theoretical assessment; measured corrections follow below.

### What actually changes

| Feature | Current | Alternate |
|---|---:|---:|
| Total crystals | 496 | 480 |
| Six cells within two orthogonal steps of each home | 48 | 60 |
| 10-reserve home cells per player | 4 | 6 |
| 10-reserve cells in each distant expansion | 6 | 4 |
| Stock in each original distant 3×2 footprint | 60 | 48 |
| Stock in each old 2×3 side shelf | 48 | 24 |
| Stock on the eight central-cluster coordinates | 32 | 64 |
| Empty-reserve cells | 18 | 18 |

The home additions are C1/A3 and their rotations H10/J8. The distant reductions are G2/G3 and D8/D9. The central 8s are F4, D5, E5, F5, E6, F6, G6 and E7. Both maps have 20 cells at reserve 10. The alternate replaces twelve side 8s with eight central 8s, accounting for the 16-crystal reduction.

These are resource maps, not terrain maps. A zero is traversable at the same cost as a ten. All initial movement costs were checked across all four study layouts and were identical. There are no new physical chokepoints, faster rush routes, or defensive terrain bonuses. Future tactical differences come from where players choose to put pieces and spend crystals.

### Current map: pros and cons

**Pros.** It presents a meaningful economic route choice: a nearby medium shelf, a dry approach toward a larger far expansion, or an advance through a poorer center. Productive miners can work separately from the fighting army. The side shelf gives slow miners a convenient second district when home starts running out. The two wings preserve opportunities to change fronts and attack an opponent's economic position without meeting its main force head-on.

**Cons.** Central presence is rewarded mainly by movement, attack reach and spawn geometry, with less sustained income. A player may spend actions moving fighters while its economy remains elsewhere. Nearby side income can reduce the incentive to contest the middle. Defending distributed miners and reacting across fronts puts pressure on the four-action budget. None of those incentives, by themselves, proves more actual turtling or longer games.

### Alternate map: pros and cons

**Pros.** More of the opening economy fits very close to home. Once armies advance, central squares can fund the pieces that are already contesting important space. Under passive income this is a real tactical benefit: a unit can fight, survive and collect in the same turn. Central deployment offers access to several directions and potentially larger spawn rectangles. Removing side shelves makes a purely local follow-up economy less comfortable after the opening.

**Cons.** It can strengthen an already successful central force economically, creating a possible snowball. The current distinction between side routes becomes less pronounced. Valuable central miners attract attacks and are more likely to be close enough for a cleave sequence. A broad spawn rectangle is vulnerable to a single infiltrator. Larger home deposits can support both a defender and the economy financing a rush; this is not an automatic anti-rush buff. The smaller overall stock can make sustained high-upkeep armies harder to maintain.

My initial hypothesis was a two-stage rhythm: a more compact opening, followed by a stronger reason to contest shared space. That is an incentive prediction, not evidence that players must rush the center. The cluster contains only 64 of 480 crystals, about 13%; its extra stock over the same current-map cells is only 32. There is still substantial income elsewhere.

### Relevant rules and unit implications

The study used today's four shared actions, passive turn-end collection, immediate T1 placement, 4/8 promotions, 0/1/2 upkeep and ten quiet player turns to a draw. Historical active-mining and six-action reports were not used as current rules.

* **Slow miners:** a fresh 4 pays a Muju 3 then 1; an 8 pays 3, 3, 2; a 10 pays 3, 3, 3, 1. The central cluster reduces relocation frequency after reaching it. But the starting Muju at A2 needs six movement actions to reach D5, versus two to reach the old A4 shelf. It cannot reach the center in a single four-action turn.
* **Water and Metal:** staying on a productive contested square can combine income with defensive presence. This is a role-based expectation; the tests do not establish that either element becomes dominant.
* **Fire and Lightning:** the map does not slow their movement or attacks. Lightning earns nothing from a rich square but can deny occupancy, block a rectangle or threaten home. Fire has an obvious target in an exposed central Plant miner.
* **Plant promotion:** under full income, Mining 3/4/5 minus upkeep 0/1/2 gives the same ongoing net 3. Promotions cost additional crystals and do not increase Plant speed. The richer center alone is not an economic case for rushing Sachakuna. On reserve 8 it earns 5 then 3, not two full Mining-5 payments. Immediate promotion gets its higher yield before the first higher-tier upkeep, so this steady-state comparison is not a complete investment calculation; combat, attack count, defense, timing and survival still matter.

## 2. What was tested

The completed study contains **2,736 games**: 1,280 existing-policy games across the two maps plus two component controls; 960 initial opening-route games; 480 exploratory deeper-center opening games; and 16 production-search games at the lab's reduced thinking budget. A 32-game scripted pilot and one AI pilot are excluded. There were no illegal-action records, invariant failures or capped games in the reported batches.

For each scripted matchup there were 20 seeds, both colors for distinct policies, and one game per seed for mirrors. Map variants received matching seeds and colors. These are variations of fixed bot policies, not thousands of independent human players. Cross-route groups have different seed streams; their direct ranking is exploratory. The deeper-anchor tests were added after the initial screen, and are labeled as such.

The component controls are: **home/expansion only**, retaining current shelves and center with total 496; and **center only**, retaining current home/expansion shapes while replacing side shelves, total 480. The latter combines geography and the 16-crystal stock reduction, so it does not isolate location from total resources.

### H1: The opening becomes more compact — supported, with a limit

A constrained unopposed economic test bought one additional Muju in turn 2 and one in turn 3, with no promotions or further purchases. All moves and buying stayed within the specified radius of home. Actual collision, action, spawn and passive-income rules were applied. Every selected witness was independently replayed.

| Allowed district | Current: five-turn gross income | Alternate: five-turn gross income |
|---|---:|---:|
| At most two orthogonal steps from home | 48 | 51 |
| At most three steps | 51 | 51 |
| At most six steps | 51 | 51 |

These particular five-turn totals are certified: the scheduled units can earn at most 6 + 9 + 12 + 12 + 12 = 51; the current smallest district contains only 48 total. Search found witnesses matching those bounds. Width 64 found only 47 in the current smallest district; width 256 found 48. All other listed totals were found at both widths.

Thus the alternate improves **income within a smaller footprint**, not the unrestricted maximum opening income in this test. Its small-radius witness takes 6, 9, 12, 12, 12 versus the current 6, 9, 12, 12, 9. This is not proof the opening survives a rush. Both bots passing and mining would reach the normal quiet-turn draw after round 5.

The resource-radius crossover is revealing: within four steps both layouts hold 84; within six, the current holds 128 and the alternate 116. Extra immediate-home stock is offset by losing the nearby shelf.

### H2: The center pays more — supported; more central occupation is not

Across the matched 320-game main sample per map, total income collected by both players on the eight central coordinates rose from **17.3 to 31.5 crystals per game**. Average unit-turns spent there were almost unchanged: **56.2 to 56.7**. Attack kills on those cells rose more modestly, from **3.81 to 4.15 per game**. The alternate mostly paid more for central occupation already happening in these policies.

The component controls reinforce the mechanism: central income was 17.6 with just the home/expansion changes, and 28.5 with just the shelf/center changes. The route screen also nearly doubled central income, from 19.7 to 38.3, with almost unchanged central unit-turns. These heterogeneous-sample averages describe the fixed study mix, not an expected rate for human matches.

### H3: An early center grab becomes a superior opening — not supported

All route policies used the same underlying army and combat policy. They changed the first-turn Hi anchor and the first purchased Muju's placement preference. This is a limited opening intervention, not a complete expert strategy.

The initial D5 center opening lost 37, won 0 and drew 3 against Rush **on each map**. Against Balanced it won 9 of 40 on the current map and 8 on the alternate, with the rest drawn. The old B4 shelf opening won 23 and 25 respectively against the same Balanced policy. The rich center therefore did not erase the value of the older staging route.

Geometry suggests a more deliberate adaptation. Hi reaches D5 in three actions, but occupies the only central-rich square in its rectangle. E5 takes four actions and exposes D5 for purchases. F5 also takes four and exposes D5, E5 and F4. On the otherwise initial board, an F5 anchor gives 27 empty spawn squares; an enemy on C3 cuts the total to two, with the original rear anchors still functioning. The opponent gets a turn between your advance and next Place phase.

Those deeper E5/F5 openings were tested separately. Neither produced a clear competitive breakthrough: all 80 alternate-map games against Rush across those two policies had zero wins, with 69 losses and 11 draws. Against Balanced, E5 scored 9/40 wins and F5 18/40, versus 8 and 18 on the current map. Rich-square access is useful, but an unsupported economic opening remains punishable.

### H4: The alternate weakens rush or fixes passivity — not supported

Results below are wins / losses / draws for the first-named policy. Counts include both colors except mirrors.

'''
text+='| Matchup | Current | Alternate |\n|---|---:|---:|\n'
for c in s['main']['cells']:
    text+=f"| {c['a']} vs {c['b']} | {wld(c['maps']['current'])} | {wld(c['maps']['alternate'])} |\n"
text+='''
Rush beat pure Expand in 39/40 current and 40/40 alternate games. Against AntiRush its wins changed only from 12 to 13, with the rest drawn. Balanced versus Turtle drew all 40 games on both maps, usually at the earliest quiet-turn limit.

The main sample's first attack kill stayed at median round 2. Median game length was 12 rounds current versus 13 alternate; draws were 196/320 versus 190/320. This is not evidence that the alternate makes games generally faster or solves passive play.

Rush mirrors were especially cautionary: **White won 15/20, Black 0/20, with five draws, on both maps**. These policies expose a first-player problem that the alternate did not fix. Rotational symmetry alone is insufficient evidence of fair alternating-turn play.

### H5: Tall siege or miner investment improves — not supported

The T3 Metal siege policy fell from 13/40 wins against Rush to 8/40. In paired cases, one result improved, six worsened, and 33 were unchanged. This is a useful warning signal, not a settled universal balance effect. The home/expansion-only control yielded 9 wins, while center-only yielded 14, so attributing the loss simply to the richer center would be misleading.

The policy keeping its lead Plant at tier 1 did not lose to the lead-Plant-T3 policy on either main map: 6 wins/34 draws current, 8 wins/32 draws alternate. Other pieces could still promote, so this is not an all-T1-army comparison. The steady-state upkeep arithmetic above is a firmer reason to avoid promoting solely for nominal Mining.

### Production-search supplement

'''
text+='| Opponent | Map | Search AI wins / losses / draws |\n|---|---|---:|\n'
for c in s['ai']['cells']:text+=f"| {c['opponent']} | {c['map']} | {wld(c)} |\n"
text+='''
These used current production medium search and WASM, but the existing fast lab preset: 120 ms MCTS limit and 60 iterations, not full UI thinking time. Two seeds and both colors are only a small robustness check, with timing-dependent decisions. The AI won three and drew one against Balanced on each map; it won none against Rush. This supplement supplies no basis for claiming stronger human-level balance.

## 3. Adaptation I would actually try

1. **Develop compactly, then decide which position can be defended.** The extra C1/A3 resources make a tighter early economy possible. Use that flexibility for protection or deployment; do not infer that extra Plant purchases are safe against every opening.
2. **Treat the center as income attached to a useful position.** Prefer taking a central 8 when the unit also threatens, screens, anchors reinforcements or supports another piece. Do not sacrifice several actions or a defender merely to stand on an 8.
3. **For a central expansion, plan the next purchase square.** A fast anchor reaching E5/F5 can make more sense than marching Muju from A2. Check what remains empty inside its rectangle, what the opponent can enter next turn, and where a defender will come from. The experiments show why this geometry matters, but do not validate an automatic turn-1 E5/F5 opening.
4. **Move off the old shelves sooner.** A4:B6 now contains 24 rather than 48. A Water unit gets two payments from a 4 rather than four from an 8. Plan the relocation before a dry turn forces you to spend scarce actions during a fight.
5. **Retain counterplay on the wings and against home.** Each distant 3×2 footprint still holds 48, and most map resources remain outside the center. A central opponent can leave a route or a rectangle vulnerable. Lightning's value is the disruption it causes, not its own collection.
6. **Promote for a concrete tactical job.** Defensive survival, a kill sequence, movement gains in other elements, or a home attack can justify upkeep. Higher Plant Mining alone does not. Keep money for the next upkeep and avoid letting a rich central position lure slow expensive pieces into an undefendable cluster.
7. **Watch the quiet-turn clock.** Economic superiority does not itself reset it. If the opponent can hold a draw, an expansion plan needs a credible attack kill or winning home sequence in time.

If the design aim is **more tactical importance for central positions**, this is a promising alternate. If it is **less rushing, more viable tall development, fewer draws, or improved first-player balance**, these tests have not demonstrated that outcome. I would retain it as a distinct map for human testing rather than call it a proven replacement for Unequal routes.

## Evidence, reproducibility and limits

* [Summary data](../lab/results/alternate-map-2026-09-12/summary.json), [economic and geometry witnesses](../lab/results/alternate-map-2026-09-12/probes.json), [method and commands](../lab/experiments/alternate-map/README.md).
* Raw `main.jsonl`, `routes.jsonl`, `routes-deep.jsonl`, `ai.jsonl` and first-seed replays are in the same results directory. The source manifests and archives preserve both the initial snapshot and completed experiment code.
* These are fixed-policy playtests plus narrow exact economic certificates. They do not solve Muju, establish optimal openings, or estimate human population win rates. Defensive scripts draw frequently; central openings inherit a weak response to Rush. Those limitations are visible in the results rather than removed from the sample.
* The component tests do not separate the shelf redistribution from its reduction in total stock. A future equal-stock central variant and human adapted play would be the most useful next tests.
* All reported game transitions passed strict legality and resource/occupancy checks. An attempted TypeScript check found the existing harness's stale `WinType` union omits `home-checkmate`; this analysis leaves production and shared harness files untouched and does not claim a clean repository typecheck.
'''
(BASE/'docs/ALTERNATE_MAP_REPORT-2026-09-12.md').write_text(text)
print('Wrote report:',len(text.split()),'words')
