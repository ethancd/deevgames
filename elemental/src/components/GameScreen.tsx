import { useEffect, useState, useMemo } from 'react';
import { useGameState } from '../hooks/useGameState';
import { useAI } from '../hooks/useAI';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { PhaseIndicator } from './PhaseIndicator';
import { ResourceDisplay } from './ResourceDisplay';
import { BuildQueue } from './BuildQueue';
import { UnitInfo } from './UnitInfo';
import { UnitShop } from './UnitShop';
import { VictoryScreen } from './VictoryScreen';
import { getUnitById } from '../game/board';
import { canMine } from '../game/mining';
import { getAllSpawnPositions } from '../game/spawning';
import type { Position } from '../game/types';
import type { AIDifficulty } from '../ai/types';

export function GameScreen() {
  const {
    state,
    selectUnit,
    deselect,
    moveUnit,
    attackWith,
    mineWith,
    endPlacePhase,
    endActionPhase,
    queueUnit,
    placeUnit,
    promoteUnit,
    endTurn,
    applyAIAction,
    resetGame,
    selectedUnitData,
    isPlayerTurn,
  } = useGameState();

  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  const [selectedReadyUnitId, setSelectedReadyUnitId] = useState<string | null>(null);
  const [selectedPlaceUnitId, setSelectedPlaceUnitId] = useState<string | null>(null);

  // Clear place phase selections when phase changes or turn ends
  useEffect(() => {
    if (state.turn.phase !== 'place' || !isPlayerTurn) {
      setSelectedReadyUnitId(null);
      setSelectedPlaceUnitId(null);
    }
  }, [state.turn.phase, isPlayerTurn]);

  // Compute valid spawn positions when a ready unit is selected
  const validSpawns = useMemo(() => {
    if (state.turn.phase !== 'place' || !selectedReadyUnitId) {
      return [];
    }
    return getAllSpawnPositions('player', state.board);
  }, [state.turn.phase, selectedReadyUnitId, state.board]);

  // Get the definition ID for the selected ready unit (for preview)
  const selectedReadyDefinitionId = useMemo(() => {
    if (!selectedReadyUnitId) return null;
    const queuedUnit = state.players.player.buildQueue.find(
      (q) => q.id === selectedReadyUnitId
    );
    return queuedUnit?.definitionId ?? null;
  }, [selectedReadyUnitId, state.players.player.buildQueue]);

  // Get the unit data for unit selected during place phase (for promotion)
  const selectedPlaceUnitData = useMemo(() => {
    if (!selectedPlaceUnitId) return null;
    return getUnitById(state.board, selectedPlaceUnitId);
  }, [selectedPlaceUnitId, state.board]);

  const { isThinking, executeAITurn, setDifficulty } = useAI({
    difficulty: aiDifficulty,
    thinkingDelay: 400,
  });

  // Trigger AI turn when it becomes AI's turn
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'ai' &&
      state.phase === 'playing' &&
      !isThinking
    ) {
      executeAITurn(state, applyAIAction);
    }
  }, [state.turn.currentPlayer, state.phase, isThinking, state, executeAITurn, applyAIAction]);

  const handleCellClick = (position: Position) => {
    if (!isPlayerTurn || isThinking) {
      return;
    }

    // Handle place phase - placing ready units
    if (state.turn.phase === 'place' && selectedReadyUnitId) {
      const isSpawnValid = validSpawns.some(
        (s) => s.x === position.x && s.y === position.y
      );
      if (isSpawnValid) {
        placeUnit(selectedReadyUnitId, position);
        setSelectedReadyUnitId(null);
      } else {
        // Clicking invalid cell deselects
        setSelectedReadyUnitId(null);
      }
      return;
    }

    // Handle action phase - movement and attacks
    if (state.turn.phase !== 'action') {
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
    if (!isPlayerTurn || isThinking) {
      return;
    }

    const unit = getUnitById(state.board, unitId);
    if (!unit) return;

    // Handle place phase - selecting units for promotion
    if (state.turn.phase === 'place') {
      if (unit.owner === 'player') {
        // Clear ready unit selection if selecting a board unit
        setSelectedReadyUnitId(null);
        // Toggle selection
        if (selectedPlaceUnitId === unitId) {
          setSelectedPlaceUnitId(null);
        } else {
          setSelectedPlaceUnitId(unitId);
        }
      }
      return;
    }

    // Handle action phase
    if (state.turn.phase !== 'action') {
      return;
    }

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
    if (state.selectedUnit && !isThinking) {
      mineWith(state.selectedUnit);
    }
  };

  const handlePromote = () => {
    if (selectedPlaceUnitId && !isThinking) {
      promoteUnit(selectedPlaceUnitId);
      setSelectedPlaceUnitId(null);
    }
  };

  // Check if selected unit can mine
  const canMineHere = () => {
    if (!selectedUnitData) return false;
    return canMine(selectedUnitData, state.board);
  };

  const handlePlayAgain = () => {
    resetGame();
  };

  const handleDifficultyChange = (newDifficulty: AIDifficulty) => {
    setAIDifficulty(newDifficulty);
    setDifficulty(newDifficulty);
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
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-100">Elemental Tactics</h1>
            {/* Difficulty selector */}
            <select
              value={aiDifficulty}
              onChange={(e) => handleDifficultyChange(e.target.value as AIDifficulty)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
              disabled={!isPlayerTurn}
            >
              <option value="easy">Easy AI</option>
              <option value="medium">Medium AI</option>
              <option value="hard">Hard AI</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            {isThinking && (
              <span className="text-yellow-400 animate-pulse">AI thinking...</span>
            )}
            <PhaseIndicator
              turnNumber={state.turn.turnNumber}
              phase={state.turn.phase}
              currentPlayer={state.turn.currentPlayer}
            />
          </div>
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
            <div className={isThinking ? 'opacity-75 pointer-events-none' : ''}>
              <Board
                board={state.board}
                currentPlayer={state.turn.currentPlayer}
                selectedUnit={state.selectedUnit}
                validMoves={state.validMoves}
                validAttacks={state.validAttacks}
                validSpawns={validSpawns}
                onCellClick={handleCellClick}
                onUnitClick={handleUnitClick}
              />
            </div>

            {/* Action bar below board */}
            <div className="mt-4">
              <ActionBar
                actionsRemaining={state.turn.actionsRemaining}
                phase={state.turn.phase}
                onEndPlacePhase={endPlacePhase}
                onEndActionPhase={endActionPhase}
                onEndTurn={endTurn}
                isPlayerTurn={isPlayerTurn && !isThinking}
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
              isPlacePhase={state.turn.phase === 'place' && isPlayerTurn && !isThinking}
              board={state.board}
              player="player"
              selectedReadyId={selectedReadyUnitId}
              onSelectReady={setSelectedReadyUnitId}
            />
            {state.turn.phase === 'queue' && isPlayerTurn && !isThinking && (
              <UnitShop
                resources={state.players.player.resources}
                player="player"
                board={state.board}
                onQueueUnit={queueUnit}
              />
            )}
            <UnitInfo
              unit={selectedPlaceUnitData ?? selectedUnitData}
              previewDefinitionId={selectedReadyDefinitionId}
              onMine={handleMine}
              canMine={canMineHere()}
              isPlacePhase={state.turn.phase === 'place' && isPlayerTurn && !isThinking}
              resources={state.players.player.resources}
              onPromote={handlePromote}
            />
          </div>
        </div>

        {/* Controls hint */}
        <div className="mt-4 text-center text-gray-500 text-sm">
          {isThinking ? (
            <span className="text-yellow-400">AI is making its move...</span>
          ) : (
            <>
              Click a unit to select, then click a highlighted cell to move/attack.
              {selectedUnitData && !selectedUnitData.hasMined && canMineHere() && (
                <span className="text-purple-400"> You can mine here!</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
