import fs from 'node:fs';import path from 'node:path';
const dir=path.resolve('lab/results/handicap-census-2026-09-14');
const c=JSON.parse(fs.readFileSync(path.join(dir,'census.json'))),base=JSON.parse(fs.readFileSync('lab/results/opening-census-2026-09-14/analysis.json'));
const defs=c.definitions,map=c.initialMap;
function feature(id,units,white,bankOffset,order,genus,species){
 const p=units.map(u=>u.position),dir=white?1:-1;
 const reserve=map.map((v,n)=>v-(p.includes(n)?units.find(u=>u.position===n).take:0));
 const sp=(u)=>{const occ=u.map(x=>x.position),out=[];for(let n=0;n<100;n++)if(!occ.includes(n)&&u.some(a=>dir*(n%10-a.position%10)<=0&&dir*(Math.floor(n/10)-Math.floor(a.position/10))<=0))out.push(n);return out;};
 const space=(u)=>{const s=sp(u);return .1*s.length+.03*s.reduce((s,n)=>s+reserve[n],0);};
 const S=space(units),spawn=sp(units),income=units.reduce((s,u)=>s+u.take,0),rent=units.reduce((s,u)=>s+defs[u.def].tier-1,0);
 const next=units.reduce((s,u)=>s+Math.min(defs[u.def].mining,reserve[u.position]),0),second=units.reduce((s,u)=>s+Math.min(defs[u.def].mining,Math.max(0,reserve[u.position]-defs[u.def].mining)),0);
 const M=units.reduce((s,u)=>s+defs[u.def].cost,0),economyWithoutGrant=bankOffset+income+.6*(next-rent)+.3*(second-rent);
 const liability=units.map((u,i)=>defs[u.def].cost+.6*(Math.min(defs[u.def].mining,reserve[u.position])-(defs[u.def].tier-1))+.3*(Math.min(defs[u.def].mining,Math.max(0,reserve[u.position]-defs[u.def].mining))-(defs[u.def].tier-1))+S-space(units.filter((_,j)=>i!==j)));
 return {id,units,bankOffset,income,rent,next,second,spawn,spawnCount:spawn.length,spawnReserve:spawn.reduce((s,n)=>s+reserve[n],0),material:M,economyWithoutGrant,space:S,liability,order,genus,species};
}
const wi=['fire_1','water_1','plant_1'].map(d=>defs.findIndex(v=>v.id===d));
const W=base.features.map(f=>({...feature(f.id,f.p.map((n,i)=>({position:n,def:wi[i],take:f.take[i]})),true,0,f.order,f.genus,f.species),coords:f.coords}));
const B=c.patterns.map(f=>({...feature(f.id,f.units.map(u=>({position:u.position,def:defs.findIndex(d=>d.id===u.definitionId),take:u.take})),false,-f.spent,f.order,f.genus,f.species),family:f.family,minHandicap:f.minHandicap}));
fs.writeFileSync(path.join(dir,'features.json'),JSON.stringify({white:W,black:B,definitions:defs}));
let text=defs.length+'\n';for(const d of defs)text+=[d.attack,d.defense,d.speed,d.cost,d.tier,d.tier<3?d.index+1:-1,d.tier<2?4:8].join(' ')+'\n';
text+=c.modifier.map(r=>r.join(' ')).join('\n')+'\n';text+=W.length+' '+B.length+'\n';
for(const f of [...W,...B])text+=[f.id,f.family??-1,f.minHandicap??0,f.units.length,f.bankOffset+f.income,f.rent,f.material,f.economyWithoutGrant,f.space,f.order,f.genus,f.species,...f.units.flatMap((u,i)=>[u.position,u.def,f.liability[i]]),f.spawn.length,...f.spawn].join(' ')+'\n';
fs.writeFileSync(path.join(dir,'score-input.txt'),text);console.log('Prepared',W.length,B.length);
