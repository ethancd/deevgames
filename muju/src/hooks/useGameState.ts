import { useReducer, useCallback, useMemo, useState } from 'react';
import type { GameState, GameAction, Position } from '../game/types';
import type { AIAction } from '../ai/types';
import { createInitialGameState, getUnitById } from '../game/board';
import { getValidMoves, getMoveCost } from '../game/movement';
import { getUnitDefinition } from '../game/units';
import { getValidAttacks, resolveCombat } from '../game/combat';
import { executeMine, canMine } from '../game/mining';
import { useAction, endTurn as endTurnLogic, startActionPhase, canActInPlacePhase, canActInQueuePhase } from '../game/turn';
import { checkVictory } from '../game/victory';
import { applyAction as applyAIAction } from '../ai/simulate';
import { getBuildCost, getBuildTime, canBuildUnit, meetsTechRequirement, createUnitFromDefinition } from '../game/building';
import { isValidSpawnPosition } from '../game/spawning';
import { promoteUnit, canPromote, getPromotionCost } from '../game/promotion';
import { loadGameState, saveGameState, clearGameState } from '../utils/persistence';

// Actions that can be undone during player's turn
const UNDOABLE_ACTIONS = new Set([
  'MOVE',
  'ATTACK',
  'MINE',
  'PLACE_UNIT',
  'PROMOTE_UNIT',
  'QUEUE_UNIT',
]);

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_UNIT': {
      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer) {
        return state;
      }
      if (state.turn.phase !== 'action') {
        return state;
      }

      const validMoves = unit.canActThisTurn
        ? getValidMoves(unit, state.board)
        : [];
      const validAttacks = unit.canActThisTurn
        ? getValidAttacks(unit, state.board)
        : [];

      return {
        ...state,
        selectedUnit: action.unitId,
        validMoves,
        validAttacks,
      };
    }

    case 'DESELECT': {
      return {
        ...state,
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
      };
    }

    case 'MOVE': {
      if (state.turn.phase !== 'action' || state.turn.actionsRemaining <= 0) {
        return state;
      }

      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer || !unit.canActThisTurn) {
        return state;
      }

      // Calculate the cost of this move (number of actions required)
      const unitDef = getUnitDefinition(unit.definitionId);
      const moveCost = getMoveCost(unit.position, action.to, unitDef.speed, state.board);

      // Check if valid move (reachable and have enough actions)
      if (moveCost === null || moveCost > state.turn.actionsRemaining) {
        return state;
      }

      // Apply move
      const newBoard = {
        ...state.board,
        units: state.board.units.map((u) =>
          u.id === action.unitId
            ? { ...u, position: action.to, hasMoved: true }
            : u
        ),
      };

      // Use multiple actions if needed
      let stateAfterActions = state;
      for (let i = 0; i < moveCost; i++) {
        stateAfterActions = useAction(stateAfterActions);
      }

      // Check victory after move
      const victoryResult = checkVictory(newBoard);

      return {
        ...stateAfterActions,
        board: newBoard,
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
        winner: victoryResult.status === 'victory' ? victoryResult.winner : null,
        phase: victoryResult.status === 'victory' ? 'victory' : state.phase,
      };
    }

    case 'ATTACK': {
      if (state.turn.phase !== 'action' || state.turn.actionsRemaining <= 0) {
        return state;
      }

      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer || !unit.canActThisTurn) {
        return state;
      }

      // Validate attack
      const validAttacks = getValidAttacks(unit, state.board);
      const isValidAttack = validAttacks.some(
        (pos: Position) => pos.x === action.targetPosition.x && pos.y === action.targetPosition.y
      );
      if (!isValidAttack) {
        return state;
      }

      // Resolve combat (this already marks the attacker as having attacked)
      const { board: newBoard } = resolveCombat(
        state.board,
        action.unitId,
        action.targetPosition
      );

      // Use action
      const stateAfterAction = useAction(state);

      // Check victory after attack
      const victoryResult = checkVictory(newBoard);

      return {
        ...stateAfterAction,
        board: newBoard,
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
        winner: victoryResult.status === 'victory' ? victoryResult.winner : null,
        phase: victoryResult.status === 'victory' ? 'victory' : state.phase,
      };
    }

    case 'MINE': {
      if (state.turn.phase !== 'action' || state.turn.actionsRemaining <= 0) {
        return state;
      }

      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer || !unit.canActThisTurn) {
        return state;
      }

      // Check if can mine
      if (!canMine(unit, state.board)) {
        return state;
      }

      // Perform mining
      const currentPlayer = state.turn.currentPlayer;
      const currentResources = state.players[currentPlayer].resources;
      const { board: newBoard, newResources, amountMined } = executeMine(
        state.board,
        action.unitId,
        currentResources
      );

      if (amountMined === 0) {
        return state;
      }

      // Update player resources and track gained resources
      const newPlayers = {
        ...state.players,
        [currentPlayer]: {
          ...state.players[currentPlayer],
          resources: newResources,
          resourcesGained: state.players[currentPlayer].resourcesGained + amountMined,
        },
      };

      // Use action
      const stateAfterAction = useAction(state);

      return {
        ...stateAfterAction,
        board: newBoard,
        players: newPlayers,
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
      };
    }

    case 'END_PLACE_PHASE': {
      if (state.turn.phase !== 'place') {
        return state;
      }

      return startActionPhase(state);
    }

    case 'PLACE_UNIT': {
      if (state.turn.phase !== 'place') {
        return state;
      }

      const currentPlayer = state.turn.currentPlayer;
      const playerState = state.players[currentPlayer];

      // Find the queued unit
      const queuedUnit = playerState.buildQueue.find(
        (q) => q.id === action.queuedUnitId && q.turnsRemaining === 0
      );
      if (!queuedUnit) {
        return state;
      }

      // Check tech requirement is still met
      if (!meetsTechRequirement(queuedUnit.definitionId, currentPlayer, state.board)) {
        return state;
      }

      // Validate spawn position
      if (!isValidSpawnPosition(action.position, currentPlayer, state.board)) {
        return state;
      }

      // Create the unit
      const newUnitId = `unit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newUnit = createUnitFromDefinition(
        queuedUnit.definitionId,
        currentPlayer,
        action.position,
        newUnitId
      );

      // Remove from queue and add to board
      const newQueue = playerState.buildQueue.filter((q) => q.id !== action.queuedUnitId);
      const newBoard = {
        ...state.board,
        units: [...state.board.units, newUnit],
      };

      let newState: GameState = {
        ...state,
        board: newBoard,
        players: {
          ...state.players,
          [currentPlayer]: {
            ...playerState,
            buildQueue: newQueue,
          },
        },
      };

      // Auto-transition to action phase if nothing left to do in place phase
      if (!canActInPlacePhase(newState, currentPlayer)) {
        newState = startActionPhase(newState);
      }

      return newState;
    }

    case 'PROMOTE_UNIT': {
      if (state.turn.phase !== 'place') {
        return state;
      }

      const currentPlayer = state.turn.currentPlayer;
      const playerState = state.players[currentPlayer];
      const unit = getUnitById(state.board, action.unitId);

      if (!unit || unit.owner !== currentPlayer) {
        return state;
      }

      const buildState = { queue: [], crystals: playerState.resources };
      if (!canPromote(unit, buildState)) {
        return state;
      }

      const result = promoteUnit(state.board, action.unitId, buildState);
      if (!result) {
        return state;
      }

      const cost = getPromotionCost(unit) ?? 0;

      let newState: GameState = {
        ...state,
        board: result.board,
        players: {
          ...state.players,
          [currentPlayer]: {
            ...playerState,
            resources: playerState.resources - cost,
            resourcesSpent: playerState.resourcesSpent + cost,
          },
        },
      };

      // Auto-transition to action phase if nothing left to do in place phase
      if (!canActInPlacePhase(newState, currentPlayer)) {
        newState = startActionPhase(newState);
      }

      return newState;
    }

    case 'END_ACTION_PHASE': {
      if (state.turn.phase !== 'action') {
        return state;
      }

      return {
        ...state,
        turn: {
          ...state.turn,
          phase: 'queue',
        },
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
      };
    }

    case 'QUEUE_UNIT': {
      if (state.turn.phase !== 'queue') {
        return state;
      }

      const currentPlayer = state.turn.currentPlayer;
      const playerState = state.players[currentPlayer];
      const buildState = { queue: [], crystals: playerState.resources };

      // Check if can build (affordable + meets tech requirements)
      if (!canBuildUnit(action.definitionId, currentPlayer, state.board, buildState)) {
        return state;
      }

      const cost = getBuildCost(action.definitionId);
      const buildTime = getBuildTime(action.definitionId);

      // Generate unique ID for queued unit
      const queuedId = `queued-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      let newState: GameState = {
        ...state,
        players: {
          ...state.players,
          [currentPlayer]: {
            ...playerState,
            resources: playerState.resources - cost,
            resourcesSpent: playerState.resourcesSpent + cost,
            buildQueue: [
              ...playerState.buildQueue,
              {
                id: queuedId,
                definitionId: action.definitionId,
                turnsRemaining: buildTime,
                owner: currentPlayer,
              },
            ],
          },
        },
      };

      // Auto-end turn if nothing left to do in queue phase
      if (!canActInQueuePhase(newState, currentPlayer)) {
        newState = endTurnLogic(newState);
      }

      return newState;
    }

    case 'END_TURN': {
      const newState = endTurnLogic(state);
      return {
        ...newState,
        selectedUnit: null,
        validMoves: [],
        validAttacks: [],
      };
    }

    case 'RESIGN': {
      const winner = state.turn.currentPlayer === 'player' ? 'ai' : 'player';
      return {
        ...state,
        phase: 'victory',
        winner,
      };
    }

    case 'APPLY_AI_ACTION': {
      // Apply an AI action to the state
      return applyAIAction(state, action.aiAction);
    }

    case 'RESET_GAME': {
      return createInitialGameState();
    }

    case 'RESTORE_STATE': {
      // Restore a previous state (used for undo)
      return action.state;
    }

    default:
      return state;
  }
}

// Actions that trigger a save (phase transitions and game end)
const SAVE_ACTIONS = new Set([
  'END_PLACE_PHASE',
  'END_ACTION_PHASE',
  'END_TURN',
  'RESIGN',
]);

function gameReducerWithSave(state: GameState, action: GameAction): GameState {
  const newState = gameReducer(state, action);

  // Save after phase transitions (only if state actually changed)
  if (SAVE_ACTIONS.has(action.type) && newState !== state) {
    saveGameState(newState);
  }

  // Save when turn changes to player (catches AI turn ending via APPLY_AI_ACTION)
  if (
    newState.turn.currentPlayer === 'player' &&
    state.turn.currentPlayer === 'ai' &&
    newState !== state
  ) {
    saveGameState(newState);
  }

  // Also save when victory is detected (from MOVE or ATTACK)
  if (newState.phase === 'victory' && state.phase !== 'victory') {
    saveGameState(newState);
  }

  return newState;
}

function getInitialState(): GameState {
  const saved = loadGameState();
  if (saved) {
    return saved;
  }
  return createInitialGameState();
}

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducerWithSave, undefined, getInitialState);
  const [undoHistory, setUndoHistory] = useState<GameState[]>([]);

  // Wrap dispatch to track undo history for undoable actions
  const dispatchWithUndo = useCallback((action: GameAction) => {
    // Save current state before undoable player actions
    if (
      UNDOABLE_ACTIONS.has(action.type) &&
      state.turn.currentPlayer === 'player'
    ) {
      setUndoHistory((prev) => [...prev, state]);
    }
    // Also save state before phase transitions so player can undo back through phases
    if (
      (action.type === 'END_PLACE_PHASE' || action.type === 'END_ACTION_PHASE') &&
      state.turn.currentPlayer === 'player'
    ) {
      setUndoHistory((prev) => [...prev, state]);
    }
    // Clear undo history only on turn end or game reset (not phase transitions)
    if (action.type === 'END_TURN' || action.type === 'RESET_GAME') {
      setUndoHistory([]);
    }
    dispatch(action);
  }, [state]);

  const undo = useCallback(() => {
    if (undoHistory.length === 0) return;
    const previousState = undoHistory[undoHistory.length - 1];
    setUndoHistory((prev) => prev.slice(0, -1));
    dispatch({ type: 'RESTORE_STATE', state: previousState });
  }, [undoHistory]);

  const canUndo = undoHistory.length > 0 && state.turn.currentPlayer === 'player';

  const selectUnit = useCallback((unitId: string) => {
    dispatchWithUndo({ type: 'SELECT_UNIT', unitId });
  }, [dispatchWithUndo]);

  const deselect = useCallback(() => {
    dispatch({ type: 'DESELECT' });
  }, []);

  const moveUnit = useCallback((unitId: string, to: Position) => {
    dispatchWithUndo({ type: 'MOVE', unitId, to });
  }, [dispatchWithUndo]);

  const attackWith = useCallback((unitId: string, targetPosition: Position) => {
    dispatchWithUndo({ type: 'ATTACK', unitId, targetPosition });
  }, [dispatchWithUndo]);

  const mineWith = useCallback((unitId: string) => {
    dispatchWithUndo({ type: 'MINE', unitId });
  }, [dispatchWithUndo]);

  const endPlacePhase = useCallback(() => {
    dispatchWithUndo({ type: 'END_PLACE_PHASE' });
  }, [dispatchWithUndo]);

  const endActionPhase = useCallback(() => {
    dispatchWithUndo({ type: 'END_ACTION_PHASE' });
  }, [dispatchWithUndo]);

  const queueUnit = useCallback((definitionId: string) => {
    dispatchWithUndo({ type: 'QUEUE_UNIT', definitionId });
  }, [dispatchWithUndo]);

  const placeUnit = useCallback((queuedUnitId: string, position: Position) => {
    dispatchWithUndo({ type: 'PLACE_UNIT', queuedUnitId, position });
  }, [dispatchWithUndo]);

  const promoteUnitAction = useCallback((unitId: string) => {
    dispatchWithUndo({ type: 'PROMOTE_UNIT', unitId });
  }, [dispatchWithUndo]);

  const endTurn = useCallback(() => {
    dispatchWithUndo({ type: 'END_TURN' });
  }, [dispatchWithUndo]);

  const resign = useCallback(() => {
    dispatch({ type: 'RESIGN' });
  }, []);

  const applyAIActionToState = useCallback((aiAction: AIAction) => {
    dispatch({ type: 'APPLY_AI_ACTION', aiAction });
  }, []);

  const resetGame = useCallback(() => {
    clearGameState();
    dispatchWithUndo({ type: 'RESET_GAME' });
  }, [dispatchWithUndo]);

  const selectedUnitData = useMemo(() => {
    if (!state.selectedUnit) return null;
    return getUnitById(state.board, state.selectedUnit);
  }, [state.selectedUnit, state.board]);

  const isPlayerTurn = state.turn.currentPlayer === 'player';
  const canEndTurn = state.turn.phase === 'queue';

  return {
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
    promoteUnit: promoteUnitAction,
    endTurn,
    resign,
    applyAIAction: applyAIActionToState,
    resetGame,
    undo,
    canUndo,
    selectedUnitData,
    isPlayerTurn,
    canEndTurn,
  };
}
