/**
 * EMBER — bottom control bar (src/ui/Controls.tsx).
 *
 * Not part of the pinned contract (only session.ts/presets.ts and the
 * panels are pinned) — this component's props are this agent's own design,
 * built directly against `SessionApi` (src/ui/contracts.ts).
 *
 * Pixel-style transport controls (pause/step/play), 1x/4x speed, a seed
 * field + restart, a preset picker, a ground-truth dev-panel toggle, a
 * narration toggle, replay download/upload via Blob + a hidden file input,
 * and a pilot selector showing "Scripted" with "Claude" present but
 * disabled/greyed ("WF3" — LLM pilot wiring is out of this workflow's
 * scope; PLAN.md §7 WF3).
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { PresetId, ReplayFile, SessionApi, SessionState } from './contracts';
import { PRESETS } from './presets';

export interface ControlsProps {
  session: SessionApi;
  state: SessionState;
  devMode: boolean;
  onToggleDev: (enabled: boolean) => void;
}

const PRESET_IDS: PresetId[] = ['free-run', 'day-explore', 'night-defend'];

const BTN =
  'inline-flex items-center justify-center rounded-none border border-slate-600 bg-slate-800 px-2 py-1 ' +
  'text-[11px] font-mono uppercase tracking-wide text-slate-200 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)] ' +
  'hover:bg-slate-700 active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-40';

const BTN_ACTIVE = 'border-amber-400 bg-amber-900/60 text-amber-200';

function pixelBtn(active: boolean): string {
  return active ? `${BTN} ${BTN_ACTIVE}` : BTN;
}

export function Controls({ session, state, devMode, onToggleDev }: ControlsProps) {
  const [seedInput, setSeedInput] = useState(String(state.seed));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep the seed field in sync when the session's seed changes from
  // elsewhere (preset switch, a loaded replay) rather than this input.
  useEffect(() => {
    setSeedInput(String(state.seed));
  }, [state.seed]);

  function handleRestartClick(): void {
    const parsed = Number.parseInt(seedInput, 10);
    session.restart({ seed: Number.isFinite(parsed) ? parsed : undefined });
  }

  function handlePresetChange(e: ChangeEvent<HTMLSelectElement>): void {
    session.restart({ presetId: e.target.value as PresetId });
  }

  function handleDownloadReplay(): void {
    const file = session.exportReplay();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ember-replay-seed${file.seed}-t${state.tick}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleUploadClick(): void {
    fileInputRef.current?.click();
  }

  function handleUploadChange(e: ChangeEvent<HTMLInputElement>): void {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ReplayFile;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.intents)) {
          session.loadReplay(parsed);
        }
      } catch {
        // Malformed replay file — silently ignore rather than crash the UI.
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 bg-slate-900/90 px-3 py-2 font-mono text-[11px] text-slate-200">
      <div className="flex items-center gap-1" role="group" aria-label="transport controls">
        <button
          type="button"
          className={pixelBtn(state.status === 'paused')}
          onClick={() => session.pause()}
          aria-label="pause"
          title="Pause"
        >
          ❚❚
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => void session.stepOnce()}
          aria-label="step"
          title="Step one tick"
        >
          ⏭
        </button>
        <button
          type="button"
          className={pixelBtn(state.status === 'running')}
          onClick={() => session.play()}
          disabled={state.status === 'ended'}
          aria-label="play"
          title="Play"
        >
          ▶
        </button>
      </div>

      <div className="flex items-center gap-1 text-slate-400" aria-label="tick counter" data-testid="tick-display">
        <span className="text-slate-500">t=</span>
        <span className="tabular-nums text-slate-200" data-testid="tick-value">
          {state.tick}
        </span>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="speed">
        <button
          type="button"
          className={pixelBtn(state.speed === 1)}
          onClick={() => session.setSpeed(1)}
          aria-pressed={state.speed === 1}
        >
          1×
        </button>
        <button
          type="button"
          className={pixelBtn(state.speed === 4)}
          onClick={() => session.setSpeed(4)}
          aria-pressed={state.speed === 4}
        >
          4×
        </button>
      </div>

      <label className="flex items-center gap-1">
        <span className="text-slate-500">seed</span>
        <input
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          className="w-20 border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
          aria-label="seed"
        />
      </label>
      <button type="button" className={BTN} onClick={handleRestartClick}>
        restart
      </button>

      <label className="flex items-center gap-1">
        <span className="text-slate-500">preset</span>
        <select
          value={state.presetId}
          onChange={handlePresetChange}
          className="border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
          aria-label="preset"
        >
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {PRESETS[id].label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-slate-400">
        <input
          type="checkbox"
          checked={devMode}
          onChange={(e) => onToggleDev(e.target.checked)}
          aria-label="ground truth dev panel"
        />
        dev
      </label>

      <label className="flex items-center gap-1 text-slate-400">
        <input
          type="checkbox"
          checked={state.narrationEnabled}
          onChange={(e) => session.setNarration(e.target.checked)}
          aria-label="narration"
        />
        narration
      </label>

      <div className="flex items-center gap-1" role="group" aria-label="replay">
        <button type="button" className={BTN} onClick={handleDownloadReplay}>
          ↓ replay
        </button>
        <button type="button" className={BTN} onClick={handleUploadClick}>
          ↑ replay
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleUploadChange}
          aria-label="load replay file"
        />
      </div>

      <label className="ml-auto flex items-center gap-1">
        <span className="text-slate-500">pilot</span>
        <select
          defaultValue="scripted"
          className="border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
          aria-label="pilot selector"
        >
          <option value="scripted">Scripted</option>
          <option value="claude" disabled>
            Claude (WF3)
          </option>
        </select>
      </label>
    </div>
  );
}

export default Controls;
