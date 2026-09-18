import { test, expect, type Page } from '@playwright/test';

const SELECTORS = ['.game-shell', '.game-overview', '.game-header', '.turn-strip', '.score-strip', '.progress-clock', '.play-area', '.board-stage', '.battle-board', '.board-key', '.decision-panel', '.play-footer', '.analysis-controls', '.reference-bar', '.summoning-slot', '.analysis-position', '.instant-replay-launcher', '.turn-replay', '.analysis-navigation'];

async function dump(page: Page, label: string) {
  const data = await page.evaluate(selectors => {
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
    const out: Record<string, unknown> = {
      inner: { w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight },
      bodyFont: getComputedStyle(document.body).fontFamily, ua: navigator.userAgent,
    };
    for (const s of selectors) {
      const el = document.querySelector(s); if (!el) { out[s] = null; continue; }
      const cs = getComputedStyle(el);
      out[s] = { ...rect(el), sh: el.scrollHeight, ch: el.clientHeight, display: cs.display, rows: cs.gridTemplateRows, cols: cs.gridTemplateColumns, fs: cs.fontSize, lh: cs.lineHeight, cls: el.className };
    }
    const children = (sel: string) => [...(document.querySelector(sel)?.children ?? [])].map(c => ({ tag: c.tagName, cls: c.className, ...rect(c), sh: c.scrollHeight, lines: Math.round(c.getBoundingClientRect().height / (parseFloat(getComputedStyle(c).lineHeight) || 1) * 10) / 10 }));
    out.shellChildren = children('.game-shell');
    out.overviewChildren = children('.game-overview');
    out.scoreStripChildren = children('.score-strip');
    out.scoreSmalls = [...document.querySelectorAll('.score-strip small')].map(c => ({ text: c.textContent, ...rect(c), font: getComputedStyle(c).fontFamily, fs: getComputedStyle(c).fontSize, lh: getComputedStyle(c).lineHeight }));
    out.analysisControlsChildren = children('.analysis-controls');
    out.footerChildren = children('.play-footer');
    out.headerChildren = children('.game-header');
    out.decisionChildren = children('.decision-panel');
    const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:16px;line-height:normal';
    probe.textContent = 'Muju Hono Tanka Phasing'; document.body.appendChild(probe);
    const pr = probe.getBoundingClientRect(); probe.style.fontSize = '12px'; const pr12 = probe.getBoundingClientRect(); probe.remove();
    out.fontProbe = { w16: +pr.width.toFixed(2), h16: +pr.height.toFixed(2), w12: +pr12.width.toFixed(2), h12: +pr12.height.toFixed(2), interLoaded: document.fonts.check('16px Inter'), fontsSize: document.fonts.size };
    return out;
  }, SELECTORS);
  console.log(`DIAG ${label} ${JSON.stringify(data)}`);
}

test('diag: phasing analysis at 320x568', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'White', ruleset: 'phasing', timeControl: { delaySeconds: 0, bankSeconds: 3 } } })).json();
  const id = host.room.id;
  await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } });
  const prepared = await request.post(`/api/muju/rooms/${id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
    data: { expectedRevision: 1, requestId: 'analysis-summon', actions: [{ type: 'END_ACTION_PHASE' }, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }] } });
  expect(prepared.ok(), await prepared.text()).toBe(true);
  await page.goto(`?room=${id}&watch=1`);
  await expect(page.getByRole('link', { name: 'Analyze this game', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: 'Analyze this game', exact: true }).click();
  const controls = page.getByRole('region', { name: 'Analysis controls' });
  await expect(controls.getByRole('status')).toHaveText('Black wins on time');
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /phasing in/);
  await dump(page, 'analysis-320x568-reviewing');
  await controls.getByRole('button', { name: 'First position' }).click();
  await expect(controls.getByRole('button', { name: 'Explore from here' })).toBeEnabled();
  await controls.getByRole('button', { name: 'Explore from here' }).click();
  await expect(controls).toContainText('Private variation');
  await page.getByTestId('cell-1-0').click();
  await page.getByTestId('cell-3-0').click();
  await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
  await dump(page, 'analysis-320x568-exploring');
  await page.screenshot({ path: info.outputPath('analysis-320x568-exploring.png'), fullPage: true });
});

test('diag: replay at 844x390', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const created = await request.post('/api/muju/rooms', { data: { name: 'Opponent', side: 'black' } });
  const host = await created.json(), roomId = host.room.id;
  await page.goto(`?room=${roomId}#invite=${host.inviteCode}`);
  await page.getByLabel('Your name', { exact: true }).fill('Human');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('button', { name: 'End turn →' })).toBeEnabled();
  await dump(page, 'replay-844x390-initial');
  await page.getByTestId('cell-1-0').click();
  await page.getByTestId('cell-2-0').click();
  await expect(page.getByRole('button', { name: 'End turn →' })).toBeEnabled();
  await page.getByRole('button', { name: 'End turn →' }).click();
  await expect(page.locator('.turn-strip')).toContainText('Opponent');
  const room = await (await request.get(`/api/muju/rooms/${roomId}`)).json();
  const unit = room.state.board.units.find((u: any) => u.owner === 'black' && u.definitionId === 'fire_1');
  const actions = [{ type: 'MOVE', unitId: unit.id, to: { x: 3, y: 9 } }, { type: 'END_ACTION_PHASE' }];
  expect((await request.post(`/api/muju/rooms/${roomId}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` }, data: { expectedRevision: room.revision, requestId: 'opponent-turn', actions } })).ok()).toBe(true);
  const launcher = page.getByRole('button', { name: '↶ Instant replay', exact: true });
  await expect(launcher).toBeEnabled({ timeout: 12000 });
  await dump(page, 'replay-844x390-before-replay');
  await page.getByRole('combobox', { name: 'Replay mode' }).selectOption('step');
  await launcher.click();
  await expect(page.getByRole('button', { name: 'Next replay action' })).toBeFocused();
  await dump(page, 'replay-844x390-in-replay');
  await page.screenshot({ path: info.outputPath('replay-844x390.png'), fullPage: true });
});
