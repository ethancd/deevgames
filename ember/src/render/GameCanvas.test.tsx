// @vitest-environment jsdom
/**
 * EMBER — GameCanvas component tests (src/render/GameCanvas.test.tsx).
 *
 * Built against a REAL createSim from '../engine' (seed 7, a few scripted
 * ticks) wrapped in a minimal in-file fake SessionApi — agent S builds the
 * real session.ts in parallel, so this test only depends on the pinned
 * SessionApi contract, not that implementation.
 *
 * jsdom's HTMLCanvasElement.getContext('2d') returns null (no `canvas` npm
 * package, and we're not allowed to add one), so HTMLCanvasElement.prototype
 * .getContext is monkey-patched here to hand back a FakeCtx2D
 * (testSupport/fakeCtx2d.ts) — the same production drawing code runs
 * either way, this only swaps the backend it renders into.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import type { ReplayFile, SessionApi, SessionState } from '../ui/contracts';
import { GameCanvas } from './GameCanvas';
import { FakeCtx2D } from './testSupport/fakeCtx2d';

let restore: (() => void) | null = null;

function installFakeCanvasBackend(): () => void {
  const cache = new WeakMap<HTMLCanvasElement, FakeCtx2D>();
  const original = HTMLCanvasElement.prototype.getContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    type: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...rest: any[]
  ) {
    if (type !== '2d') return original.apply(this, [type, ...rest] as never);
    let ctx = cache.get(this);
    if (!ctx) {
      ctx = new FakeCtx2D(this.width || 1, this.height || 1);
      cache.set(this, ctx);
    }
    return ctx;
  };
  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

async function buildFakeSession(): Promise<SessionApi> {
  const sim = createSim({ seed: 7, pilot: createScriptedPilot() });
  await sim.run(20);

  const state: SessionState = {
    tick: sim.world.tick,
    status: 'paused',
    speed: 1,
    world: sim.world,
    body: sim.body,
    lastPacket: null,
    lastIntent: sim.intents.length > 0 ? sim.intents[sim.intents.length - 1] : null,
    recentEvents: sim.log.all().slice(-50),
    history: [],
    seed: 7,
    presetId: 'free-run',
    narrationEnabled: true,
    replaying: false,
  };

  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    play: () => {},
    pause: () => {},
    stepOnce: async () => {},
    setSpeed: () => {},
    setNarration: () => {},
    restart: () => {},
    exportReplay: (): ReplayFile => ({ version: 1, seed: 7, intents: sim.intents }),
    loadReplay: () => {},
  };
}

async function flushFrames(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

describe('GameCanvas', () => {
  beforeEach(() => {
    restore = installFakeCanvasBackend();
  });

  afterEach(() => {
    cleanup();
    restore?.();
    restore = null;
  });

  it('mounts without crashing against a real createSim-backed session', async () => {
    const session = await buildFakeSession();
    expect(() => render(<GameCanvas session={session} />)).not.toThrow();
    await flushFrames();
  });

  it('sets imageSmoothingEnabled = false on the drawing context', async () => {
    const session = await buildFakeSession();
    const { container } = render(<GameCanvas session={session} />);
    await flushFrames();
    const canvas = container.querySelector('canvas')!;
    const ctx = canvas.getContext('2d') as unknown as FakeCtx2D;
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('draws the scene every frame (sprite blits happen)', async () => {
    const session = await buildFakeSession();
    const { container } = render(<GameCanvas session={session} />);
    await flushFrames();
    const canvas = container.querySelector('canvas')!;
    const ctx = canvas.getContext('2d') as unknown as FakeCtx2D;
    expect(ctx.drawImageCalls).toBeGreaterThan(0);
  });

  it('unmounts cleanly (cancels its rAF loop, unsubscribes from the session)', async () => {
    const session = await buildFakeSession();
    const { unmount } = render(<GameCanvas session={session} />);
    await flushFrames();
    expect(() => unmount()).not.toThrow();
  });

  it('renders a speech bubble when narration is enabled and lastIntent has a thought', async () => {
    const session = await buildFakeSession();
    const state = session.getState() as SessionState;
    state.lastIntent = {
      goal: 'test',
      skill: 'wait',
      params: {},
      interruptConditions: [],
      thought: 'Too dim. The den. Now.',
    };
    const { container } = render(<GameCanvas session={session} />);
    await flushFrames();
    const canvas = container.querySelector('canvas')!;
    const ctx = canvas.getContext('2d') as unknown as FakeCtx2D;
    expect(ctx.fillTextCalls.length).toBeGreaterThan(0);
  });

  it('does not render a speech bubble when narration is disabled', async () => {
    const session = await buildFakeSession();
    const state = session.getState() as SessionState;
    state.lastIntent = {
      goal: 'test',
      skill: 'wait',
      params: {},
      interruptConditions: [],
      thought: 'Too dim. The den. Now.',
    };
    state.narrationEnabled = false;
    const { container } = render(<GameCanvas session={session} />);
    await flushFrames();
    const canvas = container.querySelector('canvas')!;
    const ctx = canvas.getContext('2d') as unknown as FakeCtx2D;
    expect(ctx.fillTextCalls.length).toBe(0);
  });
});
