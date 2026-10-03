import { useMemo } from 'react';
import { Board } from '../components/Board';
import { createEmptyBoard } from '../game/board';
import type { Element, PlayerId } from '../game/types';
import { useSoundEffects } from '../sound/SoundProvider';
import { KILL_SOUND } from '../sound/effects';
import { BoardEffects, useBoardEffects } from './BoardEffects';
import { MAGNITUDES, MAGNITUDE_PITCH, type BoardEffect } from './effectModel';

const ELEMENTS: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

/** `/muju/?effects=1`: every element at every magnitude, for review and screenshots. */
export function EffectsGallery() {
  const effects = useBoardEffects();
  const play = useSoundEffects();
  const board = useMemo(() => {
    const b = createEmptyBoard(5);
    b.cells[2][2].resourceLayers = 4;
    const unit = (id: string, definitionId: string, owner: PlayerId, x: number, y: number) => ({ id, definitionId, owner, position: { x, y },
      hasMoved: false, hasAttacked: false, canActThisTurn: true, damageTaken: 0 });
    b.units = [unit('a', 'metal_2', 'white', 1, 2), unit('b', 'water_2', 'black', 2, 2)];
    return b;
  }, []);
  const fire = (effect: BoardEffect) => {
    effects.emit(effect);
    if (effect.kind === 'kill') play(['capture', KILL_SOUND[effect.attackerElement]], { rate: MAGNITUDE_PITCH[effect.magnitude] });
    if (effect.kind === 'hit') play(['attack']);
    if (effect.kind === 'checkmate') play(['checkmate']);
    if (effect.kind === 'collect') play(['collect']);
  };
  return <main className="effects-gallery">
    <h1>Board effects</h1>
    <section className="board-stage effects-gallery-stage">
      <Board board={board} selectedUnit={null} validMoves={[]} validAttacks={[]} validSpawns={[]} onCellClick={() => {}} onUnitClick={() => {}} />
      <BoardEffects handle={effects.handle} />
    </section>
    <div className="effects-gallery-controls">
      {ELEMENTS.map(element => <fieldset key={element}><legend>{element}</legend>
        {MAGNITUDES.map(magnitude => (['hit', 'kill'] as const).map(kind =>
          <button key={magnitude + kind} type="button" onClick={() => fire({ kind, x: 2, y: 2, attackerElement: element, magnitude, defenderOwner: 'black' })}>{kind} · {magnitude}</button>))}
      </fieldset>)}
      <fieldset><legend>other</legend>
        <button type="button" onClick={() => fire({ kind: 'collect', x: 2, y: 2, count: 3 })}>collect</button>
        <button type="button" onClick={() => fire({ kind: 'checkmate', x: 4, y: 4, winner: 'white' })}>checkmate</button>
        <button type="button" onClick={() => fire({ kind: 'reveal', x: 2, y: 2 })}>reveal</button>
      </fieldset>
    </div>
  </main>;
}
