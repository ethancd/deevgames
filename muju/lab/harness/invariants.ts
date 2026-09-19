import type { GameState, PlayerId } from '../../src/game/types';
import { BOARD_SIZE, INITIAL_RESOURCE_LAYERS } from '../../src/game/board';
import { getActionsPerTurn, isPhasing } from '../../src/game/rules';
import { MAX_RESOURCE_RESERVE } from '../../src/game/resourceMap';



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
  if (capacities.length !== BOARD_SIZE * BOARD_SIZE || capacities.some(n => !Number.isInteger(n) || n < 0 || n > MAX_RESOURCE_RESERVE)) throw new InvariantViolation(`${context}: invalid initial capacities`);
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
    const escrow = (state.pendingSummons ?? []).filter(s => s.owner === player).reduce((n, s) => n + s.cost, 0);
    if (p.resources + escrow > p.resourcesGained + grant) {
      throw new InvariantViolation(`${context}: ${player} bank + pending cost exceeds all mined or granted resources`);
    }
  }

  const pendingSquares = new Set<string>();
  const pendingIds = new Set<string>();
  for (const summon of state.pendingSummons ?? []) {
    const { x, y } = summon.position;
    const key = `${summon.owner}:${x},${y}`;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE ||
        !Number.isInteger(summon.cost) || summon.cost <= 0 || pendingSquares.has(key) || pendingIds.has(summon.id)) {
      throw new InvariantViolation(`${context}: invalid or duplicate pending summon ${key}`);
    }
    pendingSquares.add(key); pendingIds.add(summon.id);
  }
  // Act consumes the budget; mine/upkeep sets it to zero before Prepare.
  // Terminal home-occupation states can carry the incoming turn's reset budget.
  if (isPhasing(state) && state.phase === 'playing' && state.turn.phase === 'place' && state.turn.actionsRemaining !== 0) {
    throw new InvariantViolation(`${context}: Phasing Prepare/upkeep retains Act actions`);
  }
  if (!Number.isInteger(state.turn.actionsRemaining) || state.turn.actionsRemaining < 0 || state.turn.actionsRemaining > getActionsPerTurn(state)) {
    throw new InvariantViolation(`${context}: actionsRemaining ${state.turn.actionsRemaining} out of range`);
  }
}
