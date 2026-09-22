import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore, ROOM_IDLE_MS } from '../server/rooms';
import { createApp } from '../server/http';

// One ruleset since 2026-09-21: rooms are created without naming one, and the
// server would refuse anything but Phasing.
test('the same invitation moves the seat between browsers and the previous browser watches', async ({ browser, request }) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'Takeover host', side: 'black' } })).json();
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true })]);
  const [first, second] = await Promise.all(contexts.map(context => context.newPage()));
  const link = `./?room=${host.room.id}#invite=${host.inviteCode}`;
  try {
    await first.goto(link);
    await first.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(first.getByText('Online · You are white', { exact: true })).toBeVisible();
    await first.getByTestId('cell-1-0').click();
    await first.getByTestId('cell-2-0').click();
    await expect(first.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /white Hi/);
    await second.goto(link);
    await second.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(second.getByText('Online · You are white', { exact: true })).toBeVisible();
    await expect(second.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /white Hi/);
    await expect(first.getByText('Online · Observer', { exact: true })).toBeVisible();
    await expect(first.getByText(/Seat moved to another browser/)).toBeVisible();
    let oldCommands = 0;
    first.on('request', req => { if (req.url().endsWith('/actions')) oldCommands++; });
    await first.getByTestId('cell-2-0').click();
    await first.getByTestId('cell-3-0').click();
    expect(oldCommands).toBe(0);
    await second.getByTestId('cell-2-0').click();
    await second.getByTestId('cell-3-0').click();
    await expect(first.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    await second.reload();
    await expect(second.getByText('Online · You are white', { exact: true })).toBeVisible();
    // Merely reopening the old browser does not steal the seat back.
    await first.reload();
    await expect(first.getByText('Online · Observer', { exact: true })).toBeVisible();
    // An explicit join can replace the stale credential saved in that browser.
    await first.goto(link);
    await expect(first.getByRole('button', { name: 'Join room', exact: true })).toBeEnabled();
    await first.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(first.getByText('Online · You are white', { exact: true })).toBeVisible();
    await expect(second.getByText('Online · Observer', { exact: true })).toBeVisible();
    const hostRead = await request.get(`/api/muju/rooms/${host.room.id}`, { headers: { Authorization: `Bearer ${host.credentials.token}` } });
    expect(hostRead.ok()).toBe(true);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('archived Phasing games leave the active list and remain reviewable on a phone', async ({ page }, testInfo) => {
  const directory = mkdtempSync(join(tmpdir(), 'muju-archive-browser-')), path = join(directory, 'rooms.sqlite');
  const store = new RoomStore(path);
  const app = createApp(store, { publicUrl: 'http://127.0.0.1', allowedOrigins: ['http://127.0.0.1:8928'] });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => listener.once('listening', resolve));
  const server = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  try {
    const host = store.create({ name: 'Archived White' });
    store.join(host.room.id, { name: 'Archived Black', inviteCode: host.inviteCode });
    const unit = host.room.state.board.units.find(unit => unit.owner === 'white' && unit.definitionId === 'fire_1')!;
    store.act(host.room.id, host.credentials.token, { expectedRevision: 1, requestId: 'archive-browser-move', actions: [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }] });
    const db = new DatabaseSync(path), old = new Date(Date.now() - ROOM_IDLE_MS - 1000).toISOString();
    db.prepare("UPDATE rooms SET data = json_set(data, '$.lastMoveAt', ?), idle_at = ? WHERE id = ?").run(old, Date.parse(old) + ROOM_IDLE_MS, host.room.id); db.close();
    store.listActive();
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto(`./?online=1&server=${encodeURIComponent(server)}`);
    await expect(page.getByRole('region', { name: 'Active games' })).not.toContainText('Archived White');
    await page.getByText('Archived games', { exact: true }).click();
    const card = page.getByRole('listitem').filter({ hasText: 'Archived White' });
    await expect(card).toContainText('Closed · no moves for 24 hours');
    await card.getByRole('link', { name: 'Analyze' }).click();
    await expect(page.getByText('Game analysis', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Analysis position')).toContainText('Room archived');
    expect((await page.locator('.battle-board').boundingBox())!.width).toBeGreaterThan(250);
    await page.getByLabel('Analysis position').selectOption('0');
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    await expect(page.getByRole('button', { name: 'Explore from here' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('archived-phasing-analysis.png') });
    // An old invitation opens its closed room for review instead of claiming a seat.
    await page.goto(`./?room=${host.room.id}&server=${encodeURIComponent(server)}#invite=${host.inviteCode}`);
    await page.getByLabel('Invitation link').fill(`${server}/muju/?room=${host.room.id}#invite=${host.inviteCode}`);
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Room archived', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analyze this game' })).toBeVisible();
  } finally {
    await new Promise<void>(resolve => { listener.closeAllConnections(); listener.close(() => resolve()); });
    store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
