"""Reproduce the paired tier-cap tables from plain or gzip-compressed records."""
from pathlib import Path
import json,gzip,statistics,collections
R=Path(__file__).resolve().parents[1]/'results/tier3-cap-2026-09-08'
def load(p):
 return json.loads((gzip.open(p,'rt') if p.suffix=='.gz' else p.open()).read())
def games(folder,suite):
 fs=sorted((R/folder/suite).glob('*.json*'))
 if suite.endswith('e9'):return [g for f in fs for g in load(f)['games']]
 return [json.loads(l) for f in sorted((R/folder/suite).glob('games-*.jsonl*')) for l in (gzip.open(f,'rt') if f.suffix=='.gz' else f.open())]
def summary(gs):
 natural=[g for g in gs if not g['cap']]
 stats={
 'games':len(gs),'naturalGames':len(natural),'caps':len(gs)-len(natural),
 'medianTurns':statistics.median(g['turns'] for g in gs),'naturalMedianTurns':statistics.median(g['turns'] for g in natural),
 'homeWins':dict(sorted(collections.Counter(g['winningUnit'] for g in natural if g.get('winningUnit')).items())),
 'illegal':sum(g.get('illegal',sum(p['illegalActions'] for p in g['players'].values())) for g in gs),
 'invariants':sum(bool(g.get('invariant',g.get('invariantViolation'))) for g in gs),
 'tierUsage':{t:sum(g['players'][p]['tierUsage'][t] for g in gs for p in ['white','black']) for t in ['1','2','3','4']}}
 if all('purchases' in g for g in gs):stats['purchases']={kind:{t:sum(g['purchases'][kind][t] for g in gs) for t in ['1','2','3','4']} for kind in ['queued','promoted']}
 assert stats['illegal']==stats['invariants']==0
 return stats
def cell(gs):
 n=[g for g in gs if not g['cap']];w=sum(g['winner']==('black' if g['swapped'] else 'white') for g in n);l=sum(g['winner'] is not None for g in n)-w
 return {'wins':w,'losses':l,'caps':len(gs)-len(n),'median':statistics.median(g['turns'] for g in gs)}
allg={};result={}
for name,folder,prefix in [('v1.4','baseline',''),('cap-only','','cap-only-'),('final','','')]:
 result[name]={}
 for suite,n in [('e9',3200),('e13',960)]:
  gs=games(folder,prefix+suite);assert len(gs)==n,(name,suite,len(gs));allg[name,suite]=gs;result[name][suite]=summary(gs)
for suite in ['e9','e13']:
 key=lambda g:(g['a'],g['b'],g['seed'],g['swapped'])
 assert {key(g) for g in allg['v1.4',suite]}=={key(g) for g in allg['final',suite]}
 tables=[]
 for a,b in dict.fromkeys((g['a'],g['b']) for g in allg['v1.4',suite]):
  tables.append({'a':a,'b':b,**{name:cell([g for g in allg[name,suite] if (g['a'],g['b'])==(a,b)]) for name in ['v1.4','cap-only','final']}})
 result['matchups-'+suite]=tables
historical=load(R.parent/'e9-2026-09-07/confirm_proposed.json')['rows']
sign=lambda x:(x>0)-(x<0)
result['signFlipsVsSeptember']=[]
result['signFlipsVsPairedBaseline']=[]
for row in result['matchups-e9']:
 h=next(x for x in historical if (x['a'],x['b'])==(row['a'],row['b']))
 current=sign(row['final']['wins']-row['final']['losses'])
 for label,prior in [('signFlipsVsSeptember',sign(h['naturalWins']-h['naturalLosses'])),('signFlipsVsPairedBaseline',sign(row['v1.4']['wins']-row['v1.4']['losses']))]:
  if prior and current and prior!=current:result[label].append({'a':row['a'],'b':row['b'],'before':prior,'after':current})
(R/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
lines=['# Paired catalogue study','', 'Natural wins/losses and capped games are separate. Each E9 cell is 200 games; each E13 cell is 40. Both seats share seed blocks.','']
for suite in ['e9','e13']:
 lines+=['## '+suite.upper(),'', '| Matchup | v1.4 wins-losses / caps | Cap only | Final (Speed 2) | Median v1.4 → final |','|---|---:|---:|---:|---:|']
 for row in result['matchups-'+suite]:
  fmt=lambda v:f"{v['wins']}-{v['losses']} / {v['caps']}"
  lines.append(f"| {row['a']} vs {row['b']} | {fmt(row['v1.4'])} | {fmt(row['cap-only'])} | {fmt(row['final'])} | {row['v1.4']['median']} → {row['final']['median']} |")
(R/'matchups.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({k:v for k,v in result.items() if not k.startswith('matchups')},indent=2))
