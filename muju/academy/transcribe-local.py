"""Transcribe only current changed narration, entirely offline."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,hashlib,json,os,time
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--episodes')
parser.add_argument('--only')
parser.add_argument('--model',default='small.en',choices=['small.en','medium.en'])
parser.add_argument('--mismatches',action='store_true')
args=parser.parse_args()
jobs=json.loads((ROOT/'logs/openai-new-clips.json').read_text())
if args.episodes:jobs=[j for j in jobs if j['episode'] in args.episodes.split(',')]
if args.only:jobs=[j for j in jobs if j['id'] in args.only.split(',')]
if args.mismatches:
 flagged={(d.parent.parent.name,r['line']) for d in (ROOT/'production').glob('R??/qa/current-speech-check.json') for r in json.loads(d.read_text()) if r['differences']}
 jobs=[j for j in jobs if (j['episode'],j['id']) in flagged]
model=WhisperModel('/private/tmp/muju-academy-whisper-'+args.model.replace('.','-'),device='cpu',compute_type='int8',cpu_threads=4,num_workers=2,local_files_only=True)
def run(job):
 d=ROOT/'production'/job['episode'];audio=d/'public/audio'/f"{job['id']}.wav";meta=json.loads(audio.with_suffix('.json').read_text())
 assert meta['originalText']==job['text'],'Current speech not ready'
 h=hashlib.sha256(audio.read_bytes()).hexdigest();suffix='' if args.model=='small.en' else '-medium';out=d/'qa'/f"asr-v6-{job['id']}{suffix}.json"
 if out.exists() and json.loads(out.read_text()).get('audioSha256')==h:return
 start=time.monotonic()
 segments,info=model.transcribe(str(audio),language='en',beam_size=5,word_timestamps=True,condition_on_previous_text=False,temperature=0,initial_prompt='Muju Academy. Pip. Click. Hi. Hono. Kagari. Radi. Umeme. Kimubunga. Sjor. Straumr. Aegirinn. Göl. Gölge. Karanlık. Muju. Sachita. Sachakuna. Yan. Mazask. Tanka. Bonk matrix. Cleave. Coordinates A1 to J10.')
 segments=list(segments);result={'text':' '.join(s.text.strip() for s in segments),'words':[{'word':w.word.strip(),'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in s.words],'audioSha256':h,'sourceText':job['text'],'model':f'faster-whisper {args.model} int8, local only','duration':info.duration}
 out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
 print(f"{job['episode']}/{job['id']}: {len(result['words'])} words · {time.monotonic()-start:.1f}s",flush=True)
with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,jobs))
print('Local speech verification transcriptions complete.',flush=True)
