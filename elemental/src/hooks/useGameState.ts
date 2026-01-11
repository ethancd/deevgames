import { useReducer, useCallback, useMemo } from 'react';
import type { GameState, GameAction, Position } from '../game/types';
import type { AIAction } from '../ai/types';
import { createInitialGameState, getUnitById } from '../game/board';
import { getValidMoves } from '../game/movement';
import { getValidAttacks, resolveCombat } from '../game/combat';
import { executeMine, canMine } from '../game/mining';
import { useAction, endTurn as endTurnLogic, startActionPhase } from '../game/turn';
import { checkVictory } from '../game/victory';
import { applyAction as applyAIAction } from '../ai/simulate';
import { getBuildCost, getBuildTime, canBuildUnit, meetsTechRequirement, createUnitFromDefinition } from '../game/building';
import { isValidSpawnPosition } from '../game/spawning';
import { promoteUnit, canPromote, getPromotionCost } from '../game/promotion';

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

      const validMoves = unit.canActThisTurn && !unit.hasMoved
        ? getValidMoves(unit, state.board)
        : [];
      const validAttacks = unit.canActThisTurn && !unit.hasAttacked
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
      if (!unit || unit.owner !== state.turn.currentPlayer || unit.hasMoved) {
        return state;
      }

      // Validate move
      const validMoves = getValidMoves(unit, state.board);
      const isValidMove = validMoves.some(
        (pos: Position) => pos.x === action.to.x && pos.y === action.to.y
      );
      if (!isValidMove) {
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

      // Use action (decrements actions remaining)
      const stateAfterAction = useAction(state);

      // Check victory after move
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

    case 'ATTACK': {
      if (state.turn.phase !== 'action' || state.turn.actionsRemaining <= 0) {
        return state;
      }

      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer || unit.hasAttacked) {
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
      if (!unit || unit.owner !== state.turn.currentPlayer || unit.hasMined) {
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

      return {
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

      return {
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

      return {
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

    default:
      return state;
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialGameState);

  const selectUnit = useCallback((unitId: string) => {
    dispatch({ type: 'SELECT_UNIT', unitId });
  }, []);

  const deselect = useCallback(() => {
    dispatch({ type: 'DESELECT' });
  }, []);

  const moveUnit = useCallback((unitId: string, to: Position) => {
    dispatch({ type: 'MOVE', unitId, to });
  }, []);

  const attackWith = useCallback((unitId: string, targetPosition: Position) => {
    dispatch({ type: 'ATTACK', unitId, targetPosition });
  }, []);

  const mineWith = useCallback((unitId: string) => {
    dispatch({ type: 'MINE', unitId });
  }, []);

  const endPlacePhase = useCallback(() => {
    dispatch({ type: 'END_PLACE_PHASE' });
  }, []);

  const endActionPhase = useCallback(() => {
    dispatch({ type: 'END_ACTION_PHASE' });
  }, []);

  const queueUnit = useCallback((definitionId: string) => {
    dispatch({ type: 'QUEUE_UNIT', definitionId });
  }, []);

  const placeUnit = useCallback((queuedUnitId: string, position: Position) => {
    dispatch({ type: 'PLACE_UNIT', queuedUnitId, position });
  }, []);

  const promoteUnitAction = useCallback((unitId: string) => {
    dispatch({ type: 'PROMOTE_UNIT', unitId });
  }, []);

  const endTurn = useCallback(() => {
    dispatch({ type: 'END_TURN' });
  }, []);

  const resign = useCallback(() => {
    dispatch({ type: 'RESIGN' });
  }, []);

  const applyAIActionToState = useCallback((aiAction: AIAction) => {
    dispatch({ type: 'APPLY_AI_ACTION', aiAction });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET_GAME' });
  }, []);

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
    selectedUnitData,
    isPlayerTurn,
    canEndTurn,
  };
}
