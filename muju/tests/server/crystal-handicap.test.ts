// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../server/rooms';
import { generatePlacePhaseActions } from '../../src/ai/moves';

it('persists the grant and spent balance across purchase, undo and server restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-handicap-'));
  const path = join(dir, 'rooms.sqlite');
  let store = new RoomStore(path);
  try {
    const host = store.create({ name: 'White', blackCrystalHandicap: 20 });
    const guest = store.join(host.room.id, { name: 'Black', inviteCode: host.inviteCode });
    // White mines, prepares and hands over; Black then buys in its own Prepare phase.
    let room = store.act(host.room.id, host.credentials.token, { expectedRevision: guest.room.revision, requestId: 'handicap-white-turn', actions: [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }] });
    room = store.act(host.room.id, guest.credentials.token, { expectedRevision: room.revision, requestId: 'handicap-black-mine', actions: [{ type: 'END_ACTION_PHASE' }] });
    // The grant is intact when Black first acts, and its own mining is added to it.
    expect(guest.room.state.players.black.resources).toBe(20);
    const banked = room.state.players.black.resources;
    expect(banked).toBeGreaterThan(20);
    const purchase = generatePlacePhaseActions(room.state, 'black').find(a => a.type === 'BUY_UNIT' && a.definitionId === 'fire_1')!;
    room = store.act(host.room.id, guest.credentials.token, { expectedRevision: room.revision, requestId: 'handicap-purchase', actions: [purchase] });
    const afterPurchase = banked - 3;
    expect(room.state.players.black.resources).toBe(afterPurchase);
    store.close(); store = new RoomStore(path);
    room = store.get(host.room.id, guest.credentials.token);
    expect(room.state).toMatchObject({ blackCrystalHandicap: 20, players: { black: { resources: afterPurchase } } });
    room = store.act(host.room.id, guest.credentials.token, { expectedRevision: room.revision, requestId: 'handicap-undo', actions: [{ type: 'UNDO' }] });
    expect(room.state.players.black.resources).toBe(banked);
    expect(store.create({ name: 'No handicap' }).room.state.players.black.resources).toBe(0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
