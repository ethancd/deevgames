#!/usr/bin/env python3
"""Prepare three user-requested Lightning trials: held charge and an answering hook."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIEF = """An original instrumental strategy-game soundtrack excerpt: chill but energizing melodic electronica, a subtle chiptune influence blended into a warm acoustic/electronic ensemble. 124 BPM, 4/4, clearly D MAJOR, comfortable mid-register lead and smooth treble. Lightning's personality is readiness followed by a precise leap. The listener should remember a tune, not a sound-effect sequence.

Write one singable four-bar question-and-answer hook. A rounded electric synth holds a note with a very gentle increase in harmonic brightness; a short deliberate silence makes its rising fourth or fifth feel like a precise spark jumping a gap. The answering instrument catches that leap and resolves stepwise into the same major-key tune. Make this charged hold, gap and melodic arrival audible in the first complete phrase and recognizable at each return. Let the second half of the hook answer the first with a DIFFERENT rhythm. Use occasional Asus4-to-A-to-D resolution and delayed phrase entries for local harmonic suspense, with the major third clearly established. Keep D major throughout.

The distinctive acoustic voices come from the Swahili coast's taarab plucked-string palette: an UDI, the rounded woody oud-type lute, and a KANUNI, the resonant plucked zither. Feature their actual plucked attacks and natural string decay in the foreground. Give them short idiomatic ornaments and complete melodic replies, passing the hook between them and the electric synth. This is an original contemporary arrangement, not a traditional-song imitation. Warm electric bass and a soft, spacious broken-beat drum groove maintain an easy pulse. A little hand-drum detail can sit inside that groove. Keep the low end light and controlled.

Electrical events happen at musical phrase boundaries: charged stillness, one clean leap, then a linked answering hook. Leave empty space around each event. No continuous crackles, zaps, random blips, constant fast arpeggios, shrill synths, rolling thunder, pounding trailer drums, large drops, bowed lead or wall of legato. No busy strumming or unrelated decorative runs. Entirely instrumental: no voices, speech, humming, chanting or choir."""
FORM = """Create a complete 45-second excerpt. Establish the hook in the first four bars. Repeat it with a fresh answering voice, make one modest harmonic turn around the middle, and return clearly to the original hook in the final ten seconds. The arrangement should develop through timing and melodic conversation, not by accumulating more layers. Keep a consistent listening level and leave the final phrase open for continuation."""
TAKES = [
    ('Before the leap', "The HELD CHARGE is the clearest feature. Let the electric synth sustain the question over a gently suspended chord, with audible but restrained tonal brightening. Make a half-beat space before the UDI catches the rising leap. KANUNI echoes only the last two notes of the answer. The anticipation lasts a musical breath; the release is a satisfying melodic arrival, never a loud impact. Keep the rhythm buoyant and understated."),
    ('Across the gap', "Make CHAIN LIGHTNING'S ANSWERING HOOK the clearest feature. The UDI states the short question, the electric synth holds its last note and jumps a fourth after a deliberate gap, and the KANUNI completes the answer in the same register. Each voice catches the preceding voice's final note so the handoff sounds connected and inevitable. Repeat this same recognizable tune with changed entry timing, not new riffs. Keep the charged hold audible and the plucked-string identities distinct."),
    ('Quiet voltage', "The calmest, most spacious take: KANUNI carries the memorable hook with ringing plucked notes and one restrained grace-note ornament; the UDI gives a rounded low-mid answer. The electric synth holds a gently brightening note behind the phrase, then takes over for one precise rising leap into the next answer. Use only one or two charged leaps per long phrase. A warm restrained bass groove keeps the energy alive during the spaces; avoid bouncy novelty bass or a conspicuous dub backbeat. Make anticipation compelling at a comfortable background level."),
]
bodies = {
    str(i): {'model_id': 'music_v2', 'music_length_ms': 45000,
             'force_instrumental': True, 'store_for_inpainting': True,
             'prompt': '\n\n'.join([BRIEF, variation, FORM])}
    for i, (_, variation) in enumerate(TAKES, 1)
}
card = {
    'id': 'umeme-held-charge', 'title': 'Umeme / Held Charge',
    'direction': 'Lightning · held charge and answering hook', 'bpm': 124,
    'description': 'Three approaches to a charged pause, a precise melodic leap, and an answering hook shared by electric synth, udi and kanuni.',
    'change': 'Make readiness and release part of a memorable major-key phrase, with foreground Swahili-coast plucked strings.',
    'cultural_note': 'Udi and kanuni are documented instruments of the Swahili-coast taarab palette. The electronic arrangement and phrase behavior are original; this is not a claim of traditional repertoire or verified performance technique.',
    'sources': ['https://www2.umbc.edu/eol/7/reed/index.html'],
    'listen_for': 'Does the pause feel charged, does the leap satisfy, and does its answer stick in your head? Can the strings remain distinctive without making the groove busy?',
    'take_names': {str(i): name for i, (name, _) in enumerate(TAKES, 1)},
    'providers': {'elevenlabs': {'url': 'https://api.elevenlabs.io/v1/music', 'take_bodies': bodies}},
}
pack = {
    'status': 'User authorized three new Lightning trials using the held-charge recommendation.',
    'date': '2026-09-12', 'label_offset': 18,
    'execution': {'cards': [card['id']], 'takes_per_card': 3, 'total_audio_requests': 3,
                  'duration_seconds': 45, 'total_requested_minutes': 2.25,
                  'estimated_generation_usd': 0.3375},
    'research_file': 'SOUNDTRACK_ELECTRICITY_RESEARCH-2026-09-12.md',
    'page': {'title': 'Held charge — Muju soundtrack auditions',
             'eyebrow': 'Muju Hono Tanka · Round seven · ElevenLabs',
             'heading': 'Ready. Leap. Answer.',
             'intro': 'Umeme explores a held charge and a linked answering hook. These three briefs keep a clear major key, comfortable treble and a foreground conversation between electric synth and Swahili-coast udi and kanuni.',
             'save_key': 'muju-soundtrack-round-seven-v1'},
    'cards': [card],
}
out = ROOT / 'music-auditions/round-7'
if out.exists() and any(out.glob('*-take-*.json')):
    raise SystemExit('Generation has begun; preserve the existing request packet')
assert len(bodies) == 3 and all(len(b['prompt']) <= 4100 for b in bodies.values())
path = ROOT / 'docs/SOUNDTRACK_ROUND_7_PROMPTS-2026-09-12.json'
path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'prompt_packet': str(path), 'requests': 3, 'minutes': 2.25,
                  'estimated_usd': 0.3375, 'prompt_lengths': [len(b['prompt']) for b in bodies.values()]}))
