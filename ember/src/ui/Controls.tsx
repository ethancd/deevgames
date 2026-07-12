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
 * and a pilot selector: "Scripted" (default) and "Claude" (WF3).
 *
 * Claude key handling (PLAN.md §7 WF3 / llmContracts.ts header):
 *   - The API key is held in a local `apiKeyInput` field (native
 *     `type="password"` masking) and persisted ONLY to
 *     localStorage['ember.anthropicKey'] — never to session state, never
 *     logged, never sent anywhere but into `session.setPilot('claude', …)`.
 *   - `session.getState().llm` never carries the key (see contracts.ts'
 *     LLMSessionInfo — model/busy/lastError/consultCount only), so nothing
 *     rendered from session state can ever leak it.
 *   - "forget key" clears storage, the input, and falls back to the
 *     Scripted pilot so there's never a connected-without-a-stored-key
 *     dangling state.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LLMModelId } from '../pilot/llmContracts';
import { DEFAULT_LLM_MODEL } from '../pilot/llmContracts';
import type { PilotKind, PresetId, ReplayFile, SessionApi, SessionState } from './contracts';
import { PRESETS } from './presets';

export const ANTHROPIC_KEY_STORAGE_KEY = 'ember.anthropicKey';

const LLM_MODELS: LLMModelId[] = ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-4-8'];

function readStoredKey(): string {
  try {
    return window.localStorage.getItem(ANTHROPIC_KEY_STORAGE_KEY) ?? '';
  } catch {
    return ''; // localStorage unavailable (private mode, tests, etc.)
  }
}

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

  // Draft pilot selection: the <select> reflects what the user has picked,
  // which can briefly differ from state.pilotKind while a 'claude' pick is
  // still showing the key-entry panel (nothing is connected yet). Picking
  // 'scripted' applies immediately since it needs no key.
  const [draftPilotKind, setDraftPilotKind] = useState<PilotKind>(state.pilotKind);
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => readStoredKey());
  const [selectedModel, setSelectedModel] = useState<LLMModelId>(DEFAULT_LLM_MODEL);
  // Locally "dismissed" error text — hides the red strip without touching
  // session state (lastError only truly clears on the pilot's next
  // successful consultation, per contracts.ts' LLMSessionInfo).
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Keep the seed field in sync when the session's seed changes from
  // elsewhere (preset switch, a loaded replay) rather than this input.
  useEffect(() => {
    setSeedInput(String(state.seed));
  }, [state.seed]);

  // If the session's actual pilot changes from elsewhere (or on first
  // successful connect), keep the select in sync.
  useEffect(() => {
    setDraftPilotKind(state.pilotKind);
  }, [state.pilotKind]);

  const llmError = state.llm?.lastError ?? null;
  const showErrorStrip = llmError !== null && llmError !== dismissedError;

  function handlePilotSelectChange(e: ChangeEvent<HTMLSelectElement>): void {
    const kind = e.target.value as PilotKind;
    setDraftPilotKind(kind);
    if (kind === 'scripted') {
      session.setPilot('scripted');
    }
    // 'claude' just reveals the key-entry panel below; connecting happens
    // on the explicit "connect" click.
  }

  function handleConnectClick(): void {
    const key = apiKeyInput.trim();
    if (!key) return;
    try {
      window.localStorage.setItem(ANTHROPIC_KEY_STORAGE_KEY, key);
    } catch {
      // localStorage unavailable — still connect for this session.
    }
    setDismissedError(null);
    session.setPilot('claude', { apiKey: key, model: selectedModel });
  }

  function handleForgetKeyClick(): void {
    try {
      window.localStorage.removeItem(ANTHROPIC_KEY_STORAGE_KEY);
    } catch {
      // localStorage unavailable — nothing to clear.
    }
    setApiKeyInput('');
    setDismissedError(null);
    setDraftPilotKind('scripted');
    session.setPilot('scripted');
  }

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

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-slate-500">pilot</span>
          <select
            value={draftPilotKind}
            onChange={handlePilotSelectChange}
            className="border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
            aria-label="pilot selector"
          >
            <option value="scripted">Scripted</option>
            <option value="claude">Claude</option>
          </select>
        </label>

        {state.pilotKind === 'claude' && (
          <span className="flex items-center gap-2 text-slate-400" data-testid="llm-status">
            {state.llm?.busy ? (
              <span className="animate-pulse text-amber-300" aria-live="polite" data-testid="llm-busy">
                ● consulting…
              </span>
            ) : null}
            <span className="tabular-nums text-slate-500" title="LLM consultations so far" data-testid="llm-consult-count">
              #{state.llm?.consultCount ?? 0}
            </span>
          </span>
        )}
      </div>

      {showErrorStrip && llmError !== null && (
        <div
          role="alert"
          className="flex w-full items-center justify-between gap-2 border border-red-700 bg-red-950/80 px-2 py-1 text-red-200"
          data-testid="llm-error-strip"
        >
          <span>{llmError}</span>
          <button
            type="button"
            className="border border-red-700 px-1 text-red-200 hover:bg-red-900"
            onClick={() => setDismissedError(llmError)}
            aria-label="dismiss llm error"
          >
            ×
          </button>
        </div>
      )}

      {draftPilotKind === 'claude' && (
        <div
          className="flex w-full flex-wrap items-center gap-2 border-t border-slate-800 pt-2 text-slate-300"
          data-testid="llm-key-panel"
        >
          <label className="flex items-center gap-1">
            <span className="text-slate-500">key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-40 border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
              aria-label="anthropic api key"
              autoComplete="off"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-slate-500">model</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as LLMModelId)}
              className="border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
              aria-label="llm model"
            >
              {LLM_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={pixelBtn(state.pilotKind === 'claude')}
            onClick={handleConnectClick}
            disabled={apiKeyInput.trim().length === 0}
          >
            connect
          </button>
          <button type="button" className={BTN} onClick={handleForgetKeyClick} aria-label="forget key">
            forget key
          </button>
        </div>
      )}
    </div>
  );
}

export default Controls;
