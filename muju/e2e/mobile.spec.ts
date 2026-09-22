import {test,expect,type Page} from '@playwright/test';
import {createInitialGameState,createUnit} from '../src/game/board';
import {SCHEMA_VERSION} from '../src/utils/persistence';
import type {GameState} from '../src/game/types';
/** Phasing is the only ruleset since 2026-09-21; any other save is archived on
 * load and never offered for resume. Every turn is Act, then Prepare. */
const phasing=()=>createInitialGameState(undefined,undefined,0,'phasing');
async function start(page:Page,state=phasing()) {
 await page.addInitScript(({saved,schemaVersion})=>{if(!localStorage.getItem('elemental-tactics-save'))localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,timestamp:Date.now(),state:saved}));},{saved:state,schemaVersion:SCHEMA_VERSION});
 await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();
}
async function fits(page:Page) {
 const d=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,sy:scrollY}));
 expect(d.sw).toBeLessThanOrEqual(d.w);
 // Portrait games use the available dynamic viewport, including short phones.
 if(d.h>d.w || d.h>620) expect(d.sh).toBeLessThanOrEqual(d.h);
 for(const selector of ['.battle-board','.decision-panel','.action-bar','.reference-bar']){const b=await page.locator(selector).boundingBox();expect(b!.y+d.sy).toBeGreaterThanOrEqual(0);expect(b!.y+d.sy+b!.height).toBeLessThanOrEqual(d.sh+1);}
 const panel=await page.locator('.decision-panel').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}));expect(panel.sh).toBeLessThanOrEqual(panel.h+1);expect(panel.sw).toBeLessThanOrEqual(panel.w+1);
 if(d.w>=960&&d.h>=601&&d.w>d.h){
  const board=(await page.locator('.battle-board').boundingBox())!;
  expect(Math.abs(board.x+board.width/2-d.w/2)).toBeLessThanOrEqual(1);
  expect(board.height).toBeGreaterThanOrEqual(d.h*.88);
  expect(Math.abs(board.width-board.height)).toBeLessThanOrEqual(1);
  for(const selector of ['.game-overview','.board-key']){
   const rail=(await page.locator(selector).boundingBox())!;
   expect(rail.x).toBeGreaterThanOrEqual(0);expect(rail.x+rail.width).toBeLessThanOrEqual(board.x);
   expect(rail.y).toBeGreaterThanOrEqual(0);expect(rail.y+rail.height).toBeLessThanOrEqual(d.h+1);
  }
  for(const selector of ['.decision-panel','.play-footer']){
   const rail=(await page.locator(selector).boundingBox())!;
   expect(rail.x).toBeGreaterThanOrEqual(board.x+board.width);expect(rail.x+rail.width).toBeLessThanOrEqual(d.w);
   expect(rail.y).toBeGreaterThanOrEqual(0);expect(rail.y+rail.height).toBeLessThanOrEqual(d.h+1);
  }
 }
}
for(const [width,height] of [[320,568],[375,667],[390,664],[390,844],[430,932],[834,1112],[844,390],[1024,768],[1180,820],[1280,900],[1366,1024]])test(`two phases fit ${width}×${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});const s=phasing();s.players.white.resources=20;s.players.white.resourcesGained=20;await start(page,s);
 await expect(page.locator('.phase-steps span')).toHaveCount(2);await fits(page);
 // Act comes first: move a piece, then read what it will mine.
 await page.getByTestId('cell-1-1').click();await fits(page);
 await page.getByTestId('cell-3-1').click();await expect(page.getByTestId('cell-3-1')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.unit-detail')).toContainText('Takes 0 here at turn end');await fits(page);await page.screenshot({path:info.outputPath('moved.png')});
 // Prepare: mining and upkeep settle, then a summon is committed for next turn.
 await page.getByRole('button',{name:'Mine & prepare →'}).click();
 await page.getByRole('button',{name:'Summon Hi · 3 crystals',exact:true}).click();await page.getByTestId('cell-0-0').click();
 await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/white Hi phasing in, not an occupant/);
 await page.getByTestId('cell-0-0').click();
 await expect(page.locator('.unit-detail')).toContainText('Reach after arrival');await fits(page);await page.screenshot({path:info.outputPath('place.png')});
});
test('tablet rotation preserves selection and side controls remain usable',async({page})=>{
 await page.setViewportSize({width:1180,height:820});await start(page);
 const selected=page.getByTestId('cell-1-1');await selected.click();await expect(selected).toHaveAttribute('aria-pressed','true');await fits(page);
 await page.setViewportSize({width:820,height:1180});await expect(selected).toHaveAttribute('aria-pressed','true');await expect(page.locator('.unit-detail')).toContainText('Takes 2 here at turn end');await fits(page);
 await page.setViewportSize({width:1180,height:820});await expect(selected).toHaveAttribute('aria-pressed','true');await fits(page);
 await page.getByRole('button',{name:'Key',exact:true}).click();await expect(page.getByRole('dialog',{name:'Read the board'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.reserve-bricks')).toHaveCount(0);
 await page.getByRole('button',{name:'Reserves'}).click();await expect(page.locator('.reserve-bricks')).toHaveCount(100);
 await page.getByRole('button',{name:'Reserves'}).click();await expect(page.locator('.reserve-bricks')).toHaveCount(0);
 await page.getByTestId('cell-3-1').click();await expect(page.getByTestId('cell-3-1')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.unit-detail')).toContainText('Takes 0 here at turn end');await fits(page);
 await expect(page.getByTestId('projected-income')).toContainText('+4 ◆');
 await page.getByRole('button',{name:'Undo'}).click();await expect(page.getByTestId('projected-income')).toContainText('+6 ◆');await fits(page);
});
test('passive reserves, public banks, live projection, recap and irreversible income',async({page})=>{
 await page.setViewportSize({width:390,height:664});await start(page);
 await page.getByRole('button',{name:'Reserves'}).click();await expect(page.locator('.reserve-bricks')).toHaveCount(100);await expect(page.getByTestId('cell-0-0').locator('.reserve-brick')).toHaveCount(8);
 // Mining is never a per-piece action; the only control naming it is the phase button.
 await expect(page.getByRole('button',{name:/^Mine$/})).toHaveCount(0);await expect(page.locator('.score-strip')).not.toContainText('Hidden');
 await expect(page.getByTestId('projected-income')).toHaveText('Projected income this turn: +6 ◆');
 await page.getByTestId('cell-1-1').click();await expect(page.locator('.unit-detail')).toContainText('Takes 2 here at turn end');
 await page.keyboard.press('m');await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
 await page.getByTestId('cell-3-1').click();await expect(page.getByTestId('projected-income')).toContainText('+4 ◆');
 await page.getByRole('button',{name:'Undo'}).click();await expect(page.getByTestId('projected-income')).toContainText('+6 ◆');
 await page.getByRole('button',{name:'Mine & prepare →'}).click();await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();
 await expect(page.locator('.income-recap')).toContainText('Player 1 collected 6');await expect(page.locator('.score-strip')).toContainText('◆ 6');
 await expect(page.getByRole('button',{name:'Undo'})).toBeDisabled();await page.locator('.income-recap summary').click();await expect(page.locator('.income-recap')).toContainText('Muju at A2: 3');
});
test('commit a summon, promote it on arrival; haste and save persistence',async({page})=>{
 const s=phasing();s.players.white.resources=s.players.white.resourcesGained=10;await start(page,s);
 await page.getByRole('button',{name:'Mine & prepare →'}).click();
 await page.getByRole('button',{name:'Summon Hi · 3 crystals',exact:true}).click();await page.getByTestId('cell-0-0').click();
 await page.getByTestId('cell-0-0').click();
 // A commitment is not a piece: there is nothing there to promote yet.
 await expect(page.getByRole('button',{name:/Promote ·/})).toHaveCount(0);
 await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();
 await page.getByRole('button',{name:'Mine & prepare →'}).click();await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();
 // It arrives at the start of the owner's next turn, and Phasing lets an arrival
 // promote during that same turn's Prepare.
 await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/white Hi, fire, tier 1/);
 await page.getByRole('button',{name:'Mine & prepare →'}).click();
 await page.getByTestId('cell-0-0').click();await expect(page.getByRole('button',{name:'Promote · ◆ 4 · rent 1',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Promote · ◆ 4 · rent 1',exact:true}).click();await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/Honō/);
 await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:/Continue saved game/}).click();await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/Honō/);
});
test('tutorial explains the same reserves, phase order, summoning and promotion rules',async({page})=>{
 await start(page);await page.getByRole('button',{name:'How to play',exact:true}).click();const dialog=page.getByRole('dialog');
 const pages=Number((await dialog.locator('.help-navigation span').innerText()).split('/')[1]);
 const texts:string[]=[];for(let i=0;i<pages;i++){texts.push(await dialog.innerText());if(i<pages-1)await dialog.getByRole('button',{name:'Next →'}).click();}
 const text=texts.join('\n');expect(text).toContain('504 crystals');expect(text).toContain('0 / 4 / 8 / 16');
 // The Phasing promotion rule, in the deck's own words, and the retired
 // Standard one nowhere in it.
 expect(text).toContain('A piece that arrived this turn is eligible.');expect(text).not.toContain('cannot promote this turn');
 expect(text).toContain('both banks are public');expect(text).toContain('Hi (3)');expect(text).toContain('Muju (5)');expect(text).toContain('Buy Hi for 3; on a later turn promote to Honō for 4; on another turn promote to Kagari for 8.');expect(text).not.toMatch(/rope|Queue phase|hidden production|build time/i);
});
test('attack previews and cancellation preserve combat and undo',async({page})=>{
 const s=phasing();s.board.units.push(createUnit('plant_1','black',{x:2,y:0}));await start(page,s);
 await page.getByTestId('cell-1-0').click();await page.getByTestId('cell-2-0').click();await expect(page.locator('.action-preview')).toContainText('Eliminates target');
 await page.getByRole('button',{name:'Confirm attack'}).click();await expect(page.getByTestId('cell-2-0')).not.toHaveAttribute('aria-label',/black Muju/);
 await page.getByRole('button',{name:'Undo'}).click();await expect(page.getByTestId('cell-2-0')).toHaveAttribute('aria-label',/black Muju/);
});
