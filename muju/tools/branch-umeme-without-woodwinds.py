#!/usr/bin/env python3
"""One authorized 19A branch: preserve 0-29s, replace the ending without woodwinds."""
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions/round-7'
PACK = ROOT / 'docs/SOUNDTRACK_ROUND_7_PROMPTS-2026-09-12.json'
BRANCH = ROOT / 'docs/SOUNDTRACK_19D_NO_WOODWINDS-2026-09-12.json'
JOB = 'umeme-held-charge-elevenlabs-take-4'
spec = importlib.util.spec_from_file_location('audition', ROOT / 'tools/music-audition.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def prepare():
    if BRANCH.exists():
        return json.loads(BRANCH.read_text())
    source = json.loads((OUT / 'umeme-held-charge-elevenlabs-take-1.json').read_text())
    assert source['status'] == 'verified' and source['request']['store_for_inpainting']
    song_id = {k.lower(): v for k, v in source['response_headers'].items()}['song-id']
    positive = [
        'entirely instrumental, no voices',
        'continue directly from the kept opening, matching its tempo, key, melodic hook, bass movement and quiet groove',
        '124 BPM target, 4/4, clear D major, chill but energizing melodic electronica',
        'INSTRUMENTATION CHANGE IS THE PRIORITY: the new high melodic voice that entered around 30-31 seconds in the source must be absent; keep the arrangement built from the voices heard BEFORE that entrance',
        'the allowed melodic voices are a rounded clearly electronic mid-register synth, a woody plucked Swahili-coast udi lute and a resonant plucked kanuni zither; use these existing voices for every melodic answer',
        'the electric synth has a smooth but audibly electronic harmonic edge and no breath noise or wind-instrument imitation',
        'retain the held charge, gentle harmonic suspense, short deliberate gap, precise rising leap and memorable answering hook',
        'warm electric bass, restrained broken-beat drums and sparse hand-drum detail, with the same light low end and comfortable treble',
        'keep one lead voice at a time, with short udi and kanuni replies; do not introduce a new solo instrument in the final section',
        'make a recognizable return to the original hook over these last sixteen seconds, maintain the same listening level and leave a natural open phrase at the end',
    ]
    negative = [
        'woodwinds', 'flute', 'clarinet', 'oboe', 'bassoon', 'recorder', 'piccolo', 'saxophone',
        'panpipes', 'ney flute', 'reed instruments', 'wind instruments', 'whistling',
        'breathy flute-like synth', 'reedy synth lead', 'vocals', 'speech', 'humming', 'choir',
        'new countermelody entering around 30 seconds', 'bowed strings', 'brass',
        'constant fast arpeggios', 'crackling sound effects', 'rolling thunder', 'huge drop',
    ]
    body = {'model_id': 'music_v2', 'store_for_inpainting': True, 'seed': 6142904,
            'composition_plan': {'chunks': [
                {'song_id': song_id, 'range': {'start_ms': 0, 'end_ms': 29000}},
                {'text': '[Instrumental]', 'duration_ms': 16000,
                 'positive_styles': positive, 'negative_styles': negative,
                 'context_adherence': 'high',
                 'conditioning_ref': {'song_id': song_id, 'range': {'start_ms': 0, 'end_ms': 29000}},
                 'condition_strength': 'high'},
            ]}}
    branch = {'label': '19D', 'source_label': '19A', 'source_job': source['job'],
              'source_audio': source['audio_file'], 'source_sha256': source['sha256'],
              'source_seconds_kept': 29, 'regenerated_seconds': 16,
              'user_request': 'Branch from 19A without woodwind; target the instrument entering at 30-31 seconds.',
              'instrument_identification': 'Exact instrument unconfirmed. Timestamp comes from the user; the ending is regenerated with a closed plucked-string/electronic palette.',
              'estimated_usd_at_full_output_rate': .1125,
              'request': body}
    m.write_json(BRANCH, branch)
    return branch

def generate(branch):
    receipt_path = OUT / (JOB + '.json')
    with (OUT / '.budget.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if receipt_path.exists():
            old = json.loads(receipt_path.read_text())
            if old['status'] in ('downloaded', 'verified'):
                return
            raise RuntimeError('Existing branch needs review before any retry')
        assert hashlib.sha256((OUT / branch['source_audio']).read_bytes()).hexdigest() == branch['source_sha256']
        record = {'job': JOB, 'provider': 'elevenlabs', 'card': 'umeme-held-charge', 'take': 4,
                  'round': 7, 'title': 'Umeme / Held Charge', 'variant': '19A branch · no woodwinds',
                  'direction': 'Lightning · held charge and answering hook', 'bpm_target': 124,
                  'listen_for': 'The voice that entered at 30-31 seconds should be absent. The ending uses the established plucked strings and electric synth.',
                  'status': 'submitted', 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'duration_target_seconds': 45, 'estimated_generation_usd': .1125,
                  'request': branch['request'], 'branch_of': branch['source_job'],
                  'source_sha256': branch['source_sha256'], 'source_seconds_kept': 29,
                  'instrument_identification': branch['instrument_identification']}
        m.write_json(receipt_path, record)
    print(json.dumps({'label': '19D', 'status': 'submitted', 'new_audio_seconds': 16}), flush=True)
    start = time.monotonic()
    try:
        raw, headers, status = m.request('elevenlabs', 'https://api.elevenlabs.io/v1/music', branch['request'])
        headers = {k.lower(): v for k, v in headers.items()}
        if len(raw) < 10000 or not headers.get('content-type', '').startswith('audio/'):
            raise RuntimeError('Expected audio response; inspect before retry')
        path = OUT / (JOB + '.mp3'); path.write_bytes(raw)
        subprocess.run(['sox', str(path), '-n', 'stat'], capture_output=True, check=True)
        record.update(status='downloaded', audio_file=path.name, audio_bytes=len(raw),
                      sha256=hashlib.sha256(raw).hexdigest(), http_status=status,
                      response_headers={k:v for k,v in headers.items() if k in ('content-type', 'song-id', 'character-cost')})
    except urllib.error.HTTPError as exc:
        record.update(status='http-error', http_status=exc.code, error=m.safe(exc.read().decode())[:2000])
    except Exception as exc:
        record.update(status='needs-review', error=m.safe(str(exc)))
    finally:
        record['elapsed_seconds'] = round(time.monotonic() - start, 2)
        m.write_json(receipt_path, record)
    print(json.dumps({k:record[k] for k in ('status', 'elapsed_seconds', 'error') if k in record}), flush=True)
    if record['status'] != 'downloaded':
        raise RuntimeError('Branch did not complete; no automatic retry')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'generate']); args = parser.parse_args()
    branch = prepare()
    if args.action == 'prepare':
        print(json.dumps({k:branch[k] for k in ('label', 'source_label', 'source_seconds_kept', 'regenerated_seconds', 'estimated_usd_at_full_output_rate')})); return
    generate(branch)
    pack = json.loads(PACK.read_text())
    card = pack['cards'][0]
    card['take_names']['4'] = '19A branch · no woodwinds'
    card['providers']['elevenlabs']['take_bodies']['4'] = branch['request']
    pack['execution'].update(takes_per_card=4, total_audio_requests=4, total_requested_minutes=3,
                             estimated_generation_usd=.45)
    pack['execution']['branch_note'] = 'Fourth request is a separately authorized 19A edit, executed by branch-umeme-without-woodwinds.py.'
    pack['page']['intro'] = '19A–C explore held charge and a linked answering hook. New 19D branches from 19A: its first 29 seconds are retained as a reference section, and the ending is recomposed to exclude the voice entering at 30–31 seconds, using plucked strings and electric synth.'
    card['description'] = 'Three original approaches plus 19D, a focused edit of 19A’s ending without woodwinds.'
    m.write_json(PACK, pack)
    subprocess.run(['python3', str(ROOT / 'tools/build-music-player.py'), '--round', '7'], check=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(m.safe(str(exc)), flush=True)
        raise SystemExit(1)
