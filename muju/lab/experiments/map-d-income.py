"""Matched income at fixed horizons; carry terminal income forward after game end."""
import json,pathlib,statistics,random,gzip
out=pathlib.Path(__file__).resolve().parents[1]/'results/map-d-playtests-2026-09-07'
files=list(out.glob('investment-*.jsonl')) or list(out.glob('investment-*.jsonl.gz'))
rows=[json.loads(l) for f in files for l in (gzip.open(f,'rt').read() if f.suffix=='.gz' else f.read_text()).splitlines()]
def val(r,p,t):
 if str(t) in r['telemetry'][p]['incomeAt']:return r['telemetry'][p]['incomeAt'][str(t)]
 if r['turns']<=t:return r['players'][p]['resourcesGained']
 raise ValueError((r['cell'],r['map'],p,t,r['turns']))
results=[]
for cell in [0,3,4,5,6]:
 z=[r for r in rows if r['cell']==cell];item={'cell':cell,'a':z[0]['a'],'b':z[0]['b'],'at':{}}
 for t in [5,20]:
  v={m:{i:[] for i in range(40)} for m in ['A','D']};a={m:[] for m in v};b={m:[] for m in v}
  for r in z:
   seat=r['aSeat'];other='black' if seat=='white' else 'white';av=val(r,seat,t);bv=val(r,other,t);a[r['map']].append(av);b[r['map']].append(bv);v[r['map']][r['i']].append(av-bv)
  delta=[statistics.mean(v['D'][i])-statistics.mean(v['A'][i]) for i in range(40)];rng=random.Random(20260907);boots=sorted(statistics.mean(rng.choices(delta,k=40)) for _ in range(10000))
  item['at'][t]={'A':{'a':statistics.mean(a['A']),'b':statistics.mean(b['A'])},'D':{'a':statistics.mean(a['D']),'b':statistics.mean(b['D'])},'deltaIncomeAdvantage':statistics.mean(delta),'ci95':[boots[250],boots[9749]]}
 results.append(item)
(out/'income-comparisons.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
