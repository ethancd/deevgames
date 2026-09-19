#!/usr/bin/env python3
"""Build full versions of the six selected elements, with bounded resumable jobs."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions/full-versions'
DIST = ROOT / 'music-auditions/player/dist/full-versions'
PACK = ROOT / 'docs/SOUNDTRACK_FULL_VERSIONS_PROMPTS-2026-09-12.json'
spec = importlib.util.spec_from_file_location('audition', ROOT / 'tools/music-audition.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

SONGS = [
    {'id': 'hono-koto', 'label': '14A', 'element': 'Fire',
     'description': 'The koto favorite grows into a warm, unhurried piece with an exposed bent-note passage and a gentle return.',
     'keep': ['116 BPM, steady 4/4', 'calm intimate warm electronica', 'prominent natural Japanese koto, firm pluck and expressive post-attack pitch bend', 'rounded electric bass, mellow electric piano, quiet broken-beat drums', 'the selected recording\'s melodic identity, harmony and spacious phrasing'],
     'avoid': ['busy arpeggios', 'huge taiko drums', 'exposed 8-bit solo', 'cartoon mallets'],
     'sections': ['Continue the warm koto hook into a longer answering phrase. Retain the same bass movement and quiet broken beat; make the transition from the kept opening continuous.', 'Thin the accompaniment slightly while the koto gives an intimate, exposed version of the same melody. Let a clear post-attack bend ring, with gentle electric-piano support and the pulse still quietly present.', 'Return to the opening hook and original groove. A low electric-piano answer adds one new conversational detail, with the same calm energy and no crescendo.', 'Give one final familiar koto phrase, settle the harmony softly, then leave time for its natural string decay. A complete gentle ending, no abrupt cutoff.']},
    {'id': 'muju-charango', 'label': '15A', 'element': 'Plant',
     'description': 'Springy bass and charango carry a longer melody, with room between phrases and a lighter middle passage.',
     'keep': ['108 BPM in duple meter', 'springy buoyant bass and warm harmonic movement from the selected recording', 'foreground Andean charango with natural paired-string shimmer', 'restrained long-short-short huayno accent', 'clear complete memorable melody and gentle electronic accompaniment', 'charango remains the main plucked voice; any lower reply is sparse and unobtrusive'],
     'avoid': ['foreground harp solo', 'busy harp runs', 'panpipe montage', 'pounding festival drums', 'generic ukulele pop', 'cartoon mallets'],
     'sections': ['Continue the charango tune and springy bass without a restart. Develop the answering half of the melody while preserving the source\'s comfortable rhythmic lift.', 'Let charango and bass carry a lighter passage using the same tune with small rhythmic changes. Leave room between whole melodic phrases; keep the paired-string sound clear and avoid adding a harp feature.', 'Bring back the original charango hook, bass line and understated huayno accent. One simple lower plucked response may answer the tune; keep it quieter and sparser than the lead.', 'Give a final sunny statement of the main melody, settle the bass and let the charango chord ring out naturally. Gentle complete cadence, no big finish.']},
    {'id': 'golge-baglama', 'label': '16A', 'element': 'Shadow',
     'description': 'The dry bağlama hook opens into a low woodwind passage, then returns to the original sly groove.',
     'keep': ['112 BPM, retain the source 4/4 meter', 'sly restrained tonal mood, supple bass and quiet skipping groove', 'dry close Turkish bağlama with wiry string resonance and short picked ornaments', 'the selected source\'s recurring hook', 'a prominent low clarinet or similar dark woodwind voice, especially in the middle passage', 'spacious intimate interplay between woodwind and plucked strings'],
     'avoid': ['heavy dub backbeat', 'loud reggae skank', 'busy continuous ornaments', 'atonal solo', 'bright cheerful lift', 'new time signature'],
     'sections': ['Continue the existing bağlama hook with a short low-clarinet answer, retaining the exact feel of the restrained groove. Let dry attacks and brief phrase-ending echoes create the sly atmosphere.', 'Feature the shadowy low woodwind that made the selected take distinctive. Give it a complete memorable middle-register melody related to the main hook, with sparse bağlama replies. Keep the bass supple and the backbeat quiet.', 'Return clearly to the opening bağlama hook. Now the woodwind answers in a short counterphrase, preserving the same sly mood and restrained energy.', 'Let the bağlama and woodwind trade one last short answer, settle the harmony and leave a small trailing phrase-ending echo. Gentle ending without a dramatic flourish.']},
    {'id': 'tanka-flute', 'label': '17A', 'element': 'Metal',
     'description': 'Wooden flute, sparse drum and dark bronze resonance develop through long suspensions and broad descending phrases.',
     'keep': ['80 BPM, straight 4/4', 'slow held weight and long harmonic suspensions from the selected recording', 'foreground rounded traditional wooden Plains flute with broad descending phrases and repeated low landings', 'whole-note bass and dark bronze synth resonance', 'generous silence and a deep drum at most on beats one and three', 'half notes and whole notes, restrained natural vibrato, clear register contrast'],
     'avoid': ['bouncy groove', 'busy percussion', 'eighth-note ostinato', 'tresillo', 'pastoral flute runs', 'generic new-age relaxation', 'chanting', 'ceremonial-song quotation'],
     'sections': ['Continue the broad descending flute melody over long bass tones. Let an unresolved harmony hold its weight before the low landing; do not add rhythmic activity.', 'Make a quieter but still imposing passage with the same slow flute contour and a subtly deeper bronze harmony. The low pulse stays sparse, and the melody continues in long breath-shaped notes.', 'Return to the opening descending melody and original low bass landing. Let the pressure resolve a little later within each phrase; maintain the same slow weight rather than making a climax.', 'Give the flute one final broad descending phrase, land on a long low tone and allow bronze resonance to decay. Finish with measured stillness and a clear gentle resolution.']},
    {'id': 'straumr-hardanger', 'label': '18A', 'element': 'Water',
     'description': 'A dark bowed current carries the bass melody and slow Hardanger answers through a restrained, continuous arc.',
     'keep': ['E minor, internal phrase pace 96 BPM', 'entirely drumless throughout', 'singing bowed double bass and low cello from the selected recording', 'long connected legato melody and slowly moving sustained bass', 'lower-middle-register Norwegian Hardanger fiddle with slow double-stops, open-string drone and sympathetic resonance', 'dark cool imposing mood with continuous harmonic throughflow'],
     'avoid': ['percussion', 'ticking', 'rhythmic delay', 'pulsing sidechain', 'fast-note ostinato', 'sixteenth notes', 'jig', 'reel', 'high fiddle solo', 'cheerful major lift', 'large orchestral swell'],
     'sections': ['Continue the recognizable bowed-bass melody and slow Hardanger answer with long connected bow strokes. Carry the momentum through the bass harmony, with no additional rhythmic layer.', 'Let the Hardanger fiddle give a sustained low-middle-register answer against an open drone while the bowed bass remains melodically present. Change the harmonic depth gradually; maintain continuous throughflow and restrained activity.', 'Return clearly to the opening bass melody. The Hardanger resonance overlaps its long phrase endings, while the cello supports a closely related slow counterline. Keep the texture transparent and drumless.', 'Let the final bowed phrase settle slowly into E minor. Sustain the low bass and sympathetic-string halo into a soft natural ending, preserving the cold atmosphere without a dramatic swell.']},
    {'id': 'umeme-held-charge', 'label': '19D', 'element': 'Electricity',
     'source_round': 7, 'source_take': 4, 'keep_seconds': 37.5,
     'description': 'The chosen 19D theme develops its charged pauses and answering hook through electric synth, udi and kanuni.',
     'keep': ['124 BPM target, retain the reference tempo and 4/4 groove', 'clear D major, fun and bright with comfortable treble', 'the selected 19D melody, held charge, short deliberate gap and precise rising leap', 'rounded clearly electronic mid-register synth, woody plucked Swahili-coast udi lute and resonant kanuni zither', 'warm electric bass and a soft restrained broken-beat groove', 'one recognizable tune passed between the existing synth and plucked-string voices'],
     'avoid': ['woodwinds', 'flute', 'clarinet', 'oboe', 'recorder', 'saxophone', 'panpipes', 'reed instruments', 'whistling', 'breathy flute-like synth', 'reedy synth lead', 'new wind-like melodic voice', 'aggressive percussion', 'eerie suspense theme', 'constant fast arpeggios', 'crackles', 'rolling thunder', 'bowed lead'],
     'sections': ['Continue the active groove directly from the reference, already at normal musical level from the first moment. Develop the same charged question and answering hook with the existing electric synth, udi and kanuni. No fade, silence, new introduction or new melodic instrument at the join.', 'Keep the pulse and bass moving through a more spacious conversation between udi and kanuni. The electric voice holds a gentle local suspension, leaves a short deliberate gap and makes one precise leap. The gaps belong to the melody; the whole track never stops.', 'Return clearly to the bright opening hook and original groove. Vary the timing of its familiar answer and one bass reply. Keep the same light, confident energy without adding layers, a wind instrument or a large drop.', 'Give a final recognizable statement of the hook, with udi and kanuni completing its answer. Keep the groove present until the last phrase, then allow a gentle resolved ending and short natural decay only in the final seconds.']},
    {'id': 'open-room', 'label': '03C', 'element': 'Lobby', 'source_round': 2, 'source_take': 3, 'keep_seconds': 38,
     'description': 'The welcoming piano-and-guitar favorite opens into a longer, companionable groove.',
     'keep': ['116 BPM, retain the source 4/4 pulse', 'welcoming melodic electronica, warm major-sixth colors and gently resolving suspended chords', 'the selected source melody: lyrical electric piano question and patient muted clean-guitar answer', 'elastic tuneful electric bass with a gentle almost-disco bounce', 'dry understated drums, warm kick, quiet rim and tiny closed-hat accents', 'rounded analog synth that supports held answers, clear mix and comfortable treble'],
     'avoid': ['exposed 8-bit solo', 'continuous arpeggios', 'cartoon mallets', 'vinyl crackle', 'piercing cymbals', 'loud drum build', 'empty ambient drift'],
     'sections': ['Continue directly from the active source phrase at full musical level, keeping the same piano melody and patient guitar reply. Extend the bass conversation without a restart, fade, silence or new intro at the join.', 'Give the piano a lyrical related phrase over a small wistful minor-chord turn, then guide it back to the original warm harmony. Guitar answers patiently and the elastic bass maintains a living pulse.', 'Return to the recognizable opening hook with one complementary guitar response and the original bass movement. Let a held analog-synth answer make the room feel wider; keep the drums understated and the volume steady.', 'Give a final warm piano-and-guitar exchange over the moving bass. Resolve gently with a small smile, letting the groove relax only in the last few seconds. No triumphant finale.']},
    {'id': 'unequal-routes', 'label': '04C', 'element': 'Match', 'source_round': 2, 'source_take': 3, 'keep_seconds': 40,
     'description': 'Two familiar melodic paths develop separately, then meet again in the same warm cadence.',
     'keep': ['120 BPM, retain source 4/4 groove', 'melodic electronic chamber pop, thoughtful confidence and connected harmonic movement', 'the selected long-breathed mellow synth melody and delayed clean-electric-guitar responses', 'warm piano voicings and a singing flowing electric bass', 'soft syncopated broken beat, quiet low drum transients and occasional dry rim', 'two complete memorable melodies meeting on the same home note, room between phrases'],
     'avoid': ['louder drums as a climax', 'trailer crescendo', 'EDM drop', 'exposed chiptune solo', 'busy decoration', 'static one-chord loop'],
     'sections': ['Continue the active phrase from the kept source at normal level with no fade, silence or restart. Keep the synth melody long-breathed and let guitar resolve slightly later, supported by the same flowing bass.', 'Explore the guitar route more fully while the synth provides long quiet answers. An unexpected but warm chord opens the harmony; preserve recognizable melodic material and a soft continuous pulse.', 'Bring the synth and guitar melodies together in clear counterpoint. Return to the source harmonic home and let the fit between the two tunes provide the payoff, keeping percussion at the original comfortable level.', 'Give one final joined statement of the two melodies, then a spacious shared cadence. Keep the bass moving until the last phrase and allow a gentle natural ending only at the close.']},
    {'id': 'before-dawn', 'label': '05B', 'element': 'Rematch & closer', 'source_round': 2, 'source_take': 2, 'keep_seconds': 36.5,
     'description': 'The favored instrumental closer keeps its bass momentum and hopeful, slightly wistful melody.',
     'keep': ['104 BPM, retain source 4/4 groove', 'warm melodic electronica, companionship and a hopeful slightly wistful mood', 'the selected felt-piano descending question and mellow sustained analog-synth upward answer', 'rounded electric bass with the selected take\'s stronger living momentum', 'brushed drums, a small clean-guitar counterline and spacious chord voicings', 'a restrained string layer used briefly, then space around the tune'],
     'avoid': ['sleepy ambient drift', 'triumphant finale', 'busy arpeggios', 'loud drum build', 'piercing cymbals', 'constant string swell'],
     'sections': ['Continue directly from the active source before its fade, preserving the piano question, synth answer and warm moving bass. Keep musical level and momentum through the join with no silence, restart or new intro.', 'Let the harmony climb gradually while the familiar tune appears in a more open register. A small clean-guitar counterline answers the piano, and the bass keeps the piece moving without becoming busy.', 'Return to the opening melody with a slightly warmer harmonic resolution. Allow a restrained string layer to enter briefly, then withdraw again so the piano and synth conversation remain clear.', 'Give a final recognizably related piano question and hopeful synth answer. Let the bass carry the last phrase into a gentle settled cadence, with a small natural decay at the end. Entirely instrumental.']},
]

def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    pack = json.loads(PACK.read_text()) if PACK.exists() else {}
    cards = pack.get('cards', [])
    existing_ids = {c['id'] for c in cards}
    for index, song in enumerate(SONGS):
        if song['id'] in existing_ids:
            continue
        source_job = song['id'] + '-elevenlabs-take-' + str(song.get('source_take', 1))
        source_receipt = ROOT / 'music-auditions' / f'round-{song.get("source_round", 6)}' / (source_job + '.json')
        r = json.loads(source_receipt.read_text())
        assert r['status'] in ('downloaded', 'verified')
        stored = r['request'].get('store_for_inpainting', False)
        song_id = {k.lower(): v for k, v in r['response_headers'].items()}['song-id'] if stored else 'UPLOAD_PENDING'
        source_audio = source_receipt.parent / r['audio_file']
        assert hashlib.sha256(source_audio.read_bytes()).hexdigest() == r['sha256']
        kept_ms = round(song.get('keep_seconds', 45) * 1000)
        chunks = [{'song_id': song_id, 'range': {'start_ms': 0, 'end_ms': kept_ms}}]
        durations = (45000, 45000, 90000-kept_ms, 30000)
        for section_index, (duration, direction) in enumerate(zip(durations, song['sections'])):
            chunks.append({'text': '[Instrumental]', 'duration_ms': duration,
                           'positive_styles': ['entirely instrumental, no voices', *song['keep'],
                                               'a continuous extension of the kept opening: retain its tune, tempo, key, instrument identities and listening level',
                                               'comfortable treble and controlled low end, suitable for repeated background listening', direction],
                           'negative_styles': ['vocals', 'speech', 'humming', 'choir', 'huge drop', *song['avoid']],
                           'context_adherence': 'high',
                           'conditioning_ref': {'song_id': song_id, 'range': {'start_ms': 10000, 'end_ms': min(40000, kept_ms)}},
                           'condition_strength': 'high' if section_index in (1, 3) else 'xhigh'})
        cards.append({'id': song['id'], 'title': r['title'], 'element': song['element'],
                      'source_label': song['label'], 'source_audio': str(source_audio.relative_to(ROOT)),
                      'source_sha256': r['sha256'], 'description': song['description'],
                      'source_requires_upload': not stored,
                      'sections': song['sections'], 'duration_seconds': 210, 'kept_seconds': kept_ms/1000,
                      'request': {'model_id': 'music_v2', 'composition_plan': {'chunks': chunks},
                                  'seed': 6142801 + index, 'store_for_inpainting': True}})
    pack = {'date': '2026-09-12', 'status': 'Nine full versions authorized: six elements and the non-element favorites 03C, 04C and 05B. New extensions start before the audition fades.',
            'execution': {'total_audio_requests': len(cards), 'duration_seconds_each': 210, 'total_output_minutes': len(cards)*3.5,
                          'total_newly_composed_minutes': sum(210-c['kept_seconds'] for c in cards)/60, 'estimated_usd_at_full_output_rate': len(cards)*.525,
                          'reference_uploads': sum(bool(c.get('source_requires_upload')) for c in cards),
                          'estimated_reference_upload_usd': sum(bool(c.get('source_requires_upload')) for c in cards)*.1125,
                          'estimate_basis': 'Generation estimate uses the prior $0.15/output-minute rate; actual billing may count only newly generated audio. Three earlier non-element auditions require reference uploads, estimated separately.'},
            'documentation': 'https://elevenlabs.io/docs/eleven-api/guides/how-to/music/inpainting',
            'feedback_file': 'SOUNDTRACK_ROUND_6_FEEDBACK-2026-09-12.json',
            'additional_feedback': 'User accepted 19D for Electricity, requested 3:30, and requested continuous blends in the other five full versions.', 'cards': cards}
    m.write_json(PACK, pack)
    return pack

def verify(path):
    result = subprocess.run(['sox', str(path), '-n', 'stat'], capture_output=True, text=True, check=True)
    values = {}
    for line in result.stderr.splitlines():
        if ':' in line:
            key, val = line.split(':', 1)
            try:
                values[key.strip()] = float(val.strip())
            except ValueError:
                pass
    duration = values['Length (seconds)']
    rms = values['RMS     amplitude']
    peak = max(abs(values['Maximum amplitude']), abs(values['Minimum amplitude']))
    if not 208 <= duration <= 213 or rms < .0001 or peak > 1:
        raise RuntimeError('Audio needs review: ' + path.name)
    return {'decode': 'passed', 'duration_seconds': duration, 'rms_amplitude': rms,
            'rms_dbfs': round(20 * math.log10(rms), 2), 'sample_peak': peak,
            'listening_review': 'pending'}

def upload_source(card):
    receipt = OUT / (card['id'] + '-full-reference.json')
    if receipt.exists():
        prior = json.loads(receipt.read_text())
        if prior['status'] == 'completed': return prior['song_id']
        raise RuntimeError('Review existing reference upload before retrying')
    path = ROOT / card['source_audio']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == card['source_sha256']
    boundary = 'MujuFullReference' + uuid.uuid4().hex
    payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
    record = {'status':'submitted', 'source_audio':card['source_audio'], 'source_sha256':card['source_sha256'], 'estimated_usd':.1125}
    m.write_json(receipt, record)
    request = urllib.request.Request('https://api.elevenlabs.io/v1/music/upload', data=payload,
        headers={'xi-api-key':m.credentials()['ELEVENLABS_API_KEY'], 'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with urllib.request.build_opener(m.NoRedirect()).open(request, timeout=300) as response:
            result = json.load(response)
        if not result.get('song_id'): raise RuntimeError('No reference song ID returned')
        record.update(status='completed', song_id=result['song_id'])
    except urllib.error.HTTPError as exc:
        record.update(status='http-error', http_status=exc.code, error=m.safe(exc.read().decode())[:2000])
    except Exception as exc:
        record.update(status='needs-review', error=m.safe(str(exc)))
    finally: m.write_json(receipt, record)
    if record['status'] != 'completed': raise RuntimeError('Reference upload did not complete; review saved receipt')
    print(json.dumps({'reference':card['id'], 'status':'uploaded'}), flush=True)
    return record['song_id']

def generate(card):
    job = card['id'] + '-full-v1'
    receipt = OUT / (job + '.json')
    if receipt.exists():
        old = json.loads(receipt.read_text())
        if old['status'] == 'verified':
            print(json.dumps({'job': job, 'action': 'skip-verified'}), flush=True)
            return
        raise RuntimeError('Review existing job before retry: ' + receipt.name)
    assert hashlib.sha256((ROOT / card['source_audio']).read_bytes()).hexdigest() == card['source_sha256']
    chunks = card['request']['composition_plan']['chunks']
    if chunks[0]['song_id'] == 'UPLOAD_PENDING':
        song_id = upload_source(card)
        chunks[0]['song_id'] = song_id
        for chunk in chunks[1:]: chunk['conditioning_ref']['song_id'] = song_id
        pack = json.loads(PACK.read_text())
        pack['cards'] = [card if c['id']==card['id'] else c for c in pack['cards']]
        m.write_json(PACK, pack)
    total = sum(c.get('duration_ms', 0) if 'duration_ms' in c else c['range']['end_ms'] - c['range']['start_ms'] for c in chunks)
    assert total == 210000 and len(chunks) == 5
    record = {**card, 'job': job, 'status': 'submitted', 'estimated_usd_at_full_output_rate': .525}
    m.write_json(receipt, record)
    print(json.dumps({'job': job, 'status': 'submitted', 'source_label': card['source_label']}), flush=True)
    started = time.monotonic()
    try:
        raw, headers, status = m.request('elevenlabs', 'https://api.elevenlabs.io/v1/music', card['request'])
        lower_headers = {k.lower(): v for k, v in headers.items()}
        if len(raw) < 100000 or not lower_headers.get('content-type', '').startswith('audio/'):
            raise RuntimeError('Expected full audio response; inspect before retry')
        audio = OUT / (job + '.mp3')
        audio.write_bytes(raw)
        record.update(audio_file=audio.name, audio_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                      http_status=status, response_headers={k: v for k, v in lower_headers.items() if k in ('song-id', 'content-type', 'character-cost')})
        record['audio_check'] = verify(audio)
        record['status'] = 'verified'
    except urllib.error.HTTPError as exc:
        record.update(status='http-error', http_status=exc.code, error=m.safe(exc.read().decode())[:2000])
    except Exception as exc:
        record.update(status='needs-review', error=m.safe(str(exc)))
    finally:
        record['elapsed_seconds'] = round(time.monotonic() - started, 2)
        m.write_json(receipt, record)
    print(json.dumps({k: record[k] for k in ('job', 'status', 'elapsed_seconds', 'error') if k in record}), flush=True)
    if record['status'] != 'verified':
        raise RuntimeError('Generation did not complete; stopped without an automatic retry')

def build(pack):
    DIST.mkdir(parents=True, exist_ok=True)
    completed = []
    for card in pack['cards']:
        for suffix in ('-full-v3-low-mid.json', '-full-v2-blended.json', '-full-v1.json'):
            receipt = OUT / (card['id'] + suffix)
            if receipt.exists():
                record = json.loads(receipt.read_text())
                if record['status'] == 'verified':
                    completed.append(record)
                    break
    target = min((r['audio_check']['rms_amplitude'] for r in completed), default=.1) * .92
    directions = []
    for card in pack['cards']:
        record = next((r for r in completed if r['id'] == card['id']), None)
        tracks = []
        if record:
            shutil.copy2(OUT / record['audio_file'], DIST / record['audio_file'])
            tracks.append({'id': record.get('review_id', record['job']), 'label': card['element'] + ' · Full version',
                           'duration': record['audio_check']['duration_seconds'],
                           'variant': 'From your pick ' + card['source_label'] + (' · ' + record['revision_label'] if record.get('revision_label') else ' · blended mix' if record.get('revision') == 2 else ''), 'provider_label': 'ElevenLabs',
                           'model': 'music_v2', 'take': 1, 'file': record['audio_file'],
                           'match_gain': round(target / record['audio_check']['rms_amplitude'], 6),
                           'transition_preview_seconds': record.get('transition_preview_seconds', max(0, card['kept_seconds']-5)),
                           'prompt': record.get('revision_description') or (('The audition fade and quiet restart are removed, with active phrases overlapped at the first join.\n\n' if record.get('revision') == 2 else 'Continue from the selected opening ' + card['source_label'] + '.\n\n') + '\n\n'.join(card['sections']))})
        directions.append({'name': card['title'], 'description': card['description'], 'tracks': tracks})
    def clock(seconds):
        seconds = round(seconds)
        return f'{seconds//60}:{seconds%60:02d}'
    durations = [r['audio_check']['duration_seconds'] for r in completed]
    lengths = f'{clock(min(durations))}–{clock(max(durations))}' if durations else 'Preparing audio'
    data = {'full_length': True, 'round_number': 8, 'save_key': 'muju-soundtrack-full-versions-v1',
            'title': 'Full versions — Muju soundtrack', 'eyebrow': 'Muju Hono Tanka · Full versions · ElevenLabs',
            'heading': 'The favorites, with room to grow.',
            'intro': 'The chosen element themes and non-element favorites, developed for longer listening. Revised mixes blend active phrases across the former pause; new extensions continue before the audition fades. Use “Check transition” to jump to each join.',
            'status': f'{len(completed)} of {len(pack["cards"])} full versions ready · {lengths} · Six element themes, lobby, match and rematch.',
            'footer_text': '“Even volume” uses approximate RMS matching while preserving the audio files. Favorites and notes stay in this browser. These full listening versions have endings; seamless game loops are a separate edit.',
            'navigation': [{'label': 'Listen as a playlist', 'url': '../playlist/'}, {'label': 'Umeme candidates', 'url': '../round-7/'}, {'label': 'Selected auditions', 'url': '../round-6/'}, {'label': 'Earlier songs', 'url': '../round-2/'}],
            'directions': directions}
    html = (ROOT / 'tools/music-player.html').read_text().replace('__AUDITION_DATA__', json.dumps(data, ensure_ascii=False).replace('<', '\\u003c'))
    script = re.search(r'<script>(.*?)</script>', html, re.S).group(1)
    subprocess.run(['node', '--check', '--input-type=commonjs'], input=script, text=True, capture_output=True, check=True)
    (DIST / 'index.html').write_text(html)
    m.write_json(OUT / 'full-versions-manifest.json', data)
    print(json.dumps({'full_versions_ready': len(completed), 'player': 'http://127.0.0.1:8766/full-versions/'}), flush=True)
    playlist_builder = ROOT / 'tools/build-music-playlist.py'
    if playlist_builder.exists():
        subprocess.run(['python3', str(playlist_builder)], check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'generate', 'batch', 'build'])
    parser.add_argument('--card', choices=[s['id'] for s in SONGS])
    args = parser.parse_args()
    pack = prepare()
    if args.action == 'prepare':
        print(json.dumps(pack['execution'])); return
    if args.action == 'build':
        build(pack); return
    with (OUT / '.full-batch.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert len(pack['cards']) == 9 and pack['execution']['total_audio_requests'] == 9
        if args.action == 'generate' and not args.card:
            raise ValueError('--card is required for generate')
        cards = pack['cards'] if args.action == 'batch' else [c for c in pack['cards'] if c['id'] == args.card]
        for card in cards:
            generate(card)
            build(pack)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(m.safe(str(exc)), flush=True)
        raise SystemExit(1)
