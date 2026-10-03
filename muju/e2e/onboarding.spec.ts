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
  await expect(page.getByTestId('tutorial-word')).toBeVisible({ timeout: 5000 });
  // The name passes through and leaves nothing behind.
  await expect(page.getByTestId('tutorial-word')).toHaveCount(0, { timeout: 5000 });
}

async function playThrough(page: Page) {
  await solve(page, [0, 0], [2, 2], 'muju');
  await solve(page, [5, 5], [2, 2], 'hono');
  await solve(page, [9, 1], [9, 9], 'irumbu');
}

/** Every word a sighted player can read (symbols like ⌂ aside), minus the screen-reader narration. */
const visibleWords = (page: Page) => page.locator('main.onboarding').evaluate(main => {
  const narration = main.querySelector('[data-testid="tutorial-narration"]')?.textContent ?? '';
  return ((main as HTMLElement).innerText.replace(narration, '').match(/\p{L}+/gu) ?? []).join(' ');
});

test('a first visit plays three puzzles with no words but the piece names, then lands on the mode screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('main.onboarding')).toBeVisible();
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(9);
  // Playwright calls opacity 0 "visible"; the board must actually be seen.
  await expect(page.locator('.onboarding-stage')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('tutorial-narration')).toContainText('Tap the Muju');
  expect(await visibleWords(page)).toBe('Skip Tutorial');
  // The idle hint demonstrates the tap.
  await expect(page.getByTestId('ghost-pointer')).toBeVisible({ timeout: 4000 });
  await cell(page, 0, 0).click();
  await cell(page, 2, 2).click();
  await expect(page.getByTestId('tutorial-word')).toHaveText('Muju', { timeout: 5000 });
  await expect(page.getByTestId('tutorial-word')).toHaveCount(0, { timeout: 5000 });
  // Zoomed out: the Muju is where it finished, on the mined corner (8 − 3), and Black moves next.
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(36);
  await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /white Muju/);
  await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /5 crystals/);
  await expect(cell(page, 5, 5)).toHaveAttribute('aria-label', /black Honō/);
  // Homes appear only on the full board.
  await expect(page.locator('.puzzle-hono .home-marker')).toHaveCount(0);
  expect(await visibleWords(page)).toBe('Skip Tutorial');
  await solve(page, [5, 5], [2, 2], 'hono');
  // Three pieces in all: the Muju is gone and the Honō waits where it struck from.
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(100);
  await expect(page.locator('[data-testid^="cell-"][aria-label*="Muju"]')).toHaveCount(0);
  await expect(cell(page, 2, 3)).toHaveAttribute('aria-label', /black Honō/);
  await expect(page.locator('.puzzle-irumbu .home-white')).toHaveCount(1);
  await expect(page.locator('.puzzle-irumbu .home-black')).toHaveCount(1);
  await solve(page, [9, 1], [9, 9], 'irumbu');
  await expect(page.getByRole('heading', { name: 'Muju Hono Irumbu' })).toBeVisible({ timeout: 6000 });
  for (const name of ['Play vs AI', 'Play online', 'Puzzles']) await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  const other = page.getByRole('button', { name: 'Other ways to play' });
  await expect(other).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /Pass & Play/ })).toHaveCount(0);
  await other.click();
  await expect(page.getByRole('button', { name: /Pass & Play/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /MICRO MUJU/ })).toBeVisible();
  expect(await flag(page)).toMatchObject({ completed: true, version: 1 });
  expect(errors).toEqual([]);
  // A return visit goes straight to the mode screen, which remembers the open list.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pass & Play/ })).toBeVisible();
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
  await expect(page.locator('.puzzle-hono[data-phase="hint-piece"]')).toBeVisible({ timeout: 8000 });
  // The Muju is the prey now, not a piece to pick up.
  await cell(page, 2, 2).click();
  await expect(page.locator('.puzzle-hono')).toHaveAttribute('data-phase', 'hint-piece');
  await expect(page.locator('.tutorial-wrong')).toHaveCount(1);
  await solve(page, [5, 5], [2, 2], 'hono');
  await expect(page.locator('.puzzle-irumbu[data-phase="hint-piece"]')).toBeVisible();
  // The Honō from puzzle 2 is scenery.
  await cell(page, 2, 3).click();
  await expect(page.locator('.tutorial-wrong')).toHaveCount(0);
  expect(await puzzle(page)).toBe('irumbu');
});

test('tapping a gold dot glides the piece there; only winnable squares are lit', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-muju[data-phase="hint-piece"]')).toBeVisible();
  await cell(page, 0, 0).click();
  await expect(cell(page, 0, 1).locator('xpath=..').locator('.range-marker')).toBeVisible();
  await cell(page, 0, 1).click();
  await expect(cell(page, 0, 1)).toHaveAttribute('aria-label', /white Muju/);
  // The piece slides rather than jumping: a transform animation is running on it.
  expect(await page.locator('.tutorial-glider').evaluate(el => el.parentElement!.getAnimations().length)).toBeGreaterThan(0);
  await expect(page.locator('.puzzle-muju')).toHaveAttribute('data-phase', 'hint-target');
  await cell(page, 2, 2).click();
  await expect(page.getByTestId('tutorial-word')).toHaveText('Muju', { timeout: 5000 });
  await solve(page, [5, 5], [2, 2], 'hono');
  // The Irumbu (speed 2, exactly four actions) may stop on every second square only.
  await cell(page, 9, 1).click();
  await expect(page.locator('.puzzle-irumbu .range-marker')).toHaveCount(3);
  await cell(page, 9, 2).click();
  await expect(page.locator('.tutorial-wrong')).toHaveCount(1);
  await cell(page, 9, 5).click();
  await expect(cell(page, 9, 5)).toHaveAttribute('aria-label', /white Irumbu/);
  await cell(page, 9, 9).click();
  await expect(page.getByTestId('tutorial-word')).toHaveText('Irumbu', { timeout: 6000 });
});

test('Skip sets the flag and shows the mode screen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Skip Tutorial' }).click();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  expect(await flag(page)).toMatchObject({ completed: true, version: 1 });
});

test('?tutorial=1 and the Replay link replay it for a returning player', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ completed: true, at: '2026-10-02T00:00:00Z', version: 1 })), KEY);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await page.getByRole('button', { name: 'Other ways to play' }).click();
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await expect(page.locator('main.onboarding')).toBeVisible();
  await page.goto('./?tutorial=1');
  await expect(page.locator('main.onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Skip Tutorial' }).click();
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

test('keyboard users can finish a puzzle: focus follows the next square, and taps get no focus ring', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.puzzle-muju[data-phase="hint-piece"]')).toBeVisible();
  // The Muju is the only piece on the board, so it is the first tab stop.
  await page.keyboard.press('Tab');
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cell(page, 2, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tutorial-word')).toBeVisible({ timeout: 5000 });
  // Puzzle 2 by pointer: focus stays put.
  await expect(page.locator('.puzzle-hono[data-phase="hint-piece"]')).toBeVisible({ timeout: 8000 });
  await cell(page, 5, 5).click();
  await expect(page.locator('.puzzle-hono')).toHaveAttribute('data-phase', 'hint-target');
  await expect(cell(page, 2, 2)).not.toBeFocused();
});

test('Puzzles lists every scenario and replays one with its reveal', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ completed: true, at: '2026-10-02T00:00:00Z', version: 1 })), KEY);
  await page.goto('./');
  await page.getByRole('button', { name: /^Puzzles/ }).click();
  for (const word of ['Muju', 'Honō', 'Irumbu']) await expect(page.getByRole('button', { name: new RegExp(word) })).toBeVisible();
  await page.getByRole('button', { name: /Honō/ }).click();
  await expect(page.locator('[data-testid^="cell-"]')).toHaveCount(36);
  await solve(page, [5, 5], [2, 2], 'hono');
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.puzzle-hono[data-phase="hint-piece"]')).toBeVisible();
  await page.getByRole('button', { name: 'All puzzles' }).click();
  await expect(page.getByRole('button', { name: /Irumbu/ })).toBeVisible();
});
