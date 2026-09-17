import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SoundEngine, type SoundEffect } from './effects';

const KEY = 'muju:sfx:v1';
const defaults = { enabled: true, volume: .35 };
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { enabled: saved?.enabled !== false, volume: typeof saved?.volume === 'number' && Number.isFinite(saved.volume)
      ? Math.max(0, Math.min(1, saved.volume)) : defaults.volume };
  } catch { return defaults; }
}
const SoundContext = createContext<{
  enabled: boolean; volume: number;
  setEnabled: (value: boolean) => void; setVolume: (value: number) => void;
  play: (effects: readonly SoundEffect[]) => void;
} | null>(null);
const quiet = (_effects: readonly SoundEffect[]) => {};
export const useSoundEffects = () => useContext(SoundContext)?.play ?? quiet;

export function SoundProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  const engine = useRef<SoundEngine | null>(null);
  useEffect(() => {
    const sound = new SoundEngine(); engine.current = sound;
    window.addEventListener('pointerdown', sound.unlock, true);
    window.addEventListener('touchend', sound.unlock, true);
    window.addEventListener('keydown', sound.unlock, true);
    document.addEventListener('visibilitychange', sound.visibilityChanged);
    return () => {
      window.removeEventListener('pointerdown', sound.unlock, true);
      window.removeEventListener('touchend', sound.unlock, true);
      window.removeEventListener('keydown', sound.unlock, true);
      document.removeEventListener('visibilitychange', sound.visibilityChanged);
      sound.dispose(); engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.configure(settings.enabled, settings.volume);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* In-memory controls still work. */ }
  }, [settings]);
  const play = useCallback((effects: readonly SoundEffect[]) => engine.current?.play(effects), []);
  const value = useMemo(() => ({ ...settings, play,
    setEnabled: (enabled: boolean) => {
      engine.current?.configure(enabled, settings.volume);
      if (enabled) engine.current?.unlock();
      setSettings({ ...settings, enabled });
    },
    setVolume: (volume: number) => setSettings({ ...settings, volume }),
  }), [settings, play]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function SoundControls() {
  const sound = useContext(SoundContext);
  if (!sound) return null;
  return <section className="sound-settings" aria-label="Sound effects">
    <div className="sound-settings-heading"><strong>Sound effects</strong>
      <button type="button" aria-label="Sound effects" aria-pressed={sound.enabled} onClick={() => sound.setEnabled(!sound.enabled)}>{sound.enabled ? 'On' : 'Off'}</button>
    </div>
    <p className="music-help">Soft taps for pieces and turns.</p>
    <div className="music-volume">
      <label>Level · {Math.round(sound.volume * 100)}%<input type="range" min="0" max="1" step="0.01" value={sound.volume}
        aria-label="Effects volume" onChange={event => sound.setVolume(Number(event.target.value))} /></label>
      <button type="button" disabled={!sound.enabled || !sound.volume} onClick={() => sound.play(['move'])}>Test sound</button>
    </div>
  </section>;
}
