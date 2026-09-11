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

test('reserve bricks show 0–10 in equal bottom-aligned slots and toggle back to shading', async ({page}) => {
 await page.setViewportSize({width:390,height:664});
 const state=createInitialGameState();
 for(let count=0;count<=10;count++) state.board.cells[Math.floor(count/10)][count%10].resourceLayers=count;
 await start(page,state);
 await expect(page.locator('.reserve-bricks')).toHaveCount(100);
 await expect(page.locator('.resource-number')).toHaveCount(0);
 let brickSize: {width:number;height:number}|undefined;
 for(let count=0;count<=10;count++) {
   const square=page.getByTestId(`cell-${count%10}-${Math.floor(count/10)}`);
   await expect(square).toHaveAccessibleName(new RegExp(`${count} crystals? remaining`));
   const bricks=square.locator('.reserve-brick');
   await expect(bricks).toHaveCount(count);
   const slots=await bricks.evaluateAll(nodes=>nodes.map(node=>{
     const style=getComputedStyle(node), rect=node.getBoundingClientRect();
     return {column:Number(style.gridColumnStart),row:Number(style.gridRowStart),color:style.backgroundColor,width:rect.width,height:rect.height};
   }));
   expect(slots.filter(s=>s.column===1)).toHaveLength(Math.ceil(count/2));
   expect(slots.filter(s=>s.column===2)).toHaveLength(Math.floor(count/2));
   for(const [index,slot] of slots.entries()) {
     expect(slot.row).toBe(5-Math.floor(index/2)); expect(slot.color).toBe('rgb(181, 229, 228)');
     brickSize ??= slot;
     expect(Math.abs(slot.width-brickSize.width)).toBeLessThan(.1);
     expect(Math.abs(slot.height-brickSize.height)).toBeLessThan(.1);
   }
 }
 await page.getByRole('button',{name:'Reserves'}).click();
 await expect(page.locator('.reserve-bricks')).toHaveCount(0);
 const shades=[];
 for(const count of [0,4,8,10]) shades.push(await page.getByTestId(`cell-${count%10}-${Math.floor(count/10)}`).evaluate(e=>getComputedStyle(e).backgroundColor));
 expect(new Set(shades).size).toBe(4);
 await page.getByRole('button',{name:'Reserves'}).click();
 await expect(page.locator('.reserve-bricks')).toHaveCount(100);
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
