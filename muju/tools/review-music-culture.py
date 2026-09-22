#!/usr/bin/env python3
"""One bounded, blind audio-description pass; no generation or secret logging."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audition', ROOT / 'tools/music-audition.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
OUT = ROOT / 'music-auditions/cultural-review'
SOURCES = [
    ('A', 1, 'hono-lantern-elevenlabs-take-1', 'Fire E'),
    ('B', 2, 'muju-field-elevenlabs-take-1', 'Plant 01A'),
    ('C', 2, 'golge-square-elevenlabs-take-1', 'Shadow 02A'),
    ('D', 4, 'tanka-pressure-elevenlabs-take-1', 'Metal 10A'),
    ('E', 5, 'straumr-arco-elevenlabs-take-2', 'Water 13B'),
]
PROMPT = '''Listen to the five attached instrumental music clips, labeled A through E. Their titles and generation prompts are deliberately withheld. Describe what is AUDIBLY present, not what an imagined brief might intend. Do not identify a specific ethnic instrument from a generic synthetic pluck, or infer a culture from mood alone. Distinguish confident instrument families from uncertain exact instruments. No listening claims without the audio; if you cannot access audio, say so.
Return a JSON object with a clips array. For each clip give: label; audible_texture (under 65 words); rhythm_and_melodic_behavior (under 65 words); cultural_associations (array of objects with association, specific_audible_evidence, confidence low/medium/high; empty array if none defensible); generic_alternatives; audible_vocals boolean; two short timestamped_observations with MM:SS. Do not force a cultural association or a one-to-one mapping between clips and cultures. These are modern synthetic game cues, so "not culturally specific" is a valid and useful conclusion. Maximum 1100 words total.'''

def main():
    OUT.mkdir(exist_ok=True)
    receipt = OUT / 'blind-review.json'
    if receipt.exists():
        raise SystemExit('Review already submitted; inspect saved result before any repeat.')
    parts = [{'type': 'text', 'text': PROMPT}]
    mapping = []
    for label, rnd, job, title in SOURCES:
        audio = ROOT / 'music-auditions' / f'round-{rnd}' / (job + '.mp3')
        raw = audio.read_bytes()
        mapping.append({'label': label, 'title': title, 'path': str(audio.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest()})
        parts += [{'type': 'text', 'text': 'Clip ' + label}, {'type': 'audio', 'data': base64.b64encode(raw).decode(), 'mime_type': 'audio/mp3'}]
    body = {'model': 'gemini-3.8-flash', 'input': parts, 'store': False,
            'generation_config': {'max_output_tokens': 5000, 'thinking_level': 'low'}}
    if len(json.dumps(body)) > 15_000_000:
        raise ValueError('Audio request too large')
    record = {'status': 'submitted', 'model': body['model'], 'sources': mapping, 'prompt': PROMPT, 'max_output_tokens': 5000}
    m.write_json(receipt, record)
    try:
        raw, _, status = m.request('lyria', 'https://generativelanguage.googleapis.com/v1beta/interactions', body)
        response = json.loads(raw)
        m.write_json(OUT / 'blind-response.json', response)
        blocks = []
        for step in response.get('steps', []):
            for item in step.get('content', []):
                if item.get('type') == 'text': blocks.append(item['text'])
        for item in response.get('outputs', []):
            if item.get('type') == 'text': blocks.append(item['text'])
        result = '\n'.join(blocks)
        if not result:
            raise ValueError('No text result; inspect response without retrying')
        (OUT / 'blind-review-result.txt').write_text(result)
        record.update(status='completed', http_status=status, usage=response.get('usage'), result_file='blind-review-result.txt')
        print(result)
    except urllib.error.HTTPError as exc:
        record.update(status='http-error', http_status=exc.code, error=m.safe(exc.read().decode())[:1800])
    except Exception as exc:
        record.update(status='needs-review', error=m.safe(str(exc)))
    finally:
        m.write_json(receipt, record)
        print(json.dumps({k: record[k] for k in ('status', 'http_status', 'usage', 'error') if k in record}))

if __name__ == '__main__': main()
