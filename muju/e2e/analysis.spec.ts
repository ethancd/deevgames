import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';

async function expectAnalysisFits(page: Page, reviewing: boolean) {
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth <= innerWidth,
    height: document.documentElement.scrollHeight <= innerHeight + 1,
  }))).toEqual({ width: true, height: true });
  const board = (await page.locator('.battle-board').boundingBox())!;
  // A rendered grid with 100 cells can still have collapsed to a tiny sliver.
  expect(board.width).toBeGreaterThanOrEqual(Math.min(reviewing ? 260 : 180, viewport.width - 24, viewport.height * (reviewing ? .35 : .25)));
  expect(Math.abs(board.width - board.height)).toBeLessThanOrEqual(1);
  for (const selector of ['.battle-board', '.analysis-controls', '.reference-bar']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
}

for (const [width, height] of [[320, 568], [390, 664], [390, 844], [844, 390], [1280, 800]]) {
  test(`Phasing analysis keeps the board usable after an online timeout at ${width}x${height}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height });
    const host = await (await request.post('/api/muju/rooms', { data: {
      name: 'White', ruleset: 'phasing', timeControl: { delaySeconds: 0, bankSeconds: 3 },
    } })).json();
    const id = host.room.id;
    await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } });
    const prepared = await request.post(`/api/muju/rooms/${id}/actions`, {
      headers: { Authorization: `Bearer ${host.credentials.token}` },
      data: { expectedRevision: 1, requestId: 'analysis-summon', actions: [
        { type: 'END_ACTION_PHASE' }, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } },
      ] },
    });
    expect(prepared.ok(), await prepared.text()).toBe(true);
    await page.goto(`?room=${id}&watch=1`);
    await expect(page.getByRole('link', { name: 'Analyze this game', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: 'Analyze this game', exact: true }).click();
    const controls = page.getByRole('region', { name: 'Analysis controls' });
    await expect(controls.getByRole('status')).toHaveText('Black wins on time');
    await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /phasing in/);
    await expectAnalysisFits(page, true);
    await page.screenshot({ path: info.outputPath('phasing-timeout-analysis.png'), fullPage: true });
    await page.getByTestId('cell-0-0').click();
    expect(await page.locator('.attack-frontier-marker').count()).toBeGreaterThan(0);
    await expectAnalysisFits(page, true);
    await page.reload();
    await expect(controls.getByRole('status')).toHaveText('Black wins on time');
    await expectAnalysisFits(page, true);
    await controls.getByRole('button', { name: 'First position' }).click();
    await expect(controls.getByRole('button', { name: 'Explore from here' })).toBeEnabled();
    await expectAnalysisFits(page, true);
    await controls.getByRole('button', { name: 'Explore from here' }).click();
    await expect(controls).toContainText('Private variation');
    await page.getByTestId('cell-1-0').click();
    await page.getByTestId('cell-3-0').click();
    await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    await expectAnalysisFits(page, false);
    await controls.getByRole('button', { name: 'Return to game score' }).click();
    await expect(controls.getByRole('status')).toHaveText('Black wins on time');
    await expectAnalysisFits(page, true);
    const actual = await (await request.get(`/api/muju/rooms/${id}`)).json();
    expect(actual.revision).toBe(3);
    expect(actual.state.victoryReason).toBe('timeout');
    expect(actual.state.pendingSummons).toHaveLength(1);
  });
}

for (const scenario of [
  { mode: 'Pass & Play', width: 1280 }, { mode: 'Pass & Play', width: 390 },
  { mode: 'vs AI', width: 390 }, { mode: 'Watch AI', width: 1280 },
]) {
  test(`${scenario.mode} can analyze a completed game and explore without changing its saved score at ${scenario.width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const state = createInitialGameState(Array(100).fill(0)); state.inactivityPlies = 9;
    await page.addInitScript(({ state, schemaVersion }) => {
      if (sessionStorage.getItem('analysis:seeded')) return;
      localStorage.setItem('elemental-tactics-save', JSON.stringify({ state, schemaVersion, timestamp: Date.now() }));
      sessionStorage.setItem('analysis:seeded', '1');
    }, { state, schemaVersion: SCHEMA_VERSION });
    await page.goto('./');
    await page.getByRole('button', { name: new RegExp(`^${scenario.mode}`) }).click();
    if (scenario.mode === 'Watch AI') {
      await page.getByRole('combobox').nth(0).selectOption('easy');
      await page.getByRole('combobox').nth(1).selectOption('easy');
    }
    await page.getByRole('button', { name: /Continue saved game/ }).click();
    if (scenario.mode !== 'Watch AI') {
      await page.getByTestId('cell-1-0').click(); await page.getByTestId('cell-5-0').click();
      await page.getByRole('button', { name: 'End turn →', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Draw by inactivity' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Analyze this game', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('analyze-game-end.png') });
    const saved = await page.evaluate(() => localStorage.getItem('elemental-tactics-save'));
    await page.getByRole('link', { name: 'Analyze this game', exact: true }).click();
    await expect(page).toHaveURL(/analysis\?local=1/);
    const controls = page.getByRole('region', { name: 'Analysis controls' });
    await expect(controls.getByRole('status')).toHaveText('Draw');
    await expect(controls.getByRole('button', { name: 'Explore from here' })).toBeDisabled();
    await page.reload();
    await expect(controls.getByRole('status')).toHaveText('Draw');
    await controls.getByRole('button', { name: 'First position' }).click();
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    if (scenario.mode !== 'Watch AI') {
      await controls.getByRole('button', { name: 'Next step', exact: true }).click();
      await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
      await controls.getByRole('button', { name: 'First position' }).click();
    }
    await controls.getByRole('button', { name: 'Explore from here' }).click();
    await page.getByTestId('cell-1-0').click(); await page.getByTestId('cell-3-0').click();
    await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Return to game score' }).click();
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Last position' }).click();
    await expect(controls.getByRole('status')).toHaveText('Draw');
    expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBe(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const role of ['white', 'black', 'observer'] as const) {
  test(`online ${role} can analyze directly from the result and return to the same seat or observer view`, async ({ page, request }) => {
    const host = await (await request.post('/api/muju/rooms', { data: { name: 'White' } })).json();
    const id = host.room.id;
    const guest = await (await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } })).json();
    const opening = await request.post(`/api/muju/rooms/${id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
      data: { expectedRevision: 1, requestId: 'analysis-pass', actions: [{ type: 'END_ACTION_PHASE' }] } });
    expect(opening.ok(), await opening.text()).toBe(true);
    const ended = await request.post(`/api/muju/rooms/${id}/actions`, { headers: { Authorization: `Bearer ${guest.credentials.token}` },
      data: { expectedRevision: 2, requestId: 'analysis-resign', actions: [{ type: 'RESIGN' }] } });
    expect(ended.ok(), await ended.text()).toBe(true);
    if (role !== 'observer') {
      await page.addInitScript(credentials => {
        const connection = { ...credentials, serverUrl: window.location.origin };
        localStorage.setItem(`muju:online:${connection.serverUrl}:${connection.roomId}`, JSON.stringify(connection));
      }, role === 'white' ? host.credentials : guest.credentials);
    }
    await page.goto(`?room=${id}${role === 'observer' ? '&watch=1' : ''}`);
    await expect(page.getByRole('heading', { name: 'White Wins!' })).toBeVisible();
    await page.getByRole('link', { name: 'Analyze this game', exact: true }).click();
    const controls = page.getByRole('region', { name: 'Analysis controls' });
    await expect(controls.getByRole('status')).toHaveText('White wins');
    await controls.getByRole('button', { name: 'First position' }).click();
    await expect(controls.getByRole('button', { name: 'Explore from here' })).toBeEnabled();
    await controls.getByRole('link', { name: 'Back to room' }).click();
    await expect(page.getByRole('region', { name: 'Online room' })).toContainText(role === 'observer' ? 'Online · Observer' : `Online · You are ${role}`);
    const actual = await (await request.get(`/api/muju/rooms/${id}`)).json();
    expect(actual.revision).toBe(3);
  });
}

test('an upkeep position can be reviewed and varied while timeline navigation remains available', async ({ page, request }) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'White' } })).json();
  const id = host.room.id;
  const black = await (await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } })).json();
  const hi = host.room.state.board.units.find((u: any) => u.owner === 'white' && u.definitionId === 'fire_1');
  let revision = 1;
  for (const [token, actions] of [
    [host.credentials.token, [{ type: 'END_ACTION_PHASE' }]],
    [black.credentials.token, [{ type: 'END_ACTION_PHASE' }]],
    [host.credentials.token, [{ type: 'PROMOTE_UNIT', unitId: hi.id }, { type: 'END_ACTION_PHASE' }]],
    [black.credentials.token, [{ type: 'END_PLACE_PHASE' }, { type: 'END_ACTION_PHASE' }]],
  ] as const) {
    const response = await request.post(`/api/muju/rooms/${id}/actions`, { headers: { Authorization: `Bearer ${token}` },
      data: { expectedRevision: revision, requestId: `analysis-upkeep-${revision++}`, actions } });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const score = await (await request.get(`/api/muju/rooms/${id}/history`)).json();
  const end = score.entries.find((entry: any) => entry.kind === 'mining' && entry.player === 'black' && entry.turnNumber === 2);
  await page.goto(`analysis?room=${id}&event=${end.sequence}`);
  const controls = page.getByRole('region', { name: 'Analysis controls' });
  await expect(page.getByRole('dialog', { name: 'Choose upkeep' })).toHaveCount(0);
  await controls.getByRole('button', { name: 'Explore from here' }).click();
  const upkeep = page.getByRole('region', { name: 'Choose upkeep' });
  await expect(upkeep).toBeVisible();
  await upkeep.getByRole('checkbox', { name: /Hono/ }).uncheck();
  await upkeep.getByRole('button', { name: 'Pay upkeep & continue' }).click();
  await expect(page.getByTestId('cell-1-0')).not.toHaveAttribute('aria-label', /Hono/);
  await controls.getByRole('button', { name: 'Previous step' }).click();
  await expect(upkeep).toBeVisible();
  await controls.getByRole('button', { name: 'Next step' }).click();
  await expect(upkeep).toHaveCount(0);
  const live = await (await request.get(`/api/muju/rooms/${id}`)).json();
  expect(live.state.board.units.find((u: any) => u.id === hi.id).definitionId).toBe('fire_2');
  expect(live.revision).toBe(5);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`analysis sandbox controls both players and rewinds across turns at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await page.evaluate(() => localStorage.setItem('elemental-tactics-save', 'my existing game'));
    await page.getByRole('link', { name: /Analysis board/ }).click();
    const controls = page.getByRole('region', { name: 'Analysis controls' });
    await expect(controls).toContainText('You control both players');
    await page.getByTestId('cell-1-0').click();
    await page.getByTestId('cell-5-0').click();
    await expect(page.getByTestId('cell-5-0')).toHaveAttribute('aria-label', /white Hi/);
    await expect(controls).toContainText('step 2/2');
    await controls.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.getByTestId('cell-5-0')).toHaveAttribute('aria-label', /white Hi/);
    await page.getByRole('button', { name: 'End turn →', exact: true }).click();
    await expect(page.locator('.turn-strip')).toContainText('Black');
    await expect(page.getByText('Pass device to')).toHaveCount(0);
    await page.getByTestId('cell-8-9').click();
    await page.getByTestId('cell-7-9').click();
    await expect(page.getByTestId('cell-7-9')).toHaveAttribute('aria-label', /black Hi/);
    await controls.getByRole('button', { name: 'Previous turn', exact: true }).click();
    await expect(page.locator('.turn-strip')).toContainText('White');
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Next turn', exact: true }).click();
    await expect(page.locator('.turn-strip')).toContainText('Black');
    await controls.getByRole('button', { name: 'Last position', exact: true }).click();
    await expect(page.getByTestId('cell-7-9')).toHaveAttribute('aria-label', /black Hi/);
    await page.screenshot({ path: testInfo.outputPath('analysis-sandbox.png'), fullPage: true });
    expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBe('my existing game');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`room analysis loads recorded steps and isolates variations at ${viewport.width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize(viewport);
    const host = await (await request.post('/api/muju/rooms', { data: { name: 'White' } })).json();
    const id = host.room.id;
    await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } });
    const hi = host.room.state.board.units.find((u: any) => u.owner === 'white' && u.definitionId === 'fire_1');
    const played = await request.post(`/api/muju/rooms/${id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
      data: { expectedRevision: 1, requestId: 'analysis-opening', actions: [{ type: 'MOVE', unitId: hi.id, to: { x: 5, y: 0 } }, { type: 'END_ACTION_PHASE' }] } });
    expect(played.ok()).toBe(true);
    const actual = await played.json();
    await page.goto(`?room=${id}&watch=1`);
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await page.getByRole('link', { name: '🔥1 B1→F1', exact: true }).click();
    const controls = page.getByRole('region', { name: 'Analysis controls' });
    await expect(controls).toContainText('step 2/2');
    await expect(page.getByTestId('cell-5-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Explore from here', exact: true }).click();
    await page.getByTestId('cell-3-0').click(); await page.getByTestId('cell-3-1').click();
    await expect(page.getByTestId('cell-3-1')).toHaveAttribute('aria-label', /white Hi/);
    await expect(controls).toContainText('Private variation');
    const unchanged = await (await request.get(`/api/muju/rooms/${id}`)).json();
    expect(unchanged).toEqual(actual);
    await controls.getByRole('button', { name: 'Return to game score', exact: true }).click();
    await expect(controls).toContainText('Game analysis');
    await expect(page.getByTestId('cell-5-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'First position', exact: true }).click();
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    await controls.getByRole('button', { name: 'Next turn', exact: true }).click();
    await expect(page.locator('.turn-strip')).toContainText('Black');
    await page.screenshot({ path: testInfo.outputPath('analysis-review.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
