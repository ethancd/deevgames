import fs from 'node:fs';import path from 'node:path';
const dir=path.resolve('lab/results/handicap-census-2026-09-14'),c=JSON.parse(fs.readFileSync(path.join(dir,'census.json'))),f=JSON.parse(fs.readFileSync(path.join(dir,'features.json')));
const D=c.definitions,target=D.find(d=>d.id==='water_2'),targets=[...new Set(c.patterns.filter(p=>p.family===6).map(p=>p.units.find(u=>u.definitionId==='water_2').position))];
const md=(a,b)=>Math.abs(a%10-b%10)+Math.abs(Math.floor(a/10)-Math.floor(b/10)),damage=d=>Math.max(0,d.attack+c.modifier[d.index][target.index]);
const distAP=(pos,t,d)=>Math.ceil(Math.max(0,md(pos,t)-1)/d.speed)+1;
const counts={};let pairs=0,maximum=0;const examples=[];
for(const w of f.white)for(const t of targets){
 let dp=Array.from({length:5},()=>Array(w.income+1).fill(-Infinity));dp[0][0]=0;
 const addGroup=options=>{const next=dp.map(r=>[...r]);for(let ap=0;ap<=4;ap++)for(let bank=0;bank<=w.income;bank++)if(Number.isFinite(dp[ap][bank]))for(const o of options)if(ap+o.ap<=4&&bank+o.cost<=w.income)next[ap+o.ap][bank+o.cost]=Math.max(next[ap+o.ap][bank+o.cost],dp[ap][bank]+o.damage);dp=next;};
 for(const u of w.units){const d=D[u.def],p=D.find(x=>x.element===d.element&&x.tier===d.tier+1);const options=[{ap:distAP(u.position,t,d),cost:0,damage:damage(d)}];if(p)options.push({ap:distAP(u.position,t,p),cost:4,damage:damage(p)});addGroup(options);}
 const buys=D.filter(d=>d.tier===1).map(d=>({ap:w.spawn.length?Math.min(...w.spawn.map(p=>distAP(p,t,d))):99,cost:d.cost,damage:damage(d)}));
 // At most two T1 purchases fit a bank <=6. Ignore mutual blocking and permit
 // both to use the same ideal spawn square: this can only overestimate damage.
 addGroup(buys);addGroup(buys);
 const bound=Math.max(...dp.flat());counts[bound]=(counts[bound]??0)+1;pairs++;maximum=Math.max(maximum,bound);
 if(bound>=3)throw Error('No universal survival proof; a relaxed budget permits lethal damage');
 if(w.id===792)examples.push({w:w.id,targetSquare:String.fromCharCode(65+t%10)+(1+Math.floor(t/10)),optimisticDamageBound:bound});
}
const out={whiteStates:f.white.length,distinctStraumrSquares:targets.length,pairs,maxOptimisticDamage:maximum,defense:target.defense,counts,claim:'No legal White W2 can capture a Black Straumr promoted on B1 under handicap 4. This does not prove a win or immunity on later turns.',method:'Relaxed action/crystal knapsack includes every original attacker or its promotion and up to two T1 purchases. Uses unobstructed Manhattan approaches and independently ideal spawn cells; ignoring blockers overestimates attainable damage. Each attacker can hit a surviving target only once.',examples};
fs.writeFileSync(path.join(dir,'straumr-proof.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
