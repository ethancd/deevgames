from pathlib import Path
import json,wave,math,random,struct
p=Path(__file__).resolve().parents[1];j=json.loads((p/'src/timeline.json').read_text());rate=24000
with wave.open(str(p/'qa/dialogue-master.wav'),'wb') as out:
 out.setparams((1,2,rate,0,'NONE','not compressed'))
 for l in j['lines']:
  with wave.open(str(p/'public'/l['audio']),'rb') as w:
   assert w.getnchannels()==1 and w.getsampwidth()==2 and w.getframerate()==rate
   raw=w.readframes(w.getnframes())
  pre=round(l['preRollFrames']/j['fps']*rate);samples=round(l['duration']/j['fps']*rate)
  out.writeframes(bytes(pre*2)+raw+bytes(samples*2-pre*2-len(raw)))
def note(t,hz):
 return (math.sin(2*math.pi*hz*t)+.25*math.sin(2*math.pi*hz*2.76*t))*math.exp(-t*13)*min(1,t/.01)
def save(name,seconds,func):
 with wave.open(str(p/'public/audio'/name),'wb') as w:
  w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(b''.join(struct.pack('<h',max(-32767,min(32767,int(func(i/rate)*32767)))) for i in range(round(seconds*rate))))
random.seed(2)
save('thinking.wav',9,lambda t:random.uniform(-.0007,.0007)+(.046*note(t,523.25) if t<.26 else .046*note(t-8.26,659.25) if 8.26<=t<8.52 else 0))
save('ticket.wav',.25,lambda t:.025*note(t,740))
save('title.wav',2.0,lambda t:sum(.035*note(t-start,hz) for start,hz in [(0,392),(.24,523.25),(.48,659.25),(.75,783.99)] if 0<=t-start<.7))
print('Dialogue master and soft effects ready.')
