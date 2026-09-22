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
    let room = store.act(host.room.id, host.credentials.token, { expectedRevision: guest.room.revision, requestId: 'handicap-white-turn', actions: [{ type: 'END_ACTION_PHASE' }] });
    const purchase = generatePlacePhaseActions(room.state, 'black').find(a => a.type === 'BUY_UNIT' && a.definitionId === 'fire_1')!;
    room = store.act(host.room.id, guest.credentials.token, { expectedRevision: room.revision, requestId: 'handicap-purchase', actions: [purchase] });
    expect(room.state.players.black.resources).toBe(17);
    store.close(); store = new RoomStore(path);
    room = store.get(host.room.id, guest.credentials.token);
    expect(room.state).toMatchObject({ blackCrystalHandicap: 20, players: { black: { resources: 17, resourcesGained: 0 } } });
    room = store.act(host.room.id, guest.credentials.token, { expectedRevision: room.revision, requestId: 'handicap-undo', actions: [{ type: 'UNDO' }] });
    expect(room.state.players.black.resources).toBe(20);
    expect(store.create({ name: 'Standard' }).room.state.players.black.resources).toBe(0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
