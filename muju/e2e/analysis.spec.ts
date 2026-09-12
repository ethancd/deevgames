import { test, expect } from '@playwright/test';

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
