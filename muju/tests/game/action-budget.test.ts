import { afterEach, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { getActionsPerTurn } from '../../src/game/rules';
import { applyAction } from '../../src/ai/simulate';
import { startTurn } from '../../src/game/turn';
import { gameReducer } from '../../src/hooks/useGameState';
import { loadGameState, RETIRED_STORAGE_KEY, saveGameState, SCHEMA_VERSION } from '../../src/utils/persistence';

afterEach(() => localStorage.clear());

/**
 * The budget under the only ruleset there is (Phasing, 2026-09-21): four actions
 * in Act, then `END_ACTION_PHASE` mines and pays upkeep without handing over, and
 * `END_PLACE_PHASE` ends the turn. Preparation is not a second helping of actions.
 */
for (const budget of [4] as const) {
  it(`${budget} actions persist through exhaustion, both players, preparation and rematch`, () => {
    let s = createInitialGameState(undefined,budget,0,'phasing');
    const hi = s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
    for(let i=0;i<budget;i++) s=applyAction(s,{type:'MOVE',unitId:hi.id,to:{x:i%2?1:2,y:0}});
    expect(s.turn.actionsRemaining).toBe(0);
    expect(applyAction(s,{type:'MOVE',unitId:hi.id,to:{x:2,y:0}})).toBe(s);
    // Mining and upkeep settle on the mover's own turn; the seat does not change.
    s=applyAction(s,{type:'END_ACTION_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'white',phase:'place',actionsRemaining:0});
    expect(s.players.white.resources).toBe(6);
    // Promotion belongs to Prepare, and does not hand back a fresh budget.
    const muju=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
    s=applyAction(s,{type:'PROMOTE_UNIT',unitId:muju.id});
    expect(s.board.units.find(u=>u.id===muju.id)?.definitionId).toBe('plant_2');
    expect(s.turn).toMatchObject({currentPlayer:'white',phase:'place',actionsRemaining:0});
    s=applyAction(s,{type:'END_PLACE_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'black',phase:'action',actionsRemaining:budget});
    s=applyAction(s,{type:'END_ACTION_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'black',phase:'place',actionsRemaining:0});
    s=applyAction(s,{type:'END_PLACE_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'white',phase:'action',actionsRemaining:budget,turnNumber:2});
    const reset=gameReducer(s,{type:'RESET_GAME'});
    expect(reset.ruleset).toBe('phasing');
    expect(reset.actionsPerTurn).toBe(budget);
    expect(reset.turn).toMatchObject({actionsRemaining:budget,turnNumber:1,phase:'action'});
  });
  it(`${budget} actions survive a pending upkeep choice and save/restore`, () => {
    const initial=createInitialGameState(undefined,budget,0,'phasing');
    // Both white units stand on exhausted squares, so mining cannot cover the
    // tier-2 rent and the choice of what to release is the player's.
    initial.board.units=[createUnit('fire_2','white',{x:3,y:0}),createUnit('plant_1','white',{x:4,y:1}),createUnit('fire_1','black',{x:8,y:8})];
    let s=startTurn(initial,'white');
    expect(s.upkeepPending).toBe(false);
    expect(s.turn).toMatchObject({phase:'action',actionsRemaining:budget});
    s=applyAction(s,{type:'END_ACTION_PHASE'});
    expect(s.upkeepPending).toBe(true);
    expect(s.players.white.resources).toBe(0);
    saveGameState(s); s=loadGameState()!;
    expect(s.upkeepPending).toBe(true);
    s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:s.board.units.filter(u=>u.owner==='white'&&u.definitionId==='plant_1').map(u=>u.id)});
    expect(s.upkeepPending).toBe(false);
    expect(s.turn).toMatchObject({phase:'place',actionsRemaining:0});
    expect(s.actionsPerTurn).toBe(budget);
    // And the budget the match was set up with is what the next seat receives.
    expect(applyAction(s,{type:'END_PLACE_PHASE'}).turn).toMatchObject({currentPlayer:'black',actionsRemaining:budget});
  });
}

/**
 * Six actions a turn, and the in-place upgrade of a save written under them, both
 * belong to the retired rules: `migrateLegacyGame` is gone (D7) and such a save is
 * archived for review instead of being re-counted into a four-action Phasing turn.
 * The archive contract itself lives in `tests/game/standard-save-archive.test.ts`.
 */
it('never upgrades a legacy six-action save; it is archived, not re-counted', () => {
  for (const oldBudget of [undefined,6,4]) for (const remaining of [0,2,4]) {
    localStorage.clear();
    const state={...createInitialGameState(),actionsPerTurn:oldBudget,inactivityPlies:9};
    state.turn.actionsRemaining=remaining;
    const raw=JSON.stringify({schemaVersion:5,state});
    localStorage.setItem('elemental-tactics-save',raw);
    expect(loadGameState()).toBeNull();
    expect(localStorage.getItem('elemental-tactics-save')).toBeNull();
    expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);
  }
});

it('restarts the quiet clock once for a pre-twenty-ply Phasing save, and re-stamps it', () => {
  const state={...createInitialGameState(undefined,4,0,'phasing'),inactivityPlies:9};
  localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:7,state}));
  const loaded=loadGameState()!;
  expect(loaded.board).toEqual(state.board);
  expect(loaded.actionsPerTurn).toBe(4);
  expect(loaded.turn.actionsRemaining).toBe(4);
  expect(loaded.inactivityPlies).toBe(0);
  expect(JSON.parse(localStorage.getItem('elemental-tactics-save')!).schemaVersion).toBe(SCHEMA_VERSION);
  // One whole Phasing turn is one ply; mining alone is not.
  expect(applyAction(loaded,{type:'END_ACTION_PHASE'}).inactivityPlies).toBe(0);
  const next=applyAction(applyAction(loaded,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
  saveGameState(next);
  expect(loadGameState()?.inactivityPlies).toBe(1);
});

it('keeps a completed Phasing result without reviving the game', () => {
  const state={...createInitialGameState(undefined,4,0,'phasing'),phase:'victory' as const,winner:'white' as const,victoryReason:'elimination' as const};
  state.turn.phase='place';state.turn.actionsRemaining=0;
  localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:7,state}));
  expect(loadGameState()).toMatchObject({actionsPerTurn:4,phase:'victory',winner:'white',turn:{phase:'place',actionsRemaining:0}});
});

it('rejects six actions and inconsistent current saves', () => {
  for(const bad of [6,5,0,'4',null]) {
    const state={...createInitialGameState(undefined,4,0,'phasing'),actionsPerTurn:bad};
    localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:6,state}));
    expect(loadGameState()).toBeNull();
    // Rejected by the strict gate, not archived: the save says Phasing, so the
    // retired slot must stay empty and only the bad budget is what refused it.
    expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBeNull();
    localStorage.clear();
  }
  const state=createInitialGameState(undefined,4,0,'phasing');state.turn.actionsRemaining=6;
  saveGameState(state);expect(loadGameState()).toBeNull();
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBeNull();
  expect(getActionsPerTurn(createInitialGameState(undefined,4,0,'phasing'))).toBe(4);
  expect(()=>createInitialGameState(undefined,6 as never,0,'phasing')).toThrow();
});
