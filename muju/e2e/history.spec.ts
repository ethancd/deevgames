import { test, expect } from '@playwright/test';
import type { RoomSnapshot, RoomAction } from '../src/online/types';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`observer history follows moves, undo, income, upkeep and victory at ${viewport.width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize(viewport);
    const host = await (await request.post('/api/muju/rooms', { data: { name: 'White agent' } })).json();
    const id = host.room.id;
    const guest = await (await request.post(`/api/muju/rooms/${id}/join`, { data: { name: 'Black agent', inviteCode: host.inviteCode } })).json();
    const read = async (): Promise<RoomSnapshot> => (await request.get(`/api/muju/rooms/${id}`)).json();
    let serial = 0;
    const play = async (player: 'white' | 'black', actions: RoomAction[]) => {
      const room = await read();
      const response = await request.post(`/api/muju/rooms/${id}/actions`, {
        headers: { Authorization: `Bearer ${player === 'white' ? host.credentials.token : guest.credentials.token}` },
        data: { expectedRevision: room.revision, requestId: `history-browser-${serial++}`, actions },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json() as Promise<RoomSnapshot>;
    };
    const initial = await read(), hi = initial.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
    await page.goto(`?room=${id}&watch=1`);
    const trigger = page.getByRole('button', { name: 'Move history', exact: true });
    await expect(trigger).toBeVisible();
    const before = await page.locator('.battle-board').boundingBox();
    await trigger.click();
    const history = page.getByRole('complementary', { name: 'Move history' });
    await expect(history).toBeVisible();
    await expect(history).toContainText('No recorded moves yet.');
    expect(await page.locator('.battle-board').boundingBox()).toEqual(before);
    await play('white', [{ type: 'MOVE', unitId: hi.id, to: { x: 2, y: 0 } }]);
    await expect(history).toContainText('🔥1 B1→C1');
    await play('white', [{ type: 'UNDO' }]);
    await expect(history).not.toContainText('🔥1 B1→C1');
    await play('white', [{ type: 'END_ACTION_PHASE' }]);
    await expect(history).toContainText('Mining +6 ◆');
    await history.getByText('Mining by piece', { exact: true }).first().click();
    await expect(history).toContainText('Reserves 10 →');
    await play('black', [{ type: 'END_ACTION_PHASE' }]);
    await play('white', [{ type: 'PROMOTE_UNIT', unitId: hi.id }, { type: 'END_ACTION_PHASE' }]);
    await expect(history).toContainText('↑🔥2@B1');
    await play('black', [{ type: 'END_PLACE_PHASE' }, { type: 'END_ACTION_PHASE' }]);
    await expect(history).toContainText('Upkeep −1 ◆');
    await play('white', [{ type: 'UNDO' }]);
    await expect(history).not.toContainText('Upkeep −1 ◆');
    const pending = await read();
    await play('white', [{ type: 'PAY_UPKEEP', keepUnitIds: pending.state.board.units.filter(u => u.owner === 'white' && u.id !== hi.id).map(u => u.id) }]);
    await expect(history).toContainText('release 🔥2@B1');
    await page.screenshot({ path: testInfo.outputPath('move-history.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await play('white', [{ type: 'RESIGN' }]);
    await expect(history).toContainText('Black wins');
    await history.getByRole('button', { name: 'Close move history' }).click();
    await expect(history).toHaveCount(0);
    await page.getByRole('button', { name: 'View history', exact: true }).click();
    await expect(history).toContainText('resignation');
    await page.reload();
    await page.getByRole('button', { name: 'View history', exact: true }).click();
    await expect(history).toContainText('release 🔥2@B1');
    await expect(history).not.toContainText('🔥1 B1→C1');
    await page.keyboard.press('Escape');
    await expect(history).toHaveCount(0);
  });
}
