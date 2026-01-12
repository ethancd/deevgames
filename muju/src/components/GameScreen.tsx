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
import { ElementLegend } from './ElementLegend';
import { AIRecap } from './AIRecap';
import { getUnitById, getCell } from '../game/board';
import { getUnitDefinition } from '../game/units';
import { canMine } from '../game/mining';
import { getAllSpawnPositions, getSpawnInvalidReason } from '../game/spawning';
import type { Position } from '../game/types';

type SpawnFeedback = {
  position: Position;
  reason: 'enemy_blocking' | 'outside_control';
} | null;
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
    undo,
    canUndo,
    selectedUnitData,
    isPlayerTurn,
  } = useGameState();

  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  const [selectedReadyUnitId, setSelectedReadyUnitId] = useState<string | null>(null);
  const [selectedPlaceUnitId, setSelectedPlaceUnitId] = useState<string | null>(null);
  const [spawnFeedback, setSpawnFeedback] = useState<SpawnFeedback>(null);
  const [viewedEnemyUnitId, setViewedEnemyUnitId] = useState<string | null>(null);

  // Clear place phase selections when phase changes or turn ends
  useEffect(() => {
    if (state.turn.phase !== 'place' || !isPlayerTurn) {
      setSelectedReadyUnitId(null);
      setSelectedPlaceUnitId(null);
      setSpawnFeedback(null);
    }
  }, [state.turn.phase, isPlayerTurn]);

  // Clear enemy view when selecting own units or turn changes
  useEffect(() => {
    if (state.selectedUnit) {
      setViewedEnemyUnitId(null);
    }
  }, [state.selectedUnit]);

  // Clear spawn feedback after 2 seconds
  useEffect(() => {
    if (spawnFeedback) {
      const timer = setTimeout(() => setSpawnFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [spawnFeedback]);

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

  // Get the viewed enemy unit data (for enemy stats display)
  const viewedEnemyUnitData = useMemo(() => {
    if (!viewedEnemyUnitId) return null;
    return getUnitById(state.board, viewedEnemyUnitId);
  }, [viewedEnemyUnitId, state.board]);

  const { isThinking, executeAITurn, setDifficulty, lastTurnActions, clearLastTurnActions } = useAI({
    difficulty: aiDifficulty,
    thinkingDelay: 400,
  });
  const [showAIRecap, setShowAIRecap] = useState(false);

  // Track which turn number AI has executed to prevent duplicate execution on reload
  const [aiExecutedTurn, setAiExecutedTurn] = useState<number | null>(null);

  // Trigger AI turn when it becomes AI's turn
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'ai' &&
      state.phase === 'playing' &&
      !isThinking &&
      aiExecutedTurn !== state.turn.turnNumber
    ) {
      setAiExecutedTurn(state.turn.turnNumber);
      executeAITurn(state, applyAIAction);
    }
  }, [state.turn.currentPlayer, state.phase, isThinking, state, executeAITurn, applyAIAction, aiExecutedTurn]);

  // Show AI recap when AI's turn ends and player's turn begins
  useEffect(() => {
    if (
      isPlayerTurn &&
      !isThinking &&
      lastTurnActions.length > 0 &&
      state.turn.turnNumber > 1
    ) {
      setShowAIRecap(true);
    }
  }, [isPlayerTurn, isThinking, lastTurnActions.length, state.turn.turnNumber]);

  const handleDismissRecap = () => {
    setShowAIRecap(false);
    clearLastTurnActions();
  };

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
        setSpawnFeedback(null);
      } else {
        // Check why it's invalid and show feedback
        const reason = getSpawnInvalidReason(position, 'player', state.board);
        if (reason === 'enemy_blocking' || reason === 'outside_control') {
          setSpawnFeedback({ position, reason });
        } else {
          // Occupied cell - just clear feedback
          setSpawnFeedback(null);
        }
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
        setViewedEnemyUnitId(null);
        // Toggle selection
        if (selectedPlaceUnitId === unitId) {
          setSelectedPlaceUnitId(null);
        } else {
          setSelectedPlaceUnitId(unitId);
        }
      } else {
        // Allow viewing enemy stats during place phase
        setSelectedPlaceUnitId(null);
        setViewedEnemyUnitId(viewedEnemyUnitId === unitId ? null : unitId);
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
      } else {
        // Not a valid attack - just view enemy stats
        deselect();
        setViewedEnemyUnitId(unitId);
      }
    } else {
      // No selection - view enemy stats
      setViewedEnemyUnitId(viewedEnemyUnitId === unitId ? null : unitId);
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

  // Get cell info for selected unit (for mining depth feedback)
  const selectedUnitCell = useMemo(() => {
    const unitToShow = selectedPlaceUnitData ?? selectedUnitData;
    if (!unitToShow) return null;
    return getCell(state.board, unitToShow.position);
  }, [selectedPlaceUnitData, selectedUnitData, state.board]);

  const handlePlayAgain = () => {
    setAiExecutedTurn(null);
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

      {/* AI turn recap */}
      {showAIRecap && (
        <AIRecap actions={lastTurnActions} onDismiss={handleDismissRecap} />
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-100">Muju Hono Tanka</h1>
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
            <button
              onClick={handlePlayAgain}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              New Game
            </button>
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

        {/* Main layout - vertical with board centered */}
        <div className="flex flex-col items-center gap-4">
          {/* Player info row - above board */}
          <div className="relative flex flex-wrap items-start justify-center gap-3 w-full max-w-3xl">
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
            <ElementLegend />

            {/* Unit info popover - overlays player info area */}
            {(selectedPlaceUnitData || selectedUnitData || viewedEnemyUnitData || selectedReadyDefinitionId) && (
              <div className="absolute top-0 right-0 w-48 z-20">
                <UnitInfo
                  unit={selectedPlaceUnitData ?? selectedUnitData ?? viewedEnemyUnitData}
                  previewDefinitionId={selectedReadyDefinitionId}
                  onMine={handleMine}
                  canMine={canMineHere()}
                  cellInfo={selectedUnitCell}
                  isPlacePhase={state.turn.phase === 'place' && isPlayerTurn && !isThinking}
                  isActionPhase={state.turn.phase === 'action' && isPlayerTurn && !isThinking}
                  resources={state.players.player.resources}
                  onPromote={handlePromote}
                  isEnemyView={!!viewedEnemyUnitData && !selectedPlaceUnitData && !selectedUnitData}
                />
              </div>
            )}
          </div>

          {/* Board */}
          <div className={isThinking ? 'opacity-75 pointer-events-none' : ''}>
            <Board
              board={state.board}
              currentPlayer={state.turn.currentPlayer}
              selectedUnit={state.selectedUnit}
              selectedUnitElement={selectedUnitData ? getUnitDefinition(selectedUnitData.definitionId).element : null}
              validMoves={state.validMoves}
              validAttacks={state.validAttacks}
              validSpawns={validSpawns}
              invalidSpawnPosition={spawnFeedback?.position ?? null}
              onCellClick={handleCellClick}
              onUnitClick={handleUnitClick}
            />
          </div>

          {/* Action bar below board */}
          <ActionBar
            actionsRemaining={state.turn.actionsRemaining}
            phase={state.turn.phase}
            onEndPlacePhase={endPlacePhase}
            onEndActionPhase={endActionPhase}
            onEndTurn={endTurn}
            isPlayerTurn={isPlayerTurn && !isThinking}
            onUndo={undo}
            canUndo={canUndo}
          />

          {/* Opponent info row - below board */}
          <div className="flex flex-wrap items-start justify-center gap-3 w-full max-w-3xl">
            <ResourceDisplay
              playerState={state.players.ai}
              viewerIsOwner={false}
            />
            <BuildQueue
              queue={state.players.ai.buildQueue}
              isOwner={false}
            />
          </div>
        </div>

        {/* Controls hint */}
        <div className="mt-4 text-center text-gray-500 text-sm">
          {isThinking ? (
            <span className="text-yellow-400">AI is making its move...</span>
          ) : spawnFeedback ? (
            <span className="text-red-400">
              {spawnFeedback.reason === 'enemy_blocking'
                ? 'Enemies are blocking this area'
                : 'Outside your controlled area'}
            </span>
          ) : (
            <>
              Click a unit to select, then click a highlighted cell to move/attack.
              {selectedUnitData && canMineHere() && (
                <span className="text-purple-400"> You can mine here!</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
