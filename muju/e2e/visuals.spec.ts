import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { UNIT_DEFINITIONS } from '../src/game/units';
import type { GameState } from '../src/game/types';

async function start(page: Page, state: GameState) {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: 2, timestamp: Date.now(), state: saved })), state);
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
}

test('equal reserve counts keep different mining depths visible, including after selection', async ({ page }) => {
  const state = createInitialGameState();
  state.board.cells[2][2] = { position: { x: 2, y: 2 }, resourceLayers: 3, minedDepth: 0 };
  state.board.cells[2][3] = { position: { x: 3, y: 2 }, resourceLayers: 3, minedDepth: 2 };
  state.board.cells[2][4] = { position: { x: 4, y: 2 }, resourceLayers: 0, minedDepth: 5 };
  await start(page, state);
  const shallow = page.getByTestId('cell-2-2');
  const deep = page.getByTestId('cell-3-2');
  await expect(shallow.locator('.crystal')).toHaveCount(3);
  await expect(deep.locator('.crystal')).toHaveCount(3);
  await expect(shallow.locator('.next-crystal')).toHaveAttribute('data-depth', '1');
  await expect(deep.locator('.next-crystal')).toHaveAttribute('data-depth', '3');
  await expect(shallow.locator('.bedrock')).toHaveCount(2);
  await expect(deep.locator('.mined')).toHaveCount(2);
  await expect(page.getByTestId('cell-4-2')).toHaveAttribute('aria-label', /depleted/);
  await expect(page.getByTestId('cell-4-2')).not.toHaveAttribute('aria-label', /next layer/);
  const before = await deep.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.getByTestId('cell-1-1').click();
  await deep.click();
  await expect(page.getByRole('button', { name: 'Confirm move' })).toBeVisible();
  expect(await deep.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(before);
  await expect(deep.locator('.next-crystal')).toHaveAttribute('data-depth', '3');
  await page.getByRole('button', { name: 'Depths' }).click();
  await expect(deep.locator('.resource-readout')).toHaveText('3↓3');
  await expect(shallow.locator('.resource-readout')).toHaveText('3↓1');
});

test('both armies retain 24 distinct labelled pieces, exact ranks and damage on a crowded board', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const state = createInitialGameState();
  state.board.units = (['white','black'] as const).flatMap(owner => UNIT_DEFINITIONS.map((def, i) => {
    const unit = createUnit(def.id, owner, { x: 2 + i % 6, y: Math.floor(i / 6) + (owner === 'black' ? 6 : 0) });
    if (i === 23) unit.damageTaken = 1;
    return unit;
  }));
  await start(page, state);
  await expect(page.locator('.battle-board .army-white')).toHaveCount(24);
  await expect(page.locator('.battle-board .army-black')).toHaveCount(24);
  for (const unit of state.board.units) {
    const def = UNIT_DEFINITIONS.find(d => d.id === unit.definitionId)!;
    const square = page.getByTestId(`cell-${unit.position.x}-${unit.position.y}`);
    await expect(square).toHaveAttribute('aria-label', new RegExp(`${def.element}, tier ${def.tier}`));
    await expect(square.locator('..').locator('.rank-pips rect')).toHaveCount(def.tier);
  }
  await expect(page.locator('.piece-damage')).toHaveCount(2);
  const dimensions = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  expect(dimensions).toEqual({ w: 390, h: 664 });
  await page.screenshot({ path: info.outputPath('crowded-color.png') });
  await page.locator('.battle-board').evaluate(el => (el as HTMLElement).style.filter = 'grayscale(1)');
  await page.screenshot({ path: info.outputPath('crowded-grayscale.png') });
});

test('visual key explains both encodings and does not consume game keyboard actions', async ({ page }) => {
  await start(page, createInitialGameState());
  await page.getByTestId('cell-1-1').click();
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Read the board' });
  await expect(dialog).toContainText('Bedrock');
  await expect(dialog).toContainText('Ivory / White');
  await expect(dialog.locator('.army-examples .unit-art')).toHaveCount(12);
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
});
