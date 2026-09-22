#!/usr/bin/env python3
"""Remove the fade/restart at the first join and crossfade active musical phrases.

Run with the bundled workspace Python (NumPy). Original generations are retained.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions/full-versions'
RATE = 44100
# Times selected from measured attacks and fade envelopes in the original full mixes.
# Rhythmic tracks align recurring pulses; Water uses a longer sustained overlap.
EDITS = {
    'hono-koto': {'out_start': 39.31, 'in_start': 51.73, 'overlap': 2.07,
                  'reason': 'One bar overlap; 12.42-second shift aligns the measured 116 BPM pulse and skips both fade and sparse restart.'},
    'muju-charango': {'out_start': 37.132, 'in_start': 53.222, 'overlap': 2.22,
                     'reason': 'One bar overlap; strong attacks at 37.992 and 54.082 seconds align, bringing the full charango groove forward.'},
    'golge-baglama': {'out_start': 40.172, 'in_start': 48.742, 'overlap': 2.14,
                    'reason': 'One bar overlap; an 8.57-second shift aligns the measured 112 BPM pulse before the old fade.'},
    'tanka-flute': {'out_start': 35.9, 'in_start': 47.9, 'overlap': 3.0,
                   'reason': 'One slow bar overlap; the strong attacks at 36.042 and 48.042 seconds align across the 12-second shift.'},
    'straumr-hardanger': {'out_start': 36.0, 'in_start': 45.12, 'overlap': 4.0,
                        'reason': 'Four-second overlap of active sustained strings; the continuation enters before the original bowed phrase fades.'},
}

def decode(path):
    result = subprocess.run(['sox', str(path), '-t', 'raw', '-e', 'floating-point',
                             '-b', '32', '-c', '2', '-r', str(RATE), '-'],
                            capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2).copy()

def energy_windows(x, window=.1):
    size = round(RATE * window)
    count = len(x) // size
    return np.sqrt(np.mean(x[:count*size].reshape(count, size, 2).astype(np.float64)**2, axis=(1, 2)))

def longest_quiet(x, threshold_db=-45):
    quiet = energy_windows(x) < 10**(threshold_db/20)
    run = longest = 0
    for value in quiet:
        run = run + 1 if value else 0
        longest = max(longest, run)
    return round(longest * .1, 3)

def write_json(path, value):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)

def process(card_id, edit):
    receipt = OUT / (card_id + '-full-v1.json')
    source = json.loads(receipt.read_text())
    source_path = OUT / source['audio_file']
    assert source['status'] == 'verified'
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source['sha256']
    audio = decode(source_path)
    a, b, n = (round(edit[k] * RATE) for k in ('out_start', 'in_start', 'overlap'))
    assert 0 < a < a+n < 45*RATE <= b < b+n < len(audio)
    theta = np.linspace(0, np.pi/2, n, dtype=np.float64)[:, None]
    mixed = audio[a:a+n] * np.cos(theta) + audio[b:b+n] * np.sin(theta)
    result = np.concatenate((audio[:a], mixed.astype(np.float32), audio[b+n:]))
    # Keep headroom if the overlap creates a higher peak. No compression or limiting.
    gain = min(1.0, .95 / max(float(np.max(np.abs(result))), 1e-12))
    result *= gain
    job = card_id + '-full-v2-blended'
    destination = OUT / (job + '.mp3')
    with tempfile.TemporaryDirectory(prefix='muju-blend-') as temporary:
        raw = Path(temporary) / 'mix.f32'
        result.astype('<f4').tofile(raw)
        encoded = Path(temporary) / 'mix.mp3'
        subprocess.run(['sox', '-t', 'raw', '-e', 'floating-point', '-b', '32', '-c', '2',
                        '-r', str(RATE), str(raw), '-C', '320', str(encoded)],
                       capture_output=True, check=True)
        checked = decode(encoded)
        expected = len(result) / RATE
        duration = len(checked) / RATE
        assert abs(duration - expected) < .15 and 180 <= duration <= 300
        peak = float(np.max(np.abs(checked)))
        if peak >= 1:
            raise RuntimeError('Encoded peak clips: ' + card_id)
        join = checked[max(0, a-RATE):a+n+RATE]
        quiet_seconds = longest_quiet(join)
        if quiet_seconds > .3:
            raise RuntimeError('Quiet gap remains in transition: ' + card_id)
        rms = float(np.sqrt(np.mean(checked.astype(np.float64)**2)))
        original_gap = audio[40*RATE:49*RATE]
        # Outside the overlap the PCM edit preserves both sides, apart from any recorded gain.
        assert np.allclose(result[:a], audio[:a]*gain, atol=1e-7)
        assert np.allclose(result[a+n:], audio[b+n:]*gain, atol=1e-7)
        destination.write_bytes(encoded.read_bytes())
    record = dict(source)
    record.update(job=job, review_id=source['job'], revision=2, status='verified',
                  audio_file=destination.name, audio_bytes=destination.stat().st_size,
                  sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                  duration_seconds=duration, source_full_mix=source['audio_file'],
                  source_full_mix_sha256=source['sha256'],
                  processing='Local PCM edit and 320 kbps MP3 encode; no new generation request.',
                  transition_preview_seconds=max(0, edit['out_start']-5),
                  edit={**edit, 'crossfade_curve': 'equal power, cosine/sine',
                        'seconds_removed': (b-a)/RATE, 'global_gain_db': round(float(20*np.log10(gain)), 4),
                        'original_40_49_longest_below_minus45_db_seconds': longest_quiet(original_gap),
                        'repaired_transition_longest_below_minus45_db_seconds': quiet_seconds},
                  audio_check={'decode': 'passed', 'duration_seconds': duration,
                               'rms_amplitude': rms, 'rms_dbfs': round(float(20*np.log10(rms)), 2),
                               'sample_peak': peak, 'listening_review': 'pending',
                               'pcm_outside_overlap_preserved_before_encoding': True,
                               'transition_gap_check': 'passed at 100 ms resolution'})
    # The new mix has no new provider song ID. Keep the old response explicitly as provenance.
    record['original_generation_response_headers'] = record.pop('response_headers', {})
    write_json(OUT / (job + '.json'), record)
    print(json.dumps({'element':source['element'], 'duration_seconds':round(duration,3),
                      'blend_at':round(a/RATE,3), 'overlap_seconds':n/RATE,
                      'old_quiet_gap_seconds':record['edit']['original_40_49_longest_below_minus45_db_seconds'],
                      'new_quiet_gap_seconds':quiet_seconds, 'peak':round(peak,5),
                      'gain_db':record['edit']['global_gain_db']}), flush=True)
    return record

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--card', choices=list(EDITS)); args = parser.parse_args()
    chosen = {args.card: EDITS[args.card]} if args.card else EDITS
    for card_id, edit in chosen.items():
        process(card_id, edit)

if __name__ == '__main__':
    main()
