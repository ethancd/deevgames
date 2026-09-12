import { useEffect, useState, useCallback } from 'react';
import type { TurnReplay as Replay } from '../game/replay';

export function useReplayPlayback() {
  const [playback, setPlayback] = useState<{ replay: Replay; step: number } | null>(null);
  const closeReplay = useCallback(() => setPlayback(null), []);
  const startReplay = useCallback((replay: Replay) => setPlayback({ replay, step: 0 }), []);
  useEffect(() => {
    if (!playback) return;
    const timer = setTimeout(() => setPlayback(current => current && current.step < current.replay.frames.length
      ? { ...current, step: current.step + 1 } : null), 1000);
    return () => clearTimeout(timer);
  }, [playback]);
  return { playback, startReplay, closeReplay };
}

export function TurnReplay({ replay, step, playerName, onClose }: { replay: Replay; step: number; playerName: string; onClose: () => void }) {
  const frame = step ? replay.frames[step - 1] : null;
  return <section className="turn-replay" aria-label="Instant replay">
    <strong>Instant replay · {playerName} · Turn {replay.turnNumber} · {step}/{replay.frames.length}</strong>
    <p className="replay-caption" role="status">{frame?.label ?? (replay.frames.length ? 'Start of turn' : 'No placements, promotions, moves or attacks this turn.')}</p>
    <button className="primary" onClick={onClose}>Stop replay · Back to my turn</button>
  </section>;
}
