import type { BoardState, Position, PlayerId } from '../game/types';
import { getUnitAt } from '../game/board';
import { Cell } from './Cell';
import { Unit } from './Unit';

interface BoardProps {
  board: BoardState;
  currentPlayer: PlayerId;
  selectedUnit: string | null;
  validMoves: Position[];
  validAttacks: Position[];
  onCellClick: (position: Position) => void;
  onUnitClick: (unitId: string) => void;
}

export function Board({
  board,
  currentPlayer,
  selectedUnit,
  validMoves,
  validAttacks,
  onCellClick,
  onUnitClick,
}: BoardProps) {
  const isValidMove = (pos: Position) =>
    validMoves.some((m) => m.x === pos.x && m.y === pos.y);

  const isValidAttack = (pos: Position) =>
    validAttacks.some((a) => a.x === pos.x && a.y === pos.y);

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
                  isSelected={isSelected}
                  onClick={onCellClick}
                />
                {unit && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                      <Unit
                        unit={unit}
                        isSelected={isSelected}
                        isOwned={unit.owner === currentPlayer}
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
