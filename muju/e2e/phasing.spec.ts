import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) test(`Phasing local lifecycle, undo, resume and accessible ghosts (${width}px)`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  // No ruleset control since 2026-09-21: Phasing is the only ruleset, and the
  // badge on the game screen is what says so.
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await expect(page.getByRole('button', { name: 'Summon Hi', exact: false })).toBeEnabled();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeVisible();
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await page.getByRole('button', { name: /Summon Hi/ }).click();
  await page.getByTestId('cell-0-0').click();
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /white Hi phasing in, not an occupant/);
  await expect(page.getByRole('region', { name: 'Phasing summons' })).toContainText('3 ◆ committed');
  await page.screenshot({ path: info.outputPath('phasing-preparation.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await expect(page.getByTestId('summon-0-0')).toBeVisible();
  await page.getByRole('button', { name: 'End turn' }).click();
  await page.getByText('Tap anywhere to continue').click();
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await page.getByRole('button', { name: 'End turn' }).click();
  await page.getByText('Tap anywhere to continue').click();
  await expect(page.getByTestId('summon-0-0')).toHaveCount(0);
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /white Hi, fire, tier 1/);
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await page.getByTestId('cell-0-0').click();
  await page.getByRole('button', { name: /Promote/ }).click();
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /white Honō, fire, tier 2/);
  await page.screenshot({ path: info.outputPath('phasing-arrival-promotion.png'), fullPage: true });
  await page.getByRole('button', { name: 'How to play' }).click();
  // One deck since 2026-09-21: these rules are the rules, not an experiment
  // sitting beside another set.
  await expect(page.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Choose Mine & prepare to collect mining and pay upkeep.');
  await expect(page.getByText(/experimental/i)).toHaveCount(0);
});

test('Phasing online room, public observer, arrivals and analysis retain rules', async ({ page, request }, info) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('button', { name: 'Room details', exact: true }).click();
    await page.getByText('Private reconnect details', { exact: true }).click();
  const credentials = JSON.parse(await page.getByLabel('Private seat credentials').inputValue());
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const joined = await request.post(`/api/muju/rooms/${credentials.roomId}/join`, { data: { name: 'Black test', inviteCode: credentials.inviteCode } });
  const guest = await joined.json();
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await page.getByRole('button', { name: /Summon Hi/ }).click();
  await page.getByTestId('cell-0-0').click();
  await page.getByRole('button', { name: 'End turn' }).click();
  const response = await request.get(`/api/muju/rooms/${credentials.roomId}`), room = await response.json();
  expect(room.state.ruleset).toBe('phasing'); expect(room.state.pendingSummons).toHaveLength(1);
  const moved = await request.post(`/api/muju/rooms/${credentials.roomId}/actions`, { headers: { Authorization: `Bearer ${guest.credentials.token}` },
    data: { expectedRevision: room.revision, requestId: 'phasing-black-turn', actions: [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }] } });
  expect(moved.ok()).toBe(true);
  await expect(page.getByTestId('cell-0-0')).toHaveAttribute('aria-label', /white Hi, fire, tier 1/);
  await page.goto(`./?room=${credentials.roomId}&watch=1`);
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
  await expect(page.getByText('Online · Observer', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('phasing-online-observer.png'), fullPage: true });
  await page.goto(`./analysis?room=${credentials.roomId}&watch=1`);
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
  await expect(page.locator('.analysis-position')).toContainText('Arrival');
});
