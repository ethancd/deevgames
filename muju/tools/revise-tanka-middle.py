#!/usr/bin/env python3
"""Recompose Tanka's low-energy middle using its already-stored ElevenLabs source.

One bounded generation, no uploads or automatic retries. Run mix with NumPy Python.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions/full-versions'
PACK = ROOT / 'docs/SOUNDTRACK_TANKA_MIDDLE_REVISION-2026-09-12.json'
JOB = 'tanka-middle-low-mid-v3'

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

m = module('audition', 'music-audition.py')

def prepare():
    if PACK.exists():
        return json.loads(PACK.read_text())
    source = json.loads((OUT / 'tanka-flute-full-v1.json').read_text())
    current = json.loads((OUT / 'tanka-flute-full-v2-blended.json').read_text())
    assert source['status'] == current['status'] == 'verified'
    assert source['request']['store_for_inpainting']
    assert current['edit']['seconds_removed'] == 12
    song = {k.lower(): v for k, v in source['response_headers'].items()}['song-id']
    positive = [
        'entirely instrumental',
        'continue the existing Tanka melody, key, 80 BPM straight 4/4 and slow imposing weight',
        'LOW-MEDIUM ENERGY THROUGHOUT THIS MIDDLE PASSAGE: an established ensemble quietly continues, comfortably supported and present for the full passage',
        'foreground rounded wooden Plains flute retains broad descending half-note and whole-note phrases and its original tone',
        'sustained whole-note bass remains clearly audible through every flute breath',
        'dark bronze synth harmony remains present in the low middle register, gently overlapping chord changes to maintain body and harmonic pressure',
        'retain the quiet deep drum on widely spaced downbeats, at most beats one and three; a slow felt pulse under the flute',
        'keep the ongoing harmony moving through the familiar suspended chords and low landings rather than returning to an opening drone',
        'the melody may leave breathing room while bass and bronze continue underneath; retain accompaniment for the entire passage',
        'a modest dip in intensity within an already developed piece, one step below the surrounding passages, above the very quiet opening',
        'carry this low-medium intensity from the first moment to the last; match both neighboring musical phrases smoothly',
        'intimate, chill but quietly energizing fantasy game background music with comfortable treble and controlled bass',
    ]
    negative = [
        'vocals', 'chanting', 'humming', 'speech', 'ceremonial-song quotation',
        'new intro', 'fade out', 'fade in', 'near silence', 'empty breakdown',
        'solo flute without accompaniment', 'accompaniment dropping out', 'ambient reset',
        'huge climax', 'busy percussion', 'bouncy groove', 'fast arpeggios',
        'eighth-note ostinato', 'pastoral flute runs', 'new lead instrument',
    ]
    body = {'model_id': 'music_v2', 'seed': 6142913, 'store_for_inpainting': True,
            'composition_plan': {'chunks': [
                {'song_id': song, 'range': {'start_ms': 111000, 'end_ms': 129000}},
                {'text': '[Instrumental]', 'duration_ms': 33000,
                 'positive_styles': positive, 'negative_styles': negative,
                 'context_adherence': 'high', 'condition_strength': 'high',
                 'conditioning_ref': {'song_id': song, 'range': {'start_ms': 95000, 'end_ms': 125000}}},
                {'song_id': song, 'range': {'start_ms': 162000, 'end_ms': 180000}},
            ]}}
    pack = {'user_feedback': 'Tanka 1:59–2:28 returns to extremely low opening energy; should dip only to low-mid.',
            'source_file': source['audio_file'], 'source_sha256': source['sha256'],
            'current_file': current['audio_file'], 'current_sha256': current['sha256'],
            'method': '33-second inpaint with 18 seconds of existing context on each side; insert into current mix at 1:57–2:30 with two-second edge blends.',
            'generation_seconds': 33, 'output_seconds': 69, 'reference_uploads': 0,
            'estimated_usd_at_prior_full_output_rate': .1725,
            'documentation': 'https://elevenlabs.io/docs/eleven-api/guides/how-to/music/inpainting',
            'request': body}
    m.write_json(PACK, pack)
    return pack

def generate(pack):
    path = OUT / (JOB + '.json')
    if path.exists():
        prior = json.loads(path.read_text())
        if prior['status'] == 'verified':
            print('Skipping verified generation', flush=True)
            return prior
        raise RuntimeError('Existing generation needs review before retry')
    for prefix in ('source', 'current'):
        assert hashlib.sha256((OUT / pack[prefix + '_file']).read_bytes()).hexdigest() == pack[prefix + '_sha256']
    record = {**pack, 'job': JOB, 'status': 'submitted',
              'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    # Exclusive creation prevents duplicate paid requests from concurrent runs.
    with path.open('x') as target:
        json.dump(record, target, indent=2)
    print(json.dumps({'status': 'submitted', 'new_seconds': 33, 'uploads': 0}), flush=True)
    started = time.monotonic()
    try:
        raw, headers, status = m.request('elevenlabs', 'https://api.elevenlabs.io/v1/music', pack['request'])
        headers = {k.lower(): v for k, v in headers.items()}
        if len(raw) < 100000 or not headers.get('content-type', '').startswith('audio/'):
            raise RuntimeError('Expected audio response')
        audio = OUT / (JOB + '.mp3')
        audio.write_bytes(raw)
        stats = subprocess.run(['sox', str(audio), '-n', 'stat'], capture_output=True, text=True, check=True)
        duration = float(next(line.split(':')[1] for line in stats.stderr.splitlines() if line.startswith('Length (seconds)')))
        assert abs(duration - 69) < .2
        record.update(status='verified', audio_file=audio.name, sha256=hashlib.sha256(raw).hexdigest(),
                      duration_seconds=duration, response_headers={k:v for k,v in headers.items() if k in ('song-id','content-type','character-cost')})
    except urllib.error.HTTPError as exc:
        record.update(status='http-error', http_status=exc.code, error=m.safe(exc.read().decode())[:2000])
    except Exception as exc:
        record.update(status='needs-review', error=m.safe(str(exc)))
    finally:
        record['elapsed_seconds'] = round(time.monotonic()-started, 2)
        m.write_json(path, record)
    print(json.dumps({k:record[k] for k in ('status','elapsed_seconds','error') if k in record}), flush=True)
    if record['status'] != 'verified':
        raise RuntimeError('Generation stopped without retry; inspect receipt')
    return record

def mix(pack):
    import numpy as np
    b = module('blend', 'blend-music-extensions.py')
    rate = b.RATE
    receipt = json.loads((OUT / (JOB + '.json')).read_text())
    assert receipt['status'] == 'verified'
    current = json.loads((OUT / 'tanka-flute-full-v2-blended.json').read_text())
    for file, sha in [(receipt['audio_file'], receipt['sha256']), (pack['current_file'], pack['current_sha256'])]:
        assert hashlib.sha256((OUT / file).read_bytes()).hexdigest() == sha
    old = b.decode(OUT / pack['current_file'])
    generated = b.decode(OUT / receipt['audio_file'])
    patch = generated[18*rate:51*rate].copy()
    assert len(patch) == 33*rate
    rms = lambda x: float(np.sqrt(np.mean(x.astype(np.float64)**2)))
    # A single fixed trim matches the phrase's overall level; no pumping compressor.
    neighboring = np.concatenate([old[105*rate:117*rate], old[150*rate:162*rate]])
    target = rms(neighboring) * 10**(-1/20)
    gain = min(target/max(rms(patch), 1e-12), .85/max(float(np.max(np.abs(patch))), 1e-12))
    patch *= gain
    a, end, fade = 117*rate, 150*rate, 2*rate
    weight = np.ones((len(patch), 1), dtype=np.float32)
    ramp = .5 - .5*np.cos(np.linspace(0, np.pi, fade))
    weight[:fade,0] = ramp
    weight[-fade:,0] = ramp[::-1]
    revised = old.copy()
    revised[a:end] = old[a:end]*(1-weight) + patch*weight
    assert np.array_equal(revised[:a], old[:a]) and np.array_equal(revised[end:], old[end:])
    destination = OUT / 'tanka-flute-full-v3-low-mid.mp3'
    with tempfile.TemporaryDirectory(prefix='tanka-middle-') as temp:
        raw = Path(temp)/'mix.f32'
        revised.astype('<f4').tofile(raw)
        subprocess.run(['sox','-t','raw','-e','floating-point','-b','32','-c','2','-r',str(rate),str(raw),'-C','320',str(destination)], capture_output=True, check=True)
    checked = b.decode(destination)
    peak = float(np.max(np.abs(checked)))
    assert peak < 1 and abs(len(checked)-len(old))/rate < .15
    joins = [{'join_seconds': sec, 'longest_below_minus45_db_seconds': b.longest_quiet(checked[round((sec-3)*rate):round((sec+3)*rate)])} for sec in (118,149)]
    assert all(j['longest_below_minus45_db_seconds'] <= .3 for j in joins)
    levels = []
    for start, stop in [(105,117),(119,130),(130,140),(140,148),(150,162)]:
        levels.append({'range_seconds':[start,stop], 'old_rms_dbfs':round(20*np.log10(rms(old[start*rate:stop*rate])),2),
                       'new_rms_dbfs':round(20*np.log10(rms(checked[start*rate:stop*rate])),2)})
    record = dict(current)
    record['original_full_generation_request'] = record.pop('request')
    record['revision_request'] = pack['request']
    record['estimated_revision_usd_at_prior_full_output_rate'] = pack['estimated_usd_at_prior_full_output_rate']
    record.update(job=destination.stem, revision=3, audio_file=destination.name,
                  audio_bytes=destination.stat().st_size, sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                  duration_seconds=len(checked)/rate, source_full_mix=pack['current_file'], source_full_mix_sha256=pack['current_sha256'],
                  transition_preview_seconds=114, revision_label='low-mid passage revision',
                  revision_description='The 1:59–2:28 passage is recomposed with sustained bass and bronze accompaniment beneath the flute, maintaining low-medium intensity. Two-second edge blends at 1:57–1:59 and 2:28–2:30.',
                  processing='ElevenLabs targeted inpaint; local replacement of 1:57–2:30; all outside PCM retained before 320 kbps MP3 encoding.',
                  previous_edit=current['edit'],
                  edit={'start_seconds':117,'end_seconds':150,'fade_seconds':2,'curve':'complementary raised cosine','patch_gain_db':round(float(20*np.log10(gain)),3),'generation_receipt':JOB+'.json'},
                  audio_check={'decode':'passed','duration_seconds':len(checked)/rate,'rms_amplitude':rms(checked),
                               'rms_dbfs':round(float(20*np.log10(rms(checked))),2),'sample_peak':peak,
                               'outside_passage_pcm_preserved_before_encoding':True,'new_join_checks':joins,
                               'passage_levels':levels,'listening_review':'pending user review; no subjective listening claim'})
    m.write_json(destination.with_suffix('.json'), record)
    print(json.dumps({'audio_file':destination.name,'duration':len(checked)/rate,'levels':levels,'joins':joins,'patch_gain_db':record['edit']['patch_gain_db']}), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare','generate','mix'])
    args = parser.parse_args()
    pack = prepare()
    if args.action == 'generate': generate(pack)
    elif args.action == 'mix': mix(pack)
    else: print(json.dumps({k:pack[k] for k in ('method','generation_seconds','output_seconds','reference_uploads','estimated_usd_at_prior_full_output_rate')}))
