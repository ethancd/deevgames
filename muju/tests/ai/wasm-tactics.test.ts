// @vitest-environment node
import { passTurn } from '../../src/ai/planner/turn';
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { SearchBudget, seededRandom } from '../../src/ai/runtime';
import { referenceTactics } from '../../src/ai/tactics/home';
import { phasingTacticalFixtures } from '../../lab/ai/fixtures';
import { applyAction, applyActions } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { generateAllActions } from '../../src/ai/moves';
import { AIEngineV2 } from '../../src/ai/engine-v2';
let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
it('a combat witness can end early in real play because its approach move delivers checkmate', async () => {
  const state = createInitialGameState();
  const invader = createUnit('metal_3', 'white', { x: 8, y: 9 });
  const target = createUnit('plant_1', 'black', { x: 9, y: 8 }); target.damageTaken = 1;
  state.board.units = [invader, target, createUnit('plant_1', 'white', { x: 8, y: 8 })];
  for (const solve of [referenceTactics, solver]) {
    const witness = solve(state, target.id, 10000, new SearchBudget());
    expect(witness.status).toBe('proved');
    expect(applyActions(state, witness.actions)).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'home-checkmate' });
  }
  const engine = new AIEngineV2('medium'); engine.setTacticalSolver(solver); engine.setConfig({ fixedWork: 1000 });
  const result = await engine.findBestAction(state);
  expect(applyActions(state, result.plan.actions).winner).toBe('white');
});
it('the AI chooses a raid that checkmates after its Phasing upkeep', async () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  state.board.units = [createUnit('fire_1', 'white', { x: 9, y: 8 }), createUnit('fire_1', 'black', { x: 4, y: 4 })];
  const engine = new AIEngineV2('medium'); engine.setTacticalSolver(solver); engine.setConfig({ fixedWork: 1000 });
  const result = await engine.findBestAction(state);
  expect(result.plan.actions[0]).toMatchObject({ type: 'MOVE', to: { x: 9, y: 9 } });
  expect(passTurn(applyActions(state, result.plan.actions)).victoryReason).toBe('home-checkmate');
});
for (const actionsPerTurn of [4] as const) for (const phase of ['action','place'] as const) {
  it(`${actionsPerTurn}-action ${phase} rescue uses the match budget in JS and WASM`, () => {
    const s=createInitialGameState(undefined,actionsPerTurn,0,'phasing');s.turn.phase=phase;
    const target=createUnit('metal_3','black',{x:0,y:0});
    s.board.units=[target,createUnit('fire_1','white',{x:4,y:0}),createUnit('lightning_1','white',{x:0,y:3})];
    for(const solve of [referenceTactics,solver]) {
      const result=solve(s,target.id,100000,new SearchBudget());
      expect(result.status).toBe(phase === 'place' ? 'unknown' : 'disproved');
      if(result.status==='proved') expect(applyActions(s,result.actions).board.units.some(u=>u.id===target.id)).toBe(false);
    }
  });
}
for (const f of phasingTacticalFixtures()) {
  it(`WASM: ${f.name}`, () => {
    const before = structuredClone(f.state);
    const result = solver(f.state, f.targetId, 600000, new SearchBudget());
    expect(result.status).toBe(f.expected); expect(f.state).toEqual(before);
    if (f.witness) { let s = f.state; for (const a of f.witness) { expect(isLegalAction(s,a)).toBe(true); s=applyAction(s,a); } expect(s.board.units.some(u=>u.id===f.targetId)).toBe(false); }
    if (result.status === 'proved') { let s = f.state; for (const a of result.actions) { expect(isLegalAction(s,a)).toBe(true); s=applyAction(s,a); } expect(s.board.units.some(u=>u.id===f.targetId)).toBe(false); }
  });
}
it('cutoffs never become impossibility proofs; aborted searches leave reusable buffers', () => {
  const f=phasingTacticalFixtures()[2];
  expect(solver(f.state,f.targetId,0,new SearchBudget()).status).toBe('unknown');
  expect(solver(f.state,f.targetId,600000,new SearchBudget(0)).status).toBe('unknown');
  expect(solver(f.state,f.targetId,600000,new SearchBudget()).status).toBe('proved');
});
it('matches the independent JS search on complete small fixtures', () => {
  for (const f of phasingTacticalFixtures().filter(f=>f.state.turn.actionsRemaining<=3 && f.state.turn.phase==='action')) {
    const reference=referenceTactics(f.state,f.targetId,100000,new SearchBudget());
    expect(reference.status).toBe(f.expected);
    expect(solver(f.state,f.targetId,100000,new SearchBudget()).status).toBe(reference.status);
  }
});
it('matches canonical transitions on seeded reachable positions (no false proofs)', () => {
  const rng=seededRandom(12007); let state=createInitialGameState(undefined, 4, 0, 'phasing'); let compared=0;
  for(let i=0;i<150;i++) {
    const legal=generateAllActions(state,state.turn.currentPlayer).filter(a=>isLegalAction(state,a)); if(!legal.length) break;
    state=applyAction(state,legal[Math.floor(rng()*legal.length)]);
    if(state.turn.phase!=='action'||state.phase!=='playing') continue;
    const limited={...state,turn:{...state.turn,actionsRemaining:Math.min(2,state.turn.actionsRemaining)}};
    for(const target of state.board.units.filter(u=>u.owner!==state.turn.currentPlayer)) {
      const a=solver(limited,target.id,20000,new SearchBudget()), b=referenceTactics(limited,target.id,20000,new SearchBudget());
      if(a.status!=='unknown' && b.status!=='unknown') {expect(a.status).toBe(b.status);compared++;}
    }
  }
  expect(compared).toBeGreaterThan(50);
});
it('Medium/Hard choose a full-turn rescue before mining, both seats', async () => {
  for (const difficulty of ['easy','medium','hard'] as const) for(const f of phasingTacticalFixtures().filter(f=>difficulty!=='easy'||f.state.turn.actionsRemaining===1)) {
    if(f.expected!=='proved') continue;
    const engine=new AIEngineV2(difficulty); engine.setTacticalSolver(solver); engine.setConfig({fixedWork:4000});
    const r=await engine.findBestAction(f.state);
    expect(r.debug?.topPlans[0].id).toMatch(/home-rescue|immediate-victory/);
    expect(r.plan.actions[0].type).not.toBe('MINE');
  }
});
it('a Phasing reply cannot promote before rescuing home',async()=>{
  const state=createInitialGameState(undefined, 4, 0, 'phasing');state.board.units=[createUnit('metal_3','white',{x:8,y:9}),createUnit('shadow_2','black',{x:9,y:8}),createUnit('shadow_2','black',{x:8,y:8}),createUnit('water_1','black',{x:0,y:5})];
  state.players.black.resourcesGained=24;state.players.black.resources=24;
  const engine=new AIEngineV2('hard');engine.setTacticalSolver(solver);engine.setConfig({fixedWork:1000});
  const result=await engine.findBestAction(state);
  // The actual Shadow II army cannot remove Metal III; banked promotions are too late.
  const mover=state.board.units[0];
  const invasion=applyAction(state,{type:'MOVE',unitId:mover.id,to:{x:9,y:9}});
  expect(referenceTactics({...invasion, phase:'playing', turn:{...invasion.turn, currentPlayer:'black', phase:'action', actionsRemaining:4}},mover.id,100000,new SearchBudget()).status).toBe('disproved');
  // The planner may first kill defenders, then invade. Independently verify any
  // resulting claim of safety instead of forbidding that stronger alternative.
  if(result.plan.score>=5000) {
    const planned=applyActions(state,result.plan.actions);
    const reply=planned.turn.currentPlayer==='white'?passTurn(planned):planned;
    if(reply.phase==='victory') expect(reply.winner).toBe('white');
    else expect(referenceTactics(reply,mover.id,100000,new SearchBudget()).status).toBe('disproved');
  }
});
it('differentially checks every catalogue pairing and damage threshold',async()=>{
  const {UNIT_DEFINITIONS}=await import('../../src/game/units');
  for(const attacker of UNIT_DEFINITIONS)for(const defender of UNIT_DEFINITIONS)for(const damage of Array.from({length:defender.defense+1},(_,i)=>i)) {
    const s=createInitialGameState(undefined, 4, 0, 'phasing');s.turn.actionsRemaining=1;
    s.board.units=[createUnit(attacker.id,'white',{x:1,y:0}),createUnit(defender.id,'black',{x:0,y:0})];
    s.board.units[1].damageTaken=damage;
    const target=s.board.units[1].id;
    const canonical=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:{x:0,y:0}});
    expect(solver(s,target,100,new SearchBudget()).status).toBe(canonical.board.units.some(u=>u.id===target)?'disproved':'proved');
  }
});
it('packs total attacks including dead targets, kill eligibility, and tier identically to JS',async()=>{
  const {UNIT_DEFINITIONS}=await import('../../src/game/units');
  for(const def of UNIT_DEFINITIONS) for(const count of [0,1,2,3,4]) for(const lastKill of [undefined,false,true]) {
    const s=createInitialGameState(undefined, 4, 0, 'phasing');s.turn.actionsRemaining=1;
    const attacker=createUnit(def.id,'white',{x:1,y:0});
    attacker.hasAttacked=count>0;attacker.attackedThisTurn=Array.from({length:count},(_,i)=>`dead-${i}`);attacker.lastAttackKilled=lastKill;
    const victim=createUnit('fire_1','black',{x:0,y:0});s.board.units=[attacker,victim];
    const canonical=applyAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:victim.position});
    const expected=canonical.board.units.some(u=>u.id===victim.id)?'disproved':'proved';
    expect(solver(s,victim.id,100,new SearchBudget()).status).toBe(expected);
    expect(referenceTactics(s,victim.id,100,new SearchBudget()).status).toBe(expected);
  }
});
for(const tier of [1,2]) it(`Tier ${tier} corridor requires kill, move, then another paid attack`,()=>{
  const s=createInitialGameState(undefined, 4, 0, 'phasing');s.turn.actionsRemaining=3;
  const attacker=createUnit(`fire_${tier}`,'white',{x:2,y:0});
  const victim=createUnit('fire_1','black',{x:0,y:0});
  s.board.units=[attacker,victim,createUnit('fire_1','black',{x:1,y:0}),...[0,1,2].map(x=>{
    const u=createUnit('metal_3','white',{x,y:1});u.canActThisTurn=false;return u;
  })];
  // muju-phasing-4: no tier cap, so the Tier I proves the corridor exactly as the Tier II does.
  const before=structuredClone(s);
  const result=solver(s,victim.id,10000,new SearchBudget());
  expect(result.status).toBe('proved');
  expect(referenceTactics(s,victim.id,10000,new SearchBudget()).status).toBe('proved');
  expect(s).toEqual(before);
  expect(result.actions.map(a=>a.type)).toEqual(['ATTACK','MOVE','ATTACK']);
  const after=applyActions(s,result.actions);
  expect(after.turn.actionsRemaining).toBe(0);
  expect(after.board.units.some(u=>u.id===victim.id)).toBe(false);
});

it.each([1,2])('Poṉ attacks at distance %s identically in JS and WASM without zero-speed traps', distance => {
  const state=createInitialGameState(undefined, 4, 0, 'phasing');
  const yan=createUnit('metal_1','white',{x:2,y:2}), target=createUnit('water_1','black',{x:2,y:2+distance});
  state.board.units=[yan,target,createUnit('plant_1','black',{x:8,y:8})];
  for(const solve of [referenceTactics,solver]) {
    const result=solve(state,target.id,10000,new SearchBudget());
    expect(result.status).toBe(distance===1?'proved':'disproved');
    if(result.status==='proved')expect(applyActions(state,result.actions).board.units.some(u=>u.id===target.id)).toBe(false);
  }
});
