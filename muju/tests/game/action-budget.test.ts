import { afterEach, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { getActionsPerTurn } from '../../src/game/rules';
import { applyAction } from '../../src/ai/simulate';
import { startTurn } from '../../src/game/turn';
import { gameReducer } from '../../src/hooks/useGameState';
import { loadGameState, saveGameState } from '../../src/utils/persistence';

afterEach(() => localStorage.clear());

for (const budget of [4] as const) {
  it(`${budget} actions persist through exhaustion, both players, placement and rematch`, () => {
    let s = createInitialGameState(undefined,budget);
    const hi = s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
    for(let i=0;i<budget;i++) s=applyAction(s,{type:'MOVE',unitId:hi.id,to:{x:i%2?1:2,y:0}});
    expect(s.turn.actionsRemaining).toBe(0);
    expect(applyAction(s,{type:'MOVE',unitId:hi.id,to:{x:2,y:0}})).toBe(s);
    s=applyAction(s,{type:'END_ACTION_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'black',actionsRemaining:budget});
    expect(s.players.white.resources).toBe(6);
    s=applyAction(s,{type:'END_ACTION_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'white',phase:'place',actionsRemaining:budget});
    const muju=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
    s=applyAction(s,{type:'PROMOTE_UNIT',unitId:muju.id});
    expect(s.turn).toMatchObject({phase:'action',actionsRemaining:budget});
    const reset=gameReducer(s,{type:'RESET_GAME'});
    expect(reset.actionsPerTurn).toBe(budget);
    expect(reset.turn).toMatchObject({actionsRemaining:budget,turnNumber:1});
  });
  it(`${budget} actions survive a pending upkeep choice and save/restore`, () => {
    const initial=createInitialGameState(undefined,budget);
    initial.board.units=[createUnit('fire_2','white',{x:2,y:2}),createUnit('plant_1','white',{x:3,y:3}),createUnit('fire_1','black',{x:8,y:8})];
    let s=startTurn(initial,'white');
    expect(s.upkeepPending).toBe(true);
    saveGameState(s); s=loadGameState()!;
    s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:s.board.units.filter(u=>u.owner==='white'&&u.definitionId==='plant_1').map(u=>u.id)});
    expect(s.upkeepPending).toBe(false);
    expect(s.turn.actionsRemaining).toBe(budget);
    expect(s.actionsPerTurn).toBe(budget);
  });
}

it('upgrades old saves once, preserves the board, subtracts already-spent actions and starts a new clock', () => {
  for (const oldBudget of [undefined,6,4]) for (const remaining of [0,2,4]) {
    const state={...createInitialGameState(),actionsPerTurn:oldBudget,inactivityPlies:9};
    state.turn.actionsRemaining=remaining;
    localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:5,state}));
    const loaded=loadGameState()!;
    expect(loaded.board).toEqual(state.board);expect(loaded.actionsPerTurn).toBe(4);
    expect(loaded.turn.actionsRemaining).toBe(Math.max(0,4-((oldBudget??6)-remaining)));
    expect(loaded.inactivityPlies).toBe(0);
    expect(JSON.parse(localStorage.getItem('elemental-tactics-save')!).schemaVersion).toBe(6);
    const next=applyAction(loaded,{type:'END_ACTION_PHASE'});saveGameState(next);
    expect(loadGameState()?.inactivityPlies).toBe(1);
  }
});

it('migrates placement and completed results without reviving a game', () => {
  const state={...createInitialGameState(),actionsPerTurn:6,phase:'victory',winner:'white',victoryReason:'elimination'};
  state.turn.phase='place';state.turn.actionsRemaining=6;
  localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:5,state}));
  expect(loadGameState()).toMatchObject({actionsPerTurn:4,phase:'victory',winner:'white',turn:{actionsRemaining:4}});
});

it('rejects six actions and inconsistent current saves', () => {
  for(const bad of [6,5,0,'4',null]) {
    const state={...createInitialGameState(),actionsPerTurn:bad};
    localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:6,state}));
    expect(loadGameState()).toBeNull();
  }
  const state=createInitialGameState();state.turn.actionsRemaining=6;
  saveGameState(state);expect(loadGameState()).toBeNull();
  expect(getActionsPerTurn(createInitialGameState())).toBe(4);
  expect(()=>createInitialGameState(undefined,6 as never)).toThrow();
});
