#!/usr/bin/env python3
"""ElevenLabs narration for the 16-lesson Academy release.

No OpenAI requests. Credentials are read only from the existing local music key.
Run `inspect`, then configure voices in elevenlabs-cast.json, then `generate`.
Each completed take is cached; a pending or failed request requires review.
"""
import argparse
import base64
import datetime
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PRODUCTION = ROOT / 'production'
BASE = 'https://api.elevenlabs.io/'
NUMBERS = dict(zip('one two three four five six seven eight nine ten'.split(), range(1, 11)))
LETTERS = dict(zip('ABCDEFGHIJ', ['Ay', 'Bee', 'See', 'Dee', 'Ee', 'Eff', 'Gee', 'Aitch', 'Eye', 'Jay']))
# 2026-09-22: the rename (docs/changes/2026-09-22-rename-irumbu-BRIEF.md) added every new
# display name below, alongside its old name, so existing takes keep recognizing/pronouncing
# correctly. New-name respellings are proposals for a future re-voice, not verified takes.
NAMES = {'Hi': 'Hee', 'Sjor': 'Shore', 'Sjór': 'Shore', 'Muju': 'Moo-joo', 'Hono': 'Hoh-noh', 'Honō': 'Hoh-noh', 'Kagari': 'kah-GAH-ree', 'Radi': 'RAH-dee', 'Umeme': 'oo-MEH-meh', 'Kimubunga': 'kee-moo-BOONG-gah', 'Kimbunga': 'kim-BOONG-gah', 'Straumr': 'STROWM-ur', 'Aegirinn': 'AY-geer-in', 'Ægirinn': 'AY-geer-in', 'Göl': 'Guhl', 'Loş': 'Lohsh', 'Gölge': 'Guhl-geh', 'Karanlık': 'kah-rahn-LUK', 'Sachita': 'sah-CHEE-tah', 'Mallki': 'MAHL-kee', 'Sachakuna': 'sah-chah-KOO-nah', "Sach'akuna": 'SAH-chah-KOO-nah', 'Inyan': 'In-yahn', 'Yan': 'Yahn', 'Poṉ': 'Pohn', 'Mazask': 'MAH-zahsk', 'Veḷḷi': 'VEL-lee', 'Tanka': 'Tahn-kah', 'Irumbu': 'ee-ROOM-boo'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def key():
    for line in (ROOT.parent / '.env.music.local').read_text().splitlines():
        line = line.strip().removeprefix('export ')
        if line.startswith('ELEVENLABS_API_KEY='):
            return line.split('=', 1)[1].strip().strip('\"\'')
    raise ValueError('The existing music configuration has no ElevenLabs key.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(endpoint, body=None):
    # The key is never included in logs, URLs, or files produced by this adapter.
    if not re.match(r'^v[12]/[a-zA-Z0-9/?_=&.-]+$', endpoint):
        raise ValueError('Invalid ElevenLabs endpoint')
    headers = {'xi-api-key': key(), 'User-Agent': 'MujuAcademy/6'}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    try:
        with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(BASE + endpoint, data=data, headers=headers), timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('detail', {})
            message = str(detail.get('message', detail.get('status', 'Request rejected')))
        except (ValueError, AttributeError):
            message = 'Request rejected'
        raise RuntimeError(f'ElevenLabs HTTP {error.code}: {message.replace(key(), "[REDACTED]")}') from None


def display(text):
    text = re.sub(r'\b[Cc]olumn ([A-J]),? row (one|two|three|four|five|six|seven|eight|nine|ten)\b', lambda m: m[1] + str(NUMBERS[m[2]]), text)
    return re.sub(r'\b([A-J]) (one|two|three|four|five|six|seven|eight|nine|ten)\b', lambda m: m[1] + str(NUMBERS[m[2]]), text)


def speech_tokens(text):
    """Keep a reversible mapping from canonical caption tokens to spoken aliases."""
    result, offset = [], 0
    for token in display(text).split():
        word = re.sub(r'\b(' + '|'.join(map(re.escape, NAMES)) + r')\b', lambda m: NAMES[m[0]], token)
        word = re.sub(r'\b([A-J])(10|[1-9])\b', lambda m: LETTERS[m[1]] + '-' + next(k for k, v in NUMBERS.items() if v == int(m[2])), word)
        result.append({'text': token, 'spoken': word, 'start': offset, 'end': offset + len(word)})
        offset += len(word) + 1
    return result


def captions(text, alignment, fps, duration):
    tokens = speech_tokens(text)
    expected = ' '.join(t['spoken'] for t in tokens)
    actual = ''.join(alignment['characters'])
    starts = alignment['character_start_times_seconds']
    ends = alignment['character_end_times_seconds']
    if len(actual) != len(starts) or len(actual) != len(ends):
        raise ValueError('Invalid character timing lengths')
    matcher = difflib.SequenceMatcher(None, expected, actual, autojunk=False)
    mapping = {}
    for block in matcher.get_matching_blocks():
        mapping.update((block.a + i, block.b + i) for i in range(block.size))
    frames = []
    total = round(duration * fps)
    for token in tokens:
        chars = [i for i in range(token['start'], token['end']) if expected[i].isalnum()]
        covered = [i for i in chars if i in mapping]
        if not chars or len(covered) / len(chars) < .8:
            raise ValueError('Character alignment needs review: ' + token['text'])
        at = starts[mapping[covered[0]]]
        if at < 0 or at > duration + .1:
            raise ValueError('Character timing is outside the audio clip')
        frames.append(max(0, min(total - 1, round(at * fps))))
    if frames != sorted(frames):
        raise ValueError('Caption timing is not monotonic')
    chunks, first = [], 0
    for i, token in enumerate(tokens):
        content = ' '.join(t['text'] for t in tokens[first:i + 1])
        if len(content) >= 63 or i - first >= 11 or (re.search(r'[.!?]$', token['text']) and i - first >= 3) or i == len(tokens) - 1:
            chunks.append({'text': content, 'start': frames[first], 'last': i})
            first = i + 1
    for i, chunk in enumerate(chunks):
        chunk['end'] = chunks[i + 1]['start'] if i + 1 < len(chunks) else total
        chunk.pop('last')
        if chunk['end'] <= chunk['start']:
            raise ValueError('Empty caption interval; review timing')
    if ' '.join(c['text'] for c in chunks) != display(text):
        raise ValueError('Caption text does not match canonical script')
    return chunks, frames


def inspect():
    endpoints = {'voices': 'v2/voices?page_size=100', 'models': 'v1/models', 'subscription': 'v1/user/subscription'}
    for kind, endpoint in endpoints.items():
        try:
            data = request(endpoint)
            if kind == 'voices':
                data = {'has_more': data.get('has_more'), 'next_page_token': data.get('next_page_token'), 'voices': [{k: v.get(k) for k in ['voice_id', 'name', 'category', 'description', 'labels', 'preview_url']} for v in data.get('voices', [])]}
            elif kind == 'models':
                data = [{k: m.get(k) for k in ['model_id', 'name', 'can_do_text_to_speech', 'token_cost_factor']} for m in data if m.get('can_do_text_to_speech')]
            else:
                data = {k: data.get(k) for k in ['tier', 'status', 'character_count', 'character_limit', 'next_character_count_reset_unix']}
            write_json(ROOT / f'logs/elevenlabs-{kind}.json', data)
            print(kind, json.dumps(data), flush=True)
        except RuntimeError as error:
            print(kind, str(error), flush=True)


def generate(episodes, only=None):
    cast = json.loads((ROOT / 'elevenlabs-cast.json').read_text())
    for episode_id in episodes:
        directory = PRODUCTION / episode_id
        episode = json.loads((directory / 'episode.json').read_text())
        for line in episode['lines']:
            if only and line['id'] not in only:
                continue
            voice = cast['voices'][line['speaker']]
            spoken = ' '.join(t['spoken'] for t in speech_tokens(line['text']))
            body = {'text': spoken, 'model_id': cast['model'], 'voice_settings': voice['settings'], 'seed': int(sha((episode_id + line['id']).encode())[:8], 16)}
            fingerprint = sha(json.dumps({'voice': voice['id'], 'body': body, 'format': 'mp3_44100_128'}, sort_keys=True).encode())
            stem = directory / 'public/audio' / line['id']
            metadata = stem.with_suffix('.json')
            wav = stem.with_suffix('.wav')
            if metadata.exists() and wav.exists():
                previous = json.loads(metadata.read_text())
                if previous.get('provider') == 'elevenlabs' and previous.get('hash') == fingerprint and previous.get('originalText') == line['text'] and previous.get('audioSha256') == sha(wav.read_bytes()):
                    print(episode_id, line['id'], 'cached', flush=True)
                    continue
            receipt = directory / 'qa/elevenlabs' / f'{line["id"]}-{fingerprint[:12]}.json'
            if receipt.exists():
                raise RuntimeError(f'Review existing request before retrying: {receipt}')
            receipt.parent.mkdir(parents=True, exist_ok=True)
            write_json(receipt, {'status': 'submitted', 'voice': voice['id'], 'hash': fingerprint, 'characters': len(spoken)})
            # Archive previous takes before replacing production files.
            for old in (wav, metadata):
                if old.exists():
                    destination = ROOT / 'archive/voice-takes' / episode_id / (old.stem + '-' + sha(old.read_bytes())[:12] + old.suffix)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if not destination.exists():
                        shutil.copy2(old, destination)
                    if sha(destination.read_bytes()) != sha(old.read_bytes()):
                        raise ValueError('Audio archive mismatch')
            try:
                data = request(f'v1/text-to-speech/{voice["id"]}/with-timestamps?output_format=mp3_44100_128', body)
                mp3 = receipt.with_suffix('.mp3')
                mp3.write_bytes(base64.b64decode(data.pop('audio_base64'), validate=True))
                write_json(receipt.with_suffix('.alignment.json'), data)
                ffmpeg = directory / 'node_modules/ffmpeg-static/ffmpeg'
                ffprobe = directory / 'node_modules/ffprobe-static/bin/darwin/arm64/ffprobe'
                if not ffprobe.exists():
                    found = list((directory / 'node_modules/ffprobe-static/bin').glob('darwin/*/ffprobe'))
                    if len(found) != 1:
                        raise ValueError('Resolve local ffprobe binary before converting audio')
                    ffprobe = found[0]
                temporary = wav.with_suffix('.tmp.wav')
                subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(mp3), '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', str(temporary)], check=True)
                probe = json.loads(subprocess.check_output([str(ffprobe), '-v', 'error', '-show_format', '-of', 'json', str(temporary)]))
                duration = float(probe['format']['duration'])
                cues, frames = captions(line['text'], data['alignment'], episode['fps'], duration)
                temporary.replace(wav)
                write_json(metadata, {'provider': 'elevenlabs', 'model': cast['model'], 'voice': voice['id'], 'speaker': line['speaker'], 'originalText': line['text'], 'speechText': spoken, 'hash': fingerprint, 'duration': duration, 'bytes': wav.stat().st_size, 'audioSha256': sha(wav.read_bytes()), 'captions': cues, 'wordFrames': frames, 'captionAlignment': 'ElevenLabs character timestamps mapped to canonical numeric captions', 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
                write_json(receipt, {'status': 'generated', 'hash': fingerprint, 'voice': voice['id'], 'characters': len(spoken), 'duration': duration, 'audioSha256': sha(wav.read_bytes())})
                print(episode_id, line['id'], line['speaker'], f'{duration:.2f}s', flush=True)
            except Exception as error:
                write_json(receipt, {'status': 'needs-review', 'hash': fingerprint, 'error': str(error).replace(key(), '[REDACTED]')})
                raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'generate'])
    parser.add_argument('--episodes', default=','.join(f'R{i:02}' for i in range(1, 17)))
    parser.add_argument('--only')
    args = parser.parse_args()
    if args.action == 'inspect':
        inspect()
    else:
        selected = args.episodes.split(',')
        if any(e not in [f'R{i:02}' for i in range(1, 17)] for e in selected):
            raise ValueError('Only R01–R16 belong to this release')
        generate(selected, args.only.split(',') if args.only else None)
