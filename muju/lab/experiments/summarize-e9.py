"""Deterministic tables, paired seed-block bootstrap and per-variant provenance."""
import json
import random
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'results/e9-2026-09-07'
data = {p.stem: json.loads(p.read_text()) for p in sorted(root.glob('*.json'))}
count = sum(len(d['games']) for d in data.values())
illegal = sum(g['illegal'] for d in data.values() for g in d['games'])
violations = sum(bool(g['invariant']) for d in data.values() for g in d['games'])
lines = ['# E9: component tests and fresh-seed confirmation', '',
         f'**{count:,} completed games; {illegal} illegal actions; {violations} invariant failures.**', '',
         'Baseline is the frozen v1.2 catalogue; all variants use the corrected fc854fb transition. Catalogue patches, source hashes, seeds and every completed outcome are recorded in the neighboring JSON files.', '',
         '## Fresh-seed confirmation', '',
         '200 games per matchup (100 seed blocks, both seats). Natural wins exclude turn-limit adjudication. Intervals resample paired seed blocks 10,000 times and describe these policies only. Zero-variation intervals do not imply certainty outside the observed seeds/policies.', '',
         '| A / B | Baseline natural wins | v1.3 natural wins | Natural-win change, percentage points (95% bootstrap) | Baseline/v1.3 caps | Baseline/v1.3 total wins |',
         '|---|---:|---:|---:|---:|---:|']
base, final = data['confirm_base'], data['confirm_proposed']
assert len(base['games']) == len(final['games']) == 3200, 'Confirmation is incomplete'
rng = random.Random(907202609)
for a, b in zip(base['rows'], final['rows']):
    def per_seed(d):
        groups = defaultdict(list)
        for g in d['games']:
            if (g['a'], g['b']) != (a['a'], a['b']): continue
            groups[g['seed']].append(float(not g['cap'] and g['winner'] == ('black' if g['swapped'] else 'white')))
        return {k: sum(v)/len(v) for k, v in groups.items()}
    x, y = per_seed(base), per_seed(final)
    delta = [y[k] - x[k] for k in sorted(x)]
    n = len(delta)
    samples = sorted(sum(delta[rng.randrange(n)] for _ in range(n))/n*100 for _ in range(10000))
    lines.append(f"| {a['a']} / {a['b']} | {a['naturalWins']}/{a['n']} | {b['naturalWins']}/{b['n']} | {sum(delta)/n*100:+.1f} ({samples[249]:+.1f} to {samples[9749]:+.1f}) | {a['caps']} / {b['caps']} | {a['wins']} / {b['wins']} |")
lines += ['', '## Component screen (40 games per cell)', '',
          '| Variant | A / B | Natural A wins | Natural B wins | Caps | Total A wins |', '|---|---|---:|---:|---:|---:|']
for name, d in data.items():
    if name.startswith('confirm'): continue
    assert len(d['games']) == 640, name
    for r in d['rows']:
        lines.append(f"| {name} | {r['a']} / {r['b']} | {r['naturalWins']} | {r['naturalLosses']} | {r['caps']} | {r['wins']} |")
lines += ['', '## Provenance and limitations', '',
          'No scripted game uses the static solver to choose actions. Its local optimization checks precede these separate policy tests. Adaptive policies remain crude; caps are not natural wins, and no first-player or equilibrium claim is made. The confirmation uses new seeds, but these same bot families informed candidate selection. Human and independently optimized counterplay remain external validation.', '',
          '| Variant | Games | Patch | Source SHA-256 |', '|---|---:|---|---|']
for name, d in data.items():
    lines.append(f"| {name} | {len(d['games'])} | `{json.dumps(d['patch'],sort_keys=True)}` | `{d['sourceHash']}` |")
(root/'comparison.md').write_text('\n'.join(lines)+'\n')
print(count, illegal, violations)
