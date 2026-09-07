import json,gzip,pathlib,statistics,collections,random,sys
out=pathlib.Path(__file__).resolve().parents[1]/'results'/('home-guard-2026-09-07' if len(sys.argv)>1 and sys.argv[1]=='guard' else 'home-victory-2026-09-07')
files=sorted(out.glob('games-*.jsonl')) or sorted(out.glob('games-*.jsonl.gz'))
rows=[json.loads(l) for f in files for l in (gzip.open(f,'rt').read() if f.suffix=='.gz' else f.read_text()).splitlines()]
mean=lambda x:statistics.mean(x) if x else None
summary={'games':len(rows),'plies':sum(r['plies'] for r in rows),'illegal':sum(p['illegalActions'] for r in rows for p in r['players'].values()),'anomalies':sum(len(r['anomalies']) for r in rows),'invariants':sum(bool(r['invariantViolation']) for r in rows),'rules':{},'cells':[]}
for rule in ['elimination','home-or-elimination']:
 z=[r for r in rows if r['rule']==rule];natural=[r for r in z if not r['cap']];home=[r for r in z if r['winType']=='home-occupation'];
 summary['rules'][rule]={'games':len(z),'caps':sum(r['cap'] for r in z),'homeWins':len(home),'medianRounds':statistics.median(r['turns'] for r in z),'meanRoundsCapped':mean([r['turns'] for r in z]),'naturalMedian':statistics.median(r['turns'] for r in natural) if natural else None,'homeByRound5':sum(r['turns']<=5 for r in home),'homeUnitCounts':dict(collections.Counter(r['winningUnit'] for r in home)),'homeWhileBehindInBoardCost':sum(r['players'][r['winner']]['finalMaterial']<r['players']['black' if r['winner']=='white' else 'white']['finalMaterial'] for r in home)}
for cell in sorted(set(r['cell'] for r in rows)):
 z=[r for r in rows if r['cell']==cell];d={'cell':cell,'a':z[0]['a'],'b':z[0]['b']}
 for rule in ['elimination','home-or-elimination']:
  v=[r for r in z if r['rule']==rule];d[rule]={'n':len(v),'naturalWins':sum(r['winner']==r['aSeat'] and not r['cap'] for r in v),'naturalLosses':sum(r['winner'] not in [None,r['aSeat']] and not r['cap'] for r in v),'caps':sum(r['cap'] for r in v),'homeWins':sum(r['winType']=='home-occupation' for r in v),'meanRounds':mean([r['turns'] for r in v]),'medianRounds':statistics.median(r['turns'] for r in v) if v else None}
 blocks=[]
 for i in sorted(set(r['i'] for r in z)):
  q=[r for r in z if r['i']==i];old=[r['turns'] for r in q if r['rule']=='elimination'];new=[r['turns'] for r in q if r['rule']!='elimination'];
  if len(old)==len(new)==2:blocks.append(mean(new)-mean(old))
 if blocks:
  rng=random.Random(9071326);bs=sorted(mean(rng.choices(blocks,k=len(blocks))) for _ in range(10000));d['pairedMeanRoundDelta']=mean(blocks);d['ci95']=[bs[250],bs[9749]]
 summary['cells'].append(d)
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='cells'},indent=2))
lines=['| Matchup | Old natural W–L / caps | New natural W–L / caps | Home wins (either side) | Mean rounds old → new |','|---|---:|---:|---:|---:|']
for d in summary['cells']:
 a=d['elimination'];b=d['home-or-elimination'];lines.append(f"| {d['a']} vs {d['b']} | {a['naturalWins']}–{a['naturalLosses']} / {a['caps']} | {b['naturalWins']}–{b['naturalLosses']} / {b['caps']} | {b['homeWins']} | {a['meanRounds']:.1f} → {b['meanRounds']:.1f} |")
(out/'matchups.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))
