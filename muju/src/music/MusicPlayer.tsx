import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PlayDialog } from '../components/PlayDialog';
import { MUSIC_TRACKS } from './tracks';
import './music.css';

type Repeat = 'disc' | 'track' | 'off';
const STORAGE_KEY = 'muju:music:v1';
const MusicContext = createContext<{ open: () => void; playing: boolean; title: string } | null>(null);

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      index: Math.max(0, MUSIC_TRACKS.findIndex(track => track.id === value?.trackId)),
      volume: typeof value?.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : .55,
      muted: value?.muted === true,
      repeat: (['disc', 'track', 'off'].includes(value?.repeat) ? value.repeat : 'disc') as Repeat,
    };
  } catch { return { index: 0, volume: .55, muted: false, repeat: 'disc' as Repeat }; }
}

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function MusicButton() {
  const music = useContext(MusicContext);
  if (!music) return null;
  return <button type="button" className={`music-trigger${music.playing ? ' is-playing' : ''}`}
    aria-label="Music player" title={music.playing ? `Playing: ${music.title}` : 'Background music'} onClick={music.open}>
    <span aria-hidden="true">♫</span><span className="music-trigger-label">Music</span>
    {music.playing && <span className="music-playing-dot" aria-hidden="true" />}
  </button>;
}

/** One audio element lives above the room, so moves, dialogs and rematches cannot restart it. */
export function MusicProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readSettings);
  const [index, setIndex] = useState(initial.index);
  const [volume, setVolume] = useState(initial.volume);
  const [muted, setMuted] = useState(initial.muted);
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number>(MUSIC_TRACKS[initial.index].duration);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const wantsPlayback = useRef(false);
  const playRequest = useRef(0);
  const track = MUSIC_TRACKS[index];

  async function start() {
    const element = audio.current;
    if (!element) return;
    const request = ++playRequest.current;
    wantsPlayback.current = true;
    setError('');
    if (element.error) element.load();
    try { await element.play(); }
    catch (reason) {
      if (request !== playRequest.current || (reason instanceof DOMException && reason.name === 'AbortError')) return;
      wantsPlayback.current = false;
      setPlaying(false);
      setError('Music could not start. Press Play to retry, or choose another track.');
    }
  }

  function pause() {
    wantsPlayback.current = false;
    playRequest.current++;
    audio.current?.pause();
    setPlaying(false);
  }

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    playRequest.current++;
    element.src = `${import.meta.env.BASE_URL}music/${track.file}`;
    setPosition(0);
    setDuration(track.duration);
    setReady(false);
    setError('');
    if (wantsPlayback.current) void start();
  }, [track]);

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume * track.gain;
      audio.current.muted = muted;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ trackId: track.id, volume, muted, repeat })); }
    catch { /* Listening still works when storage is unavailable. */ }
  }, [track, volume, muted, repeat]);

  useEffect(() => {
    const element = audio.current;
    return () => { playRequest.current++; if (element && !element.paused) element.pause(); };
  }, []);

  function seek(seconds: number) {
    const element = audio.current;
    if (!element || !ready || !Number.isFinite(seconds)) return;
    element.currentTime = Math.max(0, Math.min(duration, seconds));
    setPosition(element.currentTime);
  }

  function ended() {
    if (repeat === 'track') { seek(0); void start(); }
    else if (index + 1 < MUSIC_TRACKS.length || repeat === 'disc') {
      wantsPlayback.current = true;
      setIndex((index + 1) % MUSIC_TRACKS.length);
    } else pause();
  }

  function selectTrack(next: number) {
    wantsPlayback.current = audio.current?.paused === false;
    setIndex(next);
  }

  return <MusicContext.Provider value={{ open: () => setOpen(true), playing, title: track.title }}>
    {children}
    <audio ref={audio} preload="none" aria-label="Background soundtrack" onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)} onEnded={ended}
      onLoadedMetadata={() => {
        const value = audio.current?.duration;
        if (value && Number.isFinite(value)) { setDuration(value); setReady(true); }
      }}
      onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
      onError={() => { wantsPlayback.current = false; playRequest.current++; setPlaying(false); setError('This track could not load. Press Play to retry, or choose another track.'); }} />
    {open && <PlayDialog title="Background music" onClose={() => setOpen(false)}>
      <div className="music-panel">
        <p className="music-caption">Nine full tracks · Muju Hono Tanka</p>
        <label className="music-track-label">Track
          <select value={index} onChange={event => selectTrack(Number(event.target.value))}>
            {MUSIC_TRACKS.map((song, i) => <option key={song.id} value={i}>{i + 1}. {song.title} · {song.category}</option>)}
          </select>
        </label>
        <div className="music-transport">
          <button type="button" aria-label="Previous music track" onClick={() => position > 3 ? seek(0) : selectTrack((index - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length)}>Previous</button>
          <button type="button" className="music-play" onClick={() => audio.current?.paused ? void start() : pause()}>{playing ? 'Pause music' : 'Play music'}</button>
          <button type="button" aria-label="Next music track" onClick={() => selectTrack((index + 1) % MUSIC_TRACKS.length)}>Next</button>
        </div>
        <label className="music-seek">Track position
          <input type="range" min="0" max={duration} step="1" value={position} disabled={!ready}
            aria-valuetext={`${clock(position)} of ${clock(duration)}`} onChange={event => seek(Number(event.target.value))} />
        </label>
        <div className="music-time" aria-hidden="true"><span>{clock(position)}</span><span>{clock(duration)}</span></div>
        <div className="music-volume">
          <button type="button" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
          <label>Volume · {Math.round(volume * 100)}%<input type="range" min="0" max="1" step="0.01" value={volume}
            aria-label="Music volume" onChange={event => setVolume(Number(event.target.value))} /></label>
        </div>
        <div className="music-repeat" role="group" aria-label="Music repeat">
          <button type="button" aria-pressed={repeat === 'track'} onClick={() => setRepeat(repeat === 'track' ? 'off' : 'track')}>Repeat track</button>
          <button type="button" aria-pressed={repeat === 'disc'} onClick={() => setRepeat(repeat === 'disc' ? 'off' : 'disc')}>Repeat disc</button>
        </div>
        {error && <p role="alert">{error}</p>}
        <p className="music-help">Keep playing and close this panel. Track levels are balanced; your volume and repeat choices stay on this device.</p>
      </div>
    </PlayDialog>}
  </MusicContext.Provider>;
}
