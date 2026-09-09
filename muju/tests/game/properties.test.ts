// @vitest-environment node
import {it,expect} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {getUnitDefinition} from '../../src/game/units';
import {generateAllActions} from '../../src/ai/moves';
import {applyAction} from '../../src/ai/simulate';
import {gameReducer} from '../../src/hooks/useGameState';
import {checkInvariants} from '../../lab/harness/invariants';
import {seededRandom} from '../../src/ai/runtime';
for(let seed=1;seed<=20;seed++)it(`full-state invariants and reducer/search equality, seed ${seed}`,()=>{
 let state=createInitialGameState();const rng=seededRandom(seed);
 for(let ply=0;ply<500&&state.phase==='playing';ply++){
  const legal=generateAllActions(state,state.turn.currentPlayer);expect(legal.length).toBeGreaterThan(0);
  const action=legal[Math.floor(rng()*legal.length)],before=state;
  const copy=structuredClone(before);state=applyAction(state,action);expect(state).not.toBe(before);expect(before).toEqual(copy);
  expect(gameReducer(before,action)).toEqual(state);checkInvariants(state,`${seed}/${ply}`);
  for(let y=0;y<10;y++)for(let x=0;x<10;x++)expect(state.board.cells[y][x].resourceLayers).toBeLessThanOrEqual(before.board.cells[y][x].resourceLayers);
  if(action.type==='BUY_UNIT'){expect(getUnitDefinition(action.definitionId).tier).toBe(1);expect(state.board.units.at(-1)?.placedThisTurn).toBe(true);}
  if(action.type==='PROMOTE_UNIT'){const u=before.board.units.find(u=>u.id===action.unitId)!;expect(u.placedThisTurn).not.toBe(true);expect(u.promotedThisPlacement).not.toBe(true);}
 }
},15000);
