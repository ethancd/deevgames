import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';
process.chdir(path.resolve(import.meta.dirname,'..'));
const t=JSON.parse(fs.readFileSync('src/timeline.json')),n=Number(t.id.slice(1)),stills=process.argv.includes('--stills');
if(!stills&&!t.audioComplete)throw Error('Final video requires every current speech clip.');
if(!stills&&t.lines.some(l=>!l.captionAlignment))throw Error('Final video requires aligned captions for every line.');
const serveUrl=await bundle({entryPoint:path.resolve('src/index.tsx'),publicDir:path.resolve('public'),webpackOverride:c=>({...c,cache:false})});
const browser=await openBrowser('chrome');const port=9390+n;
try{
 const id=fs.readFileSync('src/index.tsx','utf8').match(/id="([^"]+)"/)[1];
 const composition=await selectComposition({serveUrl,id,puppeteerInstance:browser,port});
 if(stills){
  const selected=process.argv.find(x=>x.startsWith('--lines='))?.slice(8).split(',');
  const lines=t.lines.filter(l=>selected?selected.includes(l.id):true);
  for(const l of lines){
   const frame=l.from+(l.preRollFrames||0)+Math.min(l.speechFrames-1,Math.max(24,Math.floor(l.speechFrames*.65)));
   await renderStill({composition,serveUrl,puppeteerInstance:browser,port,frame,output:path.resolve(`qa/scene-${l.id}.png`),imageFormat:'png',scale:2/3});
  }
  console.log(`${t.id}: ${lines.length} stills rendered.`);
 }else{
  const started=Date.now();let last=-1;
  await renderMedia({composition,serveUrl,puppeteerInstance:browser,port,codec:'h264',crf:21,x264Preset:'fast',audioBitrate:'192k',pixelFormat:'yuv420p',outputLocation:path.resolve('output/raw.mp4'),concurrency:4,onProgress:({progress})=>{const percent=Math.floor(progress*100);if(percent>=last+10){last=percent;console.log(`${t.id} ${percent}% · ${Math.round((Date.now()-started)/1000)}s elapsed`);}}});
  fs.writeFileSync('qa/render.json',JSON.stringify({durationSeconds:t.durationInFrames/t.fps,elapsedSeconds:(Date.now()-started)/1000,frames:t.durationInFrames},null,2));
 }
}finally{await browser.close({silent:true});}
