import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { resolveSummons } from '../../src/game/summoning';
import { emptyRecording, recordAction } from '../../src/game/replay';
import { incomingFrames } from '../../src/online/incomingPlayback';
import { transitionSounds, useGameSounds } from '../../src/sound/useGameSounds';
import { SoundProvider } from '../../src/sound/SoundProvider';
import { SoundEngine } from '../../src/sound/effects';
import type { GameState } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const initial = () => createInitialGameState(undefined, 4, 0, 'phasing');
const prepare = (s: GameState) => applyAction(s, { type: 'END_ACTION_PHASE' });
const end = (s: GameState) => applyAction(s, { type: 'END_PLACE_PHASE' });

it('uses distinct move, capture and surviving-hit cues from actual combat results', () => {
  const before = initial();
  const fire = createUnit('fire_1', 'white', {x:2,y:3});
  before.board.units = [fire, createUnit('plant_1','black',{x:3,y:3}), createUnit('water_1','black',{x:9,y:9})];
  const moved = applyAction(before, {type:'MOVE',unitId:fire.id,to:{x:2,y:4}});
  expect(transitionSounds(before,moved)).toEqual(['move']);
  const killed = applyAction(before, {type:'ATTACK',unitId:fire.id,targetPosition:{x:3,y:3}});
  expect(killed.board.units).toHaveLength(2);
  expect(transitionSounds(before,killed)).toEqual(['capture']);
  before.board.units[1].definitionId = 'water_3';
  const hit = applyAction(before, {type:'ATTACK',unitId:fire.id,targetPosition:{x:3,y:3}});
  expect(hit.board.units).toHaveLength(3);
  expect(transitionSounds(before,hit)).toEqual(['attack']);
  expect(transitionSounds(hit,before)).toEqual([]);
});

it('distinguishes phasing commitment, actual arrival and promotion; disruption stays quiet', () => {
  const before = prepare(initial());
  const pending = applyAction(before,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:0,y:0}});
  expect(transitionSounds(before,pending)).toEqual(['phase']);
  expect(transitionSounds(pending,before)).toEqual([]);
  const black = end(pending), blackReady = prepare(black), arrived = end(blackReady);
  expect(transitionSounds(pending,black,'white')).toEqual(['turnEnd']);
  expect(transitionSounds(pending,black,'black')).toEqual(['turnStart']);
  expect(transitionSounds(blackReady,arrived,'white')).toEqual(['arrive','turnStart']);
  expect(transitionSounds(blackReady,arrived)).toEqual(['turnEnd','arrive','turnStart']);
  const ready = prepare(arrived);
  const promoted = applyAction(ready,{type:'PROMOTE_UNIT',unitId:pending.pendingSummons![0].id});
  expect(transitionSounds(ready,promoted)).toEqual(['promote']);
  expect(transitionSounds(promoted,ready)).toEqual([]);
  const blocked = structuredClone(pending);
  blocked.board.units.push(createUnit('fire_1','black',{x:0,y:0}));
  const disrupted = resolveSummons(blocked,'white');
  expect(disrupted.lastSummoning?.summoned).toHaveLength(0);
  expect(transitionSounds(blocked,disrupted)).toEqual([]);
});

it('sounds a committed summon and does not treat upkeep release or its undo as a capture/landing', () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  state.turn.phase = 'place'; state.players.white.resources = 10;
  const committed = applyAction(state,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:0,y:0}});
  // A purchase is a commitment, not a landing: the landing sound belongs to the
  // arrival next turn, which the case above already pins.
  expect(transitionSounds(state,committed)).toEqual(['phase']);
  expect(transitionSounds(committed,state)).toEqual([]);
  state.upkeepPending = true;
  state.board.units[0].definitionId = 'fire_2';
  const released = applyAction(state,{type:'PAY_UPKEEP',keepUnitIds:state.board.units.slice(1).filter(u=>u.owner==='white').map(u=>u.id)});
  expect(released.board.units).toHaveLength(state.board.units.length-1);
  expect(transitionSounds(state,released)).toEqual([]);
  expect(transitionSounds(released,state)).toEqual([]);
});

it('does not play on mounting, selection, illegal actions, undo, review, reset or clock-only snapshots', () => {
  const play = vi.spyOn(SoundEngine.prototype,'play').mockImplementation(()=>{});
  const wrapper = ({children}: {children: React.ReactNode}) => <StrictMode><SoundProvider>{children}</SoundProvider></StrictMode>;
  const start = initial(), unit = start.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  const moved = applyAction(start,{type:'MOVE',unitId:unit.id,to:{x:3,y:0}});
  const {rerender} = renderHook(({state,quiet})=>useGameSounds({state,quiet,replay:null}),{wrapper,initialProps:{state:start,quiet:false}});
  rerender({state:{...start,selectedUnit:unit.id},quiet:false});
  rerender({state:applyAction(start,{type:'MOVE',unitId:unit.id,to:{x:9,y:9}}),quiet:false});
  expect(play).not.toHaveBeenCalled();
  rerender({state:moved,quiet:false});
  expect(play.mock.calls).toEqual([[['move']]]);
  rerender({state:{...moved},quiet:false});
  rerender({state:start,quiet:false});
  rerender({state:moved,quiet:true});
  rerender({state:start,quiet:false});
  rerender({state:initial(),quiet:false});
  expect(play).toHaveBeenCalledTimes(1);
});

it('sounds each visible incoming hop once, then only the receiving player’s turn-start cue', () => {
  const play = vi.spyOn(SoundEngine.prototype,'play').mockImplementation(()=>{});
  const state=initial(),unit=state.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  const actions = [{type:'MOVE',unitId:unit.id,to:{x:6,y:0}},{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}] as const;
  const before:RoomSnapshot={id:'sound',revision:1,ready:true,state,seats:{white:'W',black:'B'},history:[],updatedAt:'now'};
  const next={...before,revision:2,state:actions.reduce(applyAction,state),history:[{revision:2,player:'white' as const,actions:[...actions]}]};
  const frames=incomingFrames(before,next,'black');
  const {rerender}=renderHook(({state})=>useGameSounds({state,replay:null,quiet:false,viewer:'black'}),{
    initialProps:{state},wrapper:SoundProvider});
  for(const frame of frames) act(()=>rerender({state:frame.state}));
  rerender({state:next.state});
  expect(play.mock.calls).toEqual([[['move']],[['move']],[['move']],[['turnStart']]]);
});

it('sounds forward instant replay steps but stays quiet on entering, rewinding and returning to live', () => {
  const play=vi.spyOn(SoundEngine.prototype,'play').mockImplementation(()=>{});
  const state=initial(),unit=state.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  const action={type:'MOVE',unitId:unit.id,to:{x:6,y:0}} as const;
  const after=applyAction(state,action),replay=recordAction(emptyRecording(),state,action,after).current!;
  const {rerender}=renderHook(({step})=>useGameSounds({state:after,quiet:false,replay:step===null?null:{replay,step}}),{
    wrapper:SoundProvider,initialProps:{step:null as number|null}});
  rerender({step:0}); expect(play).not.toHaveBeenCalled();
  for(const step of [1,2,1,2,3])rerender({step});
  expect(play.mock.calls).toEqual([[['move']],[['move']],[['move']],[['move']]]);
  rerender({step:null}); expect(play).toHaveBeenCalledTimes(4);
});
