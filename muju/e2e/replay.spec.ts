import { test, expect, type Page } from '@playwright/test';

const regions = ['.battle-board', '.board-stage', '.decision-panel', '.play-footer', '.instant-replay-button'];
async function geometry(page: Page) {
  return page.evaluate(selectors => selectors.map(selector => {
    const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
    return { selector, x:x+window.scrollX, y:y+window.scrollY, width, height };
  }), regions);
}
function sameGeometry(actual: Awaited<ReturnType<typeof geometry>>, expected: Awaited<ReturnType<typeof geometry>>) {
  for (const [i, region] of actual.entries()) for (const key of ['x','y','width','height'] as const) {
    expect(Math.abs(region[key] - expected[i][key]), `${region.selector} ${key}`).toBeLessThan(1);
  }
}

for (const viewport of [{width:900,height:1000},{width:390,height:844},{width:1280,height:800},{width:390,height:568},{width:844,height:390}]) {
  test(`replay layout stays fixed during confirmation, handoff and playback at ${viewport.width}x${viewport.height}`, async ({page,request},testInfo) => {
    await page.setViewportSize(viewport);
    const created=await request.post('/api/muju/rooms',{data:{name:'Opponent',side:'black'}});
    const host=await created.json(), roomId=host.room.id;
    await page.goto(`?room=${roomId}#invite=${host.inviteCode}`);
    await page.getByLabel('Your name',{exact:true}).fill('Human');
    await page.getByRole('button',{name:'Join room'}).click();
    await expect(page.getByRole('button',{name:'End turn →'})).toBeEnabled();
    const launcher=page.getByRole('button',{name:'↶ Instant replay',exact:true});
    await expect(launcher).toBeDisabled();
    await page.getByTestId('cell-1-0').click();
    const initial=await geometry(page);
    expect(initial[0].height).toBeGreaterThan(240);
    let release!:()=>void, received!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const arrived=new Promise<void>(resolve=>{received=resolve;});
    await page.route('**/api/muju/rooms/*/actions',async route=>{received();await gate;await route.continue();});
    await page.getByTestId('cell-2-0').click(); await arrived;
    await expect(page.getByText('Confirming move…',{exact:true})).toBeVisible();
    sameGeometry(await geometry(page),initial);
    release(); await expect(page.getByRole('button',{name:'End turn →'})).toBeEnabled();
    await page.unroute('**/api/muju/rooms/*/actions');
    sameGeometry(await geometry(page),initial);
    await page.getByRole('button',{name:'End turn →'}).click();
    await expect(page.locator('.turn-strip')).toContainText('Opponent');
    sameGeometry(await geometry(page),initial);
    const room=await (await request.get(`/api/muju/rooms/${roomId}`)).json();
    const unit=room.state.board.units.find((u:any)=>u.owner==='black'&&u.definitionId==='fire_1');
    const actions=[{type:'MOVE',unitId:unit.id,to:{x:7,y:9}},{type:'MOVE',unitId:unit.id,to:{x:6,y:9}},{type:'END_ACTION_PHASE'}];
    expect((await request.post(`/api/muju/rooms/${roomId}/actions`,{headers:{Authorization:`Bearer ${host.credentials.token}`},data:{expectedRevision:room.revision,requestId:'opponent-turn',actions}})).ok()).toBe(true);
    await expect(launcher).toBeEnabled();
    sameGeometry(await geometry(page),initial);
    await launcher.click();
    await page.getByRole('button',{name:'Pause replay',exact:true}).click();
    sameGeometry(await geometry(page),initial);
    await expect(page.locator('.battle-board')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const controls=page.locator('.turn-replay');
    expect(await controls.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
    if (viewport.width > viewport.height && viewport.height <= 600) {
      expect(await page.locator('.decision-panel').evaluate(el =>
        el.getBoundingClientRect().top >= document.querySelector('.progress-clock')!.getBoundingClientRect().bottom)).toBe(true);
    }
    await page.screenshot({path:testInfo.outputPath('replay.png'),fullPage:true});
    await page.getByRole('button',{name:'Next replay action'}).click();
    sameGeometry(await geometry(page),initial);
    await expect(page.getByTestId('cell-7-9')).toHaveAttribute('aria-label',/black Hi/);
    await page.getByRole('button',{name:'Previous replay action'}).click();
    await expect(page.getByTestId('cell-8-9')).toHaveAttribute('aria-label',/black Hi/);
    await page.keyboard.press('Escape');
    await expect(launcher).toBeFocused();
    await expect(page.getByTestId('cell-6-9')).toHaveAttribute('aria-label',/black Hi/);
    sameGeometry(await geometry(page),initial);
  });
}
