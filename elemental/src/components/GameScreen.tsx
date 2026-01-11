import { useGameState } from '../hooks/useGameState';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { PhaseIndicator } from './PhaseIndicator';
import { ResourceDisplay } from './ResourceDisplay';
import { BuildQueue } from './BuildQueue';
import { UnitInfo } from './UnitInfo';
import { VictoryScreen } from './VictoryScreen';
import { getUnitById } from '../game/board';
import { canMine } from '../game/mining';
import type { Position } from '../game/types';

export function GameScreen() {
  const {
    state,
    selectUnit,
    deselect,
    moveUnit,
    attackWith,
    mineWith,
    endActionPhase,
    endTurn,
    selectedUnitData,
    isPlayerTurn,
  } = useGameState();

  const handleCellClick = (position: Position) => {
    if (!isPlayerTurn || state.turn.phase !== 'action') {
      return;
    }

    // Check if clicking on valid move
    const isValidMove = state.validMoves.some(
      (m) => m.x === position.x && m.y === position.y
    );

    // Check if clicking on valid attack
    const isValidAttack = state.validAttacks.some(
      (a) => a.x === position.x && a.y === position.y
    );

    if (isValidMove && state.selectedUnit) {
      moveUnit(state.selectedUnit, position);
    } else if (isValidAttack && state.selectedUnit) {
      attackWith(state.selectedUnit, position);
    } else {
      deselect();
    }
  };

  const handleUnitClick = (unitId: string) => {
    if (!isPlayerTurn || state.turn.phase !== 'action') {
      return;
    }

    const unit = getUnitById(state.board, unitId);
    if (!unit) return;

    if (unit.owner === 'player') {
      if (state.selectedUnit === unitId) {
        deselect();
      } else {
        selectUnit(unitId);
      }
    } else if (state.selectedUnit) {
      // Clicking enemy while having selection - check for attack
      const isValidAttack = state.validAttacks.some(
        (a) => a.x === unit.position.x && a.y === unit.position.y
      );
      if (isValidAttack) {
        attackWith(state.selectedUnit, unit.position);
      }
    }
  };

  const handleMine = () => {
    if (state.selectedUnit) {
      mineWith(state.selectedUnit);
    }
  };

  // Check if selected unit can mine
  const canMineHere = () => {
    if (!selectedUnitData) return false;
    return canMine(selectedUnitData, state.board);
  };

  const handlePlayAgain = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Victory overlay */}
      {state.phase === 'victory' && state.winner && (
        <VictoryScreen winner={state.winner} onPlayAgain={handlePlayAgain} />
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-gray-100">Elemental Tactics</h1>
          <PhaseIndicator
            turnNumber={state.turn.turnNumber}
            phase={state.turn.phase}
            currentPlayer={state.turn.currentPlayer}
          />
        </div>

        {/* Main layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left sidebar - Opponent info */}
          <div className="lg:w-48 space-y-3">
            <ResourceDisplay
              playerState={state.players.ai}
              viewerIsOwner={false}
            />
            <BuildQueue
              queue={state.players.ai.buildQueue}
              isOwner={false}
            />
          </div>

          {/* Center - Board */}
          <div className="flex-1 flex flex-col items-center">
            <Board
              board={state.board}
              currentPlayer={state.turn.currentPlayer}
              selectedUnit={state.selectedUnit}
              validMoves={state.validMoves}
              validAttacks={state.validAttacks}
              onCellClick={handleCellClick}
              onUnitClick={handleUnitClick}
            />

            {/* Action bar below board */}
            <div className="mt-4">
              <ActionBar
                actionsRemaining={state.turn.actionsRemaining}
                phase={state.turn.phase}
                onEndActionPhase={endActionPhase}
                onEndTurn={endTurn}
                isPlayerTurn={isPlayerTurn}
              />
            </div>
          </div>

          {/* Right sidebar - Player info */}
          <div className="lg:w-48 space-y-3">
            <ResourceDisplay
              playerState={state.players.player}
              viewerIsOwner={true}
            />
            <BuildQueue
              queue={state.players.player.buildQueue}
              isOwner={true}
            />
            <UnitInfo
              unit={selectedUnitData}
              onMine={handleMine}
              canMine={canMineHere()}
            />
          </div>
        </div>

        {/* Controls hint */}
        <div className="mt-4 text-center text-gray-500 text-sm">
          Click a unit to select, then click a highlighted cell to move/attack.
          {selectedUnitData && !selectedUnitData.hasMined && canMineHere() && (
            <span className="text-purple-400"> You can mine here!</span>
          )}
        </div>
      </div>
    </div>
  );
}
