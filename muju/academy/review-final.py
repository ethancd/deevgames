"""Record verified evidence after visually reviewing the named final exports."""
from pathlib import Path
import argparse,hashlib,json,math,re,wave
import numpy as np
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--visual-reviewed',required=True);args=parser.parse_args()
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for eid in args.visual_reviewed.split(','):
 d=ROOT/'production'/eid;t=read(d/'src/timeline.json');video=d/f'output/Muju-Academy-Episode-{eid[1:]}.mp4';m=read(d/'qa/audio-mastering.json');a=read(d/'qa/export-audio-check.json');v=read(d/'qa/export-visual-check.json');p=read(d/'qa/final-probe.json');speech=read(d/'qa/current-speech-check.json')
 assert t['audioComplete'] and a['passed'] and v['decode']=='PASS' and all(h['passed'] for h in v.get('holds',[v['hold']]))
 assert m['tailPadSeconds']==5 and float(m['measuredFinal']['input_tp'])<=-1.5 and -19<=float(m['measuredFinal']['input_i'])<=-14
 assert abs(float(next(s for s in p['streams'] if s['codec_type']=='audio')['duration'])-t['durationInFrames']/t['fps'])<.1
 assert m['soundtrack']==t['soundtrack'] and sha(d/'public/music/theme.mp3')==t['soundtrack']['sha256']
 assert len(a['clips'])==len(t['lines']) and all(not s['differences'] for s in speech)
 for s in speech:assert s['audioSha256']==sha(d/'public/audio'/f"{s['line']}.wav")
 for line in t['lines']:
  assert line['captionAlignment'] and read(d/'public/audio'/f"{line['id']}.json")['originalText']==line['text']
  captions=' '.join(c['text'] for c in line['captions']);assert captions==line['displayText']
  assert not re.search(r'\b[A-J] (?:one|two|three|four|five|six|seven|eight|nine|ten)\b',captions)
 with wave.open(str(d/'qa/export-audio.wav')) as w:
  rate=w.getframerate();samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
 holds=[]
 for h in v.get('holds',[v['hold']]):
  chunk=samples[round((h['start']+2)*rate):round((h['start']+6)*rate)];db=20*math.log10(max(1e-12,float(np.sqrt(np.mean(chunk**2)))))
  assert db< -45,(eid,'thinking hold is not quiet',db)
  holds.append({'line':h['line'] if 'line' in h else None,'middleRmsDB':round(db,2)})
 frames=[d/f'qa/final-matrix-{tier}.png' for tier in [1,2,3]] if int(eid[1:])>=11 else [d/'qa/final-representative.png']
 frames += sorted((d/'qa').glob('final-metal-*.png'))
 assert all(f.exists() and f.stat().st_mtime > video.stat().st_mtime for f in frames)
 review={'videoSha256':sha(video),'timelineSha256':sha(d/'src/timeline.json'),'speechComplete':True,'captionTiming':True,'numericCoordinates':True,'visuals':True,'musicBalance':True,'quietHolds':True,'evidence':{'speechVerification':'Local small.en/medium.en word timestamps; phonetic unit-name and number normalization; no unresolved differences. Unchanged takes retain prior verified timings.','newSpeechClips':sum(j['episode']==eid for j in read(ROOT/'logs/openai-new-clips.json')),'verifiedSpeechClips':len(speech),'exportedSpeechClips':len(a['clips']),'minimumAudioCorrelation':a['minimumCorrelation'],'maximumSpeechOffsetSeconds':a['maxAbsoluteOffsetSeconds'],'finalLUFS':float(m['measuredFinal']['input_i']),'truePeakDB':float(m['measuredFinal']['input_tp']),'thinkingHolds':holds,'reviewedFrames':{f.name:sha(f) for f in frames}}}
 (d/'qa/final-review.json').write_text(json.dumps(review,indent=2,ensure_ascii=False)+'\n');print(eid,'final review recorded',flush=True)
