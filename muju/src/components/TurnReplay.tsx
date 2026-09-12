import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import type { TurnReplay as Replay } from '../game/replay';

interface Playback { replay: Replay; step: number; paused: boolean; turnKey: string }
export function useReplayPlayback(turnKey: string) {
  const [stored, setPlayback] = useState<Playback | null>(null);
  // An incoming turn change must never paint a stale replay before an effect runs.
  const playback = stored?.turnKey === turnKey ? stored : null;
  const isPlaying = playback !== null;
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasPlaying = useRef(false);
  const closeReplay = useCallback(() => setPlayback(null), []);
  const startReplay = useCallback((replay: Replay) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setPlayback({ replay, step: 0, paused: document.hidden, turnKey });
  }, [turnKey]);
  const toggleReplay = useCallback(() => setPlayback(current => current ? { ...current, paused: !current.paused } : null), []);
  const stepReplay = useCallback((direction: number) => setPlayback(current => current
    ? { ...current, paused: true, step: Math.max(0, Math.min(current.replay.frames.length, current.step + direction)) } : null), []);
  useEffect(() => {
    setPlayback(current => current?.turnKey === turnKey ? current : null);
  }, [turnKey]);
  useEffect(() => {
    if (!playback || playback.paused) return;
    const timer = setTimeout(() => setPlayback(current => {
      if (!current || current.turnKey !== turnKey) return null;
      if (document.hidden) return { ...current, paused: true };
      return current.step < current.replay.frames.length ? { ...current, step: current.step + 1 } : null;
    }), 1000);
    return () => clearTimeout(timer);
  }, [playback, turnKey]);
  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlayback(current => current ? { ...current, paused: true } : null); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  useLayoutEffect(() => {
    if (wasPlaying.current && !isPlaying) returnFocus.current?.focus({ preventScroll: true });
    wasPlaying.current = isPlaying;
  }, [isPlaying]);
  return { playback, startReplay, closeReplay, toggleReplay, stepReplay };
}

export function TurnReplay({ replay, step, paused, playerName, onClose, onToggle, onStep }: {
  replay: Replay; step: number; paused: boolean; playerName: string; onClose: () => void; onToggle: () => void; onStep: (direction: number) => void;
}) {
  const pauseButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => pauseButton.current?.focus({ preventScroll: true }), []);
  const frame = step ? replay.frames[step - 1] : null;
  const caption = frame?.label ?? (replay.frames.length ? 'Start of turn' : 'No board actions this turn.');
  return <section className="turn-replay" aria-label="Instant replay">
    <div className="replay-heading"><strong title={`${playerName} · Turn ${replay.turnNumber}`}>Replay · {playerName}</strong><span>{step}/{replay.frames.length}</span></div>
    <p className="replay-caption" role="status" title={caption}>{caption}</p>
    <div className="replay-controls">
      <button onClick={() => onStep(-1)} disabled={step === 0} aria-label="Previous replay action" title="Previous action">‹</button>
      <button ref={pauseButton} onClick={onToggle} aria-label={paused ? 'Resume replay' : 'Pause replay'}>{paused ? 'Resume' : 'Pause'}</button>
      <button onClick={() => onStep(1)} disabled={step === replay.frames.length} aria-label="Next replay action" title="Next action">›</button>
      <button className="primary" onClick={onClose} aria-label="Stop replay · Back to my turn" title="Back to my turn (Escape)">Done</button>
    </div>
  </section>;
}
