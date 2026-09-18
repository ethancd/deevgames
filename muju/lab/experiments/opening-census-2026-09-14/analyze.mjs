import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {once} from 'node:events';
const dir=path.resolve(process.argv[2]??'lab/results/opening-census-2026-09-14');
const c=JSON.parse(fs.readFileSync(path.join(dir,'census.json'),'utf8'));
const map=c.initialMap,N=c.count,start=[1,11,10],mine=[1,2,3],cost=[3,4,5];
const xy=n=>[n%10,Math.floor(n/10)],coord=n=>String.fromCharCode(65+n%10)+(1+Math.floor(n/10));
const md=(a,b)=>Math.abs(a%10-b%10)+Math.abs(Math.floor(a/10)-Math.floor(b/10));
const adj=Array.from({length:100},(_,n)=>[n>=10?n-10:-1,n<90?n+10:-1,n%10?n-1:-1,n%10<9?n+1:-1].filter(x=>x>=0));
const orders=['Hold','Hi sortie','Sjor development','Hi and Sjor','Muju development','Hi and Muju','Sjor and Muju','All three develop'];
function zone(n){if([0,1,2,10,11,20].includes(n))return 'home';if(map[n]===0)return 'dry';if(map[n]===16)return n%10>5?'east expansion':'south expansion';if(map[n]===8)return 'central reserve';return n%10+Math.floor(n/10)<=5?'near ground':'outer ground';}
const genusMap=new Map(),speciesMap=new Map();
function feature(s){
 const p=s.p,mask=p.reduce((v,n,i)=>v+(n!==start[i]?1<<i:0),0);
 const demands=p.map((n,i)=>Math.ceil(md(n,start[i])/[2,1,1][i]));
 const spawn=[];for(let n=0;n<100;n++)if(!p.includes(n)&&p.some(a=>n%10<=a%10&&Math.floor(n/10)<=Math.floor(a/10)))spawn.push(n);
 const take=p.map((n,i)=>Math.min(mine[i],map[n]));
 const reserves=p.map((n,i)=>map[n]-take[i]);
 const next=mine.reduce((s,m,i)=>s+Math.min(m,reserves[i]),0);
 const second=mine.reduce((s,m,i)=>s+Math.min(m,Math.max(0,reserves[i]-m)),0);
 const bank=take.reduce((a,b)=>a+b,0),spawnReserve=spawn.reduce((s,n)=>s+map[n],0);
 const genusKey=mask+':'+demands.join('/');if(!genusMap.has(genusKey))genusMap.set(genusKey,genusMap.size+1);
 const genus=genusMap.get(genusKey),zones=p.map(zone);
 const band=spawn.length<=5?'small':spawn.length<=12?'medium':spawn.length<=20?'large':'wide';
 const speciesKey=genus+':'+zones.join('/')+':income'+bank+':'+band;
 if(!speciesMap.has(speciesKey))speciesMap.set(speciesKey,speciesMap.size+1);
 return {...s,coords:p.map(coord),blackCoords:p.map(n=>coord(99-n)),order:mask+1,orderName:orders[mask],demands,
 genus,species:speciesMap.get(speciesKey),zones,spawnBand:band,spawn,bank,take,reserves,next,second,spawnReserve,
 economy:bank+0.6*next+0.3*second,space:0.1*spawn.length+0.03*spawnReserve};
}
const F=c.states.map(feature);
for(const f of F)f.captureLiability=f.p.map((_,i)=>{
 const rest=f.p.filter((_,j)=>i!==j),remainingSpawn=[];
 for(let n=0;n<100;n++)if(!rest.includes(n)&&rest.some(a=>n%10<=a%10&&Math.floor(n/10)<=Math.floor(a/10)))remainingSpawn.push(n);
 const remainingSpace=.1*remainingSpawn.length+.03*remainingSpawn.reduce((s,n)=>s+map[n]-(f.p.includes(n)?f.take[f.p.indexOf(n)]:0),0);
 return cost[i]+.6*Math.min(mine[i],f.reserves[i])+.3*Math.min(mine[i],Math.max(0,f.reserves[i]-mine[i]))+f.space-remainingSpace;
});
// Exact first-round cross product audit: enumerate Black afresh for every W1.
function moves(p,i,block){const seen=new Uint8Array(100);seen[p[i]]=1;const q=[[p[i],0]],r=[];
 for(let j=0;j<q.length;j++){const [s,d]=q[j];if(d===[2,1,1][i])continue;for(const n of adj[s])if(!seen[n]&&!p.includes(n)&&!block.includes(n)){seen[n]=1;q.push([n,d+1]);r.push(n);}}return r;}
const endpointIndex=new Map(F.map(s=>[s.p.join(','),s.id]));
let audited=0,transitionCount=0;const blackReplyCounts=[];
for(const w of F){const block=w.p.map(n=>99-n),seen=new Set([start.join(',')]),q=[{p:start,d:0}];
 for(let k=0;k<q.length;k++){const n=q[k];if(n.d===4)continue;for(let u=0;u<3;u++)for(const to of moves(n.p,u,block)){transitionCount++;const p=[...n.p];p[u]=to;const key=p.join(',');if(!seen.has(key)){seen.add(key);q.push({p,d:n.d+1});}}}
 const expected=F.filter(b=>!b.p.some(p=>block.includes(p)));if(q.length!==expected.length)throw Error('B1 cardinality mismatch');
 for(const b of q)if(!endpointIndex.has(b.p.join(',')))throw Error('Unexpected B1 position');
 for(const b of expected)if(!seen.has(b.p.join(',')))throw Error('Missing B1 position');
 blackReplyCounts.push(q.length);audited+=q.length;
}
console.log(JSON.stringify({audit:audited,transitionCount,orders:8,genera:genusMap.size,species:speciesMap.size}));
// A single-unit capture screen: existing T1s, a single affordable T2 promotion,
// or a single affordable T1 purchase, with shortest legal approach, within 4 actions.
// Does not claim a favorable exchange, forced win, or absence of combination kills.
const queue=new Int16Array(100),dist=new Int16Array(100),occupied=new Uint8Array(100);
function capture(own,enemy,spawn,bank){
 let mask=0,maxValue=0,minActions=5;
 occupied.fill(0);for(const p of own)occupied[p]=1;for(const p of enemy)occupied[p]=1;
 for(let t=0;t<3;t++){
  dist.fill(-1);let head=0,tail=1;queue[0]=enemy[t];dist[enemy[t]]=0;
  while(head<tail){const s=queue[head++];if(dist[s]>=10)continue;for(const n of adj[s])if(dist[n]<0){dist[n]=dist[s]+1;if(!occupied[n])queue[tail++]=n;}}
  let best=5;
  // Hi kills Hi and Muju, promoted Hono also kills Sjor. Sjor kills Hi/Sjor.
  for(let i=0;i<3;i++){
   const lethal=i===0?(t!==1||bank>=4):i===1?t!==2:(t===1&&bank>=4);
   if(lethal&&dist[own[i]]>0)best=Math.min(best,Math.ceil((dist[own[i]]-1)/[2,1,1][i])+1);
  }
  if(bank>=[3,4,3][t]){let d=100;for(const p of spawn)if(dist[p]>0)d=Math.min(d,dist[p]);best=Math.min(best,Math.ceil((d-1)/[3,2,2][t])+1);}
  if(best<=4){mask|=1<<t;maxValue=Math.max(maxValue,cost[t]);minActions=Math.min(minActions,best);}
 }
 return [mask,maxValue,minActions];
}
const grade=s=>s<=-6?'B major':s<=-3.5?'B clear':s<=-1.5?'B slight':s<1.5?'Close':s<3.5?'W slight':s<6?'W clear':'W major';
const binary=fs.createWriteStream(path.join(dir,'joint.bin'));
const gzip=zlib.createGzip({level:6}),csv=fs.createWriteStream(path.join(dir,'all-B1-states.csv.gz'));gzip.pipe(csv);
gzip.write('State_ID,W1_ID,B1_pattern,Joint_order,Joint_genus,Joint_species,W_Hi,W_Sjor,W_Muju,B_Hi,B_Sjor,B_Muju,W_bank,B_bank,W_Hi_reserve,W_Sjor_reserve,W_Muju_reserve,B_Hi_reserve,B_Sjor_reserve,B_Muju_reserve,Economy_delta,Space_delta,W_capture_mask,B_hypothetical_capture_mask,Opening_index,Grade,Economy_emphasis_index,Space_emphasis_index\n');
const bestByW=[],bStats=F.map(b=>({id:b.id,best:Infinity,worst:-Infinity,sum:0,count:0,nearBest:0,regretSum:0,maxRegret:0,safeNearBest:0}));
const gradeCounts={},jointOrders=new Map(),jointGenera=new Set(),jointSpecies=new Map(),examples=[];
const records=[];let count=0,wThreats=0,bThreats=0,mutual=0,robustSign=0;
for(let wi=0;wi<N;wi++){
 const w=F[wi],row=[];let best=Infinity,bestB=0;const wb=w.p,spawnW=w.spawn;
 let csvChunk='';const buf=Buffer.alloc(N*12);
 for(let bi=0;bi<N;bi++){
  const b=F[bi],bp=b.p.map(n=>99-n);const off=bi*12;
  if(w.p.some(p=>bp.includes(p))){buf.writeFloatLE(NaN,off);row.push(null);continue;}
  const bs=b.spawn.map(n=>99-n),wk=capture(w.p,bp,spawnW,w.bank),bk=capture(bp,w.p,bs,b.bank);
  const ed=w.economy-b.economy,sd=w.space-b.space;
  const wl=Math.max(0,...b.captureLiability.filter((_,i)=>wk[0]&(1<<i))),bl=Math.max(0,...w.captureLiability.filter((_,i)=>bk[0]&(1<<i)));
  const score=Math.round((ed+sd+0.75*wl-0.35*bl)*100)/100;
  const eScore=Math.round((ed*1.25+sd*.75+.5*wl-.2*bl)*100)/100;
  const sScore=Math.round((ed*.75+sd*1.25+wl-.5*bl)*100)/100;
  const g=grade(score);gradeCounts[g]=(gradeCounts[g]??0)+1;
  if(wk[0])wThreats++;if(bk[0])bThreats++;if(wk[0]&&bk[0])mutual++;
  if([score,eScore,sScore].every(s=>s>=1.5)||[score,eScore,sScore].every(s=>s<=-1.5)||[score,eScore,sScore].every(s=>Math.abs(s)<1.5))robustSign++;
  const jo=(w.order-1)*8+b.order,jg=w.genus+'-'+b.genus,js=w.species+'-'+b.species+'-'+wk[0]+'-'+bk[0];
  jointGenera.add(jg);let sp=jointSpecies.get(js);if(!sp){sp={id:jointSpecies.size+1,key:js,order:jo,genus:jg,count:0,min:Infinity,max:-Infinity,sum:0};jointSpecies.set(js,sp);}sp.count++;sp.min=Math.min(sp.min,score);sp.max=Math.max(sp.max,score);sp.sum+=score;
  let joS=jointOrders.get(jo);if(!joS){joS={id:jo,wOrder:w.order,bOrder:b.order,count:0,min:Infinity,max:-Infinity,sum:0};jointOrders.set(jo,joS);}joS.count++;joS.min=Math.min(joS.min,score);joS.max=Math.max(joS.max,score);joS.sum+=score;
  buf.writeFloatLE(score,off);buf.writeUInt8(wk[0],off+4);buf.writeUInt8(bk[0],off+5);buf.writeUInt32LE(sp.id,off+6);buf.writeUInt8(wk[2],off+10);buf.writeUInt8(bk[2],off+11);
  const vals=[`W${w.id}-B${b.id}`,w.id,b.id,jo,jg,sp.id,...w.coords,...b.blackCoords,w.bank,b.bank,...w.reserves,...b.reserves,ed.toFixed(2),sd.toFixed(2),wk[0],bk[0],score,g,eScore,sScore];csvChunk+=vals.join(',')+'\n';
  row.push({score,wk:wk[0],bk:bk[0],eScore,sScore});
  if(score<best){best=score;bestB=b.id;}
  const st=bStats[bi];st.best=Math.min(st.best,score);st.worst=Math.max(st.worst,score);st.sum+=score;st.count++;
  count++;
 }
 for(let bi=0;bi<N;bi++)if(row[bi]){const r=row[bi],regret=r.score-best,st=bStats[bi];st.regretSum+=regret;st.maxRegret=Math.max(st.maxRegret,regret);if(regret<=1+1e-7){st.nearBest++;if(!r.wk)st.safeNearBest++;}}
 bestByW.push({w:w.id,b:bestB,score:best,legal:row.filter(Boolean).length,nearBest:row.filter(r=>r&&r.score<=best+1+1e-7).length});
 if(!binary.write(buf))await once(binary,'drain');if(!gzip.write(csvChunk))await once(gzip,'drain');
 if(wi%50===0)console.log('Scored W1 '+(wi+1)+'/'+N+'; '+count+' states');
}
binary.end();gzip.end();await Promise.all([once(binary,'finish'),once(csv,'finish')]);
if(count!==c.jointCount||audited!==count)throw Error('Joint count mismatch');
const serialF=F.map(({spawn,...f})=>({...f,spawnCount:spawn.length,spawnCoordinates:spawn.map(coord).join(' ')}));
const summary={count,orders:8,genera:genusMap.size,species:speciesMap.size,jointOrders:jointOrders.size,jointGenera:jointGenera.size,jointSpecies:jointSpecies.size,gradeCounts,wThreats,bThreats,mutual,robustSign,blackReplyCounts,transitionCount,
 bestByW,bStats,orderStats:[...jointOrders.values()],speciesStats:[...jointSpecies.values()],genusKeys:[...genusMap],speciesKeys:[...speciesMap],features:serialF};
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(summary));
console.log(JSON.stringify({...summary,blackReplyCounts:undefined,bestByW:undefined,bStats:undefined,orderStats:undefined,speciesStats:undefined,genusKeys:undefined,speciesKeys:undefined,features:undefined},null,2));
