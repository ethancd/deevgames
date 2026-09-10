import {it,expect} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {generatePlaceActions} from '../../src/ai/moves';
import {applyAction} from '../../src/ai/simulate';
import {gameReducer} from '../../src/hooks/useGameState';
it('mass purchases use unique deterministic IDs identical in reducer and search',()=>{
 let s=createInitialGameState();s.turn.phase='place';s.players.white.resources=100;s.players.white.resourcesGained=100;s.board.units[1].position={x:7,y:7};
 for(let i=0;i<30;i++){const a=generatePlaceActions(s,'white').find(a=>a.type==='BUY_UNIT'&&a.definitionId==='fire_1')!;expect(a).toBeDefined();const next=applyAction(s,a);expect(gameReducer(s,a)).toEqual(next);s=next;}
 expect(new Set(s.board.units.map(u=>u.id)).size).toBe(s.board.units.length);expect(s.players.white.resources).toBe(40);
});
