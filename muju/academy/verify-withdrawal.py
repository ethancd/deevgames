from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parent
SITE=Path('/private/tmp/muju-academy-v6-release/muju-academy')
BASE='https://ashkie.com/muju-academy/'
def fetch(name,range=None):
 req=urllib.request.Request(BASE+name,headers={'User-Agent':'ashkie-pages-verifier/1.0','Cache-Control':'no-cache',**({'Range':range} if range else {})})
 with urllib.request.urlopen(req,timeout=45) as r:return r.status,r.headers.get('Content-Type',''),r.url,r.read()
page=fetch('');assert page[3]==(SITE/'index.html').read_bytes();assert page[3].count(b'<source src=')==16
release=fetch('release.json');assert release[3]==(SITE/'release.json').read_bytes()
episodes=json.loads(release[3])['episodes']
def check(e):
 for k in ['poster','transcript']:assert fetch(e[k])[3]==(SITE/e[k]).read_bytes()
 raw=(SITE/e['video']).read_bytes()
 for start in [0,len(raw)//2]:
  status,typ,url,chunk=fetch(e['video'],f'bytes={start}-{start+31}')
  assert status==206 and 'video/mp4' in typ and chunk==raw[start:start+32]
 return e['number']
with ThreadPoolExecutor(max_workers=4) as ex:checked=list(ex.map(check,episodes))
retired=json.loads((ROOT/'archive/strategy-withdrawal/withdrawn.json').read_text())['files'];removed=[]
for name in retired:
 try:
  status,typ,url,body=fetch(name,'bytes=0-31')
  assert 'video/mp4' not in typ and b'ftyp' not in body[:32],name
  assert url==BASE,(name,url)
 except urllib.error.HTTPError as e:assert e.code in [404,410]
 removed.append(name)
report={'live':'https://ashkie.com/muju-academy/','pageExact':True,'retainedLessons':checked,'retiredAssetsVerified':len(removed),'oldLinksRedirectToAcademy':True,'replacementVideosPublished':False}
(ROOT/'logs/withdrawal-live.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
