import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { UNEQUAL_ROUTES_MAP } from '../src/game/resourceMap';

test.use({ hasTouch: true });

test('painter handles clicks, Shift, bounds, keyboard and history on its direct route', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('painter');
  expect(response?.status()).toBe(200);
  const board = page.getByRole('group', { name: 'Starting crystals' });
  const square = (coord: string) => board.getByRole('button', { name: new RegExp(`^${coord},`) });
  const value = async (coord: string, count: number) => expect(square(coord)).toHaveAccessibleName(new RegExp(`^${coord}, ${count} crystals?`));
  await expect(board.getByRole('button')).toHaveCount(100);
  await expect(page.getByLabel('Total crystals')).toHaveText('480 crystals');
  await square('D1').click(); await value('D1', 1);
  await square('D1').click({ modifiers: ['Shift'] }); await value('D1', 3);
  await square('D1').click({ button: 'right' }); await value('D1', 2);
  await square('D1').click({ button: 'right', modifiers: ['Shift'] }); await value('D1', 0);
  await square('D1').click({ button: 'right', modifiers: ['Shift'] }); await value('D1', 0);
  // A no-op at the lower bound must not consume an undo step.
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click(); await value('D1', 2);
  await page.getByRole('button', { name: '↷ Redo', exact: true }).click(); await value('D1', 0);
  await square('A1').click({ modifiers: ['Shift'] }); await value('A1', 10);
  await square('A1').click({ button: 'right' }); await value('A1', 9);
  await square('A1').click({ modifiers: ['Shift'] }); await value('A1', 10);
  await square('A1').focus();
  await page.keyboard.press('Shift+Delete'); await value('A1', 8);
  await page.keyboard.press('Shift+Enter'); await value('A1', 10);
  await page.keyboard.press('ArrowLeft'); await expect(square('A1')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(square('B1')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(square('B2')).toBeFocused();
  await page.keyboard.press('Delete'); await value('B2', 9);
  await page.keyboard.press('Space'); await value('B2', 10);
  await page.keyboard.press('Control+z'); await value('B2', 9);
  await page.keyboard.press('Control+Shift+z'); await value('B2', 10);
  await page.getByRole('button', { name: 'Clear map', exact: true }).click();
  await expect(page.getByLabel('Total crystals')).toHaveText('0 crystals');
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.getByLabel('Total crystals')).toHaveText('480 crystals');
  await square('D1').click();
  await expect(page.getByRole('button', { name: '↷ Redo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(page.getByLabel('Total crystals')).toHaveText('480 crystals');
  await page.screenshot({ path: testInfo.outputPath('painter-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('painter keeps its draft after refresh, exports it, and leaves game saves alone on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('elemental-tactics-save', 'existing game save');
    localStorage.setItem('muju:painter:v1', '[99]');
  });
  await page.goto('painter/');
  await expect(page.getByLabel('Total crystals')).toHaveText('480 crystals');
  await page.getByRole('button', { name: /^D1,/ }).tap();
  await page.reload();
  await expect(page.getByRole('button', { name: /^D1, 1 crystal$/ })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Draft status' })).toHaveText('Draft saved on this device.');
  expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBe('existing game save');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('muju-crystal-map.json');
  const exported: number[] = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const expected = [...UNEQUAL_ROUTES_MAP]; expected[3] = 1;
  expect(exported).toEqual(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('painter-mobile.png'), fullPage: true });
});

test('painter stays usable when storage and clipboard are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value: () => { throw new Error('Storage disabled'); } });
    Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('Storage disabled'); } });
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  await page.goto('painter');
  await expect(page.getByRole('status', { name: 'Draft status' })).toContainText('Draft could not be saved.');
  await page.getByRole('button', { name: /^D1,/ }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Copy map', exact: true }).click();
  const json = page.getByLabel('Map JSON · columns A–J, rows 1–10');
  await expect(json).toBeFocused();
  expect(JSON.parse(await json.inputValue())[3]).toBe(2);
  await expect(page.getByRole('status', { name: 'Draft status' })).toHaveText('Select and copy the map below.');
});
