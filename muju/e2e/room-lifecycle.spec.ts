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

test('archived Phasing games leave the active list and remain reviewable on a phone', async ({ page, baseURL }, testInfo) => {
  const directory = mkdtempSync(join(tmpdir(), 'muju-archive-browser-')), path = join(directory, 'rooms.sqlite');
  const store = new RoomStore(path);
  // Whatever origin this config serves the app from: the page has to be allowed
  // to call this ad-hoc server, and the default config does not use port 8928.
  const app = createApp(store, { publicUrl: 'http://127.0.0.1', allowedOrigins: [new URL(baseURL!).origin] });
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

test('forks a timed-out partial turn on a phone with new clocks and a working opponent invitation', async ({ page, browser, request }, testInfo) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'Interrupted White', timeControl: { delaySeconds: 0, bankSeconds: 2 } } })).json();
  await request.post(`/api/muju/rooms/${host.room.id}/join`, { data: { name: 'Black', inviteCode: host.inviteCode } });
  const unit = host.room.state.board.units.find((unit: any) => unit.owner === 'white' && unit.definitionId === 'fire_1');
  const movedResponse = await request.post(`/api/muju/rooms/${host.room.id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
    data: { expectedRevision: 1, requestId: 'fork-phone-source-move', actions: [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }] } });
  expect(movedResponse.ok()).toBe(true);
  const moved = await movedResponse.json();
  await expect.poll(async () => (await (await request.get(`/api/muju/rooms/${host.room.id}`)).json()).state.victoryReason).toBe('timeout');
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`./?room=${host.room.id}&watch=1`);
  await page.getByRole('button', { name: 'Fork game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork game' });
  await expect(dialog.getByText(/Resume the interrupted turn/)).toBeVisible();
  await dialog.getByLabel('Your name').fill('Returning Black');
  await dialog.getByLabel('Your side').selectOption('black');
  await dialog.getByLabel('Time control').selectOption('custom');
  await dialog.getByLabel('Free seconds per turn').fill('150');
  await dialog.getByLabel('Bank per player (minutes)').fill('30');
  await page.screenshot({ path: testInfo.outputPath('fork-phone-settings.png') });
  await dialog.getByRole('button', { name: 'Create fork', exact: true }).click();
  await expect(dialog.getByText(/Fork created/)).toBeVisible();
  const invitation = await dialog.getByLabel('New invitation').inputValue();
  const fork = JSON.parse(await dialog.getByLabel('Fork seat credentials').inputValue());
  const fresh = await (await request.get(`/api/muju/rooms/${fork.roomId}`)).json();
  expect(fresh.state).toEqual(moved.state);
  expect(fresh.clock).toMatchObject({ runningPlayer: null, bankRemainingMs: { white: 1800000, black: 1800000 }, delayRemainingMs: 150000 });
  await page.screenshot({ path: testInfo.outputPath('fork-phone-invitation.png') });
  await dialog.getByRole('link', { name: 'Open fork', exact: true }).click();
  await expect(page.getByText('Online · You are black', { exact: true })).toBeVisible();
  const context = await browser.newContext(), opponent = await context.newPage();
  try {
    await opponent.goto(invitation);
    await opponent.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(opponent.getByText('Online · You are white', { exact: true })).toBeVisible();
    await expect(opponent.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /white Hi/);
    expect((await (await request.get(`/api/muju/rooms/${fork.roomId}`)).json()).clock.runningPlayer).toBe('white');
    await opponent.getByTestId('cell-2-0').click();
    await opponent.getByTestId('cell-3-0').click();
    await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
    const original = await (await request.get(`/api/muju/rooms/${host.room.id}`)).json();
    expect(original.state.victoryReason).toBe('timeout');
    expect(original.state.board).toEqual(moved.state.board);
  } finally { await context.close(); }
});

test('forks the selected replay step as an untimed game', async ({ page, request }) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'Replay White', timeControl: 'rapid' } })).json();
  await request.post(`/api/muju/rooms/${host.room.id}/join`, { data: { name: 'Replay Black', inviteCode: host.inviteCode } });
  const unit = host.room.state.board.units.find((unit: any) => unit.owner === 'white' && unit.definitionId === 'fire_1');
  await request.post(`/api/muju/rooms/${host.room.id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
    data: { expectedRevision: 1, requestId: 'fork-replay-source-move', actions: [{ type: 'MOVE', unitId: unit.id, to: { x: 5, y: 0 } }] } });
  await page.goto(`analysis?room=${host.room.id}&watch=1`);
  await page.getByLabel('Analysis position').selectOption('1');
  await expect(page.getByTestId('cell-3-0')).toHaveAttribute('aria-label', /white Hi/);
  await page.getByRole('button', { name: 'Fork from here' }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork game' });
  await dialog.getByLabel('Time control').selectOption('untimed');
  await dialog.getByRole('button', { name: 'Create fork', exact: true }).click();
  await expect(dialog.getByText(/Fork created/)).toBeVisible();
  const credentials = JSON.parse(await dialog.getByLabel('Fork seat credentials').inputValue());
  const fork = await (await request.get(`/api/muju/rooms/${credentials.roomId}`)).json();
  expect(fork.clock).toBeNull();
  expect(fork.forkedFrom).toMatchObject({ roomId: host.room.id, sequence: 1, step: 1 });
  expect(fork.state.turn.actionsRemaining).toBe(3);
  expect(fork.state.board.units.find((u: any) => u.id === unit.id).position).toEqual({ x: 3, y: 0 });
});

test('a changing source must be refreshed before creating a fork with the same control', async ({ page, request }) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'Active White', timeControl: 'rapid' } })).json();
  await request.post(`/api/muju/rooms/${host.room.id}/join`, { data: { name: 'Active Black', inviteCode: host.inviteCode } });
  await page.goto(`./?room=${host.room.id}&watch=1`);
  await page.getByRole('button', { name: 'Room details' }).click();
  await page.getByRole('button', { name: 'Fork game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork game' });
  await expect(dialog.getByRole('button', { name: 'Create fork', exact: true })).toBeEnabled();
  await dialog.getByLabel('Time control').selectOption('custom');
  await dialog.getByLabel('Free seconds per turn').fill('150');
  await dialog.getByLabel('Bank per player (minutes)').fill('30');
  const unit = host.room.state.board.units.find((unit: any) => unit.owner === 'white' && unit.definitionId === 'fire_1');
  await request.post(`/api/muju/rooms/${host.room.id}/actions`, { headers: { Authorization: `Bearer ${host.credentials.token}` },
    data: { expectedRevision: 1, requestId: 'fork-racing-source-move', actions: [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }] } });
  await dialog.getByRole('button', { name: 'Create fork', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('source game changed');
  await dialog.getByRole('button', { name: 'Refresh source' }).click();
  await expect(dialog.getByText(/3 actions remaining/)).toBeVisible();
  await expect(dialog.getByLabel('Free seconds per turn')).toHaveValue('150');
  await expect(dialog.getByLabel('Bank per player (minutes)')).toHaveValue('30');
  await dialog.getByLabel('Time control').selectOption('same');
  await dialog.getByRole('button', { name: 'Create fork', exact: true }).click();
  await expect(dialog.getByText(/Fork created/)).toBeVisible();
  const credentials = JSON.parse(await dialog.getByLabel('Fork seat credentials').inputValue());
  const fork = await (await request.get(`/api/muju/rooms/${credentials.roomId}`)).json();
  expect(fork.timeControl).toEqual({ delaySeconds: 30, bankSeconds: 600 });
  expect(fork.state.turn.actionsRemaining).toBe(3);
});


test('a fork remains recoverable when browser seat storage is unavailable', async ({ page, request }) => {
  const host = await (await request.post('/api/muju/rooms', { data: { name: 'Storage source' } })).json();
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
  await page.goto(`./?room=${host.room.id}&watch=1`);
  await page.getByRole('button', { name: 'Room details' }).click();
  await page.getByRole('button', { name: 'Fork game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork game' });
  await dialog.getByRole('button', { name: 'Create fork', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not save your seat');
  await expect(dialog.getByLabel('Fork seat credentials')).toBeVisible();
  const credentials = JSON.parse(await dialog.getByLabel('Fork seat credentials').inputValue());
  expect((await request.get(`/api/muju/rooms/${credentials.roomId}`, { headers: { Authorization: `Bearer ${credentials.token}` } })).ok()).toBe(true);
  await dialog.getByRole('button', { name: 'Copy invitation' }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not save your seat');
});
