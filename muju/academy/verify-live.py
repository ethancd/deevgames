#!/usr/bin/env python3
"""Verify the mixed v7/v8 Metal revision, exact assets, seeking, and retired links.

Copy into the website's tools/verify_muju_videos.py before using.
Usage: python3 tools/verify_muju_videos.py [https://ashkie.com]
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,re,sys,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[1]
base=(sys.argv[1] if len(sys.argv)>1 else 'https://ashkie.com').rstrip('/')
dynamic_seen=False
for line in (ROOT/'_redirects').read_text().splitlines():
 parts=line.split()
 if not parts or line.lstrip().startswith('#'):continue
 dynamic='*' in parts[0] or bool(re.search(r'(^|/):',parts[0]))
 assert dynamic or not dynamic_seen,'Static redirects must precede dynamic redirects'
 dynamic_seen=dynamic_seen or dynamic
def fetch(path,headers=None):
 request=urllib.request.Request(base+path,headers={'User-Agent':'ashkie-pages-verifier/2.0','Cache-Control':'no-cache',**(headers or {})})
 with urllib.request.urlopen(request,timeout=60) as response:return response.status,dict(response.headers),response.read(),response.url
def exact(path,local):
 status,headers,body,_=fetch(path)
 assert status==200 and body==local.read_bytes(),f'Wrong content: {path}'
 return headers,body
page=ROOT/'muju-academy/index.html';exact('/muju-academy/',page)
source=page.read_text();videos=re.findall(r'<source src="([^"]+\.mp4)"',source)
assert source.count('id="phasing-notice"')==1,'Missing or duplicated Phasing notice'
assert 'Lessons R01, R04–R07, R09 and R10 teach the previous turn order.' in source
assert 'Act → Mine + Upkeep → Prepare' in source
assert 'The quiet-turn draw is now twenty plies, not ten' in source,'Missing muju-phasing-2 quiet-clock correction'
assert 'lesson R09 still says ten' in source,'Notice must name R09 as stating the superseded number'
assert 'only an attack that removes a piece' in source,'Notice must state that what resets the clock is unchanged'
assert 'These recordings have not yet been updated.' in source
assert 'Current rules v2.9' not in source,'Old recordings must not claim current Phasing rules'
assert source.count('id="rename-notice"')==1,'Missing or duplicated rename notice'
assert 'The game is now Muju Hono Irumbu, not Muju Hono Tanka.' in source
assert 'Hono → Honō' in source and 'Yan → Poṉ' in source and 'Tanka → Irumbu' in source,'Notice must give the old→new list'
assert 'These recordings still use the old names; they have not yet been updated.' in source
assert source.count('id="kill-clock-notice"')==1,'Missing or duplicated kill-clock notice'
assert 'The quiet-turn draw is retired.' in source
assert 'Ten kill-free player turns, not twenty' in source,'Missing muju-phasing-3 kill-clock correction'
assert "decided by each side's mined total" in source and "Black's starting handicap" in source
assert 'Lessons R09 (the draw lesson) and R10 still teach the retired twenty-ply always-a-draw rule' in source,'Notice must name R09 (the draw lesson) and R10 as stating the superseded rule'
assert source.count('id="cleave-notice"')==1,'Missing or duplicated Cleave notice'
assert 'there is no longer a maximum by tier' in source,'Missing muju-phasing-4 Cleave correction'
assert 'Lesson R03 still teaches the old limit of one, two or three attacks by tier' in source,'Notice must name R03 as stating the superseded cap'
assert 'A surviving target still ends the chain' in source,'Notice must state what is unchanged'
assert 'only an attack that removes a piece' in source,'Notice must state that what resets the clock is unchanged'
assert len(videos)==len(set(videos))==16
assert source.count('Video version 7 · Rules v2.8')==8
assert source.count('Video version 8 · Rules v2.9')==8
assert all(f'id="episode-{i:02}"' in source for i in range(1,17))
assert not any(f'id="episode-{i:02}"' in source for i in range(17,28))
assert all('autoplay' not in tag for tag in re.findall(r'<video\b[^>]*>',source))
_,body=exact('/muju-academy/release.json',ROOT/'muju-academy/release.json');release=json.loads(body)
assert release['release']=='v8-metal-yan'
assert release['economy']=={'homeReserve':8,'expansionReserve':16,'mapTotal':504,'plantMining':[3,5,8]}
assert [e['number'] for e in release['episodes']]==list(range(1,17))
assert {e['video'] for e in release['episodes']}==set(videos)
assert release['metal']==[['Yan',1,3,0,3],['Mazask',1,4,1,4],['Tanka',2,5,2,5]]
assert release['revisedEpisodes']==[5,6,11,12,13,14,15,16]
assert all((e['version'],e['rules'])==((8,'v2.9') if e['number'] in release['revisedEpisodes'] else (7,'v2.8')) for e in release['episodes'])
assert len({e['soundtrack']['id'] for e in release['episodes']})==9
assert release['retiredEpisodes']==list(range(17,28))
def check_episode(e):
 for kind in ['video','poster','transcript']:
  name=e[kind];local=ROOT/'muju-academy'/name;data=local.read_bytes()
  assert hashlib.sha256(data).hexdigest()==e['sha256'][kind]
  assert e['sha256'][kind][:12] in name
  headers,_=exact('/muju-academy/'+name,local)
  if kind=='video':
   assert len(data)<25*1024**2
   assert 'video/mp4' in next(v for k,v in headers.items() if k.lower()=='content-type')
   atoms=[];offset=0
   while offset+8<=len(data):
    size=int.from_bytes(data[offset:offset+4],'big');tag=data[offset+4:offset+8]
    if size==1:size=int.from_bytes(data[offset+8:offset+16],'big')
    if size==0:break
    assert size>=8;atoms.append(tag);offset+=size
   assert atoms.index(b'moov')<atoms.index(b'mdat')
   for start in [0,len(data)//2,len(data)-32]:
    status,_,chunk,_=fetch('/muju-academy/'+name,{'Range':f'bytes={start}-{start+31}'})
    assert status==206 and chunk==data[start:start+32],f'Broken seeking: {name}'
  elif kind=='transcript':
   text=data.decode();assert f"Rules {e['rules']}" in text and e['soundtrack']['title'] in text
   assert not re.search(r'\b[A-J] (?:one|two|three|four|five|six|seven|eight|nine|ten)\b',text)
 print('PASS exact video, poster, transcript, and three seek ranges',e['id'],flush=True)
 return e['id']
with ThreadPoolExecutor(max_workers=4) as pool:checked=list(pool.map(check_episode,release['episodes']))
_,_,home,_=fetch('/');assert b'href="/muju-academy/"' in home
_,_,raw,_=fetch('/offline-manifest.json');manifest=json.loads(raw);urls={x['url'] for x in manifest['entries']}
assert '/muju-academy/' in urls
assert all('/muju-academy/'+v not in urls for v in videos)
assert all('/muju-academy/'+e[k] in urls for e in release['episodes'] for k in ['poster','transcript'])
def retired(name):
 try:
  _,headers,body,url=fetch('/muju-academy/'+name,{'Range':'bytes=0-31'})
  assert not any('video/mp4' in v for k,v in headers.items() if k.lower()=='content-type'),name
  assert b'ftyp' not in body[:32] and url==base+'/muju-academy/',name
 except urllib.error.HTTPError as error:assert error.code in [404,410]
 return name
assert len(release['retiredStrategyAssets'])==33
with ThreadPoolExecutor(max_workers=4) as pool:removed=list(pool.map(retired,release['retiredStrategyAssets']))
def replaced(row):
 status,_,body,url=fetch(row['from'],{'Range':'bytes=0-31'})
 local=ROOT/row['to'].lstrip('/');expected=local.read_bytes()
 assert url==base+row['to'],row
 assert (status==206 and body==expected[:32]) or (status==200 and body==expected),row
 return row['from']
with ThreadPoolExecutor(max_workers=4) as pool:redirects=list(pool.map(replaced,release['replacedAssets']))
print(json.dumps({'live':base+'/muju-academy/','episodesVerified':checked,'musicTracks':9,'retiredStrategyAssetsVerified':len(removed),'oldAssetsRedirected':len(redirects),'allChecksPassed':True},indent=2))
