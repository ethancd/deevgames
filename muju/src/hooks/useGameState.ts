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
import { loadGameState, loadGameHistory, saveGameState, clearGameState } from '../utils/persistence';
import { analysisFrames, localFrame, startHistory, type LocalGameHistory } from '../game/analysis';

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
  'END_ACTION_PHASE',
]);

export function gameReducer(state: GameState, action: LocalAction): GameState {
  switch (action.type) {
    case 'SELECT_UNIT': {
      if (state.phase !== 'playing') return state;
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
      if (moved.phase === 'victory') return moved;
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
      return createInitialGameState(undefined, getActionsPerTurn(state), state.blackCrystalHandicap, state.ruleset);
    }

    case 'RESTORE_STATE': {
      // Restore a previous state (used for undo)
      return action.state;
    }

    default:
      return state;
  }
}

type InitialGameOptions = Pick<GameConfig, 'actionsPerTurn' | 'blackCrystalHandicap' | 'newGame' | 'ruleset'>;

function getInitialSession(options: InitialGameOptions): ReplaySession {
  const saved = options.newGame ? null : loadGameHistory();
  // Phasing is the only ruleset a new local game can be started under; a caller
  // that says nothing gets it rather than `board.ts`'s historical default.
  const state = (saved && loadGameState()) ?? createInitialGameState(undefined, options.actionsPerTurn, options.blackCrystalHandicap, options.ruleset ?? 'phasing');
  return { state, history: saved ?? startHistory(state, true), historyUndoLengths: [],
    recording: emptyRecording(), undoLengths: [], turnStartUndo: null };
}

interface ReplaySession {
  state: GameState; recording: ReplayRecording; undoLengths: number[]; turnStartUndo: GameState | null;
  history: LocalGameHistory; historyUndoLengths: number[];
}
function sessionReducer(session: ReplaySession, action: LocalAction): ReplaySession {
  const state = gameReducer(session.state, action);
  if (state === session.state && action.type !== 'RESTORE_STATE') {
    return UNDOABLE_ACTIONS.has(action.type)
      ? { ...session, undoLengths: [...session.undoLengths, session.recording.current?.frames.length ?? 0],
        historyUndoLengths: [...session.historyUndoLengths, session.history.frames.length] }
      : session;
  }
  let recording = session.recording, undoLengths = session.undoLengths, turnStartUndo = session.turnStartUndo;
  let history = session.history, historyUndoLengths = session.historyUndoLengths;
  if (action.type === 'RESET_GAME') return { state, recording: emptyRecording(), undoLengths: [], turnStartUndo: null,
    history: startHistory(state, true), historyUndoLengths: [] };
  if (action.type === 'RESTORE_STATE') {
    recording = rewindRecording(recording, undoLengths.at(-1) ?? 0);
    undoLengths = undoLengths.slice(0, -1);
    const frames = history.frames.slice(0, historyUndoLengths.at(-1) ?? 1);
    frames[frames.length - 1] = localFrame(state, frames.at(-1)!.label);
    history = { ...history, frames };
    historyUndoLengths = historyUndoLengths.slice(0, -1);
  } else {
    if (UNDOABLE_ACTIONS.has(action.type)) undoLengths = [...undoLengths, recording.current?.frames.length ?? 0];
    if (UNDOABLE_ACTIONS.has(action.type)) historyUndoLengths = [...historyUndoLengths, history.frames.length];
    const actual = action.type === 'APPLY_AI_ACTION' ? action.aiAction : action;
    if (actual.type === 'MOVE_AND_ATTACK') {
      const move = { type: 'MOVE' as const, unitId: actual.unitId, to: actual.to };
      const moved = applyAIAction(session.state, move);
      recording = recordAction(recording, session.state, move, moved);
      recording = recordAction(recording, moved, { type: 'ATTACK', unitId: actual.unitId, targetPosition: actual.targetPosition }, state);
      history = { ...history, frames: [...history.frames, ...analysisFrames(session.state, move, moved),
        ...analysisFrames(moved, { type: 'ATTACK', unitId: actual.unitId, targetPosition: actual.targetPosition }, state)] };
    } else if (actual.type !== 'SELECT_UNIT' && actual.type !== 'DESELECT' && actual.type !== 'SET_UPKEEP_REVIEW') {
      recording = recordAction(recording, session.state, actual, state);
      history = { ...history, frames: [...history.frames, ...analysisFrames(session.state, actual, state)] };
    } else if (actual.type === 'SET_UPKEEP_REVIEW') {
      history = { ...history, frames: [...history.frames.slice(0, -1), localFrame(state, history.frames.at(-1)!.label)] };
    }
  }
  if (state.turn.currentPlayer !== session.state.turn.currentPlayer || state.turn.turnNumber !== session.state.turn.turnNumber) {
    turnStartUndo = automaticUpkeepUndo(session.state, state);
    undoLengths = turnStartUndo ? [0] : [];
    // Mining is recorded before the incoming turn's automatic upkeep payment.
    let upkeepIndex = history.frames.length - 1;
    while (upkeepIndex > 0 && !history.frames[upkeepIndex].state.upkeepPending) upkeepIndex--;
    historyUndoLengths = turnStartUndo ? [upkeepIndex + 1] : [];
  }
  return { state, recording, undoLengths, turnStartUndo, history, historyUndoLengths };
}

export function useGameState(options: InitialGameOptions = {}) {
  const [session, dispatch] = useReducer(sessionReducer, options, getInitialSession);
  const state = session.state;
  const [undoHistory, setUndoHistory] = useState<GameState[]>([]);

  // Save the score and position together. Selection changes do not alter history.
  useEffect(() => { saveGameState(session.state, session.history); }, [session.history]);

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
    if ((action.type === 'END_ACTION_PHASE' && state.ruleset !== 'phasing') || action.type === 'RESET_GAME') {
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
