import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import type { GameState } from '../src/game/types';

/**
 * DESIGN §6.1/§6.2, M3: end-to-end coverage for the whole-turn worker path
 * (protocol 3) — a real game completes with turn-mode requests actually being
 * sent, and an injected mid-plan divergence falls back to the per-action loop
 * instead of crashing or hanging (§6.4 layer for the v2/JS path: an illegal
 * proposal, not a replica mismatch, since there is no replica yet).
 */

/**
 * Wraps `window.Worker` before the app loads so every posted `SearchRequest`
 * is recorded on `window.__mujuRequests`, and — when `injectDivergence` is
 * set — the first `type:'result'` reply that carries a non-empty
 * `turnActions` gets one clearly illegal action appended before it reaches
 * the client. Pure test-harness instrumentation: no production code changes.
 */
async function instrumentWorker(page: Page, injectDivergence = false): Promise<void> {
  await page.addInitScript((inject: boolean) => {
    const win = window as unknown as { __mujuRequests: Array<{ mode?: string; engine?: string }> };
    win.__mujuRequests = [];
    let injected = false;
    // Patch `Worker.prototype` in place — no subclassing, so `new Worker(...)`
    // (`worker/client.ts`'s `createWorker`) is untouched apart from these two
    // accessors/methods, wrapped on every instance.
    const proto = window.Worker.prototype as unknown as Record<string, unknown>;
    const origPostMessage = proto.postMessage as (this: Worker, message: unknown, transfer?: unknown) => void;
    proto.postMessage = function (this: Worker, message: unknown, transfer?: unknown) {
      const req = message as { mode?: string; engine?: string };
      win.__mujuRequests.push({ mode: req?.mode, engine: req?.engine });
      return origPostMessage.call(this, message, transfer);
    };
    let onmessageDescriptor: PropertyDescriptor | undefined;
    for (let p: object | null = proto; p && !onmessageDescriptor; p = Object.getPrototypeOf(p)) {
      onmessageDescriptor = Object.getOwnPropertyDescriptor(p, 'onmessage');
    }
    if (onmessageDescriptor?.get && onmessageDescriptor.set) {
      const realGet = onmessageDescriptor.get, realSet = onmessageDescriptor.set;
      Object.defineProperty(proto, 'onmessage', {
        configurable: true,
        get(this: Worker) { return realGet.call(this); },
        set(this: Worker, fn: ((event: MessageEvent) => void) | null) {
          if (fn === null) { realSet.call(this, null); return; }
          const wrapped = (event: MessageEvent) => {
            const data = event.data as { type?: string; result?: { turnActions?: unknown[] } };
            if (inject && !injected && data?.type === 'result' && Array.isArray(data.result?.turnActions) && data.result!.turnActions!.length > 0) {
              injected = true;
              // Inserted first, not appended: `turnActions` is typically the
              // plan's ENTIRE remaining turn (through its own phase-ending
              // action), so an action appended past the end would never be
              // reached — the dispatch loop stops as soon as the turn is
              // over, before ever looking past it.
              const corrupted = {
                ...data,
                result: { ...data.result, turnActions: [{ type: 'MOVE', unitId: '__does-not-exist__', to: { x: 0, y: 0 } }, ...data.result!.turnActions!] },
              };
              (fn as (e: unknown) => void).call(this, { ...event, data: corrupted });
              return;
            }
            fn.call(this, event);
          };
          realSet.call(this, wrapped);
        },
      });
    }
  }, injectDivergence);
}

async function start(page: Page, state: GameState, watch: boolean, difficulty: 'easy' | 'medium' | 'hard'): Promise<void> {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: 6, timestamp: Date.now(), state: saved })), state);
  await page.goto('./');
  await page.getByRole('button', { name: watch ? 'Watch AI Spectate AI vs AI match' : 'vs AI Play against the computer', exact: true }).click();
  for (const select of await page.locator('select').filter({ has: page.locator(`option[value="${difficulty}"]`) }).all()) await select.selectOption(difficulty);
  await page.getByRole('button', { name: /Continue saved game/ }).click();
}

async function requestModes(page: Page): Promise<Array<{ mode?: string; engine?: string }>> {
  return page.evaluate(() => (window as unknown as { __mujuRequests: Array<{ mode?: string; engine?: string }> }).__mujuRequests);
}

test('watch-mode game advances multiple turns through the whole-turn worker path', async ({ page }) => {
  await instrumentWorker(page, false);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, createInitialGameState(), true, 'medium');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('elemental-tactics-save')!) as { state: GameState };
    return saved.state.turn.turnNumber;
  }), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const requests = await requestModes(page);
  expect(requests.some(r => r.mode === 'turn')).toBe(true);
  // Every request in this milestone resolves to the v2 engine (no `hard`
  // routing exists until M15); the client never sets `engine` explicitly.
  expect(requests.every(r => r.engine === undefined)).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an injected mid-plan illegal action falls back to the per-action loop instead of crashing', async ({ page }) => {
  await instrumentWorker(page, true);
  const s = createInitialGameState();
  s.turn.currentPlayer = 'black';
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, s, false, 'medium');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('elemental-tactics-save')!) as { state: GameState };
    return saved.state.turn.currentPlayer;
  }), { timeout: 30_000 }).toBe('white');
  const requests = await requestModes(page);
  // At least the initial whole-turn attempt, and at least one per-action
  // fallback request (mode absent ≡ 'action') once the injected action lands.
  expect(requests.some(r => r.mode === 'turn')).toBe(true);
  expect(requests.some(r => r.mode === undefined)).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('AI proposed an invalid action', { exact: false })).toHaveCount(0);
});
