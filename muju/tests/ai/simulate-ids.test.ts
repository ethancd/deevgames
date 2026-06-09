// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import type { GameState } from '../../src/game/types';

/**
 * Regression for SPEC_AUDIT divergence D13: simulate's generated IDs used
 * Date.now() + 3 random chars and could collide for units created in the
 * same millisecond. Duplicate unit IDs corrupt every by-ID board update
 * (an observed MOVE relocated two units at once — lab seed 1720018195).
 */
describe('simulate ID uniqueness (D13)', () => {
  it('mass same-millisecond queue/place never mints duplicate IDs', () => {
    let state: GameState = createInitialGameState();
    // give white a fat stockpile so we can queue a lot at once
    state = {
      ...state,
      players: {
        ...state.players,
        white: { ...state.players.white, resources: 100, resourcesGained: 100 },
      },
      turn: { ...state.turn, phase: 'queue' },
    };

    for (let i = 0; i < 60; i++) {
      state = applyAction(state, { type: 'QUEUE_UNIT', definitionId: 'fire_1' });
    }
    const queueIds = state.players.white.buildQueue.map((q) => q.id);
    expect(new Set(queueIds).size).toBe(queueIds.length);

    // make them all ready and place them in one burst
    state = {
      ...state,
      players: {
        ...state.players,
        white: {
          ...state.players.white,
          buildQueue: state.players.white.buildQueue.map((q) => ({ ...q, turnsRemaining: 0 })),
        },
      },
      turn: { ...state.turn, phase: 'place' },
    };

    for (const q of state.players.white.buildQueue) {
      const before = state.board.units.length;
      // scan for any open spawn square: place greedily row-major
      outer: for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          state = applyAction(state, { type: 'PLACE_UNIT', queuedUnitId: q.id, position: { x, y } });
          if (state.board.units.length > before) break outer;
        }
      }
    }

    const unitIds = state.board.units.map((u) => u.id);
    expect(unitIds.length).toBeGreaterThan(40); // most placements landed
    expect(new Set(unitIds).size).toBe(unitIds.length); // all unique
  });
});
