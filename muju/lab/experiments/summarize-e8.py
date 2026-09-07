"""Rebuild comparison.md, including paired seed-block bootstrap uncertainty."""
import json
import random
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'results/e8-2026-09-07'
data = {p.stem: json.loads(p.read_text()) for p in sorted(root.glob('*.json')) if p.stem != 'catalog'}
scripted = {k: v for k, v in data.items() if not k.startswith('engine')}
lines = ['# E8 measured results — 2026-09-07', '',
         f"Scripted games: **{sum(len(d['games']) for d in scripted.values()):,}**. Each candidate uses both seats and paired seeds.",
         'Wins include material/stockpile adjudication at the cap. Natural wins exclude capped games. Read both columns.',
         'These are scripted-policy results, not estimates of expert matchup balance.', '',
         '## Fresh-seed Lightning confirmation', '',
         '400 games per matchup (200 independent seed blocks, two seats). Intervals resample paired seed blocks 10,000 times; they cover sampling variation under these bots only.', '',
         '| Opponent | Baseline wins | Candidate wins | Change, percentage points (95% paired bootstrap) | Baseline/candidate caps |',
         '|---|---:|---:|---:|---:|']
base, candidate = data['confirm_base'], data['confirm_lightning']
rng = random.Random(9072026)
for r0, r1 in zip(base['rows'], candidate['rows']):
    def scores(d):
        out = defaultdict(list)
        for g in d['games']:
            if (g['a'], g['b']) != (r0['a'], r0['b']): continue
            seat = 'black' if g['swapped'] else 'white'
            out[g['seed']].append(float(g['winner'] == seat))
        return {k: sum(v) / len(v) for k, v in out.items()}
    x, y = scores(base), scores(candidate)
    delta = [y[k] - x[k] for k in sorted(x)]
    n = len(delta)
    boot = sorted(sum(delta[rng.randrange(n)] for _ in range(n)) / n * 100 for _ in range(10000))
    lines.append(f"| {r0['a']} / {r0['b']} | {r0['wins']}/400 | {r1['wins']}/400 | {sum(delta)/n*100:+.1f} ({boot[249]:+.1f} to {boot[9749]:+.1f}) | {r0['caps']} / {r1['caps']} |")
lines += ['', '## All recorded cells', '', '| Variant | A / B | Games | A wins | A natural wins | B natural wins | Caps | Illegal / invariant failures |', '|---|---|---:|---:|---:|---:|---:|---:|']
for variant, d in data.items():
    for r in d['rows']:
        lines.append(f"| {variant} | {r['a']} / {r['b']} | {r['n']} | {r['wins']} | {r['naturalWins']} | {r['naturalLosses']} | {r['caps']} | {r['illegal']} / {r['invariants']} |")
lines += ['', '## Provenance', '', 'Each JSON records its parameter patch, source-content SHA-256, seed base, timestamp and per-game outcomes. Engine runs use wall-clock search budgets, so exact engine replay may depend on machine load. The historical pre-economic-fix engine probe is deliberately retained separately; it is not part of the final engine result. The final engine.json contains only the completed two-game Rush cell; the broader run was stopped during Tier1Spam for runtime and is not an eight-game calibration result.', '', 'Source hashes differ as experiment definitions were added and AI-only scoring/resignation were repaired. The scripted catalogue comparisons do not call the AI search or resignation heuristic. An unchanged hash is not claimed across the entire campaign. Neither the old engine probe nor any comparison proves a comprehensive AI strength rating.', '', '| Artifact | Games | Source hash |', '|---|---:|---|']
for variant, d in data.items(): lines.append(f"| {variant}.json | {len(d['games'])} | `{d['sourceHash']}` |")
(root / 'comparison.md').write_text('\n'.join(lines) + '\n')
print('scripted',sum(len(d['games']) for d in scripted.values()))
print('illegal',sum(g['illegal'] for d in scripted.values() for g in d['games']))
print('invariants',sum(bool(g['invariant']) for d in scripted.values() for g in d['games']))
