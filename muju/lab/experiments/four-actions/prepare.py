"""Snapshot current rules and prepare a lab-only four/six-action comparison.
Run from muju: python3 lab/experiments/four-actions/prepare.py
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tarfile

ROOT = Path.cwd()
HERE = ROOT / 'lab/experiments/four-actions'
OUT = ROOT / 'lab/results/four-actions-2026-09-12'
BOX = HERE / '.sandbox'
OUT.mkdir(parents=True, exist_ok=True)
paths = ['src', 'lab/harness', 'lab/experiments/home-policies.ts',
         'lab/experiments/map-d-investment-policies.ts', 'lab/experiments/map-d-policies.ts']
files = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
         for path in paths for p in ([ROOT/path] if (ROOT/path).is_file() else (ROOT/path).rglob('*')) if p.is_file()}
manifest = OUT / 'source-manifest.json'
if manifest.exists():
    assert json.loads(manifest.read_text())['files'] == files, 'Source changed since snapshot; preserve the study and use a new output directory.'
else:
    manifest.write_text(json.dumps({
        'gitHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'files': files,
    }, indent=2) + '\n')
    with tarfile.open(OUT/'source.tar.gz', 'w:gz') as tar:
        for path in paths:
            tar.add(ROOT/path, arcname=path)
if BOX.exists():
    shutil.rmtree(BOX)
BOX.mkdir()
with tarfile.open(OUT/'source.tar.gz') as tar:
    tar.extractall(BOX, filter='data')
p = BOX/'src/game/board.ts'
s = p.read_text()
old = 'export const MAX_ACTIONS_PER_TURN = 6;'
new = "export const MAX_ACTIONS_PER_TURN = Number(process.env.MUJU_ACTIONS ?? 6);\nif (![4, 6].includes(MAX_ACTIONS_PER_TURN)) throw Error('Expected MUJU_ACTIONS=4 or 6');"
assert s.count(old) == 1
p.write_text(s.replace(old, new))
(OUT/'engine-patch.json').write_text(json.dumps({'path': 'src/game/board.ts', 'old': old, 'new': new}, indent=2)+'\n')
print('Prepared isolated engine. Only game-rule substitution: shared action budget, 6 or 4.')
