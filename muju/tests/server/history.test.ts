// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { createUnit } from '../../src/game/board';
import type { GameState, PlayerId } from '../../src/game/types';
import type { RoomAction } from '../../src/online/types';

const stores: RoomStore[] = [], directories: string[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
function setup(edit?: (state: GameState) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'muju-history-')); directories.push(dir);
  const path = join(dir, 'rooms.sqlite'), store = new RoomStore(path); stores.push(store);
  const host = store.create({ name: 'White' });
  const guest = store.join(host.room.id, { name: 'Black', inviteCode: host.inviteCode });
  const id = host.room.id;
  if (edit) {
    const db = new DatabaseSync(path);
    const room = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
    edit(room.state); db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(room), id); db.close();
  }
  let serial = 0;
  const play = (player: PlayerId, actions: RoomAction[]) => store.act(id, player === 'white' ? host.credentials.token : guest.credentials.token,
    { expectedRevision: store.get(id).revision, requestId: `history-command-${serial++}`, actions });
  return { path, store, host, guest, id, play };
}

it('records actual moves, mining reserves and incoming upkeep atomically, with no preview or retry duplicates', () => {
  const { store, host, id } = setup();
  const hi = store.get(id).state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  const move = { type: 'MOVE' as const, unitId: hi.id, to: { x: 2, y: 0 } };
  const command = { expectedRevision: 1, requestId: 'move-and-income', actions: [move, { type: 'END_ACTION_PHASE' as const }] };
  store.act(id, host.credentials.token, command, true);
  expect(store.moveHistory(id).entries).toEqual([]);
  expect(() => store.act(id, host.credentials.token, { ...command, actions: [move, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }] })).toThrow();
  expect(store.moveHistory(id).entries).toEqual([]);
  const result = store.act(id, host.credentials.token, command);
  store.act(id, host.credentials.token, command);
  const history = store.moveHistory(id);
  expect(history.recordingStart.complete).toBe(true);
  expect(history.entries.map(e => e.kind)).toEqual(['move', 'mining', 'upkeep']);
  expect(history.entries[0]).toMatchObject({ notation: '🔥1 B1→C1', ap: 1, path: ['C1'], player: 'white', turnNumber: 1 });
  const mining = history.entries[1];
  expect(mining).toMatchObject({ kind: 'mining', total: 6, bankBefore: 0, bankAfter: 6 });
  if (mining.kind !== 'mining') throw new Error('Expected mining');
  expect(mining.takes.reduce((sum, take) => sum + take.amount, 0)).toBe(result.state.lastIncome!.total);
  for (const take of mining.takes) expect(take.reservesBefore - take.reservesAfter).toBe(take.amount);
  expect(history.entries[2]).toMatchObject({ kind: 'upkeep', paid: 0, player: 'black', turnNumber: 1, automatic: true });
  expect(history.total).toBe(3);
  expect(store.get(id)).not.toHaveProperty('moveHistory');
});

it('removes an undone purchase/promotion batch from the score while retaining its audit', () => {
  const { store, id, play } = setup(state => { state.turn.phase = 'place'; state.players.white.resources = 20; });
  const hi = store.get(id).state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  play('white', [{ type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }, { type: 'PROMOTE_UNIT', unitId: hi.id }, { type: 'END_PLACE_PHASE' }]);
  expect(store.moveHistory(id).entries).toMatchObject([
    { kind: 'purchase', notation: '+🔥1@A1', cost: 3, bankAfter: 17 },
    { kind: 'promotion', notation: '↑🔥2@B1', previousDefinitionId: 'fire_1', cost: 4, bankAfter: 13 },
  ]);
  play('white', [{ type: 'UNDO' }]);
  expect(store.moveHistory(id).entries).toEqual([]);
  expect(store.moveHistory(id, { includeUndone: true }).entries.map(e => e.undoneAtRevision)).toEqual([3, 3]);
  expect(store.get(id).state.players.white.resources).toBe(20);
});

it('undoes automatic upkeep without removing opponent mining, then records voluntary releases and survives reconnect', () => {
  const { store, path, id, play } = setup(state => {
    state.turn.currentPlayer = 'black'; state.players.white.resources = 5;
    state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.definitionId = 'fire_2';
  });
  play('black', [{ type: 'END_ACTION_PHASE' }]);
  expect(store.moveHistory(id).entries).toMatchObject([
    { kind: 'mining', player: 'black', turnNumber: 1 },
    { kind: 'upkeep', player: 'white', turnNumber: 2, paid: 1, automatic: true, bankBefore: 5, bankAfter: 4 },
  ]);
  expect(store.position(id, 1).state).toMatchObject({ upkeepPending: true, players: { white: { resources: 5 } } });
  expect(store.position(id, 2).state).toMatchObject({ upkeepPending: false, players: { white: { resources: 4 } } });
  play('white', [{ type: 'UNDO' }]);
  expect(() => store.position(id, 2)).toThrow('undone');
  expect(store.moveHistory(id).entries.map(e => e.kind)).toEqual(['mining']);
  const pending = store.get(id).state;
  expect(pending.upkeepPending).toBe(true);
  play('white', [{ type: 'PAY_UPKEEP', keepUnitIds: pending.board.units.filter(u => u.owner === 'white' && u.definitionId !== 'fire_2').map(u => u.id) }]);
  const payment = store.moveHistory(id).entries.at(-1)!;
  expect(payment).toMatchObject({ kind: 'upkeep', automatic: false, paid: 0, bankAfter: 5,
    released: [{ name: 'Hono', symbol: '🔥2', square: 'B1' }] });
  const reopened = new RoomStore(path); stores.push(reopened);
  expect(reopened.moveHistory(id)).toEqual(store.moveHistory(id));
  play('white', [{ type: 'UNDO' }]);
  expect(reopened.moveHistory(id).entries.map(e => e.kind)).toEqual(['mining']);
  expect(reopened.moveHistory(id, { includeUndone: true }).entries).toHaveLength(3);
});

it('records damaging attacks and captures without moving the attacker onto the target', () => {
  const { store, id, play } = setup(state => {
    state.board.units = [createUnit('fire_1', 'white', { x: 0, y: 0 }), createUnit('fire_1', 'white', { x: 1, y: 1 }),
      createUnit('metal_3', 'black', { x: 0, y: 1 }), createUnit('fire_1', 'black', { x: 9, y: 9 })];
  });
  const attackers = store.get(id).state.board.units.filter(u => u.owner === 'white');
  play('white', attackers.map(unit => ({ type: 'ATTACK', unitId: unit.id, targetPosition: { x: 0, y: 1 } })));
  expect(store.moveHistory(id).entries).toMatchObject([
    { kind: 'attack', notation: '🔥1 A1×A2', attackPower: 3, defenseBefore: 5, defenseAfter: 2, killed: false, ap: 1 },
    { kind: 'attack', notation: '🔥1 B2×A2', attackPower: 3, defenseBefore: 2, defenseAfter: 0, killed: true, ap: 1 },
  ]);
  expect(store.get(id).state.board.units.find(u => u.id === attackers[0].id)!.position).toEqual({ x: 0, y: 0 });
});

it('retains the opening beyond the rolling notification history, with stable pagination and an undo audit', () => {
  const { store, id, play } = setup();
  const hi = store.get(id).state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  play('white', [{ type: 'MOVE', unitId: hi.id, to: { x: 2, y: 0 } }]);
  for (let i = 0; i < 55; i++) {
    play('white', [{ type: 'MOVE', unitId: hi.id, to: { x: 3, y: 0 } }]);
    play('white', [{ type: 'UNDO' }]);
  }
  expect(store.get(id).history).toHaveLength(100);
  expect(store.moveHistory(id).entries).toMatchObject([{ notation: '🔥1 B1→C1', sequence: 1 }]);
  const first = store.moveHistory(id, { after: 0, limit: 10, includeUndone: true });
  expect(first.entries.map(e => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(first).toMatchObject({ hasEarlier: false, hasLater: true, total: 56 });
  expect(store.moveHistory(id, { before: 11, limit: 10, includeUndone: true }).entries).toEqual(first.entries);
  expect(store.moveHistory(id, { after: 10, limit: 10, includeUndone: true }).entries[0].sequence).toBe(11);
  expect(() => store.moveHistory(id, { before: 10, after: 1 })).toThrow('Use before or after');
});

it('marks missing earlier history honestly for rooms created before recording was added', () => {
  const { store, id, path, play } = setup(state => { state.turn.turnNumber = 9; state.turn.currentPlayer = 'black'; });
  const db = new DatabaseSync(path);
  const room = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
  delete room.moveHistoryStart;
  db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(room), id); db.close();
  const hi = store.get(id).state.board.units.find(u => u.owner === 'black' && u.definitionId === 'fire_1')!;
  play('black', [{ type: 'MOVE', unitId: hi.id, to: { x: 7, y: 9 } }]);
  expect(store.moveHistory(id).recordingStart).toEqual({ revision: 1, turnNumber: 9, player: 'black', complete: false });
});

it('records adjudicated checkmate and omits canceled commands and unearned mining', () => {
  const { store, id, play } = setup(state => {
    state.board.units = [createUnit('fire_1', 'white', { x: 9, y: 8 }), createUnit('fire_1', 'black', { x: 4, y: 4 })];
  });
  const invader = store.get(id).state.board.units[0];
  play('white', [{ type: 'MOVE', unitId: invader.id, to: { x: 9, y: 9 } }, { type: 'END_ACTION_PHASE' }]);
  expect(store.moveHistory(id).entries).toMatchObject([
    { kind: 'move', notation: '🔥1 J9→J10#', ap: 1 },
    { kind: 'result', winner: 'white', reason: 'home-checkmate' },
  ]);
});

it('stores exact positions and reconstructs each AP of a multi-action move without mutating the room', () => {
  const { store, id, path, play } = setup();
  const initial = store.get(id), hi = initial.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  const moved = play('white', [{ type: 'MOVE', unitId: hi.id, to: { x: 5, y: 4 } }]);
  const event = store.moveHistory(id).entries[0];
  if (event.kind !== 'move') throw new Error('Expected move');
  expect(event.ap).toBe(4);
  expect(store.position(id, 0).state).toEqual(initial.state);
  for (let step = 1; step <= 4; step++) {
    const position = store.position(id, event.sequence, step).state;
    const coordinate = event.path[step * 2 - 1];
    expect(position.turn.actionsRemaining).toBe(4 - step);
    expect(position.board.units.find(u => u.id === hi.id)!.position).toEqual({ x: coordinate.charCodeAt(0) - 65, y: Number(coordinate.slice(1)) - 1 });
    expect(position.board.cells).toEqual(initial.state.board.cells);
  }
  expect(store.position(id, event.sequence).state).toEqual(moved.state);
  expect(store.get(id)).toEqual(moved);
  const reopened = new RoomStore(path); stores.push(reopened);
  expect(reopened.position(id, event.sequence, 2)).toEqual(store.position(id, event.sequence, 2));
  expect(() => store.position(id, event.sequence, 5)).toThrow('fewer steps');
});
