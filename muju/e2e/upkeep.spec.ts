import { test, expect } from '@playwright/test';

for (const viewport of [{width:390,height:844},{width:1280,height:800}]) {
  test(`automatic upkeep can be undone and reselected online at ${viewport.width}x${viewport.height}`, async ({page,request},testInfo) => {
    await page.setViewportSize(viewport);
    const host=await (await request.post('/api/muju/rooms',{data:{name:'Opponent',side:'black'}})).json();
    const id=host.room.id;
    const read=async()=>await (await request.get(`/api/muju/rooms/${id}`)).json();
    let serial=0;
    const finishBlack=async()=>{
      const room=await read();
      expect(room.state.turn.currentPlayer).toBe('black');
      const actions=room.state.turn.phase==='place' ? [{type:'END_PLACE_PHASE'},{type:'END_ACTION_PHASE'}] : [{type:'END_ACTION_PHASE'}];
      expect((await request.post(`/api/muju/rooms/${id}/actions`,{headers:{Authorization:`Bearer ${host.credentials.token}`},
        data:{expectedRevision:room.revision,requestId:`black-upkeep-${serial++}`,actions}})).ok()).toBe(true);
    };
    await page.goto(`?room=${id}#invite=${host.inviteCode}`);
    await page.getByLabel('Your name',{exact:true}).fill('Human');
    await page.getByRole('button',{name:'Join room'}).click();
    await expect(page.getByRole('button',{name:'End turn →'})).toBeEnabled();
    await page.getByRole('button',{name:'End turn →'}).click();
    await expect(page.locator('.turn-strip')).toContainText('Opponent');
    await finishBlack();
    await expect(page.getByRole('button',{name:'Start actions →'})).toBeEnabled();
    await page.getByTestId('cell-1-0').click();
    await page.getByRole('button',{name:/^Promote ·/}).click();
    await expect(page.getByRole('button',{name:'End turn →'})).toBeEnabled();
    await page.getByRole('button',{name:'End turn →'}).click();
    await expect(page.locator('.turn-strip')).toContainText('Opponent');
    await finishBlack();
    const undo=page.getByRole('button',{name:'↶ Undo',exact:true});
    await expect(undo).toBeEnabled();
    await expect(page.getByRole('dialog',{name:'Choose upkeep'})).toHaveCount(0);
    const paid=(await read()).state;
    expect(paid.lastUpkeep.paid).toBe(1);
    await page.reload();
    await expect(undo).toBeEnabled();
    await undo.click();
    const dialog=page.getByRole('dialog',{name:'Choose upkeep'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText(`Upkeep 1 / ${paid.players.white.resources+1} crystals`);
    await expect(dialog.getByRole('checkbox',{name:/Sjor/})).toBeDisabled();
    await page.reload();
    await expect(dialog).toBeVisible();
    const hono=dialog.getByRole('checkbox',{name:/Hono/});
    await hono.uncheck();
    await expect(dialog.getByRole('status')).toContainText('1 released');
    await page.screenshot({path:testInfo.outputPath('upkeep-choice.png'),fullPage:true});
    let release!:()=>void,received!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const arrived=new Promise<void>(resolve=>{received=resolve;});
    await page.route('**/api/muju/rooms/*/actions',async route=>{received();await gate;await route.continue();});
    await dialog.getByRole('button',{name:'Pay upkeep & continue'}).click(); await arrived;
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-busy','true');
    await expect(hono).not.toBeChecked();await expect(hono).toBeDisabled();
    await expect(dialog.getByRole('button',{name:'Confirming upkeep…'})).toBeDisabled();
    release();await expect(dialog).toHaveCount(0);
    await page.unroute('**/api/muju/rooms/*/actions');
    const released=(await read()).state;
    expect(released.players.white.resources).toBe(paid.players.white.resources+1);
    expect(released.lastUpkeep.released).toHaveLength(1);
    await expect(undo).toBeEnabled();await undo.click();
    await expect(dialog).toBeVisible();await expect(hono).toBeChecked();
    await dialog.getByRole('button',{name:'Pay upkeep & continue'}).click();
    await expect(dialog).toHaveCount(0);
    expect((await read()).state.players.white).toEqual(paid.players.white);
  });
}
