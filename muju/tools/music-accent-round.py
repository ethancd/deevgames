#!/usr/bin/env python3
"""Round six: bounded source-conditioned cultural accents for five selected cues."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions/round-6'
PACK = ROOT / 'docs/SOUNDTRACK_ROUND_6_PROMPTS-2026-09-12.json'
spec = importlib.util.spec_from_file_location('audition', ROOT / 'tools/music-audition.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

SONGS = [
    dict(id='hono-koto', title='Hono / Banked Fire', direction='Fire · Japanese koto', bpm=116,
         source_round=1, source_job='hono-lantern-elevenlabs-take-1', source_label='E',
         description='The calm Fire take, with an exposed koto phrase and an unmistakable bend after its held note.',
         keep=['116 BPM, steady 4/4', 'calm intimate warm electronica', 'rounded electric bass and mellow electric piano', 'quiet broken-beat drums', 'the source recording\'s melodic contour and low reply', 'room around every phrase'],
         accent='A prominent natural Japanese koto carries the existing lead contour. Hear its firm plucked attack, resonant string decay, and a clear left-hand pitch bend AFTER the held note begins. Expose one short solo koto phrase, then bring the same koto hook back into the original warm groove. The acoustic gesture must be clearly audible rather than buried as a decorative texture.',
         variants=['Koto at the hearth', 'The bent-note reply'],
         alternate='Keep most of the melody on the original lead, but let a foreground koto take over every answering phrase. Give its held reply a slow expressive post-attack bend and return to the same rounded bass.',
         negative=['cartoon xylophone', 'busy arpeggios', 'exposed 8-bit lead', 'huge taiko drums'],
         sources=['https://www.senzoku-online.jp/TMDL/e/01-koto.html', 'https://museostrumentimusicali.cultura.gov.it/strum/koto-cetra-2/']),
    dict(id='muju-charango', title='Muju / A Field of Small Decisions', direction='Plant · Andean huayno', bpm=108,
         source_round=2, source_job='muju-field-elevenlabs-take-1', source_label='01A',
         description='Keep the springy Plant groove; let ringing charango and the huayno long-short-short accent come forward.',
         keep=['108 BPM in duple meter', 'the source\'s springy buoyant bass and harmonic movement', 'warm plucked call and reply', 'gentle electronic accompaniment', 'clear complete memorable melody'],
         accent='Foreground a natural Andean charango with its bright paired-string shimmer and recognizable crisp strummed long-short-short huayno accent. Alternate the notes of the main tune between the charango and a lower Andean harp-like pluck. The charango should be unmistakable and confident while the original springy bass stays intact.',
         variants=['Charango in the sun', 'Charango and harp conversation'],
         alternate='Give the charango a bold four-bar statement of the original hook with a restrained huayno long-short-short strum under it. A resonant lower harp answers whole phrases. Preserve the boingy bass and the source\'s gentle rhythmic lift.',
         negative=['panpipe tourism montage', 'pounding festival drums', 'generic ukulele pop', 'cartoon mallets'],
         sources=['https://clas.osu.edu/andean-music-teacher-guide', 'https://folkways.si.edu/playlist/a-field-guide-to-peru']),
    dict(id='golge-baglama', title='Gölge / One Square Out of Sight', direction='Shadow · Turkish bağlama', bpm=112,
         source_round=2, source_job='golge-square-elevenlabs-take-1', source_label='02A',
         description='Preserve the sly 4/4 groove, with a dry, wiry bağlama taking the melodic foreground.',
         keep=['112 BPM, retain 4/4', 'the source\'s sly restrained tonal mood', 'supple deep bass and quiet skipping groove', 'low clarinet answers', 'same short recurring hook and spacious phrasing'],
         accent='A clearly foregrounded Turkish bağlama saz takes the existing melody: hear the wiry long-necked lute resonance, crisp plectrum attack, expressive hammer-ons and pull-offs, and a short lower-neighbor ornament before the upward leap. Let the bağlama be dry and close, with only its phrase endings echoed. Preserve tonal clarity and the original sly character.',
         variants=['Bağlama in the doorway', 'The saz answers late'],
         alternate='Make a dry solo bağlama statement audible at the start and again at the return. It trades the source hook with the low clarinet, using brief characteristic picked ornaments around held melody notes. Preserve the original 4/4 groove throughout.',
         negative=['atonal solo', 'bright cheerful lift', 'snake-charmer caricature', 'new time signature', 'busy continuous ornaments'],
         sources=['https://corum.ktb.gov.tr/TR-58740/muzik-kulturu-halk-muziği.html', 'https://isparta.ktb.gov.tr/TR-71007/isparta-turkuleri-hakkinda.html']),
    dict(id='tanka-flute', title='Tanka / Weight Without Hurry', direction='Metal · Lakota/Dakota flute connection', bpm=80,
         source_round=4, source_job='tanka-pressure-elevenlabs-take-1', source_label='10A',
         description='Keep Metal’s held weight; a clear wooden-flute voice traces the broad descending melody over a sparse deep drum.',
         keep=['80 BPM, straight 4/4', 'the source\'s slow held weight and long suspensions', 'whole-note bass and generous silence', 'dark bronze resonance', 'descending melody with repeated low landing', 'sparse low drum, at most beats one and three'],
         accent='Add a foreground solo traditional wooden Plains flute as an instrumental connection to the Lakota/Dakota flute tradition. Give it an original broad descending phrase with a high opening, long unhurried tones, and a repeated low landing. The tone is clear, rounded and breath-shaped, with restrained natural vibrato. Keep the existing dark sustained synth underneath and the deep drum very sparse. The flute adds a distinct human voice to the source\'s weight without making it pastoral.',
         variants=['Wooden flute over held weight', 'Drum and descending breath'],
         alternate='Make the low acoustic drum more physically present on beat one, with long silence after each stroke. A rounded wooden Plains flute gives the source\'s descending motif in half notes and whole notes over the same dark bronze sustain. Preserve the pressure, register contrast and delayed resolution.',
         negative=['generic new-age relaxation', 'pastoral flute runs', 'eighth-note groove', 'tresillo', 'chant imitation', 'ceremonial-song quotation'],
         sources=['https://www.arts.gov/honors/heritage/kevin-locke', 'https://folkways.si.edu/lakota-drumming/american-indian/music/video/smithsonian', 'https://www.loc.gov/collections/songs-of-america/articles-and-essays/musical-styles/american-indian-and-native-alaskan/']),
    dict(id='straumr-hardanger', title='Straumr / Under the Current', direction='Water · Norwegian Hardanger resonance', bpm=96,
         source_round=5, source_job='straumr-arco-elevenlabs-take-2', source_label='13B',
         description='Keep the dark bowed-bass melody; a slow Hardanger-fiddle answer adds open-string drone and lingering sympathetic resonance.',
         keep=['E minor, internal phrase pace 96 BPM', 'entirely drumless', 'the source\'s singing bowed double bass and low cello', 'long connected legato melody', 'dark cool imposing mood', 'harmonic movement through connected bass notes'],
         accent='Add a clearly audible Norwegian Hardanger fiddle in its lower and middle register, playing a slow, sustained answer to the source bass melody. Feature bowed double-stops against an open-string drone and the halo of sympathetic strings ringing after the bow moves on. Give the fiddle one exposed long answering phrase, then weave its resonance around the existing bowed bass. Use long bows with no dance rhythm or rapid ornaments.',
         variants=['Hardanger undercurrent', 'The ringing double-stop'],
         alternate='The bowed double bass remains the main melody. A foreground Hardanger fiddle answers with a sustained two-string tone over an open drone; its sympathetic strings continue ringing into the next bass phrase. Add distinct Norwegian fiddle resonance while preserving the source\'s dark connected momentum and long notes.',
         negative=['percussion', 'ticking', 'sixteenth notes', 'high fiddle solo', 'jig', 'reel', 'pirate soundtrack', 'pastoral cheerfulness', 'orchestral trailer swell'],
         sources=['https://folkways-media.si.edu/docs/folkways/artwork/FW04008.pdf']),
]

def source(song):
    return ROOT / 'music-auditions' / f'round-{song["source_round"]}' / (song['source_job'] + '.mp3')

def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    if PACK.exists():
        return json.loads(PACK.read_text())
    cards=[]
    for song in SONGS:
        path=source(song)
        entry={k:v for k,v in song.items() if k not in ('keep','accent','alternate','negative','variants')}
        entry.update(source_audio=str(path.relative_to(ROOT)), source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                     listen_for=song['accent'], take_names={str(i+1):v for i,v in enumerate(song['variants'])},
                     conditioning='Audio reference from the selected source; high / xhigh adherence. New compositions, not exact audio edits.',
                     providers={'elevenlabs':{'url':'https://api.elevenlabs.io/v1/music','take_bodies':{}}})
        for take in (1,2):
            styles=['entirely instrumental, no voices', *song['keep'],
                    'closely retain the reference arrangement, melodic contour, harmony, bass movement and sound',
                    song['accent'] if take==1 else song['alternate'],
                    'the named cultural instrument is a prominent musical voice, audible in the first phrase and at the return',
                    'comfortable treble, clear mix, suitable for repeated background listening']
            body={'model_id':'music_v2','composition_plan':{'chunks':[{
                'text':'[Instrumental]', 'duration_ms':45000,'positive_styles':styles,
                'negative_styles':['vocals','speech','chanting','humming','choir','huge drop',*song['negative']],
                'context_adherence':'high','conditioning_ref':{'song_id':'UPLOAD_PENDING','range':{'start_ms':0,'end_ms':30000}},
                'condition_strength':'high' if take==1 else 'xhigh'}]},
                'seed':6142700+len(cards)*2+take,'store_for_inpainting':True}
            entry['providers']['elevenlabs']['take_bodies'][str(take)]=body
        cards.append(entry)
    pack={'date':'2026-09-12','label_offset':13,'status':'Prepared source-conditioned accent variants',
          'execution':{'cards':[c['id'] for c in cards],'takes_per_card':2,'total_audio_requests':10,'duration_seconds':45,
                       'total_requested_minutes':7.5,'reference_uploads':5,'estimated_generation_usd':1.125,'estimated_reference_upload_usd':0.375},
          'page':{'title':'Cultural accents — Muju soundtrack auditions','eyebrow':'Muju Hono Tanka · Round six · ElevenLabs',
                  'heading':'Familiar favorites. Clearer accents.',
                  'intro':'Two source-guided variations on each selected element. Compare the baseline with a more prominent cultural instrument. These are new performances; exact melody preservation is not guaranteed. Lightning remains in development.',
                  'save_key':'muju-soundtrack-round-six-v1'},'cards':cards}
    m.write_json(PACK,pack)
    return pack

def upload(card):
    receipt=OUT/(card['id']+'-reference.json')
    if receipt.exists():
        record=json.loads(receipt.read_text())
        if record['status']!='completed': raise RuntimeError('Review existing upload before continuing: '+receipt.name)
        return record['song_id']
    path=ROOT/card['source_audio']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=card['source_sha256']: raise RuntimeError('Source changed')
    excerpt=OUT/(card['id']+'-reference.mp3')
    subprocess.run(['sox',str(path),str(excerpt),'trim','0','30'],check=True,capture_output=True)
    boundary='MujuReference'+uuid.uuid4().hex
    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()+excerpt.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
    record={'status':'submitted','source':card['source_audio'],'source_sha256':card['source_sha256'],'duration_seconds':30,'estimated_usd':0.075}
    m.write_json(receipt,record)
    req=urllib.request.Request('https://api.elevenlabs.io/v1/music/upload',data=payload,
        headers={'xi-api-key':m.credentials()['ELEVENLABS_API_KEY'],'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with urllib.request.build_opener(m.NoRedirect()).open(req,timeout=300) as response:
            result=json.load(response)
        if not result.get('song_id'): raise RuntimeError('No uploaded song ID returned')
        record.update(status='completed',song_id=result['song_id'])
    except urllib.error.HTTPError as exc:
        record.update(status='http-error',http_status=exc.code,error=m.safe(exc.read().decode())[:1800])
    except Exception as exc:
        record.update(status='needs-review',error=m.safe(str(exc)))
    finally: m.write_json(receipt,record)
    if record['status']!='completed': raise RuntimeError(record)
    print(json.dumps({'reference':card['id'],'status':'uploaded'}),flush=True)
    return record['song_id']

def generate(card,take,song_id):
    job=f'{card["id"]}-elevenlabs-take-{take}'
    receipt=OUT/(job+'.json')
    if receipt.exists():
        old=json.loads(receipt.read_text())
        if old['status'] in ('downloaded','verified'): return
        raise RuntimeError('Review existing generation before continuing: '+receipt.name)
    body=card['providers']['elevenlabs']['take_bodies'][str(take)]
    body['composition_plan']['chunks'][0]['conditioning_ref']['song_id']=song_id
    assert body['model_id']=='music_v2' and body['composition_plan']['chunks'][0]['duration_ms']==45000
    record={'job':job,'provider':'elevenlabs','card':card['id'],'take':take,'round':6,
            'variant':card['take_names'][str(take)],'direction':card['direction'],'title':card['title'],
            'bpm_target':card['bpm'],'listen_for':card['listen_for'],'status':'submitted','duration_target_seconds':45,
            'estimated_generation_usd':0.1125,'request':body,'source_label':card['source_label'],'source_audio':card['source_audio'],'source_sha256':card['source_sha256']}
    m.write_json(receipt,record)
    print(json.dumps({'job':job,'status':'submitted'}),flush=True)
    started=time.monotonic()
    try:
        raw,headers,status=m.request('elevenlabs','https://api.elevenlabs.io/v1/music',body)
        if len(raw)<10000 or not any(k.lower()=='content-type' and v.startswith('audio/') for k,v in headers.items()):
            raise RuntimeError('Expected audio response; inspect before retry')
        path=OUT/(job+'.mp3');path.write_bytes(raw)
        subprocess.run(['sox',str(path),'-n','stat'],capture_output=True,check=True)
        record.update(status='downloaded',http_status=status,audio_file=path.name,audio_bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),
            response_headers={k:v for k,v in headers.items() if k.lower() in ('content-type','song-id','character-cost')})
    except urllib.error.HTTPError as exc:
        record.update(status='http-error',http_status=exc.code,error=m.safe(exc.read().decode())[:2000])
    except Exception as exc: record.update(status='needs-review',error=m.safe(str(exc)))
    finally:
        record['elapsed_seconds']=round(time.monotonic()-started,2);m.write_json(receipt,record)
    print(json.dumps({k:record[k] for k in ('job','status','elapsed_seconds','error') if k in record}),flush=True)
    if record['status']!='downloaded': raise RuntimeError('Generation did not complete; batch stopped')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','batch']);args=parser.parse_args()
    pack=prepare()
    print(json.dumps(pack['execution']),flush=True)
    if args.action=='prepare': return
    import fcntl
    with (OUT/'.accent-batch.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        assert len(pack['cards'])==5 and pack['execution']['total_audio_requests']==10
        for take in (1,2):
            for card in pack['cards']:
                song_id=upload(card)
                # Persist actual source IDs before each generation for reproducibility.
                for body in card['providers']['elevenlabs']['take_bodies'].values():
                    body['composition_plan']['chunks'][0]['conditioning_ref']['song_id']=song_id
                m.write_json(PACK,pack)
                generate(card,take,song_id)
                subprocess.run(['python3',str(ROOT/'tools/build-music-player.py'),'--round','6'],check=True)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(m.safe(str(exc)),flush=True);raise SystemExit(1)
