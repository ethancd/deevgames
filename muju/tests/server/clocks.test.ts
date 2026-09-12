// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { RoomError } from '../../server/schema';
import { observe, legalActions, rules } from '../../server/observation';
import type { RoomAction } from '../../src/online/types';
import { TIME_CONTROL_PRESETS } from '../../src/online/timeControl';

const epoch = 1800000000000;
const stores: RoomStore[] = [], directories: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => {
  stores.splice(0).forEach(store => store.close());
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
  vi.useRealTimers();
});
const open = (path?: string) => { const store = new RoomStore(path); stores.push(store); return store; };
const request = (revision: number, actions: RoomAction[], requestId = `command-${revision}`) => ({ expectedRevision: revision, actions, requestId });
function setup(path?: string, timeControl: unknown = { delaySeconds: 2, bankSeconds: 3 }) {
  const store = open(path), host = store.create({ name: 'White', timeControl });
  const id = host.room.id, guest = store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  return { store, host, guest, id };
}

describe('authoritative per-player delay clocks', () => {
  it('defaults old and new rooms to untimed, validates presets and custom bounds, and locks configuration at creation', () => {
    const store = open();
    for (const timeControl of [undefined, null]) expect(store.create({ name: 'Untimed', timeControl }).room.clock).toBeNull();
    for (const [key, preset] of Object.entries(TIME_CONTROL_PRESETS)) {
      const room = store.create({ name: key, timeControl: key }).room;
      expect(room.timeControl).toEqual({ delaySeconds: preset.delaySeconds, bankSeconds: preset.bankSeconds });
      expect(room.clock).toMatchObject({ runningPlayer: null, deadlineAtMs: null, bankRemainingMs: { white: preset.bankSeconds * 1000, black: preset.bankSeconds * 1000 } });
    }
    for (const timeControl of ['unknown', {}, { delaySeconds: -1, bankSeconds: 60 }, { delaySeconds: 601, bankSeconds: 60 },
      { delaySeconds: 1.5, bankSeconds: 60 }, { delaySeconds: '30', bankSeconds: 60 }, { delaySeconds: 0, bankSeconds: 0 },
      { delaySeconds: 0, bankSeconds: 14401 }, { delaySeconds: 0, bankSeconds: Infinity }, { delaySeconds: 0, bankSeconds: 60, increment: 10 }]) {
      expect(() => store.create({ name: 'Invalid', timeControl })).toThrow();
    }
    const { store: timed, host, id } = setup();
    expect(() => timed.act(id, host.credentials.token, { ...request(1, [{ type: 'END_ACTION_PHASE' }]), timeControl: null })).toThrow();
    expect(() => timed.act(id, host.credentials.token, request(1, [{ type: 'SET_TIME_CONTROL' } as any]))).toThrow();
    expect(timed.get(id).timeControl).toEqual({ delaySeconds: 2, bankSeconds: 3 });
    expect(rules.timeControl.presets).toEqual(TIME_CONTROL_PRESETS);
  });

  it('does not charge the lobby; joining starts White even when Black hosted', () => {
    const store = open(), host = store.create({ name: 'Black host', side: 'black', timeControl: 'rapid' });
    vi.setSystemTime(epoch + 86400000);
    expect(store.get(host.room.id).clock).toMatchObject({ runningPlayer: null, bankRemainingMs: { white: 600000, black: 600000 } });
    const joined = store.join(host.room.id, { name: 'White guest', inviteCode: host.inviteCode });
    expect(joined.room.clock).toMatchObject({ runningPlayer: 'white', turnStartedAtMs: Date.now(), deadlineAtMs: Date.now() + 630000, delayRemainingMs: 30000 });
    expect(() => store.join(host.room.id, { name: 'Again', inviteCode: host.inviteCode, timeControl: null })).toThrow();
  });

  it('shares one delay across actions, previews, illegal requests, undo and phase changes; only handoff refreshes it', () => {
    const { store, host, guest, id } = setup();
    const unitId = host.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
    vi.setSystemTime(epoch + 1000);
    const moved = store.act(id, host.credentials.token, request(1, [{ type: 'MOVE', unitId, to: { x: 2, y: 0 } }]));
    expect(moved.clock).toMatchObject({ delayRemainingMs: 1000, deadlineAtMs: epoch + 5000, bankRemainingMs: { white: 3000, black: 3000 } });
    vi.setSystemTime(epoch + 1500);
    const undone = store.act(id, host.credentials.token, request(2, [{ type: 'UNDO' }]));
    expect(undone.clock?.delayRemainingMs).toBe(500);
    expect(undone.clock?.deadlineAtMs).toBe(epoch + 5000);
    vi.setSystemTime(epoch + 2500);
    const preview = store.act(id, host.credentials.token, request(3, [{ type: 'END_ACTION_PHASE' }]), true);
    expect(preview.state.turn.currentPlayer).toBe('black');
    expect(preview.clock).toMatchObject({ runningPlayer: 'white', delayRemainingMs: 0, bankRemainingMs: { white: 2500, black: 3000 } });
    expect(() => store.act(id, host.credentials.token, request(3, [{ type: 'MOVE', unitId: 'missing', to: { x: 2, y: 0 } }]))).toThrow('illegal');
    expect(store.get(id).revision).toBe(3);
    expect(legalActions(store.get(id)).clock?.bankRemainingMs.white).toBe(2500);
    expect(observe(store.get(id)).clock?.deadlineAtMs).toBe(epoch + 5000);
    vi.setSystemTime(epoch + 3000);
    const handoffRequest = request(3, [{ type: 'END_ACTION_PHASE' }]);
    const black = store.act(id, host.credentials.token, handoffRequest);
    expect(black.clock).toMatchObject({ runningPlayer: 'black', delayRemainingMs: 2000, deadlineAtMs: epoch + 8000, bankRemainingMs: { white: 2000, black: 3000 } });
    vi.setSystemTime(epoch + 3500);
    const retry = store.act(id, host.credentials.token, handoffRequest);
    expect(retry.clock).toMatchObject({ delayRemainingMs: 1500, deadlineAtMs: epoch + 8000 });
    const preference = store.act(id, host.credentials.token, request(4, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }]));
    expect(preference.clock?.deadlineAtMs).toBe(epoch + 8000);
    vi.setSystemTime(epoch + 4000);
    const white = store.act(id, guest.credentials.token, request(5, [{ type: 'END_ACTION_PHASE' }]));
    expect(white.clock).toMatchObject({ runningPlayer: 'white', delayRemainingMs: 2000, deadlineAtMs: epoch + 8000, bankRemainingMs: { white: 2000, black: 3000 } });
    // Upkeep review, placement and starting the action phase all consume this same turn's delay.
    vi.setSystemTime(epoch + 5000);
    const upkeep = legalActions(store.get(id), { type: 'PAY_UPKEEP' }).actions[0].action;
    store.act(id, host.credentials.token, request(6, [upkeep as RoomAction]));
    vi.setSystemTime(epoch + 6500);
    const actionPhase = store.act(id, host.credentials.token, request(7, [{ type: 'END_PLACE_PHASE' }]));
    expect(actionPhase.clock).toMatchObject({ delayRemainingMs: 0, deadlineAtMs: epoch + 8000, bankRemainingMs: { white: 1500, black: 3000 } });
  });

  it.each([false, true])('adjudicates at the exact deadline before a late command and commits the loss despite its error (preview=%s)', preview => {
    const { store, host, id } = setup();
    vi.setSystemTime(epoch + 5000);
    let error: RoomError | undefined;
    try { store.act(id, host.credentials.token, request(1, [{ type: 'END_ACTION_PHASE' }]), preview); }
    catch (caught) { error = caught as RoomError; }
    expect(error).toMatchObject({ code: 'TIME_EXPIRED', room: { revision: 2, state: { winner: 'black', victoryReason: 'timeout' } } });
    const result = store.get(id);
    expect(result.clock).toMatchObject({ runningPlayer: null, deadlineAtMs: null, bankRemainingMs: { white: 0, black: 3000 } });
    expect(result.canUndo).toBe(false);
    expect(result.state.turn.currentPlayer).toBe('white');
    expect(result.history.at(-1)).toMatchObject({ player: 'white', actions: [], result: { winner: 'black', reason: 'timeout' } });
    vi.advanceTimersByTime(10000);
    const history = store.moveHistory(id);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ kind: 'result', reason: 'timeout', timestamp: new Date(epoch + 5000).toISOString() });
    expect(store.position(id, history.entries[0].sequence).state.victoryReason).toBe('timeout');
    expect(store.get(id).revision).toBe(2);
    expect(legalActions(store.get(id)).total).toBe(0);
  });

  it('accepts a handoff just before flag fall, charges only that player, and stops both clocks on resignation', () => {
    const { store, host, guest, id } = setup();
    vi.setSystemTime(epoch + 4999);
    const handed = store.act(id, host.credentials.token, request(1, [{ type: 'END_ACTION_PHASE' }]));
    expect(handed.clock?.bankRemainingMs).toEqual({ white: 1, black: 3000 });
    vi.setSystemTime(epoch + 7999);
    const resigned = store.act(id, guest.credentials.token, request(2, [{ type: 'RESIGN' }]));
    expect(resigned.clock).toMatchObject({ runningPlayer: null, deadlineAtMs: null, bankRemainingMs: { white: 1, black: 2000 } });
    vi.advanceTimersByTime(100000);
    expect(store.get(id).state.victoryReason).toBe('resignation');
    expect(store.get(id).revision).toBe(resigned.revision);
  });

  it('expires unattended rooms, preserves clocks across downtime, and records one result across store handles', () => {
    const directory = mkdtempSync(join(tmpdir(), 'muju-clock-')); directories.push(directory);
    const path = join(directory, 'rooms.sqlite');
    const { store, host, id } = setup(path, { delaySeconds: 0, bankSeconds: 3 });
    vi.setSystemTime(epoch + 1000);
    const body = request(1, [{ type: 'MOVE', unitId: host.room.state.board.units[0].id, to: { x: 2, y: 0 } }]);
    store.act(id, host.credentials.token, body);
    store.close(); stores.splice(stores.indexOf(store), 1);
    vi.setSystemTime(epoch + 2000);
    const reopened = open(path);
    expect(reopened.get(id).clock?.bankRemainingMs.white).toBe(1000);
    const second = open(path);
    vi.advanceTimersByTime(2000);
    // Inspect storage directly: no client read was needed to finish the game.
    const db = new DatabaseSync(path);
    const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
    db.close();
    expect(saved.state).toMatchObject({ phase: 'victory', winner: 'black', victoryReason: 'timeout' });
    expect(second.moveHistory(id).entries.filter(entry => entry.kind === 'result')).toHaveLength(1);
    expect(reopened.act(id, host.credentials.token, body).state.victoryReason).toBe('timeout');
    expect(() => second.act(id, host.credentials.token, request(3, [{ type: 'UNDO' }]))).toThrow('ended on time');
  });

  it('adjudicates an overdue persisted clock immediately on restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'muju-clock-restart-')); directories.push(directory);
    const path = join(directory, 'rooms.sqlite'), { store, id } = setup(path);
    store.close(); stores.splice(stores.indexOf(store), 1);
    vi.setSystemTime(epoch + 20000);
    const restarted = open(path);
    expect(restarted.get(id)).toMatchObject({ revision: 2, state: { phase: 'victory', victoryReason: 'timeout' }, updatedAt: new Date(epoch + 5000).toISOString() });
  });
});
