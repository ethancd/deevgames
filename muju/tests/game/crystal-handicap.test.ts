import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { generatePlacePhaseActions } from '../../src/ai/moves';
import { checkInvariants } from '../../lab/harness/invariants';
import { gameReducer } from '../../src/hooks/useGameState';

describe('Black crystal handicap', () => {
  it.each(Array.from({ length: 21 }, (_, i) => i))('starts with exactly %i crystals and uses the affordable opening phase', amount => {
    const initial = createInitialGameState(undefined, undefined, amount);
    expect(initial.players.white.resources).toBe(0);
    expect(initial.players.black).toMatchObject({ resources: amount, resourcesGained: 0 });
    expect(initial.turn).toMatchObject({ currentPlayer: 'white', phase: 'action', actionsRemaining: 4 });
    checkInvariants(initial, 'handicap start');
    const black = applyAction(initial, { type: 'END_ACTION_PHASE' });
    expect(black.turn).toEqual({ currentPlayer: 'black', phase: amount < 3 ? 'action' : 'place', turnNumber: 1, actionsRemaining: 4 });
    expect(black.players.black.resources).toBe(amount);
    const actions = amount < 3 ? black : applyAction(black, { type: 'END_PLACE_PHASE' });
    const white = applyAction(actions, { type: 'END_ACTION_PHASE' });
    expect(white.players.black.resources).toBe(amount + white.lastIncome!.total);
    expect(white.players.black.resourcesGained).toBe(white.lastIncome!.total);
    checkInvariants(white, 'after first black turn');
  });

  it('spends the grant on purchases and promotions without spending actions; reset restores the grant', () => {
    let state = applyAction(createInitialGameState(undefined, undefined, 20), { type: 'END_ACTION_PHASE' });
    const purchase = generatePlacePhaseActions(state, 'black').find(a => a.type === 'BUY_UNIT' && a.definitionId === 'fire_1')!;
    state = applyAction(state, purchase);
    expect(state.players.black.resources).toBe(17);
    const hi = state.board.units.find(u => u.owner === 'black' && u.definitionId === 'fire_1' && !u.placedThisTurn)!;
    state = applyAction(state, { type: 'PROMOTE_UNIT', unitId: hi.id });
    expect(state.players.black.resources).toBe(13);
    expect(state.board.units.find(u => u.id === hi.id)?.definitionId).toBe('fire_2');
    expect(state.turn.actionsRemaining).toBe(4);
    checkInvariants(state, 'spent grant');
    expect(gameReducer(state, { type: 'RESET_GAME' })).toMatchObject({ blackCrystalHandicap: 20, players: { black: { resources: 20, resourcesGained: 0 } } });
  });

  it.each([-1, 21, 1.5, NaN, Infinity])('rejects invalid grant %s', amount => {
    expect(() => createInitialGameState(undefined, undefined, amount)).toThrow(/handicap/);
  });
});
