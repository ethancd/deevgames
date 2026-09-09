import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { UNIT_DEFINITIONS } from '../src/game/units';
import type { GameState } from '../src/game/types';

async function start(page: Page, state: GameState) {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: 5, timestamp: Date.now(), state: saved })), state);
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
}

test('one reserve numeral, unchanged by selection and legible in grayscale',async({page},info)=>{
 await page.setViewportSize({width:390,height:664});const s=createInitialGameState();await start(page,s);
 await expect(page.locator('.resource-number')).toHaveCount(100);await expect(page.locator('.crystal-gauge,.well-shading')).toHaveCount(0);
 const shades=[];for(const [x,y] of [[3,0],[2,0],[0,3],[0,0]])shades.push(await page.getByTestId(`cell-${x}-${y}`).evaluate(e=>getComputedStyle(e).backgroundColor));expect(new Set(shades).size).toBe(4);
 await page.locator('.battle-board').evaluate(e=>(e as HTMLElement).style.filter='grayscale(1)');await page.screenshot({path:info.outputPath('reserve-grayscale.png')});
 await page.getByRole('button',{name:'Reserves'}).click();await expect(page.locator('.resource-number')).toHaveCount(0);await page.getByRole('button',{name:'Reserves'}).click();await expect(page.locator('.resource-number')).toHaveCount(100);
});

test('both armies retain 18 distinct labelled pieces, exact ranks and damage on a crowded board', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const state = createInitialGameState();
  state.board.units = (['white','black'] as const).flatMap(owner => UNIT_DEFINITIONS.map((def, i) => {
    const unit = createUnit(def.id, owner, { x: 2 + i % 6, y: Math.floor(i / 6) + (owner === 'black' ? 6 : 0) });
    if (i === UNIT_DEFINITIONS.length - 1) unit.damageTaken = 1;
    return unit;
  }));
  await start(page, state);
  await expect(page.locator('.battle-board .army-white')).toHaveCount(18);
  await expect(page.locator('.battle-board .army-black')).toHaveCount(18);
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
  await expect(dialog).toContainText('One reserve per square');
  await expect(dialog).toContainText('Ivory / White');
  await expect(dialog.locator('.army-examples .unit-art')).toHaveCount(12);
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
});
