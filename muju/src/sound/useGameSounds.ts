import { useEffect, useRef } from 'react';
import type { BoardState, GameState, PendingSummon, PlayerId } from '../game/types';
import type { TurnReplay } from '../game/replay';
import { getUnitDefinition } from '../game/units';
import type { SoundEffect } from './effects';
import { useSoundEffects } from './SoundProvider';

interface Position { board: BoardState; pendingSummons?: PendingSummon[] }
/** Compare the rendered boards, never the future authoritative online position. */
export function pieceSounds(before: Position, after: Position): SoundEffect[] {
  const old = new Map(before.board.units.map(unit => [unit.id, unit]));
  const next = after.board.units;
  // A freshly loaded/new game is not a mass landing or capture.
  if (!next.some(unit => old.has(unit.id))) return [];
  const attacked = next.some(unit => unit.attackedThisTurn?.some(id => !old.get(unit.id)?.attackedThisTurn?.includes(id)));
  if (attacked) return [before.board.units.some(unit => !next.some(u => u.id === unit.id)) ? 'capture' : 'attack'];
  if (next.some(unit => old.has(unit.id) && getUnitDefinition(unit.definitionId).tier > getUnitDefinition(old.get(unit.id)!.definitionId).tier)) return ['promote'];
  if (after.pendingSummons?.some(summon => !before.pendingSummons?.some(s => s.id === summon.id))) return ['phase'];
  if (next.some(unit => !old.has(unit.id))) return ['arrive'];
  if (next.some(unit => { const previous = old.get(unit.id); return previous && (previous.position.x !== unit.position.x || previous.position.y !== unit.position.y); })) return ['move'];
  return [];
}
const ply = (state: GameState) => state.turn.turnNumber * 2 + (state.turn.currentPlayer === 'black' ? 1 : 0);
export function transitionSounds(before: GameState, after: GameState, viewer?: PlayerId | null): SoundEffect[] {
  if (before.phase !== 'playing') return [];
  const advance = ply(after) - ply(before);
  // Undo, reconnect jumps and initial loads must not masquerade as live moves.
  if (advance < 0 || advance > 1 || (!advance && after.turn.actionsRemaining > before.turn.actionsRemaining)
    || (!advance && after.upkeepPending && !before.upkeepPending)) return [];
  const pieces = pieceSounds(before, after);
  if (!advance) return pieces;
  return [
    ...(!viewer || before.turn.currentPlayer === viewer ? ['turnEnd' as const] : []),
    ...pieces,
    ...(after.phase === 'playing' && (!viewer || after.turn.currentPlayer === viewer) ? ['turnStart' as const] : []),
  ];
}

interface View { state: GameState; replay: { replay: TurnReplay; step: number } | null; quiet: boolean; viewer?: PlayerId | null }
export function useGameSounds(view: View) {
  const play = useSoundEffects();
  const previous = useRef<View | null>(null);
  useEffect(() => {
    const before = previous.current; previous.current = view;
    if (!before || before.quiet || view.quiet) return;
    if (view.replay || before.replay) {
      if (!view.replay || !before.replay || view.replay.replay !== before.replay.replay || view.replay.step !== before.replay.step + 1) return;
      const { replay, step } = view.replay;
      const old = step > 1 ? replay.frames[step - 2] : { board: replay.initialBoard, pendingSummons: replay.initialPendingSummons };
      const effects = pieceSounds(old, replay.frames[step - 1]);
      if (effects.length) play(effects);
    } else {
      const effects = transitionSounds(before.state, view.state, view.viewer);
      if (effects.length) play(effects);
    }
  }, [view.state, view.replay?.replay, view.replay?.step, view.quiet, view.viewer, play]);
}
