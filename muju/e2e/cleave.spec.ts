import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import type { GameState } from '../src/game/types';
async function start(page: Page, state: GameState) {
  await page.addInitScript(saved => { if(!localStorage.getItem('elemental-tactics-save')) localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:4,timestamp:Date.now(),state:saved})); },state);
  await page.goto('./');
  await page.getByRole('button',{name:'Pass & Play'}).click();
  await page.getByRole('button',{name:'Start Game'}).click();
}
function arena(tier: number) {
  const s=createInitialGameState();
  s.board.units=[createUnit(`fire_${tier}`,'white',{x:5,y:5}),...[[5,4],[6,5],[5,6]].map(([x,y])=>createUnit('fire_1','black',{x,y}))];
  return s;
}
async function attack(page: Page, x: number, y: number) {
  await page.getByTestId('cell-5-5').click();
  await page.getByTestId(`cell-${x}-${y}`).click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
}
test('new Tier I kills once; the attack cap survives reload and undo restores its first attack',async({page},info)=>{
  await page.setViewportSize({width:390,height:664});
  const s=arena(1);s.board.units[0].placedThisTurn=true;
  await start(page,s);await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1/1 · Attacks finished');
  await expect(page.locator('.action-budget strong')).toHaveText('5 actions');
  await page.screenshot({path:info.outputPath('tier-one-spent.png')});
  await page.getByTestId('cell-6-5').click();
  await expect(page.getByRole('button',{name:'Confirm attack'})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.locator('.cleave-status')).toContainText('Attacks 0/1');
  await page.getByTestId('cell-5-4').click();
  await page.getByRole('button',{name:'Confirm attack'}).click();
  await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1/1 · Attacks finished');
  await expect(page.getByTestId('cell-6-5')).toHaveAttribute('aria-label',/black Hi/);
});
test('Tier II keeps Cleave through reload, pays for its second attack, then stops',async({page},info)=>{
  await page.setViewportSize({width:320,height:568});
  await start(page,arena(2));await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1/2 · Cleave ready · 1 action');
  await page.screenshot({path:info.outputPath('tier-two-cleave-ready.png')});
  await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();
  await attack(page,6,5);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 2/2 · Attacks finished');
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await page.getByTestId('cell-5-6').click();
  await expect(page.getByRole('button',{name:'Confirm attack'})).toHaveCount(0);
});
test('a surviving target closes even a Tier III chain',async({page})=>{
  const s=arena(3);s.board.units[1].definitionId='metal_3';
  await start(page,s);await attack(page,5,4);
  await page.getByTestId('cell-5-5').click();
  await expect(page.locator('.cleave-status')).toHaveText('Attacks 1/3 · Attacks finished');
  await expect(page.getByTestId('cell-5-4')).toHaveAttribute('aria-label',/black Tanka/);
  await page.getByTestId('cell-6-5').click();
  await expect(page.getByRole('button',{name:'Confirm attack'})).toHaveCount(0);
});
