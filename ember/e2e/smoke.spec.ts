/**
 * EMBER — Playwright e2e smoke specs (e2e/smoke.spec.ts).
 *
 * Drives the real app (real ScriptedPilot, real createSim, real GameCanvas
 * rAF loop) through a Chromium browser against the dev server started by
 * playwright.config.ts's webServer. No mocking: every assertion here is
 * against the actual rendered DOM/canvas the demo would show.
 *
 * Conventions used throughout:
 *   - `data-testid="tick-value"` (added to src/ui/Controls.tsx by this
 *     integrate pass — no visible tick readout existed before) is the
 *     source of truth for "did the sim advance".
 *   - Mode chip / wolf FSM line live in the GroundTruthPanel (dev toggle ON
 *     by default), selected by their aria-label="Ground truth (dev)"
 *     section and plain text content ("DEFEND"/"EXPLORE", "wolf: STALK").
 *   - The pilot intent banner (aria-label="current intent") carries the
 *     narration-gated `goal` text and the skill/params summary used to spot
 *     a move_to intent.
 *   - Downloads go through a real Blob <a download> click; uploads go
 *     through the real hidden <input type=file> — both exercised as an
 *     actual user would (no calling session.exportReplay() directly).
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function tickValue(page: Page): Promise<number> {
  const text = await page.getByTestId('tick-value').textContent();
  return Number.parseInt(text ?? '', 10);
}

async function selectPreset(page: Page, label: string): Promise<void> {
  await page.getByLabel('preset', { exact: true }).selectOption({ label });
}

test.describe('app boot', () => {
  test('loads the app and shows the EMBER title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('EMBER');
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('canvas element is present and not blank', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Give the rAF loop a couple of frames to actually paint (the default
    // preset is night-defend, which is already a fully staged, non-empty
    // scene from tick 0 of the page load — no play() needed).
    await page.waitForTimeout(150);

    const stats = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return { total: 0, nonBackground: 0 };
      const { width, height } = el;
      const { data } = ctx.getImageData(0, 0, width, height);
      // Background sample from the corner (outside the ember's glow / any
      // terrain variation in the vignetted night frame).
      const bg = [data[0], data[1], data[2]];
      let nonBackground = 0;
      const total = width * height;
      for (let i = 0; i < data.length; i += 4) {
        const dr = Math.abs(data[i] - bg[0]);
        const dg = Math.abs(data[i + 1] - bg[1]);
        const db = Math.abs(data[i + 2] - bg[2]);
        if (dr + dg + db > 24) nonBackground++;
      }
      return { total, nonBackground };
    });

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.nonBackground / stats.total).toBeGreaterThan(0.05);
  });
});

test.describe('transport controls', () => {
  test('play advances the tick display; pause stops it; step advances by exactly 1', async ({ page }) => {
    await page.goto('/');

    const before = await tickValue(page);
    await page.getByRole('button', { name: 'step', exact: true }).click();
    await expect(page.getByTestId('tick-value')).toHaveText(String(before + 1));

    const afterStep = await tickValue(page);
    await page.getByRole('button', { name: 'play', exact: true }).click();
    await expect
      .poll(async () => tickValue(page), { timeout: 5000 })
      .toBeGreaterThan(afterStep);

    await page.getByRole('button', { name: 'pause', exact: true }).click();
    const paused = await tickValue(page);
    // Sample a few times over a real interval — a still-running timer would
    // keep incrementing the tick; a genuinely paused one won't.
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(200);
      expect(await tickValue(page)).toBe(paused);
    }
  });

  test('4x speed advances more ticks than 1x over the same wall-clock window', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '1×', exact: true }).click();
    const start1x = await tickValue(page);
    await page.getByRole('button', { name: 'play', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'pause', exact: true }).click();
    const delta1x = (await tickValue(page)) - start1x;

    await page.getByRole('button', { name: '4×', exact: true }).click();
    const start4x = await tickValue(page);
    await page.getByRole('button', { name: 'play', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'pause', exact: true }).click();
    const delta4x = (await tickValue(page)) - start4x;

    expect(delta1x).toBeGreaterThan(0);
    expect(delta4x).toBeGreaterThan(delta1x * 1.5);
  });
});

test.describe('presets', () => {
  test('night-defend reaches DEFEND', async ({ page }) => {
    await page.goto('/');
    await selectPreset(page, 'Night · Defend');
    await page.getByRole('button', { name: 'play', exact: true }).click();

    const groundTruth = page.locator('section[aria-label="Ground truth (dev)"]');
    await expect(groundTruth.getByText('DEFEND', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('day-explore reaches EXPLORE', async ({ page }) => {
    await page.goto('/');
    await selectPreset(page, 'Day · Explore');
    await page.getByRole('button', { name: 'play', exact: true }).click();

    const groundTruth = page.locator('section[aria-label="Ground truth (dev)"]');
    await expect(groundTruth.getByText('EXPLORE', { exact: true })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('panel toggles', () => {
  test('ground-truth toggle hides and shows the dev panel', async ({ page }) => {
    await page.goto('/');
    const groundTruth = page.locator('section[aria-label="Ground truth (dev)"]');
    await expect(groundTruth).toBeVisible();

    await page.getByLabel('ground truth dev panel').uncheck();
    await expect(groundTruth).toHaveCount(0);

    await page.getByLabel('ground truth dev panel').check();
    await expect(groundTruth).toBeVisible();
  });

  test('narration toggle removes the goal text (pilot panel) and the speech bubble (canvas)', async ({
    page,
  }) => {
    await page.goto('/'); // default preset (night-defend) reliably yields a thought+goal quickly
    await page.getByRole('button', { name: 'play', exact: true }).click();

    const intentBanner = page.locator('[aria-label="current intent"]');
    // Wait for a real pilot consultation to land a goal string into the banner.
    await expect(intentBanner.locator('p')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'pause', exact: true }).click();

    // Cream speech-bubble background (#f4ecd8) is a distinctive light color
    // against this scene's dark/warm palette — count near-white/cream
    // pixels in the canvas as a proxy for "bubble currently drawn". Ember
    // flicker/spark colors (orange/red family) never land in this range,
    // so the count is a reliable presence signal independent of animation
    // phase.
    const canvas = page.locator('canvas');
    async function creamPixelCount(): Promise<number> {
      return canvas.evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext('2d');
        if (!ctx) return 0;
        const { width, height } = el;
        const { data } = ctx.getImageData(0, 0, width, height);
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 220 && g > 210 && b > 190 && Math.abs(r - g) < 30 && Math.abs(g - b) < 40) count++;
        }
        return count;
      });
    }

    await expect(intentBanner.locator('p')).toBeVisible();
    const withNarration = await creamPixelCount();
    expect(withNarration).toBeGreaterThan(20);

    await page.getByLabel('narration', { exact: true }).uncheck();
    await expect(intentBanner.locator('p')).toHaveCount(0);
    await page.waitForTimeout(150); // let a couple of rAF frames redraw without the bubble
    const withoutNarration = await creamPixelCount();
    expect(withoutNarration).toBeLessThan(withNarration * 0.3);
  });
});

test.describe('replay', () => {
  test('download replay -> restart -> upload -> same tick sequence resumes', async ({ page }) => {
    await page.goto('/');

    const STEPS = 6;
    for (let i = 0; i < STEPS; i++) {
      await page.getByRole('button', { name: 'step', exact: true }).click();
    }
    const tickAfterOriginal = await tickValue(page);

    const eventTicker = page.locator('section[aria-label="Event log"]');
    const originalEventsText = await eventTicker.getByRole('list', { name: 'recent events' }).innerText();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '↓ replay', exact: true }).click(),
    ]);
    const replayPath = await download.path();
    if (!replayPath) throw new Error('expected a saved download path');
    const replayJson = readFileSync(replayPath, 'utf-8');
    JSON.parse(replayJson); // sanity: it's valid JSON before we round-trip it back in

    // Reset to the SAME seed/preset (restart() with no args keeps both) so
    // the replay resumes from the same staged starting point.
    await page.getByRole('button', { name: 'restart', exact: true }).click();
    await expect(page.getByTestId('tick-value')).not.toHaveText(String(tickAfterOriginal));

    await page.getByLabel('load replay file').setInputFiles(replayPath);

    for (let i = 0; i < STEPS; i++) {
      await page.getByRole('button', { name: 'step', exact: true }).click();
    }
    await expect(page.getByTestId('tick-value')).toHaveText(String(tickAfterOriginal));

    const replayedEventsText = await eventTicker.getByRole('list', { name: 'recent events' }).innerText();
    expect(replayedEventsText).toBe(originalEventsText);
  });
});
