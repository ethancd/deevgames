import { useEffect, useRef } from 'react';
import type { BoardState, GameState } from '../game/types';
import { KILL_SOUND } from '../sound/effects';
import { useSoundEffects } from '../sound/SoundProvider';
import { attackEffects, MAGNITUDE_PITCH, victoryEffect, type BoardEffect } from './effectModel';

/** Effects follow the board actually on screen (live play, an incoming online move,
 * or an instant-replay frame), the same way `useGameSounds` follows it. The plain
 * capture/attack taps still come from `useGameSounds`; this adds the element layer. */
export function useGameEffects(view: { board: BoardState; state: GameState; quiet: boolean }, emit: (effect: BoardEffect) => void) {
  const play = useSoundEffects();
  const previous = useRef(view);
  useEffect(() => {
    const before = previous.current; previous.current = view;
    if (before === view || before.quiet || view.quiet) return;
    if (before.board !== view.board) {
      for (const effect of attackEffects(before.board, view.board)) {
        emit(effect);
        if (effect.kind === 'kill') play([KILL_SOUND[effect.attackerElement]], { rate: MAGNITUDE_PITCH[effect.magnitude] });
      }
    }
    const won = victoryEffect(before.state, view.state);
    if (won) { emit(won); play(['checkmate']); }
  }, [view.board, view.state, view.quiet, emit, play]);
}
