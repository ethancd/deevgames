#!/usr/bin/env python3
"""Prepare nine element revisions from the user's round-three feedback. No API calls."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT="""Compose an entirely new 45-second instrumental for repeated strategy-game listening. Keep one recognizable melodic idea at the center. Give it a deliberate development and a meaningful return. Comfortable treble, rounded transients and a clear mix. Small musical swells are welcome; no sudden loud impacts or huge drop. Entirely instrumental: no singing, speech, chanting, humming, choir or vocal samples. No exposed chiptune lead, random blipping or cartoon mallet runs. Leave the last phrase open. Follow this piece's particular pace and mood throughout."""
SONGS=[
    {
        'id':'umeme-plucked','title':'Umeme / Sideways Spark','direction':'Lightning · revised','bpm':122,
        'description':'Crisp pizzicato and plucked strings in a clear major key; quick, direct and bright.',
        'change':'Replace bowed violin with plucked attacks; remove modal ambiguity and minor-key detours.',
        'cultural_note':'Retains the plucked udi/kanuni side of the researched Swahili-coast taarab palette. Pizzicato articulation and the simple major-key harmony are deliberate revisions requested by the user.',
        'sources':['https://www2.umbc.edu/eol/7/reed/index.html'],
        'brief':"122 BPM, straight 4/4, unambiguously D MAJOR. Crisp pizzicato chamber electronica: every acoustic string note is plucked, with a clean attack and a short natural decay. Dry pizzicato strings trade a cheerful, very singable four-note hook with an intimate udi-like plucked lute; a few restrained kanuni-like zither replies add sparkle. The major third should be clearly audible in the melody. Use a simple I-IV-V-I harmonic direction and a strong tonic resolution. A rounded electric bass and light precise drums give the hook forward motion. Electricity feels quick, lucid and optimistic. Keep the melody straightforward and repeatable. No bowed violin, sustained string lead, legato orchestral strings, minor section, modal mixture, Mixolydian color, flattened seventh or chromatic wandering. The plucks carry the tune, not a percussion solo.",
        'form':"State the complete plucked hook in the first six seconds. Around 12 seconds add a compact answering phrase. Around 24 seconds move clearly through the subdominant and dominant, staying in the same major key. By 33 seconds bring back the opening hook with a brighter octave reply. Keep a nimble pulse without becoming frantic.",
        'takes':[
            ('Clean contact','Put the dry pizzicato ensemble clearly in front, with the plucked lute answering only at phrase ends. Keep the bass line simple and the accents crisp. Give the listener a single tune they could hum after one hearing.'),
            ('A bright reply','Let the udi-like plucked lute state the major-key tune, and use short pizzicato strings as the answer. Make the bass a little more playful while leaving the melody rhythm simple. Stay clearly major even at the harmonic turn.'),
            ('Snap into place','Use tightly articulated pizzicato question-and-answer phrases over a gently propulsive bass-and-kick pair. Add a short kanuni-like reply after every second complete hook. Keep each note separated and the final return satisfyingly direct.')
        ]
    },
    {
        'id':'tanka-pressure','title':'Tanka / Weight Without Hurry','direction':'Metal · revised','bpm':80,
        'description':'Slow, spare and weighty: long notes, plain pulse and pressure that gathers gradually.',
        'change':'Reduce 108 to 80 BPM; remove bouncing bass, anticipations, swing, 3-3-2 accents and busy subdivisions. Build pressure through long notes and controlled swells.',
        'cultural_note':'Retains an original descending melodic contour informed by broader Plains context and a grounded drum anchor. The slow pace, long-note tension and electronic timbres are new arrangement choices, without ceremonial quotation or imitated chant.',
        'sources':['https://folkways.si.edu/lakota-drumming/american-indian/music/video/smithsonian','https://plainshumanities.unl.edu/encyclopedia/doc/egp.mus.034.html'],
        'brief':"80 BPM, plain straight 4/4. Slow, restrained electronic music about weight and stored force. Begin with SPACE: one low rounded drum strike, a deep sustained bass note and a single long metallic tone. Keep the first ten seconds sparse. The melody is a broad original descending shape in HALF NOTES and WHOLE NOTES, with a repeated low landing and generous rests. Put it on a low mellow synth with dark bronze-like resonance. Bass notes last a whole bar or longer. Drum accents belong simply on beats one and three, or only on beat one; leave silence between them. Build dynamic tension through a slowly swelling sustained interval, a suspended chord held over a bass pedal, and a delayed resolution. Pressure grows without faster notes. No eighth-note or sixteenth-note patterns, running arpeggios, hi-hat grid, syncopated bass pickup, swing, bounce, galloping rhythm or 3-3-2/tresillo accents. No rock guitars, trailer drums or ceremonial-song imitation. A clear tonal anchor remains under the tension.",
        'form':"0-10 seconds: only the sparse anchor and the first long melodic notes. 10-23 seconds: reveal the descending phrase slowly, retaining substantial rests. 23-34 seconds: deepen a held suspension and swell the resonance gently, keeping the same sparse rhythm. 34-45 seconds: let the suspension settle partway and return to the broad low melody. Do not add a fast groove or fill at the end.",
        'takes':[
            ('Held weight','Make the principal tension a long upper note held against a low pedal. Let it resolve by a single step only after several seconds. The melody stays broad, the percussion stays minimal, and the gaps are an essential part of the music.'),
            ('Space between strikes','Use one muted bronze-like strike at the beginning of every two-bar phrase and let its resonance breathe. A very low synth answers in long notes. Let gradual changes of harmony and loudness create the interest. No extra percussion enters as the piece develops.'),
            ('Temper line','Present the descending melody on a soft baritone synth above sustained bass. Add one slowly swelling upper harmony in the middle; release it into a lower consonant interval. Keep the drum pulse plain and widely spaced. Make the return feel heavier through voicing, not rhythmic activity.')
        ]
    },
    {
        'id':'straumr-deep','title':'Straumr / Under the Current','direction':'Water · revised','bpm':96,
        'description':'Dark, cool and imposing: deep bass, hollow resonators and a slow minor-key current.',
        'change':'Replace the pastoral acoustic lead with cold electronic resonators and a low minor-key hook. Remove the cheerful lilt and open-major lift.',
        'cultural_note':'The researched Norwegian sympathetic-string resonance is retained as an abstract tuned-resonator design, while the audible fiddle and folk-dance idiom are removed to follow the user. The darker minor-key writing is an original compositional choice.',
        'sources':['https://folkways-media.si.edu/docs/folkways/artwork/FW04008.pdf'],
        'brief':"96 BPM, 4/4, E MINOR. Dark, cool, imposing electronic music with the sense of an immense current moving below a cold surface. A low hollow resonator synth carries a memorable descending minor-key hook: hold the opening tone, move through the minor third, and land on the low tonic. Clear melodic identity, restrained and unsmiling. Deep controlled sub-bass, a quiet deliberate kick pulse, sparse dry clicks and slowly evolving upper overtones. Tuned sympathetic resonances ring after the melody notes, like a second layer vibrating in response; keep them cool and shadowed. Long connected bass notes pull the music forward. Maintain the minor-key tension and low center of gravity. No acoustic lead instruments, jaunty folk tune, dance lilt, cheerful major-key lift, sparkly bells, pastoral warmth, bright plucked ostinato, ocean sound effects or epic chanting. Intimidation comes from depth, scale and patience rather than loudness or horror stings.",
        'form':"Establish the dark low hook and deep pulse within the first eight seconds. Around 14 seconds add a restrained high resonant echo of the hook. Around 24 seconds lower the bass emphasis and deepen the harmonic suspension, keeping the melody recognizable. By 34 seconds return with a slightly wider register and heavier sense of depth. Preserve the cool minor mood through the final phrase.",
        'takes':[
            ('Below the light','Put the hollow low resonator hook in front and let a cold upper partial ring after each long melody note. Use an even restrained pulse and sustained sub-bass. Make the spaces feel deep without losing the tune.'),
            ('Cold mass','Make the bass and the low melodic answer especially present and controlled. A barely audible upper sustained tone adds pressure; the melody stays in the lower middle register. Keep the rhythm sober and the harmony unresolved until a quiet return to the minor tonic.'),
            ('Undertow','Give the deep pulse a little more forward insistence while keeping the surface sparse. A short cold echo answers only the end of the complete descending hook. Gradually open the upper resonances in the middle, then return to the dark rounded tone. No cheerful lift or dance break.')
        ]
    }
]
cards=[]
for song in SONGS:
    bodies={str(i):{'model_id':'music_v2','music_length_ms':45000,'force_instrumental':True,'prompt':'\n\n'.join([song['brief'],song['form'],variation,OUTPUT])} for i,(_,variation) in enumerate(song['takes'],1)}
    cards.append({k:song[k] for k in ('id','title','direction','bpm','description','change','cultural_note','sources')} | {
        'listen_for':song['change'], 'take_names':{str(i):name for i,(name,_) in enumerate(song['takes'],1)},
        'providers':{'elevenlabs':{'url':'https://api.elevenlabs.io/v1/music','take_bodies':bodies}}
    })
pack={
    'status':'Prepared for the user-authorized redirect and rerun of Lightning, Metal and Water.',
    'date':'2026-09-12','label_offset':8,
    'execution':{'cards':[s['id'] for s in SONGS],'takes_per_card':3,'total_audio_requests':9,'duration_seconds':45,'total_requested_minutes':6.75,'estimated_generation_usd':1.0125},
    'feedback_file':'SOUNDTRACK_ROUND_3_FEEDBACK-2026-09-12.json',
    'page':{'title':'Element revisions — Muju soundtrack auditions','eyebrow':'Muju Hono Tanka · Round four · ElevenLabs','heading':'Bright spark. Held weight. Cold depth.','intro':'Lightning goes plucked and major. Metal slows down and leaves space. Water turns dark and imposing. Three new takes of each.','save_key':'muju-soundtrack-round-four-v1'},
    'cards':cards
}
path=ROOT/'docs/SOUNDTRACK_ROUND_4_PROMPTS-2026-09-12.json'
out=ROOT/'music-auditions/round-4'
if out.exists() and any(out.glob('*-take-*.json')):
    raise SystemExit('Generation has begun; preserve the existing request packet')
assert len(cards)==3 and all(len(c['providers']['elevenlabs']['take_bodies'])==3 for c in cards)
assert all(len(b['prompt'])<=4100 for c in cards for b in c['providers']['elevenlabs']['take_bodies'].values())
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'prompt_packet':str(path),'requests':9,'minutes':6.75,'estimated_usd':1.0125}))
