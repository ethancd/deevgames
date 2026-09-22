import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=import.meta.dirname;
if(!process.env.OPENAI_API_KEY)process.loadEnvFile(path.resolve(root,'../.env'));
if(!process.env.OPENAI_API_KEY)throw Error('Missing existing OpenAI speech account key.');
const only=process.argv.find(a=>a.startsWith('--episodes='))?.slice(11).split(',');
const model=process.argv.find(a=>a.startsWith('--model='))?.slice(8)||'whisper-1';
const jobs=JSON.parse(fs.readFileSync(path.join(root,'logs/openai-new-clips.json'))).filter(j=>!only||only.includes(j.episode));
let cursor=0;
async function run(job){
 const d=path.join(root,'production',job.episode),meta=JSON.parse(fs.readFileSync(path.join(d,`public/audio/${job.id}.json`)));
 if(meta.originalText!==job.text)throw Error('Current speech not ready '+job.episode+'/'+job.id);
 const bytes=fs.readFileSync(path.join(d,`public/audio/${job.id}.wav`)),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const output=path.join(d,`qa/asr-v6-${job.id}${model==='whisper-1'?'':'-'+model}.json`);
 if(fs.existsSync(output)&&JSON.parse(fs.readFileSync(output)).audioSha256===hash)return;
 const form=new FormData();form.append('file',new Blob([bytes],{type:'audio/wav'}),`${job.episode}-${job.id}.wav`);
 form.append('model',model);form.append('response_format',model==='whisper-1'?'verbose_json':'json');
 if(model==='whisper-1')form.append('timestamp_granularities[]','word');
 form.append('language','en');
 // Vocabulary, not the expected sentence, keeps this an independent speech check.
 // 2026-09-22 rename added new names alongside old ones so existing audio keeps recognizing;
 // see docs/changes/2026-09-22-rename-irumbu-BRIEF.md.
 form.append('prompt','Muju Academy, a board game. Pip, Click, Hi, Hono, Honō, Kagari, Radi, Umeme, Kimubunga, Kimbunga, Sjor, Sjór, Straumr, Aegirinn, Ægirinn, Göl, Loş, Gölge, Karanlık, Muju, Sachita, Mallki, Sachakuna, Sach\'akuna, Inyan, Yan, Poṉ, Mazask, Veḷḷi, Tanka, Irumbu. Bonk matrix. Cleave. Board coordinates A1 through J10.');
 const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Transcription ${job.episode}/${job.id} HTTP ${response.status}`);
 const result=await response.json();result.audioSha256=hash;result.sourceText=job.text;result.model=model;
 fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(`${job.episode}/${job.id}: ${result.words?.length||0} words`);
}
async function worker(){while(cursor<jobs.length)await run(jobs[cursor++]);}
await Promise.all(Array.from({length:4},worker));console.log('Current changed speech transcribed.');
