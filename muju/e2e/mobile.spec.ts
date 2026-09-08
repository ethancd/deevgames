import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import type { GameState } from '../src/game/types';
import { getUnitDefinition } from '../src/game/units';

async function start(page: Page, state?: GameState, mode = 'Pass & Play') {
  if (state) await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: 2, timestamp: Date.now(), state: saved })), state);
  await page.goto('./');
  await page.getByRole('button', { name: mode === 'vs AI' ? 'vs AI Play against the computer' : mode, exact: mode === 'vs AI' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.battle-board')).toBeVisible();
}
async function fits(page: Page) {
  const dims = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
  expect(dims.sw).toBeLessThanOrEqual(dims.width);
  expect(dims.sh).toBeLessThanOrEqual(dims.height);
  for (const selector of ['.battle-board', '.decision-panel', '.action-bar', '.reference-bar']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(dims.height + 1);
  }
  const panel = await page.locator('.decision-panel').evaluate(el => ({ h: el.clientHeight, sh: el.scrollHeight, w: el.clientWidth, sw: el.scrollWidth }));
  expect(panel.sh).toBeLessThanOrEqual(panel.h + 1);
  expect(panel.sw).toBeLessThanOrEqual(panel.w + 1);
}

for (const [width, height] of [[320,568],[375,568],[375,667],[390,664],[393,706],[390,844],[430,932],[844,390],[1280,900]]) {
  test(`all play phases fit ${width}×${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const state = createInitialGameState();
    state.players.white.resources = 100;
    state.turn.phase = 'place';
    state.players.white.buildQueue = [{ id: 'ready', definitionId: 'fire_1', owner: 'white', turnsRemaining: 0 }];
    await start(page, state);
    await page.getByTestId('cell-1-1').click();
    await fits(page);
    await page.screenshot({ path: info.outputPath('place.png') });
    await page.getByRole('button', { name: /Hi Place/ }).click();
    await expect(page.locator('.spawn-marker').first()).toBeVisible();
    await page.getByTestId('cell-0-0').click();
    await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /white Hi/);
    await page.getByRole('button', { name: 'Start actions' }).click();
    await page.getByTestId('cell-1-1').click();
    await fits(page);
    await expect(page.locator('.resource-number')).toHaveCount(0);
    await page.getByTestId('cell-3-1').click();
    await expect(page.getByRole('button', { name: 'Confirm move' })).toBeVisible();
    await fits(page);
    await page.screenshot({ path: info.outputPath('move-preview.png') });
    await page.getByRole('button', { name: 'Confirm move' }).click();
    await page.getByRole('button', { name: 'Finish actions' }).click();
    await page.getByRole('button', { name: 'Lightning', exact: false }).click();
    await page.getByRole('button', { name: /Tier 4/ }).click();
    await fits(page);
    await page.screenshot({ path: info.outputPath('build.png') });
    await expect(page.locator('.shop-action')).toContainText('Needs lightning Tier 3+');
    await expect(page.locator('.shop-action button')).toBeDisabled();
  });
}

test('tap previews do not spend actions; confirmation, mining, undo and phase undo work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await start(page);
  await page.getByTestId('cell-1-1').click();
  await page.getByTestId('cell-3-1').click();
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
  await expect(page.getByTestId('cell-1-1')).toHaveAttribute('aria-label', /white Sjor/);
  await expect(page.locator('.action-preview')).toContainText('2 actions · 4 left');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
  await page.getByTestId('cell-3-1').click();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  await expect(page.getByTestId('cell-3-1')).toHaveAttribute('aria-label', /white Sjor/);
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('cell-1-1')).toHaveAttribute('aria-label', /white Sjor/);
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
  await page.getByRole('button', { name: /Mine \+2/ }).click();
  await expect(page.locator('.score-strip>div').first()).toContainText('◆ 2');
  await page.getByRole('button', { name: 'Finish actions' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('5 actions');
  await page.getByRole('button', { name: 'Finish actions' }).click();
  await page.getByRole('button', { name: 'Build · ◆ 1' }).click();
  await expect(page.locator('.queue-strip')).toContainText('Hi');
  await expect(page.locator('.score-strip>div').first()).toContainText('◆ 1');
});

test('attack preview agrees with combat and waits for confirmation', async ({ page }) => {
  const state = createInitialGameState();
  state.board.units.push(createUnit('plant_1', 'black', { x: 2, y: 0 }));
  await start(page, state);
  await page.getByTestId('cell-1-0').click();
  await page.getByTestId('cell-2-0').click();
  await expect(page.locator('.action-preview')).toContainText('Eliminates target');
  await expect(page.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /black Muju/);
  await page.getByRole('button', { name: 'Confirm attack' }).click();
  await expect(page.getByTestId('cell-2-0')).not.toHaveAttribute('aria-label', /black Muju/);
  await expect(page.locator('.action-budget strong')).toHaveText('5 actions');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /black Muju/);
});

test('promotion preview uses catalogue, and respects already-promoted restriction', async ({ page }) => {
  const state = createInitialGameState(); state.turn.phase = 'place'; state.players.white.resources = 100;
  const def = getUnitDefinition('water_2');
  await start(page, state);
  await page.getByTestId('cell-1-1').click();
  await expect(page.locator('.unit-action-row')).toContainText(`${def.name}: ATK ${def.attack}`);
  await page.getByRole('button', { name: /Upgrade ·/ }).click();
  await page.getByTestId('cell-1-1').click();
  await expect(page.getByRole('button', { name: /Upgrade ·/ })).toBeDisabled();
});

test('dialogs trap keyboard navigation; depths and enemy reach are explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await start(page);
  await page.getByTestId('cell-8-8').click();
  await expect(page.locator('.range-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show reach' }).click();
  expect(await page.locator('.range-marker').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Depths' }).click();
  await expect(page.locator('.resource-number')).toHaveCount(100);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Select → preview → confirm');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Units', exact: true }).click();
  await page.getByRole('button', { name: /metal/i }).click();
  await page.getByRole('button', { name: /Tier 4/ }).click();
  await expect(page.getByRole('dialog')).toContainText(getUnitDefinition('metal_4').name);
});

test('AI turn keeps opponent money hidden and human ledger visible', async ({ page }) => {
  // Freeze the think delay so the display can be inspected deterministically.
  await page.clock.install();
  const state = createInitialGameState(); state.turn.currentPlayer = 'black';
  state.players.white.resources = 7; state.players.black.resources = 9876;
  await start(page, state, 'vs AI');
  await expect(page.locator('.score-strip>div').first()).toContainText('◆ 7');
  await expect(page.locator('.score-strip>div').last()).toContainText('Hidden');
  await expect(page.locator('.score-strip')).not.toContainText('9876');
});

test('keyboard shortcuts work after tapping a board button; Enter confirms the preview', async ({ page }) => {
  await start(page);
  await page.getByTestId('cell-1-1').click();
  await page.keyboard.press('m');
  await expect(page.locator('.action-budget strong')).toHaveText('5 actions');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
  await page.getByTestId('cell-3-1').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.action-preview')).toHaveCount(0);
  await page.getByTestId('cell-3-1').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cell-3-1')).toHaveAttribute('aria-label', /white Sjor/);
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
});

test('v1.3 Lightning combat, Plant extraction and tutorial agree with the catalogue', async ({ page }) => {
  const state = createInitialGameState();
  state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.definitionId = 'lightning_1';
  state.board.units.find(u => u.owner === 'white' && u.definitionId === 'plant_1')!.definitionId = 'plant_2';
  state.board.units.push(createUnit('metal_1', 'black', { x: 2, y: 0 }));
  await page.setViewportSize({ width: 390, height: 664 });
  await start(page, state);
  await page.getByTestId('cell-1-0').click();
  await page.getByTestId('cell-2-0').click();
  await expect(page.locator('.action-preview')).toContainText('Eliminates target');
  await page.getByRole('button', { name: 'Confirm attack' }).click();
  await expect(page.getByTestId('cell-2-0')).not.toHaveAttribute('aria-label', /black Inyan/);
  await page.getByTestId('cell-0-1').click();
  const mining = getUnitDefinition('plant_2').mining;
  await page.getByRole('button', { name: `Mine +${mining} ◆`, exact: true }).click();
  await expect(page.locator('.score-strip>div').first()).toContainText(`◆ ${mining}`);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.help-body')).toContainText('damage equal to effective attack');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.help-body')).toContainText(`+${mining}`);
  await expect(page.locator('.help-body')).toContainText('Depleted layers do not return');
});

test('new games use map D with blank approaches and preserve the layout on reload', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Depths' }).click();
  const layers = await page.locator('.resource-number').allTextContents();
  expect(layers.reduce((sum, n) => sum + Number(n), 0)).toBe(308);
  expect(layers.filter(n => Number(n) === 0)).toHaveLength(16);
  await expect(page.getByTestId('cell-3-0').locator('.crystal')).toHaveCount(0);
  await expect(page.getByTestId('cell-3-0').locator('.bedrock')).toHaveCount(5);
  await expect(page.getByTestId('cell-3-0')).toHaveAttribute('title', 'No crystals · bedrock');
  await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /0 resource layers, no crystals, bedrock/);
  await page.getByTestId('cell-1-1').click();
  await page.getByRole('button', { name: /Mine \+2/ }).click();
  await page.getByRole('button', { name: 'Finish actions' }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('Reinforcements');
  await page.reload();
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByTestId('cell-1-1')).toHaveAttribute('aria-label', /3 resource layers.*next layer at depth 3/);
  await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /0 resource layers, no crystals, bedrock/);
});

for (const [width,height] of [[320,568],[390,664]]) test(`home invasion warns, resolves, and survives reload ${width}`,async({page},info)=>{
 const s=createInitialGameState();s.turn.currentPlayer='black';s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!.position={x:9,y:9};
 // Use a saved reply turn, then remove the fixture installer before the reload.
 await page.setViewportSize({width,height});await page.goto('./');
 await page.evaluate(state=>localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:2,timestamp:Date.now(),state})),s);
 await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();
 await expect(page.getByTestId('cell-9-9')).toHaveAttribute('aria-label',/black home corner/);
 await expect(page.locator('.board-key')).toContainText('Clear J10 this turn or lose');await fits(page);
 await page.screenshot({path:info.outputPath('home-warning.png')});
 await page.getByRole('button',{name:'How to play',exact:true}).click();await page.getByRole('button',{name:'Next →'}).click();
 await expect(page.getByRole('dialog')).toContainText('Two ways to win');await expect(page.getByRole('dialog')).toContainText('before placement or promotion');
 await page.screenshot({path:info.outputPath('home-help.png')});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Finish actions'}).click();
 await expect(page.getByRole('heading',{name:'Player 1 Wins!'})).toBeVisible();
 await expect(page.getByText(/held the enemy home corner/)).toBeVisible();await page.screenshot({path:info.outputPath('home-victory.png')});
 await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();
 await expect(page.getByText(/held the enemy home corner/)).toBeVisible();
});
