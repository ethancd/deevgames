import { test, expect, type Page } from '@playwright/test';

async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    (window as any).soundStarts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      (window as any).soundStarts.push({
        duration: this.buffer?.duration, time: performance.now(),
        whiteFire: Array.from(document.querySelectorAll('.board-cell')).find(cell => cell.getAttribute('aria-label')?.includes('white Hi, fire'))?.getAttribute('data-testid'),
      });
      return start.apply(this,args);
    };
  });
}
const starts = (page: Page) => page.evaluate(() => (window as any).soundStarts as {duration:number;time:number;whiteFire:string}[]);

test('phone sound controls persist independently of music; local movement, phasing, arrival and promotion have short cues', async ({page}) => {
  await page.setViewportSize({width:390,height:664});
  await observeAudio(page);
  await page.goto('./');
  expect(await starts(page)).toEqual([]);
  await page.getByRole('button',{name:'Pass & Play'}).click();
  // Phasing is the only ruleset since 2026-09-21; there is no control to pick it.
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  expect(await starts(page)).toEqual([]);
  await page.getByTestId('cell-1-0').click();
  expect(await starts(page)).toEqual([]);
  await page.getByTestId('cell-2-0').click();
  await expect.poll(async()=>(await starts(page)).length).toBe(1);
  expect((await starts(page))[0].duration).toBeCloseTo(.085,3);
  await page.getByRole('button',{name:/Undo/}).click();
  expect(await starts(page)).toHaveLength(1);
  await page.getByRole('button',{name:'Mine & prepare'}).click();
  await page.getByRole('button',{name:/Summon Hi/}).click();
  await page.getByTestId('cell-0-0').click();
  await expect.poll(async()=>(await starts(page)).length).toBe(2);
  expect((await starts(page))[1].duration).toBeCloseTo(.14,3);
  await page.getByRole('button',{name:'End turn'}).click();
  await page.getByText('Tap anywhere to continue').click();
  await page.getByRole('button',{name:'Mine & prepare'}).click();
  await page.getByRole('button',{name:'End turn'}).click();
  await page.getByText('Tap anywhere to continue').click();
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label',/white Hi, fire/);
  const sequence=await starts(page);
  expect(sequence.map(s=>Math.round(s.duration*1000))).toEqual([85,140,75,120,75,115,120]);
  await page.getByRole('button',{name:'Mine & prepare'}).click();
  await page.getByTestId('cell-0-0').click();
  await page.getByRole('button',{name:/Promote/}).click();
  await expect.poll(async()=>(await starts(page)).length).toBe(8);
  expect((await starts(page)).at(-1)?.duration).toBeCloseTo(.14,3);
  await page.getByRole('button',{name:'Sound and music'}).click();
  await expect(page.getByRole('dialog',{name:'Sound & music'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Test sound'})).toBeInViewport();
  await page.getByRole('button',{name:'Test sound'}).click();
  await expect.poll(async()=>(await starts(page)).length).toBe(9);
  await page.getByRole('button',{name:'Sound effects',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sound effects',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button',{name:'Play music'})).toBeEnabled();
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'End turn'}).click();
  expect(await starts(page)).toHaveLength(9);
  await page.reload();
  await page.getByRole('button',{name:'Sound and music'}).click();
  await expect(page.getByRole('button',{name:'Sound effects',exact:true})).toHaveAttribute('aria-pressed','false');
  expect(await starts(page)).toEqual([]);
});

for(const mode of ['slow','fast']) test(`incoming ${mode} moves sound at each visible hop, followed by your turn start`,async({page,request})=>{
  await observeAudio(page);
  const host=await(await request.post('/api/muju/rooms',{data:{name:'Sound opponent',side:'white'}})).json();
  await page.goto(`?room=${host.room.id}#invite=${host.inviteCode}`);
  await page.getByRole('button',{name:'Join room',exact:true}).click();
  await expect(page.locator('.turn-strip')).toContainText('Sound opponent');
  await page.getByRole('combobox',{name:'Replay mode'}).selectOption(mode);
  const room=await(await request.get(`/api/muju/rooms/${host.room.id}`)).json();
  const unit=room.state.board.units.find((u:any)=>u.owner==='white'&&u.definitionId==='fire_1');
  expect(await starts(page)).toEqual([]);
  expect((await request.post(`/api/muju/rooms/${host.room.id}/actions`,{headers:{Authorization:`Bearer ${host.credentials.token}`},
    data:{expectedRevision:room.revision,requestId:'sound-moves',actions:[{type:'MOVE',unitId:unit.id,to:{x:6,y:0}},{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}]}})).ok()).toBe(true);
  await expect(page.getByRole('button',{name:'Mine & prepare'})).toBeEnabled({timeout:12000});
  const events=await starts(page);
  expect(events.map(e=>e.whiteFire)).toEqual(['cell-3-0','cell-5-0','cell-6-0','cell-6-0']);
  expect(events.map(e=>Math.round(e.duration*1000))).toEqual([85,85,85,120]);
  for(let i=1;i<3;i++) expect(events[i].time-events[i-1].time).toBeGreaterThanOrEqual((mode==='fast'?300:1000)-50);
});
