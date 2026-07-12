/**
 * EMBER — deterministic money-shot capture (e2e/capture.spec.ts).
 *
 * Stages the two canonical demo compositions (VISUAL_TARGET.md /
 * reference/*.png) via the real app + real seeded presets, plays each until
 * the target condition is visibly true in the DOM, pauses, and screenshots
 * the full page to ember/screenshots/. Polling (expect(...).toBeVisible with
 * a generous timeout) makes this tolerant of exact-tick nondeterminism in
 * how many ticks it takes to reach the target state, while the presets
 * themselves (src/ui/presets.ts) are seeded so the compositions match the
 * reference renders' content (dim ember + stalking wolf at night; bright
 * ember + open daylight).
 */

import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');

test.use({ viewport: { width: 1600, height: 900 } });

test.beforeAll(() => {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

async function selectPreset(page: import('@playwright/test').Page, label: string): Promise<void> {
  await page.getByLabel('preset', { exact: true }).selectOption({ label });
}

test('night-defend: DEFEND mode + wolf STALK, captured to night-defend.png', async ({ page }) => {
  await page.goto('/');
  await selectPreset(page, 'Night · Defend'); // default preset already, explicit for clarity/determinism
  await page.getByRole('button', { name: 'play', exact: true }).click();

  const groundTruth = page.locator('section[aria-label="Ground truth (dev)"]');
  await expect(groundTruth.getByText('DEFEND', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(groundTruth.getByText('wolf: STALK', { exact: true })).toBeVisible({ timeout: 20000 });

  // The staged encounter reaches DEFEND + wolf:STALK within ~2 ticks of
  // play, which is far too little elapsed time for the ground-truth
  // sparklines (sampled every 2 ticks, src/ui/session.ts) to show any real
  // history — capturing immediately produces an empty/single-point
  // sparkline even though the renderer itself is correct. Let a modest
  // amount of extra real 1x play (~10 ticks, ~5 sparkline samples)
  // accumulate before pausing. Deliberately NOT a long wait: the preset's
  // staged distance keeps the wolf in STALK for ~60 ticks before
  // ATTACK/FLEE, but the fleeing ember reaches the den (staged on the same
  // map edge, for a short deterministic flee leg) in well under that —
  // waiting too long here both pushes the wolf out of the DEFEND-mode
  // follow camera's tighter frame and empties the route line (arrived, no
  // path left to draw).
  await page.waitForTimeout(1200);
  await expect(groundTruth.getByText('DEFEND', { exact: true })).toBeVisible();
  await expect(groundTruth.getByText('wolf: STALK', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'pause', exact: true }).click();
  // Let the paused rAF loop settle on a clean frame (flicker/spark phase is
  // real-time and cosmetic only — this doesn't touch sim state).
  await page.waitForTimeout(150);

  const dest = path.join(SCREENSHOTS_DIR, 'night-defend.png');
  await page.screenshot({ path: dest, fullPage: true });
});

test('day-explore: EXPLORE mode + move_to intent, captured to day-explore.png', async ({ page }) => {
  await page.goto('/');
  await selectPreset(page, 'Day · Explore');
  await page.getByRole('button', { name: 'play', exact: true }).click();

  const groundTruth = page.locator('section[aria-label="Ground truth (dev)"]');
  await expect(groundTruth.getByText('EXPLORE', { exact: true })).toBeVisible({ timeout: 20000 });

  const intentBanner = page.locator('[aria-label="current intent"]');
  await expect(intentBanner.getByText('move_to', { exact: false })).toBeVisible({ timeout: 20000 });

  // Same reasoning as the night-defend capture above: the first move_to
  // intent lands within the first tick of play, too little elapsed time for
  // the ground-truth sparklines to show anything. Deliberately a short
  // extra wait rather than a long one, though: ScriptedPilot's explore
  // waypoint sequence for this staged seed eventually lands on a dest
  // inside the pond around tick+14 of play and gets stuck re-issuing the
  // same unreachable move_to (a pilot-side quirk, not a rendering bug) —
  // which would otherwise leave the display path empty and defeat the
  // point of this capture. A short wait stays inside the first couple of
  // genuinely-reachable explore legs.
  await page.waitForTimeout(900);
  await expect(groundTruth.getByText('EXPLORE', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'pause', exact: true }).click();
  await page.waitForTimeout(150);

  const dest = path.join(SCREENSHOTS_DIR, 'day-explore.png');
  await page.screenshot({ path: dest, fullPage: true });
});
