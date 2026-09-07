"""Paired seed-block bootstrap; natural outcomes are always separate from caps."""
import json, pathlib, random, statistics, collections
out=pathlib.Path(__file__).resolve().parents[1]/'results/map-d-playtests-2026-09-07'
rows=[json.loads(l) for p in sorted(out.glob('scripted-*.jsonl')) for l in p.read_text().splitlines()]
def mean(v):return sum(v)/len(v) if v else None
def score(r):return .5 if r['winner'] is None else float(r['winner']==r['aSeat'])
def boot(v):
 rng=random.Random(71092026); means=sorted(mean(rng.choices(v,k=len(v))) for _ in range(10000));return [means[250]*100,means[9749]*100]
def stats(rs):
 return dict(n=len(rs),score=100*mean([score(r) for r in rs]),naturalWins=sum(r['winner']==r['aSeat'] and not r['cap'] for r in rs),naturalLosses=sum(r['winner'] not in [None,r['aSeat']] and not r['cap'] for r in rs),caps=sum(r['cap'] for r in rs),naturalDraws=sum(r['winner'] is None and not r['cap'] for r in rs),meanRounds=mean([r['turns'] for r in rs]),naturalMedianRounds=statistics.median([r['turns'] for r in rs if not r['cap']]) if any(not r['cap'] for r in rs) else None)
cells=[]
for c in sorted(set(r['cell'] for r in rows)):
 rs=[r for r in rows if r['cell']==c]; groups={m:[r for r in rs if r['map']==m] for m in ['A','D']}
 blocks=[]
 for i in sorted(set(r['i'] for r in rs)):
  z={m:[r for r in groups[m] if r['i']==i] for m in groups}
  if all(len(z[m])==2 for m in z):blocks.append(mean([score(r) for r in z['D']])-mean([score(r) for r in z['A']]))
 if not blocks:continue
 cells.append(dict(cell=c,a=rs[0]['a'],b=rs[0]['b'],A=stats(groups['A']),D=stats(groups['D']),pairedScoreDeltaPP=100*mean(blocks),ci95=boot(blocks)))
bybot={}
for name in sorted(set(p['bot'] for r in rows for p in r['players'].values())):
 bybot[name]={}
 for m in ['A','D']:
  z=[(r,p) for r in rows if r['map']==m for p in ['white','black'] if r['players'][p]['bot']==name]
  if not z:continue
  bybot[name][m]={k:mean([r['telemetry'][p][k] for r,p in z]) for k in ['mineActions','mineYield','moveActions','moveBudget','awayYield','fourthFifth','maxHomeDistance','minedCells']}
  bybot[name][m].update(n=len(z),promotions=mean([r['players'][p]['promotions'] for r,p in z]),tierUsage={str(t):sum(r['players'][p]['tierUsage'][str(t)] for r,p in z) for t in range(1,5)},incomeAt={str(t):{'n':len(v:=[r['telemetry'][p]['incomeAt'][str(t)] for r,p in z if str(t) in r['telemetry'][p]['incomeAt']]),'mean':mean(v)} for t in [1,2,3,5,10,20]})
summary=dict(games=len(rows),maps={m:{'games':len(z:=[r for r in rows if r['map']==m]),'caps':sum(r['cap'] for r in z),'naturalWins':sum(r['winner'] is not None and not r['cap'] for r in z),'whiteNaturalWins':sum(r['winner']=='white' and not r['cap'] for r in z),'medianNaturalRounds':statistics.median([r['turns'] for r in z if not r['cap']]),'meanResourcesPerPlayer':mean([p['resourcesGained'] for r in z for p in r['players'].values()])} for m in ['A','D']},illegal=sum(p['illegalActions'] for r in rows for p in r['players'].values()),invariants=sum(bool(r['invariantViolation']) for r in rows),anomalies=sum(len(r['anomalies']) for r in rows),plies=sum(r['plies'] for r in rows),cells=cells,bybot=bybot)
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
lines=['| Matchup (first style) | A natural W–L / caps | D natural W–L / caps | Δ score incl. cap adjudication, pp (95% CI) |','|---|---:|---:|---:|']
for c in cells:
 def wl(s):return f"{s['naturalWins']}–{s['naturalLosses']} / {s['caps']}"
 lines.append(f"| {c['a']} vs {c['b']} | {wl(c['A'])} | {wl(c['D'])} | {c['pairedScoreDeltaPP']:+.1f} ({c['ci95'][0]:+.1f}, {c['ci95'][1]:+.1f}) |")
(out/'matchups.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['cells','bybot']},indent=2));print('\n'.join(lines))
