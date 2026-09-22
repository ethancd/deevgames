import { test, expect } from '@playwright/test';

// Phasing opens every turn in the Act phase, whatever the handicap can afford,
// so the granted crystals are read from Black's bank rather than from a place
// phase that Standard used to skip when nothing was purchasable.
for (const amount of [1, 2, 3, 20]) test(`local ${amount}-crystal handicap starts and resumes Black's opening`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('combobox', { name: 'Black crystal handicap' }).selectOption(String(amount));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: /Mine & prepare/ }).click();
  await page.getByRole('button', { name: /End turn/ }).click();
  await page.getByText('Tap anywhere to continue').click();
  const black = page.locator('.score-strip > div').first();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(black).toContainText(`Player 2 ◆ ${amount}`);
  await page.reload();
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(black).toContainText(`Player 2 ◆ ${amount}`);
});

for (const amount of [2, 20]) test(`online ${amount}-crystal handicap reaches the authoritative room`, async ({ page, request }) => {
  await page.goto('./?online=1');
  await page.getByRole('combobox', { name: 'Your side' }).selectOption('black');
  await page.getByRole('combobox', { name: 'Black crystal handicap' }).selectOption(String(amount));
  const created = page.waitForResponse(r => r.url().endsWith('/api/muju/rooms') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  const host = await (await created).json();
  expect(host.room.state.players.black.resources).toBe(amount);
  const guest = await (await request.post(`/api/muju/rooms/${host.room.id}/join`, { data: { name: 'Handicap QA White', inviteCode: host.inviteCode } })).json();
  try {
    const handedOff = await request.post(`/api/muju/rooms/${host.room.id}/actions`, {
      headers: { Authorization: `Bearer ${guest.credentials.token}` },
      data: { expectedRevision: guest.room.revision, requestId: `handicap-first-turn-${amount}`,
        actions: [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }] },
    });
    expect(handedOff.ok(), await handedOff.text()).toBe(true);
    await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
    await page.getByRole('button', { name: 'Room details', exact: true }).click();
    await expect(page.getByText(`Black crystal handicap · ${amount} starting crystals`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  } finally {
    const room = await (await request.get(`/api/muju/rooms/${host.room.id}`)).json();
    await request.post(`/api/muju/rooms/${host.room.id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
      data: { expectedRevision: room.revision, requestId: `handicap-finish-${amount}`, actions: [{ type: 'RESIGN' }] } });
  }
});
