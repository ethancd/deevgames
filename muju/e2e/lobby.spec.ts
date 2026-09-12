import { test, expect } from '@playwright/test';

test('phone lobby discovers games, watches with one tap, and refreshes after a result', async ({ browser, request }, testInfo) => {
  test.setTimeout(45000);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  const hosted = await (await request.post('/api/muju/rooms', { data: { name: 'Lobby White' } })).json();
  const roomId = hosted.room.id;
  const guest = await (await request.post(`/api/muju/rooms/${roomId}/join`, { data: { name: 'Lobby Black', inviteCode: hosted.inviteCode } })).json();
  try {
    await phone.goto('./?online=1');
    // Even a saved player enters via the lobby as an observer.
    await phone.evaluate(c => localStorage.setItem(`muju:online:${location.origin}:${c.roomId}`, JSON.stringify({ ...c, serverUrl: location.origin })), hosted.credentials);
    const mutations: string[] = [], auth: string[] = [];
    phone.on('request', req => {
      if (!req.url().includes('/api/muju/rooms')) return;
      if (req.method() !== 'GET') mutations.push(req.url());
      if (req.headers().authorization) auth.push(req.headers().authorization);
    });
    const lobby = phone.getByRole('region', { name: 'Active games', exact: true });
    const watch = lobby.getByRole('button', { name: 'Watch Lobby White vs Lobby Black', exact: true });
    await expect(watch).toBeVisible();
    expect((await watch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.screenshot({ path: testInfo.outputPath('active-games-phone.png'), fullPage: true });
    await watch.click();
    await expect(phone.getByText('Online · Observer', { exact: true })).toBeVisible();
    await expect(phone.getByRole('button', { name: /End turn|Start actions|Undo/ })).toHaveCount(0);
    await phone.reload();
    await expect(phone.getByText('Online · Observer', { exact: true })).toBeVisible();
    await request.post(`/api/muju/rooms/${roomId}/actions`, { headers: { Authorization: `Bearer ${hosted.credentials.token}` },
      data: { expectedRevision: guest.room.revision, requestId: 'lobby-live-turn', actions: [{ type: 'END_ACTION_PHASE' }] } });
    await expect(phone.locator('.turn-strip')).toContainText('Lobby Black');
    await request.post(`/api/muju/rooms/${roomId}/actions`, { headers: { Authorization: `Bearer ${guest.credentials.token}` },
      data: { expectedRevision: guest.room.revision + 1, requestId: 'lobby-game-result', actions: [{ type: 'RESIGN' }] } });
    await expect(phone.getByRole('heading', { name: 'Lobby White Wins!' })).toBeVisible();
    await phone.getByRole('button', { name: 'Leave game', exact: true }).click();
    await expect(lobby.getByRole('button', { name: 'Refresh games' })).toBeVisible();
    await expect(watch).toHaveCount(0);
    await phone.reload();
    await expect(lobby).toBeVisible();
    const next = await (await request.post('/api/muju/rooms', { data: { name: 'New lobby game' } })).json();
    const nextCard = lobby.getByRole('listitem').filter({ hasText: 'New lobby game' });
    await expect(nextCard).toContainText('Waiting for opponent', { timeout: 15000 });
    await request.post(`/api/muju/rooms/${next.room.id}/join`, { data: { name: 'New opponent', inviteCode: next.inviteCode } });
    await expect(nextCard).toContainText('In progress', { timeout: 15000 });
    expect(mutations).toEqual([]); expect(auth).toEqual([]);
  } finally { await mobile.close(); }
});
