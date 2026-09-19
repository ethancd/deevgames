import fs from 'node:fs';
import assert from 'node:assert/strict';
import {UNIT_DEFINITIONS as units} from '../src/game/units';
import {calculateAttackPower, resolveCombat,canAttack} from '../src/game/combat';
import {createEmptyBoard,createInitialGameState} from '../src/game/board';
import {getMoveCost} from '../src/game/movement';
import {getPromotionCost} from '../src/game/promotion';
import {endTurn} from '../src/game/turn';
import {UNEQUAL_ROUTES_MAP} from '../src/game/resourceMap';
import {unitEndOfTurnTake} from '../src/game/mining';
import type {Unit} from '../src/game/types';
const root = new URL('./', import.meta.url);
function unit(id:string,owner:'white'|'black',x:number):Unit {
 return {id:owner,definitionId:id,owner,position:{x,y:0},damageTaken:0,canActThisTurn:true,hasAttacked:false,attackedThisTurn:[],lastAttackKilled:false} as Unit;
}
const matrix=units.map(a=>({id:a.id,targets:units.filter(b=>{
 const attacker=unit(a.id,'white',0),defender=unit(b.id,'black',1);
 const expected=calculateAttackPower(attacker,defender)>=b.defense;
 const actual=resolveCombat({...createEmptyBoard(),units:[attacker,defender]},attacker.id,defender.position).eliminated;
 assert.equal(actual,expected,`${a.id} → ${b.id}`);return actual;
}).map(b=>b.id)}));
const bonks=matrix.map(a=>({...a,threats:matrix.filter(b=>b.targets.includes(a.id)).map(b=>b.id)}));

const demonstrations:string[]=[];
assert.equal(UNEQUAL_ROUTES_MAP.reduce((a,b)=>a+b,0),504);
assert.deepEqual([...new Set(UNEQUAL_ROUTES_MAP)].sort((a,b)=>a-b),[0,4,8,16]);
assert.deepEqual(UNEQUAL_ROUTES_MAP,[...UNEQUAL_ROUTES_MAP].reverse());
for(const square of ['A1','B1','C1','A2','B2','A3','J10','I10','H10','J9','I9','J8']){
 const x=square.charCodeAt(0)-65,y=Number(square.slice(1))-1;assert.equal(UNEQUAL_ROUTES_MAP[y*10+x],8);
}
for(const square of ['H2','I2','H3','I3','B8','C8','B9','C9']){
 const x=square.charCodeAt(0)-65,y=Number(square.slice(1))-1;assert.equal(UNEQUAL_ROUTES_MAP[y*10+x],16);
}
assert.deepEqual(units.filter(u=>u.element==='plant').map(u=>u.mining),[3,5,8]);
for(const [tier,mining] of [[1,3],[2,5],[3,8]]){
 for(const reserve of [0,2,8,16])assert.equal(unitEndOfTurnTake(unit(`plant_${tier}`,'white',0),{position:{x:0,y:0},resourceLayers:reserve} as any),Math.min(mining,reserve));
}
demonstrations.push('v2.8: home squares 8, expansions 16, map 504; Plant Mining 3/5/8, limited by the remaining reserve.');
const metal=units.filter(u=>u.element==='metal');
assert.deepEqual(metal.map(u=>[u.name,u.attack,u.defense,u.speed,u.mining]),[['Yan',1,3,0,3],['Mazask',1,4,1,4],['Tanka',2,5,2,5]]);
for(const u of metal)for(const reserve of [0,2,3,8,16])assert.equal(unitEndOfTurnTake(unit(u.id,'white',0),{position:{x:0,y:0},resourceLayers:reserve} as any),Math.min(u.mining,reserve));
const board=createEmptyBoard();
assert.equal(getMoveCost({x:2,y:2},{x:2,y:3},0,board),null);
demonstrations.push('v2.9: Yan/Mazask/Tanka are 1/3/0/3, 1/4/1/4, 2/5/2/5; Yan cannot move; adjacent attacks and reserve-limited income remain legal.');
assert.equal(getMoveCost({x:2,y:2},{x:2,y:5},2,board),2);demonstrations.push('R02: C3 to C6 at Speed 2 costs 2 of 4 actions.');
assert.equal(getMoveCost({x:3,y:6},{x:3,y:3},1,board)!+1,4);
assert.equal(getMoveCost({x:3,y:6},{x:3,y:2},1,board)!+1,5);
demonstrations.push('R08: D7 to D4 and attack fits 4; D7 to D3 and attack requires 5.');
for(const u of units)assert.equal(getPromotionCost(unit(u.id,'white',0)),u.tier===1?4:u.tier===2?8:null);
demonstrations.push('R06: all six elements use promotion costs 4 and 8, with no T4.');
const hono=unit('fire_2','white',1),left={...unit('plant_1','black',0),id:'left'},right={...unit('plant_1','black',2),id:'right'};
let b=resolveCombat({...board,units:[hono,left,right]},'white',left.position).board;
assert.equal(b.units.length,2);assert.equal(canAttack(b.units.find(u=>u.id==='white')!),true);
b=resolveCombat(b,'white',right.position).board;assert.equal(b.units.length,1);assert.equal(canAttack(b.units[0]),false);
demonstrations.push('R03: Hono kills two DEF-3 Muju, then has no third attack.');
const initial=createInitialGameState();assert.equal(initial.turn.actionsRemaining,4);
const ending=endTurn({...initial,phase:'playing',inactivityPlies:9,progressThisTurn:false});
assert.equal(ending.victoryReason,'inactivity');assert.equal(ending.winner,null);assert.ok(ending.players.white.resources>0);
demonstrations.push('R09: positive mining income on the tenth quiet turn still draws.');
fs.writeFileSync(new URL('catalog.json',root),JSON.stringify(units,null,2));
fs.writeFileSync(new URL('bonk-matrix.json',root),JSON.stringify(bonks,null,2));
fs.writeFileSync(new URL('map.json',root),JSON.stringify(UNEQUAL_ROUTES_MAP));
fs.writeFileSync(new URL('rules-verification.json',root),JSON.stringify({rules:'v2.9',fullHealth:true,adjacent:true,matchupChecks:324,demonstrations,passed:true,mapTotal:UNEQUAL_ROUTES_MAP.reduce((a,b)=>a+b,0)},null,2));
console.log('324 ordered matchups and revised movement, Cleave, promotion and draw demonstrations passed.');
