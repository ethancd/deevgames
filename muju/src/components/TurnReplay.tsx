import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { expandReplayMoves, type TurnReplay as Replay } from '../game/replay';

export type ReplayMode = 'fast' | 'slow' | 'step';
const MODE_KEY = 'muju-replay-mode';
const MODES: Record<ReplayMode, { name: string; description: string; delay: number }> = {
  fast: { name: 'Fast', description: 'Fast · 0.3 seconds', delay: 300 },
  slow: { name: 'Slow', description: 'Slow · 1 second', delay: 1000 },
  step: { name: 'Step', description: 'Step through · Manual', delay: 0 },
};
function loadReplayMode(): ReplayMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'fast' || saved === 'slow' || saved === 'step') return saved;
  } catch { /* Playback still works when browser storage is unavailable. */ }
  return 'slow';
}

interface Playback { replay: Replay; step: number; paused: boolean; turnKey: string }
export function useReplayPlayback(turnKey: string) {
  const [mode, setMode] = useState<ReplayMode>(loadReplayMode);
  const [stored, setPlayback] = useState<Playback | null>(null);
  // An incoming turn change must never paint a stale replay before an effect runs.
  const playback = stored?.turnKey === turnKey ? stored : null;
  const isPlaying = playback !== null;
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasPlaying = useRef(false);
  const closeReplay = useCallback(() => setPlayback(null), []);
  const startReplay = useCallback((replay: Replay) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setPlayback({ replay: expandReplayMoves(replay), step: 0, paused: mode === 'step' || document.hidden, turnKey });
  }, [turnKey, mode]);
  const setReplayMode = useCallback((next: ReplayMode) => {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* Keep the in-memory preference. */ }
    setPlayback(current => current ? { ...current, paused: next === 'step' || document.hidden } : null);
  }, []);
  const toggleReplay = useCallback(() => {
    if (mode !== 'step') setPlayback(current => current ? { ...current, paused: !current.paused } : null);
  }, [mode]);
  const stepReplay = useCallback((direction: number) => setPlayback(current => current
    ? { ...current, paused: true, step: Math.max(0, Math.min(current.replay.frames.length, current.step + direction)) } : null), []);
  useEffect(() => {
    setPlayback(current => current?.turnKey === turnKey ? current : null);
  }, [turnKey]);
  useEffect(() => {
    if (!playback || playback.paused || mode === 'step') return;
    const timer = setTimeout(() => setPlayback(current => {
      if (!current || current.turnKey !== turnKey) return null;
      if (document.hidden) return { ...current, paused: true };
      return current.step < current.replay.frames.length ? { ...current, step: current.step + 1 } : null;
    }), MODES[mode].delay);
    return () => clearTimeout(timer);
  }, [playback, turnKey, mode]);
  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlayback(current => current ? { ...current, paused: true } : null); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  useLayoutEffect(() => {
    if (wasPlaying.current && !isPlaying) returnFocus.current?.focus({ preventScroll: true });
    wasPlaying.current = isPlaying;
  }, [isPlaying]);
  return { playback, mode, setReplayMode, startReplay, closeReplay, toggleReplay, stepReplay };
}

export function ReplayLauncher({ mode, onModeChange, disabled, title, onStart }: {
  mode: ReplayMode; onModeChange: (mode: ReplayMode) => void; disabled: boolean; title: string; onStart: () => void;
}) {
  return <div className="instant-replay-launcher" role="group" aria-label="Instant replay controls">
    <button className="instant-replay-button" disabled={disabled} title={title} onClick={onStart}>↶ Instant replay</button>
    <label className="replay-mode" title={MODES[mode].description}>
      <span aria-hidden="true">{MODES[mode].name} ▾</span>
      <select aria-label="Replay mode" value={mode} onChange={event => onModeChange(event.target.value as ReplayMode)}>
        {(Object.keys(MODES) as ReplayMode[]).map(value => <option key={value} value={value}>{MODES[value].description}</option>)}
      </select>
    </label>
  </div>;
}

export function TurnReplay({ replay, step, paused, mode, playerName, onClose, onToggle, onStep }: {
  replay: Replay; step: number; paused: boolean; mode: ReplayMode; playerName: string; onClose: () => void; onToggle: () => void; onStep: (direction: number) => void;
}) {
  const manual = mode === 'step';
  const firstControl = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => firstControl.current?.focus({ preventScroll: true }), []);
  const frame = step ? replay.frames[step - 1] : null;
  const caption = frame?.label ?? (replay.frames.length ? 'Start of turn' : 'No board actions this turn.');
  return <section className="turn-replay" aria-label="Instant replay">
    <div className="replay-heading"><strong title={`${playerName} · Turn ${replay.turnNumber}`}>Replay · {playerName}</strong><span>{step}/{replay.frames.length}</span></div>
    <p className="replay-caption" role="status" title={caption}>{caption}</p>
    <div className={`replay-controls${manual ? ' is-manual' : ''}`}>
      <button onClick={() => onStep(-1)} disabled={step === 0} aria-label="Previous replay action" title="Previous action">{manual ? '‹ Back' : '‹'}</button>
      {!manual && <button ref={firstControl} onClick={onToggle} aria-label={paused ? 'Resume replay' : 'Pause replay'}>{paused ? 'Resume' : 'Pause'}</button>}
      <button ref={manual && replay.frames.length > 0 ? firstControl : undefined} onClick={() => onStep(1)} disabled={step === replay.frames.length} aria-label="Next replay action" title="Next action">{manual ? 'Next ›' : '›'}</button>
      <button ref={manual && replay.frames.length === 0 ? firstControl : undefined} className="primary" onClick={onClose} aria-label="Stop replay · Back to live board" title="Back to live board (Escape)">Done</button>
    </div>
  </section>;
}
