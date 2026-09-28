import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { generatePlacePhaseActions } from '../../src/ai/moves';
import { checkInvariants } from '../../lab/harness/invariants';
import { isBlackCrystalHandicap } from '../../src/game/rules';
import { gameReducer } from '../../src/hooks/useGameState';

describe('Black crystal handicap', () => {
  it.each(Array.from({ length: 21 }, (_, i) => i === 0 ? 0 : i - 0.5))('starts with exactly %i crystals and uses the affordable opening phase', amount => {
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
    let state = applyAction(createInitialGameState(undefined, undefined, 19.5), { type: 'END_ACTION_PHASE' });
    const purchase = generatePlacePhaseActions(state, 'black').find(a => a.type === 'BUY_UNIT' && a.definitionId === 'fire_1')!;
    state = applyAction(state, purchase);
    expect(state.players.black.resources).toBe(16.5);
    const hi = state.board.units.find(u => u.owner === 'black' && u.definitionId === 'fire_1' && !u.placedThisTurn)!;
    state = applyAction(state, { type: 'PROMOTE_UNIT', unitId: hi.id });
    expect(state.players.black.resources).toBe(12.5);
    expect(state.board.units.find(u => u.id === hi.id)?.definitionId).toBe('fire_2');
    expect(state.turn.actionsRemaining).toBe(4);
    checkInvariants(state, 'spent grant');
    expect(gameReducer(state, { type: 'RESET_GAME' })).toMatchObject({ blackCrystalHandicap: 19.5, players: { black: { resources: 19.5, resourcesGained: 0 } } });
  });

  it.each([-1, 20, 1, 2, 0.25, 20.5, NaN, Infinity])('rejects invalid grant %s', amount => {
    expect(isBlackCrystalHandicap(amount)).toBe(false);
  });
});
