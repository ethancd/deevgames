import match from './codex-claude-2026-09-12.json';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { recordAction, emptyRecording } from '../../src/game/replay';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import type { GameState, PlayerId } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';
import type { AIAction } from '../../src/ai/types';

export function piece(id: string, definitionId: string, owner: PlayerId, x: number, y: number) {
  return { ...createUnitFromDefinition(definitionId, owner, { x, y }, id), placedThisTurn: false };
}
export function position(units: ReturnType<typeof piece>[], cash = 0, player: PlayerId = 'white'): GameState {
  const state = createInitialGameState();
  return { ...state, board: { ...state.board, units }, players: {
    white: { ...state.players.white, resources: cash }, black: { ...state.players.black, resources: cash },
  }, turn: { ...state.turn, currentPlayer: player, phase: 'action' }, inactivityRule: 'off' };
}
export function snapshot(state: GameState, revision = 1): RoomSnapshot {
  return { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', revision, ready: true, state, seats: { white: 'White', black: 'Black' },
    history: [], updatedAt: '2026-09-12T00:00:00.000Z' };
}
export function matchPositions() {
  let state = structuredClone(match.initialState) as GameState, recording = emptyRecording();
  const positions = new Map<number, RoomSnapshot>([[match.recordingStart.revision, { ...snapshot(state, match.recordingStart.revision), id: match.roomId }]]);
  for (const command of match.commands.filter(c => c.revision > match.recordingStart.revision)) {
    for (const action of command.actions as AIAction[]) {
      if (!isLegalAction(state, action, command.player as PlayerId)) throw new Error(`Archived revision ${command.revision}: illegal ${action.type}`);
      const next = applyAction(state, action);
      recording = recordAction(recording, state, action, next);
      state = next;
    }
    positions.set(command.revision, { ...snapshot(state, command.revision), id: match.roomId, lastTurnReplay: recording.last });
  }
  return { positions, final: state, expectedFinal: match.finalState, recordingStart: match.recordingStart };
}
