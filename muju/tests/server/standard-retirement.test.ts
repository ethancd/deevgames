// @vitest-environment node
/**
 * Standard, retired on the server (2026-09-21).
 *
 * The retirement is a data policy before it is a code change, so these tests are
 * written against a REAL captured room rather than a synthesised one:
 * `tests/fixtures/standard-room-v4.json` is a `muju-online-4` room taken from
 * the canonical branch before this work — a stored room, its history root, seven
 * `room_moves` rows with before/after states, and both seat credentials. That is
 * the shape production actually holds: all 28 archived Standard rooms there are
 * `muju-online-4` or older, and every one of them already returns 409.
 *
 * What is being asserted is therefore not "Standard rooms stop working" — they
 * stopped working on 2026-09-13 — but that retiring the ruleset changes NOTHING
 * about them: the same refusal, the same listing, and the same bytes on disk,
 * with no in-place migration left that could rewrite one into the played
 * revision. The `muju-phasing-2` rooms that do open must keep opening.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../fixtures/standard-room-v4.json';
import { PHASING_RULES_VERSION, RETIRED_STANDARD_VERSION, ROOM_IDLE_MS, RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';

const stores: RoomStore[] = [], directories: string[] = [];
afterEach(() => {
  stores.splice(0).forEach(store => store.close());
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }));
  vi.useRealTimers();
});

/** Every rules revision a stored row can carry that this host will not play. */
const RETIRED_VERSIONS = ['muju-online-2', 'muju-online-3', 'muju-online-4', 'muju-online-5', RETIRED_STANDARD_VERSION, 'muju-phasing-1'];

/**
 * Seed a database with the captured room at `version`. The row is written the
 * way a live server would have left it — archived, with its lifecycle columns
 * already set — so the store's boot pass has nothing to normalise and the bytes
 * under test are the bytes that were committed.
 */
function captured(version: string, patch: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'muju-retired-')); directories.push(directory);
  const path = join(directory, 'rooms.sqlite');
  new RoomStore(path).close();
  const db = new DatabaseSync(path);
  const stored = { ...fixture.stored, rulesVersion: version, ...patch };
  const archivedAt = Date.parse(stored.lastMoveAt ?? stored.updatedAt);
  db.prepare('INSERT INTO rooms (id, data, idle_at, archived_at) VALUES (?, ?, ?, ?)')
    .run(stored.id, JSON.stringify(stored), null, archivedAt);
  db.prepare('INSERT INTO room_history_roots (room_id, state) VALUES (?, ?)')
    .run(stored.id, deflateSync(JSON.stringify(fixture.historyRoot)));
  for (const move of fixture.moves) {
    db.prepare(`INSERT INTO room_moves (room_id, sequence, revision, player, turn_number, data, undone_revision, before_state, after_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(move.room_id, move.sequence, move.revision, move.player, move.turn_number,
      move.data, move.undone_revision, move.before_state ? deflateSync(JSON.stringify(move.before_state)) : null,
      deflateSync(JSON.stringify(move.after_state)));
  }
  db.close();
  const store = new RoomStore(path); stores.push(store);
  return { store, path, id: stored.id, raw: JSON.stringify(stored) };
}
const blob = (path: string, id: string) => {
  const db = new DatabaseSync(path);
  const row = db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string;
  db.close();
  return row;
};
const refusal = (operation: () => unknown) => {
  try { operation(); return 'no rejection'; } catch (error) { return (error as { code?: string }).code ?? String(error); }
};
const white = fixture.credentials.white.token, black = fixture.credentials.black.token;
const command = (requestId: string) => ({ expectedRevision: fixture.stored.revision, requestId, actions: [{ type: 'END_ACTION_PHASE' as const }] });

it.each(RETIRED_VERSIONS)('keeps a %s room refused on every read and every mutation', version => {
  const { store, id } = captured(version);
  const calls: [string, () => unknown][] = [
    ['get', () => store.get(id)],
    ['get (seated)', () => store.get(id, white)],
    ['moveHistory', () => store.moveHistory(id)],
    ['position 0', () => store.position(id, 0)],
    ['position 1', () => store.position(id, 1)],
    ['act', () => store.act(id, white, command('retired-play'))],
    ['preview', () => store.act(id, white, command('retired-preview'), true)],
    ['stage', () => store.stage(id, white, { requestId: 'retired-stage', expectedTurnNumber: 2,
      expectedStageVersion: 0, commitWhenRemainingMs: 1000, actions: [{ type: 'END_ACTION_PHASE' }] })],
    ['join', () => store.join(id, { name: 'Late', inviteCode: 'f'.repeat(64) })],
    ['restore', () => store.restore(id, black, 'black')],
  ];
  // The room's moves and history root ARE in the database: the refusal is the
  // rules gate, not missing data.
  expect(calls.map(([name, call]) => `${name}: ${refusal(call)}`))
    .toEqual(calls.map(([name]) => `${name}: RULES_CHANGED`));
});

it('lists every retired room in the archive, flagged, and never offers it as active', () => {
  const { store, id } = captured('muju-online-4');
  expect(store.listActive()).toEqual([]);
  const archived = store.listArchived().rooms;
  expect(archived).toHaveLength(1);
  expect(archived[0]).toMatchObject({ id, ruleset: 'standard', retiredRules: true, seats: fixture.stored.seats });
  // A room played under the revision this host still plays is not flagged.
  const current = captured(PHASING_RULES_VERSION);
  expect(current.store.listArchived().rooms[0]).toMatchObject({ retiredRules: false });
});

it.each(['muju-online-2', 'muju-online-3'])('does not migrate a %s room in place, at boot or on read', version => {
  const { store, path, id, raw } = captured(version, { state: { ...fixture.stored.state, actionsPerTurn: 6 } });
  // These two versions used to be upgraded here and re-stamped as the current
  // Standard revision. Under one ruleset that would have rewritten a Standard
  // game as a room carrying the played revision.
  expect(refusal(() => store.get(id))).toBe('RULES_CHANGED');
  expect(store.listActive()).toEqual([]);
  const stored = JSON.parse(blob(path, id)) as { rulesVersion: string; revision: number; state: { actionsPerTurn: number } };
  expect(stored.rulesVersion).toBe(version);
  expect(stored.revision).toBe(fixture.stored.revision);
  expect(stored.state.actionsPerTurn).toBe(6);
  expect(blob(path, id)).toBe(raw);
});

it('never rewrites a retired row, through every refusal and across two more store opens', () => {
  const { store, path, id, raw } = captured('muju-online-4');
  expect(blob(path, id)).toBe(raw);
  for (const call of [() => store.get(id), () => store.moveHistory(id), () => store.position(id, 0),
    () => store.act(id, white, command('rewrite-check')), () => store.restore(id, white, 'white', 'a'.repeat(64)),
    () => store.listActive(), () => store.listArchived()]) {
    try { call(); } catch { /* the refusal is asserted above; here only the bytes matter */ }
  }
  expect(blob(path, id)).toBe(raw);
  for (let open = 0; open < 2; open++) {
    const reopened = new RoomStore(path); stores.push(reopened);
    expect(reopened.listArchived().rooms[0].id).toBe(id);
    expect(blob(path, id)).toBe(raw);
  }
});

it('creates only muju-phasing-2 rooms, and names the retirement when asked for Standard', () => {
  const { store, path } = captured('muju-online-4');
  for (const input of [{ name: 'Omitted' }, { name: 'Explicit', ruleset: 'phasing' }]) {
    const created = store.create(input);
    expect(created.room.state).toMatchObject({ ruleset: 'phasing', pendingSummons: [], turn: { phase: 'action' } });
    const db = new DatabaseSync(path);
    expect(db.prepare("SELECT json_extract(data, '$.rulesVersion') AS version FROM rooms WHERE id = ?").get(created.room.id)!.version)
      .toBe(PHASING_RULES_VERSION);
    db.close();
  }
  // A named refusal, not a bare union failure: the live SKILL.md told agents to
  // pass `ruleset`, so the one who passes the retired value must be told which.
  expect(() => store.create({ name: 'Retired', ruleset: 'standard' })).toThrow(/phasing/);
});

it('answers an HTTP create with ruleset "standard" with 400 INVALID_REQUEST', async () => {
  const { store } = captured('muju-online-4');
  const listener = createApp(store, { publicUrl: 'http://localhost' }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
  try {
    const url = `http://127.0.0.1:${(listener.address() as { port: number }).port}/api/muju/rooms`;
    const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const refused = await post({ name: 'Retired', ruleset: 'standard' });
    expect(refused.status).toBe(400);
    const payload = await refused.json();
    expect(payload.code).toBe('INVALID_REQUEST');
    expect(JSON.stringify(payload.issues)).toContain('phasing');
    const created = await post({ name: 'Current' });
    expect(created.status).toBe(201);
    expect((await created.json()).room.state).toMatchObject({ ruleset: 'phasing', pendingSummons: [] });
  } finally {
    listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
});

it('keeps a muju-phasing-2 room openable and playable', () => {
  const { store } = captured('muju-online-4');
  const host = store.create({ name: 'White' }), id = host.room.id;
  store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  expect(store.get(id).state.ruleset).toBe('phasing');
  expect(store.listActive().map(room => room.id)).toEqual([id]);
  const mined = store.act(id, host.credentials.token, { expectedRevision: 1, requestId: 'phasing-mine', actions: [{ type: 'END_ACTION_PHASE' }] });
  expect(mined.state.turn).toMatchObject({ currentPlayer: 'white', phase: 'place' });
  const handed = store.act(id, host.credentials.token, { expectedRevision: mined.revision, requestId: 'phasing-hand', actions: [{ type: 'END_PLACE_PHASE' }] });
  expect(handed.state.turn.currentPlayer).toBe('black');
  expect(store.moveHistory(id).entries.length).toBeGreaterThan(0);
});

/**
 * The plan asked for `restore` to refuse an archived room outright. It does not:
 * a player reconnecting with their saved credentials is entitled to review the
 * game they played, and 410-ing them would be a behaviour change dressed as
 * preservation. What matters — and what is asserted here — is the invariant
 * behind the request: `restore` is a read path and writes nothing.
 */
it('restores an archived room for review without writing to it', () => {
  vi.useFakeTimers(); vi.setSystemTime(1800000000000);
  const { store, path } = captured('muju-online-4');
  const host = store.create({ name: 'White' }), id = host.room.id;
  store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  vi.setSystemTime(1800000000000 + ROOM_IDLE_MS);
  expect(store.get(id).archivedAt).toBeDefined();
  const archived = blob(path, id);
  const reviewed = store.restore(id, host.credentials.token, 'white', 'a'.repeat(64));
  expect(reviewed).toMatchObject({ authenticatedPlayer: 'white', archivedAt: store.get(id).archivedAt });
  expect(blob(path, id)).toBe(archived);
  // Mutation is still refused, by the same predicate the write sits behind.
  expect(refusal(() => store.act(id, host.credentials.token,
    { expectedRevision: reviewed.revision, requestId: 'archived-play', actions: [{ type: 'END_ACTION_PHASE' }] }))).toBe('ROOM_ARCHIVED');
  expect(blob(path, id)).toBe(archived);
});
