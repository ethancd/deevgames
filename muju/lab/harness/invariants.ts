import type { GameState, PlayerId } from '../../src/game/types';
import { BOARD_SIZE, INITIAL_RESOURCE_LAYERS } from '../../src/game/board';
import { getActionsPerTurn } from '../../src/game/rules';



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
  const capacities = state.board.initialResourceLayers ?? Array(BOARD_SIZE * BOARD_SIZE).fill(INITIAL_RESOURCE_LAYERS);
  if (capacities.length !== BOARD_SIZE * BOARD_SIZE || capacities.some(n => !Number.isInteger(n) || n < 0 || n > INITIAL_RESOURCE_LAYERS)) throw new InvariantViolation(`${context}: invalid initial capacities`);
  const total = capacities.reduce((sum,n)=>sum+n,0);
  let remaining = 0;
  for (const row of state.board.cells) {
    for (const cell of row) {
      const capacity = capacities[cell.position.y * BOARD_SIZE + cell.position.x];
      if (!Number.isInteger(cell.resourceLayers) || cell.resourceLayers < 0 || cell.resourceLayers > capacity) {
        throw new InvariantViolation(
          `${context}: reserve outside capacity ${capacity} at ${cell.position.x},${cell.position.y}`
        );
      }
      remaining += cell.resourceLayers;
    }
  }
  const gained = state.players.white.resourcesGained + state.players.black.resourcesGained;
  if (gained + remaining !== total) {
    throw new InvariantViolation(
      `${context}: conservation broken (gained ${gained} + remaining ${remaining} !== ${total})`
    );
  }

  for (const player of ['white', 'black'] as PlayerId[]) {
    const p = state.players[player];
    if (p.resources < 0) {
      throw new InvariantViolation(`${context}: ${player} negative resources`);
    }
    const grant = player === 'black' ? state.blackCrystalHandicap ?? 0 : 0;
    if (p.resources > p.resourcesGained + grant) {
      throw new InvariantViolation(`${context}: ${player} holds more than ever mined or granted`);
    }
  }

  if (state.turn.actionsRemaining < 0 || state.turn.actionsRemaining > getActionsPerTurn(state)) {
    throw new InvariantViolation(`${context}: actionsRemaining ${state.turn.actionsRemaining} out of range`);
  }
}
