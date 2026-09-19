// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { observe } from '../../server/observation';
import { readRoom } from '../../src/online/client';
import type { RoomSnapshot } from '../../src/online/types';
import { contractFor, initializeSeat, seatConfigSchema } from '../../tools/engine-seat/config';
import { runSeat, type SeatJournal } from '../../tools/engine-seat/runner';
import { PHASING_HARD_READINESS } from '../../tools/engine-seat/contract';

/** The seat is Phasing-only and default-closed; see `tests/lab/engine-seat.test.ts`. */
const READINESS = { phasingHardReadiness: PHASING_HARD_READINESS } as const;

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup() {
  const store = new RoomStore();
  const policy = { version: 1 as const, toolTier: 'harnessed' as const, protocolId: 'binding-regression' };
  const white = store.create({ name: 'White', matchPolicy: policy, timeControl: 'classical', ruleset: 'phasing' });
  const black = store.join(white.room.id, { name: 'Black', inviteCode: white.inviteCode });
  const app = createApp(store, { publicUrl: 'http://localhost', matchRoomId: white.room.id });
  const listener: Server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const serverUrl = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); store.close(); });
  const base = { mode: 'pinned', serverUrl, roomId: white.room.id, seed: 42, stateFile: '/private/not-written-binding-test.json',
    expectedMatchPolicy: policy, expectedTimeControl: { delaySeconds: 60, bankSeconds: 1800 }, expectedHandicap: 0, ...READINESS };
  return { store, serverUrl, white, black, base };
}

it('rejects a real Black token labeled White before reservation and accepts its actual seat', async () => {
  const { base, black } = await setup(), reserve = vi.fn();
  const mislabeled = seatConfigSchema.parse({ ...base, credentials: { ...black.credentials, player: 'white' } });
  await expect(initializeSeat(mislabeled, reserve)).rejects.toThrow(/authenticated seat/);
  expect(reserve).not.toHaveBeenCalled();
  const correct = seatConfigSchema.parse({ ...base, credentials: black.credentials });
  const journal = await initializeSeat(correct, reserve);
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(journal.connection).toMatchObject(black.credentials);
  expect(journal.admission).toBe('issued');
});

it.each([false, true])('rejects a hand-edited seat journal before search or pending recovery (pending=%s)', async pending => {
  const { base, black } = await setup();
  const config = seatConfigSchema.parse({ ...base, credentials: black.credentials });
  const journal: SeatJournal = { version: 3, admission: 'issued', seed: 42, contract: contractFor(config),
    connection: { ...black.credentials, serverUrl: base.serverUrl, player: 'white' },
    ...(pending ? { pending: { expectedRevision: 1, requestId: 'binding-pending-request',
      actions: [{ type: 'END_ACTION_PHASE' as const }, { type: 'END_PLACE_PHASE' as const }] } } : {}) };
  const original = structuredClone(journal), createEngine = vi.fn(), save = vi.fn();
  const transport = { read: readRoom, wait: vi.fn(), play: vi.fn() };
  await expect(runSeat({ journal, transport, createEngine, save, log: vi.fn() })).rejects.toThrow(/authenticated seat/);
  expect(createEngine).not.toHaveBeenCalled(); expect(transport.wait).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled(); expect(journal).toEqual(original);
});

it('admits the correctly bound real White credential to the engine construction boundary', async () => {
  const { base, white } = await setup();
  const journal = await initializeSeat(seatConfigSchema.parse({ ...base, credentials: white.credentials }), vi.fn());
  const createEngine = vi.fn(() => { throw new Error('test engine boundary'); });
  await expect(runSeat({ journal, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow('test engine boundary');
  expect(createEngine).toHaveBeenCalledExactlyOnceWith(42);
});

it('reports token-derived identity only on private snapshots, never public reads or waits', async () => {
  const { store, serverUrl, white, black } = await setup(), id = white.room.id;
  expect(store.get(id)).not.toHaveProperty('authenticatedPlayer');
  expect(store.get(id, white.credentials.token).authenticatedPlayer).toBe('white');
  expect(store.get(id, black.credentials.token).authenticatedPlayer).toBe('black');
  const publicRoom = await (await fetch(`${serverUrl}/api/muju/rooms/${id}?player=white&authenticatedPlayer=white`)).json();
  expect(publicRoom).not.toHaveProperty('authenticatedPlayer');
  const privateRoom: RoomSnapshot = await (await fetch(`${serverUrl}/api/muju/rooms/${id}?player=white&authenticatedPlayer=white`,
    { headers: { Authorization: `Bearer ${black.credentials.token}` } })).json();
  expect(privateRoom.authenticatedPlayer).toBe('black');
  expect(observe(privateRoom)).not.toHaveProperty('authenticatedPlayer');
  for (const token of [undefined, white.credentials.token]) {
    const response = await fetch(`${serverUrl}/api/muju/rooms/${id}/changes?afterRevision=0&timeoutMs=0`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    const change = await response.json();
    expect(change.changed).toBe(true); expect(change.room).not.toHaveProperty('authenticatedPlayer');
  }
});
