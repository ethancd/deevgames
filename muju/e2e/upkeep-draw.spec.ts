import {test,expect} from '@playwright/test';
import {createInitialGameState} from '../src/game/board';
import {startTurn} from '../src/game/turn';
import {SCHEMA_VERSION} from '../src/utils/persistence';
import {INACTIVITY_LIMIT,INACTIVITY_WARNING} from '../src/game/inactivity';
for(const width of [390,834]) {
 test(`upkeep choice and public rent at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1112});
  // Phasing settles mining and upkeep together inside the turn, so the choice
  // arrives with "Mine & prepare" rather than at turn start. An empty map keeps
  // the income from covering the rent.
  const base=createInitialGameState(undefined,undefined,0,'phasing');
  for(const row of base.board.cells) for(const cell of row) cell.resourceLayers=0;
  base.board.units[0].definitionId='fire_2';base.board.units[1].definitionId='water_3';base.players.white.resources=1;base.players.white.resourcesGained=1;base.inactivityPlies=INACTIVITY_WARNING;
  const state=startTurn(base,'white');
  await page.addInitScript(({state,schemaVersion})=>localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state})),{state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
  await page.getByRole('button',{name:'Mine & prepare →'}).click();
  const panel=page.getByRole('dialog',{name:'Choose upkeep'});
  await expect(panel).toBeVisible();await expect(panel).toContainText('Upkeep 3 / 1');await expect(panel.getByRole('button',{name:'Pay upkeep & continue'})).toBeDisabled();
  const free=panel.getByRole('checkbox',{name:/T1/});await expect(free).toBeChecked();await expect(free).toBeDisabled();
  await panel.getByRole('checkbox',{name:/Ægirinn/}).uncheck();await expect(panel).toContainText('Upkeep 1 / 1');await page.screenshot({path:info.outputPath('upkeep-choice.png')});
  await panel.getByRole('button',{name:'Pay upkeep & continue'}).click();await expect(panel).toHaveCount(0);
  await expect(page.locator('.progress-clock')).toContainText(`${INACTIVITY_WARNING}/${INACTIVITY_LIMIT} turns without a kill`);await expect(page.locator('.progress-clock')).toContainText('paid 1 · released 1');await expect(page.locator('.score-strip')).toContainText('Upkeep 1');
  await expect(page.getByTestId('cell-1-1')).not.toHaveAttribute('aria-label',/Ægirinn/);
  await page.getByTestId('cell-1-0').click();await expect(page.locator('.unit-detail')).toContainText('Upkeep 1');
  await page.screenshot({path:info.outputPath('after-upkeep.png')});
 });
 test(`kill clock draw (tied mined totals) reaches victory screen at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:1112});
  const state=createInitialGameState(Array(100).fill(0),undefined,0,'phasing');state.inactivityPlies=INACTIVITY_LIMIT-1;state.turn.phase='action';state.board.units.find(u=>u.owner==='black')!.position={x:0,y:0};
  await page.addInitScript(({state,schemaVersion})=>localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state})),{state,schemaVersion:SCHEMA_VERSION});
  await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
  // The kill clock advances at the handover, after preparation. A zero-resource
  // board keeps both sides' mined totals at 0, so the tenth kill-free ply draws.
  await page.getByRole('button',{name:'Mine & prepare →',exact:true}).click();
  await page.getByRole('button',{name:'End turn →',exact:true}).click();await expect(page.getByRole('heading',{name:'Draw by kill clock'})).toBeVisible();await expect(page.getByText(`${INACTIVITY_LIMIT} consecutive player turns passed without a kill, and both sides' mined crystal totals are tied at 0.`)).toBeVisible();
  await page.screenshot({path:info.outputPath('kill-clock-draw.png')});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('elemental-tactics-save')!));expect(saved.state.victoryReason).toBe('kill-clock');expect(saved.state.winner).toBeNull();
 });
}
