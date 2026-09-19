import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ffprobe from 'ffprobe-static';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
if(!process.env.OPENAI_API_KEY)process.loadEnvFile('/Users/ashkie/src/deevgames/muju/.env');
const key=process.env.OPENAI_API_KEY;
if(!key){console.error('OPENAI_API_KEY is missing. Set it locally or in this project’s .env file. No API calls made.');process.exit(2);}
const episode=JSON.parse(fs.readFileSync('episode.json','utf8'));
const model='gpt-4o-mini-tts';
const directions=JSON.parse(fs.readFileSync('speech-directions.json','utf8'));
const cueMap={'counting, even beats':'Count with even spacing, without a ticking rhythm.','deadpan, flat':'Dry and lightly amused, clear and level.','proud announcement':'Earnestly proud, never loud.','recap, brisk':'Brief friendly recall, every word clear.','warm, unhurried':'Warm, unhurried and natural.','question, open':'Ask an inviting question. Do not imply the answer or urgency.','reveal, land it':'Clear warm reveal, with a small space around the decisive number.','gently, slower':'Gentle and slightly slower. Never disappointed.','dawning concern':'Realizing a small comic problem. No panic.','dry aside':'A small dry aside. Keep it fully audible.','stating the rule, level':'Speak the rule clearly and evenly.'};
Object.assign(cueMap,{"curious, thinking aloud": "Interested, thinking through the idea together.", "delighted realization": "A small happy discovery, never loud.", "rhyme couplet, light lilt": "Light spoken rhythm, no singing.", "mock-formal announcement": "Earnest playful formality, clear and restrained.", "conspiratorial whisper": "Confiding and fully audible, do not whisper.", "cheerfully wrong": "Earnest and confidently mistaken, never silly or loud.", "quietly certain": "Steady, thoughtful certainty.", "rapid, breathless": "Energetic but clear, not actually breathless.", "trailing off, inviting": "Invite the child to think, keep every word audible.", "quoting a phrase": "Quote the words plainly."});
const tail='Speak only the supplied words, exactly in order. No extra words, laughter or sounds. Respelled names are pronunciation guides, not letters to spell. Hee is the unit Hi; See-three is the coordinate C3. Pronounce See as the letter C.';
const pronounce=t=>t.replace(/\bHi\b/g,'Hee').replace(/\bSjor\b/g,'Shore').replace(/\bMuju\b/g,'Moo-joo').replace(/\bHono\b/g,'hohnoh').replace(/\bKagari\b/g,'kah-GAH-ree').replace(/\bRadi\b/g,'RAH-dee').replace(/Umeme/g,'oo-MEH-meh').replace(/Kimubunga/g,'kee-moo-BOON-gah').replace(/Aegirinn/g,'AY-gear-in').replace(/Sachakuna/g,'sah-chah-KOO-nah').replace(/Sachita/g,'sah-CHEE-tah').replace(/Karanlık/g,'kah-rahn-luk').replace(/Gölge/g,'GURL-geh').replace(/Göl/g,'Gurl').replace(/\bStraumr\b/g,'STROWM-ur').replace(/\bInyan\b/g,'In-yahn').replace(/\bMazask\b/g,'MAH-zahsk').replace(/\bTanka\b/g,'Tahn-kah').replace(/\b([A-J]) (one|two|three|four|five|six|seven|eight|nine|ten)\b/g,(_,c,n)=>({A:'Ay',B:'Bee',C:'See',D:'Dee',E:'Ee',F:'Eff',G:'Gee',H:'Aitch',I:'Eye',J:'Jay'}[c]+'-'+n));
const only=process.argv.find(x=>x.startsWith('--only='))?.split('=')[1]?.split(',');
const lines=episode.lines.filter(l=>!only||only.includes(l.id));let cursor=0;
async function make(line){
 const priorFile=`public/audio/${line.id}.wav`,priorMeta=`public/audio/${line.id}.json`;if(fs.existsSync(priorFile)&&fs.existsSync(priorMeta)){const prior=JSON.parse(fs.readFileSync(priorMeta));if(prior.originalText===line.text&&prior.voice===episode.voices[line.speaker]){console.log(`Preserved ${line.id} ${line.speaker}`);return;}}

 if(line.cue&&!cueMap[line.cue])throw Error(`Unknown delivery cue ${line.cue}`);const input=pronounce(line.text).replace(/\b(Muju|Hono|Kagari|Radi|Umeme|Kimubunga|Straumr|Aegirinn|Gölge|Göl|Karanlık|Sachita|Sachakuna|Inyan|Mazask|Tanka)\b/gu,n=>({Muju:'Moo-joo',Hono:'HOH-noh',Kagari:'kah-GAH-ree',Radi:'RAH-dee',Umeme:'oo-MEH-meh',Kimubunga:'kee-moo-BOONG-gah',Straumr:'STROWM-ur',Aegirinn:'AY-geer-in',Göl:'GUHL',Gölge:'GUHL-geh',Karanlık:'kah-rahn-LUK',Sachita:'sah-CHEE-tah',Sachakuna:'sah-chah-KOO-nah',Inyan:'In-yahn',Mazask:'MAH-zahsk',Tanka:'Tahn-kah'}[n]));const body={model,voice:episode.voices[line.speaker],input,instructions:[directions[line.speaker],cueMap[line.cue]||'',line.performanceNote||'',tail].join(' '),response_format:'wav'};
 const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const file=`public/audio/${line.id}.wav`,meta=`public/audio/${line.id}.json`;
 if(fs.existsSync(file)&&fs.existsSync(meta)&&JSON.parse(fs.readFileSync(meta)).hash===hash){console.log(`Cached ${line.id} ${line.speaker}`);return;}
 for(let attempt=1;attempt<=3;attempt++){
  const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!r.ok){const err=await r.json().catch(()=>({}));console.error(`Speech ${line.id}: HTTP ${r.status}; code ${err.error?.code||'unknown'}`);if(['credit_balance_exhausted','insufficient_quota'].includes(err.error?.code)||![429,500,502,503,504].includes(r.status)||attempt===3)throw Error(`Speech failed: ${r.status}`);await new Promise(r=>setTimeout(r,attempt*3000));continue;}
  const audio=Buffer.from(await r.arrayBuffer());fs.writeFileSync(file+'.tmp',audio);
  const probe=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',file+'.tmp'],{encoding:'utf8'}));
  const duration=Number(probe.format.duration);if(!Number.isFinite(duration)||duration<0.15)throw Error('Invalid generated audio');
  fs.renameSync(file+'.tmp',file);fs.writeFileSync(meta,JSON.stringify({provider:"openai",hash,model,voice:body.voice,speaker:line.speaker,originalText:line.text,speechText:input,duration,bytes:audio.length,createdAt:new Date().toISOString()},null,2));
  console.log(`Generated ${line.id} ${line.speaker}: ${duration.toFixed(2)}s`);return;
 }
}
async function worker(){while(cursor<lines.length){const line=lines[cursor++];await make(line);}}
await Promise.all([worker(),worker()]);
console.log('Speech generation complete.');
