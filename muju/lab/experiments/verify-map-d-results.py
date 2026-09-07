"""Audit archived sample completeness, constraints, and deployment-before-tests order."""
import collections,datetime,gzip,json,pathlib,re
root=pathlib.Path(__file__).resolve().parents[2];out=root/'lab/results/map-d-playtests-2026-09-07'
def load(mode):
 files=sorted(out.glob(mode+'-*.jsonl')) or sorted(out.glob(mode+'-*.jsonl.gz'))
 return [json.loads(l) for f in files for l in (gzip.open(f,'rt').read() if f.suffix=='.gz' else f.read_text()).splitlines()]
verification=json.loads((out/'deployment-verification.json').read_text())['productionBrowserChecksCompletedAt']
when=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
allrows=[]
for mode,total,n,cells,maps in [('scripted',3840,40,24,['A','D']),('investment',1280,40,8,['A','D']),('topology',640,20,8,['S','D'])]:
 rows=load(mode);assert len(rows)==total,(mode,len(rows));allrows+=rows
 keys={(r['cell'],r['i'],r['swapped'],r['map']) for r in rows};assert len(keys)==total
 assert keys=={(c,i,s,m) for c in range(cells) for i in range(n) for s in [False,True] for m in maps}
 for r in rows:
  assert when(r['startedAt'])>when(verification)
  assert not r['invariantViolation'] and not r['anomalies']
  assert not any(p['illegalActions'] for p in r['players'].values())
  assert all(t['mineYield']==r['players'][p]['resourcesGained'] for p,t in r['telemetry'].items())
 hashes={json.loads(p.read_text())['sourceHash'] for p in out.glob(mode+'-*-manifest.json')};assert len(hashes)==1,(mode,hashes)
control=json.loads((out/'topology-control.json').read_text())['cells']
source=(root/'src/game/resourceMap.ts').read_text().split('Object.freeze([')[1].split(']);')[0];d=list(map(int,re.findall(r'\d+',source)))
assert len(control)==len(d)==100 and sum(control)==sum(d)==340
assert collections.Counter(control)==collections.Counter(d)
assert control==list(reversed(control)) and d==list(reversed(d))
assert all(control[i]==d[i]==5 for i in [0,1,10,11,88,89,98,99])
engine=load('engine');assert len(engine)==6
assert all(not r['anomalies'] and not r['invariantViolation'] and not any(p['illegalActions'] for p in r['players'].values()) for r in engine)
assert json.loads((out/'engine-1-stop.json').read_text())['completedGames']==2
unit_hashes={json.loads(p.read_text())['unitHash'] for p in out.glob('*-manifest.json')};assert unit_hashes=={'7a5fdecdcd77f0dce8c81b0aad357ec439ddcf6f584a7f79f08b212955a2bc43'}
print(f'PASS: {len(allrows)} complete scripted games, {sum(r["plies"] for r in allrows):,} actions, {len(engine)} completed search-AI games; paired samples, telemetry, stock-control symmetry and post-deployment timing verified.')
