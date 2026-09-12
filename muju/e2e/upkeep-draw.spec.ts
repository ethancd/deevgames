import {test,expect} from '@playwright/test';
import {createInitialGameState} from '../src/game/board';
import {startTurn} from '../src/game/turn';
import {SCHEMA_VERSION} from '../src/utils/persistence';
for(const width of [390,834]) {
 test(`upkeep choice and public rent at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1112});
  const base=createInitialGameState();base.board.units[0].definitionId='fire_2';base.board.units[1].definitionId='water_3';base.players.white.resources=1;base.players.white.resourcesGained=1;base.inactivityPlies=7;
  const state=startTurn(base,'white');
  await page.addInitScript(({state,schemaVersion})=>localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state})),{state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
  const panel=page.getByRole('dialog',{name:'Choose upkeep'});
  await expect(panel).toBeVisible();await expect(panel).toContainText('Upkeep 3 / 1');await expect(panel.getByRole('button',{name:'Pay upkeep & continue'})).toBeDisabled();
  const free=panel.getByRole('checkbox',{name:/T1/});await expect(free).toBeChecked();await expect(free).toBeDisabled();
  await panel.getByRole('checkbox',{name:/Aegirinn/}).uncheck();await expect(panel).toContainText('Upkeep 1 / 1');await page.screenshot({path:info.outputPath('upkeep-choice.png')});
  await panel.getByRole('button',{name:'Pay upkeep & continue'}).click();await expect(panel).toHaveCount(0);
  await expect(page.locator('.progress-clock')).toContainText('7/10 quiet turns');await expect(page.locator('.progress-clock')).toContainText('paid 1 · released 1');await expect(page.locator('.score-strip')).toContainText('Upkeep 1');
  await expect(page.getByTestId('cell-1-1')).not.toHaveAttribute('aria-label',/Aegirinn/);
  await page.getByTestId('cell-1-0').click();await expect(page.locator('.unit-detail')).toContainText('Upkeep 1');
  await page.screenshot({path:info.outputPath('after-upkeep.png')});
 });
 test(`inactivity draw reaches victory screen at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1112});
  const state=createInitialGameState(Array(100).fill(0));state.inactivityPlies=9;state.turn.phase='action';state.board.units.find(u=>u.owner==='black')!.position={x:0,y:0};
  await page.addInitScript(({state,schemaVersion})=>localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state})),{state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
  await page.getByRole('button',{name:'End turn →',exact:true}).click();await expect(page.getByRole('heading',{name:'Draw by inactivity'})).toBeVisible();await expect(page.getByText('10 consecutive player turns passed without collecting crystals or eliminating an enemy by attack.')).toBeVisible();
  await page.screenshot({path:info.outputPath('inactivity-draw.png')});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('elemental-tactics-save')!));expect(saved.state.victoryReason).toBe('inactivity');
 });
}
