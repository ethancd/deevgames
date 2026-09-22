import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
process.chdir(path.resolve(import.meta.dirname,'..'));
const source='output/Episode-16.mp4', final='output/Muju-Academy-Episode-16.mp4';
function run(args){try{return execFileSync(ffmpeg,['-hide_banner','-y',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20e6});}catch(e){fs.writeFileSync('qa/ffmpeg-error.log',String(e.stderr));throw Error('FFmpeg failed; see qa/ffmpeg-error.log');}}
let first;
// spawnSync retains successful stderr, where loudnorm writes its measurements.
const {spawnSync}=await import('node:child_process');
const measured=spawnSync(ffmpeg,['-hide_banner','-i',source,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{encoding:'utf8',maxBuffer:20e6});
if(measured.status!==0)throw Error('Audio measurement failed');
first=JSON.parse(measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
const filter=`loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true:print_format=json`;
const finished=spawnSync(ffmpeg,['-hide_banner','-y','-i',source,'-c:v','copy','-af',filter,'-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',final],{encoding:'utf8',maxBuffer:20e6});
if(finished.status!==0){fs.writeFileSync('qa/ffmpeg-error.log',finished.stderr);throw Error('Mastering failed');}
const finalProbe=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',final],{encoding:'utf8'}));
fs.writeFileSync('qa/audio-mastering.json',JSON.stringify({targetLUFS:-16,truePeakCeilingDB:-1.5,input:first,output:JSON.parse(finished.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0])},null,2));
fs.writeFileSync('qa/final-probe.json',JSON.stringify(finalProbe,null,2));
console.log('Mastered video:',final);console.log({duration:Number(finalProbe.format.duration),bytes:Number(finalProbe.format.size),streams:finalProbe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,sample_rate:s.sample_rate}))});
