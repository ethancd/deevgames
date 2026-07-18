import type { BoardState, Position, Element } from '../game/types';
import type { MovementRangePosition } from '../game/movement';
import { getUnitAt } from '../game/board';
import { getAttackModifier } from '../game/elements';
import { getUnitDefinition } from '../game/units';
import { Cell } from './Cell';
import { Unit } from './Unit';

interface BoardProps {
  board: BoardState;
  selectedUnit: string | null;
  selectedUnitElement?: Element | null; // For computing elemental bonuses
  validMoves: Position[];
  validAttacks: Position[];
  validSpawns: Position[];
  invalidSpawnPosition?: Position | null; // For showing red X on invalid spawn click
  pendingMovePath?: Position[]; // For showing partial movement path
  movementRange?: MovementRangePosition[]; // For showing movement range preview with actions remaining
  onCellClick: (position: Position) => void;
  onUnitClick: (unitId: string) => void;
}

export function Board({
  board,
  selectedUnit,
  selectedUnitElement,
  validMoves,
  validAttacks,
  validSpawns,
  invalidSpawnPosition,
  pendingMovePath = [],
  movementRange = [],
  onCellClick,
  onUnitClick,
}: BoardProps) {
  const isValidMove = (pos: Position) =>
    validMoves.some((m) => m.x === pos.x && m.y === pos.y);

  const isValidAttack = (pos: Position) =>
    validAttacks.some((a) => a.x === pos.x && a.y === pos.y);

  const isValidSpawn = (pos: Position) =>
    validSpawns.some((s) => s.x === pos.x && s.y === pos.y);

  const isInvalidSpawn = (pos: Position) =>
    invalidSpawnPosition !== null &&
    invalidSpawnPosition !== undefined &&
    invalidSpawnPosition.x === pos.x &&
    invalidSpawnPosition.y === pos.y;

  const isPendingMove = (pos: Position) =>
    pendingMovePath.some((p) => p.x === pos.x && p.y === pos.y);

  const getMovementRangeActions = (pos: Position): number | undefined => {
    const rangePos = movementRange.find(
      (r) => r.position.x === pos.x && r.position.y === pos.y
    );
    return rangePos?.actionsRemaining;
  };

  // Get elemental bonus for an attack target
  const getElementalBonus = (pos: Position): number | undefined => {
    if (!selectedUnitElement) return undefined;
    const targetUnit = getUnitAt(board, pos);
    if (!targetUnit) return undefined;
    const targetDef = getUnitDefinition(targetUnit.definitionId);
    return getAttackModifier(selectedUnitElement, targetDef.element);
  };

  return (
    <div className="inline-block border-2 border-gray-300 bg-gray-100 p-1 rounded">
      <div className="grid grid-cols-10 gap-0">
        {board.cells.map((row, y) =>
          row.map((cell, x) => {
            const unit = getUnitAt(board, { x, y });
            const isSelected = unit?.id === selectedUnit;
            const pos = { x, y };

            return (
              <div key={`${x}-${y}`} className="relative">
                <Cell
                  cell={cell}
                  isValidMove={isValidMove(pos)}
                  isValidAttack={isValidAttack(pos)}
                  isValidSpawn={isValidSpawn(pos)}
                  isSelected={isSelected}
                  elementalBonus={isValidAttack(pos) ? getElementalBonus(pos) : undefined}
                  isInvalidSpawn={isInvalidSpawn(pos)}
                  isPendingMove={isPendingMove(pos)}
                  movementRangeActions={getMovementRangeActions(pos)}
                  onClick={onCellClick}
                />
                {unit && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                      <Unit
                        unit={unit}
                        isSelected={isSelected}
                        onClick={() => onUnitClick(unit.id)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
