/** Correctness/playing-strength runner. No JS-vs-WASM microbenchmark claims. */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { instantiateTactics } from '../../src/ai/wasm/kernel';
import { AIEngineV2, TURN_BUDGET_MS } from '../../src/ai/engine-v2';
import { SearchBudget } from '../../src/ai/runtime';
import { tacticalFixtures } from './fixtures';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { playGame } from '../harness/runner';
import { createBot } from '../harness/bots';
import type { EngineBot, GameRecord } from '../harness/types';
import type { AIDifficulty } from '../../src/ai/types';
import { gzipSync } from 'node:zlib';
const mode=process.argv[2]??'tactics', out=process.argv[3]??`lab/results/ai-wasm-${mode}-${Date.now()}`;
if(existsSync(out))throw new Error(`Refusing to overwrite results: ${out}`);mkdirSync(out,{recursive:true});
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const bytes=readFileSync('src/ai/wasm/tactics.wasm'), started=performance.now(), solver=await instantiateTactics(bytes);
const coldInstantiateMs=performance.now()-started;
const sourceFiles=execFileSync('rg',['--files','src','assembly'],{encoding:'utf8'}).trim().split('\n').sort();
const sourceHash=createHash('sha256');for(const file of sourceFiles) {sourceHash.update(file);sourceHash.update(readFileSync(file));}
const metadata={schema:'muju-ai-validation-v1',mode,base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceSha256:sourceHash.digest('hex'),sourceDiffSha256:sha(Buffer.from(execFileSync('git',['diff'],{encoding:'utf8'}))),catalogueSha256:sha(readFileSync('src/game/units.ts')),
  wasmSha256:sha(bytes),wasmBytes:bytes.length,wasmGzipBytes:gzipSync(bytes).length,coldInstantiateMs,
  runtime:process.version,device:`${platform()} ${arch()} ${cpus()[0].model}`,seed:20260907};
writeFileSync(`${out}/metadata.json`,JSON.stringify(metadata,null,2)+'\n');
if(mode==='tactics') {
  const rows=[];
  for(const f of tacticalFixtures()) {
    const b=new SearchBudget(), result=solver(f.state,f.targetId,600000,b);
    const solverMs=b.finish().elapsedMs;
    if(result.status!==f.expected)throw new Error(`Wrong proof status: ${f.name}`);
    for(const difficulty of ['easy','medium','hard'] as const) {
      const engine=new AIEngineV2(difficulty);engine.setSeed(metadata.seed);engine.setTacticalSolver(solver);
      let state=f.state, remaining=TURN_BUDGET_MS[difficulty], decisions=0, elapsed=0;
      while(state.phase==='playing' && state.turn.currentPlayer===f.state.turn.currentPlayer && state.board.units.some(u=>u.id===f.targetId) && decisions<16) {
        const r=await engine.findBestAction(state,remaining);remaining=Math.max(0,remaining-r.timeMs);elapsed+=r.timeMs;decisions++;
        const a=r.plan.actions[0];if(!a || !isLegalAction(state,a))throw new Error('Invalid tactical dispatch');state=applyAction(state,a);
        if(f.expected==='disproved')break; // testing proof status, not prescribing futile play
      }
      rows.push({name:f.name,difficulty,expected:f.expected,status:result.status,nodes:result.nodes,solverMs,
        cleared:!state.board.units.some(u=>u.id===f.targetId),decisions,decisionTotalMs:elapsed});
    }
  }
  writeFileSync(`${out}/tactics.json`,JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify({out,fixtures:tacticalFixtures().length,decisions:rows.length,expectedRescues:rows.filter(r=>r.expected==='proved').length,cleared:rows.filter(r=>r.expected==='proved'&&r.cleared).length}));
} else if(mode==='league') {
  // Explicit screening override; never label these results as the UI ladder.
  const opponents=(process.env.AI_OPPONENTS??'Rush,Expand,Balanced,Turtle,Tier1Spam,MiningDenial,AntiRush,Random').split(',');
  const rounds=Number(process.env.AI_ROUNDS??20), work=Number(process.env.AI_WORK??1200);
  const difficulty=(process.env.AI_DIFFICULTY??'medium') as AIDifficulty;
  const rows:GameRecord[]=[];
  for(const name of opponents)for(const seat of ['white','black'] as const) {
    let engine:AIEngineV2;
    const bot:EngineBot={kind:'engine',name:`WASM-${difficulty}-screen-${work}`,onGameStart(_p,seed){engine=new AIEngineV2(difficulty);engine.setSeed(seed);engine.setTacticalSolver(solver);engine.setConfig({fixedWork:work,mctsIterations:30});},async nextAction(s){return (await engine.findBestAction(s)).plan.actions[0]??null;}};
    const result=await playGame({bots:seat==='white'?{white:bot,black:createBot(name)}:{white:createBot(name),black:bot},seed:metadata.seed,engineHash:metadata.sourceDiffSha256,runId:`wasm-screen-${name}-${seat}`,options:{maxTurns:rounds,legality:'strict',recordReplay:false}});
    rows.push(result.record);writeFileSync(`${out}/games.json`,JSON.stringify(rows,null,2)+'\n');
    console.log(JSON.stringify({opponent:name,seat,winner:result.record.winner,reason:result.record.winType,turns:result.record.turns,durationMs:result.record.durationMs}));
  }
  const natural=rows.filter(r=>['elimination','home-occupation','resignation'].includes(r.winType));
  writeFileSync(`${out}/summary.json`,JSON.stringify({games:rows.length,naturalGames:natural.length,caps:rows.length-natural.length,
    candidateWins:natural.filter(r=>r.winner && r.players[r.winner].bot.startsWith('WASM-')).length,
    illegalActions:rows.reduce((n,r)=>n+r.players.white.illegalActions+r.players.black.illegalActions,0),
    note:'Fixed-work screening, one seed block, both seats. Caps are not victories; not a measured difficulty ladder.'},null,2)+'\n');
} else throw new Error(`Unknown mode ${mode}`);
