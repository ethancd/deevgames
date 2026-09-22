import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const root=import.meta.dirname,require=createRequire(path.join(root,'production/R01/package.json'));
const ffmpeg=require('ffmpeg-static'),ffprobe=require('ffprobe-static').path;
if(!process.env.OPENAI_API_KEY)process.loadEnvFile(path.resolve(root,'../.env'));
const jobFile=process.argv.find(a=>a.startsWith('--jobs='))?.slice(7)||'logs/retakes.json';
const jobs=JSON.parse(fs.readFileSync(path.resolve(root,jobFile)));let cursor=0;
async function run(job){
 const d=path.join(root,'production',job.episode),ep=JSON.parse(fs.readFileSync(path.join(d,'episode.json'))),line=ep.lines.find(l=>l.id===job.id);
 const file=path.join(d,`public/audio/${job.id}.wav`),metaFile=path.join(d,`public/audio/${job.id}.json`),old=JSON.parse(fs.readFileSync(metaFile));
 if(old.retakeMethod==='sentence-by-sentence-v1'&&old.originalText===line.text&&!job.force)return;
 const input=(job.speechText||old.speechText).replace(/\b[A-Z]{2,}\b/g,s=>s.toLowerCase());
 const inputHash=crypto.createHash('sha256').update(input).digest('hex').slice(0,12);
 const folder=path.join(root,'archive/retakes',job.episode,job.id,inputHash);fs.mkdirSync(folder,{recursive:true});
 for(const source of [file,metaFile]){const dest=path.join(folder,'previous'+path.extname(source));if(!fs.existsSync(dest))fs.copyFileSync(source,dest);}
 const sentences=input.match(/[^.!?]+[.!?]+|[^.!?]+$/g).map(s=>s.trim()).filter(Boolean);
 const directions=JSON.parse(fs.readFileSync(path.join(d,'speech-directions.json')))[line.speaker];
 const parts=[];
 for(let i=0;i<sentences.length;i++){
  const out=path.join(folder,`sentence-${i+1}.wav`);parts.push(out);
  if(fs.existsSync(out))continue;
  const body={model:'gpt-4o-mini-tts',voice:ep.voices[line.speaker],input:sentences[i],response_format:'wav',instructions:`${directions} Read the entire supplied sentence exactly as written. Speak at a clear, unhurried teaching pace. Every word must be audible, including the last word. No added words, sounds, singing, or laughter. Hyphenated names are pronunciation hints, not letters to spell. Hoh-noh is Hono, also spelled Honō. Hee is Hi. Read counts clearly.`};
  const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Retake ${job.episode}/${job.id} sentence ${i+1}: HTTP ${response.status}`);
  fs.writeFileSync(out,Buffer.from(await response.arrayBuffer()));
 }
 const list=path.join(folder,'concat.txt');fs.writeFileSync(list,parts.map(p=>`file '${p.replaceAll("'","'\\''")}'`).join('\n'));
 const temp=file+'.tmp.wav';execFileSync(ffmpeg,['-v','error','-y','-f','concat','-safe','0','-i',list,'-ar','24000','-ac','1','-c:a','pcm_s16le',temp]);
 const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_format','-of','json',temp]));
 fs.renameSync(temp,file);const bytes=fs.readFileSync(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(metaFile,JSON.stringify({provider:'openai',model:'gpt-4o-mini-tts',voice:ep.voices[line.speaker],speaker:line.speaker,originalText:line.text,speechText:input,hash,duration:Number(probe.format.duration),bytes:bytes.length,retakeMethod:'sentence-by-sentence-v1',retakeReason:job.reason,createdAt:new Date().toISOString()},null,2));
 console.log(`${job.episode}/${job.id}: ${parts.length} sentences retaken · ${probe.format.duration}s`);
}
async function worker(){while(cursor<jobs.length)await run(jobs[cursor++]);}
await Promise.all(Array.from({length:3},worker));console.log('Targeted speech repairs complete.');
