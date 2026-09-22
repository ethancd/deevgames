#!/usr/bin/env python3
"""Build the continuous listening page from completed full-length mixes only."""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'music-auditions/full-versions/full-versions-manifest.json').read_text())
order = ['open-room','hono-koto','umeme-held-charge','muju-charango','tanka-flute','straumr-hardanger','golge-baglama','unequal-routes','before-dawn']
colors = ['#e5bc77','#ee9b69','#e6d877','#91cba0','#b8b6d7','#83bfd2','#b89bcc','#91b9db','#e1b6b0']
tracks=[]
for direction in manifest['directions']:
    for track in direction['tracks']:
        card=track['id'].split('-full-')[0]
        assert card in order
        file=ROOT/'music-auditions/player/dist/full-versions'/track['file']
        assert file.is_file() and track['duration']>=180
        tracks.append({'id':card,'title':direction['name'],'category':track['label'].replace(' · Full version',''),
                       'duration':track['duration'],'file':'../full-versions/'+track['file'],
                       'gain':track['match_gain'],'color':colors[order.index(card)],
                       'source_label':track['variant']})
        if card=='tanka-flute':
            tracks[-1]['review_cues']=[{'label':'Check revised passage · 1:59–2:28','start':114}]
            tracks[-1]['cue_help']='Starts at 1:54, five seconds before the affected passage.'
tracks.sort(key=lambda t:order.index(t['id']))
data={'tracks':tracks,'total_seconds':sum(t['duration'] for t in tracks)}
html=(ROOT/'tools/music-playlist.html').read_text().replace('__PLAYLIST_DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
script=re.search(r'<script>(.*?)</script>',html,re.S).group(1)
subprocess.run(['node','--check','--input-type=commonjs'],input=script,text=True,capture_output=True,check=True)
out=ROOT/'music-auditions/player/dist/playlist';out.mkdir(parents=True,exist_ok=True)
(out/'index.html').write_text(html)
(ROOT/'music-auditions/full-versions/playlist-manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'playlist':'http://127.0.0.1:8766/playlist/','tracks':len(tracks),'minutes':round(data['total_seconds']/60,2)}))
