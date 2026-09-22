"""Summarize the preselected policy mix; pilots are excluded. Run from muju."""
from pathlib import Path
from collections import Counter
import gzip
import json
import statistics as st

OUT = Path('lab/results/four-actions-2026-09-12')

def rows(actions):
    path = OUT/f'paired-{actions}.jsonl'
    data = path.read_text() if path.exists() else gzip.decompress(Path(str(path)+'.gz').read_bytes()).decode()
    return [json.loads(line) for line in data.splitlines()]

def summarize(rr):
    blood = [r['firstBlood']['turn'] for r in rr if r['firstBlood']]
    return {
        'games': len(rr), 'meanEndRound': st.mean(r['turns'] for r in rr),
        'medianEndRound': st.median(r['turns'] for r in rr),
        'medianFirstKillRound': st.median(blood), 'gamesWithAttackKills': len(blood),
        'outcomes': dict(Counter(r['winType'] for r in rr)),
        'inactivityDrawPct': 100*sum(r['winType']=='inactivity' for r in rr)/len(rr),
        'whiteWins': sum(r['winner']=='white' for r in rr),
        'caps': sum(r['capped'] for r in rr), 'invalid': sum(r['invalid'] for r in rr),
    }

data = {a: rows(a) for a in [6,4]}
assert all(len(rr)==280 for rr in data.values())
assert all(not r['invalid'] and not r['capped'] for rr in data.values() for r in rr)
key = lambda r: (r['cell'],r['i'],r['swapped'])
indices = {a: {key(r):r for r in rr} for a,rr in data.items()}
assert all(len(index)==280 for index in indices.values())
assert set(indices[6])==set(indices[4])
assert all(indices[6][k]['seed']==indices[4][k]['seed'] for k in indices[6])
diffs=[indices[4][k]['turns']-indices[6][k]['turns'] for k in indices[6]]
summary = {
    'method': 'Current v2.4 map and catalogue; 20 seeded samples per cell, swapped colors for distinct policies, mirrors counted once. Scripted policies unchanged. Pilot games excluded.',
    'overall': {a:summarize(rr) for a,rr in data.items()},
    'pairedEndRoundChange': {'mean':st.mean(diffs),'median':st.median(diffs),'longer':sum(d>0 for d in diffs),'shorter':sum(d<0 for d in diffs),'equal':sum(d==0 for d in diffs)},
    'matchups': [],
}
for cell in range(8):
    out={'cell':cell,'a':indices[6][(cell,0,False)]['a'],'b':indices[6][(cell,0,False)]['b']}
    for a in [6,4]:
        rr=[r for r in data[a] if r['cell']==cell]
        out[a]={**summarize(rr),'aWins':sum(r['winner']==('black' if r['swapped'] else 'white') for r in rr),'bWins':sum(r['winner']==('white' if r['swapped'] else 'black') for r in rr)}
    summary['matchups'].append(out)
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary['overall'],indent=2))
