from pathlib import Path
from collections import Counter,defaultdict
import gzip,json,statistics,random,math,sys
OUT=Path('lab/results/depth-economy-2026-09-09')
LABEL=sys.argv[1] if len(sys.argv)>1 else 'scripted'
PREFIX='sustain-' if LABEL=='sustain' else ''
def load(name):
 if PREFIX:
  if name.startswith('scripted-'):name='sustain-'+name.removeprefix('scripted-')
  elif name.startswith('counterfactual-'):name=PREFIX+name
 p=OUT/(name+'.jsonl.gz')
 return [json.loads(l) for l in gzip.open(p,'rt')] if p.exists() else []
def mean(xs):return statistics.mean(xs) if xs else None
def median(xs):return statistics.median(xs) if xs else None
def rate(a,b):return a/b if b else None
def write(name,x):(OUT/((PREFIX if name!='real-ai-summary' else '')+name+'.json')).write_text(json.dumps(x,indent=2)+'\n')
def natural(g):return not g['invalid'] and not g['cap'] and g['winner'] is not None
def outcome(g,seat):return 'invalid' if g['invalid'] else 'cap' if g['cap'] else 'win' if g['winner']==seat else 'loss' if g['winner'] else 'draw'
def stat(xs):return {'n':len(xs),'mean':mean(xs),'median':median(xs),'min':min(xs) if xs else None,'max':max(xs) if xs else None}
def upgrade(g):
 rows=[]
 for p in g['promotions']:
  if p['from']!='plant_2':continue
  found=False;income=fifth=rent=move=mine=army=0;payback=None;removed=None
  for e in g['events']:
   if e['action']['type']=='PROMOTE_UNIT' and e['action'].get('unitId')==p['id'] and e['turn']==p['turn']:found=True;continue
   if not found:continue
   if e.get('upkeep',{}).get('player')==p['owner'] and p['id'] not in [u['id'] for u in e['upkeep']['released']]:rent+=1
   if e['action'].get('unitId')==p['id']:
    income+=e['income'];fifth+=e.get('fifth',0)
    move+=e['actionPoints'] if e['action']['type']=='MOVE' else 0
    mine+=e['action']['type']=='MINE';army+=e['actionPoints'] if e['action']['type']=='ATTACK' else 0
   if any(u['id']==p['id'] for u in e.get('removed',[])):removed={'turn':e['turn'],'cause':e['action']['type']};break
   if fifth-6-rent>=0 and payback is None:payback=e['turn']-p['turn']
  rows.append({**p,'game':g['id'],'income':income,'fifth':fifth,'extraRent':rent,'estimatedNet':fifth-6-rent,'moveActions':move,'mineActions':mine,'armyActions':army,'firstEstimatedPaybackElapsedRounds':payback,'removed':removed})
 return rows

def summarize(games):
 valid=[g for g in games if not g['invalid']];ps=[p for g in valid for p in g['players'].values()]
 upgrades=[u for g in valid for u in upgrade(g)]
 leads=[]
 for g in valid:
  early=next((s for s in g['curve'] if s['turn']==6 and s['player']=='white'),None)
  if not early:continue
  w,b=[early['players'][p]['assets'] for p in ['white','black']];diff=w-b
  if abs(diff)<6:continue
  leader='white' if diff>0 else 'black';lagger='black' if leader=='white' else 'white'
  later=[s for s in g['curve'] if s['turn']>6]
  recovers=any(s['players'][lagger]['assets']>=s['players'][leader]['assets'] for s in later)
  leads.append({'game':g['id'],'leader':leader,'lead':abs(diff),'fraction':abs(diff)/(w+b) if w+b else 0,'natural':natural(g),'converted':natural(g) and g['winner']==leader,'recovered':recovers,'laggerWon':natural(g) and g['winner']==lagger})
 mines=[m for g in valid for m in g['mines']];income_by_unit=Counter();actions=Counter();promotions=Counter();queue=Counter();late=[]
 for g in valid:
  for e in g['events']:
   actions[e['action']['type']]+=e['actionPoints']
   if e['action']['type']=='QUEUE_UNIT':queue[e['action']['definitionId']]+=1
  for p in g['promotions']:promotions[p['from']+'->'+p['to']]+=1
  for m in g['mines']:
   income_by_unit[m['unit']]+=m['income']
   if m['quietBefore']>=7:late.append({'game':g['id'],'turn':m['turn'],'depth':m['depthFrom'],'layers':m['layers'],'payout':m['income'],'unit':m['unit'],'cap':g['cap'],'outcome':g['winType']})
 pairs=[]
 for cell in sorted(set(g['cell'] for g in games)):
  cellgames=[g for g in games if g['cell']==cell];pair=cellgames[0]
  pairs.append({'cell':cell,'a':pair['a'],'b':pair['b'],'n':len(cellgames),'outcomesA':dict(Counter(outcome(g,g['aSeat']) for g in cellgames)),
   'naturalTypes':dict(Counter(g['winType'] for g in cellgames if natural(g))),'rounds':stat([g['turns'] for g in cellgames if not g['invalid']]),
   'incomeA':mean([g['players'][g['aSeat']]['resourcesGained'] for g in cellgames]),'incomeB':mean([g['players']['black' if g['aSeat']=='white' else 'white']['resourcesGained'] for g in cellgames])})
 return {'n':len(games),'valid':len(valid),'invalid':len(games)-len(valid),'invalidIds':[g['id'] for g in games if g['invalid']],
  'outcomes':dict(Counter('cap' if g['cap'] else g['winType'] for g in valid)),
  'rounds':stat([g['turns'] for g in valid]),'firstAttack':stat([g['firstAttack'] for g in valid if g['firstAttack'] is not None]),
  'firstKill':stat([g['firstBlood']['turn'] for g in valid if g['firstBlood']]),
  'tier2Arrival':stat([g['arrivals'][p]['2'] for g in valid for p in ['white','black'] if '2' in g['arrivals'][p]]),
  'tier3Arrival':stat([g['arrivals'][p]['3'] for g in valid for p in ['white','black'] if '3' in g['arrivals'][p]]),
  'incomePerPlayer':stat([p['resourcesGained'] for p in ps]),'finalCashPerPlayer':stat([p['finalResources'] for p in ps]),
  'upkeepPerPlayer':stat([p['upkeepPaid'] for p in ps]),'purchasesAndPromotionsPerPlayer':stat([p['resourcesSpent']-p['upkeepPaid'] for p in ps]),
  'incomeByDefinition':dict(income_by_unit),'queueByDefinition':dict(queue),'promotionsByDefinition':dict(promotions),'actionPoints':dict(actions),
  'upgrades':{'n':len(upgrades),'estimatedNet':stat([u['estimatedNet'] for u in upgrades]),'everEstimatedPayback':sum(u['firstEstimatedPaybackElapsedRounds'] is not None for u in upgrades),'finalEstimatedProfitable':sum(u['estimatedNet']>=0 for u in upgrades),'extraRent':stat([u['extraRent'] for u in upgrades]),'fifthIncome':stat([u['fifth'] for u in upgrades]),'grossIncome':stat([u['income'] for u in upgrades]),'mineActions':stat([u['mineActions'] for u in upgrades]),'moveActions':stat([u['moveActions'] for u in upgrades]),'armyActions':stat([u['armyActions'] for u in upgrades])},
  'opportunities':{'n':sum(len(g['opportunities']) for g in valid),'oneTurnGrossAdvantageAtLeastSix':sum(o['routeT3']['income']-o['routeT2']['income']>=6 for g in valid for o in g['opportunities']), 'outsideOptimisticEnemyReach':sum(o['nearbyOutsideEnemyOptimisticOneTurnReach']>0 for g in valid for o in g['opportunities'])},
  'earlyLead':{'n':len(leads),'natural':sum(l['natural'] for l in leads),'converted':sum(l['converted'] for l in leads),'recovered':sum(l['recovered'] for l in leads),'laggerWon':sum(l['laggerWon'] for l in leads)},
  'lateMining':{'events':len(late),'games':len(set(m['game'] for m in late)),'fifthOnly':sum(m['depth']==5 and m['layers']==1 for m in late),'examples':late[:12]},
  'pairs':pairs},upgrades,leads

allgames={};summary={}
for e in 'ABC':
 games=load('scripted-'+e);allgames[e]=games
 if games:
  s,upgrades,leads=summarize(games);summary[e]=s;write('upgrade-estimates-'+e,upgrades);write('lead-records-'+e,leads)
write('summary',summary)
# Paired seed-block bootstrap: resample seed indices, retain both seats and all
# pairings. Descriptive uncertainty over these fixed policies, not human players.
rng=random.Random(90926);paired={}
if all(len(allgames[e])==960 for e in 'ABC'):
 for e in 'BC':
  base={(g['cell'],g['i'],g['swapped']):g for g in allgames['A']}
  rows=[{'cell':g['cell'],'i':g['i'],'swapped':g['swapped'],'rounds':g['turns']-base[g['cell'],g['i'],g['swapped']]['turns'],
    'income':sum(p['resourcesGained'] for p in g['players'].values())-sum(p['resourcesGained'] for p in base[g['cell'],g['i'],g['swapped']]['players'].values()),
    'winA':(outcome(g,g['aSeat'])=='win')-(outcome(base[g['cell'],g['i'],g['swapped']],g['aSeat'])=='win')} for g in allgames[e]]
  cells=[]
  for cell in range(24):
   r=[r for r in rows if r['cell']==cell];blocks=[mean([x['winA'] for x in r if x['i']==i]) for i in range(20)]
   boot=sorted(mean(rng.choices(blocks,k=20)) for _ in range(2000));cells.append({'cell':cell,'deltaNaturalWinRateA':mean(blocks),'seedBootstrap95':[boot[50],boot[1949]]})
  paired[e]={'roundsDelta':mean([r['rounds'] for r in rows]),'totalIncomeDelta':mean([r['income'] for r in rows]),'pairings':cells}
write('paired-comparison',paired)

cf={}
for e in 'ABC':
 rows=load('counterfactual-'+e);by=defaultdict(dict)
 for r in rows:by[r['originId']][r['branch']]=r
 comparisons=[]
 for origin,arms in by.items():
  if len(arms)!=3:continue
  p,r,a=[arms[b] for b in ['promote','retain','army']]
  def delta_vs(q):
   common=sorted(set(x['turn'] for x in p['timeline'])&set(x['turn'] for x in q['timeline']))
   deltas=[]
   for turn in common:
    x=next(x for x in p['timeline'] if x['turn']==turn);y=next(x for x in q['timeline'] if x['turn']==turn)
    deltas.append({'turn':turn,'elapsed':x['elapsedOwnTurns'],'targetNetDelta':x['targetNet']-y['targetNet'],'ownIncomeDelta':x['ownIncome']-y['ownIncome'],'ownUpkeepDelta':x['ownUpkeep']-y['ownUpkeep'],'assetDelta':x['ownAssets']-y['ownAssets'],'mineActionDelta':x['target']['mineActions']-y['target']['mineActions'],'moveActionDelta':x['target']['moveActions']-y['target']['moveActions'],'aliveBoth':x['alive'] and y['alive']})
   return {'lastCommon':deltas[-1] if deltas else None,'firstMeasuredTargetPayback':next((d for d in deltas if d['targetNetDelta']>=0 and d['aliveBoth']),None),'timeline':deltas}
  comparisons.append({'origin':origin,'opponent':p['opponent'],'owner':p['owner'],'invalid':any(g['invalid'] for g in arms.values()),
   'outcomes':{b:outcome(g,p['owner']) for b,g in arms.items()},'armyBought':a['armyBought'],'versusRetain':delta_vs(r),'versusArmy':delta_vs(a)})
 cf[e]={'branches':len(rows),'origins':len(comparisons),'invalidBranches':sum(r['invalid'] for r in rows),'comparisons':comparisons,
   'outcomes':{b:dict(Counter(outcome(r,r['owner']) for r in rows if r['branch']==b)) for b in ['promote','retain','army']}}
write('counterfactual-summary',cf)

ai=load('real-ai');write('real-ai-summary',{'n':len(ai),'games':[{k:g[k] for k in ['id','economy','opponent','aiSeat','adapter','winner','winType','turns','cap','invalid','durationMs']}|{'aiOutcome':outcome(g,g['aiSeat']),'aiIncome':g['players'][g['aiSeat']]['resourcesGained'],'enemyIncome':g['players']['black' if g['aiSeat']=='white' else 'white']['resourcesGained'],'aiPromotions':[p for p in g['promotions'] if p['owner']==g['aiSeat']]} for g in ai]})
print(json.dumps({e:{k:s[k] for k in ['n','invalid','outcomes','rounds','incomePerPlayer','upgrades','earlyLead']} for e,s in summary.items()},indent=2))
