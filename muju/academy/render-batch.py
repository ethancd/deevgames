from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,subprocess,time
ROOT=Path(__file__).resolve().parent
PYTHON='/private/tmp/muju-academy-asr-venv/bin/python'
parser=argparse.ArgumentParser();parser.add_argument('--episodes',default=','.join(f'R{i:02}' for i in range(1,17)));parser.add_argument('--workers',type=int,default=2);args=parser.parse_args()
def run(eid):
 d=ROOT/'production'/eid;start=time.monotonic();log=ROOT/'logs'/f'render-{eid}.log'
 with log.open('w') as out:
  for command in [['node','scripts/timeline.mjs'],[PYTHON,'scripts/master-audio.py'],['node','scripts/render.mjs'],['node','scripts/master.mjs'],['node','scripts/qa-export.mjs'],[PYTHON,'scripts/check-export-audio.py']]:
   print(eid,' '.join(command[-1:]),flush=True)
   result=subprocess.run(command,cwd=d,stdout=out,stderr=subprocess.STDOUT)
   if result.returncode:
    print(eid,'FAILED',command[-1],str(log),flush=True);return False
 print(eid,f'export QA passed · {time.monotonic()-start:.0f}s',flush=True);return True
with ThreadPoolExecutor(max_workers=args.workers) as pool:results=list(pool.map(run,args.episodes.split(',')))
raise SystemExit(not all(results))
