import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { UNIT_DEFINITIONS } from '../src/game/units';
import { SCHEMA_VERSION } from '../src/utils/persistence';
import type { GameState } from '../src/game/types';

/** Phasing is the only ruleset since 2026-09-21. */
const phasing = () => createInitialGameState(undefined, undefined, 0, 'phasing');

async function start(page: Page, state: GameState) {
  await page.addInitScript(({ saved, schemaVersion }) => {
    if (!localStorage.getItem('elemental-tactics-save')) localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion, timestamp: Date.now(), state: saved }));
  }, { saved: state, schemaVersion: SCHEMA_VERSION });
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
}

test('soft dots show every reserve count over dimmed colors without a toggle', async ({page}, info) => {
 await page.setViewportSize({width:390,height:664});
 const state=phasing();
 for(let count=0;count<=16;count++) state.board.cells[Math.floor(count/10)][count%10].resourceLayers=count;
 await start(page,state);
 await expect(page.getByRole('button',{name:'Reserves'})).toHaveCount(0);
 await expect(page.locator('.crystal-lights')).toHaveCount(100);
 const outlines=await page.locator('.board-square').evaluateAll(squares=>squares.map(square=>{
   const style=getComputedStyle(square,'::after');
   return {color:style.borderTopColor,width:style.borderTopWidth,events:style.pointerEvents};
 }));
 for(const outline of outlines) expect(outline).toEqual({color:'rgb(85, 108, 121)',width:'1px',events:'none'});
 const expected=['#192a38','#263b4b','#334d5d','#405f6f','#4e7181','#5d8393','#6d96a4','#7eabb6','#90bec7','#a2d1d6','#b5e5e4','#c1e9e9','#ceeeed','#daf2f2','#e6f6f6','#f3fbfb','#ffffff'];
 for(let count=0;count<=16;count++) {
   const square=page.getByTestId(`cell-${count%10}-${Math.floor(count/10)}`);
   await expect(square).toHaveAccessibleName(new RegExp(`${count} crystals? remaining`));
   await expect(square.locator('.crystal-light')).toHaveCount(count);
   const style=await square.evaluate(e=>({color:getComputedStyle(e).backgroundColor,overlay:getComputedStyle(e).backgroundImage}));
   const rgb=[1,3,5].map(i=>parseInt(expected[count].slice(i,i+2),16));
   expect(style.color).toBe(`rgb(${rgb.join(', ')})`);
   expect(style.overlay).toContain('rgba(16, 25, 37, 0.4)');
 }
 await expect(page.getByTestId('cell-1-0').locator('.crystal-light')).toHaveAttribute('transform','translate(50 90)');
 const glow=await page.locator('.crystal-core').first().evaluate(e=>getComputedStyle(e).filter);
 expect(glow).toBe('drop-shadow(rgb(237, 246, 255) 0px 0px 1.5px)');
 await page.screenshot({path:info.outputPath('reserves-0-16-soft-dots.png')});
});

test('mining converges to the same eight and four lights and survives refresh', async ({page}) => {
 const state=phasing();
 // Plant 3 mines eight and Metal 2 mines four. Separate white squares let one
 // real turn take 16→8 and 8→4 while untouched reference squares retain 8/4.
 state.board.units = [createUnit('plant_3','white',{x:2,y:2}),createUnit('metal_2','white',{x:4,y:4}),createUnit('plant_1','black',{x:9,y:9})];
 for (const [x,y,n] of [[2,2,16],[4,4,8],[6,6,8],[7,7,4]]) state.board.cells[y][x].resourceLayers=n;
 await start(page,state);
 const slots=async (x:number,y:number)=>page.getByTestId(`cell-${x}-${y}`).locator('.crystal-light').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')));
 await page.getByRole('button',{name:'Mine & prepare →'}).click();
 await expect(page.getByTestId('cell-2-2').locator('.crystal-light')).toHaveCount(8);
 await expect(page.getByTestId('cell-4-4').locator('.crystal-light')).toHaveCount(4);
 expect(await slots(2,2)).toEqual(await slots(6,6));
 expect(await slots(4,4)).toEqual(await slots(7,7));
 await page.reload();
 await page.getByRole('button',{name:'Pass & Play'}).click();
 await page.getByRole('button',{name:/Continue saved game/}).click();
 expect(await slots(2,2)).toEqual(await slots(6,6));
 expect(await slots(4,4)).toEqual(await slots(7,7));
});

test('both armies retain 18 distinct labelled pieces, exact ranks and damage on a crowded board', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const state = phasing();
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
  await start(page, phasing());
  await page.getByTestId('cell-1-1').click();
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Read the board' });
  await expect(dialog).toContainText('One reserve per square');
  await expect(dialog).toContainText('Ivory / White');
  await expect(dialog.locator('.army-examples .unit-art')).toHaveCount(12);
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
});
