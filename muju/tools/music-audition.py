#!/usr/bin/env python3
"""Bounded, resumable soundtrack auditions. Secrets never enter receipts or logs."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'music-auditions' / 'round-1'
PACK = ROOT / 'docs' / 'SOUNDTRACK_AUDITION_PROMPTS-2026-09-11.json'
ROUND_NO = 1
ALLOWED = {
    'lyria': ('https://generativelanguage.googleapis.com/', 'GEMINI_API_KEY', 'x-goog-api-key'),
    'elevenlabs': ('https://api.elevenlabs.io/', 'ELEVENLABS_API_KEY', 'xi-api-key'),
}


def credentials():
    result = {}
    for line in (ROOT / '.env.music.local').read_text().splitlines():
        line = line.strip().removeprefix('export ')
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        result[key.strip()] = value.strip().strip('\"\'')
    return result


def safe(value):
    text = str(value)
    for value in credentials().values():
        if value:
            text = text.replace(value, '[REDACTED]')
    return re.sub(r'AIza[A-Za-z0-9_-]+|sk_[A-Za-z0-9_-]{16,}', '[REDACTED]', text)


def write_json(path, data):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(provider, url, body=None):
    prefix, name, header = ALLOWED[provider]
    if not url.startswith(prefix):
        raise ValueError('Provider URL does not match the allowed host')
    key = credentials().get(name)
    if not key:
        raise ValueError(name + ' is not set')
    headers = {header: key, 'User-Agent': 'MujuSoundtrackAudition/1.0'}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=300) as response:
        return response.read(), dict(response.headers), response.status


def inspect(provider):
    OUT.mkdir(parents=True, exist_ok=True)
    if provider == 'lyria':
        payload, _, _ = request(provider, ALLOWED[provider][0] + 'v1beta/models')
        data = json.loads(payload)
        result = {'provider': provider, 'music_models': [
            {k: model[k] for k in ('name', 'displayName', 'supportedGenerationMethods') if k in model}
            for model in data.get('models', []) if 'lyria' in model.get('name', '').lower()
        ], 'has_next_page': bool(data.get('nextPageToken'))}
    else:
        payload, _, _ = request(provider, ALLOWED[provider][0] + 'v1/user/subscription')
        data = json.loads(payload)
        result = {'provider': provider, **{k: data[k] for k in (
            'tier', 'status', 'character_count', 'character_limit',
            'can_extend_character_limit', 'allowed_to_extend_character_limit',
            'currency', 'next_character_count_reset_unix') if k in data}}
    write_json(OUT / (provider + '-account-check.json'), result)
    print(json.dumps(result), flush=True)


def audio_blocks(value):
    found = []
    if isinstance(value, dict):
        if value.get('type') == 'audio' and isinstance(value.get('data'), str):
            found.append((value['data'], value.get('mime_type', value.get('mimeType', 'audio/mpeg'))))
        elif isinstance(value.get('inlineData'), dict) and value['inlineData'].get('mimeType', '').startswith('audio/'):
            found.append((value['inlineData']['data'], value['inlineData']['mimeType']))
        else:
            for v in value.values():
                found.extend(audio_blocks(v))
    elif isinstance(value, list):
        for v in value:
            found.extend(audio_blocks(v))
    return found


def redact_audio(value):
    if isinstance(value, list):
        return [redact_audio(x) for x in value]
    if isinstance(value, dict):
        return {k: ('[audio saved separately]' if k == 'data' and isinstance(v, str) and len(v) > 10000 else redact_audio(v)) for k, v in value.items()}
    return value


def generate(provider, card_id, take):
    pack = json.loads(PACK.read_text())
    execution = pack.get('execution', pack.get('round_one'))
    allowed_takes = (1, 2, 3) if ROUND_NO >= 2 else (1, 2)
    if card_id not in execution['cards'] or take not in allowed_takes or (ROUND_NO >= 2 and provider != 'elevenlabs'):
        raise ValueError('Request is outside the selected authorized round')
    card = next(c for c in pack['cards'] if c['id'] == card_id)
    spec = dict(card['providers'][provider])
    if 'take_bodies' in spec:
        spec['body'] = spec['take_bodies'][str(take)]
    OUT.mkdir(parents=True, exist_ok=True)
    job_id = f'{card_id}-{provider}-take-{take}'
    receipt_path = OUT / (job_id + '.json')
    if receipt_path.exists():
        previous = json.loads(receipt_path.read_text())
        print(json.dumps({'job': job_id, 'status': 'skipped-existing', 'previous_status': previous['status']}), flush=True)
        return
    # Serialize budget checks across independent processes without exposing keys.
    import fcntl
    with (OUT / '.budget.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if receipt_path.exists():
            print(json.dumps({'job': job_id, 'status': 'skipped-existing'}), flush=True)
            return
        receipts = []
        for path in OUT.glob('*-take-*.json'):
            if path.name.endswith('-response.json'):
                continue
            receipts.append(json.loads(path.read_text()))
        count = sum(x['provider'] == provider for x in receipts)
        limit = {1: 6, 2: 15, 3: 9, 4: 9, 5: 6, 7: 3}[ROUND_NO]
        if count >= limit:
            raise ValueError('The request limit for this round and provider is reached')
        duration = spec['body'].get('music_length_ms', 30000) / 1000
        if ROUND_NO >= 2 and (duration != 45 or spec['body'].get('model_id') != 'music_v2'):
            raise ValueError('This round is bounded to 45-second music_v2 requests')
        receipt = {
            'job': job_id, 'provider': provider, 'card': card_id, 'take': take,
            'round': ROUND_NO, 'variant': card.get('take_names', {}).get(str(take)),
            'direction': card['direction'], 'title': card['title'], 'bpm_target': card['bpm'],
            'listen_for': card['listen_for'], 'status': 'submitted',
            'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'duration_target_seconds': duration, 'estimated_generation_usd': 0.04 if provider == 'lyria' else round(duration / 60 * 0.15, 4),
            'request': spec['body'],
        }
        write_json(receipt_path, receipt)
    print(json.dumps({'job': job_id, 'status': 'submitted'}), flush=True)
    started = time.monotonic()
    try:
        payload, headers, http_status = request(provider, spec['url'], spec['body'])
        content_type = headers.get('Content-Type', headers.get('content-type', ''))
        receipt['http_status'] = http_status
        receipt['response_headers'] = {k: v for k, v in headers.items() if k.lower() in (
            'content-type', 'request-id', 'x-request-id', 'song-id', 'character-cost')}
        if provider == 'lyria' or 'json' in content_type:
            response = json.loads(payload)
            write_json(OUT / (job_id + '-response.json'), redact_audio(response))
            blocks = audio_blocks(response)
            if not blocks:
                raise ValueError('Response has no inline audio; inspect the saved response before retrying')
            if len(blocks) != 1:
                raise ValueError('Multiple audio blocks require review before combining')
            encoded, content_type = blocks[0]
            payload = base64.b64decode(encoded, validate=True)
        if not content_type.startswith('audio/') and not payload.startswith((b'ID3', b'RIFF')) and payload[:1] != b'\xff':
            raise ValueError('Response did not identify audio')
        if len(payload) < 10000:
            raise ValueError('Audio payload is unexpectedly small')
        suffix = '.wav' if 'wav' in content_type or payload.startswith(b'RIFF') else '.mp3'
        path = OUT / (job_id + suffix)
        path.write_bytes(payload)
        receipt.update(status='downloaded', audio_file=path.name, audio_bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest())
    except urllib.error.HTTPError as exc:
        response_text = safe(exc.read().decode(errors='replace'))[:3000]
        receipt.update(status='http-error', http_status=exc.code, error=response_text)
    except Exception as exc:
        receipt.update(status='needs-review', error=safe(f'{type(exc).__name__}: {exc}'))
    finally:
        receipt['elapsed_seconds'] = round(time.monotonic() - started, 2)
        write_json(receipt_path, receipt)
    print(json.dumps({k: receipt[k] for k in ('job', 'status', 'http_status', 'audio_file', 'audio_bytes', 'elapsed_seconds', 'error', 'response_headers') if k in receipt}), flush=True)


def main():
    global OUT, PACK, ROUND_NO
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'generate', 'round-one', 'batch', 'preview-round', 'retry-quota'])
    parser.add_argument('provider', choices=ALLOWED)
    parser.add_argument('--round', dest='round_number', type=int, choices=[1, 2, 3, 4, 5, 7], default=1)
    parser.add_argument('--card')
    parser.add_argument('--take', type=int, choices=[1, 2, 3])
    args = parser.parse_args()
    ROUND_NO = args.round_number
    if ROUND_NO >= 2:
        OUT = ROOT / 'music-auditions' / f'round-{ROUND_NO}'
        PACK = ROOT / 'docs' / f'SOUNDTRACK_ROUND_{ROUND_NO}_PROMPTS-2026-09-12.json'
    try:
        if ROUND_NO >= 2 and (args.provider != 'elevenlabs' or args.action in ('round-one', 'retry-quota')):
            raise ValueError('This round enables only its new ElevenLabs batch')
        if args.action == 'inspect':
            inspect(args.provider)
        elif args.action in ('round-one', 'batch', 'preview-round'):
            remaining = []
            pack = json.loads(PACK.read_text())
            execution = pack.get('execution', pack.get('round_one'))
            card_ids = execution['cards']
            slots = [(card_id, take) for take in range(1, 4) for card_id in card_ids] if ROUND_NO >= 2 else [(card_id, take) for card_id in card_ids for take in (1, 2)]
            for card_id, take in slots:
                path = OUT / f'{card_id}-{args.provider}-take-{take}.json'
                if path.exists():
                    receipt = json.loads(path.read_text())
                    if receipt['status'] in ('downloaded', 'verified'):
                        print(json.dumps({'job': receipt['job'], 'action': 'skip-downloaded'}), flush=True)
                        continue
                    raise ValueError('Existing failed/pending request must be reviewed before continuing: ' + path.name)
                remaining.append((card_id, take))
            minutes = len(remaining) * (0.75 if ROUND_NO >= 2 else 0.5)
            print(json.dumps({'round': ROUND_NO, 'new_requests': len(remaining), 'new_audio_minutes': minutes, 'estimated_generation_usd': round(minutes * 0.15, 4) if args.provider == 'elevenlabs' else len(remaining) * 0.04, 'dry_run': args.action == 'preview-round'}), flush=True)
            if args.action == 'preview-round':
                return
            for card_id, take in remaining:
                generate(args.provider, card_id, take)
                receipt = json.loads((OUT / f'{card_id}-{args.provider}-take-{take}.json').read_text())
                if receipt['status'] not in ('downloaded', 'verified'):
                    print(json.dumps({'status': 'batch-stopped', 'reason': 'Review the failed or pending request before continuing'}), flush=True)
                    return
        else:
            if args.card is None or args.take is None:
                parser.error('generate requires --card and --take')
            if args.action == 'retry-quota':
                path = OUT / f'{args.card}-{args.provider}-take-{args.take}.json'
                receipt = json.loads(path.read_text())
                if receipt['status'] != 'http-error' or receipt.get('http_status') != 429 or 'free_tier' not in receipt.get('error', ''):
                    raise ValueError('Only an explicitly rejected free-tier quota request can be retried this way')
                archive = OUT / 'rejected'
                archive.mkdir(exist_ok=True)
                path.rename(archive / (path.stem + '-' + str(time.time_ns()) + '.json'))
            generate(args.provider, args.card, args.take)
    except urllib.error.HTTPError as exc:
        print(json.dumps({'provider': args.provider, 'http_status': exc.code, 'error': safe(exc.read().decode(errors='replace'))[:2000]}), flush=True)
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({'provider': args.provider, 'error': safe(f'{type(exc).__name__}: {exc}')}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
