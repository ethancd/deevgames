#!/bin/bash
# Create a new destination; never delete or overwrite the retained study.
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo 'Usage: bash lab/experiments/depth-economy/reproduce.sh /absolute/new/study-directory'
  exit 2
fi
study_script_dir="$(cd "$(dirname "$0")" && pwd)"
study_muju_root="$(cd "$study_script_dir/../../.." && pwd)"
python3 - "$study_muju_root" "$1" <<'PY'
from pathlib import Path
import sys,shutil,tarfile
root=Path(sys.argv[1]);dest=Path(sys.argv[2]).expanduser().absolute()
if dest.exists():raise SystemExit('Destination already exists; choose a new directory.')
if not (root/'node_modules').exists():raise SystemExit('Install the Muju dependencies first.')
dest.mkdir(parents=True)
source=root/'lab/results/depth-economy-2026-09-09'
with tarfile.open(source/'production-source.tar.gz') as t:t.extractall(dest,filter='data')
shutil.copytree(root/'lab/experiments/depth-economy',dest/'lab/experiments/depth-economy',ignore=shutil.ignore_patterns('.sandbox','.reference','__pycache__'))
out=dest/'lab/results/depth-economy-2026-09-09';out.mkdir(parents=True)
for name in ['production-source.tar.gz','production-manifest.json']:shutil.copy2(source/name,out/name)
for name in ['policies-initial.ts','run-initial.ts','production-tests.log']:
 if (source/name).exists():shutil.copy2(source/name,out/name)
# Retain the historical implementation diagnostic without rerunning a known
# non-investing policy; the final intended comparison is regenerated below.
if (source/'reserve-v1-diagnostic').exists():shutil.copytree(source/'reserve-v1-diagnostic',out/'reserve-v1-diagnostic')
shutil.copy2(root/'tsconfig.json',dest/'tsconfig.json')
(dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
print(dest)
PY
cd "$1"
python3 lab/experiments/depth-economy/prepare.py --restore
node --import tsx lab/experiments/depth-economy/validate.ts
node --import tsx lab/experiments/depth-economy/scenarios.ts
node --import tsx lab/experiments/depth-economy/witnesses.ts
for economy in A B C; do
  node --import tsx lab/experiments/depth-economy/run.ts "$economy" 20
  node --import tsx lab/experiments/depth-economy/counterfactual.ts "$economy"
  node --import tsx lab/experiments/depth-economy/run.ts "$economy" 20 sustain
  node --import tsx lab/experiments/depth-economy/counterfactual.ts "$economy" sustain
done
node --import tsx lab/experiments/depth-economy/real-ai.ts
node --import tsx lab/experiments/depth-economy/inspect.ts
python3 lab/experiments/depth-economy/analyze.py
python3 lab/experiments/depth-economy/analyze.py sustain
node node_modules/typescript/bin/tsc -p lab/experiments/depth-economy/tsconfig.json --noEmit
python3 lab/experiments/depth-economy/report.py
python3 lab/experiments/depth-economy/finalize.py
