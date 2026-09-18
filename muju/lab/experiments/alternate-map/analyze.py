import collections, json, pathlib, statistics
ROOT=pathlib.Path(__file__).resolve().parents[2]/'results/alternate-map-2026-09-12'
def rows(name):
    p=ROOT/f'{name}.jsonl'
    return [json.loads(s) for s in p.read_text().splitlines()] if p.exists() else []
def mean(xs):return round(statistics.mean(xs),3) if xs else None
def med(xs):return statistics.median(xs) if xs else None
def outcome(r):
    if r['cap']:return None
    a='black' if r['swapped'] else 'white'
    return .5 if r['winner'] is None else int(r['winner']==a)
def summarize(rs):
    scores=[outcome(r) for r in rs if not r['cap']]
    return dict(n=len(rs),wins=scores.count(1),losses=scores.count(0),draws=scores.count(.5),caps=sum(r['cap'] for r in rs),
        whiteWins=sum(r['winner']=='white' for r in rs),blackWins=sum(r['winner']=='black' for r in rs),
        roundsMedian=med([r['turns'] for r in rs]),firstKillMedian=med([r['firstBlood']['turn'] for r in rs if r['firstBlood']]),
        reasons=dict(collections.Counter(r['winType'] for r in rs)),
        centerIncomeMean=mean([sum(t['centerIncome'] for t in r['telemetry'].values()) for r in rs]),
        centerKillsMean=mean([sum(t['centerKills'] for t in r['telemetry'].values()) for r in rs]),
        centerUnitTurnsMean=mean([sum(t['centerUnitTurns'] for t in r['telemetry'].values()) for r in rs]),
        totalIncomeMean=mean([sum(p['resourcesGained'] for p in r['players'].values()) for r in rs]),
        killsMean=mean([sum(p['unitsKilled'] for p in r['players'].values()) for r in rs]))
out={}
for name in ['main','routes','routes-deep']:
    rr=rows(name)
    assert all(not r['invalid'] for r in rr)
    overall={m:summarize([r for r in rr if r['map']==m]) for m in sorted({r['map'] for r in rr})}
    cells=[]
    for cell in sorted({r['cell'] for r in rr}):
        rs=[r for r in rr if r['cell']==cell]
        byMap={m:summarize([r for r in rs if r['map']==m]) for m in sorted({r['map'] for r in rs})}
        pair={(r['i'],r['swapped']):{} for r in rs}
        for r in rs:pair[r['i'],r['swapped']][r['map']]=r
        changes=[outcome(p['alternate'])-outcome(p['current']) for p in pair.values() if 'alternate' in p and 'current' in p and not p['alternate']['cap'] and not p['current']['cap']]
        cells.append(dict(cell=cell,a=rs[0]['a'],b=rs[0]['b'],maps=byMap,paired=dict(better=sum(x>0 for x in changes),worse=sum(x<0 for x in changes),same=sum(x==0 for x in changes),scoreChange=mean(changes))))
    out[name]=dict(n=len(rr),overall=overall,cells=cells)
ai=rows('ai')
assert all(not r['invalid'] for r in ai)
out['ai']={'n':len(ai),'cells':[]}
for opponent in sorted({r['opponent'] for r in ai}):
    for map in ['current','alternate']:
        rs=[r for r in ai if r['opponent']==opponent and r['map']==map]
        out['ai']['cells'].append(dict(opponent=opponent,map=map,n=len(rs),wins=sum(r['winner']==r['seat'] for r in rs),losses=sum(r['winner'] is not None and r['winner']!=r['seat'] for r in rs),draws=sum(r['winner'] is None for r in rs),caps=sum(r['cap'] for r in rs),rounds=[r['turns'] for r in rs]))
(ROOT/'summary.json').write_text(json.dumps(out,indent=2))
print(json.dumps({k:v['overall'] for k,v in out.items() if 'overall' in v},indent=2))
print(json.dumps(out['ai'],indent=2))
