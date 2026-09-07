import type { BoardState, Position } from '../game/types';
import type { MovementRangePosition } from '../game/movement';
import { getUnitAt } from '../game/board';
import { getUnitDefinition } from '../game/units';
import { Cell } from './Cell';
import { Unit } from './Unit';

interface BoardProps {
  board: BoardState;
  selectedUnit: string | null;
  validMoves: Position[];
  validAttacks: Position[];
  validSpawns: Position[];
  invalidSpawnPosition?: Position | null; // For showing red X on invalid spawn click
  pendingMovePath?: Position[]; // For showing partial movement path
  movementRange?: MovementRangePosition[]; // For showing movement range preview with actions remaining
  previewPosition?: Position;
  showResources?: boolean;
  actionsRemaining?: number;
  onCellClick: (position: Position) => void;
  onUnitClick: (unitId: string) => void;
}

export function Board({
  board,
  selectedUnit,
  validMoves,
  validAttacks,
  validSpawns,
  invalidSpawnPosition,
  pendingMovePath = [],
  movementRange = [],
  onCellClick,
  onUnitClick,
  previewPosition, showResources = false, actionsRemaining = 6,
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

  return (
    <div className="battle-board">
      <div className="battle-grid">
        {board.cells.map((row, y) =>
          row.map((cell, x) => {
            const unit = getUnitAt(board, { x, y });
            const isSelected = unit?.id === selectedUnit;
            const pos = { x, y };

            return (
              <div key={`${x}-${y}`} className="board-square">
                <Cell
                  cell={cell}
                  isValidMove={isValidMove(pos)}
                  isValidAttack={isValidAttack(pos)}
                  isValidSpawn={isValidSpawn(pos)}
                  isSelected={isSelected}
                  isInvalidSpawn={isInvalidSpawn(pos)}
                  isPendingMove={isPendingMove(pos)}
                  movementRangeActions={getMovementRangeActions(pos)}
                  isPreview={previewPosition?.x === x && previewPosition?.y === y}
                  showResources={showResources}
                  moveCost={getMovementRangeActions(pos) !== undefined ? actionsRemaining - getMovementRangeActions(pos)! : undefined}
                  unitLabel={unit ? `${unit.owner} ${getUnitDefinition(unit.definitionId).name}, tier ${getUnitDefinition(unit.definitionId).tier}` : undefined}
                  onClick={unit ? () => onUnitClick(unit.id) : onCellClick}
                />
                {unit && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="unit-wrap">
                      <Unit
                        unit={unit}
                        isSelected={isSelected}
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
