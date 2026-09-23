import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';
import type { GameState } from '../src/game/types';
async function start(page: Page, state: GameState) {
  await page.addInitScript(({saved,schemaVersion}) => { if(!localStorage.getItem('elemental-tactics-save')) localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state:saved})); },{saved:state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');
  await page.getByRole('button',{name:'Pass & Play'}).click();
  await page.getByRole('button',{name:/Continue saved game/}).click();
}
function arena(tier: number) {
  const s=createInitialGameState(undefined,undefined,0,'phasing');
  // A far Ægirinn keeps Black alive, so a full sweep never ends the game by elimination.
  s.board.units=[createUnit(`fire_${tier}`,'white',{x:5,y:5}),...[[5,4],[6,5],[5,6]].map(([x,y])=>createUnit('fire_1','black',{x,y})),createUnit('water_3','black',{x:9,y:8})];
  return s;
}
async function attack(page: Page, x: number, y: number) {
  await page.getByTestId('cell-5-5').click();
  await page.getByTestId(`cell-${x}-${y}`).click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
}
/** Attack with the attacker already selected (a second click on it would deselect it). */
async function attackSelected(page: Page, x: number, y: number) {
  await page.getByTestId(`cell-${x}-${y}`).click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
}
async function resume(page: Page) {
  await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
}
// muju-phasing-4 (SPEC v3.4 §4.2, 2026-09-23): Cleave has no tier cap. Every
// kill unlocks another attack by the killer, at any tier; only the four shared
// actions bound the chain, and a surviving target still closes it.
test('a new Tier I chains kills; the live chain survives reload and undo restores its first attack',async({page},info)=>{
  await page.setViewportSize({width:390,height:664});
  const s=arena(1);s.board.units[0].placedThisTurn=true;
  await start(page,s);await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1 · Cleave ready · 1 action');
  await expect(page.locator('.action-budget strong')).toHaveText('3 actions');
  await page.screenshot({path:info.outputPath('tier-one-cleave-ready.png')});
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.locator('.cleave-status')).toContainText('Attacks 0');
  await page.getByTestId('cell-5-4').click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
  await resume(page);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1 · Cleave ready · 1 action');
  await attackSelected(page,6,5);await attack(page,5,6);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 3 · Cleave ready · 1 action');
  await expect(page.locator('.action-budget i.available')).toHaveCount(1);
  for(const [x,y] of [[5,4],[6,5],[5,6]]) await expect(page.getByTestId(`cell-${x}-${y}`)).not.toHaveAttribute('aria-label',/black Hi/);
});
test('Tier II keeps Cleave through reload and pays one action for every further kill',async({page},info)=>{
  await page.setViewportSize({width:320,height:568});
  await start(page,arena(2));await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1 · Cleave ready · 1 action');
  await page.screenshot({path:info.outputPath('tier-two-cleave-ready.png')});
  await resume(page);
  await attack(page,6,5);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 2 · Cleave ready · 1 action');
  await expect(page.locator('.action-budget strong')).toHaveText('2 actions');
  await attackSelected(page,5,6);
  await expect(page.getByTestId('cell-5-6')).not.toHaveAttribute('aria-label',/black Hi/);
});
test('a Hi among four Muju takes all four in one turn',async({page},info)=>{
  await page.setViewportSize({width:390,height:664});
  const s=createInitialGameState(undefined,undefined,0,'phasing');
  s.board.units=[createUnit('fire_1','white',{x:5,y:5}),...[[5,4],[6,5],[5,6],[4,5]].map(([x,y])=>createUnit('plant_1','black',{x,y})),createUnit('water_3','black',{x:9,y:8})];
  await start(page,s);
  for(const [x,y] of [[5,4],[6,5],[5,6],[4,5]]) await attack(page,x,y);
  await page.getByTestId('cell-5-5').click();
  // The chain is still live, but all four actions are spent.
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 4 · No actions left');
  await page.screenshot({path:info.outputPath('hi-four-muju.png')});
  for(const [x,y] of [[5,4],[6,5],[5,6],[4,5]]) await expect(page.getByTestId(`cell-${x}-${y}`)).not.toHaveAttribute('aria-label',/Muju/);
});
test('a surviving target closes even a Tier III chain',async({page})=>{
  const s=arena(3);s.board.units[1].definitionId='water_3';
  await start(page,s);await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1 · Attacks finished');
  await expect(page.getByTestId('cell-5-4')).toHaveAttribute('aria-label',/black Ægirinn/);
  await page.getByTestId('cell-6-5').click();
  await expect(page.getByRole('button',{name:'Confirm attack'})).toHaveCount(0);
});
