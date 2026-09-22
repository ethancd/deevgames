#!/usr/bin/env python3
"""Prepare six Lightning/Water trials, leaving the accepted Metal take intact."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT="""Create an entirely new 45-second instrumental excerpt for repeated strategy-game listening. A memorable complete melody is the main event. Develop it with purpose and make its return recognizable. Controlled low end, comfortable treble and a clear mix. Entirely instrumental: no singing, speech, chanting, humming, choir or vocal samples. No novelty blips, cartoon mallet runs, huge drops or sudden loud impacts. Follow this piece's own rhythmic instructions throughout and leave the final melodic phrase open."""
SONGS=[
    {
        'id':'umeme-charge','title':'Umeme / Sideways Spark','direction':'Lightning · rhythmic charge','bpm':126,
        'description':'Major-key plucks meet an electric synth edge, with rhythmic surprises that keep the hook clear.',
        'change':'Keep the fun major-key plucks; add distinctly electric timbre and variation between rhythmic phrases.',
        'cultural_note':'Keeps the researched udi/kanuni plucked-string palette as a quieter acoustic component. The electronic articulation and rhythm are original revisions based on the user feedback.',
        'sources':['https://www2.umbc.edu/eol/7/reed/index.html'],
        'brief':"126 BPM, 4/4, clearly D MAJOR. Energetic melodic electronica with an unmistakable electric charge. A crisp pizzicato and plucked-lute hook is tightly doubled by a mid-register rubbery FM synth with a little controlled harmonic bite. Let the electric synth be an audible musical voice, not merely a pad. Its notes have fast attacks and tiny expressive filter snaps; keep the upper edge smooth. A restrained udi-like pluck and occasional kanuni-like response supply acoustic detail. Write one very singable major-key hook with a rising leap and a clear tonic answer. Give its two-bar question and two-bar answer DIFFERENT rhythms: a short syncopated burst, a deliberate gap, then a longer resolving note. The bass answers the gaps. Vary kick and soft snare placement at phrase boundaries; a brief pickup leads into each return. Strong I-IV-V-I harmonic direction, clear major third, no minor detour or modal ambiguity. No bowed strings, orchestral legato lead, exposed retro square-wave solo, constant sixteenth-note arpeggio or piercing hi-hat grid. The excitement comes from charged tone and rhythmic conversation.",
        'form':"State the electric-pluck hook immediately. In the next phrase repeat its pitch shape with a fresh syncopated entry. Around 16 seconds briefly leave a gap in the drums while the lead completes the answer, then let bass and kick catch it. Around 26 seconds move through a clear major-key harmonic turn. By 34 seconds return to the full hook with one new rhythmic reply. Keep the tune intact rather than adding unrelated riffs.",
        'takes':[
            ('Live wire','Let the rubbery FM voice and pizzicato sound fused into one bright electric-pluck instrument. Make the two-bar answer land later than the question, then resolve confidently. Use brief silences to make the next attack feel charged.'),
            ('Charge and release','Put a playful electric bass response between the short major-key lead phrases. Alternate a more active question with a held answering note. One short drum pickup every four bars renews the momentum; keep percussion soft and the melody easy to remember.'),
            ('Jump the gap','Use an expressive rounded analog-synth reply to the plucked acoustic question. Twice in the excerpt, let a half-beat rest make the returning hook snap into focus. Vary the lead entry and the bass answer without changing the clear major mood or becoming random.')
        ]
    },
    {
        'id':'straumr-arco','title':'Straumr / Under the Current','direction':'Water · sustained throughflow','bpm':96,
        'description':'Dark legato cello and bowed bass carry a connected melody, with no ticking beat or fast-note layer.',
        'change':'Replace late clicks and sixteenth-note activity with a coherent sustained bowed-string melody and continuous harmonic movement.',
        'cultural_note':'Retains the previously researched sympathetic-resonance idea as a subtle electronic response. Cello and bowed double bass are the user-requested revision; they are not presented as specifically Norse traditional instrumentation.',
        'sources':['https://folkways-media.si.edu/docs/folkways/artwork/FW04008.pdf'],
        'brief':"A dark, cool, imposing DRUMLESS chamber-electronic instrumental in E MINOR. Internal phrase pace about 96 BPM in flowing 4/4, never articulated by a click track. A rich low cello played ARCO, LEGATO and SOSTENUTO sings a coherent memorable melody over long bowed double-bass tones. Establish a four-note minor-key idea with a held opening, a rise to the minor third, a descending step and a return home. Continue it into a longer answering phrase that rises once and settles slowly. Long connected bow strokes, gentle natural swells and notes tied across the barline create continuous throughflow. A low cold resonator synth quietly prolongs selected string tones; it stays behind the acoustic melody. A clearly related bass line changes slowly under the phrase. It should feel like a strong current carrying great depth, more continuously moving than a static heavy drone. Keep the melody present and recognizable in every section. No percussion anywhere: no kick, snare, hi-hat, shaker, dry clicks, rim ticks, metronome or beat entering halfway through. No fast-note ostinato, sixteenth-note sequence, repeated-note doot pattern, rhythmic delay or pulsing sidechain. No high fiddle, pastoral dance, cheerful major lift, busy pizzicato accompaniment or orchestral trailer swell. Sustain the cold minor-key character through the ending.",
        'form':"0-12 seconds: state the complete low bowed melody and its connected answer over an already moving sustained bass. 12-24 seconds: repeat the recognizable melody as the bass follows a closely related harmonic path. 24-34 seconds: let one harmony deepen and the cello extend its answering line, retaining the same sustained texture. 34-45 seconds: return to the original melodic phrase with a gentle low counterline. Do not introduce any clock, beat, arpeggio or fast decorative pattern at any time.",
        'takes':[
            ('One continuous current','Keep the cello in front with long flowing bow changes and a low bowed-bass foundation. Let its opening phrase be instantly identifiable and its continuation feel inevitable. Use sustained tone and harmonic direction for motion; preserve the drumless texture to the end.'),
            ('The dark line','Give a solo bowed double bass the main melody in its singing upper register, with a restrained low cello answering in long notes. Keep the clear four-note motif recognizable as the instruments trade complete phrases. The quiet synth resonance only deepens the tail of held notes.'),
            ('Under one breath','Let two low cello voices overlap in a simple connected call and answer while a bowed bass moves slowly below. The second voice should enter before the first has fully released, so the line never feels interrupted. Repeat the main melody clearly at the last return. No added rhythmic layer.')
        ]
    }
]
cards=[]
for song in SONGS:
    bodies={str(i):{'model_id':'music_v2','music_length_ms':45000,'force_instrumental':True,'prompt':'\n\n'.join([song['brief'],song['form'],variation,OUTPUT])} for i,(_,variation) in enumerate(song['takes'],1)}
    cards.append({k:song[k] for k in ('id','title','direction','bpm','description','change','cultural_note','sources')} | {
        'listen_for':song['change'],'take_names':{str(i):name for i,(name,_) in enumerate(song['takes'],1)},
        'providers':{'elevenlabs':{'url':'https://api.elevenlabs.io/v1/music','take_bodies':bodies}}
    })
pack={
    'status':'Prepared for the user-authorized next round of Lightning and Water; Metal 10A is accepted.',
    'date':'2026-09-12','label_offset':11,
    'execution':{'cards':[s['id'] for s in SONGS],'takes_per_card':3,'total_audio_requests':6,'duration_seconds':45,'total_requested_minutes':4.5,'estimated_generation_usd':0.675},
    'feedback_file':'SOUNDTRACK_ROUND_4_FEEDBACK-2026-09-12.json',
    'page':{'title':'Lightning and Water — Muju soundtrack auditions','eyebrow':'Muju Hono Tanka · Round five · ElevenLabs','heading':'Electric charge. Continuous current.','intro':'Metal 10A is the chosen take. Lightning gains rhythmic variety and an electric edge; Water finds its melody in sustained cello and bowed bass.','save_key':'muju-soundtrack-round-five-v1'},
    'cards':cards
}
path=ROOT/'docs/SOUNDTRACK_ROUND_5_PROMPTS-2026-09-12.json'
out=ROOT/'music-auditions/round-5'
if out.exists() and any(out.glob('*-take-*.json')):
    raise SystemExit('Generation has begun; preserve the existing request packet')
assert len(cards)==2 and all(len(c['providers']['elevenlabs']['take_bodies'])==3 for c in cards)
assert all(len(b['prompt'])<=4100 for c in cards for b in c['providers']['elevenlabs']['take_bodies'].values())
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
selection_path=ROOT/'docs/SOUNDTRACK_SELECTIONS.json'
selections=json.loads(selection_path.read_text()) if selection_path.exists() else {'provider':'ElevenLabs','accepted_auditions':{}}
receipt=json.loads((ROOT/'music-auditions/round-4/tanka-pressure-elevenlabs-take-1.json').read_text())
selections['accepted_auditions']['metal']={'label':'10A','title':receipt['title'],'variant':receipt['variant'],'job':receipt['job'],'round':4,'audio_file':'muju/music-auditions/round-4/'+receipt['audio_file'],'sha256':receipt['sha256'],'status':'User accepted this audition; full-length development and loop editing remain separate.','source':'User: 10a is good enough, I\'m picky on the others, next round!'}
selection_path.write_text(json.dumps(selections,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'prompt_packet':str(path),'requests':6,'minutes':4.5,'estimated_usd':0.675,'metal_choice':'10A'}))
