import { test, expect } from '@playwright/test';

test('normal income-earning turns advance the kill-only clock and draw at ten', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');await page.getByRole('button',{name:/^Pass & Play/}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  for(let ply=1;ply<=10;ply++) {
    const startActions=page.getByRole('button',{name:/Start actions/});
    if(await startActions.count()) await startActions.click();
    await page.getByRole('button',{name:/End turn/}).click();
    await expect(page.locator('.progress-clock')).toContainText(`${ply}/10 turns without a kill`);
    if(ply<10) await page.getByText('Tap anywhere to continue').click();
  }
  await expect(page.getByRole('heading',{name:'Draw by inactivity'})).toBeVisible();
  await expect(page.getByText('10 consecutive player turns passed without a kill. Crystal income does not reset the clock.',{exact:true})).toBeVisible();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('elemental-tactics-save')!).state);
  expect(state.players.white.resourcesGained).toBeGreaterThan(0);
  expect(state.players.black.resourcesGained).toBeGreaterThan(0);
});

test('four-action setup, undo, both turns, resume and a fresh standard game', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.getByRole('button',{name:/^Pass & Play/}).click();
  await expect(page.getByRole('combobox',{name:'Actions per turn'})).toHaveCount(0);
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(page.locator('.action-budget i')).toHaveCount(4);
  await page.getByTestId('cell-1-1').click();await page.getByTestId('cell-3-1').click();
  await expect(page.locator('.action-budget strong')).toHaveText('2 actions');
  await page.getByRole('button',{name:/Undo/}).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await page.getByRole('button',{name:/End turn/}).click();
  await page.getByText('Tap anywhere to continue').click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await page.reload();await page.getByRole('button',{name:/^Pass & Play/}).click();
  await page.getByRole('button',{name:/Continue saved game · 4 actions/}).click();
  await expect(page.locator('.turn-strip')).toContainText('Player 2');
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(page.locator('.progress-clock')).toContainText('4 actions / turn');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await page.getByRole('button',{name:/^Pass & Play/}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await expect(page.locator('.turn-strip')).toContainText('Player 1');
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(page.locator('.action-budget i')).toHaveCount(4);
});

for (const side of ['white','black'] as const) test(`four-action AI plays correctly with a ${side} human`, async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args:Parameters<Worker['postMessage']>) {
      const request=args[0];
      if(request?.type==='search') {
        const budgets=JSON.parse(sessionStorage.getItem('tested-budgets')??'[]');
        budgets.push(request.state.actionsPerTurn);sessionStorage.setItem('tested-budgets',JSON.stringify(budgets));
      }
      return Reflect.apply(original,this,args);
    };
  });
  await page.goto('./');await page.getByRole('button',{name:'vs AI Play against the computer',exact:true}).click();
  await page.getByRole('radio',{name:side==='white'?'White':'Black',exact:true}).check();
  await page.getByLabel('AI Difficulty',{exact:true}).selectOption('easy');
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  if(side==='white') await page.getByRole('button',{name:/End turn/}).click();
  await expect(page.locator('.turn-strip')).toContainText(`You · Turn ${side==='white'?2:1}`,{timeout:20000});
  if(await page.getByRole('button',{name:/Start actions/}).count()) await page.getByRole('button',{name:/Start actions/}).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  const budgets=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tested-budgets')??'[]'));
  expect(budgets.length).toBeGreaterThan(0);expect(budgets.every((n:number)=>n===4)).toBe(true);
  expect(errors).toEqual([]);
});
