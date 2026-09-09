import { createInitialGameState, createUnit } from '../../src/game/board';
import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
export interface TacticalFixture { name: string; state: GameState; targetId: string; expected: 'proved' | 'disproved'; witness?: AIAction[] }
function fixture(name: string, defenders: [string, number, number][], invader = 'metal_3', actions = 6, resources = 0, placement = false): TacticalFixture {
  const state = createInitialGameState();
  state.board.units = [createUnit(invader, 'black', { x: 0, y: 0 }), ...defenders.map(([d,x,y]) => createUnit(d, 'white', {x,y}))];
  state.board.units.forEach((u, i) => { u.id = i === 0 ? 'invader' : `defender-${i}`; u.placedThisTurn = false; });
  state.turn.actionsRemaining = actions; state.turn.phase = placement ? 'place' : 'action';
  state.players.white.resources = resources; state.players.white.resourcesGained = resources;
  return { name, state, targetId: 'invader', expected: 'proved' };
}
export function tacticalFixtures(): TacticalFixture[] {
  const simple = fixture('cheap invasion / one attack', [['fire_1',1,0]], 'lightning_1', 1);
  simple.witness = [{ type: 'ATTACK', unitId: 'defender-1', targetPosition: {x:0,y:0} }];
  const two = fixture('Metal III / two Shadow III', [['shadow_3',1,0],['shadow_3',0,1]], 'metal_3', 2);
  two.witness = [1,2].map(i => ({ type: 'ATTACK', unitId: `defender-${i}`, targetPosition: {x:0,y:0} }));
  const rotation = fixture('three attacker rotation', [['water_3',1,0],['water_3',0,1],['water_3',2,0]], 'metal_3', 5);
  rotation.witness = [
    {type:'ATTACK',unitId:'defender-1',targetPosition:{x:0,y:0}},
    {type:'ATTACK',unitId:'defender-2',targetPosition:{x:0,y:0}},
    {type:'MOVE',unitId:'defender-1',to:{x:1,y:1}},
    {type:'MOVE',unitId:'defender-3',to:{x:1,y:0}},
    {type:'ATTACK',unitId:'defender-3',targetPosition:{x:0,y:0}},
  ];
  const promo = fixture('promotion dependent rescue', [['shadow_2',1,0],['shadow_2',0,1]], 'metal_3', 6, 12, true);
  const noMoney = fixture('public bank / no promotion money', [['shadow_2',1,0],['shadow_2',0,1]], 'metal_3', 6, 0, true); noMoney.expected = 'disproved';
  const blocked = fixture('clear an adjacent lane', [['plant_1',1,0],['fire_1',2,0]], 'plant_1', 3);
  const longMove = fixture('multi-action approach', [['fire_1',5,0],['fire_1',0,1]], 'metal_3', 4);
  const impossible = fixture('too few actions for rotation', [['water_3',1,0],['water_3',0,1],['water_3',2,0]], 'metal_3', 3); impossible.expected = 'disproved';
  const zero = fixture('zero attack occupier', [['fire_1',1,0]], 'plant_1', 1);
  const attacked = fixture('same-target limit', [['fire_2',1,0],['fire_2',0,1]], 'metal_3', 6); attacked.state.board.units[1].attackedThisTurn = ['invader']; attacked.expected = 'disproved';
  const chip = fixture('damage remains during defender reply', [['fire_2',1,0]], 'metal_3', 1); chip.state.board.units[0].damageTaken = 2;
  const placed = fixture('newly placed unit cannot promote', [['shadow_2',1,0],['shadow_2',0,1]], 'metal_3', 6, 12, true); placed.state.board.units.slice(1).forEach(u => u.placedThisTurn = true); placed.expected = 'disproved';
  const noAct = fixture('ineligible defender', [['fire_3',1,0]], 'plant_1', 1); noAct.state.board.units[1].canActThisTurn = false; noAct.expected = 'disproved';
  const already = fixture('at most one promotion', [['shadow_2',1,0],['shadow_2',0,1]], 'metal_3', 6, 12, true); already.state.board.units.slice(1).forEach(u => u.promotedThisPlacement = true); already.expected = 'disproved';
  const list = [simple,two,rotation,promo,noMoney,blocked,longMove,impossible,zero,attacked,chip,placed,noAct,already];
  return list.flatMap(f => [f, rotate(f)]);
}
function rotate(f: TacticalFixture): TacticalFixture {
  const s = structuredClone(f.state), swap = (p: PlayerId) => p === 'white' ? 'black' : 'white';
  s.board.units = s.board.units.map(u => ({ ...u, owner: swap(u.owner), position: {x:9-u.position.x,y:9-u.position.y} }));
  const money = s.players.white.resources; s.players.white.resources = 0; s.players.white.resourcesGained = 0;
  s.players.black.resources = money; s.players.black.resourcesGained = money;
  s.turn.currentPlayer = 'black';
  return { ...f, name: `${f.name} / rotated black`, state: s, witness: f.witness?.map(a => a.type === 'MOVE' ? {...a,to:{x:9-a.to.x,y:9-a.to.y}} : a.type === 'ATTACK' ? {...a,targetPosition:{x:9-a.targetPosition.x,y:9-a.targetPosition.y}} : a) };
}
