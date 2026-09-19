from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys
R=Path(__file__).resolve().parent
def run(i):
 p=R/'production'/f'R{i:02}'
 subprocess.run(['node','scripts/timeline.mjs','--draft'],cwd=p,check=True,capture_output=True)
 with (R/'logs'/f'stills-{i:02}.log').open('w') as out:
  r=subprocess.run(['node','scripts/render.mjs','--stills'],cwd=p,stdout=out,stderr=subprocess.STDOUT)
 print(f'R{i:02} stills '+('ready' if r.returncode==0 else 'FAILED'),flush=True);return r.returncode
with ThreadPoolExecutor(max_workers=2) as ex:codes=list(ex.map(run,[int(x) for x in sys.argv[1:]] or range(1,17)))
raise SystemExit(any(codes))
