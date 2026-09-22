"""Render the report from retained machine-readable summaries (run after analyze.py)."""
from pathlib import Path
import json,statistics,gzip,collections
P=Path('lab/results/depth-economy-2026-09-09')
read=lambda n:json.loads((P/(n+'.json')).read_text())
initial=read('summary');s=read('sustain-summary');cf=read('sustain-counterfactual-summary');ai=read('real-ai-summary');paired=read('sustain-paired-comparison')
def table(headers,rows):return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(map(str,r))+' |' for r in rows])
def pct(n,d):return f'{100*n/d:.1f}%' if d else '—'
def f(x):return f'{x:.1f}' if x is not None else '—'
outcomes=table(['Outcome / measure','A baseline','B moderate','C steep'],[
 [name,*[s[e]['outcomes'].get(key,0) for e in 'ABC']] for name,key in [('Elimination','elimination'),('Home occupation','home-occupation'),('Upkeep elimination','upkeep-elimination'),('Inactivity draw','inactivity'),('Safety cap','cap')]]+[
 ['Invalid games',*[s[e]['invalid'] for e in 'ABC']],['Mean / median rounds',*[f"{f(s[e]['rounds']['mean'])} / {f(s[e]['rounds']['median'])}" for e in 'ABC']],
 ['Mean income / player',*[f(s[e]['incomePerPlayer']['mean']) for e in 'ABC']],['Mean upkeep / player',*[f(s[e]['upkeepPerPlayer']['mean']) for e in 'ABC']],
 ['Mean purchases + promotions / player',*[f(s[e]['purchasesAndPromotionsPerPlayer']['mean']) for e in 'ABC']],['Mean final cash / player',*[f(s[e]['finalCashPerPlayer']['mean']) for e in 'ABC']],
 ['First attack: median round',*[s[e]['firstAttack']['median'] for e in 'ABC']],['First kill: median round',*[s[e]['firstKill']['median'] for e in 'ABC']],
 ['T2 first arrival: median round',*[s[e]['tier2Arrival']['median'] for e in 'ABC']],['T3 first arrival: median round',*[s[e]['tier3Arrival']['median'] for e in 'ABC']]])
invest=table(['Plant T2→T3 measure','A','B','C'],[
 ['Promotions',*[s[e]['upgrades']['n'] for e in 'ABC']],
 ['Ever covers cost + added rent with fifth layers',*[pct(s[e]['upgrades']['everEstimatedPayback'],s[e]['upgrades']['n']) for e in 'ABC']],
 ['Still covers those costs at lifetime end',*[pct(s[e]['upgrades']['finalEstimatedProfitable'],s[e]['upgrades']['n']) for e in 'ABC']],
 ['Mean fifth-layer receipts / promotion',*[f(s[e]['upgrades']['fifthIncome']['mean']) for e in 'ABC']],
 ['Mean total receipts while T3',*[f(s[e]['upgrades']['grossIncome']['mean']) for e in 'ABC']],
 ['Mean added rent',*[f(s[e]['upgrades']['extraRent']['mean']) for e in 'ABC']],
 ['Mean estimated lifetime net',*[f(s[e]['upgrades']['estimatedNet']['mean']) for e in 'ABC']],
 ['Mean mine / move / attack action points while T3',*[' / '.join(f(s[e]['upgrades'][k]['mean']) for k in ['mineActions','moveActions','armyActions']) for e in 'ABC']],
 ['Immediate static 6-action income advantage ≥6',*[f"{s[e]['opportunities']['oneTurnGrossAdvantageAtLeastSix']}/{s[e]['opportunities']['n']}" for e in 'ABC']]])
pairrows=[]
for cell in [0,1,6,7,3,4,12,15,16,19]:
 row=s['A']['pairs'][cell];counts=[]
 for e in 'ABC':
  o=s[e]['pairs'][cell]['outcomesA'];counts.append('/'.join(str(o.get(k,0)) for k in ['win','loss','draw']))
 pairrows.append([row['a']+' vs '+row['b'],*counts])
pairtable=table(['First policy: wins/losses/draws (40 games)','A','B','C'],pairrows)
cfrows=[]
for e in 'ABC':
 c=cf[e];pays=[x['versusRetain']['firstMeasuredTargetPayback'] for x in c['comparisons'] if x['versusRetain']['firstMeasuredTargetPayback']]
 cs=[]
 for b in ['promote','retain','army']:
  o=c['outcomes'][b];cs.append('/'.join(str(o.get(k,0)) for k in ['win','loss','draw']))
 cfrows.append([e,*cs,f"{len(pays)}/{c['origins']}",f(statistics.median(p['elapsed'] for p in pays)) if pays else '—'])
cftable=table(['Economy','Promote W/L/D','Retain W/L/D','Three Water T1 W/L/D','Target net catches T2 while both alive','Median own turn among those cases'],cfrows)
airows=[]
for e in 'ABC':
 games=[g for g in ai['games'] if g['economy']==e and g['adapter']];o=collections.Counter(g['aiOutcome'] for g in games)
 airows.append([e,len(games),o['win'],o['loss'],o['draw'],o['cap'],o['invalid'],sum(g['winType']=='upkeep-elimination' for g in games)])
aitable=table(['Economy','Games','AI wins','AI losses','Draws','Caps','Invalid','Upkeep-elimination games'],airows)
controls=[g for g in ai['games'] if not g['adapter']]
controltext='; '.join(f"AI as {g['aiSeat']}: {g['aiOutcome']} by {g['winType']} in round {g['turns']}" for g in controls) or 'Pending.'
leads=table(['Round-5 asset lead ≥6','A','B','C'],[
 ['Eligible games',*[s[e]['earlyLead']['n'] for e in 'ABC']],['Leader wins / natural decisions',*[f"{s[e]['earlyLead']['converted']}/{s[e]['earlyLead']['natural']}" for e in 'ABC']],
 ['Trailer later reaches asset parity',*[f"{s[e]['earlyLead']['recovered']}/{s[e]['earlyLead']['n']}" for e in 'ABC']]])
t1shares=[pct(sum(v for k,v in s[e]['incomeByDefinition'].items() if k.endswith('_1')),sum(s[e]['incomeByDefinition'].values())) for e in 'ABC']
promos=table(['Promotion count','A','B','C'],[[k,*[s[e]['promotionsByDefinition'].get(k,0) for e in 'ABC']] for k in ['plant_1->plant_2','plant_2->plant_3','metal_1->metal_2','metal_2->metal_3']])
initialtable=table(['Initial inherited-policy screen','A','B','C'],[
 ['Natural wins (all types)',*[sum(v for k,v in initial[e]['outcomes'].items() if k not in ['inactivity','cap','draw']) for e in 'ABC']],
 ['Inactivity draws',*[initial[e]['outcomes'].get('inactivity',0) for e in 'ABC']],['Safety caps',*[initial[e]['outcomes'].get('cap',0) for e in 'ABC']],
 ['Mean income / player',*[f(initial[e]['incomePerPlayer']['mean']) for e in 'ABC']]])

report=f'''# Muju Hono Tanka: absolute-depth mining study

**Recommendation: human-playtest B (1,1,1,2,3), alongside unchanged A. Do not adopt either variant yet. Reject C (1,2,3,4,5) as the next balance candidate.** B gives Plant T3 a conditional economic reason to exist without changing starting income. C mostly subsidizes the wider economy, and its added wealth does not reliably improve decisive play or Plant's competitive position.

No production files, unit definitions, map, prices, upkeep, combat, victory rules or deployment were changed. Experiments run in generated copies under `lab/experiments/depth-economy/.sandbox`. Checked-in baseline: `{read('production-manifest')['gitHead']}`. Study date: 2026-09-09 UTC (September 8 local).

## Scope and confidence

The initial preregistered screen is **960 games/economy**: 24 fixed pairings × 20 seeds × both seats. Inspection exposed a rent-management weakness in the inherited policies. A separately labeled follow-up repeats all **960/economy** with cash reserved for upkeep and intended promotion. The two screens total **5,760 games**, not 5,760 independent expert contests. All figures below use the final reserve policy unless identified otherwise.

There are **288 measured counterfactual continuations**: 16 captured promotion positions/economy × three choices × two policy screens; **24 Medium production-AI games** plus **two unadapted-A controls**; 432 exact single-turn routes, 144 explicitly optimistic multi-turn bounds, 72 legally executed three-turn route witnesses, nine tactical removal fixtures and three home-defense branches. Eight additional baseline control games match production action-for-action after normalizing random starting IDs.

The [preregistered plan and disclosed amendments](../../experiments/depth-economy/PLAN.md) precede the relevant runs. A first reserve-wrapper attempt prevented intended promotions through conflicting savings thresholds; its 2,880 legal diagnostic games and source are retained in `reserve-v1-diagnostic/`, **excluded from the investment comparison**. They are policy implementation diagnostics, not invariant failures. The final reserve rule was fixed identically in A/B/C; game economics were never retuned.

## What the economic change actually buys

| Quantity | A | B | C |
| --- | --- | --- | --- |
| Absolute layer values | 1,1,1,1,1 | 1,1,1,2,3 | 1,2,3,4,5 |
| Total finite map value | 308 | 384 | 748 |
| Fresh five-deep well: Plant T1 | 3 | 3 | 6 |
| Fresh five-deep well: Plant T2 / Metal T3 | 4 | 5 | 10 |
| Fresh five-deep well: Plant T3 | 5 | 8 | 15 |
| Plant T2→T3 extra receipts per five-deep well | 1 | 3 | 5 |
| Plant T1→T2 extra receipts per ≥4-deep well | 1 | 2 | 4 |

Physical geography remains 20 five-deep, 16 four-deep, 48 three-deep and 16 empty wells. A fifth layer left behind remains worth 1/3/5; it never becomes a new first layer. B adds 76 crystals, of which 40 are on fifth layers. C adds 440, only 80 of them on fifth layers: **252 of C's new crystals are already reachable by Plant T1**. Water T1 and Metal T1 fresh-well income also rises from 2 to 3 in C. This is why C is a broad early-economy change.

For a fixed Plant route, promotion's incremental mining account is:

`fifth layers collected × fifth-layer value − 6 − additional paid upkeep`

T2 already reaches the first four layers. Promotion does not consume action points; subsequent movement/mining does. In the legal safe-home witness, both units visit three deep wells in five actions on the promotion turn, leaving one of the army's six actions. T3's **net cash advantage over T2** is −3 / +3 / +9 that turn, and −4 / +4 / +12 after three own turns. The four home bottoms are finite; after collecting them, additional rent erodes the gain. On a four-layer shelf, shallow region or fully depleted area, T3 has **zero additional mining access** and cannot repay the upgrade through depth alone. A skimmed-to-four well pays T3 once and nothing to T2.

These are executable witnesses with legal phases, movement, shared six-action budget and rent; the enemy waits. The 432 enumerated routes are exact only on their static board. The separate pooled multi-turn bounds are optimistic and are not claimed as executable optimal schedules. See [scenario data](scenarios.json) and [legal action witnesses](legal-witnesses.json).

## Full games with upkeep reserved

{outcomes}

Rounds are full white/black rounds; the inactivity limit remains ten consecutive **player turns**. Arrival medians condition on that tier actually arriving. Inactivity is a legitimate draw, not an adjudicated win. No final reserve-screen game hit a cap or failed an invariant/legal-action check. The initial screen's sole cap belongs to C and is kept separate.

{pairtable}

B raises Plant3's natural wins against Rush from 18/40 to 27/40; the paired seed-block bootstrap difference is +22.5 points, 95% interval +7.5 to +37.5. This crosses the preregistered single-pair review threshold and deserves human scrutiny. The gain does **not** reproduce across every counter: against invasion it remains 24/40, and denial's +5-point estimate has an interval spanning zero. These intervals concern the 20 seed blocks and fixed bots, are exploratory after policy repair, and have no multiple-comparison correction.

C yields over twice A's average income, but natural finishes fall from 435 to 364 and inactivity rises from 54.7% to 62.1%. Median games shorten, so this is not a simple longer-game effect. Plant3's C wins against invasion fall to 11/40 while home-turtle wins rise to 15/40. **More money changes which scripts fail; it does not establish a stronger, healthier investment strategy.** The old inherited-policy screen shows the same broad concern:

{initialtable}

Plant3-versus-Plant2 and Plant3-versus-Metal3 comparisons are dominated by draws. A 0–0–40 line is absence of a decisive result, not proof that the strategies are balanced or equivalent.

## Does Plant T3 earn its six crystals?

{invest}

The fifth-layer calculation is a **same-route attribution estimate**, not a counterfactual game. Break-even includes zero net. Its rent term assumes T2 would stay for the same paid upkeep periods; combat value, T2's alternative routes, replacement troops, cash timing, and the value of released army actions are omitted. The lifetime estimate is negative even in B because the fixed policy often keeps paying rent after the rich route has ended. B gives an investment window; it does not make permanent T3 ownership profitable by itself.

At promotion, a static six-action route with at least six extra gross crystals exists in 0/524 A, 98/541 B and 47/722 C promotion events. These are selected promotions, not the prevalence over all possible T2 decisions. In the 16 captured reserve-policy positions per economy, the corresponding counts are 0/16, 4/16 and 0/16. All four B opportunities still offer that gross advantage at the next own-turn boundary on the actual promoted continuation. This is a small, selected accessibility check; future opponent play remains a risk. Full evolving records: [route persistence](route-persistence.json).

For measured counterfactuals, each saved state continues with identical continuation seeds in three branches: promote now; retain T2 with the policy's usual spending; or retain T2 and queue three Water T1 units for the six crystals when legal. Purchase timing, spawn restrictions and upkeep remain real. Each branch can move differently, lose different units and reassign army actions.

{cftable}

“Target net” compares the particular miner's actual income minus its actual rent and promotion expense. It is measured, but **it can improve by taking more of the army's actions**. The table requires both target units still alive when crossing, and includes no terminal-time extrapolation. Last-common-round timelines retain total army income, upkeep, assets and action differences. The positions are selected because the initial policy chose promotion, and state/seed selection can differ across economies; this is not a randomized overall promotion win rate.

An instructive B counterexample is `sustain-B-6-0-1`: the promoted miner catches T2's net account on the sixth own turn, yet the promoted branch loses; keeping T2 or buying the three Water units wins. In `sustain-B-3-0-0`, target payback needs six additional mine actions and six additional movement actions at its first crossover; the whole army has less income at that point. These are economic opportunity costs, not free upgrade income. Detailed branches: [counterfactual comparison](sustain-counterfactual-summary.json).

## Metal, shallow miners, congestion and aggression

Metal T3 costs the same 12 total crystals and pays the same two upkeep as Plant T3, but has Speed 2 and Defense 6 versus Plant's Speed 1 and Defense 4; both attack for 2. Plant alone accesses layer five. On compact deep clusters Plant extracts more; on four-layer shelves both have the same yield and Metal's movement/defense advantage remains. An adjacent Fire T2 or Lightning T3 can kill Plant T3 in the authored tactical fixture, but cannot kill Metal T3 alone. Two Fire T1 attackers can remove either. These exact current-turn tests exclude the economic cost of assembling those attackers.

An independent home-defense witness shows a reason to promote unrelated to mining: Plant T2 cannot remove a Fire T1 occupying its home; T3's attack increase lets it do so immediately. Retaining cash or queueing three Water units loses before those units arrive. A mining-only ledger cannot price this tactical benefit.

{promos}

T1 units contribute {t1shares[0]}, {t1shares[1]} and {t1shares[2]} of all income in A/B/C. Shallow miners retain substantial work. In C, a fresh three-deep well pays Plant T1 six crystals, more than the five-crystal bottom left in a deep well; stronger bottom values do not automatically prioritize bottom collection. The six shared actions still bind, and excess purchases can accumulate in queues or crowded armies.

Representative `sustain-C-6-0-0` earns 101 white crystals through round 5 and queues 29 units, but makes only three attacks, has placed none of those reinforcements by then, and eventually loses by home occupation. Its A counterpart earns 21, queues seven, makes five attacks, and ultimately wins. The transcripts demonstrate that an income lead can coexist with failed deployment and defense; they do not prove a single action caused the result. The original `A-0-0-0` additionally demonstrates repeated promotion followed by next-upkeep release, explaining the reserve-policy follow-up. Twenty-five selected action streams, including the cap, were independently replayed through the engine with matching final state and per-action invariants: [inspection records](inspected-replays.json).

## Leads and the draw clock

{leads}

Assets mean surviving catalogue value + cash + paid queue. Among natural decisions with an eligible round-5 lead, conversion is 59.2% / 62.4% / 47.7%. That does not show the preregistered +20-point self-reinforcement signal. The six-crystal threshold is not scale-normalized, and this observational comparison mixes strategies and excludes early finishes; it is evidence against a simple “income leader always wins” story, not a causal test of runaway feedback. Finite ore prevents infinite production, but does not by itself rule out snowballing or undesirable army growth.

Late mining at seven or more quiet player turns occurs in 6 / 14 / 4 reserve-screen games. **None is a fifth-layer-only extraction.** No tested policy establishes a cheap bottom-layer stalling exploit. The focused tests nevertheless confirm that one bottom-layer action resets the clock even at nine quiet turns, regardless of whether it pays 1, 3 or 5. Exhausted wells cannot repeat that reset. B/C therefore improve the financial reward for an existing finite reset opportunity; deliberate clock-management play remains untested.

## Production AI: a challenge, not expert certification

{aitable}

This bounded sample uses the actual Medium AI, production WASM tactics, 4,000ms own-turn budget and unchanged difficulty/weights. Its mining-potential feature is changed from nominal Mining stat to actual current-cell payout **in A as well as B/C**; simulated cash, planning income and observed events use the same variant values. Thus the A study AI is an explicitly adapted control, not byte-identical production evaluation. Two unadapted-A controls versus Plant3 produce: {controltext}

The AI games expose substantial spending/upkeep and strategic weaknesses. They must not be used to certify an optimal Plant/Metal policy or a subtle win-rate ranking. In particular, several A/B losses remove the AI's last units through upkeep after promotion. Stronger search did not automatically repair economic planning. **C improves the AI's results to 4/8 wins versus 2/8 in A and B, and avoids the A/B upkeep-elimination outcomes. This challenges the scripted preference for B:** C may partly compensate for this AI's spending weaknesses. Eight games per economy cannot distinguish better game balance from a better fit to one policy. The unadapted-A controls also expose sensitivity to the actual-yield feature adapter and timing; do not claim unchanged-A AI behavior from scripted trace equivalence. All outcomes, promotions and action records are retained; any cap or invalid game is separated in the table. Search is seeded but wall-clock-budgeted, so exact decision sequences may change on another run or machine. Several games overlapped short scripted/analysis jobs; timings and seed pairing do not remove that hardware-budget limitation.

## Implementation and validation audit

- The production engine, harness, catalogue, WASM and relevant policy sources are archived in `production-source.tar.gz`; per-file original hashes are in `production-manifest.json`. `prepare.py` extracts independent reference and experiment copies and applies checked source substitutions, recorded in `engine-patches.json`.
- `resourceLayers` and `minedDepth` stay physical. `calculateMiningLayers` controls removal, while yield and remaining crystal value sum absolute depth prices. Physical capacity conservation and weighted crystal/spending conservation are independently checked.
- Audited consumers include simulator income, AI mining potential, plan income scoring, public observed mine events, bot immediate/destination/denial/queue scores, reachable/total-board helpers, original map value, replay encoding and cap accounting. WASM solves movement/combat/removal and receives actual cash for promotions; it does not price mining. Replay cells encode physical layers; economy metadata supplies payout. Caps use actual cash/material/queue and are never counted as natural wins.
- Historical E9 resets the catalogue to v1.2, uses uniform five-layer wells and elimination-only victory; historical map helpers and E10–E12 depth telemetry assume unit-value layers. They are documented and excluded, not silently imported. New scenario helpers use the current 308-layer map and explicit values. Production UI crystal labels remain unchanged because no variant UI is built or deployed.
- **456 existing production game tests pass**, as do 1,134 exhaustive economy/unit/capacity/depth cases, eight normalized baseline game traces, full-game invariants, independent representative replays and TypeScript checking. Starting IDs are deterministic in the sandbox; production timestamp/random IDs are normalized only for comparison. No AI weight, stat, price or upkeep schedule was retuned.

## Reproduction and preserved data

Use Node 24 with the repo's existing Muju dependencies. Run from `/Users/ashkie/src/deevgames/muju`. To rerun without overwriting these retained records, copy the Muju directory to a **new local study directory**, remove that copy's `lab/results/depth-economy-2026-09-09` except `production-source.tar.gz` and `production-manifest.json`, and leave the original directory intact. `--restore` uses the archived baseline even if production has since changed. Scripts refuse to overwrite raw game streams.

```sh
python3 lab/experiments/depth-economy/prepare.py --restore
node --import tsx lab/experiments/depth-economy/validate.ts
node --import tsx lab/experiments/depth-economy/scenarios.ts
node --import tsx lab/experiments/depth-economy/witnesses.ts
for economy in A B C; do
  node --import tsx lab/experiments/depth-economy/run.ts "$economy" 20
  node --import tsx lab/experiments/depth-economy/counterfactual.ts "$economy"
  node --import tsx lab/experiments/depth-economy/run.ts "$economy" 20 sustain
  node --import tsx lab/experiments/depth-economy/counterfactual.ts "$economy" sustain
done
node --import tsx lab/experiments/depth-economy/real-ai.ts
node --import tsx lab/experiments/depth-economy/inspect.ts
python3 lab/experiments/depth-economy/analyze.py
python3 lab/experiments/depth-economy/analyze.py sustain
node node_modules/typescript/bin/tsc -p lab/experiments/depth-economy/tsconfig.json --noEmit
python3 lab/experiments/depth-economy/report.py
python3 lab/experiments/depth-economy/finalize.py
```

Raw files are concatenated-gzip JSONL (Python `gzip.open` and ordinary `gzip -dc` read them). `scripted-{{A,B,C}}.jsonl.gz` and `sustain-{{A,B,C}}.jsonl.gz` contain every seed, seat, action, outcome, economy, time series, purchase, mine/depth payout and removal. `*-origins-*` saves exact starting states for branches; `*-counterfactual-*` saves their continuations; `real-ai.jsonl.gz` saves AI games. Summary, paired bootstrap, upgrade estimates, route persistence and legal witnesses are separate JSON files. [Machine-readable recommendation](recommendation.json) links the key datasets. `study-source.tar.gz`, manifests and `SHA256SUMS` retain source and result provenance. Full reproduction setup is automated by `bash lab/experiments/depth-economy/reproduce.sh /private/tmp/muju-depth-rerun-01` with a **new** destination. It regenerates both intended screens and carries the historical reserve-v1 diagnostics forward unchanged. From `muju/`, verify the retained files with `shasum -a 256 -c lab/results/depth-economy-2026-09-09/SHA256SUMS`.

## Candid design judgment

**B deserves a small human A/B playtest, not adoption.** It gives the fifth layer a meaningful, geographically limited prize without increasing starting income. The investment still has to earn six crystals, survive, compete with Metal's speed/defense and leave actions for the army. Human tests should explicitly compare promoting versus three Water T1 units, race or deny the home/expansion bottoms, and stop maintaining a miner after its route dries. Include players trying to exploit the quiet clock.

**C is too broad for this design question.** It makes the early miners and the competing economy much richer, increases drawn contests, and does not reliably improve Plant's position against aggression. The finite map and recoverable leads do not reveal an infinite runaway economy, but they also do not make that added purchasing volume desirable.

I would keep prices/upkeep unchanged for the human B test. Only if humans find a repeatable, otherwise healthy B investment window that fails narrowly should a separate B-only test compare promotion cost 6 versus 5, holding every other rule fixed. Do not change cost and upkeep together or retune C to salvage it. The present evidence supports a conditional role for B, and leaves expert play, optimal upkeep release, deliberate clock management, and the quality of production AI economic planning unresolved.
'''
(P/'REPORT.md').write_text(report)
recommendation={'recommendedForHumanPlaytest':'B','productionAdoption':False,'rejectAsNextCandidate':'C','productionChanged':False,
 'mainScriptedGames':5760,'counterfactualContinuations':sum(read(n)[e]['branches'] for n in ['counterfactual-summary','sustain-counterfactual-summary'] for e in 'ABC'),
 'realAIGamesIncludingControls':len(ai['games']),'diagnosticGamesExcluded':2880,
 'judgment':'B creates conditional fifth-layer payback without a starting-income subsidy; C inflates the wider economy and produces more inactivity draws. Neither is ready for adoption.',
 'uncertainties':['Fixed weak policies and post-screen reserve repair','Production AI spending/upkeep weaknesses','Draw-heavy Plant-versus-Metal and T2 mirrors','Same-route attribution differs from measured policy counterfactuals','Wall-clock AI searches are not bit-exact reproducible','Human optimal release timing and deliberate draw-clock play untested'],
 'data':['summary.json','sustain-summary.json','paired-comparison.json','sustain-paired-comparison.json','counterfactual-summary.json','sustain-counterfactual-summary.json','real-ai-summary.json','scenarios.json','legal-witnesses.json','route-persistence.json','production-manifest.json','SHA256SUMS']}
(P/'recommendation.json').write_text(json.dumps(recommendation,indent=2)+'\n')
print(P/'REPORT.md')
