"""Apply the approved v2.8 economy changes to the final v6 production source."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json, shutil

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / 'archive/v6-production'
assert not ARCHIVE.exists(), 'This migration is one-time; preserve the prior source.'
ARCHIVE.mkdir()
for name in ['catalog.json', 'bonk-matrix.json', 'map.json', 'rules-verification.json', 'supplement.tsx', 'export-rules.ts', 'build-release.py', 'verify-live.py', 'logs/openai-new-clips.json']:
    dest = ARCHIVE / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / name, dest)
shutil.copytree(ROOT / 'rules-snapshot', ARCHIVE / 'rules-snapshot')

changes = {
    'R04': {
        '23': 'The square under it is holding sixteen.',
        'map': "New games use this Unequal routes map. Home squares hold eight crystals each. The brighter expansion squares hold sixteen each. Ordinary ground holds four, and the middle cluster holds eight. Empty squares are roads with no crystals. That makes five hundred four crystals altogether. Mining lowers a square's reserve. It never refills.",
    },
    'R12': {'24': 'Then I am standing on sixteen crystals decoratively.'},
    'R15': {
        '10': 'Stop two. A Sachakuna. Its Mining is eight. This patch has two crystals left.',
        '13': 'Two. The patch could not pay eight.',
        '14': 'Eight. My gardener is an eight.',
        '20': 'This is the Sachita. Shield of three. Takes five crystals. That is the Sachita.',
        '21': 'This is the Sachakuna. Many growing things. Shield of four. Takes eight crystals.',
        'matrix-2-stats': 'Tier two: the Sachita. Attack one, defense three, speed one, and Mining five. Look at the green side first.',
        'matrix-3-stats': 'Tier three: the Sachakuna. Attack two, defense four, speed one, and Mining eight. Look at the green side first.',
    },
}
jobs = []
now = datetime.now(ZoneInfo('America/Chicago'))
label = f'Video version 7 · Last updated at {now:%H:%M %b %d %Y %Z}'
for d in sorted((ROOT / 'production').glob('R??')):
    dest = ARCHIVE / d.name
    for sub in ['src', 'scripts', 'qa', 'public/audio']:
        (dest / sub).mkdir(parents=True, exist_ok=True)
    shutil.copy2(d / 'episode.json', dest / 'episode.json')
    for sub in ['src', 'scripts']:
        for p in (d / sub).iterdir():
            if p.is_file(): shutil.copy2(p, dest / sub / p.name)
    for p in (d / 'qa').glob('*.json'): shutil.copy2(p, dest / 'qa' / p.name)
    ep = json.loads((d / 'episode.json').read_text())
    ep.update(version=7, rules='v2.8', updatedLabel=label)
    for line in ep['lines']:
        if line['id'] in changes.get(d.name, {}):
            for ext in ['wav', 'json']:
                source = d / f'public/audio/{line["id"]}.{ext}'
                shutil.copy2(source, dest / 'public/audio' / source.name)
            old = line['text']
            line['text'] = changes[d.name][line['id']]
            jobs.append(dict(episode=d.name, id=line['id'], text=line['text'], previousText=old))
        # Keep production directions consistent with the visible cards.
        if d.name == 'R04':
            line['directions'] = line.get('directions', [])
            for key in ['directions', 'visuals']:
                if key in line: line[key] = [s.replace('RESERVE 10', 'RESERVE 16') for s in line[key]]
        if d.name == 'R15':
            for key, val in list(line.items()):
                if isinstance(val, list) and all(isinstance(s, str) for s in val):
                    line[key] = [s.replace('PATCH FIVE. PAYS FIVE.', 'PATCH EIGHT. PAYS EIGHT.').replace('Sachakuna, Mining five', 'Sachakuna, Mining eight').replace('Mining three, four, five', 'Mining three, five, eight').replace('defense two, three, four', 'defense three, three, four') for s in val]
    (d / 'episode.json').write_text(json.dumps(ep, indent=2, ensure_ascii=False) + '\n')
    p = d / 'src/video.tsx'
    s = p.read_text().replace('rad?10:q?', 'rad?16:q?').replace('Reserve 10 · bucket 0', 'Reserve 16 · bucket 0').replace('Math.min(10,reserve+take)', 'Math.min(16,reserve+take)').replace('y=250+Math.floor(i/4)*27', 'y=218+Math.floor(i/4)*25').replace('mining={0} reserve={10}', 'mining={0} reserve={16}').replace('mining={second?5:3}', 'mining={second?8:3}')
    p.write_text(s)
(ROOT / 'logs/openai-new-clips.json').write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + '\n')
(ROOT / 'logs/v7-economy-changes.json').write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + '\n')
print(f'Archived v6 production; prepared {len(jobs)} changed speech clips across {len(changes)} episodes.')
