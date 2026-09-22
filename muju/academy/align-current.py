"""Align current captions from local word timestamps; preserve verified old takes."""
from pathlib import Path
import argparse,difflib,hashlib,json,math,re,unicodedata
ROOT=Path(__file__).resolve().parent
NUM={str(i):s for i,s in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split())}
def number(s):
 n=int(s)
 if n<=20:return NUM[str(n)].split()
 if n<100:
  tens={2:'twenty',3:'thirty',4:'forty',5:'fifty',6:'sixty',7:'seventy',8:'eighty',9:'ninety'}
  return [tens[n//10]]+([] if n%10==0 else [NUM[str(n%10)]])
 if n<1000:return [NUM[str(n//100)],'hundred']+([] if n%100==0 else number(str(n%100)))
 return [s]
def display(text):
 names={v:k for k,v in NUM.items() if int(k)<=10}
 text=re.sub(r'\b[Cc]olumn ([A-J]),? row (one|two|three|four|five|six|seven|eight|nine|ten)\b',lambda m:m[1]+names[m[2]],text)
 return re.sub(r'\b([A-J]) (one|two|three|four|five|six|seven|eight|nine|ten)\b',lambda m:m[1]+names[m[2]],text)
def norm(word):
 word=''.join(c for c in unicodedata.normalize('NFKD',word.lower().replace('’',"'")) if not unicodedata.combining(c)).replace('ı','i')
 # Whisper can join consecutive catalogue names into a single orthographic token.
 if word.rstrip('.,!?') == 'golgolge': return ['gol', 'golge']
 if word.rstrip('.,!?') == 'altogether': return ['all', 'together']
 if word.rstrip('.,!?').endswith("'s"):return norm(word.rstrip('.,!?')[:-2])+['s']
 for a,b in {"doesn't":"does not","cannot":"can not","can't":"can not","it's":"it is","don't":"do not","isn't":"is not"}.items():word=word.replace(a,b)
 word=re.sub(r'\b([a-j])(10|[1-9])\b',lambda m:m[1]+' '+NUM[m[2]],word)
 word=re.sub(r'\bt([123])\b',lambda m:'tier '+NUM[m[1]],word)
 tokens=re.findall(r"[a-z]+(?:'[a-z]+)?|\d+",word)
 aliases={'hee':'hi','he':'hi','hano':'hono','hohno':'hono','tonka':'tanka','shore':'sjor','shor':'sjor','mooju':'muju','mujo':'muju','satchita':'sachita','kagare':'kagari','see':'c','sea':'c','bee':'b','jay':'j','dee':'d','eye':'i','ay':'a','four':'for','two':'to','too':'to','stromr':'straumr','stromer':'straumr','mazak':'mazask','girl':'gol','gurl':'gol','gurulge':'golge'}
 return [aliases.get(t,t) for tok in tokens for t in (number(tok) if tok.isdigit() else [tok])]
def entries(words,observed=False):
 result=[]
 for i,w in enumerate(words):
  for token in norm(w['word'] if observed else w):result.append({'token':token,'word':i,**({'start':w['start'],'end':w['end']} if observed else {})})
 # Speech inputs use explicit phonetic aliases for these invented/unit names.
 phrases={('ho','h','no'):'hono',('ho','hno'):'hono',('hoh','no'):'hono',('a','girin'):'aegirinn',('sa','cha','kuna'):'sachakuna',('sa','chi','ta'):'sachita',('tan','ka'):'tanka',('gol','gay'):'golge'}
 merged=[];i=0
 while i<len(result):
  found=False
  for phrase,name in phrases.items():
   if tuple(r['token'] for r in result[i:i+len(phrase)])==phrase:
    merged.append({**result[i],'token':name});i+=len(phrase);found=True;break
  if not found:merged.append(result[i]);i+=1
 return merged
def align(directory,write=False):
 timeline=json.loads((directory/'src/timeline.json').read_text());reports=[]
 for line in timeline['lines']:
  source=directory/'public/audio'/f"{line['id']}.wav"
  meta_path=source.with_suffix('.json');meta=json.loads(meta_path.read_text())
  asr_path=directory/'qa'/f"asr-v6-{line['id']}.json"
  if not asr_path.exists():continue
  asr=json.loads(asr_path.read_text());candidates=[asr]
  secondary=directory/'qa'/f"asr-v6-{line['id']}-medium.json"
  if secondary.exists():
   candidate=json.loads(secondary.read_text())
   if candidate.get('audioSha256')==hashlib.sha256(source.read_bytes()).hexdigest():candidates.append(candidate)
  if asr.get('audioSha256')!=hashlib.sha256(source.read_bytes()).hexdigest():raise ValueError('Stale ASR '+str(asr_path))
  words=display(line['text']).split();expected=entries(words)
  asr=max(candidates,key=lambda c:difflib.SequenceMatcher(None,[e['token'] for e in expected],[o['token'] for o in entries(c['words'],True)],autojunk=False).ratio())
  observed=entries(asr['words'],True)
  matcher=difflib.SequenceMatcher(None,[e['token'] for e in expected],[o['token'] for o in observed],autojunk=False)
  mapped={};diff=[]
  for tag,a,b,c,d in matcher.get_opcodes():
   if tag=='equal':
    for ei,oi in zip(range(a,b),range(c,d)):
     wi=expected[ei]['word']
     if wi not in mapped:mapped[wi]=observed[oi]['start']
   else:diff.append({'kind':tag,'expected':' '.join(e['token'] for e in expected[a:b]),'heard':' '.join(o['token'] for o in observed[c:d])})
  fps=timeline['fps'];end=line['speechFrames'];frames=[None if i not in mapped else min(end-1,max(0,round(mapped[i]*fps))) for i in range(len(words))]
  anchors=[(i,f) for i,f in enumerate(frames) if f is not None]
  if not anchors:raise ValueError('No speech alignment anchors '+line['id'])
  for i,f in enumerate(frames):
   if f is None:
    left=max([(j,v) for j,v in anchors if j<i],default=(-1,0));right=min([(j,v) for j,v in anchors if j>i],default=(len(words),end))
    frames[i]=round(left[1]+(right[1]-left[1])*(i-left[0])/(right[0]-left[0]))
  for i in range(1,len(frames)):frames[i]=max(frames[i],frames[i-1])
  cues=[];first=0
  for i,w in enumerate(words):
   chunk=' '.join(words[first:i+1])
   if len(chunk)>=63 or i-first>=11 or (re.search(r'[.!?]$',w) and i-first>=3) or i==len(words)-1:
    cues.append({'text':chunk,'start':frames[first]});first=i+1
  for i,c in enumerate(cues):c['end']=cues[i+1]['start'] if i+1<len(cues) else end
  report={'line':line['id'],'ratio':round(matcher.ratio(),4),'expected':line['text'],'heard':asr['text'],'differences':diff,'interpolatedWords':len(words)-len(mapped),'audioSha256':asr['audioSha256'],'asrModel':asr['model']}
  reports.append(report)
  if write:
   meta.update(captions=cues,wordFrames=frames,captionAlignment='Local faster-whisper word timestamps matched to canonical numeric captions',captionAudioSha256=asr['audioSha256'])
   meta_path.write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n')
 (directory/'qa/current-speech-check.json').write_text(json.dumps(reports,indent=2,ensure_ascii=False)+'\n')
 return reports
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--episodes');p.add_argument('--write',action='store_true');args=p.parse_args()
 all_reports={}
 for d in sorted((ROOT/'production').glob('R??')):
  if args.episodes and d.name not in args.episodes.split(','):continue
  all_reports[d.name]=align(d,args.write)
 (ROOT/'logs/current-speech-check.json').write_text(json.dumps(all_reports,indent=2,ensure_ascii=False)+'\n')
 for ep,rows in all_reports.items():
  print(ep,len(rows),'clips;',sum(bool(r['differences']) for r in rows),'with ASR differences')
