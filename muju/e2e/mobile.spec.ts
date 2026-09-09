import {test,expect,type Page} from '@playwright/test';
import {createInitialGameState,createUnit} from '../src/game/board';
import type {GameState} from '../src/game/types';
async function start(page:Page,state=createInitialGameState()) {
 await page.addInitScript(saved=>{if(!localStorage.getItem('elemental-tactics-save'))localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:5,timestamp:Date.now(),state:saved}));},state);
 await page.goto('./');await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();
}
async function fits(page:Page) {
 const d=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
 expect(d.sw).toBeLessThanOrEqual(d.w);expect(d.sh).toBeLessThanOrEqual(d.h);
 for(const selector of ['.battle-board','.decision-panel','.action-bar','.reference-bar']){const b=await page.locator(selector).boundingBox();expect(b!.y).toBeGreaterThanOrEqual(0);expect(b!.y+b!.height).toBeLessThanOrEqual(d.h+1);}
 const panel=await page.locator('.decision-panel').evaluate(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth}));expect(panel.sh).toBeLessThanOrEqual(panel.h+1);expect(panel.sw).toBeLessThanOrEqual(panel.w+1);
}
for(const [width,height] of [[320,568],[375,667],[390,664],[390,844],[430,932],[834,1112],[844,390],[1280,900]])test(`two phases fit ${width}×${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=20;s.players.white.resourcesGained=20;await start(page,s);
 await expect(page.locator('.phase-steps span')).toHaveCount(2);await fits(page);
 await page.getByRole('button',{name:'Buy Hi · 1 crystals',exact:true}).click();await page.getByTestId('cell-0-0').click();await page.getByTestId('cell-0-0').click();
 await expect(page.locator('.unit-detail')).toContainText('Placed this turn');await expect(page.getByRole('button',{name:/Promote ·/})).toBeDisabled();await fits(page);await page.screenshot({path:info.outputPath('place.png')});
 await page.getByRole('button',{name:'Start actions →'}).click();await page.getByTestId('cell-1-1').click();await fits(page);
 await page.getByTestId('cell-3-1').click();await expect(page.locator('.action-preview')).toContainText('Takes 0 here at turn end');await fits(page);await page.screenshot({path:info.outputPath('move-preview.png')});
});
test('passive reserves, public banks, live projection, recap and irreversible income',async({page})=>{
 await page.setViewportSize({width:390,height:664});await start(page);
 await expect(page.locator('.resource-number')).toHaveCount(100);await expect(page.getByTestId('cell-0-0').locator('.resource-number')).toHaveText('10');
 await expect(page.getByRole('button',{name:/Mine/})).toHaveCount(0);await expect(page.locator('.score-strip')).not.toContainText('Hidden');
 await expect(page.getByTestId('projected-income')).toHaveText('Projected income this turn: +6 ◆');
 await page.getByTestId('cell-1-1').click();await expect(page.locator('.unit-detail')).toContainText('Takes 2 here at turn end');
 await page.keyboard.press('m');await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
 await page.getByTestId('cell-3-1').click();await page.getByRole('button',{name:'Confirm move'}).click();await expect(page.getByTestId('projected-income')).toContainText('+4 ◆');
 await page.getByRole('button',{name:'Undo'}).click();await expect(page.getByTestId('projected-income')).toContainText('+6 ◆');
 await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();
 await expect(page.locator('.income-recap')).toContainText('Player 1 collected 6');await expect(page.locator('.score-strip')).toContainText('◆ 6');
 await expect(page.getByRole('button',{name:'Undo'})).toBeDisabled();await page.locator('.income-recap summary').click();await expect(page.locator('.income-recap')).toContainText('Muju at A2: 3');
});
test('buy now, refuse promotion now, allow it next turn; haste and save persistence',async({page})=>{
 const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=s.players.white.resourcesGained=10;await start(page,s);
 await page.getByRole('button',{name:'Buy Hi · 1 crystals',exact:true}).click();await page.getByTestId('cell-0-0').click();await page.getByTestId('cell-0-0').click();
 await expect(page.getByRole('button',{name:/Promote ·/})).toBeDisabled();await page.getByRole('button',{name:'Start actions →'}).click();
 await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();await page.getByRole('button',{name:'End turn →'}).click();await page.getByText('Tap anywhere to continue').click();
 await page.getByTestId('cell-0-0').click();await expect(page.getByRole('button',{name:/Promote ·/})).toBeEnabled();await page.getByRole('button',{name:/Promote ·/}).click();await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/Hono/);
 await page.reload();await page.getByRole('button',{name:'Pass & Play'}).click();await page.getByRole('button',{name:'Start Game'}).click();await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/Hono/);
});
test('tutorial explains the same reserves, phase order, buying and promotion restrictions',async({page})=>{
 await start(page);await page.getByRole('button',{name:'How to play',exact:true}).click();const dialog=page.getByRole('dialog');
 const texts:string[]=[];for(let i=0;i<12;i++){texts.push(await dialog.innerText());if(i<11)await dialog.getByRole('button',{name:'Next →'}).click();}
 const text=texts.join('\n');expect(text).toContain('520 crystals');expect(text).toContain('0 / 4 / 8 / 10');expect(text).toContain('cannot promote this turn');expect(text).toContain('Both banks');expect(text).not.toMatch(/rope|Queue phase|hidden production|build time/i);
});
test('attack previews and cancellation preserve combat and undo',async({page})=>{
 const s=createInitialGameState();s.board.units.push(createUnit('plant_1','black',{x:2,y:0}));await start(page,s);
 await page.getByTestId('cell-1-0').click();await page.getByTestId('cell-2-0').click();await expect(page.locator('.action-preview')).toContainText('Eliminates target');
 await page.getByRole('button',{name:'Confirm attack'}).click();await expect(page.getByTestId('cell-2-0')).not.toHaveAttribute('aria-label',/black Muju/);
 await page.getByRole('button',{name:'Undo'}).click();await expect(page.getByTestId('cell-2-0')).toHaveAttribute('aria-label',/black Muju/);
});
