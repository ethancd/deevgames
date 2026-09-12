import { INITIAL_MAP_RESOURCES } from '../game/resourceMap';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../game/inactivity';
import { UpkeepPanel } from './UpkeepPanel';
import { upkeepDue } from '../game/upkeep';
import { VisualKey } from './VisualKey';
import { getHomeOccupier } from '../game/victory';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useGameState } from '../hooks/useGameState';
import { useAI } from '../hooks/useAI';
import { Board } from './Board';
import { ActionBar } from './ActionBar';
import { UnitInfo } from './UnitInfo';
import { UnitShop } from './UnitShop';
import { VictoryScreen } from './VictoryScreen';
import { ElementLegend } from './ElementLegend';
import { TurnReplay, useReplayPlayback } from './TurnReplay';
import { AIRecap } from './AIRecap';
import { AIConsole } from './AIConsole';
import { PassDeviceOverlay } from './PassDeviceOverlay';
import { InstructionsModal } from './InstructionsModal';
import { getUnitAt, getUnitById, getCell, isOccupied, isValidPosition } from '../game/board';
import { getActionsPerTurn } from '../game/rules';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../game/units';
import { projectedIncome } from '../game/mining';
import { canPromote } from '../game/promotion';
import { getAllSpawnPositions, getSpawnInvalidReason } from '../game/spawning';
import { findAttackApproach, getMovementRange, getAttackFrontier, type MovementRangePosition } from '../game/movement';
import { calculateAttackPower, calculateDefense } from '../game/combat';
import { PlayDialog } from './PlayDialog';
import type { Position, GameConfig, PlayerId, Element } from '../game/types';
import type { ReactNode } from 'react';

type SpawnFeedback = {
  position: Position;
  reason: 'enemy_blocking' | 'outside_control';
} | null;

interface GameScreenProps {
  config: GameConfig;
  onBackToMenu: () => void;
}

export function GameScreen({ config, onBackToMenu }: GameScreenProps) {
  const game = useGameState(config);
  return <GameView config={config} onBackToMenu={onBackToMenu} game={game} />;
}

export function GameView({ config, onBackToMenu, game, online }: GameScreenProps & {
  game: ReturnType<typeof useGameState>;
  online?: { player: PlayerId; ready: boolean; busy: boolean; names: Record<PlayerId, string>; banner: ReactNode };
}) {
  const {
    state, payUpkeep, setUpkeepReview,
    selectUnit,
    deselect,
    moveUnit,
    moveAndAttack,
    attackWith,
    endPlacePhase,
    endActionPhase,
    buyUnit,
    promoteUnit,
    applyAIAction,
    resetGame,
    undo,
    canUndo,
    selectedUnitData,
  } = game;
  const actionsPerTurn = getActionsPerTurn(state);
  const { playback, startReplay, closeReplay } = useReplayPlayback();
  const showReplay = !!playback;
  const replayFrame = playback && playback.step > 0 ? playback.replay.frames[playback.step - 1] : null;
  useEffect(closeReplay, [state.turn.currentPlayer, state.turn.turnNumber, state.phase, closeReplay]);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [selectedPlaceUnitId, setSelectedPlaceUnitId] = useState<string | null>(null);
  const [spawnFeedback, setSpawnFeedback] = useState<SpawnFeedback>(null);
  const [viewedEnemyUnitId, setViewedEnemyUnitId] = useState<string | null>(null);
  const [showPassOverlay, setShowPassOverlay] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [showVisualKey, setShowVisualKey] = useState(false);
  const [showEnemyRange, setShowEnemyRange] = useState(false);
  const [preview, setPreview] = useState<{ position: Position; path: Position[] } | null>(null);
  useEffect(() => { setPreview(null); setPendingMovePath([]); }, [state.selectedUnit, state.turn.phase, state.turn.currentPlayer]);
  useEffect(() => {
    setPendingMovePath([]);
    // A manually chosen landing square keeps the attack selected when it is
    // still legal from there. Other board changes invalidate the route.
    setPreview(current => {
      const target = current ? getUnitAt(state.board, current.position) : null;
      const path = selectedUnitData && target
        ? findAttackApproach(selectedUnitData, target, state.board, state.turn.actionsRemaining) : null;
      return current && path?.length === 0 ? { position: current.position, path: [] } : null;
    });
  }, [state.board]);
  useEffect(() => { setViewedEnemyUnitId(null); setShowEnemyRange(false); }, [state.turn.currentPlayer]);
  const lastTurnPlayer = useRef<PlayerId | null>(null);

  // Unit shop keyboard navigation state
  const [shopSelectedId, setShopSelectedId] = useState<string | null>(null);

  // Partial movement state: tracks pending move path before committing
  const [pendingMovePath, setPendingMovePath] = useState<Position[]>([]);

  // Unit shop inspection mode (show shop for all catalogue tiers)
  const [showUnitShopInspection, setShowUnitShopInspection] = useState(false);

  const humanPlayer: PlayerId | null = online ? online.player : config.mode === 'vs-ai'
    ? config.controls.white === 'human' ? 'white' : 'black'
    : null;

  // Human controls follow the configured side, including Black against the AI.
  const isCurrentPlayerHuman = config.controls[state.turn.currentPlayer] === 'human' &&
    (!online || (state.turn.currentPlayer === online.player && online.ready && !online.busy));

  // Clear place phase selections when phase changes or turn ends
  useEffect(() => {
    if (state.turn.phase !== 'place' || !isCurrentPlayerHuman) {
      setSelectedPurchaseId(null);
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

  // Every newly inspected enemy starts with its reach visible.
  useEffect(() => {
    if (viewedEnemyUnitId) setShowEnemyRange(true);
  }, [viewedEnemyUnitId]);

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

  // Compute valid spawn positions when a purchase is selected
  const validSpawns = useMemo(() => {
    if (state.turn.phase !== 'place' || !selectedPurchaseId) {
      return [];
    }
    return getAllSpawnPositions(state.turn.currentPlayer, state.board);
  }, [state.turn.phase, selectedPurchaseId, state.board, state.turn.currentPlayer]);

  const selectedPurchaseDefinitionId = selectedPurchaseId;

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

  // Calculate movement range for any viewed/selected unit
  const movementRange = useMemo((): MovementRangePosition[] => {
    // Determine which unit to show movement range for
    const unit = selectedUnitData ?? viewedEnemyUnitData ?? selectedPlaceUnitData;
    if (!unit) return [];

    const isOwnUnit = unit.owner === state.turn.currentPlayer;
    const unitDef = getUnitDefinition(unit.definitionId);

    const speed = unitDef.speed;
    let totalActions: number = actionsPerTurn;

    if (!isOwnUnit && !showEnemyRange) return [];
    if (isOwnUnit && (state.turn.phase !== 'action' || !unit.canActThisTurn)) return [];

    // If it's my unit during action phase, use remaining actions
    if (isOwnUnit && state.turn.phase === 'action') {
      totalActions = state.turn.actionsRemaining;
    }

    return getMovementRange(unit.position, speed, totalActions, state.board);
  }, [selectedUnitData, viewedEnemyUnitData, selectedPlaceUnitData, state.turn.currentPlayer, state.turn.phase, state.turn.actionsRemaining, state.board, isCurrentPlayerHuman, showEnemyRange, actionsPerTurn]);

  const attackFrontier = useMemo(() => {
    const unit = selectedUnitData ?? viewedEnemyUnitData ?? selectedPlaceUnitData;
    return showEnemyRange && unit && unit.owner !== state.turn.currentPlayer
      ? getAttackFrontier(unit, state.board, actionsPerTurn - 1)
      : [];
  }, [selectedUnitData, viewedEnemyUnitData, selectedPlaceUnitData, showEnemyRange, state.turn.currentPlayer, state.board, actionsPerTurn]);

  const latestState = useRef(state); latestState.current = state;
  const getCurrentState = useCallback(() => latestState.current, []);

  // Either side can be AI-controlled in vs-ai and ai-vs-ai modes.
  const whiteAI = useAI({
    difficulty: config.aiDifficulty.white,
    thinkingDelay: 400,
    enabled: config.controls.white === 'ai' && !isPaused && state.phase === 'playing',
    getCurrentState, state,
  });

  const blackAI = useAI({
    difficulty: config.aiDifficulty.black,
    thinkingDelay: 400,
    enabled: config.controls.black === 'ai' && !isPaused && state.phase === 'playing',
    getCurrentState, state,
  });
  const opponentAI = humanPlayer === 'black' ? whiteAI : blackAI;

  const [showAIRecap, setShowAIRecap] = useState(false);

  // Track which turn number each AI has executed to prevent duplicate execution on reload
  const [playerAiExecutedTurn, setPlayerAiExecutedTurn] = useState<number | null>(null);
  const [aiAiExecutedTurn, setAiAiExecutedTurn] = useState<number | null>(null);

  // A changed controller/preset invalidates the old execution marker as well
  // as its worker, so the current turn can resume with the new configuration.
  useEffect(() => {
    setPlayerAiExecutedTurn(null); setAiAiExecutedTurn(null);
  }, [config.controls.white, config.controls.black, config.aiDifficulty.white, config.aiDifficulty.black]);

  // Combined isThinking state
  const isThinking = whiteAI.isThinking || blackAI.isThinking;

  // Trigger AI turn for 'white' side.
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'white' &&
      config.controls.white === 'ai' &&
      state.phase === 'playing' &&
      !whiteAI.isThinking &&
      !isPaused &&
      playerAiExecutedTurn !== state.turn.turnNumber
    ) {
      setPlayerAiExecutedTurn(state.turn.turnNumber);
      whiteAI.executeAITurn(state, applyAIAction, 'white');
    }
  }, [state.turn.currentPlayer, state.phase, whiteAI, isPaused, state, applyAIAction, playerAiExecutedTurn, config.controls.white]);

  // Trigger AI turn for 'black' side
  useEffect(() => {
    if (
      state.turn.currentPlayer === 'black' &&
      config.controls.black === 'ai' &&
      state.phase === 'playing' &&
      !blackAI.isThinking &&
      !isPaused &&
      aiAiExecutedTurn !== state.turn.turnNumber
    ) {
      setAiAiExecutedTurn(state.turn.turnNumber);
      blackAI.executeAITurn(state, applyAIAction, 'black');
    }
  }, [state.turn.currentPlayer, state.phase, blackAI, isPaused, state, applyAIAction, aiAiExecutedTurn, config.controls.black]);

  // Show AI recap when AI's turn ends and human's turn begins (only in vs-ai mode)
  useEffect(() => {
    if (
      config.mode === 'vs-ai' &&
      isCurrentPlayerHuman &&
      !isThinking &&
      opponentAI.lastTurnActions.length > 0
    ) {
      setShowAIRecap(true);
    }
  }, [config.mode, isCurrentPlayerHuman, isThinking, opponentAI.lastTurnActions.length, state.turn.turnNumber]);

  const handleDismissRecap = () => {
    setShowAIRecap(false);
    opponentAI.clearLastTurnActions();
  };

  const handleContinueFromPass = () => {
    setShowPassOverlay(false);
  };

  const handleCellClick = (position: Position) => {
    if (showReplay) return;
    if (!isCurrentPlayerHuman || isThinking || showPassOverlay) {
      return;
    }

    const currentPlayer = state.turn.currentPlayer;

    // Handle place phase - placing purchases
    if (state.turn.phase === 'place' && selectedPurchaseId) {
      const isSpawnValid = validSpawns.some(
        (s) => s.x === position.x && s.y === position.y
      );
      if (isSpawnValid) {
        buyUnit(selectedPurchaseId, position);
        setSelectedPurchaseId(null);
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

    // Check if clicking on valid move (single action)
    const isValidMove = state.validMoves.some(
      (m) => m.x === position.x && m.y === position.y
    );

    // Check if clicking on valid attack
    const isValidAttack = state.validAttacks.some(
      (a) => a.x === position.x && a.y === position.y
    );

    // Check if clicking on movement range (multi-action move)
    const movementRangePos = movementRange.find(
      (r) => r.position.x === position.x && r.position.y === position.y
    );

    if (isValidMove && state.selectedUnit) {
      moveUnit(state.selectedUnit, position);
    } else if (isValidAttack && state.selectedUnit) {
      setPreview({ position, path: [] });
    } else if (movementRangePos && state.selectedUnit && selectedUnitData?.owner === state.turn.currentPlayer) {
      // Multi-action move to a position in movement range
      moveUnit(state.selectedUnit, position);
    } else {
      deselect();
    }
  };

  const handleUnitClick = (unitId: string) => {
    if (showReplay) return;
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
        // Clear purchase selection if selecting a board unit
        setSelectedPurchaseId(null);
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
      setViewedEnemyUnitId(viewedEnemyUnitId === unitId ? null : unitId);
      return;
    }

    if (isOwnUnit) {
      if (state.selectedUnit === unitId) {
        deselect();
      } else {
        selectUnit(unitId);
      }
    } else if (state.selectedUnit) {
      const path = selectedUnitData
        ? findAttackApproach(selectedUnitData, unit, state.board, state.turn.actionsRemaining)
        : null;
      if (path !== null) {
        setPendingMovePath([]);
        setPreview({ position: unit.position, path });
      } else {
        deselect();
        setViewedEnemyUnitId(unitId);
      }
    } else {
      // No selection - view enemy stats
      setViewedEnemyUnitId(viewedEnemyUnitId === unitId ? null : unitId);
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

  // Get player's own units on the board for N cycling
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
    if (showReplay || !isCurrentPlayerHuman || isThinking || showPassOverlay || showMenu || showInstructions || showUnitShopInspection || showInsights || showVisualKey) return;
    const control = e.target instanceof HTMLElement ? e.target.closest('button, select, a, input, textarea') : null;
    if (control?.matches('select, input, textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      setPreview(null); setPendingMovePath([]);
      if (canUndo) undo();
      return;
    }
    if (preview) {
      if (e.key === 'Escape') { e.preventDefault(); setPreview(null); }
      if (e.key === 'Enter' && (!control || control.matches('.board-cell'))) { e.preventDefault(); commitPreview(); }
      return;
    }
    // Don't handle if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const key = e.key.toLowerCase();
    // Native button activation and Tab navigation keep their normal behavior.
    if (control && (key === 'enter' || key === ' ' || (key.startsWith('arrow') && !control.matches('.board-cell')))) return;
    const currentPlayer = state.turn.currentPlayer;
    const currentPlayerState = state.players[currentPlayer];

    // === Enter: End current phase ===
    if (key === 'enter') {
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

    // === N: Cycle between own units ===
    if (key === 'n') {
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
        setSelectedPurchaseId(null);
        setViewedEnemyUnitId(null);
      }
      return;
    }

    if (state.turn.phase === 'place' && ['1','2','3','4','5','6'].includes(key)) {
      const def = UNIT_DEFINITIONS.find(d => d.element === ELEMENT_ORDER[Number(key)-1] && d.tier === 1)!;
      if (def.cost <= currentPlayerState.resources) { setSelectedPurchaseId(def.id); setSelectedPlaceUnitId(null); }
      e.preventDefault(); return;
    }

    // === Place phase shortcuts ===
    if (state.turn.phase === 'place') {
      // U: Upgrade/promote selected unit
      if (key === 'u' && selectedPlaceUnitId) {
        e.preventDefault();
        const unit = getUnitById(state.board, selectedPlaceUnitId);
        if (unit) {
          const buildState = { crystals: currentPlayerState.resources };
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
    selectUnit, selectedPlaceUnitId, promoteUnit, moveUnit, moveAndAttack, attackWith,
    showReplay, canUndo, undo, endPlacePhase, endActionPhase, pendingMovePath, preview, showMenu, showInstructions, showUnitShopInspection, showInsights, showVisualKey
  ]);

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Current reserve for the selected piece.
  const selectedUnitCell = useMemo(() => {
    const unitToShow = selectedPlaceUnitData ?? selectedUnitData;
    if (!unitToShow) return null;
    return getCell(state.board, unitToShow.position);
  }, [selectedPlaceUnitData, selectedUnitData, state.board]);

  const handlePlayAgain = () => {
    if (online) { onBackToMenu(); return; }
    whiteAI.cancel(); blackAI.cancel();
    whiteAI.clearLastTurnActions(); blackAI.clearLastTurnActions();
    setShowAIRecap(false);
    setPlayerAiExecutedTurn(null);
    setAiAiExecutedTurn(null);
    lastTurnPlayer.current = null;
    setShowPassOverlay(false);
    resetGame();
  };

  const handleBackToMenuClick = () => {
    whiteAI.cancel(); blackAI.cancel();
    onBackToMenu();
  };

  const togglePause = () => {
    whiteAI.cancel(); blackAI.cancel();
    setPlayerAiExecutedTurn(null); setAiAiExecutedTurn(null);
    setIsPaused(!isPaused);
  };

  // Handler to close unit info / deselect unit
  const handleCloseUnitInfo = () => {
    // Clear pending move if any
    setPendingMovePath([]);
    setPreview(null);
    // Deselect unit in action phase
    if (state.selectedUnit) {
      deselect();
    }
    // Clear place phase selections
    setSelectedPlaceUnitId(null);
    setSelectedPurchaseId(null);
    setViewedEnemyUnitId(null);
  };

  // Get the current player's state for public bank display
  const currentPlayerState = state.players[state.turn.currentPlayer];
  const viewerPlayer: PlayerId = humanPlayer ?? state.turn.currentPlayer;
  const viewerState = state.players[viewerPlayer];
  const opponentPlayer: PlayerId = viewerPlayer === 'white' ? 'black' : 'white';
  const opponentState = state.players[opponentPlayer];

  const interactive = !showReplay && isCurrentPlayerHuman && !isThinking && !showPassOverlay && state.phase === 'playing' && !state.upkeepPending;
  const playerNames = online ? online.names : config.mode === 'pass-play' ? { white: 'Player 1', black: 'Player 2' }
    : config.mode === 'ai-vs-ai' ? { white: 'AI 1', black: 'AI 2' }
    : { white: humanPlayer === 'white' ? 'You' : 'AI', black: humanPlayer === 'black' ? 'You' : 'AI' };
  const shownUnit = selectedPlaceUnitData ?? selectedUnitData ?? viewedEnemyUnitData;
  const isEnemyView = !!shownUnit && shownUnit.owner !== state.turn.currentPlayer;
  const previewTarget = preview ? getUnitAt(state.board, preview.position) : null;
  const previewMoveCost = preview && selectedUnitData
    ? Math.ceil(preview.path.length / getUnitDefinition(selectedUnitData.definitionId).speed) : 0;
  const previewCost = previewMoveCost + 1;
  const previewPath = preview?.path ?? pendingMovePath;
  const previewLanding = preview?.path.at(-1);
  const attackPower = selectedUnitData && previewTarget ? calculateAttackPower(selectedUnitData, previewTarget) : 0;
  const attackDefense = previewTarget ? calculateDefense(previewTarget) : 0;
  function commitPreview() {
    if (!preview || !state.selectedUnit || !interactive) return;
    if (previewLanding) moveAndAttack(state.selectedUnit, previewLanding, preview.position);
    else attackWith(state.selectedUnit, preview.position);
    setPreview(null);
  }
  const homeNotice = getHomeOccupier(state.board, state.turn.currentPlayer === 'white' ? 'black' : 'white')
    ? `Clear ${state.turn.currentPlayer === 'white' ? 'A1' : 'J10'} this turn or lose`
    : getHomeOccupier(state.board, state.turn.currentPlayer) ? `Hold ${state.turn.currentPlayer === 'white' ? 'J10' : 'A1'} until your next turn` : '';
  const phaseHint = showReplay ? 'Replaying your opponent’s last turn…' : online && !online.ready ? 'Share your invitation to bring in the other player.'
    : online?.busy ? 'Confirming your move…'
    : !interactive ? (isPaused ? 'Paused' : 'Opponent’s turn')
    : state.turn.phase === 'place' ? 'Buy tier 1, or select a piece to promote.'
    : 'Select a unit. Tap a square to move, or an enemy to preview an attack.';

  return (
    <main className={`game-shell${online ? ' game-shell-online' : ''}`}>
      {state.phase === 'victory' && <VictoryScreen winner={state.winner} reason={state.victoryReason} onPlayAgain={handlePlayAgain} playerNames={playerNames} perspectivePlayer={humanPlayer ?? 'white'} />}
      {showPassOverlay && <PassDeviceOverlay nextPlayer={state.turn.currentPlayer} onContinue={handleContinueFromPass} />}
      {state.upkeepPending && isCurrentPlayerHuman && !showPassOverlay && !showReplay && <UpkeepPanel state={state} onConfirm={payUpkeep} />}
      <InstructionsModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} actionsPerTurn={actionsPerTurn} />
      <aside className="game-overview" aria-label="Match overview">
        {online?.banner}
        {(whiteAI.error || blackAI.error) && <div role="alert">
          The AI stopped thinking. Try again to keep playing.
          <button onClick={() => { whiteAI.clearError(); blackAI.clearError(); whiteAI.cancel(); blackAI.cancel(); setPlayerAiExecutedTurn(null); setAiAiExecutedTurn(null); }}>Retry AI</button>
        </div>}
        {(whiteAI.warning || blackAI.warning) && <small role="status">AI is using its backup engine.</small>}
        <header className="game-header">
          <a href="../" aria-label="Back to Deev Games">← Games</a>
          <h1>Muju Hono Tanka</h1>
          <button disabled={showReplay} onClick={() => setShowMenu(true)} aria-label="Game menu">•••</button>
        </header>
        <section className="turn-strip" aria-label="Turn and phases">
          <strong>{isThinking ? 'Thinking…' : playerNames[state.turn.currentPlayer]} <span>· Turn {state.turn.turnNumber}</span></strong>
          <div className="phase-steps">{(['place', 'action'] as const).map((phase, i) =>
            <span key={phase} aria-current={state.turn.phase === phase ? 'step' : undefined}>{i + 1} {phase === 'action' ? 'Act' : 'Place'}</span>
          )}</div>
        </section>
        <section className="score-strip" aria-label="Player resources">
          <div><strong><i className={`player-dot ${viewerPlayer}`} />{playerNames[viewerPlayer]} <b>◆ {viewerState.resources}</b></strong>
            <small>Gained {viewerState.resourcesGained}</small><small className={upkeepDue(state,viewerPlayer)>viewerState.resources ? 'rent-warning' : ''}>Upkeep {upkeepDue(state,viewerPlayer)} / turn</small></div>
          <div><strong><i className={`player-dot ${opponentPlayer}`} />{playerNames[opponentPlayer]} <b>◆ {opponentState.resources}</b></strong>
            <small>Gained {opponentState.resourcesGained}</small><small>Upkeep {upkeepDue(state,opponentPlayer)} / turn</small></div>
        </section>
        <div className="progress-clock"><span>{actionsPerTurn} actions / turn</span><span className={(state.inactivityPlies??0)>=INACTIVITY_WARNING ? 'rent-warning' : ''}>{state.inactivityPlies??0}/{INACTIVITY_LIMIT} quiet turns</span>{state.lastUpkeep && (state.lastUpkeep.paid>0 || state.lastUpkeep.released.length>0) && <span>{playerNames[state.lastUpkeep.player]} paid {state.lastUpkeep.paid} · released {state.lastUpkeep.released.length}</span>}</div>
      </aside>
      <div className={`play-area ${state.turn.phase === 'place' && (interactive || showReplay) ? 'is-placing' : ''}`}>
        <section className="board-stage" aria-label="Battlefield">
          <Board board={playback ? replayFrame?.board ?? playback.replay.initialBoard : state.board}
            selectedUnit={showReplay ? replayFrame?.unitId ?? null : shownUnit?.id ?? null}
            validMoves={showReplay ? [] : state.validMoves}
            validAttacks={showReplay ? replayFrame?.action.type === 'ATTACK' && replayFrame.position ? [replayFrame.position] : [] : preview ? [preview.position] : state.validAttacks}
            validSpawns={showReplay ? [] : validSpawns}
            invalidSpawnPosition={showReplay ? null : spawnFeedback?.position ?? null}
            pendingMovePath={showReplay ? [] : previewPath} movementRange={showReplay ? [] : movementRange} attackFrontier={showReplay ? [] : attackFrontier}
            previewPosition={showReplay ? replayFrame?.position : preview?.position} previewUnitPosition={showReplay ? undefined : previewLanding}
            showResources={showResources} actionsRemaining={isEnemyView ? actionsPerTurn : state.turn.actionsRemaining}
            onCellClick={handleCellClick} onUnitClick={handleUnitClick} />
        </section>
        <div className="board-key">
          <span role="status">{showReplay ? 'Instant replay · 1 action per second' : homeNotice || (isEnemyView && showEnemyRange ? 'Red dots: attack frontier' : selectedPurchaseId ? '＋ Safe placement' : '● 1 action · ○ farther · ⊗ attack')}</span>
          <button className="visual-key-trigger" onClick={() => setShowVisualKey(true)}>Key</button>
          <button aria-pressed={showResources} onClick={() => setShowResources(!showResources)}>◆ Reserves</button>
        </div>
        <section className="decision-panel" aria-label="Current choice">
          {playback ? <TurnReplay replay={playback.replay} step={playback.step} playerName={playerNames[playback.replay.player]} onClose={closeReplay} />
          : state.turn.phase === 'place' && interactive && !shownUnit ? <UnitShop resources={currentPlayerState.resources} player={state.turn.currentPlayer} board={state.board}
            selectedId={selectedPurchaseId} onSelectId={id => { setSelectedPurchaseId(id); setSelectedPlaceUnitId(null); setViewedEnemyUnitId(null); }} />
          : preview && selectedUnitData ? <div className="action-preview">
              <div className="preview-heading"><strong>Attack → {String.fromCharCode(65 + preview.position.x)}{preview.position.y + 1}</strong><span>{previewCost} action{previewCost !== 1 ? 's' : ''} · {state.turn.actionsRemaining - previewCost} left</span></div>
              <p>{previewLanding && `Via ${String.fromCharCode(65 + previewLanding.x)}${previewLanding.y + 1} · `}{previewTarget ? `${getUnitDefinition(previewTarget.definitionId).name}: ${attackPower} attack vs ${attackDefense} defense · ${attackPower >= attackDefense ? 'Eliminates target' : `${attackDefense - attackPower} defense remains`}` : ''}</p>
              <div className="preview-buttons"><button onClick={() => setPreview(null)}>Cancel</button><button className="primary" onClick={commitPreview}>Confirm attack</button></div>
            </div>
          : shownUnit || selectedPurchaseDefinitionId ? <UnitInfo unit={shownUnit} previewDefinitionId={selectedPurchaseDefinitionId}
              cellInfo={selectedUnitCell}
              isPlacePhase={state.turn.phase === 'place' && interactive} isActionPhase={state.turn.phase === 'action' && interactive}
              resources={currentPlayerState.resources} onPromote={handlePromote} isEnemyView={isEnemyView}
              onClose={handleCloseUnitInfo} currentPlayer={state.turn.currentPlayer}
              showEnemyRange={showEnemyRange} onToggleEnemyRange={() => setShowEnemyRange(!showEnemyRange)} />
          : <div className="selection-hint"><strong>{isThinking ? 'Your opponent is thinking…' : state.turn.phase === 'place' ? 'Place & upgrade' : 'Your next move'}</strong><p>{phaseHint}</p>
              <small>Hold the enemy home until your next turn, or eliminate every enemy unit.</small></div>}
        </section>
      </div>
      <footer className="play-footer">
        <div className="income-status" role="status" data-testid="projected-income">Projected income this turn: +{projectedIncome(state, state.turn.currentPlayer)} ◆</div>
        {state.lastIncome && <details className="income-recap"><summary>{playerNames[state.lastIncome.player]} collected {state.lastIncome.total} ◆ · turn {state.lastIncome.turnNumber}</summary>
          <ul>{state.lastIncome.takes.map(t => <li key={t.unitId}>{getUnitDefinition(t.definitionId).name} at {String.fromCharCode(65+t.position.x)}{t.position.y+1}: {t.amount}</li>)}</ul>
        </details>}

        <div className="context-status" role="status">{spawnFeedback ? spawnFeedback.reason === 'enemy_blocking' ? 'Enemies are blocking that square.' : 'Choose a square in your controlled area.' : phaseHint}</div>
        <ActionBar actionsRemaining={state.turn.actionsRemaining} actionsPerTurn={actionsPerTurn} phase={state.turn.phase}
          onEndPlacePhase={endPlacePhase} onEndActionPhase={endActionPhase}
          isPlayerTurn={interactive} onUndo={() => { setPreview(null); undo(); }} canUndo={canUndo && interactive} />
        {isCurrentPlayerHuman && state.phase === 'playing' && !showPassOverlay && game.lastTurnReplay?.player !== state.turn.currentPlayer &&
          <button className="instant-replay-button" disabled={!game.lastTurnReplay || showReplay}
            onClick={() => game.lastTurnReplay && startReplay(game.lastTurnReplay)}>↶ Instant replay · Opponent’s last turn</button>}
        <nav className="reference-bar" aria-label="Game references" inert={showReplay}>
          <button onClick={() => setShowUnitShopInspection(true)}>Units</button>
          <button className="counter-key" aria-label="Element advantages and match stats" title="Each pair beats the next: +1 attack" onClick={() => setShowInsights(true)}>🔥⚡ → 🌿⚙ → 💧🌑 ↻ <span>+1</span>{showAIRecap ? ' •' : ''}</button>
          <button onClick={() => setShowInstructions(true)}>How to play</button>
          {config.mode === 'ai-vs-ai' && <button onClick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>}
        </nav>
      </footer>
      {showVisualKey && <PlayDialog title="Read the board" onClose={() => setShowVisualKey(false)}><VisualKey /></PlayDialog>}
      {showMenu && <PlayDialog title="Game menu" onClose={() => setShowMenu(false)}>
        <p>{online ? 'This match is saved on the server. Keep this browser’s seat credential to reconnect. Shared moves are final.' : `Your match is saved at phase changes on this device. New games use Unequal routes with ${INITIAL_MAP_RESOURCES} crystals.`}</p>
        {isCurrentPlayerHuman && <label><input type="checkbox" checked={!!state.reviewUpkeep?.[state.turn.currentPlayer]} onChange={e=>setUpkeepReview(state.turn.currentPlayer,e.target.checked)} /> Review upkeep each turn (allows T2/T3 release)</label>}
        <button onClick={() => { setShowMenu(false); handleBackToMenuClick(); }}>Choose game mode</button>
        {!online && <button onClick={() => { if (window.confirm('Start a new game? This replaces your saved match.')) { handlePlayAgain(); setShowMenu(false); } }}>New game</button>}
        {online && isCurrentPlayerHuman && <button onClick={() => { if (window.confirm('Resign this game? Your opponent will win.')) { game.resign(); setShowMenu(false); } }}>Resign</button>}
        <a href="https://ashkie.com/">Visit Ashkie.com ↗</a>
      </PlayDialog>}
      {showUnitShopInspection && <PlayDialog title="Unit guide" onClose={() => setShowUnitShopInspection(false)}>
        <UnitShop resources={currentPlayerState.resources} player={state.turn.currentPlayer} board={state.board} selectedId={shopSelectedId} onSelectId={setShopSelectedId} inspectOnly />
      </PlayDialog>}
      {showInsights && <PlayDialog title="Elements & match stats" onClose={() => { setShowInsights(false); handleDismissRecap(); }}>
        <ElementLegend />
        <p>Advantage adds 1 attack; disadvantage subtracts 1. Attack previews include this bonus.</p>
        {state.lastUpkeep && <p>Last upkeep: {playerNames[state.lastUpkeep.player]} paid {state.lastUpkeep.paid}. Released: {state.lastUpkeep.released.map(u=>getUnitDefinition(u.definitionId).name).join(', ') || 'none'}.</p>}
        <p>Both banks, reserves, purchases and promotions are public. Income arrives at turn end; upkeep is paid at the start of the next turn.</p>
        {showAIRecap && <AIRecap actions={opponentAI.lastTurnActions} onDismiss={handleDismissRecap} />}
        {config.controls.white === 'ai' && <AIConsole title={config.mode === 'vs-ai' ? 'AI Console' : 'AI 1 Console'} debug={whiteAI.lastDebug} isThinking={whiteAI.isThinking} />}
        {config.controls.black === 'ai' && <AIConsole title="AI Console" debug={blackAI.lastDebug} isThinking={blackAI.isThinking} />}
      </PlayDialog>}
    </main>
  );
}
