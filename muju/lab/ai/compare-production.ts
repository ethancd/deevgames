/** Read-only comparison against an independently archived production tree.
 * Usage: node --import tsx lab/ai/compare-production.ts <old-muju-root> <output-dir>
 * Old engine has unseeded RNG; these are observed puzzle outcomes, not bit-exact
 * paired league results or JavaScript performance benchmarks.
 */
import { pathToFileURL } from 'node:url';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tacticalFixtures } from './fixtures';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { instantiateTactics } from '../../src/ai/wasm/kernel';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
const [root,out]=process.argv.slice(2);
if(!root||!out||existsSync(out))throw new Error('Supply reference Muju root and a new results directory');mkdirSync(out,{recursive:true});
const {AIEngineV2:OldEngine}=await import(pathToFileURL(`${root}/src/ai/engine-v2.ts`).href);
const solver=await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));
const rows=[];
const fixtures=tacticalFixtures().filter(f=>f.expected==='proved');
writeFileSync(`${out}/fixtures.json`,JSON.stringify(fixtures,null,2)+'\n');
for(const f of fixtures)for(const version of ['production-e70a057','candidate']) {
  const e=version==='candidate'?new AIEngineV2('medium'):new OldEngine('medium');if(version==='candidate')e.setTacticalSolver(solver);
  let s=f.state,totalMs=0,decisions=0,illegal=false;
  while(s.phase==='playing'&&s.turn.currentPlayer===f.state.turn.currentPlayer&&s.board.units.some(u=>u.id===f.targetId)&&totalMs<4000&&decisions<16) {
    const started=performance.now();const r=await e.findBestAction(s,4000-totalMs);totalMs+=performance.now()-started;decisions++;
    if(totalMs>4050)break; // late old-engine results are not free extra thinking
    const a=r.plan.actions[0];if(!a||!isLegalAction(s,a)){illegal=true;break;}s=applyAction(s,a);
  }
  rows.push({fixture:f.name,version,cleared:!s.board.units.some(u=>u.id===f.targetId),totalMs,decisions,illegal});
  writeFileSync(`${out}/outcomes.json`,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.at(-1)));
}
writeFileSync(`${out}/method.json`,JSON.stringify({difficulty:'medium',turnAllowanceMs:4000,lateToleranceMs:50,productionSource:'e70a057',note:'Authored rescue puzzles, both seats. Production RNG was not seedable. Reference source archived separately; no global Math.random replacement. This is not a representative league or throughput comparison.'},null,2)+'\n');
