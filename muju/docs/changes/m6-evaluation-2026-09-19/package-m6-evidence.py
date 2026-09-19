from pathlib import Path
import json, hashlib, gzip, shutil
work = Path(__file__).resolve().parent
repo = work / 'deevgames-phasing-m6'
dest = repo / 'muju/docs/changes/m6-evaluation-2026-09-19'
dest.mkdir(parents=True, exist_ok=True)
original={}
def copy(src,rel):
    raw=src.read_bytes()
    original[str(rel)]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    target=dest/rel
    if len(raw)>1_000_000:
        target=Path(str(target)+'.gz');raw=gzip.compress(raw,mtime=0)
        original[str(rel)]['compressedPath']=str(target.relative_to(dest))
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(raw)
for pattern in ['m6-first-*','m6-second-*','m6-third-*','m6-broad-regression-*','m6-static-checks-*','m6-build-*','m6-bootstrap-freeze-*','m6-suite-measure-*']:
    for src in sorted(work.glob(pattern)):
        if src.is_dir():
            for f in sorted(src.rglob('*')):
                if f.is_file():copy(f,Path(src.name)/f.relative_to(src))
for pattern in ['m6-*.md','m6-*.json','verify-m6-independent.mts','freeze-m6-bootstrap.mts','run-m6-check.mts','m6-static-checks.py','package-m6-evidence.py']:
    for src in sorted(work.glob(pattern)):
        if src.is_file():copy(src,Path(src.name))
(dest/'original-file-sha256.json').write_text(json.dumps(original,indent=2)+'\n')
hashes={str(p.relative_to(dest)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='evidence-sha256.json'}
(dest/'evidence-sha256.json').write_text(json.dumps(hashes,indent=2)+'\n')
print(json.dumps({'files':len(hashes),'path':str(dest)}))
