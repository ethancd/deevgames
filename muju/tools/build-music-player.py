#!/usr/bin/env python3
"""Decode-check audition files and build a local listening page from receipts."""
import argparse
import json
import math
from pathlib import Path
import random
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--round', dest='round_number', type=int, choices=[1, 2, 3, 4, 5, 6, 7], default=1)
args = parser.parse_args()
ROUND = ROOT / 'music-auditions' / f'round-{args.round_number}'
DIST = ROOT / 'music-auditions' / 'player' / 'dist'
if args.round_number >= 2:
    DIST = DIST / f'round-{args.round_number}'
DIST.mkdir(parents=True, exist_ok=True)
manifest = ROUND / 'audition-manifest.json'
previous = {}
if manifest.exists():
    previous = {track['id']: track for direction in json.loads(manifest.read_text())['directions'] for track in direction['tracks']}
pack_name = f'SOUNDTRACK_ROUND_{args.round_number}_PROMPTS-2026-09-12.json' if args.round_number >= 2 else 'SOUNDTRACK_AUDITION_PROMPTS-2026-09-11.json'
pack = json.loads((ROOT / 'docs' / pack_name).read_text())
cards = {c['id']: c for c in pack['cards']}
tracks = []
for path in sorted(ROUND.glob('*-take-*.json')):
    if path.name.endswith('-response.json'):
        continue
    receipt = json.loads(path.read_text())
    if receipt.get('status') not in ('downloaded', 'verified'):
        continue
    audio = ROUND / receipt['audio_file']
    proc = subprocess.run(['sox', str(audio), '-n', 'stat'], capture_output=True, text=True, check=True)
    values = {}
    for line in proc.stderr.splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            try: values[k.strip()] = float(v.strip())
            except ValueError: pass
    duration = values['Length (seconds)']
    rms = values['RMS     amplitude']
    peak = max(abs(values['Maximum amplitude']), abs(values['Minimum amplitude']))
    requested_duration = receipt.get('duration_target_seconds', 30)
    if not requested_duration * 0.5 <= duration <= requested_duration + 10 or rms < 0.0001 or peak > 1.0:
        raise ValueError('Audio needs review: ' + audio.name)
    receipt['status'] = 'verified'
    receipt['audio_check'] = {'duration_seconds': duration, 'duration_within_target_tolerance': requested_duration - 2 <= duration <= requested_duration + 3, 'rms_amplitude': rms, 'rms_dbfs': round(20 * math.log10(rms), 2), 'sample_peak': peak, 'full_scale_sample_peak': peak >= 0.999999, 'decode': 'passed', 'listening_review': 'pending'}
    path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    tracks.append({'id':receipt['job'], 'card':receipt['card'], 'provider':receipt['provider'],
        'provider_label':'Lyria' if receipt['provider']=='lyria' else 'ElevenLabs',
        'model':receipt['request'].get('model', receipt['request'].get('model_id')),
        'take':receipt['take'], 'variant':receipt.get('variant'), 'duration':duration, 'rms':rms, 'source':audio,
        'vocal_trial': receipt['request'].get('force_instrumental') is False,
        'prompt':receipt['request'].get('input',receipt['request'].get('prompt')) or '\n\n'.join('\n'.join(chunk.get('positive_styles',[])) for chunk in receipt['request'].get('composition_plan',{}).get('chunks',[]))})
if not tracks:
    raise SystemExit('No verified audio available')
generated_count = len(tracks)
generated_durations = [t['duration'] for t in tracks]
if args.round_number == 6:
    for card in pack['cards']:
        audio = ROOT / card['source_audio']
        proc = subprocess.run(['sox',str(audio),'-n','stat'],capture_output=True,text=True,check=True)
        values = {}
        for line in proc.stderr.splitlines():
            if ':' in line:
                k,v=line.split(':',1)
                try: values[k.strip()]=float(v.strip())
                except ValueError: pass
        tracks.append({'id':'baseline-'+card['id'],'card':card['id'],'provider':'elevenlabs','provider_label':'ElevenLabs',
                       'model':'music_v2','take':0,'variant':'Your source take '+card['source_label'],
                       'duration':values['Length (seconds)'],'rms':values['RMS     amplitude'],'source':audio,
                       'vocal_trial':False,'baseline':True,'label':'Source '+card['source_label'],
                       'prompt':'Original selected recording. '+card.get('assessment','')})
target = min(t['rms'] for t in tracks) * 0.92
random.Random(61427).shuffle(tracks)
next_label = max((ord(t['label'][-1]) - 64 for t in previous.values()), default=0) if args.round_number == 1 else 0
for track in tracks:
    if track.get('baseline'):
        track['file'] = track['id'] + track['source'].suffix
    elif args.round_number >= 2:
        number = pack['execution']['cards'].index(track['card']) + 1 + pack.get('label_offset', 0)
        track['label'] = f'{number:02d}' + chr(64 + track['take'])
        track['file'] = track['id'] + track['source'].suffix
    elif track['id'] in previous:
        track['label'] = previous[track['id']]['label']
        track['file'] = previous[track['id']]['file']
    else:
        track['label'] = 'Take ' + chr(65+next_label)
        track['file'] = 'clip-' + chr(97+next_label) + track['source'].suffix
        next_label += 1
    track['match_gain'] = round(target/track['rms'], 6)
    shutil.copy2(track.pop('source'), DIST/track['file'])
    track.pop('rms')
tracks.sort(key=lambda track: track['label'])
definitions = [
    ('hono-lantern','Lantern Circuit','116 BPM · Warm bass, koto gestures, small chip replies, relaxed broken beats.'),
    ('hono-garden','Crystal Garden','104 BPM · Resonant plucks, FM bells, warm echoes, a gentle pulse.'),
    ('hono-current','Sixfold Current','128 BPM · Smooth bass, light breakbeats, spacious melodies, playful motion.'),
]
if args.round_number >= 2:
    definitions = [(card['id'], card['title'], f'{card["direction"]} · {card["bpm"]} BPM target · {card["description"]}') for card in pack['cards']]
providers = sorted({t['provider'] for t in tracks})
status = f'{generated_count} completed auditions, {min(generated_durations):.0f}–{max(generated_durations):.0f} seconds each. '
if args.round_number >= 2:
    takes = pack['execution'].get('takes_per_card',3)
    status += f'ElevenLabs · {generated_count} of {pack["execution"]["total_audio_requests"]} ready. {takes} variations per song.'
    if args.round_number == 6: status += ' Original source recordings included for comparison.'
elif providers == ['elevenlabs']:
    status += 'ElevenLabs takes are ready; the Lyria comparison is waiting for Google billing.'
else:
    status += 'Two providers, three directions. Provider labels are hidden until you reveal them.'
data = {'status':status,'directions':[{'name':name,'description':desc,'assessment':cards[card].get('assessment',''),'tracks':sorted([t for t in tracks if t['card']==card],key=lambda t:(not t.get('baseline',False),t['take']) if args.round_number == 6 else t['label'])} for card,name,desc in definitions]}
data.update(round_number=args.round_number)
player_root = ROOT / 'music-auditions' / 'player' / 'dist'
navigation = [(1, 'Hono comparisons', ''), (2, 'Five new songs', 'round-2/'), (3, 'Remaining elements', 'round-3/'), (4, 'Element revisions', 'round-4/'), (5, 'Lightning and Water', 'round-5/'), (6, 'Cultural accents', 'round-6/'), (7, 'Held charge', 'round-7/')]
data['navigation'] = [{'label':f'Round {number}: {label}', 'url':('../' if args.round_number >= 2 else './') + route} for number,label,route in navigation if number != args.round_number and (player_root/route/'index.html').exists()]
if (player_root/'full-versions/index.html').exists():
    data['navigation'].append({'label':'Full versions', 'url':('../' if args.round_number >= 2 else './') + 'full-versions/'})
if (player_root/'playlist/index.html').exists():
    data['navigation'].insert(0, {'label':'Listen as a playlist', 'url':('../' if args.round_number >= 2 else './') + 'playlist/'})
if args.round_number == 2:
    data.update(title='Five new songs — Muju soundtrack auditions', eyebrow='Muju Hono Tanka · Round two · ElevenLabs', heading='Five songs. Fifteen possibilities.', intro='Warmth, melody and somewhere to go. Compare three arrangements of each song; keep favorites and notes for the next pass.', save_key='muju-soundtrack-round-two-v1')
data.update(pack.get('page', {}))
template = (ROOT/'tools'/'music-player.html').read_text()
html = template.replace('__AUDITION_DATA__', json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
(DIST/'index.html').write_text(html)
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
script = re.search(r'<script>(.*?)</script>',html,re.S).group(1)
check = subprocess.run(['node','--check','--input-type=commonjs'],input=script,text=True,capture_output=True)
if check.returncode:
    raise SystemExit(check.stderr)
for track in tracks:
    assert (DIST/track['file']).is_file()
print(json.dumps({'verified_clips':len(tracks),'player':str(DIST/'index.html'),'providers':providers,'javascript':'syntax passed','asset_references':'passed'}))
