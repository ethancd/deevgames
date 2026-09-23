import { useCallback, useEffect, useState } from 'react';
import { applyAction } from '../ai/simulate';
import { emptyRecording, recordAction } from '../game/replay';
import type { GameState, PlayerId, Position } from '../game/types';
import { replayDelay, useReplayPreference } from '../components/TurnReplay';
import type { RoomSnapshot } from './types';

export interface IncomingFrame { state: GameState; label: string; unitId?: string; position?: Position }

/** Reconstruct newly received commands with the server's immutable engine.
 * Playback never dispatches actions or changes the authoritative room state. */
export function incomingFrames(before: RoomSnapshot, next: RoomSnapshot, viewer?: PlayerId): IncomingFrame[] {
  const changes = next.history.filter(entry => entry.revision > before.revision);
  if (!changes.length || changes.every(entry => entry.player === viewer)) return [];
  // Missing retained history or an undo requires the authoritative snapshot.
  if (changes[0].revision > before.revision + 1 || changes.some(entry => entry.actions.some(a => a.type === 'UNDO'))) return [];
  let state = before.state;
  const frames: IncomingFrame[] = [];
  for (const entry of changes) for (const action of entry.actions) {
    if (action.type === 'UNDO') return [];
    if (action.type === 'SET_UPKEEP_REVIEW') {
      state = { ...state, reviewUpkeep: { ...state.reviewUpkeep, [entry.player]: action.enabled } };
      continue;
    }
    const after = applyAction(state, action);
    if (after === state) return []; // A rules mismatch must not invent a sequence.
    if (entry.player !== viewer) {
      const recorded = recordAction(emptyRecording(), state, action, after);
      const steps = [...(recorded.last?.frames ?? []), ...(recorded.current?.frames ?? [])];
      if (steps.length) {
        for (const [index, frame] of steps.entries()) {
          const remaining = action.type === 'MOVE' ? state.turn.actionsRemaining - index - 1 : after.turn.actionsRemaining;
          frames.push({ state: { ...after, board: frame.board, pendingSummons: frame.pendingSummons,
            turn: { ...after.turn, actionsRemaining: remaining } }, label: frame.label, unitId: frame.unitId, position: frame.position });
        }
      } else frames.push({ state: after, label: action.type === 'END_PLACE_PHASE' || action.type === 'END_ACTION_PHASE'
        ? after.turn.currentPlayer !== state.turn.currentPlayer ? 'Turn complete · arrivals resolved' : 'Actions ready'
        : action.type === 'RESIGN' ? 'Opponent resigned' : 'Turn updated' });
    }
    state = after;
  }
  if (JSON.stringify(state.board) !== JSON.stringify(next.state.board)
    || JSON.stringify(state.pendingSummons) !== JSON.stringify(next.state.pendingSummons)) return [];
  // Finish on the exact server state, including any automatic turn-start effects.
  if (frames.length) frames[frames.length - 1] = { ...frames[frames.length - 1], state: next.state };
  return frames;
}

export type TurnCue = 'yourTurn' | 'opponentAction';
/** Decide whether an accepted change should sound a background-safe cue for this seat:
 * a handoff into the viewer's own turn, or the opponent committing a partial action while
 * their turn continues. Never fires for observers (no seat) or for the viewer's own actions,
 * and stays quiet once the game has ended. */
export function turnCue(before: RoomSnapshot, next: RoomSnapshot, viewer?: PlayerId | null): TurnCue | null {
  if (!viewer || next.state.phase !== 'playing') return null;
  const changes = next.history.filter(entry => entry.revision > before.revision);
  if (!changes.length || changes.every(entry => entry.player === viewer)) return null;
  if (before.state.turn.currentPlayer !== viewer && next.state.turn.currentPlayer === viewer) return 'yourTurn';
  if (next.state.turn.currentPlayer !== viewer) return 'opponentAction';
  return null;
}

interface Presentation { frames: IncomingFrame[]; step: number }
export function useIncomingPlayback() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [mode] = useReplayPreference();
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const present = useCallback((before: RoomSnapshot, next: RoomSnapshot, viewer?: PlayerId) => {
    if (next.revision <= before.revision) return;
    const frames = incomingFrames(before, next, viewer);
    setPresentation(current => {
      if (current) return { ...current, frames: [...current.frames, ...(frames.length ? frames : [{ state: next.state, label: 'Live position' }])] };
      return frames.length ? { frames: [{ state: before.state, label: 'Incoming move…' }, ...frames], step: 0 } : null;
    });
  }, []);
  const active = !!presentation;
  const step = presentation?.step;
  useEffect(() => {
    if (!active || !visible) return;
    const timer = setTimeout(() => setPresentation(current => {
      if (!current) return null;
      return current.step + 1 < current.frames.length ? { ...current, step: current.step + 1 } : null;
    }), replayDelay(mode));
    return () => clearTimeout(timer);
  }, [step, active, visible, mode]);
  return { present, frame: presentation?.frames[presentation.step], playing: active };
}
