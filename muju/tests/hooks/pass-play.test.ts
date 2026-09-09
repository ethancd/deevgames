import {it,expect} from 'vitest';
import {act,renderHook} from '@testing-library/react';
import {useGameState} from '../../src/hooks/useGameState';
import {saveGameState} from '../../src/utils/persistence';
import {createInitialGameState} from '../../src/game/board';
it('undo stays within the turn; passive income is irreversible even on the draw boundary',()=>{
 const {result,unmount}=renderHook(()=>useGameState());
 const hi=result.current.state.board.units[0],before=result.current.state;
 act(()=>result.current.moveUnit(hi.id,{x:2,y:0}));expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state).toEqual(before);
 act(()=>result.current.endActionPhase());expect(result.current.state.players.white.resources).toBe(6);expect(result.current.canUndo).toBe(false);
 act(()=>result.current.endActionPhase());expect(result.current.state.turn.phase).toBe('place');
 act(()=>result.current.endPlacePhase());expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state.turn.phase).toBe('place');unmount();
 const draw=createInitialGameState(Array(100).fill(0));draw.inactivityPlies=9;saveGameState(draw);
 const h=renderHook(()=>useGameState());act(()=>h.result.current.endActionPhase());expect(h.result.current.state.phase).toBe('victory');expect(h.result.current.canUndo).toBe(false);h.unmount();
});
it('spending the last crystal finishes placement, permits haste and is undoable until turn end',()=>{
 const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=1;s.players.white.resourcesGained=1;saveGameState(s);
 const {result,unmount}=renderHook(()=>useGameState());act(()=>result.current.buyUnit('fire_1',{x:0,y:0}));
 expect(result.current.state.turn).toMatchObject({phase:'action',currentPlayer:'white',actionsRemaining:6});expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state).toEqual(s);unmount();
});
