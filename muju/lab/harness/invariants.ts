import type { GameState, PlayerId } from '../../src/game/types';
import { BOARD_SIZE, INITIAL_RESOURCE_LAYERS, MAX_ACTIONS_PER_TURN } from '../../src/game/board';

const TOTAL_BOARD_RESOURCES = BOARD_SIZE * BOARD_SIZE * INITIAL_RESOURCE_LAYERS;

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}

/**
 * Cheap per-action invariant checks — the same invariants the property tests
 * assert, minus the expensive ones. Throws InvariantViolation; the runner
 * aborts and flags the game so a corrupted engine state can never silently
 * contaminate experiment data.
 */
export function checkInvariants(state: GameState, context: string): void {
  // Occupancy & bounds
  const seen = new Set<string>();
  for (const unit of state.board.units) {
    const { x, y } = unit.position;
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      throw new InvariantViolation(`${context}: unit ${unit.id} out of bounds at ${x},${y}`);
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      throw new InvariantViolation(`${context}: two units share square ${key}`);
    }
    seen.add(key);
    if (unit.damageTaken < 0) {
      throw new InvariantViolation(`${context}: negative damageTaken on ${unit.id}`);
    }
  }

  // Cells + resource conservation
  let remaining = 0;
  for (const row of state.board.cells) {
    for (const cell of row) {
      if (cell.resourceLayers + cell.minedDepth !== INITIAL_RESOURCE_LAYERS) {
        throw new InvariantViolation(
          `${context}: layers+depth !== ${INITIAL_RESOURCE_LAYERS} at ${cell.position.x},${cell.position.y}`
        );
      }
      remaining += cell.resourceLayers;
    }
  }
  const gained = state.players.white.resourcesGained + state.players.black.resourcesGained;
  if (gained + remaining !== TOTAL_BOARD_RESOURCES) {
    throw new InvariantViolation(
      `${context}: conservation broken (gained ${gained} + remaining ${remaining} !== ${TOTAL_BOARD_RESOURCES})`
    );
  }

  for (const player of ['white', 'black'] as PlayerId[]) {
    const p = state.players[player];
    if (p.resources < 0) {
      throw new InvariantViolation(`${context}: ${player} negative resources`);
    }
    if (p.resources > p.resourcesGained) {
      throw new InvariantViolation(`${context}: ${player} holds more than ever mined`);
    }
  }

  if (state.turn.actionsRemaining < 0 || state.turn.actionsRemaining > MAX_ACTIONS_PER_TURN) {
    throw new InvariantViolation(`${context}: actionsRemaining ${state.turn.actionsRemaining} out of range`);
  }
}
