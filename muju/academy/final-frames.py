from pathlib import Path
import argparse,json,subprocess
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--episodes');args=parser.parse_args()
special={1:'setup',2:'17',3:'cleave-demo',4:'map',5:'shop-prices',6:'promotion-prices',7:'upkeep-flow',8:'11',9:'draw-timing',10:'options'}
for d in sorted((ROOT/'production').glob('R??')):
 if args.episodes and d.name not in args.episodes.split(','):continue
 n=int(d.name[1:]);video=d/f'output/Muju-Academy-Episode-{n:02}.mp4';report=d/'qa/export-audio-check.json'
 if not report.exists() or not json.loads(report.read_text())['passed']:continue
 t=json.loads((d/'src/timeline.json').read_text());ffmpeg=d/'node_modules/ffmpeg-static/ffmpeg'
 samples=[('representative',special[n])] if n<=10 else [(f'matrix-{tier}',f'matrix-{tier}-out') for tier in [1,2,3]]
 extra={6:['26'],11:['07'],12:['28','29'],13:['04'],16:['11','21','22','23','26']}
 samples += [(f'metal-{lid}',lid) for lid in extra.get(n,[])]
 for label,lid in samples:
  line=next(l for l in t['lines'] if l['id']==lid);at=(line['from']+line['preRollFrames']+line['speechFrames']*.65)/t['fps']
  subprocess.run([str(ffmpeg),'-v','error','-y','-ss',str(at),'-i',str(video),'-frames:v','1',str(d/f'qa/final-{label}.png')],check=True)
 print(d.name,'final frames ready',flush=True)
