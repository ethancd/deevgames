import { emptyRecording, recordAction, rewindRecording, type ReplayRecording } from '../game/replay';
import { useReducer, useCallback, useMemo, useState, useEffect } from 'react';
import type { GameState, GameAction, GameConfig, Position } from '../game/types';
import { getActionsPerTurn } from '../game/rules';
import { automaticUpkeepUndo } from '../game/turn';
import type { AIAction } from '../ai/types';
import { createInitialGameState, getUnitById } from '../game/board';
import { getValidMoves } from '../game/movement';
import { getValidAttacks } from '../game/combat';
import { applyAction as applyAIAction } from '../ai/simulate';
import { loadGameState, saveGameState, clearGameState } from '../utils/persistence';

type LocalAction = GameAction | { type: 'MOVE_AND_ATTACK'; unitId: string; to: Position; targetPosition: Position };

// Actions that can be undone during player's turn
const UNDOABLE_ACTIONS = new Set([
  'PAY_UPKEEP',
  'MOVE',
  'MOVE_AND_ATTACK',
  'ATTACK',
  'BUY_UNIT',
  'PROMOTE_UNIT',
  'END_PLACE_PHASE',
]);

export function gameReducer(state: GameState, action: LocalAction): GameState {
  switch (action.type) {
    case 'SELECT_UNIT': {
      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== state.turn.currentPlayer) {
        return state;
      }
      if (state.turn.phase !== 'action') {
        return state;
      }

      const validMoves = unit.canActThisTurn && state.turn.actionsRemaining > 0
        ? getValidMoves(unit, state.board)
        : [];
      const validAttacks = unit.canActThisTurn && state.turn.actionsRemaining > 0
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

    case 'SET_UPKEEP_REVIEW': return {...state,reviewUpkeep:{...state.reviewUpkeep,[action.player]:action.enabled}};
    case 'MOVE': {
      const next = applyAIAction(state, action);
      return next === state ? state : gameReducer(next, { type: 'SELECT_UNIT', unitId: action.unitId });
    }
    case 'MOVE_AND_ATTACK': {
      const moved = applyAIAction(state, { type: 'MOVE', unitId: action.unitId, to: action.to });
      if (moved === state) return state;
      const attacked = applyAIAction(moved, { type: 'ATTACK', unitId: action.unitId, targetPosition: action.targetPosition });
      return attacked === moved ? state : attacked;
    }
    case 'PAY_UPKEEP':
    case 'ATTACK':
    case 'END_PLACE_PHASE':
    case 'BUY_UNIT':
    case 'PROMOTE_UNIT':
    case 'END_ACTION_PHASE':
    case 'RESIGN':
      return applyAIAction(state, action);

    case 'APPLY_AI_ACTION': {
      // Apply an AI action to the state
      return applyAIAction(state, action.aiAction);
    }

    case 'RESET_GAME': {
      return createInitialGameState(undefined, getActionsPerTurn(state));
    }

    case 'RESTORE_STATE': {
      // Restore a previous state (used for undo)
      return action.state;
    }

    default:
      return state;
  }
}

// Save each completed action, including AI actions and undo, so reloading resumes
// the board and its Cleave allowance together. Selection/preview do not save.
const SAVE_ACTIONS = new Set([
  'RESET_GAME',
  ...UNDOABLE_ACTIONS,
  'SET_UPKEEP_REVIEW',
  'APPLY_AI_ACTION',
  'RESTORE_STATE',
  'END_PLACE_PHASE',
  'END_ACTION_PHASE',
  'RESIGN',
]);

function gameReducerWithSave(state: GameState, action: LocalAction): GameState {
  const newState = gameReducer(state, action);

  // Save committed gameplay transitions (only if state actually changed)
  if (SAVE_ACTIONS.has(action.type) && newState !== state) {
    saveGameState(newState);
  }

  // Save when turn changes to player (catches AI turn ending via APPLY_AI_ACTION)
  if (
    newState.turn.currentPlayer === 'white' &&
    state.turn.currentPlayer === 'black' &&
    newState !== state
  ) {
    saveGameState(newState);
  }

  // Also save every newly resolved victory, including a home occupation at turn start.
  if (newState.phase === 'victory' && state.phase !== 'victory') {
    saveGameState(newState);
  }

  return newState;
}

type InitialGameOptions = Pick<GameConfig, 'actionsPerTurn' | 'newGame'>;

function getInitialState(options: InitialGameOptions): GameState {
  const saved = options.newGame ? null : loadGameState();
  if (saved) {
    return saved;
  }
  const state = createInitialGameState(undefined, options.actionsPerTurn);
  saveGameState(state);
  return state;
}

interface ReplaySession { state: GameState; recording: ReplayRecording; undoLengths: number[]; turnStartUndo: GameState | null }
function sessionReducer(session: ReplaySession, action: LocalAction): ReplaySession {
  const state = gameReducerWithSave(session.state, action);
  if (state === session.state && action.type !== 'RESTORE_STATE') {
    return UNDOABLE_ACTIONS.has(action.type)
      ? { ...session, undoLengths: [...session.undoLengths, session.recording.current?.frames.length ?? 0] }
      : session;
  }
  let recording = session.recording, undoLengths = session.undoLengths, turnStartUndo = session.turnStartUndo;
  if (action.type === 'RESET_GAME') return { state, recording: emptyRecording(), undoLengths: [], turnStartUndo: null };
  if (action.type === 'RESTORE_STATE') {
    recording = rewindRecording(recording, undoLengths.at(-1) ?? 0);
    undoLengths = undoLengths.slice(0, -1);
  } else {
    if (UNDOABLE_ACTIONS.has(action.type)) undoLengths = [...undoLengths, recording.current?.frames.length ?? 0];
    const actual = action.type === 'APPLY_AI_ACTION' ? action.aiAction : action;
    if (actual.type === 'MOVE_AND_ATTACK') {
      const move = { type: 'MOVE' as const, unitId: actual.unitId, to: actual.to };
      const moved = applyAIAction(session.state, move);
      recording = recordAction(recording, session.state, move, moved);
      recording = recordAction(recording, moved, { type: 'ATTACK', unitId: actual.unitId, targetPosition: actual.targetPosition }, state);
    } else if (actual.type !== 'SELECT_UNIT' && actual.type !== 'DESELECT' && actual.type !== 'SET_UPKEEP_REVIEW') {
      recording = recordAction(recording, session.state, actual, state);
    }
  }
  if (state.turn.currentPlayer !== session.state.turn.currentPlayer || state.turn.turnNumber !== session.state.turn.turnNumber) {
    turnStartUndo = automaticUpkeepUndo(session.state, state);
    undoLengths = turnStartUndo ? [0] : [];
  }
  return { state, recording, undoLengths, turnStartUndo };
}

export function useGameState(options: InitialGameOptions = {}) {
  const [session, dispatch] = useReducer(sessionReducer, options, options => ({ state: getInitialState(options), recording: emptyRecording(), undoLengths: [], turnStartUndo: null }));
  const state = session.state;
  const [undoHistory, setUndoHistory] = useState<GameState[]>([]);

  // The new turn can undo its automatic upkeep, but never the opponent's turn.
  useEffect(() => {
    setUndoHistory(session.turnStartUndo ? [session.turnStartUndo] : []);
  }, [state.turn.currentPlayer, state.turn.turnNumber, session.turnStartUndo]);

  // Wrap dispatch to track undo history for undoable actions
  const dispatchWithUndo = useCallback((action: LocalAction) => {
    // Save current state before undoable player actions (for any player's turn)
    if (UNDOABLE_ACTIONS.has(action.type)) {
      setUndoHistory((prev) => [...prev, state]);
    }
    // Clear undo history only on turn end or game reset (not phase transitions)
    if (action.type === 'END_ACTION_PHASE' || action.type === 'RESET_GAME') {
      setUndoHistory([]);
    }
    dispatch(action);
  }, [state]);

  const previousState = undoHistory[undoHistory.length - 1];
  const canUndo = state.phase === 'playing' && !!previousState &&
    previousState.turn.currentPlayer === state.turn.currentPlayer &&
    previousState.turn.turnNumber === state.turn.turnNumber;

  const undo = useCallback(() => {
    if (!canUndo) return;
    setUndoHistory((prev) => prev.slice(0, -1));
    dispatch({ type: 'RESTORE_STATE', state: previousState });
  }, [canUndo, previousState]);

  const selectUnit = useCallback((unitId: string) => {
    dispatchWithUndo({ type: 'SELECT_UNIT', unitId });
  }, [dispatchWithUndo]);

  const deselect = useCallback(() => {
    dispatch({ type: 'DESELECT' });
  }, []);

  const moveUnit = useCallback((unitId: string, to: Position) => {
    dispatchWithUndo({ type: 'MOVE', unitId, to });
  }, [dispatchWithUndo]);

  const moveAndAttack = useCallback((unitId: string, to: Position, targetPosition: Position) => {
    dispatchWithUndo({ type: 'MOVE_AND_ATTACK', unitId, to, targetPosition });
  }, [dispatchWithUndo]);

  const attackWith = useCallback((unitId: string, targetPosition: Position) => {
    dispatchWithUndo({ type: 'ATTACK', unitId, targetPosition });
  }, [dispatchWithUndo]);

  const endPlacePhase = useCallback(() => {
    dispatchWithUndo({ type: 'END_PLACE_PHASE' });
  }, [dispatchWithUndo]);

  const endActionPhase = useCallback(() => {
    dispatchWithUndo({ type: 'END_ACTION_PHASE' });
  }, [dispatchWithUndo]);

  const buyUnit = useCallback((definitionId: string, position: Position) => {
    dispatchWithUndo({ type: 'BUY_UNIT', definitionId, position });
  }, [dispatchWithUndo]);

  const promoteUnitAction = useCallback((unitId: string) => {
    dispatchWithUndo({ type: 'PROMOTE_UNIT', unitId });
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

  const isPlayerTurn = state.turn.currentPlayer === 'white';
  const canEndTurn = state.turn.phase === 'action';

  return {
    lastTurnReplay: session.recording.last,
    payUpkeep: (keepUnitIds: string[]) => dispatchWithUndo({type:'PAY_UPKEEP',keepUnitIds}),
    setUpkeepReview: (player: import('../game/types').PlayerId, enabled: boolean) => dispatchWithUndo({type:'SET_UPKEEP_REVIEW',player,enabled}),
    state,
    selectUnit,
    deselect,
    moveUnit,
    moveAndAttack,
    attackWith,
    endPlacePhase,
    endActionPhase,
    buyUnit,
    promoteUnit: promoteUnitAction,
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
