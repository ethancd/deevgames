import fs from 'node:fs';
import path from 'node:path';
process.chdir(path.resolve(import.meta.dirname,'..'));
if(!process.env.OPENAI_API_KEY)process.loadEnvFile('/Users/ashkie/src/deevgames/muju/.env');
if(!process.env.OPENAI_API_KEY)throw Error('Missing speech API key');
const clip=process.argv.find(x=>x.startsWith('--clip='))?.split('=')[1];
const file=clip?`public/audio/${clip}.wav`:'qa/dialogue-master.wav';
const form=new FormData();form.append('file',new Blob([fs.readFileSync(file)],{type:'audio/wav'}),'dialogue-master.wav');
form.append('model','whisper-1');form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('language','en');
form.append('prompt','Muju Academy. Characters: Pip, Click. Muju Hono Tanka. Units: Hi, Sjor, Muju, Inyan, Mazask, Tanka. Board coordinates A1, J10, C4, C5, D5, E4, A2. Unequal routes.');
const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(180000)});
if(!r.ok){console.error('Transcription status',r.status);process.exit(1);}
const result=await r.json();fs.writeFileSync(clip?`qa/transcription-${clip}.json`:'qa/transcription.json',JSON.stringify(result,null,2));console.log('Transcribed',result.words?.length,'words.');
