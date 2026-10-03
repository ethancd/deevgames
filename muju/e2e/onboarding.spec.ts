// Deliberately NOT './fixtures': these start as a first-time visitor.
import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';

const KEY = 'muju:onboarding:v1';
const cell = (page: Page, x: number, y: number) => page.locator(`[data-testid="cell-${x}-${y}"]`).last();
const flag = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);
const puzzle = (page: Page) => page.locator('main.onboarding').getAttribute('data-puzzle');

async function solve(page: Page, piece: [number, number], target: [number, number], id: string) {
  await expect(page.locator(`.puzzle-${id}[data-phase="hint-piece"]`)).toBeVisible();
  await cell(page, ...piece).click();
  await expect(page.locator(`.puzzle-${id}[data-phase="hint-target"]`)).toBeVisible();
  await cell(page, ...target).click();
  await expect(page.getByTestId('tutorial-reveal')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('tutorial-reveal').click();
}

async function playThrough(page: Page) {
  await solve(page, [0, 0], [2, 2], 'muju');
  await solve(page, [1, 1], [4, 4], 'hono');
  await solve(page, [9, 1], [9, 9], 'irumbu');
}

test('a first visit plays three puzzles, assembles the title and lands on the three-button screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('main.onboarding')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(9);
  await expect(page.getByTestId('tutorial-narration')).toContainText('Tap the Muju');
  // The idle hint demonstrates the tap.
  await expect(page.getByTestId('ghost-pointer')).toBeVisible({ timeout: 4000 });
  await solve(page, [0, 0], [2, 2], 'muju');
  // The pulled-back board keeps the Muju where it finished and the mined corner at 8 − 3.
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(36);
  await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /white Muju/);
  await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /5 crystals/);
  await solve(page, [1, 1], [4, 4], 'hono');
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(100);
  await solve(page, [9, 1], [9, 9], 'irumbu');
  await expect(page.locator('.onboarding-title.assembled')).toHaveText(/Muju\s*Hono\s*Irumbu/);
  for (const name of ['Play vs AI', 'Play online', 'Puzzles']) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('button', { name: /Pass & Play/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /MICRO MUJU/ })).toBeVisible();
  expect(await flag(page)).toMatchObject({ completed: true, version: 1 });
  expect(errors).toEqual([]);
  // A return visit goes straight to the mode screen.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page.locator('main.onboarding')).toHaveCount(0);
});

test('wrong taps shake and never advance; inert pieces ignore taps', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-muju[data-phase="hint-piece"]')).toBeVisible();
  await cell(page, 2, 2).click();
  await cell(page, 1, 0).click();
  await expect(page.locator('.puzzle-muju')).toHaveAttribute('data-phase', 'hint-piece');
  await expect(page.locator('.tutorial-wrong')).toHaveCount(1);
  await cell(page, 0, 0).click();
  await cell(page, 1, 1).click();
  await expect(page.locator('.puzzle-muju')).toHaveAttribute('data-phase', 'hint-target');
  await cell(page, 2, 2).click();
  await page.getByTestId('tutorial-reveal').click();
  await expect(page.locator('.puzzle-hono[data-phase="hint-piece"]')).toBeVisible();
  // The dimmed Muju from puzzle 1 is scenery now.
  await cell(page, 2, 2).click();
  await expect(page.locator('.tutorial-wrong')).toHaveCount(0);
  await cell(page, 4, 4).click();
  await expect(page.locator('.puzzle-hono')).toHaveAttribute('data-phase', 'hint-piece');
  expect(await puzzle(page)).toBe('hono');
});

test('Skip sets the flag and shows the mode screen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  expect(await flag(page)).toMatchObject({ completed: true, version: 1 });
});

test('?tutorial=1 and the Replay link replay it for a returning player', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ completed: true, at: '2026-10-02T00:00:00Z', version: 1 })), KEY);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await expect(page.locator('main.onboarding')).toBeVisible();
  await page.goto('./?tutorial=1');
  await expect(page.locator('main.onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).not.toHaveURL(/tutorial=1/);
});

test('deep links, rooms and saved games are never gated', async ({ page }) => {
  await page.goto('./?online=1');
  await expect(page.locator('main.onboarding')).toHaveCount(0);
  await page.goto('micro/');
  await expect(page.locator('main.onboarding')).toHaveCount(0);
  await page.goto('analysis');
  await expect(page.locator('main.onboarding')).toHaveCount(0);
  expect(await flag(page)).toBeNull();
});

test('a player with a saved game sees the mode screen, not the tutorial', async ({ page }) => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  await page.addInitScript(({ state, schemaVersion }) => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion, timestamp: Date.now(), state })), { state, schemaVersion: SCHEMA_VERSION });
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page.locator('main.onboarding')).toHaveCount(0);
});

test('reduced motion completes the whole flow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await playThrough(page);
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible({ timeout: 6000 });
  expect(await flag(page)).toMatchObject({ completed: true });
});

test('keyboard users can finish a puzzle: focus follows the next square', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-muju[data-phase="hint-piece"]')).toBeVisible();
  await expect(cell(page, 0, 0)).toBeFocused({ timeout: 3000 });
  await page.keyboard.press('Enter');
  await expect(cell(page, 2, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tutorial-reveal')).toBeVisible({ timeout: 5000 });
});

test('Puzzles lists every scenario and replays one with its reveal', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ completed: true, at: '2026-10-02T00:00:00Z', version: 1 })), KEY);
  await page.goto('./');
  await page.getByRole('button', { name: /^Puzzles/ }).click();
  for (const word of ['Muju', 'Honō', 'Irumbu']) await expect(page.getByRole('button', { name: new RegExp(word) })).toBeVisible();
  await page.getByRole('button', { name: /Honō/ }).click();
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(36);
  await cell(page, 1, 1).click();
  await cell(page, 4, 4).click();
  await page.getByTestId('tutorial-reveal').click();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.puzzle-hono[data-phase="hint-piece"]')).toBeVisible();
  await page.getByRole('button', { name: 'Puzzles', exact: true }).click();
  await expect(page.getByRole('button', { name: /Irumbu/ })).toBeVisible();
});
