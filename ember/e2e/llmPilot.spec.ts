/**
 * EMBER — Claude (LLM) pilot Playwright specs (e2e/llmPilot.spec.ts).
 *
 * Drives the REAL browser path end to end (real app, real @anthropic-ai/sdk
 * browser client, real Controls.tsx UI, real session.ts wiring) but
 * route-intercepts `https://api.anthropic.com/**` via `page.route` so no
 * actual network call ever leaves the machine and no API key is required —
 * per the WF3 hard rule ("There is NO Anthropic API key in this environment.
 * Never attempt live API calls; all LLM-path testing is via the injectable
 * transport seam and Playwright route interception"). Every request that
 * would otherwise hit the real API is instead answered here by a small
 * in-spec responder that reads the intercepted request body and fabricates
 * a schema-valid `submit_intent` tool_use response.
 *
 * Conventions reused from e2e/smoke.spec.ts: `data-testid="tick-value"` for
 * "did the sim advance", `[aria-label="current intent"]` for the pilot
 * intent banner, `getByLabel('preset', ...)` for the preset picker. New
 * testids referenced here (all already present in src/ui/Controls.tsx from
 * the WF3 UI build): `llm-busy`, `llm-consult-count`, `llm-error-strip`,
 * `llm-status`, `llm-key-panel`.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const FAKE_API_KEY = 'sk-ant-e2e-fake-key-do-not-use-1234567890';

interface CapturedRequest {
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
  body: Record<string, unknown> | null;
}

interface InstalledRoute {
  requests: CapturedRequest[];
  count(): number;
  last(): CapturedRequest | undefined;
}

/**
 * Installs a fake `https://api.anthropic.com/v1/messages` responder.
 *   mode 'ok'           -> always returns a schema-valid tool_use response
 *                          (canned, cycling `submit_intent` inputs — always
 *                          a `wait` skill, which is unconditionally feasible,
 *                          so the banner deterministically reflects the
 *                          LLM's decision rather than an arbiter rejection).
 *   mode 'unauthorized' -> always returns HTTP 401 (Anthropic's own error
 *                          envelope shape), which the SDK turns into a real
 *                          `AuthenticationError` — exercising the actual
 *                          401 -> mapSdkError -> auth-latch path, not a
 *                          hand-rolled fake error.
 * `delayMs` (default 200) lets the UI's busy indicator become observable —
 * an instantly-resolved fake response can otherwise flip busy on/off within
 * a single React render pass.
 */
function installIntentRoute(
  page: Page,
  opts: { mode: 'ok' | 'unauthorized'; delayMs?: number },
): InstalledRoute {
  const requests: CapturedRequest[] = [];
  const delayMs = opts.delayMs ?? 200;

  const handler = async (route: Route) => {
    const req = route.request();
    const bodyText = req.postData();
    let body: Record<string, unknown> | null = null;
    try {
      body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    requests.push({ method: req.method(), headers: req.headers(), bodyText, body });

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (opts.mode === 'unauthorized') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      });
      return;
    }

    const n = requests.length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `msg_e2e_${n}`,
        type: 'message',
        role: 'assistant',
        model: (body?.model as string) ?? 'claude-sonnet-5',
        stop_reason: 'tool_use',
        stop_sequence: null,
        content: [
          {
            type: 'tool_use',
            id: `toolu_e2e_${n}`,
            name: 'submit_intent',
            input: {
              goal: `llm-e2e-fixture #${n}`,
              skill: 'wait',
              params: { flare: null },
              interruptConditions: ['threat_above_0.3'],
              thought: 'e2e',
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 40 },
      }),
    });
  };

  // Bound below to keep a stable reference in case a test wants to unroute.
  void page.route(ANTHROPIC_MESSAGES_URL, handler);

  return {
    requests,
    count: () => requests.length,
    last: () => requests[requests.length - 1],
  };
}

async function tickValue(page: Page): Promise<number> {
  const text = await page.getByTestId('tick-value').textContent();
  return Number.parseInt(text ?? '', 10);
}

async function selectPreset(page: Page, label: string): Promise<void> {
  await page.getByLabel('preset', { exact: true }).selectOption({ label });
}

/** Selects Claude, types the fake key, and clicks connect. Assumes the
 *  route is already installed (so the very first consultation, which can
 *  fire promptly once playing, is answered). */
async function connectClaude(page: Page, apiKey = FAKE_API_KEY): Promise<void> {
  await page.getByLabel('pilot selector', { exact: true }).selectOption('claude');
  await expect(page.getByTestId('llm-key-panel')).toBeVisible();
  await page.getByLabel('anthropic api key', { exact: true }).fill(apiKey);
  await page.getByRole('button', { name: 'connect', exact: true }).click();
}

test.describe('Claude pilot — request wiring and intent flow', () => {
  test('connecting and playing sends well-formed requests and flows intents through the UI', async ({
    page,
  }) => {
    await page.goto('/');
    // Day · Explore is calmer than the default night-defend preset (no
    // active wolf stalk), so pilot intents reliably reach the banner
    // without being pre-empted by a reflex intent (which would overwrite
    // our fixture's distinctive goal text with a `reflex:*` one).
    await selectPreset(page, 'Day · Explore');

    const claudeRoute = installIntentRoute(page, { mode: 'ok' });

    await connectClaude(page);
    await expect(page.getByTestId('llm-status')).toBeVisible();

    await page.getByRole('button', { name: 'play', exact: true }).click();

    // Busy indicator: with a real (delayed) consultation in flight, the
    // pulsing "consulting…" marker must appear at some point.
    await expect(page.getByTestId('llm-busy')).toBeVisible({ timeout: 10000 });

    // consultCount climbs as consultations complete.
    await expect
      .poll(async () => {
        const text = await page.getByTestId('llm-consult-count').textContent();
        return Number.parseInt((text ?? '#0').replace('#', ''), 10);
      }, { timeout: 10000 })
      .toBeGreaterThan(0);

    // The intent banner reflects the LLM's decision: our canned response is
    // always a `wait` skill with a distinctive goal string.
    const intentBanner = page.locator('[aria-label="current intent"]');
    await expect(intentBanner.getByText('skill: wait', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(intentBanner.getByText('llm-e2e-fixture', { exact: false })).toBeVisible({ timeout: 10000 });

    // consultCount keeps climbing over time (more than one real consultation
    // happened, not just the first).
    const firstCount = Number.parseInt(
      ((await page.getByTestId('llm-consult-count').textContent()) ?? '#0').replace('#', ''),
      10,
    );
    await expect
      .poll(async () => {
        const text = await page.getByTestId('llm-consult-count').textContent();
        return Number.parseInt((text ?? '#0').replace('#', ''), 10);
      }, { timeout: 10000 })
      .toBeGreaterThan(firstCount);

    // --------------------------------------------------------- request shape
    expect(claudeRoute.count()).toBeGreaterThan(0);
    const last = claudeRoute.last();
    if (!last || !last.body) throw new Error('expected at least one captured, JSON-parseable request');

    expect(last.body.model).toBe('claude-sonnet-5'); // DEFAULT_LLM_MODEL, left unselected in this test
    expect(last.body.thinking).toEqual({ type: 'disabled' });
    expect(last.body.tool_choice).toEqual({ type: 'tool', name: 'submit_intent' });
    expect('temperature' in last.body).toBe(false);
    expect('top_p' in last.body).toBe(false);
    expect('top_k' in last.body).toBe(false);

    const tools = last.body.tools as Array<{ name: string; strict: boolean }> | undefined;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(1);
    expect(tools?.[0]?.name).toBe('submit_intent');
    expect(tools?.[0]?.strict).toBe(true);

    // The key must appear ONLY in the x-api-key header — never in the
    // request body, and the UI's localStorage key name must never leak into
    // network traffic either.
    expect(last.headers['x-api-key']).toBe(FAKE_API_KEY);
    expect(last.headers['authorization']).toBeUndefined();
    expect(last.bodyText ?? '').not.toContain(FAKE_API_KEY);
    expect(last.bodyText ?? '').not.toContain('ember.anthropicKey');
    // No request captured (across the whole test) ever carried the key
    // anywhere but that one header.
    for (const r of claudeRoute.requests) {
      expect(r.bodyText ?? '').not.toContain(FAKE_API_KEY);
    }
  });
});

test.describe('Claude pilot — 401 handling', () => {
  test('an unauthorized key surfaces the error strip, the sim keeps running, and requests stop after one', async ({
    page,
  }) => {
    await page.goto('/');
    await selectPreset(page, 'Day · Explore');

    const claudeRoute = installIntentRoute(page, { mode: 'unauthorized', delayMs: 50 });

    await connectClaude(page);
    await page.getByRole('button', { name: 'play', exact: true }).click();

    const errorStrip = page.getByTestId('llm-error-strip');
    await expect(errorStrip).toBeVisible({ timeout: 10000 });
    await expect(errorStrip).toContainText('Invalid API key');
    // The raw 401 body text must never reach the UI (llm.ts/session.ts
    // deliberately discard it and substitute a fixed copy).
    await expect(errorStrip).not.toContainText('invalid x-api-key');

    // Sim keeps running: fallback `wait` intents still let the body/world
    // tick loop advance (reflexes still protect it — see llmContracts.ts's
    // pinned failure-fallback note).
    const tickBefore = await tickValue(page);
    await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(tickBefore);

    // No repeated hammering: the auth latch (src/pilot/llm.ts) means the
    // pilot instance never calls the transport again once 401'd. Count
    // route hits over one window, then confirm the count does NOT grow over
    // a second, equally long window even though the sim keeps ticking.
    await page.waitForTimeout(1000);
    const countAfterFirstWindow = claudeRoute.count();
    expect(countAfterFirstWindow).toBeGreaterThan(0);

    const tickMid = await tickValue(page);
    await page.waitForTimeout(2000);
    const tickAfterSecondWindow = await tickValue(page);
    expect(tickAfterSecondWindow).toBeGreaterThan(tickMid); // sim genuinely still advancing

    expect(claudeRoute.count()).toBe(countAfterFirstWindow); // but no new requests
  });
});

test.describe('Claude pilot — switching back to Scripted', () => {
  test('switching to Scripted mid-run stops consultations while the sim continues', async ({ page }) => {
    await page.goto('/');
    await selectPreset(page, 'Day · Explore');

    const claudeRoute = installIntentRoute(page, { mode: 'ok' });

    await connectClaude(page);
    await page.getByRole('button', { name: 'play', exact: true }).click();

    await expect
      .poll(() => claudeRoute.count(), { timeout: 10000 })
      .toBeGreaterThan(0);

    // Switch back to Scripted — per Controls.tsx this applies immediately,
    // no key/connect step needed.
    await page.getByLabel('pilot selector', { exact: true }).selectOption('scripted');
    await expect(page.getByTestId('llm-status')).toHaveCount(0);
    await expect(page.getByTestId('llm-key-panel')).toHaveCount(0);

    const countAtSwitch = claudeRoute.count();
    const tickAtSwitch = await tickValue(page);

    // Sim keeps advancing under ScriptedPilot...
    await expect.poll(() => tickValue(page), { timeout: 5000 }).toBeGreaterThan(tickAtSwitch);

    // ...but no further Anthropic requests are ever made again.
    await page.waitForTimeout(2000);
    expect(claudeRoute.count()).toBe(countAtSwitch);
  });
});
