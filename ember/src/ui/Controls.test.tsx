// @vitest-environment jsdom
/**
 * EMBER — Controls component tests (src/ui/Controls.test.tsx).
 *
 * Drives a REAL createSession() (src/ui/session.ts) wrapped in a tiny
 * subscribing harness — the same live-state pattern App.tsx uses — so this
 * exercises the actual setPilot()/localStorage wiring end to end rather
 * than a hand-rolled fake SessionApi. The 'claude' delegate itself is
 * swapped via createSession's `llmPilotFactory` test seam (see
 * session.test.ts), so these tests never depend on src/pilot/llm.ts.
 */

import '@testing-library/jest-dom';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Pilot } from '../core/types';
import type { LLMPilotConfig, LLMPilotEvent } from '../pilot/llmContracts';
import { ANTHROPIC_KEY_STORAGE_KEY, Controls } from './Controls';
import type { SessionApi, SessionState } from './contracts';
import { createSession } from './session';

function ControlsHarness({ session }: { session: SessionApi }) {
  const [state, setState] = useState<SessionState>(session.getState());
  useEffect(() => session.subscribe(() => setState(session.getState())), [session]);
  const [devMode, setDevMode] = useState(false);
  return <Controls session={session} state={state} devMode={devMode} onToggleDev={setDevMode} />;
}

/** A session whose 'claude' pilot is a fake, with its onEvent callback
 *  exposed so tests can fire LLMPilotEvents directly (no network, no real
 *  src/pilot/llm.ts dependency). */
function buildFakeLLMSession(): { session: SessionApi; fireEvent: (e: LLMPilotEvent) => void } {
  let fire: ((e: LLMPilotEvent) => void) | undefined;
  const session = createSession({
    presetId: 'free-run',
    seed: 3,
    llmPilotFactory: (config: LLMPilotConfig) => {
      fire = (e) => config.onEvent?.(e);
      const pilot: Pilot = {
        decide: async () => ({ goal: 'g', skill: 'wait', params: {}, interruptConditions: [] }),
      };
      return pilot;
    },
  });
  return { session, fireEvent: (e) => fire?.(e) };
}

describe('Controls — Claude pilot key entry', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('Claude is a selectable (non-disabled) pilot option alongside Scripted', () => {
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    const claudeOption = screen.getByRole('option', { name: 'Claude' }) as HTMLOptionElement;
    expect(claudeOption.disabled).toBe(false);
    expect(screen.getByRole('option', { name: 'Scripted' })).toBeInTheDocument();
  });

  it('selecting Claude reveals the key entry panel; selecting Scripted hides it and reverts the pilot', async () => {
    const user = userEvent.setup();
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);

    expect(screen.queryByTestId('llm-key-panel')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    expect(screen.getByTestId('llm-key-panel')).toBeInTheDocument();
    // Not connected yet — just picking 'claude' in the dropdown must not
    // itself flip the active pilot without a key.
    expect(session.getState().pilotKind).toBe('scripted');

    await user.selectOptions(screen.getByLabelText('pilot selector'), 'scripted');
    expect(screen.queryByTestId('llm-key-panel')).not.toBeInTheDocument();
    expect(session.getState().pilotKind).toBe('scripted');
  });

  it('the key field is masked (type=password) and connect persists the key to localStorage only', async () => {
    const user = userEvent.setup();
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);

    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    const keyInput = screen.getByLabelText('anthropic api key') as HTMLInputElement;
    expect(keyInput.type).toBe('password');
    await user.type(keyInput, 'sk-ant-test-key-999');
    await user.click(screen.getByRole('button', { name: 'connect' }));

    expect(window.localStorage.getItem(ANTHROPIC_KEY_STORAGE_KEY)).toBe('sk-ant-test-key-999');
    expect(session.getState().pilotKind).toBe('claude');
    expect(session.getState().llm?.model).toBe('claude-sonnet-5');
    // The key must never show up anywhere in session state.
    expect(JSON.stringify(session.getState())).not.toContain('sk-ant-test-key-999');
  });

  it('connect is disabled until a key is entered', async () => {
    const user = userEvent.setup();
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    expect(screen.getByRole('button', { name: 'connect' })).toBeDisabled();
    await user.type(screen.getByLabelText('anthropic api key'), 'k');
    expect(screen.getByRole('button', { name: 'connect' })).toBeEnabled();
  });

  it('pre-fills the key input from a previously stored localStorage key', async () => {
    window.localStorage.setItem(ANTHROPIC_KEY_STORAGE_KEY, 'sk-ant-stored-key');
    const user = userEvent.setup();
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    const keyInput = screen.getByLabelText('anthropic api key') as HTMLInputElement;
    expect(keyInput.value).toBe('sk-ant-stored-key');
  });

  it('forget key clears storage, clears the field, and falls back to Scripted', async () => {
    window.localStorage.setItem(ANTHROPIC_KEY_STORAGE_KEY, 'sk-ant-stored-key');
    const user = userEvent.setup();
    const { session } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);

    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    await user.click(screen.getByRole('button', { name: 'connect' }));
    expect(session.getState().pilotKind).toBe('claude');

    await user.click(screen.getByRole('button', { name: 'forget key' }));
    expect(window.localStorage.getItem(ANTHROPIC_KEY_STORAGE_KEY)).toBeNull();
    expect(session.getState().pilotKind).toBe('scripted');
    expect(session.getState().llm).toBeNull();
    expect(screen.queryByTestId('llm-key-panel')).not.toBeInTheDocument();
  });

  it('shows a pulsing "consulting…" indicator only while llm.busy is true', async () => {
    const user = userEvent.setup();
    const { session, fireEvent } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    await user.type(screen.getByLabelText('anthropic api key'), 'sk-ant-key');
    await user.click(screen.getByRole('button', { name: 'connect' }));

    expect(screen.queryByTestId('llm-busy')).not.toBeInTheDocument();
    act(() => fireEvent({ kind: 'consult_start' }));
    expect(screen.getByTestId('llm-busy')).toBeInTheDocument();
    act(() => fireEvent({ kind: 'consult_ok' }));
    expect(screen.queryByTestId('llm-busy')).not.toBeInTheDocument();
  });

  it('shows consultCount in the corner, incrementing on each completed consultation', async () => {
    const user = userEvent.setup();
    const { session, fireEvent } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    await user.type(screen.getByLabelText('anthropic api key'), 'sk-ant-key');
    await user.click(screen.getByRole('button', { name: 'connect' }));

    expect(screen.getByTestId('llm-consult-count')).toHaveTextContent('#0');
    act(() => fireEvent({ kind: 'consult_ok' }));
    expect(screen.getByTestId('llm-consult-count')).toHaveTextContent('#1');
  });

  it('shows a dismissible red error strip with the fixed 401 copy on auth_error, never the raw detail', async () => {
    const user = userEvent.setup();
    const { session, fireEvent } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    await user.type(screen.getByLabelText('anthropic api key'), 'sk-ant-key');
    await user.click(screen.getByRole('button', { name: 'connect' }));

    act(() => fireEvent({ kind: 'auth_error', detail: 'raw body should not appear sk-ant-leak' }));
    const strip = screen.getByTestId('llm-error-strip');
    expect(strip).toHaveTextContent('Invalid API key — check it and reconnect');
    expect(strip).not.toHaveTextContent('raw body should not appear');

    await user.click(screen.getByRole('button', { name: 'dismiss llm error' }));
    expect(screen.queryByTestId('llm-error-strip')).not.toBeInTheDocument();
  });

  it('a consult_failed error also renders as a dismissible strip', async () => {
    const user = userEvent.setup();
    const { session, fireEvent } = buildFakeLLMSession();
    render(<ControlsHarness session={session} />);
    await user.selectOptions(screen.getByLabelText('pilot selector'), 'claude');
    await user.type(screen.getByLabelText('anthropic api key'), 'sk-ant-key');
    await user.click(screen.getByRole('button', { name: 'connect' }));

    act(() => fireEvent({ kind: 'consult_failed', detail: 'connection reset' }));
    expect(screen.getByTestId('llm-error-strip')).toHaveTextContent('connection reset');
  });
});
