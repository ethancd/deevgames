import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('two independent browsers join, move, hand off and reconnect without a local save', async ({ page, browser }) => {
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
    await expect(guest.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({ path: 'test-results/online-mobile.png', fullPage: true });
    await page.screenshot({ path: 'test-results/online-desktop.png', fullPage: true });
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
    expect(moved.revision).toBe(2); expect(moved.turn.actionsRemaining).toBe(5);
    await page.getByRole('button', { name: 'End turn' }).click();
    await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
    const observed = await call('muju_observe', { roomId: hosted.credentials.roomId });
    expect(observed.turn.currentPlayer).toBe('black');
    await call('muju_play', { roomId: hosted.credentials.roomId, token: hosted.credentials.token,
      expectedRevision: observed.revision, requestId: 'browser-agent-resign', actions: [{ type: 'RESIGN' }] });
    await expect(page.getByRole('heading', { name: 'Human Wins!' })).toBeVisible();
  } finally { await agent.close(); }
});
