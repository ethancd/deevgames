#!/usr/bin/env python3
"""Write the five-song, fifteen-take creative brief. Does not call any API."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMON = """Compose an original 45-second excerpt for a thoughtful, playful strategy game and family listening. An intimate electronic ensemble: warm, tuneful, quietly exciting. Let a memorable melody breathe in complete phrases. Rounded bass and connected harmonic movement create forward motion. Instruments listen and answer each other. Percussion is soft but purposeful. Keep the upper frequencies comfortable and the mix clear. Tiny smooth digital colors may blend into the ensemble. No exposed 8-bit lead, continuous arpeggio, cartoon mallet solo, vinyl crackle, piercing cymbals, trailer crescendo, or EDM drop. Musical development matters more than extra decoration. End with the groove still moving, ready for another phrase. Compose entirely new music."""
DEVELOPMENT = """Shape the excerpt: begin with a distinctive musical idea and a quiet pulse; bass is present by 5 seconds. Around 12 seconds, introduce a complementary phrase. Around 24 seconds, move the harmony somewhere new. Around 33 seconds, return to the main idea with one earned addition. Build through phrasing, bass anticipation and harmonic direction while keeping the volume steady."""
SONGS = [
    {
        'id':'muju-field', 'title':'Muju / A Field of Small Decisions', 'role':'Plant theme', 'bpm':108,
        'description':'Interwoven charango and harp phrases grow into a generous, rolling groove.',
        'brief':"108 BPM, duple meter. A modern electronic Plant theme informed by Quechua-region Andean music. A lightly articulated huayno long-short-short accent lives inside a supple bass-and-drum groove. Warm charango-like picked strings and a lower harp-like voice alternate parts of one melody, as if each musician holds half the idea. A three-note ascending phrase leaves a breath; a slower descending answer completes it. Restrained acoustic resonance, a warm sustained chord bed and brushed drum texture. The feeling is seeds becoming a busy garden. Let the rhythm be rooted and buoyant; avoid a panpipe tourism montage. This is an original contemporary composition, not a quotation of a traditional tune.",
        'takes':[
            ('Roots and replies', 'Make the interwoven plucked melody the main identity. Start with its simplest call and reply; quietly bring in a second bass phrase as the harmony turns. Keep the strings warm and natural.'),
            ('Roots in motion', 'Give the bass a stronger melodic role and a gently anticipating pickup at each phrase boundary. The charango answers rather than strumming constantly. One softly articulated drum fill introduces the harmonic turn. More physical forward motion, still relaxed.'),
            ('Canopy opening', 'Begin intimate and leave more space between the two plucked voices. At the harmonic turn, add a sustained low string countermelody and widen the chord voicings. Finish with both melodies comfortably interlocking; lift comes from harmony rather than brightness.')
        ],
        'source':'https://clas.osu.edu/andean-music-teacher-guide'
    },
    {
        'id':'golge-square', 'title':'Gölge / One Square Out of Sight', 'role':'Shadow theme', 'bpm':112,
        'description':'A sly bağlama melody, deep rounded bass and a quietly skipping rhythm.',
        'brief':"112 BPM, steady 4/4. An elegant Turkish bağlama-like plucked melody inhabits a warm, spacious electronic groove. A repeated middle note, a quick lower-neighbor turn, then an upward fourth and a breath: make this an identifiable recurring hook. Natural string resonance and tasteful finger ornaments, with long melodic answers rather than constant runs. A low soft clarinet-like voice answers occasionally. Supple deep bass, hushed hand-drum accents and a gently skipping drum pattern. Echo appears only at phrase endings. Friendly mischief and patient intelligence. Keep the tonal world intriguing without horror, snake-charmer caricature, cinematic desert imagery or aggressive suspense. Original contemporary music; do not quote existing folk melodies or claim an authentic makam performance.",
        'takes':[
            ('A quiet sidestep', 'Keep the groove understated and let the ornamented plucked hook speak clearly. The lower clarinet-like answer arrives slightly late. A subtle change of bass note reframes the returning melody halfway through.'),
            ('Velvet mischief', 'Use a slightly more dancing bass line and light two-step-style drum placement within 4/4. Keep the bağlama phrase long enough to sing internally. Add momentum between phrases, leaving the tune itself spacious.'),
            ('Behind the phrase', 'Begin with the low answering voice and reveal the bağlama hook a few seconds later. In the middle, let those two melodies overlap in simple counterpoint. Make the last return feel inevitable and satisfying, with no rise in percussion density.')
        ],
        'source':'https://www.ktb.gov.tr/EN-98662/baglama.html'
    },
    {
        'id':'open-room', 'title':'Open Room, Lantern On', 'role':'Lobby and matchmaking', 'bpm':116,
        'description':'A welcoming bass groove with muted guitar, electric piano and little conversational surprises.',
        'brief':"116 BPM, 4/4. Welcoming melodic electronica with a gently elastic, almost disco-like electric bass line. Muted clean guitar and warm electric piano trade a falling three-note question and a rising answer. A very soft rounded analog synth holds the answer longer on each return. Dry understated drums, warm kick, quiet rim, tiny closed-hat accents. Human timing, clear melodic identity and tasteful suspended chords resolving into warm major-sixth colors. The room feels occupied by friends; there is a little anticipation in every phrase. Lighthearted without novelty sounds. The bass should be fun to follow even when the listener ignores the lead.",
        'takes':[
            ('Pull up a chair', 'Start with bass and the muted-guitar question; let piano complete the answer. Gradually connect the two into one flowing hook. At the middle harmonic turn, one held synth note makes the room feel wider.'),
            ('Someone joins', 'Begin with a little more rhythmic bounce. After the first complete melody, a second guitar register joins in complementary rhythm. Use a short bass pickup into each new chord rather than more hi-hats. Make the final return feel companionable and energized.'),
            ('The good seat', 'Give the piano a slightly more lyrical role and the guitar a patient answering role. Move to a wistful minor chord briefly, then return to the opening warmth. Keep the rhythm springy and unhurried; one simple melody should carry the whole excerpt.')
        ]
    },
    {
        'id':'unequal-routes', 'title':'Unequal Routes', 'role':'Main match theme', 'bpm':120,
        'description':'Two melodies take different paths into the same cadence, carried by a flowing bass line.',
        'brief':"120 BPM, 4/4. Melodic electronic chamber pop over a softly syncopated broken beat. A mellow sustained synth sings a short rising triad; a clean electric guitar takes a longer descending route to the same home note. The two original melodies must each feel complete and become more satisfying together. Warm piano voicings, a singing electric bass, low drum transients and occasional dry rim accents. The harmony travels in connected eight-bar phrases rather than sitting on one chord. Clear propulsion, thoughtful confidence, the pleasure of seeing a plan come together. Leave room between lead phrases. Digital sound is a subtle texture, not a chiptune solo.",
        'takes':[
            ('Two paths home', 'Introduce one melody clearly, then the other; combine them on the last return. Keep the bass connected and the drums understated. The moment both melodies fit should supply the payoff.'),
            ('The move arrives', 'Make the bass and kick work as a quietly driving pair with a pickup into each phrase. Use a more active but soft broken beat. Keep the melody broad and singable while the lower instruments generate momentum.'),
            ('A wider board', 'Use a longer-breathed synth melody and guitar responses that resolve a little later. Let one unexpected but warm chord open the middle section, then return with both lines in counterpoint. The emotional lift should be harmonic and melodic, not louder drums.')
        ]
    },
    {
        'id':'before-dawn', 'title':'Another Game Before Dawn', 'role':'Rematch and album closer', 'bpm':104,
        'description':'A hopeful, slightly wistful closer; two instrumentals and one brief vocal experiment.',
        'brief':"104 BPM, 4/4. Warm melodic electronica for the end of a good evening. Soft felt piano states three descending notes and lets the final note hang; a mellow sustained analog synth answers upward into a hopeful resolution. Rounded electric bass, brushed drums, a small clean-guitar counterline and spacious chord voicings. A wistful suspended harmony gradually finds a warmer home. Keep a living pulse throughout and avoid sleepy ambient drift. The feeling is companionship and wanting one more game, with a small smile rather than a triumphant finale. A recognizable tune should remain after the sound stops.",
        'takes':[
            ('One more?', 'An entirely instrumental version. Start with the piano question over a moving bass, then let the synth answer. At the harmonic turn, the guitar supplies a new counterline that stays for the last return. Warmth with a little ache.'),
            ('The sky lightens', 'An entirely instrumental version with slightly stronger bass momentum. Let the harmony climb gradually through the middle and return to the opening melody in a more open register. A restrained string layer enters late and then leaves space again.'),
            ('Leave a light', 'A mostly instrumental version with one brief intimate sung couplet around seconds 24–32. A single quiet, clear, natural voice sings only these exact English words once: "Leave a light beside the board. There\'s another morning still." The surrounding music is instrumental. No other lyrics, repeats, speech, humming, ad-libs, vocal chops, choir or backing vocals. Return to the instrumental melody immediately after the couplet; let the groove continue. The vocal is a small human moment inside the arrangement.')
        ]
    }
]

cards=[]
for song in SONGS:
    bodies={}
    for take,(name,variation) in enumerate(song['takes'],1):
        instrumental=not(song['id']=='before-dawn' and take==3)
        prompt='\n\n'.join([COMMON, song['brief'], DEVELOPMENT, variation])
        if instrumental:
            prompt += '\n\nEntirely instrumental. No vocals, speech, chants, humming or vocal samples.'
        bodies[str(take)]={'model_id':'music_v2','music_length_ms':45000,'force_instrumental':instrumental,'prompt':prompt}
    cards.append({
        'id':song['id'],'title':song['title'],'direction':song['role'],'bpm':song['bpm'],
        'description':song['description'],'listen_for':'Does the tune stay memorable while the arrangement develops real momentum?',
        'take_names':{str(i):t[0] for i,t in enumerate(song['takes'],1)},
        'cultural_source':song.get('source'),
        'providers':{'elevenlabs':{'url':'https://api.elevenlabs.io/v1/music','take_bodies':bodies}}
    })
pack={
    'status':'Prepared for the user-authorized second batch: five new songs, three takes each, ElevenLabs only.',
    'date':'2026-09-12','execution':{'cards':[s['id'] for s in SONGS],'takes_per_card':3,'total_audio_requests':15,'duration_seconds':45,'total_requested_minutes':11.25,'estimated_generation_usd':1.6875},
    'creative_basis':{'keep':['Take E warmth and calm','Take C gradual layering'],'change':['More connected bass and harmonic movement','Less conspicuous chip timbre','No decorative mallet noodling'],'provider_decision':'User rejected Lyria and selected ElevenLabs.'},
    'sources':['https://elevenlabs.io/docs/api-reference/music/compose','https://elevenlabs.io/pricing/api','https://clas.osu.edu/andean-music-teacher-guide','https://www.ktb.gov.tr/EN-98662/baglama.html'],
    'cards':cards
}
path=ROOT/'docs'/'SOUNDTRACK_ROUND_2_PROMPTS-2026-09-12.json'
if (ROOT/'music-auditions/round-2').exists() and any((ROOT/'music-auditions/round-2').glob('*-take-*.json')):
    raise SystemExit('Generation has begun; do not overwrite the request packet')
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'prompt_packet':str(path),'requests':15,'minutes':11.25,'estimated_usd':1.6875}))
