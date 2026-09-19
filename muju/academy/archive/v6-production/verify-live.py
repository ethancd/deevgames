#!/usr/bin/env python3
"""Verify all 16 v6 lessons, exact assets, seeking, and retired links.

Copy into the website's tools/verify_muju_videos.py before using.
Usage: python3 tools/verify_muju_videos.py [https://ashkie.com]
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,re,sys,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[1]
base=(sys.argv[1] if len(sys.argv)>1 else 'https://ashkie.com').rstrip('/')
def fetch(path,headers=None):
 request=urllib.request.Request(base+path,headers={'User-Agent':'ashkie-pages-verifier/2.0','Cache-Control':'no-cache',**(headers or {})})
 with urllib.request.urlopen(request,timeout=60) as response:return response.status,dict(response.headers),response.read(),response.url
def exact(path,local):
 status,headers,body,_=fetch(path)
 assert status==200 and body==local.read_bytes(),f'Wrong content: {path}'
 return headers,body
page=ROOT/'muju-academy/index.html';exact('/muju-academy/',page)
source=page.read_text();videos=re.findall(r'<source src="([^"]+\.mp4)"',source)
assert len(videos)==len(set(videos))==16
assert source.count('Video version 6 · Rules v2.7')==16
assert all(f'id="episode-{i:02}"' in source for i in range(1,17))
assert not any(f'id="episode-{i:02}"' in source for i in range(17,28))
assert all('autoplay' not in tag for tag in re.findall(r'<video\b[^>]*>',source))
_,body=exact('/muju-academy/release.json',ROOT/'muju-academy/release.json');release=json.loads(body)
assert release['release']=='v6-four-actions-and-element-matrices'
assert [e['number'] for e in release['episodes']]==list(range(1,17))
assert {e['video'] for e in release['episodes']}==set(videos)
assert all(e['version']==6 and e['rules']=='v2.7' for e in release['episodes'])
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
   text=data.decode();assert 'Rules v2.7' in text and e['soundtrack']['title'] in text
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
