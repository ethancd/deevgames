import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import type { GameState } from '../src/game/types';

/**
 * DESIGN §6.1/§6.2, M3: end-to-end coverage for the whole-turn worker path
 * (protocol 3) — a real game completes with turn-mode requests actually being
 * sent, and an injected mid-plan divergence falls back to the per-action loop
 * instead of crashing or hanging (§6.4 layer for the v2/JS path: an illegal
 * proposal, not a replica mismatch, since there is no replica yet).
 *
 * The Hard cases at the bottom are the E6 release (DESIGN §6.4's `hardEnabled`,
 * true as of 2026-09-18): difficulty `hard` really does run `HardEngine` in the
 * worker WITH NO OPT-IN AT ALL, an invalid suffix injected into one of its
 * plans is counted on `window.__mujuHardDiag` and recovered from legally, and
 * `?hardAi=0` still routes Hard back to the legacy `AIEngineV2`. The first two
 * cases are unchanged and still prove that easy/medium never send an `engine`
 * field and never load `HardEngine`.
 */

interface RecordedRequest { mode?: string; engine?: string; decisionMs?: number }
interface RecordedResponse { type?: string; engineUsed?: string; fallback?: string }
interface InstrumentOptions {
  /** Prepend one clearly illegal action to the first plan of this shape. */
  inject?: 'none' | 'v2' | 'hard';
  /** Rewrite every request's `decisionMs` (see the note on the Hard cases). */
  budgetMs?: number;
}

/**
 * Wraps `window.Worker` before the app loads so every posted `SearchRequest`
 * is recorded on `window.__mujuRequests` and every reply on
 * `window.__mujuResponses`, and — when `inject` names a plan shape — the
 * first reply carrying a non-empty plan of that shape gets one clearly
 * illegal action inserted before it reaches the client. Pure test-harness
 * instrumentation: no production code changes.
 */
async function instrumentWorker(page: Page, options: InstrumentOptions = {}): Promise<void> {
  await page.addInitScript((opts: InstrumentOptions) => {
    const inject = opts.inject ?? 'none';
    const win = window as unknown as { __mujuRequests: RecordedRequest[]; __mujuResponses: RecordedResponse[] };
    win.__mujuRequests = [];
    win.__mujuResponses = [];
    let injected = false;
    // Patch `Worker.prototype` in place — no subclassing, so `new Worker(...)`
    // (`worker/client.ts`'s `createWorker`) is untouched apart from these two
    // accessors/methods, wrapped on every instance.
    const proto = window.Worker.prototype as unknown as Record<string, unknown>;
    const origPostMessage = proto.postMessage as (this: Worker, message: unknown, transfer?: unknown) => void;
    proto.postMessage = function (this: Worker, message: unknown, transfer?: unknown) {
      const req = message as RecordedRequest;
      // Shrinking the per-turn allowance keeps a REAL `HardEngine` search
      // inside an e2e's patience: the Hard seat is funded with the pace the
      // player picked (`src/ai/turnTime.ts`, 10 s at the default `quick` and
      // 60 s at `deep`), and the engine spends what it is given — the work
      // ladder reaches far enough for all three. It changes only how long the
      // engine thinks, never which engine answers or how the result is
      // handled, which is what these cases are about. Device-profile budgets
      // and latency are E5.3's subject, measured on real hardware.
      if (opts.budgetMs !== undefined && req && typeof req.decisionMs === 'number') req.decisionMs = opts.budgetMs;
      win.__mujuRequests.push({ mode: req?.mode, engine: req?.engine, decisionMs: req?.decisionMs });
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
            const data = event.data as { type?: string; engineUsed?: string; result?: { turnActions?: unknown[]; actions?: unknown[]; fallback?: string } };
            if (data?.type !== 'progress') win.__mujuResponses.push({ type: data?.type, engineUsed: data?.engineUsed, fallback: data?.result?.fallback });
            // The hard engine answers with `type:'turn'` and `result.actions`;
            // the v2 turn path with `type:'result'` and `result.turnActions`.
            if (inject === 'hard' && !injected && data?.type === 'turn' && Array.isArray(data.result?.actions) && data.result!.actions!.length > 0) {
              injected = true;
              const corrupted = {
                ...data,
                result: { ...data.result, actions: [{ type: 'MOVE', unitId: '__does-not-exist__', to: { x: 0, y: 0 } }, ...data.result!.actions!] },
              };
              (fn as (e: unknown) => void).call(this, { ...event, data: corrupted });
              return;
            }
            if (inject === 'v2' && !injected && data?.type === 'result' && Array.isArray(data.result?.turnActions) && data.result!.turnActions!.length > 0) {
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
  }, options);
}

async function start(page: Page, state: GameState, watch: boolean, difficulty: 'easy' | 'medium' | 'hard', query = ''): Promise<void> {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: 6, timestamp: Date.now(), state: saved })), state);
  // `query` is the page URL's own opt-out / budget override (`?hardAi=0`,
  // `?hardMs=<int>`). Nothing is set by default: the release flag is what
  // turns Hard on now.
  await page.goto(`./${query}`);
  await page.getByRole('button', { name: watch ? 'Watch AI Spectate AI vs AI match' : 'vs AI Play against the computer', exact: true }).click();
  for (const select of await page.locator('select').filter({ has: page.locator(`option[value="${difficulty}"]`) }).all()) await select.selectOption(difficulty);
  await page.getByRole('button', { name: /Continue saved game/ }).click();
}

async function requestModes(page: Page): Promise<RecordedRequest[]> {
  return page.evaluate(() => (window as unknown as { __mujuRequests: RecordedRequest[] }).__mujuRequests);
}

async function responses(page: Page): Promise<RecordedResponse[]> {
  return page.evaluate(() => (window as unknown as { __mujuResponses: RecordedResponse[] }).__mujuResponses);
}

/** E5.1's observable failure counters (`src/ai/hardOptIn.ts`). */
async function hardDiag(page: Page): Promise<Record<string, number | boolean | string | null> | undefined> {
  return page.evaluate(() => (window as unknown as { __mujuHardDiag?: Record<string, number | boolean | string | null> }).__mujuHardDiag);
}

async function savedTurnNumber(page: Page): Promise<number> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('elemental-tactics-save')!) as { state: GameState }).state.turn.turnNumber);
}

test('watch-mode game advances multiple turns through the whole-turn worker path', async ({ page }) => {
  await instrumentWorker(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, createInitialGameState(), true, 'medium');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('elemental-tactics-save')!) as { state: GameState };
    return saved.state.turn.turnNumber;
  }), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const requests = await requestModes(page);
  expect(requests.some(r => r.mode === 'turn')).toBe(true);
  // THE PUBLIC DEFAULT. Without E5.1's opt-in the hook sets no `engine` at
  // all, so every request resolves to v2 and `HardEngine` is never even
  // imported into the worker.
  expect(requests.every(r => r.engine === undefined)).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an injected mid-plan illegal action falls back to the per-action loop instead of crashing', async ({ page }) => {
  await instrumentWorker(page, { inject: 'v2' });
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

/**
 * The release proof: difficulty `hard` is the ONLY difference from the first
 * case — same app, same save, no opt-in, nothing in localStorage.
 */
test('difficulty hard runs HardEngine in the worker with no opt-in at all', async ({ page }) => {
  test.setTimeout(120_000);
  await instrumentWorker(page, { budgetMs: 400 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, createInitialGameState(), true, 'hard');
  await expect.poll(() => savedTurnNumber(page), { timeout: 90_000 }).toBeGreaterThanOrEqual(2);

  const requests = await requestModes(page);
  const replies = await responses(page);
  // The request asked for the hard engine, and the worker's own reply says the
  // hard engine is what answered it — not a v2 turn wearing the same wire shape.
  expect(requests.some(r => r.mode === 'turn' && r.engine === 'hard')).toBe(true);
  expect(replies.some(r => r.type === 'turn' && r.engineUsed === 'hard')).toBe(true);
  const diag = await hardDiag(page);
  expect(diag?.optIn).toBe(true);
  expect(diag?.hardTurns as number).toBeGreaterThan(0);
  expect(diag?.plansReplayed as number).toBeGreaterThan(0);
  // A completed turn means the plan replayed through the canonical
  // `isLegalAction`/`applyAction` path, action by action, with no divergence.
  expect(diag?.invalidSuffix).toBe(0);
  expect(diag?.packError).toBe(0);
  expect(diag?.engineError).toBe(0);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

/**
 * The invalid-suffix case, on the hard route: the same injection the v2 case
 * above uses, aimed at a `type:'turn'` plan. The counter must move and the
 * game must carry on legally — a graceful fallback that nobody could see
 * afterwards is exactly what EPIC-PLAN §3 forbids.
 */
test('an illegal action injected into a Hard plan is counted and recovered from legally', async ({ page }) => {
  test.setTimeout(120_000);
  await instrumentWorker(page, { inject: 'hard', budgetMs: 400 });
  const s = createInitialGameState();
  s.turn.currentPlayer = 'black';
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, s, false, 'hard');
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('elemental-tactics-save')!) as { state: GameState };
    return saved.state.turn.currentPlayer;
  }), { timeout: 90_000 }).toBe('white');

  const diag = await hardDiag(page);
  expect(diag?.invalidSuffix).toBe(1);
  expect(diag?.fallbacks as number).toBeGreaterThanOrEqual(1);
  const requests = await requestModes(page);
  // The hard whole-turn attempt, then the v2 per-action loop for the rest of
  // the turn (mode absent ≡ 'action'), on the same turn allowance.
  expect(requests.some(r => r.mode === 'turn' && r.engine === 'hard')).toBe(true);
  expect(requests.some(r => r.mode === undefined)).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('AI proposed an invalid action', { exact: false })).toHaveCount(0);
});

/**
 * The opt-out. Same app, same save, same difficulty as the release case above:
 * `?hardAi=0` is the only difference, and it must put the Hard seat back on
 * `AIEngineV2` — no `engine` field on any request, no `HardEngine` chunk, and
 * a diagnostics object that says so.
 */
test('?hardAi=0 routes difficulty hard back to the legacy AIEngineV2', async ({ page }) => {
  test.setTimeout(120_000);
  await instrumentWorker(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, createInitialGameState(), true, 'hard', '?hardAi=0');
  await expect.poll(() => savedTurnNumber(page), { timeout: 90_000 }).toBeGreaterThanOrEqual(2);

  const requests = await requestModes(page);
  const replies = await responses(page);
  expect(requests.some(r => r.mode === 'turn')).toBe(true);
  expect(requests.every(r => r.engine === undefined)).toBe(true);
  expect(replies.every(r => r.engineUsed !== 'hard')).toBe(true);
  const diag = await hardDiag(page);
  // The counters exist (the module loaded and resolved the route) and say the
  // hard route was not taken.
  expect(diag?.optIn).toBe(false);
  expect(diag?.requests).toBe(0);
  expect(diag?.hardTurns).toBe(0);
  expect(diag?.fallbacks).toBe(0);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

/**
 * `?hardMs` — the page-URL override of the Hard seat's whole-turn budget. What
 * it overrides is now the PLAYER's own choice of thinking time
 * (`src/ai/turnTime.ts`: Hard is 10 s `quick`, 30 s `normal`, 60 s `deep`,
 * where the E6 release measured a single 8000 at `wall:8000`); this is what a
 * demo or a measurement run uses to ask for less, and it is the `decisionMs`
 * the worker is actually handed.
 */
test('?hardMs funds the hard turn, clamped, without touching the engine route', async ({ page }) => {
  test.setTimeout(120_000);
  await instrumentWorker(page);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page, createInitialGameState(), true, 'hard', '?hardMs=1200');
  await expect.poll(() => savedTurnNumber(page), { timeout: 90_000 }).toBeGreaterThanOrEqual(2);

  const requests = await requestModes(page);
  const hardRequests = requests.filter(r => r.mode === 'turn' && r.engine === 'hard');
  expect(hardRequests.length).toBeGreaterThan(0);
  // The first whole-turn request of a turn is funded by the override, never by
  // the shipped 8000; a mid-turn re-request draws on what is left of it.
  expect(hardRequests.some(r => r.decisionMs === 1200)).toBe(true);
  for (const request of hardRequests) expect(request.decisionMs!).toBeLessThanOrEqual(1200);
  const diag = await hardDiag(page);
  expect(diag?.optIn).toBe(true);
  expect(diag?.hardTurns as number).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
