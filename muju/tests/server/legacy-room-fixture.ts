import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
/** Seed a pre-komi room at its initial position for preserved engine-seat tests.
 * Production creation must reject zero; historical stored games remain valid. */
export function seedLegacyZeroGrant(path: string, roomId: string) {
  const db = new DatabaseSync(path);
  try {
    const row = db.prepare('SELECT data FROM rooms WHERE id = ?').get(roomId)!;
    const room = JSON.parse(row.data as string);
    if (room.ready || room.revision !== 0) throw new Error('Legacy fixture must be seeded before joining or playing.');
    room.state.players.black.resources -= room.state.blackCrystalHandicap;
    room.state.blackCrystalHandicap = 0;
    db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(room), roomId);
    db.prepare('UPDATE room_history_roots SET state = ? WHERE room_id = ?').run(deflateSync(JSON.stringify(room.state)), roomId);
  } finally { db.close(); }
}
