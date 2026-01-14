import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
import { AIConsole } from './AIConsole';
import { PassDeviceOverlay } from './PassDeviceOverlay';
import { InstructionsModal } from './InstructionsModal';
import { getUnitById, getCell, isOccupied, isValidPosition } from '../game/board';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../game/units';
import { canMine } from '../game/mining';
import { canPromote } from '../game/promotion';
import { getAllSpawnPositions, getSpawnInvalidReason } from '../game/spawning';
import { canBuildUnit } from '../game/building';
import type { Position, GameConfig, PlayerId, Element } from '../game/types';

type SpawnFeedback = {
  position: Position;
  reason: 'enemy_blocking' | 'outside_control';
} | null;

interface GameScreenProps {
  config: GameConfig;
  onBackToMenu: () => void;
}

export function GameScreen({ config, onBackToMenu }: GameScreenProps) {
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
  } = useGameState();

  const [selectedReadyUnitId, setSelectedReadyUnitId] = useState<string | null>(null);
  const [selectedPlaceUnitId, setSelectedPlaceUnitId] = useState<string | null>(null);
  const [spawnFeedback, setSpawnFeedback] = useState<SpawnFeedback>(null);
  const [viewedEnemyUnitId, setViewedEnemyUnitId] = useState<string | null>(null);
  const [showPassOverlay, setShowPassOverlay] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const lastTurnPlayer = useRef<PlayerId | null>(null);

  // Unit shop keyboard navigation state
  const [shopSelectedId, setShopSelectedId] = useState<string | null>(null);

  // Partial movement state: tracks pending move path before committing
  const [pendingMovePath, setPendingMovePath] = useState<Position[]>([]);

  // Helper: check if current player is human-controlled
  const isCurrentPlayerHuman = config.controls[state.turn.currentPlayer] === 'human';
  const isPlayerTurn = state.turn.currentPlayer === 'player';

  // For display purposes - who's "playing" right now
  const currentPlayerName = isPlayerTurn
    ? (config.mode === 'pass-play' ? 'Player 1' : 'You')
    : (config.mode === 'pass-play' ? 'Player 2' : 'AI');

  // Clear place phase selections when phase changes or turn ends
  useEffect(() => {
    if (state.turn.phase !== 'place' || !isCurrentPlayerHuman) {
      setSelectedReadyUnitId(null);
      setSelectedPlaceUnitId(null);
      setSpawnFeedback(null);
    }
  }, [state.turn.phase, isCurrentPlayerHuman]);

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

  // Show pass device overlay when turn changes in pass-play mode
  useEffect(() => {
    if (config.mode === 'pass-play') {
      const currentPlayer = state.turn.currentPlayer;
      if (lastTurnPlayer.current !== null && lastTurnPlayer.current !== currentPlayer) {
        setShowPassOverlay(true);
      }
      lastTurnPlayer.current = currentPlayer;
    }
  }, [state.turn.currentPlayer, config.mode]);

  // Compute valid spawn positions when a ready unit is selected
  const validSpawns = useMemo(() => {
    if (state.turn.phase !== 'place' || !selectedReadyUnitId) {
      return [];
    }
    return getAllSpawnPositions(state.turn.currentPlayer, state.board);
  }, [state.turn.phase, selectedReadyUnitId, state.board, state.turn.currentPlayer]);

  // Get the definition ID for the selected ready unit (for preview)
  const selectedReadyDefinitionId = useMemo(() => {
    if (!selectedReadyUnitId) return null;
    const currentPlayerState = state.players[state.turn.currentPlayer];
    const queuedUnit = currentPlayerState.buildQueue.find(
      (q) => q.id === selectedReadyUnitId
    );
    return queuedUnit?.definitionId ?? null;
  }, [selectedReadyUnitId, state.players, state.turn.currentPlayer]);

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

  // AI for "player" side (used in AI vs AI mode)
  const playerAI = useAI({
    difficulty: config.aiDifficulty.player,
    thinkingDelay: 400,
    enabled: config.controls.player === 'ai',
  });

  // AI for "ai" side (used in vs-ai and ai-vs-ai modes)
  const aiAI = useAI({
    difficulty: config.aiDifficulty.ai,
    thinkingDelay: 400,
    enabled: config.controls.ai === 'ai',
  });

  const [showAIRecap, setShowAIRecap] = useState(false);

  // Track which turn number each AI has executed to prevent duplicate execution on reload
  const [playerAiExecutedTurn, setPlayerAiExecutedTurn] = useState<number | null>(null);
  const [aiAiExecutedTurn, setAiAiExecutedTurn] = useState<number | null>(null);

  // Combined isThinking state
  const isThinking = playerAI.isThinking || aiAI.isThinking;

  // Trigger AI turn for 'player' side (AI vs AI mode)
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'player' &&
      config.controls.player === 'ai' &&
      state.phase === 'playing' &&
      !playerAI.isThinking &&
      !isPaused &&
      playerAiExecutedTurn !== state.turn.turnNumber
    ) {
      setPlayerAiExecutedTurn(state.turn.turnNumber);
      playerAI.executeAITurn(state, applyAIAction);
    }
  }, [state.turn.currentPlayer, state.phase, playerAI, isPaused, state, applyAIAction, playerAiExecutedTurn, config.controls.player]);

  // Trigger AI turn for 'ai' side
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'ai' &&
      config.controls.ai === 'ai' &&
      state.phase === 'playing' &&
      !aiAI.isThinking &&
      !isPaused &&
      aiAiExecutedTurn !== state.turn.turnNumber
    ) {
      setAiAiExecutedTurn(state.turn.turnNumber);
      aiAI.executeAITurn(state, applyAIAction);
    }
  }, [state.turn.currentPlayer, state.phase, aiAI, isPaused, state, applyAIAction, aiAiExecutedTurn, config.controls.ai]);

  // Show AI recap when AI's turn ends and human's turn begins (only in vs-ai mode)
  useEffect(() => {
    if (
      config.mode === 'vs-ai' &&
      isPlayerTurn &&
      !isThinking &&
      aiAI.lastTurnActions.length > 0 &&
      state.turn.turnNumber > 1
    ) {
      setShowAIRecap(true);
    }
  }, [config.mode, isPlayerTurn, isThinking, aiAI.lastTurnActions.length, state.turn.turnNumber]);

  const handleDismissRecap = () => {
    setShowAIRecap(false);
    aiAI.clearLastTurnActions();
  };

  const handleContinueFromPass = () => {
    setShowPassOverlay(false);
  };

  const handleCellClick = (position: Position) => {
    if (!isCurrentPlayerHuman || isThinking || showPassOverlay) {
      return;
    }

    const currentPlayer = state.turn.currentPlayer;

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
        const reason = getSpawnInvalidReason(position, currentPlayer, state.board);
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
    if (!isCurrentPlayerHuman || isThinking || showPassOverlay) {
      return;
    }

    const unit = getUnitById(state.board, unitId);
    if (!unit) return;

    const currentPlayer = state.turn.currentPlayer;
    const isOwnUnit = unit.owner === currentPlayer;

    // Handle place phase - selecting units for promotion
    if (state.turn.phase === 'place') {
      if (isOwnUnit) {
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

    if (isOwnUnit) {
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

  // Element order for keyboard shortcuts (1-6)
  const ELEMENT_ORDER: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

  // Get player's own units on the board for Tab cycling
  const playerOwnUnits = useMemo(() => {
    return state.board.units.filter(u => u.owner === state.turn.currentPlayer);
  }, [state.board.units, state.turn.currentPlayer]);

  // Clear pending move when unit is deselected or phase changes
  useEffect(() => {
    if (!state.selectedUnit || state.turn.phase !== 'action') {
      setPendingMovePath([]);
    }
  }, [state.selectedUnit, state.turn.phase]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if AI is thinking, overlay is shown, or it's not human's turn
    if (!isCurrentPlayerHuman || isThinking || showPassOverlay) return;
    // Don't handle if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();
    const currentPlayer = state.turn.currentPlayer;
    const currentPlayerState = state.players[currentPlayer];

    // === Cmd+Z / Ctrl+Z: Undo ===
    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      e.preventDefault();
      if (canUndo) {
        // Clear pending move before undo
        setPendingMovePath([]);
        undo();
      }
      return;
    }

    // === Enter: End current phase ===
    if (key === 'enter' && state.turn.phase !== 'queue') {
      e.preventDefault();
      // Commit any pending move first
      if (pendingMovePath.length > 0 && state.selectedUnit) {
        const finalPosition = pendingMovePath[pendingMovePath.length - 1];
        moveUnit(state.selectedUnit, finalPosition);
        setPendingMovePath([]);
      }
      if (state.turn.phase === 'place') {
        endPlacePhase();
      } else if (state.turn.phase === 'action') {
        endActionPhase();
      }
      return;
    }

    // === Tab: Cycle between own units ===
    if (key === 'tab') {
      e.preventDefault();
      if (playerOwnUnits.length === 0) return;

      // Commit any pending move before switching units
      if (pendingMovePath.length > 0 && state.selectedUnit) {
        const finalPosition = pendingMovePath[pendingMovePath.length - 1];
        moveUnit(state.selectedUnit, finalPosition);
        setPendingMovePath([]);
      }

      let currentIndex = -1;
      const currentSelectedId = state.turn.phase === 'action'
        ? state.selectedUnit
        : selectedPlaceUnitId;

      if (currentSelectedId) {
        currentIndex = playerOwnUnits.findIndex(u => u.id === currentSelectedId);
      }

      const nextIndex = (currentIndex + 1) % playerOwnUnits.length;
      const nextUnit = playerOwnUnits[nextIndex];

      if (state.turn.phase === 'action') {
        selectUnit(nextUnit.id);
      } else if (state.turn.phase === 'place') {
        setSelectedPlaceUnitId(nextUnit.id);
        setSelectedReadyUnitId(null);
        setViewedEnemyUnitId(null);
      }
      return;
    }

    // === Queue phase: Unit shop shortcuts ===
    if (state.turn.phase === 'queue') {
      // 1-6: Select tier 1 unit of that element
      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const elementIndex = parseInt(e.key) - 1;
        const element = ELEMENT_ORDER[elementIndex];
        const tier1Unit = UNIT_DEFINITIONS.find(d => d.element === element && d.tier === 1);
        if (tier1Unit) {
          setShopSelectedId(tier1Unit.id);
        }
        return;
      }

      // Arrow keys: Navigate unit shop
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        // Build the unit grid structure for navigation
        const unitsByTier: Record<number, typeof UNIT_DEFINITIONS> = {
          1: UNIT_DEFINITIONS.filter(d => d.tier === 1).sort((a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element)),
          2: UNIT_DEFINITIONS.filter(d => d.tier === 2).sort((a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element)),
          3: UNIT_DEFINITIONS.filter(d => d.tier === 3).sort((a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element)),
          4: UNIT_DEFINITIONS.filter(d => d.tier === 4).sort((a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element)),
        };

        // Find current position in grid
        let currentTier = 1;
        let currentCol = 0;
        if (shopSelectedId) {
          const selectedDef = UNIT_DEFINITIONS.find(d => d.id === shopSelectedId);
          if (selectedDef) {
            currentTier = selectedDef.tier;
            currentCol = ELEMENT_ORDER.indexOf(selectedDef.element);
          }
        }

        // Calculate new position
        let newTier = currentTier;
        let newCol = currentCol;

        if (key === 'arrowup') newTier = Math.max(1, currentTier - 1);
        if (key === 'arrowdown') newTier = Math.min(4, currentTier + 1);
        if (key === 'arrowleft') newCol = Math.max(0, currentCol - 1);
        if (key === 'arrowright') newCol = Math.min(5, currentCol + 1);

        // Find unit at new position
        const newUnit = unitsByTier[newTier][newCol];
        if (newUnit) {
          setShopSelectedId(newUnit.id);
        }
        return;
      }

      // Enter/B: Build selected unit in shop
      if ((key === 'enter' || key === 'b') && shopSelectedId) {
        e.preventDefault();
        const buildState = { queue: [], crystals: currentPlayerState.resources };
        if (canBuildUnit(shopSelectedId, currentPlayer, state.board, buildState)) {
          queueUnit(shopSelectedId);
          setShopSelectedId(null);
        }
        return;
      }
    }

    // === Place phase shortcuts ===
    if (state.turn.phase === 'place') {
      // U: Upgrade/promote selected unit
      if (key === 'u' && selectedPlaceUnitId) {
        e.preventDefault();
        const unit = getUnitById(state.board, selectedPlaceUnitId);
        if (unit) {
          const buildState = { queue: [], crystals: currentPlayerState.resources };
          if (canPromote(unit, buildState)) {
            promoteUnit(selectedPlaceUnitId);
            setSelectedPlaceUnitId(null);
          }
        }
        return;
      }
    }

    // === Action phase shortcuts ===
    if (state.turn.phase === 'action' && state.selectedUnit) {
      const unit = getUnitById(state.board, state.selectedUnit);
      if (!unit || !unit.canActThisTurn) return;

      const unitDef = getUnitDefinition(unit.definitionId);
      const unitSpeed = unitDef.speed;

      // M: Mine (commits pending move first)
      if (key === 'm') {
        e.preventDefault();
        // Commit pending move first if any
        if (pendingMovePath.length > 0) {
          const finalPosition = pendingMovePath[pendingMovePath.length - 1];
          moveUnit(state.selectedUnit, finalPosition);
          setPendingMovePath([]);
        } else if (canMine(unit, state.board)) {
          mineWith(state.selectedUnit);
        }
        return;
      }

      // Arrow keys: Partial movement (accumulate steps until full speed)
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();

        // Get current position (original unit position or last pending position)
        const currentPos = pendingMovePath.length > 0
          ? pendingMovePath[pendingMovePath.length - 1]
          : unit.position;

        let targetPos: Position;
        if (key === 'arrowup') targetPos = { x: currentPos.x, y: currentPos.y - 1 };
        else if (key === 'arrowdown') targetPos = { x: currentPos.x, y: currentPos.y + 1 };
        else if (key === 'arrowleft') targetPos = { x: currentPos.x - 1, y: currentPos.y };
        else targetPos = { x: currentPos.x + 1, y: currentPos.y };

        // Check if the target is valid (not occupied and within board bounds)
        // For pending moves, we need to check if it would be valid from the pending position
        if (isValidPosition(targetPos) && !isOccupied(state.board, targetPos)) {
          // Also check that the path doesn't loop back through the original position
          const isNotLoopingBack = !pendingMovePath.some(
            p => p.x === targetPos.x && p.y === targetPos.y
          ) && !(targetPos.x === unit.position.x && targetPos.y === unit.position.y);

          if (isNotLoopingBack) {
            const newPath = [...pendingMovePath, targetPos];

            // If we've reached full speed, commit the move
            if (newPath.length >= unitSpeed) {
              moveUnit(state.selectedUnit, targetPos);
              setPendingMovePath([]);
            } else {
              // Otherwise, just add to pending path
              setPendingMovePath(newPath);
            }
          }
        }
        return;
      }

      // Escape: Cancel pending move
      if (key === 'escape' && pendingMovePath.length > 0) {
        e.preventDefault();
        setPendingMovePath([]);
        return;
      }
    }
  }, [
    isCurrentPlayerHuman, isThinking, showPassOverlay, state, playerOwnUnits,
    selectUnit, selectedPlaceUnitId, promoteUnit, mineWith, moveUnit, queueUnit, shopSelectedId,
    canUndo, undo, endPlacePhase, endActionPhase, pendingMovePath
  ]);

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
    setPlayerAiExecutedTurn(null);
    setAiAiExecutedTurn(null);
    lastTurnPlayer.current = null;
    setShowPassOverlay(false);
    resetGame();
  };

  const handleBackToMenuClick = () => {
    onBackToMenu();
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  // Handler to close unit info / deselect unit
  const handleCloseUnitInfo = () => {
    // Clear pending move if any
    setPendingMovePath([]);
    // Deselect unit in action phase
    if (state.selectedUnit) {
      deselect();
    }
    // Clear place phase selections
    setSelectedPlaceUnitId(null);
    setSelectedReadyUnitId(null);
    setViewedEnemyUnitId(null);
  };

  // Get the current player's state for resource/queue display
  const currentPlayerState = state.players[state.turn.currentPlayer];
  const opponentPlayer: PlayerId = state.turn.currentPlayer === 'player' ? 'ai' : 'player';
  const opponentState = state.players[opponentPlayer];

  // In pass-play mode, each player should only see their own queue
  const showOpponentQueue = config.mode !== 'pass-play';
  const showAIConsole = config.controls.player === 'ai' || config.controls.ai === 'ai';

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Victory overlay */}
      {state.phase === 'victory' && state.winner && (
        <VictoryScreen
          winner={state.winner}
          onPlayAgain={handlePlayAgain}
          playerNames={config.mode === 'pass-play'
            ? { player: 'Player 1', ai: 'Player 2' }
            : { player: 'You', ai: 'AI' }
          }
        />
      )}

      {/* Pass device overlay for pass-play mode */}
      {showPassOverlay && config.mode === 'pass-play' && (
        <PassDeviceOverlay
          nextPlayer={state.turn.currentPlayer}
          onContinue={handleContinueFromPass}
        />
      )}

      {/* AI turn recap */}
      {showAIRecap && (
        <AIRecap actions={aiAI.lastTurnActions} onDismiss={handleDismissRecap} />
      )}

      {/* Instructions modal */}
      <InstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-100">Muju Hono Tanka</h1>
            <span className="text-sm text-gray-400">
              {config.mode === 'vs-ai' && 'vs AI'}
              {config.mode === 'pass-play' && 'Pass & Play'}
              {config.mode === 'ai-vs-ai' && 'AI vs AI'}
            </span>
            <button
              onClick={() => setShowInstructions(true)}
              className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              How to Play
            </button>
            <button
              onClick={handleBackToMenuClick}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              Menu
            </button>
            <button
              onClick={handlePlayAgain}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              New Game
            </button>
            {config.mode === 'ai-vs-ai' && (
              <button
                onClick={togglePause}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  isPaused
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-yellow-600 hover:bg-yellow-500'
                }`}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isThinking && (
              <span className="text-yellow-400 animate-pulse">
                {config.mode === 'ai-vs-ai'
                  ? `${isPlayerTurn ? 'AI 1' : 'AI 2'} thinking...`
                  : 'AI thinking...'}
              </span>
            )}
            {isPaused && config.mode === 'ai-vs-ai' && (
              <span className="text-yellow-400">Paused</span>
            )}
            <PhaseIndicator
              turnNumber={state.turn.turnNumber}
              phase={state.turn.phase}
              currentPlayer={state.turn.currentPlayer}
              playerNames={config.mode === 'pass-play'
                ? { player: 'Player 1', ai: 'Player 2' }
                : config.mode === 'ai-vs-ai'
                ? { player: 'AI 1', ai: 'AI 2' }
                : { player: 'You', ai: 'AI' }
              }
            />
          </div>
        </div>

        {/* Main layout - vertical with board centered */}
        <div className="flex flex-col items-center gap-4">
          {/* Current player info row - above board */}
          <div className="relative flex flex-wrap items-start justify-center gap-3 w-full max-w-3xl">
            <ResourceDisplay
              playerState={currentPlayerState}
              viewerIsOwner={true}
              label={config.mode === 'pass-play' ? currentPlayerName : undefined}
            />
            <BuildQueue
              queue={currentPlayerState.buildQueue}
              isOwner={true}
              isPlacePhase={state.turn.phase === 'place' && isCurrentPlayerHuman && !isThinking && !showPassOverlay}
              board={state.board}
              player={state.turn.currentPlayer}
              selectedReadyId={selectedReadyUnitId}
              onSelectReady={setSelectedReadyUnitId}
            />
            {state.turn.phase === 'queue' && isCurrentPlayerHuman && !isThinking && !showPassOverlay && (
              <UnitShop
                resources={currentPlayerState.resources}
                player={state.turn.currentPlayer}
                board={state.board}
                onQueueUnit={queueUnit}
                selectedId={shopSelectedId}
                onSelectId={setShopSelectedId}
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
                  isPlacePhase={state.turn.phase === 'place' && isCurrentPlayerHuman && !isThinking && !showPassOverlay}
                  isActionPhase={state.turn.phase === 'action' && isCurrentPlayerHuman && !isThinking && !showPassOverlay}
                  resources={currentPlayerState.resources}
                  onPromote={handlePromote}
                  isEnemyView={!!viewedEnemyUnitData && !selectedPlaceUnitData && !selectedUnitData}
                  onClose={handleCloseUnitInfo}
                />
              </div>
            )}
          </div>

          {/* Board */}
          <div className={isThinking || showPassOverlay ? 'opacity-75 pointer-events-none' : ''}>
            <Board
              board={state.board}
              currentPlayer={state.turn.currentPlayer}
              selectedUnit={state.selectedUnit}
              selectedUnitElement={selectedUnitData ? getUnitDefinition(selectedUnitData.definitionId).element : null}
              validMoves={state.validMoves}
              validAttacks={state.validAttacks}
              validSpawns={validSpawns}
              invalidSpawnPosition={spawnFeedback?.position ?? null}
              pendingMovePath={pendingMovePath}
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
            isPlayerTurn={isCurrentPlayerHuman && !isThinking && !showPassOverlay}
            onUndo={undo}
            canUndo={canUndo && isCurrentPlayerHuman}
          />

          {/* Opponent info row - below board */}
          <div className="flex flex-wrap items-start justify-center gap-3 w-full max-w-3xl">
            <ResourceDisplay
              playerState={opponentState}
              viewerIsOwner={false}
              label={config.mode === 'pass-play'
                ? (opponentPlayer === 'player' ? 'Player 1' : 'Player 2')
                : config.mode === 'ai-vs-ai'
                ? (opponentPlayer === 'player' ? 'AI 1' : 'AI 2')
                : 'AI'
              }
            />
            {showOpponentQueue && (
              <BuildQueue
                queue={opponentState.buildQueue}
                isOwner={false}
              />
            )}
          </div>

          {showAIConsole && (
            <div className="w-full max-w-3xl flex flex-col gap-3">
              {config.controls.player === 'ai' && (
                <AIConsole
                  title={config.mode === 'ai-vs-ai' ? 'AI 1 Console' : 'AI Console'}
                  debug={playerAI.lastDebug}
                  isThinking={playerAI.isThinking}
                />
              )}
              {config.controls.ai === 'ai' && (
                <AIConsole
                  title={config.mode === 'ai-vs-ai' ? 'AI 2 Console' : 'AI Console'}
                  debug={aiAI.lastDebug}
                  isThinking={aiAI.isThinking}
                />
              )}
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div className="mt-4 text-center text-gray-500 text-sm">
          {isThinking ? (
            <span className="text-yellow-400">
              {config.mode === 'ai-vs-ai'
                ? `${isPlayerTurn ? 'AI 1' : 'AI 2'} is making its move...`
                : 'AI is making its move...'}
            </span>
          ) : showPassOverlay ? (
            <span className="text-blue-400">Tap to continue</span>
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
