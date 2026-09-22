import { test, expect } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';

for (const width of [1280,390]) test(`Yan's stationary moves, stats and adjacent attack at ${width}px`, async ({page},info) => {
  await page.setViewportSize({width,height:844});
  const state=createInitialGameState();
  state.board.units=[createUnit('metal_1','white',{x:2,y:2}),createUnit('water_1','black',{x:2,y:3}),createUnit('plant_1','black',{x:8,y:8})];
  state.turn.phase='action';
  await page.addInitScript(({state,schemaVersion})=>{
    if(sessionStorage.getItem('metal:seeded'))return;
    localStorage.setItem('elemental-tactics-save',JSON.stringify({state,schemaVersion,timestamp:Date.now()}));
    sessionStorage.setItem('metal:seeded','1');
  },{state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');
  await page.getByRole('button',{name:/^Pass & Play/}).click();
  await page.getByRole('button',{name:/Continue saved game/}).click();
  const yan=page.getByTestId('cell-2-2');
  await expect(yan).toHaveAttribute('aria-label',/white Yan/);
  await yan.click();
  const detail=page.locator('.unit-detail');
  await expect(detail).toContainText('Speed 0');
  await expect(detail).toContainText('Mining 3');
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('cell-3-2').click();
  await expect(yan).toHaveAttribute('aria-label',/white Yan/);
  await yan.click();
  await page.getByTestId('cell-2-3').click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
  await expect(page.getByTestId('cell-2-3')).not.toHaveAttribute('aria-label',/black Sjor/);
  await page.screenshot({path:info.outputPath('yan-stationary-attack.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole('button',{name:/^Pass & Play/}).click();
  await page.getByRole('button',{name:/Continue saved game/}).click();
  await expect(yan).toHaveAttribute('aria-label',/white Yan/);
});
