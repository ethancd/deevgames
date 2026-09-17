import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

async function fits(page: Page) {
  expect(await page.evaluate(() => ({ width:document.documentElement.scrollWidth <= innerWidth, height:document.documentElement.scrollHeight <= innerHeight + 1 })) ).toEqual({width:true,height:true});
  for (const selector of ['.battle-board','.decision-panel','.play-footer']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
  }
  expect(await page.locator('.decision-panel').evaluate(e=>e.scrollHeight <= e.clientHeight+1)).toBe(true);
}
async function online(page: Page, request: APIRequestContext) {
  const host=await (await request.post('/api/muju/rooms',{data:{name:'Opponent',side:'black',ruleset:'phasing',timeControl:{delaySeconds:30,bankSeconds:600}}})).json();
  await page.goto(`?room=${host.room.id}#invite=${host.inviteCode}`);
  await page.getByRole('button',{name:'Join room',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mine & prepare'})).toBeEnabled();
  return host;
}
for (const [width,height] of [[320,568],[375,667],[390,664],[390,844],[430,932],[844,390]]) test(`timed Phasing fits ${width}x${height} through preparation, reach and arrivals`, async ({page,request},info)=>{
  await page.setViewportSize({width,height});
  const host=await online(page,request);
  await fits(page);
  await page.getByRole('button',{name:'Mine & prepare'}).click();
  await page.getByRole('button',{name:/Summon Hi/}).click();
  await page.getByTestId('cell-0-0').click();
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/phasing in/);
  await page.getByTestId('cell-0-0').click();
  await expect(page.locator('.unit-detail')).toContainText('Reach after arrival');
  expect(await page.locator('.attack-frontier-marker').count()).toBeGreaterThan(0);
  await fits(page);
  await page.screenshot({path:info.outputPath('phone-phasing-reach.png'),fullPage:true});
  await page.getByRole('button',{name:'End turn',exact:false}).click();
  await expect(page.locator('.turn-strip')).toContainText('Opponent');
  // Inspection works on your opponent's turn, with no command sent.
  await page.getByTestId('cell-0-0').click();
  await expect(page.locator('.unit-detail')).toContainText('Phasing in');
  const room=await (await request.get(`/api/muju/rooms/${host.room.id}`)).json();
  expect(room.state.pendingSummons).toHaveLength(1);
  await page.getByRole('combobox',{name:'Replay mode'}).selectOption('fast');
  const moved=await request.post(`/api/muju/rooms/${host.room.id}/actions`,{headers:{Authorization:`Bearer ${host.credentials.token}`},data:{expectedRevision:room.revision,requestId:'finish-turn',actions:[{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}]}});
  expect(moved.ok()).toBe(true);
  await expect(page.getByRole('button',{name:'Mine & prepare'})).toBeEnabled();
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/white Hi, fire/);
  await fits(page);
  await page.getByRole('button',{name:'Room details',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Room details'})).toContainText('Share watch link');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await fits(page);
});
for(const mode of ['slow','fast'] as const) test(`incoming online move shows every hop at ${mode} replay speed`,async({page,request})=>{
  await page.setViewportSize({width:390,height:664});
  const host=await online(page,request);
  await page.getByRole('combobox',{name:'Replay mode'}).selectOption(mode);
  await page.getByRole('button',{name:'Mine & prepare'}).click();
  await page.getByRole('button',{name:'End turn',exact:false}).click();
  await expect(page.locator('.turn-strip')).toContainText('Opponent');
  const room=await (await request.get(`/api/muju/rooms/${host.room.id}`)).json();
  const unit=room.state.board.units.find((u:any)=>u.owner==='black'&&u.definitionId==='fire_1');
  // Record rendered coordinates so a fast frame cannot pass between assertions.
  await page.evaluate(()=>{
    (window as any).seen=[];
    new MutationObserver(()=>{
      const cell=Array.from(document.querySelectorAll('.board-cell')).find(e=>e.getAttribute('aria-label')?.includes('black Hi, fire'));
      const value=cell?.getAttribute('data-testid');
      if(value && (window as any).seen.at(-1)?.value!==value)(window as any).seen.push({value,time:performance.now()});
    }).observe(document.querySelector('.battle-grid')!,{subtree:true,attributes:true,attributeFilter:['aria-label']});
  });
  expect((await request.post(`/api/muju/rooms/${host.room.id}/actions`,{headers:{Authorization:`Bearer ${host.credentials.token}`},data:{expectedRevision:room.revision,requestId:'move-batch',actions:[{type:'MOVE',unitId:unit.id,to:{x:3,y:9}},{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}]}})).ok()).toBe(true);
  await expect(page.getByText('Opponent’s move',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mine & prepare'})).toBeDisabled();
  await fits(page);
  await expect(page.getByRole('button',{name:'Mine & prepare'})).toBeEnabled({timeout:12000});
  const seen=await page.evaluate(()=>(window as any).seen);
  expect(seen.map((s:any)=>s.value)).toEqual(['cell-6-9','cell-4-9','cell-3-9']);
  const delay=mode==='fast'?300:1000;
  for(let i=1;i<seen.length;i++)expect(seen[i].time-seen[i-1].time).toBeGreaterThanOrEqual(delay-50);
  await page.getByRole('button',{name:'Instant replay',exact:false}).click();
  await expect(page.getByRole('region',{name:'Instant replay',exact:true})).toBeVisible();
  await fits(page);
});
