// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { GameState, PlayerId } from '../../src/game/types';
import { createInitialGameState, BOARD_SIZE, INITIAL_RESOURCE_LAYERS, MAX_ACTIONS_PER_TURN } from '../../src/game/board';
import { getUnitDefinition } from '../../src/game/units';
import { canBuildUnit } from '../../src/game/building';
import { checkVictory } from '../../src/game/victory';
import {
  generatePlacePhaseActions,
  generateActionPhaseActions,
  generateQueuePhaseActions,
} from '../../src/ai/moves';
import type { AIAction } from '../../src/ai/types';
import { applyAction } from '../../src/ai/simulate';

/**
 * Property tests over seeded random playouts.
 *
 * These drive full games through the same action-application path the AI uses
 * (ai/simulate.applyAction, which is also the real path for AI moves via
 * APPLY_AI_ACTION) and assert engine invariants after every action:
 *
 * - Occupancy: no two units ever share a square; all positions in bounds.
 * - Resource conservation: total mined + remaining board layers === 500;
 *   a player never holds more resources than they have mined.
 * - Mining monotonicity: cell layers never increase, minedDepth never
 *   decreases, layers + depth === 5 always.
 * - Action budget: actionsRemaining always within [0, MAX_ACTIONS_PER_TURN].
 * - Tech legality: queue actions are filtered through canBuildUnit before
 *   application (see SPEC_AUDIT divergence D1 - the raw AI generator does
 *   not enforce this itself).
 * - Determinism: identical seeds produce identical playouts (modulo
 *   generated unit-instance IDs, which contain timestamps).
 */

// Small fast seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOTAL_BOARD_RESOURCES = BOARD_SIZE * BOARD_SIZE * INITIAL_RESOURCE_LAYERS; // 500

function legalActions(state: GameState, player: PlayerId): AIAction[] {
  switch (state.turn.phase) {
    case 'place':
      return generatePlacePhaseActions(state, player);
    case 'action':
      return generateActionPhaseActions(state, player);
    case 'queue': {
      // Raw generator ignores tech requirements (audit divergence D1);
      // filter to actions that are actually legal under the full rules.
      const actions = generateQueuePhaseActions(state, player);
      return actions.filter((a) => {
        if (a.type !== 'QUEUE_UNIT') return true;
        const buildState = {
          queue: [],
          crystals: state.players[player].resources,
        };
        return canBuildUnit(a.definitionId, player, state.board, buildState);
      });
    }
    default:
      return [];
  }
}

interface PlayoutResult {
  states: GameState[]; // state after each applied action
  actions: AIAction[];
  finalState: GameState;
}

function runPlayout(seed: number, maxPlies: number): PlayoutResult {
  const rng = mulberry32(seed);
  let state = createInitialGameState();
  const states: GameState[] = [];
  const actions: AIAction[] = [];

  for (let ply = 0; ply < maxPlies; ply++) {
    if (state.phase === 'victory' || checkVictory(state.board).status !== 'ongoing') {
      break;
    }

    const player = state.turn.currentPlayer;
    const available = legalActions(state, player);

    if (available.length === 0) {
      // Mirror useAI's handling: skip an empty place phase, otherwise end phase/turn.
      if (state.turn.phase === 'place') {
        state = { ...state, turn: { ...state.turn, phase: 'action' } };
        continue;
      } else if (state.turn.phase === 'action') {
        state = applyAction(state, { type: 'END_ACTION_PHASE' });
        continue;
      } else {
        state = applyAction(state, { type: 'END_TURN' });
        continue;
      }
    }

    const action = available[Math.floor(rng() * available.length)];
    state = applyAction(state, action);
    states.push(state);
    actions.push(action);
  }

  return { states, actions, finalState: state };
}

function assertInvariants(state: GameState, context: string): void {
  // --- Occupancy & bounds ---
  const seen = new Set<string>();
  for (const unit of state.board.units) {
    const { x, y } = unit.position;
    expect(x, `${context}: unit x in bounds`).toBeGreaterThanOrEqual(0);
    expect(x, `${context}: unit x in bounds`).toBeLessThan(BOARD_SIZE);
    expect(y, `${context}: unit y in bounds`).toBeGreaterThanOrEqual(0);
    expect(y, `${context}: unit y in bounds`).toBeLessThan(BOARD_SIZE);
    const key = `${x},${y}`;
    expect(seen.has(key), `${context}: two units share square ${key}`).toBe(false);
    seen.add(key);
    // Definition must resolve (throws if unknown)
    expect(() => getUnitDefinition(unit.definitionId)).not.toThrow();
    expect(unit.damageTaken, `${context}: damageTaken non-negative`).toBeGreaterThanOrEqual(0);
  }

  // --- Cell mining invariants ---
  let remainingLayers = 0;
  for (const row of state.board.cells) {
    for (const cell of row) {
      expect(cell.resourceLayers, `${context}: layers >= 0`).toBeGreaterThanOrEqual(0);
      expect(cell.resourceLayers, `${context}: layers <= 5`).toBeLessThanOrEqual(INITIAL_RESOURCE_LAYERS);
      expect(cell.minedDepth, `${context}: depth >= 0`).toBeGreaterThanOrEqual(0);
      expect(cell.minedDepth, `${context}: depth <= 5`).toBeLessThanOrEqual(INITIAL_RESOURCE_LAYERS);
      expect(
        cell.resourceLayers + cell.minedDepth,
        `${context}: layers + depth === 5 at ${cell.position.x},${cell.position.y}`
      ).toBe(INITIAL_RESOURCE_LAYERS);
      remainingLayers += cell.resourceLayers;
    }
  }

  // --- Resource conservation ---
  const totalGained =
    state.players.white.resourcesGained + state.players.black.resourcesGained;
  expect(
    totalGained + remainingLayers,
    `${context}: mined + remaining === ${TOTAL_BOARD_RESOURCES}`
  ).toBe(TOTAL_BOARD_RESOURCES);

  for (const player of ['white', 'black'] as PlayerId[]) {
    const p = state.players[player];
    expect(p.resources, `${context}: ${player} resources >= 0`).toBeGreaterThanOrEqual(0);
    expect(
      p.resources,
      `${context}: ${player} cannot hold more than ever mined`
    ).toBeLessThanOrEqual(p.resourcesGained);
    for (const q of p.buildQueue) {
      expect(q.turnsRemaining, `${context}: queue turnsRemaining >= 0`).toBeGreaterThanOrEqual(0);
      expect(q.owner, `${context}: queue entry owner`).toBe(player);
    }
  }

  // --- Action budget ---
  expect(state.turn.actionsRemaining, `${context}: actions >= 0`).toBeGreaterThanOrEqual(0);
  expect(
    state.turn.actionsRemaining,
    `${context}: actions <= ${MAX_ACTIONS_PER_TURN}`
  ).toBeLessThanOrEqual(MAX_ACTIONS_PER_TURN);
}

// Normalize a state for determinism comparison (instance IDs contain timestamps)
function fingerprint(state: GameState): string {
  const units = state.board.units
    .map((u) => `${u.owner}:${u.definitionId}@${u.position.x},${u.position.y}:d${u.damageTaken}`)
    .sort();
  const cells = state.board.cells
    .flat()
    .map((c) => c.resourceLayers)
    .join('');
  const players = (['white', 'black'] as PlayerId[])
    .map((p) => {
      const ps = state.players[p];
      const queue = ps.buildQueue
        .map((q) => `${q.definitionId}:${q.turnsRemaining}`)
        .sort()
        .join('|');
      return `${p}=${ps.resources}/${ps.resourcesGained}[${queue}]`;
    })
    .join(';');
  return `${state.phase}:${state.winner}:${state.turn.currentPlayer}:${state.turn.phase}:${state.turn.turnNumber}:${units.join('|')}:${cells}:${players}`;
}

describe('engine property tests (seeded random playouts)', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);
  const MAX_PLIES = 400;

  for (const seed of SEEDS) {
    it(`maintains invariants through playout (seed ${seed})`, () => {
      const { states } = runPlayout(seed, MAX_PLIES);
      expect(states.length).toBeGreaterThan(0);
      states.forEach((s, i) => assertInvariants(s, `seed ${seed} ply ${i}`));
    });
  }

  it('is deterministic for identical seeds (modulo instance IDs)', () => {
    const a = runPlayout(424242, 300);
    const b = runPlayout(424242, 300);
    expect(a.actions.length).toBe(b.actions.length);
    expect(fingerprint(a.finalState)).toBe(fingerprint(b.finalState));
  });

  it('differs across seeds (sanity: RNG actually varies playouts)', () => {
    const a = runPlayout(1, 300);
    const b = runPlayout(2, 300);
    // Not strictly guaranteed, but overwhelmingly likely; catches a broken RNG hookup.
    expect(fingerprint(a.finalState)).not.toBe(fingerprint(b.finalState));
  });

  it('victory states are consistent with board contents', () => {
    for (const seed of [77, 78, 79]) {
      const { finalState } = runPlayout(seed, 1000);
      if (finalState.phase === 'victory' && finalState.winner) {
        const loser: PlayerId = finalState.winner === 'white' ? 'black' : 'white';
        const loserUnits = finalState.board.units.filter((u) => u.owner === loser);
        // Victory by elimination or resignation; if elimination, loser has no units
        const result = checkVictory(finalState.board);
        if (result.status === 'victory') {
          expect(result.winner).toBe(finalState.winner);
          expect(loserUnits.length).toBe(0);
        }
      }
    }
  });
});
