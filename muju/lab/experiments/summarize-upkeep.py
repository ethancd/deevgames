import json,glob,statistics,collections,gzip
from pathlib import Path
root=Path('lab/results/upkeep-draw-2026-09-08')
def read(path):
 return gzip.open(path,'rt').read() if str(path).endswith('.gz') else path.read_text()
def games(suite,variant):
 folder=root/f'{suite}-{variant}'
 if suite=='e13':return [json.loads(l) for f in sorted(folder.glob('games-*.jsonl*')) for l in read(f).splitlines()]
 return [r for f in sorted(folder.glob('confirm_base-*.json*')) for r in json.loads(read(f))['games']]
def q(values):
 v=sorted(values);return {'n':len(v),'median':statistics.median(v) if v else None,'p95':v[int((len(v)-1)*.95)] if v else None,'max':max(v,default=None),'atLeast20':sum(x>=20 for x in v)}
def summary(rs):
 natural=[r for r in rs if not r['cap'] and r['winner']]
 ps=[r['players'][p] for r in rs for p in ['white','black']]
 return {'games':len(rs),'outcomes':dict(collections.Counter(r['winType'] for r in rs)),'natural':len(natural),'caps':sum(r['cap'] for r in rs),'medianRound':statistics.median(r['turns'] for r in rs),'rentPaid':sum(p['upkeepPaid'] for p in ps),'released':sum(len(p['upkeepReleased']) for p in ps),'combatLosses':sum(p['unitsLost'] for p in ps),'zeroStockpileTurns':sum(p['zeroStockpileTurns'] for p in ps),'firstTier3Round':q([p['firstTier3Round'] for p in ps if p['firstTier3Round'] is not None]),'peakTier2Plus':q([p['peakTier2Plus'] for p in ps]),'quietNatural':q([r['maxInactivityPlies'] for r in natural]),'homeInvaders':dict(collections.Counter(r.get('winningUnit') for r in rs if r['winType']=='home-occupation'))}
result={}
for suite,variants in [('e13',['off','shipped','steep']),('e9',['off','shipped'])]:
 result[suite]={};baseline=None
 for v in variants:
  rs=games(suite,v);keys={(r['a'],r['b'],r['seed'],r['swapped']) for r in rs};assert len(keys)==len(rs);assert len(rs)==(960 if suite=='e13' else 3200)
  if baseline is None:baseline=keys
  else:assert baseline==keys
  assert all(not r.get('invariantViolation',r.get('invariant')) and not r['anomalies'] and not sum(r['players'][p]['illegalActions'] for p in ['white','black']) for r in rs)
  result[suite][v]=summary(rs)
  cells=[]
  for a,b in dict.fromkeys((r['a'],r['b']) for r in rs):
   c=[r for r in rs if (r['a'],r['b'])==(a,b)]
   cells.append({'a':a,'b':b,**summary(c),'aNaturalWins':sum(r['winner']==('black' if r['swapped'] else 'white') and not r['cap'] for r in c),'bNaturalWins':sum(r['winner']==('white' if r['swapped'] else 'black') and not r['cap'] for r in c)})
  result[suite][v]['cells']=cells
  if suite=='e13':
   curves={}
   for r in rs:
    key=f"{r['a']} / {r['b']}"
    for m in r['materialCurve']:
     t=m['turn'];node=curves.setdefault(key,{}).setdefault(t,{'n':0,'a':0,'b':0});node['n']+=1;node['a']+=m['blackTier2Plus' if r['swapped'] else 'whiteTier2Plus'];node['b']+=m['whiteTier2Plus' if r['swapped'] else 'blackTier2Plus']
   for rounds in curves.values():
    for node in rounds.values():node['a']/=node['n'];node['b']/=node['n']
   (root/f'tier-curves-{v}.json').write_text(json.dumps(curves))
(root/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
lines=['# Paired upkeep and draw results','', 'Natural wins include attack elimination, home occupation and upkeep elimination. Draws never count as wins. Same 18-unit catalogue throughout.','']
for suite in result:
 lines += [f'## {suite.upper()}','', '| Matchup | Rules | A natural | B natural | Inactivity draws | Caps |','|---|---|---:|---:|---:|---:|']
 for i in range(len(result[suite]['off']['cells'])):
  for v in result[suite]:
   c=result[suite][v]['cells'][i];lines.append(f"| {c['a']} / {c['b']} | {v} | {c['aNaturalWins']} | {c['bNaturalWins']} | {c['outcomes'].get('inactivity',0)} | {c['caps']} |")
 lines+=['']
(root/'matchups.md').write_text('\n'.join(lines))
print(json.dumps({suite:{v:{k:x for k,x in r.items() if k!='cells'} for v,r in vs.items()} for suite,vs in result.items()},indent=2))
