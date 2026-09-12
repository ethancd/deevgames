import { test, expect } from '@playwright/test';
import { createInitialGameState, createUnit } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';

test('a phone shows and saves checkmate immediately on the winning move', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createInitialGameState();
  state.board.units = [createUnit('plant_1', 'white', { x: 9, y: 8 }), createUnit('fire_1', 'black', { x: 4, y: 4 })];
  await page.addInitScript(({ state, schemaVersion }) => {
    if (sessionStorage.getItem('mate-seeded')) return;
    localStorage.setItem('elemental-tactics-save', JSON.stringify({ state, schemaVersion, timestamp: Date.now() }));
    sessionStorage.setItem('mate-seeded', 'true');
  }, { state, schemaVersion: SCHEMA_VERSION });
  await page.goto('./');
  await page.getByRole('button', { name: 'vs AI Play against the computer', exact: true }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  await page.getByTestId('cell-9-8').click();
  await page.getByTestId('cell-9-9').click();
  await expect(page.getByRole('heading', { name: 'You Win!', exact: true })).toBeVisible();
  await expect(page.getByText(/Checkmate!.*no legal reply/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elemental-tactics-save')!).state.turn.currentPlayer)).toBe('white');
  expect(workers).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('phone-checkmate.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'vs AI Play against the computer', exact: true }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await expect(page.getByText(/Checkmate!.*no legal reply/)).toBeVisible();
});

test('MCP checkmate ends a queued turn and updates observers immediately', async ({ page, request }) => {
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await request.post('/mcp', { headers: { Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } });
    const result = (await response.json()).result;
    expect(result.isError).not.toBe(true);
    return result.structuredContent;
  };
  const host = await call('muju_create_room', { name: 'White LLM', side: 'white' });
  const { roomId } = host.credentials;
  const guest = await call('muju_join_room', { roomId, name: 'Black LLM', inviteCode: host.invitation.inviteCode });
  let room = await (await request.get(`/api/muju/rooms/${roomId}`)).json(), serial = 0;
  const white = room.state.board.units.find((u: any) => u.owner === 'white' && u.definitionId === 'fire_1').id;
  const blackFire = room.state.board.units.find((u: any) => u.owner === 'black' && u.definitionId === 'fire_1').id;
  const blackWater = room.state.board.units.find((u: any) => u.owner === 'black' && u.definitionId === 'water_1').id;
  const play = async (actions: object[]) => {
    const credentials = room.state.turn.currentPlayer === 'white' ? host.credentials : guest.credentials;
    const phase = room.state.turn.phase === 'place' ? [{ type: 'END_PLACE_PHASE' }] : [];
    const result = await call('muju_play', { roomId, token: credentials.token, expectedRevision: room.revision,
      requestId: `mate-browser-${serial++}`, actions: [...phase, ...actions] });
    room = await (await request.get(`/api/muju/rooms/${roomId}`)).json();
    return result;
  };
  await play([{ type: 'MOVE', unitId: white, to: 'J1' }, { type: 'END_ACTION_PHASE' }]);
  await play([{ type: 'MOVE', unitId: blackFire, to: 'E10' }, { type: 'MOVE', unitId: blackWater, to: 'G9' }, { type: 'END_ACTION_PHASE' }]);
  await play([{ type: 'MOVE', unitId: white, to: 'I8' }, { type: 'END_ACTION_PHASE' }]);
  await play([{ type: 'MOVE', unitId: blackFire, to: 'B10' }, { type: 'MOVE', unitId: blackWater, to: 'E9' }, { type: 'END_ACTION_PHASE' }]);
  await page.goto(host.watchUrl);
  await expect(page.getByText('Online · Observer', { exact: true })).toBeVisible();
  const won = await play([{ type: 'MOVE', unitId: white, to: 'J10' }, { type: 'END_ACTION_PHASE' }]);
  expect(won).toMatchObject({ status: 'victory', winner: 'white', victoryReason: 'home-checkmate' });
  expect(room.state.turn.currentPlayer).toBe('white');
  expect(room.history.at(-1).actions.at(-1).type).toBe('MOVE');
  await expect(page.getByRole('heading', { name: 'White LLM Wins!', exact: true })).toBeVisible();
  await expect(page.getByText(/Checkmate!.*no legal reply/)).toBeVisible();
});
