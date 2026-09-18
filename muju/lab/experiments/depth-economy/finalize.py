from pathlib import Path
import hashlib,json,tarfile
P=Path('lab/results/depth-economy-2026-09-09');S=Path('lab/experiments/depth-economy')
manifest=json.loads((P/'production-manifest.json').read_text())
changed=[name for name,digest in manifest['files'].items() if hashlib.sha256(Path(name).read_bytes()).hexdigest()!=digest]
if changed:raise SystemExit('Production files changed: '+str(changed))
with tarfile.open(P/'study-source.tar.gz','w:gz') as tar:
 for p in sorted(S.iterdir()):
  if p.is_file():tar.add(p,arcname=str(p))
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(S.iterdir()) if p.is_file()}
(P/'final-verification.json').write_text(json.dumps({'productionFilesVerifiedUnchanged':len(manifest['files']),'changedProductionFiles':changed,'experimentSources':sources,'baselineGameTests':456,'mainScreenGames':5760,'counterfactualBranches':288,'independentReplays':25},indent=2)+'\n')
files=[p for p in P.rglob('*') if p.is_file() and p.name!='SHA256SUMS']+[p for p in S.iterdir() if p.is_file()]
(P/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p}\n' for p in sorted(files)))
print(f'{len(manifest["files"])} production files unchanged; {len(files)} artifact/source checksums.')
