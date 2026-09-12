import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { tacticalFixtures } from '../lab/ai/fixtures';
import { applyActions } from '../src/ai/simulate';
import type { GameState } from '../src/game/types';
async function start(page: Page, state: GameState, watch = false) {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({schemaVersion:5,timestamp:Date.now(),state:saved})),state);
  await page.goto('./');
  await page.getByRole('button',{name:watch?'Watch AI Spectate AI vs AI match':'vs AI Play against the computer',exact:true}).click();
  for (const select of await page.locator('select').filter({has:page.locator('option[value="hard"]')}).all()) await select.selectOption('hard');
  await page.getByRole('button',{name:/Continue saved game/}).click();
}
test('built worker loads hashed WASM and performs a coordinated home rescue',async({page,context},info)=>{
  const fixture=tacticalFixtures().find(f=>f.name==='Metal III / two Shadow III / rotated black')!;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const binary=context.waitForEvent('response',r=>r.url().endsWith('.wasm'));
  const worker=page.waitForEvent('worker');
  await start(page,fixture.state);
  const native=await worker, closed=native.waitForEvent('close');
  expect(native.url()).toMatch(/\/muju\/assets\/entry-[^/]+\.js$/);
  const response=await binary;expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('application/wasm');
  const buffer=await response.body();expect([...buffer.subarray(0,4)]).toEqual([0,97,115,109]);
  await expect(page.getByTestId('cell-9-9')).not.toHaveAttribute('aria-label',/white Tanka/,{timeout:10000});
  await closed;
  await page.screenshot({path:info.outputPath('wasm-home-rescue.png')});
  expect(errors).toEqual([]);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('menu responds during Hard search; mode switch terminates the old worker',async({page},info)=>{
  const s=createInitialGameState();s.turn.currentPlayer='black';s.players.black.resources=s.players.black.resourcesGained=10;
  const workerPromise=page.waitForEvent('worker');await start(page,s);const worker=await workerPromise;
  const closed=worker.waitForEvent('close');
  const elapsed=await page.evaluate(async()=>{
    const start=performance.now();
    const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Game menu')!;
    button.click();await new Promise(requestAnimationFrame);return performance.now()-start;
  });
  expect(elapsed).toBeLessThan(100);
  await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:info.outputPath('menu-during-search.png')});
  await page.getByRole('button',{name:'Choose game mode',exact:true}).click();await closed;
  await expect(page.getByRole('button',{name:'Start Game',exact:true})).toBeVisible();
  await info.attach('menu-response-ms',{body:JSON.stringify({elapsedMs:elapsed,browser:page.context().browser()?.version()}),contentType:'application/json'});
});
test('restart during search cannot dispatch an old result into the new game',async({page})=>{
  const s=createInitialGameState();s.turn.currentPlayer='black';
  const workerPromise=page.waitForEvent('worker');await start(page,s);const worker=await workerPromise;
  const closed=worker.waitForEvent('close');page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Game menu',exact:true}).click();await page.getByRole('button',{name:'New game',exact:true}).click();await closed;
  await expect(page.locator('.action-budget strong')).toHaveText('6 actions');
  await expect(page.getByTestId('cell-8-9')).toHaveAttribute('aria-label',/black Hi/);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('cell-8-9')).toHaveAttribute('aria-label',/black Hi/);
});
test('WASM fetch failure stays in the worker and exposes a usable JS fallback',async({page,context})=>{
  await context.route('**/*.wasm',route=>route.abort());
  const fixture=tacticalFixtures().find(f=>f.name==='cheap invasion / one attack / rotated black')!;
  await start(page,fixture.state);
  await expect(page.getByTestId('cell-9-9')).not.toHaveAttribute('aria-label',/white Muju/,{timeout:10000});
  await expect(page.getByText('AI is using its backup engine.',{exact:true})).toBeVisible();
});
test('pause terminates native computation and resume starts a fresh worker',async({page})=>{
  const workerPromise=page.waitForEvent('worker');await start(page,createInitialGameState(),true);const worker=await workerPromise;
  const closed=worker.waitForEvent('close');await page.getByRole('button',{name:'Pause',exact:true}).click();await closed;
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  const next=page.waitForEvent('worker');await page.getByRole('button',{name:'Resume',exact:true}).click();await next;
});

test('Hard worker executes kill, paid move, Cleave to clear home',async({page})=>{
  const s=createInitialGameState();s.turn.currentPlayer='black';s.turn.actionsRemaining=3;
  const attacker=createUnit('fire_2','black',{x:7,y:9});
  s.board.units=[attacker,createUnit('fire_1','white',{x:9,y:9}),createUnit('fire_1','white',{x:8,y:9}),...[7,8,9].map(x=>{
    const u=createUnit('metal_3','black',{x,y:8});u.canActThisTurn=false;return u;
  })];
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page,s);
  await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('elemental-tactics-save')!).state.phase),{timeout:10000}).toBe('victory');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('elemental-tactics-save')!).state);
  expect(saved.winner).toBe('black');expect(saved.turn.actionsRemaining).toBe(0);
  const unit=saved.board.units.find((u:{id:string})=>u.id===attacker.id);
  expect(unit.attackedThisTurn).toHaveLength(2);expect(unit.lastAttackKilled).toBe(true);expect(unit.position).toEqual({x:8,y:9});
  expect(errors).toEqual([]);await expect(page.getByText('AI is using its backup engine.',{exact:true})).toHaveCount(0);
});

test('Hard worker finishes its opening capture before handing the turn back', async ({page}, info) => {
  const initial = createInitialGameState();
  const whiteHi = initial.board.units.find(unit => unit.owner === 'white' && unit.definitionId === 'fire_1')!;
  const whiteSjor = initial.board.units.find(unit => unit.owner === 'white' && unit.definitionId === 'water_1')!;
  const blackHi = initial.board.units.find(unit => unit.owner === 'black' && unit.definitionId === 'fire_1')!;
  // The reported tablet opening: White spends three actions reaching H1
  // and three reaching C4, then Black can reach H2 and capture with action six.
  const state = applyActions(initial, [
    {type: 'MOVE', unitId: whiteHi.id, to: {x: 7, y: 0}},
    {type: 'MOVE', unitId: whiteSjor.id, to: {x: 2, y: 3}},
    {type: 'END_ACTION_PHASE'},
  ]);
  expect(state.turn.currentPlayer).toBe('black');
  expect(state.turn.actionsRemaining).toBe(6);
  expect(state.players.white.resources).toBe(6);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const workerPromise = page.waitForEvent('worker');
  await start(page, state);
  const worker = await workerPromise;
  expect(worker.url()).toMatch(/\/muju\/assets\/entry-[^/]+\.js$/);

  await expect.poll(async () => page.evaluate(({whiteId, blackId}) => {
    const saved = JSON.parse(localStorage.getItem('elemental-tactics-save')!).state as GameState;
    return {
      player: saved.turn.currentPlayer,
      turn: saved.turn.turnNumber,
      whiteHiAlive: saved.board.units.some(unit => unit.id === whiteId),
      blackHiAlive: saved.board.units.some(unit => unit.id === blackId),
    };
  }, {whiteId: whiteHi.id, blackId: blackHi.id}), {timeout: 20_000}).toEqual({
    player: 'white', turn: 2, whiteHiAlive: false, blackHiAlive: true,
  });
  await expect(page.getByTestId('cell-7-0')).not.toHaveAttribute('aria-label', /white Hi/);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('AI is using its backup engine.', {exact: true})).toHaveCount(0);
  await page.screenshot({path: info.outputPath('hard-opening-capture.png')});
});
