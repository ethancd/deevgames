from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys
R=Path(__file__).resolve().parent
(R/'logs').mkdir(exist_ok=True)
def run(i):
 p=R/'production'/f'R{i:02}'
 with (R/'logs'/f'audio-{i:02}.log').open('w') as out:
  result=subprocess.run(['node','scripts/speech.mjs'],cwd=p,stdout=out,stderr=subprocess.STDOUT)
 print(f'R{i:02} speech '+('ready' if result.returncode==0 else 'FAILED'),flush=True)
 return result.returncode
with ThreadPoolExecutor(max_workers=2) as pool:
 codes=list(pool.map(run,range(1,17)))
raise SystemExit(any(codes))
