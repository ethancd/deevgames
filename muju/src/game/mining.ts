import type { BoardState, Cell, Unit } from './types';
import { getCell, updateCell } from './board';
import { getUnitDefinition } from './units';

/**
 * Check if a unit can mine (hasn't mined this turn and can act)
 */
export function canMineAction(unit: Unit): boolean {
  return !unit.hasMined && unit.canActThisTurn;
}

/**
 * The Well Metaphor:
 * - Each square has 5 depth layers (1-5), each worth 1 resource
 * - A unit's Mining stat is its "rope length"
 * - Mining removes topmost remaining layers up to Mining stat
 * - You cannot skip layers or reach deeper than Mining allows
 *
 * Example:
 * - Fresh cell: layers 1,2,3,4,5 available (resourceLayers=5, minedDepth=0)
 * - Hi (Mining 1) can take layer 1 only → resourceLayers=4, minedDepth=1
 * - Muju (Mining 2) on fresh cell takes layers 1,2 → resourceLayers=3, minedDepth=2
 * - Muju on that same cell later: minedDepth=2, so layer 3 is at "depth 3"
 *   Mining 2 can't reach depth 3, so Muju gets nothing
 */

/**
 * Calculate how many resources a unit can extract from a cell
 *
 * @returns Number of resources that would be extracted (0 if dry)
 */
export function calculateMiningYield(unit: Unit, cell: Cell): number {
  const def = getUnitDefinition(unit.definitionId);
  const miningPower = def.mining;

  // How many layers remain?
  const remainingLayers = cell.resourceLayers;
  if (remainingLayers === 0) return 0;

  // Current depth of the topmost remaining layer
  // If minedDepth=0, top layer is at depth 1
  // If minedDepth=2, top layer is at depth 3
  const topLayerDepth = cell.minedDepth + 1;

  // Can we reach the top layer?
  if (topLayerDepth > miningPower) {
    // Our rope is too short - cell is "dry" for this unit
    return 0;
  }

  // How many layers can we reach from the top?
  // We can reach depths from topLayerDepth to miningPower
  const reachableDepth = miningPower;

  // We take from topLayerDepth to min(reachableDepth, deepestExistingLayer)
  const layersToTake = Math.min(
    reachableDepth - cell.minedDepth,
    remainingLayers
  );

  return Math.max(0, layersToTake);
}

/**
 * Check if a unit can extract any resources from its current cell
 */
export function canMine(unit: Unit, board: BoardState): boolean {
  if (!canMineAction(unit)) return false;

  const cell = getCell(board, unit.position);
  if (!cell) return false;

  return calculateMiningYield(unit, cell) > 0;
}

/**
 * Execute a mine action
 * Returns updated board, updated player resources, and amount mined
 */
export function executeMine(
  board: BoardState,
  unitId: string,
  currentResources: number
): { board: BoardState; newResources: number; amountMined: number } {
  const unit = board.units.find((u) => u.id === unitId);
  if (!unit) {
    return { board, newResources: currentResources, amountMined: 0 };
  }

  const cell = getCell(board, unit.position);
  if (!cell) {
    return { board, newResources: currentResources, amountMined: 0 };
  }

  const amountMined = calculateMiningYield(unit, cell);
  if (amountMined === 0) {
    return { board, newResources: currentResources, amountMined: 0 };
  }

  // Update the cell
  const newCell: Partial<Cell> = {
    resourceLayers: cell.resourceLayers - amountMined,
    minedDepth: cell.minedDepth + amountMined,
  };

  let newBoard = updateCell(board, unit.position, newCell);

  // Mark unit as having mined
  newBoard = {
    ...newBoard,
    units: newBoard.units.map((u) =>
      u.id === unitId ? { ...u, hasMined: true } : u
    ),
  };

  return {
    board: newBoard,
    newResources: currentResources + amountMined,
    amountMined,
  };
}

/**
 * Get the total remaining resources on the board
 */
export function getTotalBoardResources(board: BoardState): number {
  let total = 0;
  for (const row of board.cells) {
    for (const cell of row) {
      total += cell.resourceLayers;
    }
  }
  return total;
}

/**
 * Get resources reachable by a specific unit on the entire board
 * (cells where unit could mine if it could get there)
 */
export function getReachableResources(
  unit: Unit,
  board: BoardState
): number {
  const def = getUnitDefinition(unit.definitionId);
  const miningPower = def.mining;
  let total = 0;

  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.resourceLayers === 0) continue;

      const topLayerDepth = cell.minedDepth + 1;
      if (topLayerDepth <= miningPower) {
        // This unit could mine here
        const layers = Math.min(miningPower - cell.minedDepth, cell.resourceLayers);
        total += layers;
      }
    }
  }

  return total;
}

/**
 * Check if a cell is fully depleted
 */
export function isDepleted(cell: Cell): boolean {
  return cell.resourceLayers === 0;
}

/**
 * Check if a cell is "dry" for a specific unit (can't extract more)
 */
export function isDryForUnit(unit: Unit, cell: Cell): boolean {
  return calculateMiningYield(unit, cell) === 0;
}
