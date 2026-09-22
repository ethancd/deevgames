import {afterEach,it,expect} from 'vitest';
import {act,renderHook} from '@testing-library/react';
import {useGameState} from '../../src/hooks/useGameState';
import {saveGameState} from '../../src/utils/persistence';
import {createInitialGameState} from '../../src/game/board';
import {INACTIVITY_LIMIT} from '../../src/game/inactivity';
/**
 * Pass & play under the only ruleset there is (Phasing, 2026-09-21). Mining and
 * upkeep happen inside the mover's own turn at Mine & prepare, so they are
 * undoable like any other step; the turn closes at End turn, and nothing
 * reaches back across that handover.
 */
const phasing=(layout?:readonly number[])=>createInitialGameState(layout??undefined,4,0,'phasing');
afterEach(()=>localStorage.clear());
it('undo stays within the turn, including mining; the handover closes it, even on the draw boundary',()=>{
 const {result,unmount}=renderHook(()=>useGameState());
 const hi=result.current.state.board.units[0],before=result.current.state;
 expect(before.ruleset).toBe('phasing');
 act(()=>result.current.moveUnit(hi.id,{x:2,y:0}));expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state).toEqual(before);
 act(()=>result.current.endActionPhase());
 expect(result.current.state.players.white.resources).toBe(6);
 expect(result.current.state.turn).toMatchObject({currentPlayer:'white',phase:'place'});
 // Mining is the mover's own step, so it is still the mover's to take back.
 expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state).toEqual(before);
 act(()=>result.current.endActionPhase());
 act(()=>result.current.endPlacePhase());
 expect(result.current.state.turn).toMatchObject({currentPlayer:'black',phase:'action',actionsRemaining:4});
 expect(result.current.canUndo).toBe(false);
 unmount();
 const draw=phasing(Array(100).fill(0));draw.inactivityPlies=INACTIVITY_LIMIT-1;saveGameState(draw);
 const h=renderHook(()=>useGameState());
 act(()=>h.result.current.endActionPhase());expect(h.result.current.state.phase).toBe('playing');
 // The quiet clock is read at the handover, not at Mine & prepare.
 act(()=>h.result.current.endPlacePhase());
 expect(h.result.current.state.phase).toBe('victory');expect(h.result.current.canUndo).toBe(false);h.unmount();
});
it('spending the last three crystals commits a summon and is undoable until the handover',()=>{
 const s=phasing();s.turn.phase='place';s.players.white.resources=3;s.players.white.resourcesGained=3;saveGameState(s);
 const {result,unmount}=renderHook(()=>useGameState());act(()=>result.current.buyUnit('fire_1',{x:0,y:0}));
 // A purchase is a public commitment, not a placement: preparation stays open,
 // the crystals are gone and the board has not changed.
 expect(result.current.state.turn).toMatchObject({phase:'place',currentPlayer:'white'});
 expect(result.current.state.players.white.resources).toBe(0);
 expect(result.current.state.pendingSummons).toMatchObject([{owner:'white',definitionId:'fire_1',position:{x:0,y:0}}]);
 expect(result.current.state.board.units).toEqual(s.board.units);
 expect(result.current.canUndo).toBe(true);
 act(()=>result.current.undo());expect(result.current.state).toEqual(s);unmount();
});

it('undo walks back through promoting without losing resources or unit flags',()=>{
 const s=phasing();s.turn.phase='place';s.players.white.resources=20;saveGameState(s);
 const unit=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
 const {result,unmount}=renderHook(()=>useGameState());
 act(()=>result.current.promoteUnit(unit.id));const promoted=result.current.state;
 expect(promoted.board.units.find(u=>u.id===unit.id)?.definitionId).toBe('fire_2');
 // Promotion belongs to Prepare and does not end it.
 expect(promoted.turn).toMatchObject({phase:'place',currentPlayer:'white'});
 act(()=>result.current.undo());expect(result.current.state).toEqual(s);expect(result.current.canUndo).toBe(false);
 act(()=>result.current.promoteUnit(unit.id));expect(result.current.state).toEqual(promoted);
 act(()=>result.current.endPlacePhase());
 expect(result.current.state.turn.currentPlayer).toBe('black');expect(result.current.canUndo).toBe(false);
 unmount();
});
