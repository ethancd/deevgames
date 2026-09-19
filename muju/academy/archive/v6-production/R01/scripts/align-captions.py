from pathlib import Path
import json,re,difflib,math
p=Path(__file__).resolve().parents[1]
j=json.loads((p/'src/timeline.json').read_text());asr=json.loads((p/'qa/transcription.json').read_text());fps=j['fps']
num={'0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine','10':'ten'}
def norm(s):
 s=s.lower().replace('’',"'").strip('.,!?;:—-"')
 if re.fullmatch('[a-j](?:10|[1-9])',s):return [s[0],num[s[1:]]]
 if s in num:return [num[s]]
 if '-' in s and s not in ['moo-joo','tahn-kah']:return [t for part in s.split('-') for t in norm(part)]
 if s=='firefighter':return ['fire','fighter']
 return [{'see':'c','sea':'c','bee':'b','jay':'j','hano':'hono','witch':'which','he':'hi','hee':'hi','tonka':'tanka','tahn-kah':'tanka','shore':'sjor','moo-joo':'muju'}.get(s,s)]
expected=[]
for li,l in enumerate(j['lines']):
 l['words']=l['text'].split()
 for wi,w in enumerate(l['words']):
  for tok in norm(w):expected.append({'token':tok,'line':li,'word':wi})
observed=[]
for w in asr['words']:
 toks=norm(w['word'])
 for i,tok in enumerate(toks):observed.append({'token':tok,'start':w['start']+(w['end']-w['start'])*i/len(toks),'end':w['start']+(w['end']-w['start'])*(i+1)/len(toks)})
matcher=difflib.SequenceMatcher(None,[w['token'] for w in expected],[w['token'] for w in observed],autojunk=False)
mapped={};diffs=[]
for tag,a,b,c,d in matcher.get_opcodes():
 if tag=='equal':
  for ei,oi in zip(range(a,b),range(c,d)):
   e=expected[ei];mapped[(e['line'],e['word'])]=observed[oi]
 else:diffs.append({'kind':tag,'expected':' '.join(w['token'] for w in expected[a:b]),'heard':' '.join(w['token'] for w in observed[c:d])})
for li,l in enumerate(j['lines']):
 local=[]
 for wi,w in enumerate(l['words']):
  v=mapped.get((li,wi));local.append(None if not v else max(0,min(l['speechFrames']-1,round(v['start']*fps-l['from']-l.get('preRollFrames',0)))))
 anchors=[(i,x) for i,x in enumerate(local) if x is not None]
 for wi,x in enumerate(local):
  if x is None:
   left=max([(i,t) for i,t in anchors if i<wi],default=(-1,0));right=min([(i,t) for i,t in anchors if i>wi],default=(len(local),l['speechFrames']))
   local[wi]=round(left[1]+(right[1]-left[1])*(wi-left[0])/(right[0]-left[0]))
 l['wordFrames']=local
 chunks=[];start=0
 for wi,w in enumerate(l['words']):
  chunk=l['words'][start:wi+1]
  if len(' '.join(chunk))>=63 or len(chunk)>=12 or (re.search(r'[.!?]$',w) and len(chunk)>=4) or wi==len(l['words'])-1:
   chunks.append({'text':' '.join(chunk),'start':local[start],'lastWord':wi});start=wi+1
 for ci,c in enumerate(chunks):c['end']=chunks[ci+1]['start'] if ci<len(chunks)-1 else l['speechFrames'];del c['lastWord']
 l['captions']=chunks
j['captionAlignment']='OpenAI whisper-1 word timestamps, matched to canonical script spelling'
(p/'src/timeline.json').write_text(json.dumps(j,indent=2,ensure_ascii=False)+'\n')
def stamp(f):
 ms=round(f/fps*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
entries=[]
for l in j['lines']:
 for c in l['captions']:
  entries.append(f"{len(entries)+1}\n{stamp(l['from']+l.get('preRollFrames',0)+c['start'])} --> {stamp(l['from']+l.get('preRollFrames',0)+c['end'])}\n{l['speaker']}: {c['text']}\n")
(p/'output/Episode-01.srt').write_text('\n'.join(entries))
report={'tokenMatchRatio':matcher.ratio(),'expectedTokens':len(expected),'observedTokens':len(observed),'differences':diffs,'captionCues':len(entries),'alignment':'Exact token matches plus interpolation over unmatched words; canonical script retained.'}
(p/'qa/speech-check.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
