from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,subprocess
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--episodes',required=True);parser.add_argument('--qa-only',action='store_true');args=parser.parse_args()
def run(eid):
 d=ROOT/'production'/eid
 commands=[] if args.qa_only else [['node','scripts/master.mjs']]
 commands += [['node','scripts/qa-export.mjs'],['/private/tmp/muju-academy-asr-venv/bin/python','scripts/check-export-audio.py']]
 with (ROOT/'logs'/f'remaster-{eid}.log').open('w') as out:
  for command in commands:
   result=subprocess.run(command,cwd=d,stdout=out,stderr=subprocess.STDOUT)
   if result.returncode:print(eid,'FAILED',command[-1],flush=True);return False
 print(eid,'complete audio and export QA passed',flush=True);return True
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,args.episodes.split(',')))
raise SystemExit(not all(results))
