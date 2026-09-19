import fs from 'node:fs';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';import ffprobe from 'ffprobe-static';
process.chdir(path.resolve(import.meta.dirname,'..'));
const t=JSON.parse(fs.readFileSync('src/timeline.json')),duration=t.durationInFrames/t.fps;
function run(args){const r=spawnSync(ffmpeg,['-hide_banner','-y',...args],{encoding:'utf8',maxBuffer:20e6});if(r.status!==0){fs.writeFileSync('qa/master-error.log',r.stderr);throw Error('Audio/video mastering failed');}return r;}
function measure(file){const r=run(['-i',file,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-']);return JSON.parse(r.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);}
const voice=measure('output/raw.mp4');
const norm=`loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${voice.input_i}:measured_TP=${voice.input_tp}:measured_LRA=${voice.input_lra}:measured_thresh=${voice.input_thresh}:offset=${voice.target_offset}:linear=true`;
// Every thinking interval stays quiet; gently fade the music out before the hold and back after it.
let envelope=`min(1,t/2)*max(0,min(1,(${duration}-t)/2))`;
for(const l of t.lines.filter(l=>l.thinking)){
 const start=(l.from+(l.preRollFrames||0)+l.speechFrames+24)/t.fps,end=start+9;
 envelope+=`*if(lt(t,${start-.4}),1,if(lt(t,${start}),(${start}-t)/.4,if(lt(t,${end}),0,min(1,(t-${end})/.6))))`;
}
run(['-stream_loop','-1','-i','public/music/theme.mp3','-t',String(duration+5),'-af',`loudnorm=I=-29:TP=-8:LRA=9,volume='${envelope}':eval=frame`,'-ar','48000','-ac','2','-c:a','pcm_s16le','qa/music-bed.wav']);
// Sidechain compression lowers the bed during speech; normalized dialogue remains in front.
const filter=`[0:a]apad=pad_dur=5,${norm},asplit=2[voice][key];[1:a][key]sidechaincompress=threshold=0.018:ratio=4:attack=30:release=450[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.8414:level=false[mix]`;
const output=`output/Muju-Academy-Episode-${t.id.slice(1)}.mp4`;
run(['-i','output/raw.mp4','-i','qa/music-bed.wav','-filter_complex',filter,'-map','0:v','-map','[mix]','-t',String(duration),'-c:v','copy','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart',output]);
// AAC can overshoot a sample limiter. Check decoded true peak and compensate
// from the original inputs, without repeatedly encoding an existing AAC track.
let measuredFinal=measure(output),peakGainDB=0;
for(let attempt=0;Number(measuredFinal.input_tp)>-1.5&&attempt<3;attempt++){
 peakGainDB+=-1.7-Number(measuredFinal.input_tp);
 const limited=filter.replace('[mix]',`,volume=${peakGainDB}dB[mix]`);
 run(['-i','output/raw.mp4','-i','qa/music-bed.wav','-filter_complex',limited,'-map','0:v','-map','[mix]','-t',String(duration),'-c:v','copy','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart',output]);
 measuredFinal=measure(output);
}
if(Number(measuredFinal.input_tp)>-1.5)throw Error('Decoded AAC true peak exceeds the ceiling.');
// The existing host limits individual assets to 25 MiB. Only compress more if needed.
if(fs.statSync(output).size>=25*1024**2){
 fs.renameSync(output,'output/master-large.mp4');
 const bitrate=Math.floor((24*1024**2*8/duration-128000)*.96);
 if(bitrate<250000)throw Error('Episode too long for a legible hosted export.');
 run(['-i','output/master-large.mp4','-c:v','libx264','-b:v',String(bitrate),'-maxrate',String(bitrate*2),'-bufsize',String(bitrate*4),'-preset','slow','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',output]);
}
if(fs.statSync(output).size>=25*1024**2)throw Error('Hosted asset limit exceeded.');
const probe=spawnSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',output],{encoding:'utf8'});if(probe.status!==0)throw Error('Final probe failed');
const audioStream=JSON.parse(probe.stdout).streams.find(s=>s.codec_type==='audio');
if(Math.abs(Number(audioStream.duration)-duration)>.1)throw Error('Final audio does not span the complete timeline.');
fs.writeFileSync('qa/final-probe.json',probe.stdout);
fs.writeFileSync('qa/audio-mastering.json',JSON.stringify({voiceTargetLUFS:-16,musicTargetLUFS:-29,sidechain:true,quietThinkingHolds:true,tailPadSeconds:5,truePeakLimitDB:-1.5,peakGainDB,voice,measuredFinal,soundtrack:t.soundtrack},null,2));
run(['-ss','3','-i',output,'-frames:v','1','-q:v','2',`output/${t.id}-poster.jpg`]);
console.log(`${t.id}: mixed, mastered, and checked under 25 MiB.`);
