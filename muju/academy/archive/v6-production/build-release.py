#!/usr/bin/env python3
"""Package all 16 verified v6 lessons without publishing them.

Usage: python3 build-release.py PRODUCTION_ROOT SITE_REPO ARCHIVE [--check-only]
The archive must be outside the site. All final evidence is checked before writes.
"""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import argparse
import hashlib
import html
import json
import re
import shutil

RELEASE = 'v6-four-actions-and-element-matrices'
SUMMARIES = [
    ('Find both homes, meet the starting team, and learn the ways a game can end.', ['Board coordinates', 'Starting map', 'Winning']),
    ('Click has four lights. Count whole movement actions and share them across the team.', ['Four shared actions', 'Speed', 'Blocked paths']),
    ('Match damage to defense, combine attacks, and learn when a kill unlocks Cleave.', ['Element bonuses', 'Damage and healing', 'Cleave']),
    ('Every friendly piece collects automatically at turn end, while its square still has crystals.', ['Passive mining', 'Finite reserves', '480 crystals']),
    ('Buy tier-one pieces at their current prices and find a clear delivery rectangle.', ['Tier-one prices', 'Purchase rectangles', 'Blocked home']),
    ('Pay four crystals for tier two or eight more for tier three, one step per piece each turn.', ['Promotion costs', 'Purchase-turn limit', 'Act immediately']),
    ('Bigger pieces bring upkeep bills. Choose the pieces the bank can afford to keep.', ['Upkeep 0 / 1 / 2', 'Affordable keep sets', 'Full healing']),
    ('Count the enemy’s trip and attack against the four-action limit.', ['Travel plus attack', 'Four-action reach', 'A safe square']),
    ('Only an enemy killed by an attack resets the clock. Mining does not prevent a quiet-turn draw.', ['Ten quiet turns', 'Attack kills', 'Draw timing']),
    ('Follow Pay, Place, Act, Mine, then learn the controls, optional handicap, and online game endings.', ['A complete turn', 'Controls and undo', 'Handicap and clocks']),
    ('Meet Hi, Hono, and Kagari. Inspect every one-shot matchup in both directions at each tier.', ['Fire', 'T1 / T2 / T3 bonk matrices', 'Cleave']),
    ('Meet Radi, Umeme, and Kimubunga. Check each tier’s outgoing and incoming one-shot attacks.', ['Lightning', 'T1 / T2 / T3 bonk matrices', 'Speed and damage']),
    ('Meet Sjor, Straumr, and Aegirinn. Compare each tier’s one-shot attacks and vulnerabilities.', ['Water', 'T1 / T2 / T3 bonk matrices', 'Defense and mining']),
    ('Meet Göl, Gölge, and Karanlık. Check both sides of every tier’s bonk matrix.', ['Shadow', 'T1 / T2 / T3 bonk matrices', 'Paths and blockers']),
    ('Meet Muju, Sachita, and Sachakuna. Study every tier’s one-shot matchups and crystal income.', ['Plant', 'T1 / T2 / T3 bonk matrices', 'Muju defense 3']),
    ('Meet Inyan, Mazask, and Tanka. Check each tier’s one-shot matchups and the fortress’s five defense.', ['Metal', 'T1 / T2 / T3 bonk matrices', 'Tanka defense 5']),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('production', type=Path)
    parser.add_argument('site_repo', type=Path)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    prod, root, archive = (p.resolve() for p in (args.production, args.site_repo, args.archive))
    site = root / 'muju-academy'
    require(not archive.is_relative_to(root), 'Archive must be outside the deployed site.')
    require(not archive.is_relative_to(prod), 'Archive must be outside production outputs.')
    rows, inputs = [], {}
    for i, (description, topics) in enumerate(SUMMARIES, 1):
        eid = f'R{i:02}'
        d = prod / eid
        t = read(d / 'src/timeline.json')
        require(t['rules'] == 'v2.7' and t['version'] == 6, f'{eid}: wrong revision')
        require(t['audioComplete'], f'{eid}: current narration is incomplete')
        video = d / f'output/Muju-Academy-Episode-{i:02}.mp4'
        probe = read(d / 'qa/final-probe.json')
        visual = read(d / 'qa/export-visual-check.json')
        audio = read(d / 'qa/export-audio-check.json')
        mastering = read(d / 'qa/audio-mastering.json')
        # A final review must name the exact artifacts it inspected; stale QA cannot pass.
        review = read(d / 'qa/final-review.json')
        require(review['videoSha256'] == digest(video), f'{eid}: review is for another export')
        require(review['timelineSha256'] == digest(d / 'src/timeline.json'), f'{eid}: stale source review')
        for check in ['speechComplete', 'captionTiming', 'numericCoordinates', 'visuals', 'musicBalance', 'quietHolds']:
            require(review.get(check) is True, f'{eid}: final review missing {check}')
        require(visual['decode'] == 'PASS' and audio['passed'], f'{eid}: export QA failed')
        holds = visual.get('holds') or [visual['hold']]
        require(all(h['passed'] for h in holds), f'{eid}: thinking hold failed')
        require(len(audio['clips']) == len(t['lines']), f'{eid}: missing speech coverage')
        require(mastering['soundtrack'] == t['soundtrack'], f'{eid}: wrong soundtrack')
        require(float(mastering['measuredFinal']['input_tp']) <= -1.5, f'{eid}: decoded audio peak exceeds ceiling')
        require(-19 <= float(mastering['measuredFinal']['input_i']) <= -14, f'{eid}: unexpected final loudness')
        require(digest(d / 'public/music/theme.mp3') == t['soundtrack']['sha256'], f'{eid}: music source changed')
        seconds = float(probe['format']['duration'])
        require(abs(seconds - t['durationInFrames'] / t['fps']) < .3, f'{eid}: duration mismatch')
        stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        audio_stream = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
        require(abs(float(audio_stream['duration']) - t['durationInFrames'] / t['fps']) < .1, f'{eid}: truncated audio stream')
        require((stream['width'], stream['height']) == (1920, 1080), f'{eid}: expected 1080p')
        require(video.stat().st_size < 25 * 1024**2, f'{eid}: hosting file limit')
        require(video.stat().st_mtime > (d / 'src/timeline.json').stat().st_mtime, f'{eid}: stale video')
        for line in t['lines']:
            captions = ' '.join(c['text'] for c in line['captions'])
            require(captions == line['displayText'], f'{eid}/{line["id"]}: caption text mismatch')
            require(not re.search(r'\b[A-J] (?:one|two|three|four|five|six|seven|eight|nine|ten)\b', captions), f'{eid}: nonnumeric coordinate')
        row = dict(id=eid, number=i, title=t['title'], version=6, rules='v2.7', updatedLabel=t['updatedLabel'], seconds=seconds, description=description, topics=topics, soundtrack={k: t['soundtrack'][k] for k in ['id', 'title', 'sha256']})
        row['sha256'] = {}
        for kind, source, ext in [('video', video, 'mp4'), ('poster', d / f'output/{eid}-poster.jpg', 'jpg'), ('transcript', d / f'output/{eid}-transcript.txt', 'txt')]:
            h = digest(source)
            suffix = '-transcript' if kind == 'transcript' else ''
            row[kind] = f'episode-{i:02}{suffix}.{h[:12]}.{ext}'
            row['sha256'][kind] = h
            inputs[row[kind]] = source
        rows.append(row)
    require(len({r['soundtrack']['id'] for r in rows}) == 9, 'Expected all nine selected tracks')
    old_html = (site / 'index.html').read_text()
    old_release = read(site / 'release.json')
    retired_strategy_assets = old_release.get('retiredStrategyAssets') or read(prod.parent / 'archive/strategy-withdrawal/withdrawn.json')['files']
    require(len(retired_strategy_assets) == 33, 'Expected the 33 withdrawn strategy assets')
    marker = '<p class="tip" style="margin:0 0 30px">'
    require(old_html.count(marker) == 1 and old_html.count('</main>') == 1, 'Unrecognized page layout')
    old = [p for p in site.iterdir() if p.is_file() and p.name not in inputs and (re.fullmatch(r'episode-\d+.*\.(mp4|jpg|png|txt|srt)', p.name) or p.name in ['index.html', 'release.json'])]
    # Check every collision before copying or deleting anything.
    for p in old:
        dest = archive / p.name
        require(not dest.exists() or digest(dest) == digest(p), f'Archive collision: {p.name}')
    if args.check_only:
        print('All 16 final exports verified; ready to package. No files changed.')
        return
    archive.mkdir(parents=True, exist_ok=True)
    for p in old:
        dest = archive / p.name
        if not dest.exists():
            shutil.copy2(p, dest)
        require(digest(dest) == digest(p), f'Archive copy mismatch: {p.name}')
    for name, source in inputs.items():
        shutil.copy2(source, site / name)
        require(digest(site / name) == digest(source), f'Release copy mismatch: {name}')
    esc = html.escape
    notice = '''<p class="tip" style="margin:0 0 30px"><strong>Ten rules lessons and six element lessons. Rules v2.7.</strong><br>Four shared actions, nine background songs, and a bonk matrix for every element tier.<br>Each matrix shows what a unit one-shots and what one-shots it.</p>
<nav class="links" aria-label="Choose a learning path" style="justify-content:center;margin:0 0 30px"><a href="#episode-01">🌱 Start here</a><a href="#episode-10">✓ A whole turn</a><a href="#episode-11">🔥 The six elements</a></nav>
<main aria-label="Video lessons">
'''
    articles = []
    for r in rows:
        i = r['number']
        sec = round(r['seconds'])
        duration = f'{sec//60}:{sec%60:02}'
        topics = ''.join(f'<span>{esc(topic)}</span>' for topic in r['topics'])
        updated = r['updatedLabel'].split(' · ', 1)[-1]
        articles.append(f'''<article class="lesson" id="episode-{i:02}">
<div class="heading"><div class="meta"><span class="number">LESSON {i:02}</span><span>{duration} · 1080p</span></div><h2>{esc(r['title'])}</h2></div>
<video controls playsinline preload="none" poster="{r['poster']}" aria-label="Lesson {i}: {esc(r['title'])}"><source src="{r['video']}" type="video/mp4">Your browser cannot play this video. Use the download link below.</video>
<p class="error" hidden>The video could not load. Check your connection, then try the download link below.</p>
<div class="body"><p class="version"><strong>Video version 6 · Rules v2.7</strong><br>{esc(updated)}</p><p>{esc(r['description'])}</p><div class="topics">{topics}</div><p class="fine">Music: {esc(r['soundtrack']['title'])}</p><div class="links"><a href="{r['video']}" download="Muju-Academy-R{i:02}-v6.mp4">↓ Download video</a><a href="{r['transcript']}">Read the lesson</a></div></div>
</article>''')
    final_html = old_html.split(marker)[0] + notice + '\n'.join(articles) + '\n</main>' + old_html.split('</main>', 1)[1]
    require(len(re.findall(r'<article class="lesson"', final_html)) == 16, 'Wrong lesson count')
    redirects_file = root / '_redirects'
    redirects = redirects_file.read_text() if redirects_file.exists() else ''
    replaced_assets = []
    for old_row in old_release['episodes']:
        new_row = next((r for r in rows if r['number'] == old_row['number']), None)
        if new_row:
            for kind in ['video', 'poster', 'transcript']:
                if old_row[kind] != new_row[kind]:
                    old_path = '/muju-academy/' + old_row[kind]
                    target = '/muju-academy/' + new_row[kind]
                    redirects = '\n'.join(line for line in redirects.splitlines() if not line.startswith(old_path + ' '))
                    redirects += f'\n{old_path} {target} 302\n'
                    replaced_assets.append({'from': old_path, 'to': target})
    redirects_file.write_text(redirects.strip() + '\n')
    release = {'release': RELEASE, 'date': datetime.now(ZoneInfo('America/Chicago')).date().isoformat(), 'scope': 'Ten rules lessons and six element lessons', 'retiredEpisodes': list(range(17, 28)), 'retiredStrategyAssets': retired_strategy_assets, 'replacedAssets': replaced_assets, 'episodes': rows}
    (site / 'index.html').write_text(final_html)
    (site / 'release.json').write_text(json.dumps(release, indent=2, ensure_ascii=False) + '\n')
    for p in old:
        if p.name not in ['index.html', 'release.json']:
            p.unlink()
    (archive / 'WITHDRAWN.json').write_text(json.dumps({'files': [p.name for p in old], 'replacement': RELEASE}, indent=2) + '\n')
    print('Packaged 16 verified lessons; nine tracks; archived previous media. Not yet deployed.')


if __name__ == '__main__':
    main()
