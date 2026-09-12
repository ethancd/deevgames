import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('restores a full room on a fresh phone from pasted private credentials', async ({ page, browser, request }, testInfo) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'Play online' }).click();
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByText('Private reconnect details', { exact: true }).click();
    const credentials = JSON.parse(await page.getByLabel('Private seat credentials').inputValue());
    await request.post(`/api/muju/rooms/${credentials.roomId}/join`, { data: { name: 'Opponent', inviteCode: credentials.inviteCode } });
    await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
    await phone.goto('./');
    await phone.evaluate(() => localStorage.setItem('elemental-tactics-save', 'keep-phone-local-game'));
    await phone.getByRole('button', { name: 'Play online' }).click();
    await phone.getByLabel('Seat credentials', { exact: true }).fill(JSON.stringify({ ...credentials, token: 'invalid'.repeat(10) }));
    await phone.getByRole('button', { name: 'Restore seat', exact: true }).click();
    await expect(phone.getByRole('alert')).toContainText('invalid');
    expect(await phone.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('muju:online:')))).toEqual([]);
    const markdown = `[${credentials.serverUrl}](${credentials.serverUrl})`;
    await phone.getByLabel('Seat credentials', { exact: true }).fill(JSON.stringify({ ...credentials, serverUrl: markdown }));
    await phone.screenshot({ path: testInfo.outputPath('restore-phone.png'), fullPage: true });
    await phone.getByRole('button', { name: 'Restore seat', exact: true }).click();
    await expect(phone.getByText('Online · You are white')).toBeVisible();
    expect(phone.url()).not.toContain(credentials.token);
    expect(phone.url()).not.toContain(credentials.inviteCode);
    await phone.getByTestId('cell-1-0').click();
    await phone.getByTestId('cell-2-0').click();
    await expect(page.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /white Hi/);
    await phone.reload();
    await expect(phone.getByText('Online · You are white')).toBeVisible();
    await phone.getByRole('button', { name: 'Undo', exact: false }).click();
    await expect(page.getByTestId('cell-1-0')).toHaveAttribute('aria-label', /white Hi/);
    expect(await phone.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBe('keep-phone-local-game');
  } finally { await mobile.close(); }
});

test('multiple observers watch two MCP agents, inspect, replay, and reload without using a saved seat', async ({ page, browser }, testInfo) => {
  const white = new Client({ name: 'white-agent', version: '1' });
  const black = new Client({ name: 'black-agent', version: '1' });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await mobile.newPage();
  for (const agent of [white, black]) await agent.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8928/mcp')));
  const call = async (agent: Client, name: string, args: Record<string, unknown>) => {
    const result = await agent.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent as any;
  };
  try {
    const host = await call(white, 'muju_create_room', { name: 'White LLM', side: 'white' });
    const { roomId } = host.credentials;
    await page.goto('./');
    await page.evaluate(c => localStorage.setItem(`muju:online:${c.serverUrl}:${c.roomId}`, JSON.stringify(c)), host.credentials);
    const mutations: string[] = [], auth: string[] = [];
    for (const viewer of [page, phone]) viewer.on('request', req => {
      if (req.url().includes('/api/muju/rooms')) {
        if (req.method() !== 'GET') mutations.push(req.url());
        if (req.headers().authorization) auth.push(req.headers().authorization);
      }
    });
    await page.goto(host.watchUrl);
    await expect(page.getByText('Online · Observer', { exact: true })).toBeVisible();
    await expect(page.getByText('Waiting for both players to join.', { exact: true }).first()).toBeVisible();
    // A room ID also enters explicitly as an observer from the lobby.
    await phone.goto('./');
    await phone.getByRole('button', { name: 'Play online' }).click();
    await phone.getByLabel('Watch link or room ID').fill(roomId);
    await phone.getByRole('button', { name: 'Watch game', exact: true }).click();
    await expect(phone.getByText('Online · Observer', { exact: true })).toBeVisible();
    const guest = await call(black, 'muju_join_room', { roomId, name: 'Black LLM', inviteCode: host.invitation.inviteCode });
    await expect(page.getByText('Watching live · Read only')).toBeVisible();
    for (const viewer of [page, phone]) {
      await expect(viewer.getByRole('button', { name: /End turn|Start actions|Undo/ })).toHaveCount(0);
      await expect(viewer.getByText('Private reconnect details')).toHaveCount(0);
      await viewer.getByTestId('cell-1-0').click();
      await expect(viewer.locator('.decision-panel')).toContainText('Hi');
      await viewer.keyboard.press('Enter');
      await viewer.keyboard.press('ControlOrMeta+z');
    }
    const moves = await call(white, 'muju_legal_actions', { roomId, type: 'MOVE', limit: 1 });
    const whiteMove = moves.actions[0].action;
    const ended = await call(white, 'muju_play', { roomId, token: host.credentials.token, expectedRevision: guest.room.revision,
      requestId: 'observer-white-turn', actions: [whiteMove, { type: 'END_ACTION_PHASE' }] });
    for (const viewer of [page, phone]) await expect(viewer.locator('.turn-strip')).toContainText('Black LLM');
    await page.getByRole('combobox', { name: 'Replay mode' }).selectOption('step');
    await page.getByRole('button', { name: '↶ Instant replay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next replay action' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next replay action' }).click();
    await page.keyboard.press('Escape');
    const blackMoves = await call(black, 'muju_legal_actions', { roomId, type: 'MOVE', limit: 1 });
    const blackMoved = await call(black, 'muju_play', { roomId, token: guest.credentials.token, expectedRevision: ended.revision,
      requestId: 'observer-black-turn', actions: [blackMoves.actions[0].action] });
    const to = blackMoves.actions[0].action.to as string;
    const cell = `cell-${to.charCodeAt(0) - 65}-${Number(to.slice(1)) - 1}`;
    for (const viewer of [page, phone]) await expect(viewer.getByTestId(cell)).toHaveAttribute('aria-label', /black /);
    await page.reload();
    await expect(page.getByText('Online · Observer', { exact: true })).toBeVisible();
    expect(await page.evaluate(c => JSON.parse(localStorage.getItem(`muju:online:${c.serverUrl}:${c.roomId}`)!), host.credentials)).toEqual(host.credentials);
    expect(await phone.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('muju:online:')))).toEqual([]);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.screenshot({ path: testInfo.outputPath('observer-phone.png'), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath('observer-desktop.png'), fullPage: true });
    await call(black, 'muju_play', { roomId, token: guest.credentials.token, expectedRevision: blackMoved.revision,
      requestId: 'observer-black-resign', actions: [{ type: 'RESIGN' }] });
    for (const viewer of [page, phone]) {
      await expect(viewer.getByRole('heading', { name: 'White LLM Wins!' })).toBeVisible();
      await expect(viewer.getByRole('button', { name: 'Leave game', exact: true })).toBeVisible();
    }
    expect(mutations).toEqual([]); expect(auth).toEqual([]);
  } finally { await white.close(); await black.close(); await mobile.close(); }
});

for (const actionsPerTurn of [4]) test(`${actionsPerTurn}-action independent browsers join, move, hand off and reconnect without a local save`, async ({ page, browser }) => {
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await other.newPage();
  try {
    await page.goto('./');
    await page.evaluate(() => localStorage.setItem('elemental-tactics-save', 'local-match-marker'));
    await page.getByRole('button', { name: 'Play online' }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Alice');
    await page.getByRole('button', { name: 'Create room' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
    const invite = await page.getByLabel('Invite your opponent').inputValue();
    await guest.goto(invite);
    await guest.getByLabel('Your name', { exact: true }).fill('Bob');
    await guest.getByRole('button', { name: 'Join room' }).click();
    await expect(guest.getByText('Online · You are black')).toBeVisible();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
    await expect(page.locator('.action-budget strong')).toHaveText(`${actionsPerTurn} actions`);
    await expect(guest.locator('.action-budget i')).toHaveCount(actionsPerTurn);
    await expect(guest.getByRole('button', { name: 'End turn' })).toBeDisabled();
    await page.getByTestId('cell-1-0').click();
    await page.getByTestId('cell-2-0').click();

    await expect(guest.getByTestId('cell-2-0')).toHaveAttribute('aria-label', /white Hi/);
    await page.getByRole('button', { name: 'End turn' }).click();
    await expect(guest.getByRole('button', { name: 'End turn' })).toBeEnabled();
    await expect(guest.getByText('Pass device to')).toHaveCount(0);
    await guest.getByTestId('cell-8-8').click();
    await guest.getByTestId('cell-6-8').click();

    await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
    await guest.reload();
    await expect(guest.getByText('Online · You are black')).toBeVisible();
    await expect(guest.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
    await expect(guest.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(guest.locator('.action-budget strong')).toHaveText(`${actionsPerTurn-2} actions`);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({ path: `test-results/online-mobile-${actionsPerTurn}.png`, fullPage: true });
    await page.screenshot({ path: `test-results/online-desktop-${actionsPerTurn}.png`, fullPage: true });
    await guest.getByRole('button', { name: 'End turn' }).click();
    await expect(page.locator('.turn-strip')).toContainText('Alice');
    await page.reload();
    await expect(page.getByText('Online · You are white')).toBeVisible();
    await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
    expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBe('local-match-marker');
  } finally { await other.close(); }
});

test('a browser and MCP agent share moves, including retry after a lost response', async ({ page }) => {
  const agent = new Client({ name: 'browser-opponent', version: '1' });
  await agent.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8928/mcp')));
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await agent.callTool({ name, arguments: args });
    expect(response.isError).not.toBe(true);
    return response.structuredContent as any;
  };
  try {
    const hosted = await call('muju_create_room', { name: 'MCP opponent', side: 'black' });
    await page.goto(hosted.invitation.url);
    await page.getByLabel('Your name', { exact: true }).fill('Human');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
    await page.route('**/api/muju/rooms/*/actions', async route => {
      await route.fetch(); // Server commits, but the client never receives the response.
      await route.abort();
      await page.unroute('**/api/muju/rooms/*/actions');
    });
    await page.getByTestId('cell-1-0').click();
    await page.getByTestId('cell-2-0').click();

    await page.getByRole('button', { name: 'Retry same move' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
    const moved = await call('muju_observe', { roomId: hosted.credentials.roomId });
    expect(moved.revision).toBe(2); expect(moved.turn.actionsRemaining).toBe(3);
    await page.getByRole('button', { name: 'End turn' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
    const observed = await call('muju_observe', { roomId: hosted.credentials.roomId });
    expect(observed.turn.currentPlayer).toBe('black');
    await call('muju_play', { roomId: hosted.credentials.roomId, token: hosted.credentials.token,
      expectedRevision: observed.revision, requestId: 'browser-agent-resign', actions: [{ type: 'RESIGN' }] });
    await expect(page.getByRole('heading', { name: 'Human Wins!' })).toBeVisible();
  } finally { await agent.close(); }
});
