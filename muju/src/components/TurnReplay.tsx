import { useEffect, useState } from 'react';
import type { TurnReplay as Replay } from '../game/replay';
import { Board } from './Board';
import { PlayDialog } from './PlayDialog';

export function TurnReplay({ replay, playerName, onClose }: { replay: Replay; playerName: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step >= replay.frames.length) onClose();
      else setStep(step + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, replay, onClose]);
  const frame = step ? replay.frames[step - 1] : null;
  return <PlayDialog title="Instant replay" onClose={onClose}>
    <div className="turn-replay">
      <p>{playerName} · Turn {replay.turnNumber} · {step}/{replay.frames.length}</p>
      <p className="replay-caption" role="status">{frame?.label ?? (replay.frames.length ? 'Start of turn' : 'No placements, promotions, moves or attacks this turn.')}</p>
      <div className="replay-board" aria-label="Replay board">
        <Board board={frame?.board ?? replay.initialBoard} selectedUnit={frame?.unitId ?? null}
          validMoves={[]} validAttacks={frame?.action.type === 'ATTACK' && frame.position ? [frame.position] : []}
          validSpawns={[]} previewPosition={frame?.position} onCellClick={() => {}} onUnitClick={() => {}} />
      </div>
      <button className="primary" onClick={onClose}>Stop replay · Back to my turn</button>
    </div>
  </PlayDialog>;
}
