from pathlib import Path
import shutil
R=Path(__file__).resolve().parent
for i in range(1,17):
 p=R/'production'/f'R{i:02}';f=p/'scripts/speech.mjs';orig=p/'qa/previous-speech.mjs'
 if not orig.exists():shutil.copy2(f,orig)
 s=orig.read_text()
 # Preserve established takes when their source text and cast have not changed.
 marker='async function make(line){'
 s=s.replace(marker,marker+"\n const priorFile=`public/audio/${line.id}.wav`,priorMeta=`public/audio/${line.id}.json`;if(fs.existsSync(priorFile)&&fs.existsSync(priorMeta)){const prior=JSON.parse(fs.readFileSync(priorMeta));if(prior.originalText===line.text&&prior.voice===episode.voices[line.speaker]){console.log(`Preserved ${line.id} ${line.speaker}`);return;}}\n")
 # Names in new takes receive the same explicit pronunciation guidance as established lessons.
 s=s.replace('const input=pronounce(line.text);',"const input=pronounce(line.text).replace(/\\b(Muju|Hono|Kagari|Radi|Umeme|Kimubunga|Straumr|Aegirinn|Gölge|Göl|Karanlık|Sachita|Sachakuna|Inyan|Mazask|Tanka)\\b/gu,n=>({Muju:'Moo-joo',Hono:'HOH-noh',Kagari:'kah-GAH-ree',Radi:'RAH-dee',Umeme:'oo-MEH-meh',Kimubunga:'kee-moo-BOONG-gah',Straumr:'STROWM-ur',Aegirinn:'AY-geer-in',Göl:'GUHL',Gölge:'GUHL-geh',Karanlık:'kah-rahn-LUK',Sachita:'sah-CHEE-tah',Sachakuna:'sah-chah-KOO-nah',Inyan:'In-yahn',Mazask:'MAH-zahsk',Tanka:'Tahn-kah'}[n]));")
 f.write_text(s)
 # Build short caption chunks while preserving an intact coordinate token.
 for name in ['timeline.mjs']:
  f=p/'scripts'/name;f.write_text((R/'timeline.mjs').read_text())
print('Speech cache preserved; changed lines ready for synthesis.')
