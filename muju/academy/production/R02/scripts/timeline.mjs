import fs from 'node:fs';import path from 'node:path';
process.chdir(path.resolve(import.meta.dirname,'..'));
const ep=JSON.parse(fs.readFileSync('episode.json'));const draft=process.argv.includes('--draft');
const previous=JSON.parse(fs.readFileSync('qa/previous-timeline.json'));
const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const display=text=>text.replace(/\b([A-J])\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/g,(_,c,n)=>c+numbers[n]).replace(/\b[Cc]olumn ([A-J]),? row (one|two|three|four|five|six|seven|eight|nine|ten)\b/g,(_,c,n)=>c+numbers[n]);
let frame=0,complete=true;
const lines=ep.lines.map(l=>{
 const p=`public/audio/${l.id}.json`;const meta=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
 const valid=meta?.originalText===l.text&&(!ep.speechProvider||(meta.provider||(meta.model?.startsWith('gpt')?'openai':null))===ep.speechProvider)&&(!ep.speechVoices||meta.voice===ep.speechVoices[l.speaker]);
 if(!valid){complete=false;if(!draft)throw Error('Missing or stale speech '+l.id);}
 const seconds=valid?meta.duration:Math.max(1.2,l.text.split(/\s+/).length/2.4),speechFrames=Math.ceil(seconds*ep.fps),preRollFrames=Math.round((l.preRoll||0)*ep.fps),duration=preRollFrames+speechFrames+Math.round(l.hold*ep.fps);
 const old=previous.lines.find(o=>o.id===l.id&&o.text===l.text&&o.speechFrames===speechFrames);
 let captions;
 if(valid&&meta.captions){
  captions=meta.captions;
  if(captions.map(c=>c.text).join(' ')!==display(l.text))throw Error('Canonical captions mismatch '+l.id);
 }else if(old?.captions){
  // Merge before normalization so a line break can never split "J ten".
  const chunks=old.captions.map(c=>({...c}));for(let i=0;i<chunks.length-1;i++){if(/[A-J]$/.test(chunks[i].text)&&/^(one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(chunks[i+1].text)){const m=chunks[i+1].text.match(/^\S+\s*/)[0];chunks[i].text+=' '+m.trim();chunks[i+1].text=chunks[i+1].text.slice(m.length);}}
  captions=chunks.filter(c=>c.text).map(c=>({...c,text:display(c.text)}));
 }else{
  const words=display(l.text).split(/\s+/);let chunks=[],start=0;
  for(let i=0;i<words.length;i++){if(words.slice(start,i+1).join(' ').length>=65||/[.!?]$/.test(words[i])||i===words.length-1){chunks.push({text:words.slice(start,i+1).join(' '),start:Math.floor(start/words.length*speechFrames),end:Math.floor((i+1)/words.length*speechFrames)});start=i+1;}}
  captions=chunks;
 }
 const wordFrames=valid&&meta.wordFrames?meta.wordFrames:old?.wordFrames;
 const captionAlignment=valid&&meta.captionAlignment?meta.captionAlignment:old?.captions?'Verified published take; numeric coordinates normalized':null;
 const item={...l,displayText:display(l.text),from:frame,speechFrames,preRollFrames,duration,audio:valid?`audio/${l.id}.wav`:null,captions,...(wordFrames?{wordFrames}:{}),captionAlignment};frame+=duration;return item;
});
const timeline={...ep,question:display(ep.question||''),lines,audioComplete:complete,durationInFrames:frame};
fs.writeFileSync('src/timeline.json',JSON.stringify(timeline,null,2));
fs.writeFileSync(`output/${ep.id}-transcript.txt`,`${ep.title}\nRules ${ep.rules} · Video version ${ep.version}\nMusic: ${ep.soundtrack.title}\n\n`+lines.map(l=>`${l.speaker}: ${l.displayText}`).join('\n\n')+'\n');
console.log({episode:ep.id,seconds:frame/ep.fps,audioComplete:complete});
