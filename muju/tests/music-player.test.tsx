import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MusicButton, MusicProvider } from '../src/music/MusicPlayer';
import { MUSIC_TRACKS } from '../src/music/tracks';

let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play')); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const view = render(<MusicProvider><MusicButton /><p>Room turn 1</p></MusicProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Music player' }));
  const audio = view.container.querySelector('audio')!;
  return { ...view, audio };
}
function metadata(audio: HTMLAudioElement, duration = 210) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  fireEvent.loadedMetadata(audio);
}

it('starts only on request and keeps the audio and position through panel and room updates', async () => {
  const view = setup();
  expect(play).not.toHaveBeenCalled();
  expect(view.audio.preload).toBe('none');
  expect(screen.getAllByRole('option')).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
  await act(async () => {});
  metadata(view.audio);
  fireEvent.change(screen.getByRole('slider', { name: 'Track position' }), { target: { value: '119' } });
  expect(view.audio.currentTime).toBe(119);
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  view.rerender(<MusicProvider><MusicButton /><p>Room turn 2</p></MusicProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Music player' }));
  expect(view.container.querySelector('audio')).toBe(view.audio);
  expect(view.audio.currentTime).toBe(119);
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeInTheDocument();
});

it('seeks both directions while paused and rejects scrubbing before metadata', () => {
  const { audio } = setup();
  expect(screen.getByRole('slider', { name: 'Track position' })).toBeDisabled();
  metadata(audio);
  for (const seconds of [150, 60]) {
    fireEvent.change(screen.getByRole('slider', { name: 'Track position' }), { target: { value: String(seconds) } });
    expect(audio.currentTime).toBe(seconds);
  }
  expect(play).not.toHaveBeenCalled();
});

it('advances, repeats one song, wraps the disc, or stops when repeat is off', async () => {
  const { audio } = setup();
  metadata(audio);
  fireEvent.ended(audio);
  expect(screen.getByRole('combobox', { name: 'Track' })).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat track' }));
  expect(screen.getByRole('button', { name: 'Repeat disc' })).toHaveAttribute('aria-pressed', 'false');
  metadata(audio); audio.currentTime = 197;
  fireEvent.ended(audio);
  expect(audio.currentTime).toBe(0);
  expect(screen.getByRole('combobox', { name: 'Track' })).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat disc' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Track' }), { target: { value: '8' } });
  fireEvent.ended(audio);
  expect(screen.getByRole('combobox', { name: 'Track' })).toHaveValue('0');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat disc' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Track' }), { target: { value: '8' } });
  await act(async () => {});
  const calls = play.mock.calls.length;
  fireEvent.ended(audio);
  expect(play).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole('button', { name: 'Play music' })).toBeInTheDocument();
});

it('retains level, mute, chosen track and repeat preference without autoplay after reload', () => {
  const view = setup();
  fireEvent.change(screen.getByRole('slider', { name: 'Music volume' }), { target: { value: '.3' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Track' }), { target: { value: '4' } });
  expect(view.audio.volume).toBeCloseTo(.3 * MUSIC_TRACKS[4].gain);
  fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
  fireEvent.click(screen.getByRole('button', { name: 'Repeat track' }));
  view.unmount();
  const fresh = setup();
  expect(fresh.audio.muted).toBe(true);
  expect(screen.getByRole('slider', { name: 'Music volume' })).toHaveValue('0.3');
  expect(screen.getByRole('combobox', { name: 'Track' })).toHaveValue('4');
  expect(screen.getByRole('button', { name: 'Repeat track' })).toHaveAttribute('aria-pressed', 'true');
  expect(play).not.toHaveBeenCalled();
});

it('recovers from unavailable audio and ignores a stale play rejection after skipping', async () => {
  let rejectOld!: (reason: Error) => void;
  play.mockImplementationOnce(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return new Promise<void>((_, reject) => { rejectOld = reject; });
  });
  const { audio } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next music track' }));
  await act(async () => rejectOld(new Error('superseded')));
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.error(audio);
  Object.defineProperty(audio, 'paused', { configurable: true, value: true });
  expect(screen.getByRole('alert')).toHaveTextContent('could not load');
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
  await act(async () => {});
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pause music' })).toBeInTheDocument();
});

it('falls back safely when saved settings are malformed', () => {
  localStorage.setItem('muju:music:v1', '{broken');
  setup();
  expect(screen.getByRole('combobox', { name: 'Track' })).toHaveValue('0');
  expect(screen.getByRole('button', { name: 'Repeat disc' })).toHaveAttribute('aria-pressed', 'true');
});

it('resumes in one click after a browser media interruption and keeps paused track changes quiet', async () => {
  const { audio } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
  await act(async () => {});
  act(() => audio.pause());
  const calls = play.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Next music track' }));
  expect(play).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Play music' }));
  await act(async () => {});
  expect(play).toHaveBeenCalledTimes(calls + 1);
});
