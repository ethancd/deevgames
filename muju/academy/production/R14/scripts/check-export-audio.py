import json,wave,math
from pathlib import Path
import numpy as np
p=Path(__file__).resolve().parents[1]
t=json.loads((p/'src/timeline.json').read_text())
def read(f):
 with wave.open(str(f),'rb') as w:
  assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==24000
  raw=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)/32768
  # AAC preserves speech but can change phase in very high-frequency frication.
  # Compare the broad 0–6 kHz speech band; retain the same correlation/timing gates.
  spectrum=np.fft.rfft(raw);spectrum[np.fft.rfftfreq(len(raw),1/24000)>6000]=0
  return np.fft.irfft(spectrum,len(raw))
export=read(p/'qa/export-audio.wav');out=[];rate=24000
for l in t['lines']:
 source=read(p/'public'/l['audio']);m=min(19200,len(source)//2)
 candidates=list(range(0,max(1,len(source)-m),max(1,m//3)))
 offset=max(candidates,key=lambda i:float(np.sum(source[i:i+m]**2)))
 ref=source[offset:offset+m];expect=round((l['from']+l.get('preRollFrames',0))/t['fps']*rate)+offset
 a=max(0,expect-4800);b=min(len(export),expect+m+4800);target=export[a:b]
 n=1<<(len(target)+len(ref)-2).bit_length()
 conv=np.fft.irfft(np.fft.rfft(target,n)*np.fft.rfft(ref[::-1],n),n)
 dots=conv[len(ref)-1:len(target)]
 cs=np.concatenate(([0.0],np.cumsum(target**2)));energy=cs[len(ref):]-cs[:-len(ref)]
 score=dots/np.sqrt(np.maximum(1e-12,energy*np.sum(ref**2)))
 best=int(np.argmax(score));lag=(a+best-expect)/rate
 out.append({'line':l['id'],'speaker':l['speaker'],'correlation':round(float(score[best]),5),'offsetSeconds':round(lag,6)})
report={'method':'After applying the same 6 kHz low-pass to source and decoded AAC, locate each speech clip’s highest-energy excerpt in the decoded final video audio using normalized cross-correlation. This checks both presence and timing after rendering and mastering.','clips':out,'minimumCorrelation':min(x['correlation'] for x in out),'maxAbsoluteOffsetSeconds':max(abs(x['offsetSeconds']) for x in out)}
report['passed']=report['minimumCorrelation']>.90 and report['maxAbsoluteOffsetSeconds']<.08
(p/'qa/export-audio-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
assert report['passed'],'Exported audio mismatch requires review'
