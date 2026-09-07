import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import { tacticalFixtures } from '../lab/ai/fixtures';
import type { GameState } from '../src/game/types';
async function start(page: Page, state: GameState, watch = false) {
  await page.addInitScript(saved => localStorage.setItem('elemental-tactics-save', JSON.stringify({schemaVersion:2,timestamp:Date.now(),state:saved})),state);
  await page.goto('./');
  await page.getByRole('button',{name:watch?'Watch AI Spectate AI vs AI match':'vs AI Play against the computer',exact:true}).click();
  for (const select of await page.locator('select').all()) await select.selectOption('hard');
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
}
test('built worker loads hashed WASM and performs a coordinated home rescue',async({page,context},info)=>{
  const fixture=tacticalFixtures().find(f=>f.name==='Metal IV / two Fire II / rotated black')!;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const binary=context.waitForEvent('response',r=>r.url().endsWith('.wasm'));
  const worker=page.waitForEvent('worker');
  await start(page,fixture.state);
  const native=await worker, closed=native.waitForEvent('close');
  expect(native.url()).toMatch(/\/muju\/assets\/entry-[^/]+\.js$/);
  const response=await binary;expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('application/wasm');
  const buffer=await response.body();expect([...buffer.subarray(0,4)]).toEqual([0,97,115,109]);
  await expect(page.getByTestId('cell-9-9')).not.toHaveAttribute('aria-label',/white Wakanwicasa/,{timeout:10000});
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
