/**
 * EMBER — session driver tests (src/ui/session.test.ts).
 *
 * No DOM needed (setInterval + a plain Sim, no rendering), so this stays on
 * the default 'node' vitest environment — no `// @vitest-environment jsdom`
 * pragma.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayFile } from './contracts';
import { PRESETS } from './presets';
import { createSession } from './session';

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
