#!/usr/bin/env python3
"""Prepare nine element trials informed by the user's round-two notes. No API calls."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMON = """Compose a new 45-second instrumental excerpt for a playful, thoughtful strategy game and family listening. An intimate electronic ensemble with one unmistakable, singable lead melody. Establish the complete hook within the first eight seconds, repeat it with a small variation, then give it a satisfying return. Keep a clear tonal center and connected consonant harmony. Let bass movement and elastic rhythmic placement create momentum. Warm low end, soft purposeful drums, comfortable treble, natural acoustic detail and restrained smooth synth colors. The melody carries the track; every supporting part should help it land. No exposed chiptune lead, random blips, cartoon xylophone runs, busy arpeggio bed, atonal wandering, vinyl crackle, dramatic drop or piercing percussion. Entirely instrumental: no voice, lyrics, chanting, humming, choir or vocal samples. Compose original music without quoting an existing tune."""
FORM = """Begin with both the musical identity and a light moving pulse. By 12 seconds add a useful answering phrase while keeping the main hook recognizable. Around 23 seconds change the bass or harmony to deepen the idea. Around 32 seconds return to the hook with one complementary layer. Stay focused, gently energized and spacious. Keep the perceived volume steady and leave the final phrase open with the groove continuing."""
SONGS = [
    {
        'id':'umeme-spark','title':'Umeme / Sideways Spark','direction':'Lightning theme','bpm':122,
        'description':'A leaping string hook, buoyant bass and quick replies: playful electricity.',
        'sources':['https://www2.umbc.edu/eol/7/reed/index.html'],
        'brief':"122 BPM, 4/4. Lightning is nimble, spring-loaded and mischievous. Connect the game's Swahili naming to the coastal taarab sound of Zanzibar: a small violin-and-udi-like plucked-string conversation, restrained kanuni-like resonance and light hand-drum detail inside a modern rounded electronic groove. Write a short rising melodic leap, a gently ornamented held note, then a nimble descending answer that lands securely on the home note. The hook should feel one step ahead and be easy to sing internally. Let the bass spring forward at phrase boundaries. The lead is tuneful and lyrical rather than a flashy solo. Use the intimate dance energy as an influence, not a reconstruction or a borrowed melody. Keep string attacks and ornaments clear but soft.",
        'takes':[
            ('A spark with a grin','Give the plucked-string question and violin answer equal space. A quick two-note bass pickup makes each returning hook feel buoyant. Small hand-drum replies supply the wink. The main tune should be instantly identifiable and stay at the front.'),
            ('One beat ahead','Feature the violin melody over a more syncopated rounded bass line. A muted udi-like answer fills only the spaces between the held melody notes. Anticipate one chord change, then land securely on the next downbeat. Create playful tension and release without dissonance or louder drums.'),
            ('The room lights up','Keep the rising-leap hook on the plucked voice, then let a second bowed voice join it in a simple consonant answer. At the middle turn briefly move to the relative minor; return to the opening warmth with the bass more connected. Make the last phrase feel lively and complete, never frantic.')
        ]
    },
    {
        'id':'tanka-weight','title':'Tanka / Weight Without Hurry','direction':'Metal theme','bpm':108,
        'description':'A broad descending tune, grounded drum pulse and warm bronze-colored resonance.',
        'sources':['https://folkways.si.edu/lakota-drumming/american-indian/music/video/smithsonian','https://plainshumanities.unl.edu/encyclopedia/doc/egp.mus.034.html'],
        'brief':"108 BPM, 4/4. Metal feels substantial, steady and quietly generous, with enough rhythmic elasticity to move. The game's naming has a Lakota connection. As a modest contemporary instrumental interpretation, use an original melody with a high opening, two descending terraces and a repeated low home-note landing, drawing on a broader Northern Plains melodic contour. A grounded rounded drum pulse anchors the ensemble. Carry the clear, singable tune on a mellow sustained synth blended with low bowed strings. Warm bronze-like struck resonances answer at phrase endings with long soft decays. A lightly syncopated electric bass keeps the weight mobile. The metallic color is a small accent, not a mallet solo. Wide consonant chords, an audible home key and satisfying melodic resolution. No ceremonial-song quotation, imitation chant, war-drum soundtrack or generic flute meditation. This is new electronic instrumental music.",
        'takes':[
            ('A sure landing','State the descending melody clearly over a sparse rounded pulse and a moving electric bass. Let the repeated low ending become a reassuring hook. Add just one bronze-like resonance at the end of each complete phrase. Strength comes from a memorable tune arriving securely.'),
            ('Heavy feet, light step','Give the bass a gently anticipating pickup and the drum groove a little soft swing, while keeping the broad descending lead phrase intact. A warm plucked lower counterline joins after the first melody. Make the weight feel mobile and good-humored, never lumbering.'),
            ('Warm alloy','Start with the main descending tune in the middle register and a single lower answering voice. At the middle harmonic change, open the voicings and add a sustained upper harmony. Bring the original tune back with a richer bass answer and one ringing bronze accent. Keep the hook prominent throughout; avoid ambient drift.')
        ]
    },
    {
        'id':'straumr-current','title':'Straumr / Under the Current','direction':'Water theme','bpm':112,
        'description':'A circling fiddle melody and ringing open strings over a flowing bass groove.',
        'sources':['https://folkways-media.si.edu/docs/folkways/artwork/FW04008.pdf'],
        'brief':"112 BPM, 4/4. Water is fluid, clear and quietly unstoppable. For the game's Norse-derived naming, draw on the later Norwegian Hardanger fiddle's ringing open strings and sympathetic resonance. This is a modern Norwegian instrumental influence, not Viking-era reconstruction. Let a soft bowed fiddle-like lead sing a circling phrase around an open fifth: rise by a step, arc upward, descend into a gentle home-note landing. Repeat the memorable whole phrase rather than noodling. A warm fretless-style bass flows in connected lines beneath it. A very soft resonant synth extends the acoustic sustain; quiet brushed broken-beat drums keep a living pulse. Depth comes from a lower countermelody and gently changing harmony, with clear melody and natural movement. No ocean sound effects, storm trailer, chanting choir, sleepy pad wash or bright bell ostinato.",
        'takes':[
            ('The river remembers','Feature the complete circling fiddle hook immediately, with a low open-string drone and a lightly rolling bass. Repeat it recognizably before adding an answering bowed phrase. The gentle sway and sustained resonance should feel fluid while the tune stays easy to remember.'),
            ('A deeper channel','Keep the main fiddle tune in a slightly lower register and give the fretless-style bass a more expressive answering line. Move through a wistful but clearly tonal middle chord, then return to the hook with a soft upper harmony. Maintain real forward motion rather than becoming ambient.'),
            ('Eddies in sunlight','Use a more buoyant, lightly skipping drum placement beneath the same circling melodic idea. Short plucked-string replies anticipate the next bowed phrase. Let the harmony open toward the final return and the bass connect the whole arc. Clear, flowing and playful, with the treble still soft.')
        ]
    }
]
cards=[]
for song in SONGS:
    bodies={str(i):{'model_id':'music_v2','music_length_ms':45000,'force_instrumental':True,'prompt':'\n\n'.join([COMMON,song['brief'],FORM,variation])} for i,(_,variation) in enumerate(song['takes'],1)}
    cards.append({k:song[k] for k in ('id','title','direction','bpm','description','sources')} | {
        'listen_for':'Can you remember the melody, feel the element, and leave the groove on for another match?',
        'take_names':{str(i):name for i,(name,_) in enumerate(song['takes'],1)},
        'providers':{'elevenlabs':{'url':'https://api.elevenlabs.io/v1/music','take_bodies':bodies}}
    })
pack={
    'status':'Prepared for nine user-authorized ElevenLabs trials of the remaining three element themes.',
    'date':'2026-09-12','label_offset':5,
    'execution':{'cards':[s['id'] for s in SONGS],'takes_per_card':3,'total_audio_requests':9,'duration_seconds':45,'total_requested_minutes':6.75,'estimated_generation_usd':1.0125},
    'feedback_file':'SOUNDTRACK_ROUND_2_FEEDBACK-2026-09-12.json',
    'page':{'title':'Lightning, Metal and Water — Muju soundtrack auditions','eyebrow':'Muju Hono Tanka · Round three · ElevenLabs','heading':'Lightning, Metal and Water','intro':'Three arrangements for each remaining element. Clear melodies, distinct personalities and a groove worth keeping.','save_key':'muju-soundtrack-round-three-v1'},
    'cards':cards
}
path=ROOT/'docs/SOUNDTRACK_ROUND_3_PROMPTS-2026-09-12.json'
out=ROOT/'music-auditions/round-3'
if out.exists() and any(out.glob('*-take-*.json')):
    raise SystemExit('Generation has begun; preserve the existing request packet')
assert len(cards)==3 and all(len(c['providers']['elevenlabs']['take_bodies'])==3 for c in cards)
assert all(len(b['prompt'])<=4100 for c in cards for b in c['providers']['elevenlabs']['take_bodies'].values())
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'prompt_packet':str(path),'requests':9,'minutes':6.75,'estimated_usd':1.0125}))
