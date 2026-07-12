/**
 * EMBER — session driver tests (src/ui/session.test.ts).
 *
 * No DOM needed (setInterval + a plain Sim, no rendering), so this stays on
 * the default 'node' vitest environment — no `// @vitest-environment jsdom`
 * pragma.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Intent, Pilot } from '../core/types';
import type { LLMPilotConfig, LLMPilotEvent } from '../pilot/llmContracts';
import type { ReplayFile } from './contracts';
import { PRESETS } from './presets';
import { createSession } from './session';

function fakeIntent(goal: string): Intent {
  return { goal, skill: 'wait', params: {}, interruptConditions: [] };
}

describe('createSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts paused (no warmup) with a stable snapshot reference', () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    const s1 = session.getState();
    const s2 = session.getState();
    expect(s1).toBe(s2); // same object — nothing changed between calls
    expect(s1.status).toBe('paused');
    expect(s1.tick).toBe(0);
    expect(s1.presetId).toBe('free-run');
    expect(s1.seed).toBe(7);
    expect(s1.replaying).toBe(false);
  });

  it('stepOnce() advances exactly one tick and republishes a new snapshot', async () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    const before = session.getState();
    await session.stepOnce();
    const after = session.getState();
    expect(after).not.toBe(before);
    expect(after.tick).toBe(before.tick + 1);
  });

  it('play() advances TICKS_PER_SECOND_BASE ticks/sec at 1x', async () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    session.play();
    expect(session.getState().status).toBe('running');
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getState().tick).toBe(8);
  });

  it('setSpeed(4) advances 4x as fast while running', async () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    session.play();
    session.setSpeed(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getState().tick).toBe(32);
  });

  it('pause() stops further ticking until play() resumes it', async () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    session.play();
    await vi.advanceTimersByTimeAsync(500); // ~4 ticks
    session.pause();
    const tickAtPause = session.getState().tick;
    expect(session.getState().status).toBe('paused');

    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getState().tick).toBe(tickAtPause);

    session.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getState().tick).toBeGreaterThan(tickAtPause);
  });

  it('restart() rebuilds the sim (fresh tick/history/events) with a new seed', async () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    await session.stepOnce();
    await session.stepOnce();
    expect(session.getState().tick).toBeGreaterThan(0);

    session.restart({ seed: 99 });
    const s = session.getState();
    expect(s.tick).toBe(0);
    expect(s.seed).toBe(99);
    expect(s.recentEvents).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.status).toBe('paused');
    expect(s.replaying).toBe(false);
  });

  it('restart() without an explicit seed keeps the current preset+seed (hard reset)', async () => {
    const session = createSession({ presetId: 'free-run', seed: 41 });
    await session.stepOnce();
    session.restart();
    expect(session.getState().seed).toBe(41);
    expect(session.getState().tick).toBe(0);
  });

  it('restart() with only a presetId switches preset and adopts its default seed', () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    session.restart({ presetId: 'night-defend' });
    const s = session.getState();
    expect(s.presetId).toBe('night-defend');
    expect(s.seed).toBe(PRESETS['night-defend'].seed);
  });

  it('samples body history every 2 ticks, newest last', async () => {
    const session = createSession({ presetId: 'free-run', seed: 3 });
    for (let i = 0; i < 10; i++) await session.stepOnce();
    const s = session.getState();
    expect(s.history.map((h) => h.tick)).toEqual([2, 4, 6, 8, 10]);
  });

  it('caps recentEvents and history at their documented bounds over a long run', async () => {
    const session = createSession({ presetId: 'free-run', seed: 3 });
    for (let i = 0; i < 1300; i++) await session.stepOnce();
    const s = session.getState();
    expect(s.recentEvents.length).toBeLessThanOrEqual(100);
    expect(s.history.length).toBeLessThanOrEqual(600);
  });

  it('setNarration() toggles the flag in place without disturbing the running sim', async () => {
    const session = createSession({ presetId: 'free-run', seed: 5 });
    await session.stepOnce();
    const tickBefore = session.getState().tick;
    session.setNarration(false);
    expect(session.getState().narrationEnabled).toBe(false);
    expect(session.getState().tick).toBe(tickBefore);
  });

  it('exportReplay()/loadReplay() round-trip through JSON and reproduce the same trajectory', async () => {
    const session = createSession({ presetId: 'free-run', seed: 11 });
    for (let i = 0; i < 15; i++) await session.stepOnce();
    const originalFuelTrajectory = session.getState().history.map((h) => h.fuel);
    const file = session.exportReplay();
    const roundTripped = JSON.parse(JSON.stringify(file)) as ReplayFile;

    const replaySession = createSession({ presetId: 'free-run', seed: 12345 });
    replaySession.loadReplay(roundTripped);
    expect(replaySession.getState().replaying).toBe(true);
    expect(replaySession.getState().seed).toBe(11);
    expect(replaySession.getState().tick).toBe(0);

    for (let i = 0; i < 15; i++) await replaySession.stepOnce();
    const replayedFuelTrajectory = replaySession.getState().history.map((h) => h.fuel);
    expect(replayedFuelTrajectory).toEqual(originalFuelTrajectory);
  });

  it('a zero-warmup preset (both night-defend and day-explore) is immediately paused, not idle', () => {
    expect(createSession({ presetId: 'night-defend' }).getState().status).toBe('paused');
    expect(createSession({ presetId: 'day-explore' }).getState().status).toBe('paused');
  });
});

describe('createSession — WF3 setPilot() delegation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the scripted pilot with pilotKind "scripted" and llm null', () => {
    const session = createSession({ presetId: 'free-run', seed: 7 });
    const s = session.getState();
    expect(s.pilotKind).toBe('scripted');
    expect(s.llm).toBeNull();
  });

  it('setPilot swaps the live delegate without restarting the sim (same tick/seed continue)', async () => {
    const fakeLLM: Pilot = { decide: async () => fakeIntent('fake-llm-goal') };
    const session = createSession({
      presetId: 'free-run',
      seed: 7,
      llmPilotFactory: () => fakeLLM,
    });

    await session.stepOnce();
    const seedBeforeSwitch = session.getState().seed;
    const presetBeforeSwitch = session.getState().presetId;

    session.setPilot('claude', { apiKey: 'sk-test-does-not-matter' });
    expect(session.getState().pilotKind).toBe('claude');

    // The pilot is only re-consulted every PILOT_PERIOD ticks (or on
    // interrupt) — step forward (same sim, same seed throughout: proof
    // there was no restart) until a fresh consultation lands.
    let sawFakeGoal = false;
    for (let i = 0; i < 20 && !sawFakeGoal; i++) {
      await session.stepOnce();
      expect(session.getState().seed).toBe(seedBeforeSwitch);
      expect(session.getState().presetId).toBe(presetBeforeSwitch);
      sawFakeGoal = session.getState().lastIntent?.goal === 'fake-llm-goal';
    }
    expect(sawFakeGoal).toBe(true);
    const tickAfterFakeGoal = session.getState().tick;

    // Swap back — again, no restart.
    session.setPilot('scripted');
    expect(session.getState().pilotKind).toBe('scripted');
    expect(session.getState().llm).toBeNull();
    await session.stepOnce();
    expect(session.getState().seed).toBe(seedBeforeSwitch);
    expect(session.getState().tick).toBe(tickAfterFakeGoal + 1);
  });

  it("setPilot('claude', ...) without a config throws (apiKey is required)", () => {
    const session = createSession({ presetId: 'free-run', seed: 7, llmPilotFactory: () => ({ decide: async () => fakeIntent('x') }) });
    expect(() => session.setPilot('claude')).toThrow();
  });

  it('setPilot defaults the model to DEFAULT_LLM_MODEL when none is given', () => {
    const session = createSession({ presetId: 'free-run', seed: 7, llmPilotFactory: () => ({ decide: async () => fakeIntent('x') }) });
    session.setPilot('claude', { apiKey: 'k' });
    expect(session.getState().llm?.model).toBe('claude-sonnet-5');
  });

  it('maps LLMPilotEvent kinds onto llm session state (busy/consultCount/lastError)', () => {
    let fire: ((e: LLMPilotEvent) => void) | undefined;
    const session = createSession({
      presetId: 'free-run',
      seed: 7,
      llmPilotFactory: (config: LLMPilotConfig) => {
        fire = (e) => config.onEvent?.(e);
        return { decide: async () => fakeIntent('g') };
      },
    });

    session.setPilot('claude', { apiKey: 'k', model: 'claude-haiku-4-5' });
    expect(session.getState().llm).toEqual({
      model: 'claude-haiku-4-5',
      busy: false,
      lastError: null,
      consultCount: 0,
    });

    fire?.({ kind: 'consult_start' });
    expect(session.getState().llm?.busy).toBe(true);

    fire?.({ kind: 'consult_ok' });
    expect(session.getState().llm).toEqual({
      model: 'claude-haiku-4-5',
      busy: false,
      lastError: null,
      consultCount: 1,
    });

    fire?.({ kind: 'consult_failed', detail: 'network blip' });
    expect(session.getState().llm?.busy).toBe(false);
    expect(session.getState().llm?.lastError).toBe('network blip');
    expect(session.getState().llm?.consultCount).toBe(2);

    // 401s must never surface the raw transport detail (it could echo the
    // key or other sensitive text) — always the fixed, friendly copy.
    fire?.({ kind: 'auth_error', detail: 'raw 401 body: key sk-ant-should-never-leak-here' });
    expect(session.getState().llm?.lastError).toBe('Invalid API key — check it and reconnect');
  });

  it('ignores a stale onEvent from a pilot instance superseded by a later setPilot() call', () => {
    let fireOld: ((e: LLMPilotEvent) => void) | undefined;
    const session = createSession({
      presetId: 'free-run',
      seed: 7,
      llmPilotFactory: (config: LLMPilotConfig) => {
        fireOld = (e) => config.onEvent?.(e);
        return { decide: async () => fakeIntent('g') };
      },
    });

    session.setPilot('claude', { apiKey: 'k' });
    session.setPilot('scripted'); // switches away — fireOld now refers to a dead delegate

    fireOld?.({ kind: 'consult_failed', detail: 'late arrival from the old pilot' });

    expect(session.getState().pilotKind).toBe('scripted');
    expect(session.getState().llm).toBeNull();
  });

  it('never leaks the api key into getState() or exportReplay() output', async () => {
    const SECRET = 'sk-ant-super-secret-marker-should-never-appear-anywhere';
    const session = createSession({
      presetId: 'free-run',
      seed: 7,
      llmPilotFactory: () => ({ decide: async () => fakeIntent('g') }),
    });

    session.setPilot('claude', { apiKey: SECRET });
    await session.stepOnce();
    await session.stepOnce();

    expect(JSON.stringify(session.getState())).not.toContain(SECRET);

    const replay = session.exportReplay();
    expect(JSON.stringify(replay)).not.toContain(SECRET);
    // Structural guarantee too: ReplayFile has no field that could carry it.
    expect(Object.keys(replay).sort()).toEqual(['bodyOverrides', 'intents', 'presetId', 'seed', 'version']);
  });
});
