// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { observe } from '../../server/observation';
import { createUnit } from '../../src/game/board';
import * as engine from '../../src/ai/simulate';
import type { RoomAction } from '../../src/online/types';

const epoch = 1800000000000;
const stores = new Set<RoomStore>(), directories: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => {
  stores.forEach(store => store.close()); stores.clear();
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const open = (path?: string) => { const store = new RoomStore(path); stores.add(store); return store; };
const close = (store: RoomStore) => { store.close(); stores.delete(store); };
function file() {
  const directory = mkdtempSync(join(tmpdir(), 'muju-staging-')); directories.push(directory);
  return join(directory, 'rooms.sqlite');
}
function setup(path?: string, timeControl: unknown = { delaySeconds: 2, bankSeconds: 3 }) {
  const store = open(path), host = store.create({ name: 'White', timeControl });
  const id = host.room.id, guest = store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  const token = host.credentials.token, blackToken = guest.credentials.token;
  const unitId = host.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
  const move: RoomAction = { type: 'MOVE', unitId, to: { x: 2, y: 0 } };
  return { store, id, token, blackToken, move };
}
const end: RoomAction = { type: 'END_ACTION_PHASE' };
const staged = (actions: RoomAction[] = [end], expectedStageVersion = 0, requestId = 'stage-request-1') =>
  ({ requestId, expectedTurnNumber: 1, expectedStageVersion, commitWhenRemainingMs: 1000, actions });
const cancel = (expectedStageVersion = 1, requestId = 'cancel-request-1') => ({ requestId, expectedTurnNumber: 1, expectedStageVersion });
const command = (expectedRevision: number, actions: RoomAction[], requestId = `command-${expectedRevision}`) => ({ expectedRevision, actions, requestId });

describe('persistent player-authored staged play', () => {
  it('fires at the threshold without clients and publishes only the ordinary committed history', () => {
    const path = file(), { store, id, token, move } = setup(path);
    const before = store.get(id), result = store.stage(id, token, staged([move, end]));
    expect(result).toMatchObject({ revision: 1, version: 1, pending: { version: 1, turnNumber: 1,
      triggerAtMs: epoch + 4000, commitWhenRemainingMs: 1000, actions: [move, end] } });
    expect(store.get(id)).toEqual(before);
    vi.advanceTimersByTime(3999);
    expect(store.staged(id, token).pending?.id).toBe(result.pending?.id);
    vi.advanceTimersByTime(1);
    // Direct database inspection demonstrates that no observation was needed to fire.
    const db = new DatabaseSync(path);
    const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string); db.close();
    expect(saved.revision).toBe(2);
    expect(saved.state.turn.currentPlayer).toBe('black');
    expect(saved.history.at(-1).actions).toEqual([move, end]);
    const status = store.staged(id, token);
    expect(status).toMatchObject({ version: 2, pending: null, latestReceipt: {
      status: 'executed', candidateIndex: 0, revision: 2, resolvedAtMs: epoch + 4000, appliedActions: [move, end] } });
    expect(status.clockPressure?.players.white).toMatchObject({ completedTurns: 1, totalElapsedMs: 4000, totalBankSpentMs: 2000 });
    expect(store.get(id).lastTurnReplay?.frames.map(frame => frame.action)).toEqual([move]);
    expect(store.moveHistory(id).entries.filter(e => e.kind === 'move')).toHaveLength(1);
  });

  it('validates shapes, authority, turn and threshold; a valid already-due trigger fires immediately', () => {
    const { store, id, token, blackToken } = setup();
    for (const commitWhenRemainingMs of [0, -1, 0.5, Infinity, NaN, 15000001, '1000']) {
      expect(() => store.stage(id, token, { ...staged(), commitWhenRemainingMs })).toThrow();
    }
    expect(() => store.stage(id, token, { ...staged(), commitWhenRemainingMs: 5001 })).toThrow('starting delay plus bank');
    for (const extra of [{ actions: [] }, { actions: Array(33).fill(end) }, { fallbacks: [[]] },
      { fallbacks: Array(4).fill([end]) }, { actions: [{ type: 'RESCUE' }] }, { expectedRevision: 1 }]) {
      expect(() => store.stage(id, token, { ...staged(), ...extra })).toThrow();
    }
    expect(() => store.stage(id, 'wrong', staged())).toThrow('credential');
    expect(() => store.stage(id, blackToken, staged())).toThrow('own current full turn');
    expect(() => store.stage(id, token, { ...staged(), expectedTurnNumber: 2 })).toThrow('own current full turn');
    const untimed = setup(undefined, null);
    expect(() => untimed.store.stage(untimed.id, untimed.token, staged())).toThrow('timed room');
    const waiting = store.create({ name: 'Waiting', timeControl: 'rapid' });
    expect(() => store.stage(waiting.room.id, waiting.credentials.token, staged())).toThrow('running turn');
    vi.setSystemTime(epoch + 3000);
    const result = store.stage(id, token, { ...staged(), commitWhenRemainingMs: 2500 });
    expect(result).toMatchObject({ version: 2, pending: null, latestReceipt: { status: 'executed', resolvedAtMs: epoch + 3000 } });
    expect(result.acknowledgement.acceptedVersion).toBe(1);
    expect(store.get(id).clock?.bankRemainingMs.white).toBe(2000);
  });

  it('versions replacements and cancellations, and preserves acknowledgements for retries after later changes', () => {
    const { store, id, token, move } = setup();
    const first = store.stage(id, token, staged());
    const secondRequest = { ...staged([move, end], 1, 'stage-request-2'), commitWhenRemainingMs: 1500 };
    const second = store.stage(id, token, secondRequest);
    expect(second.version).toBe(2);
    expect(second.pending?.id).not.toBe(first.pending?.id);
    expect(store.staged(id, token, first.acknowledgement.stageId).requestedStage).toMatchObject({ status: 'replaced' });
    expect(() => store.stage(id, token, staged([move], 1, 'stale-replace'))).toThrow('staging state changed');
    expect(() => store.cancelStage(id, token, cancel())).toThrow('staging state changed');
    expect(() => store.stage(id, token, { ...secondRequest, actions: [end] })).toThrow('new requestId');
    const cancelled = store.cancelStage(id, token, cancel(2));
    expect(cancelled).toMatchObject({ version: 3, pending: null, latestReceipt: { status: 'cancelled' } });
    expect(store.cancelStage(id, token, cancel(2)).acknowledgement).toEqual(cancelled.acknowledgement);
    const retry = store.stage(id, token, staged());
    expect(retry.acknowledgement).toEqual(first.acknowledgement);
    expect(retry).toMatchObject({ version: 3, pending: null, requestedStage: { status: 'replaced' } });
    vi.setSystemTime(epoch + 4500);
    expect(store.get(id).revision).toBe(1);
    expect(() => store.cancelStage(id, token, cancel(3, 'nothing-to-cancel'))).toThrow('no pending stage');
  });

  it.each(['cancel', 'replace', 'play'] as const)('settles a due stage before a racing %s, preserving execution when the request fails', operation => {
    const { store, id, token } = setup();
    store.stage(id, token, staged());
    vi.setSystemTime(epoch + 4000); // timer has not run
    const attempt = () => operation === 'cancel' ? store.cancelStage(id, token, cancel())
      : operation === 'replace' ? store.stage(id, token, staged([end], 1, 'racing-replace'))
      : store.act(id, token, command(1, [end]));
    expect(attempt).toThrow(operation === 'play' ? 'revision 2' : 'staging state changed');
    expect(store.get(id)).toMatchObject({ revision: 2, state: { turn: { currentPlayer: 'black' } } });
    expect(store.staged(id, token).latestReceipt?.status).toBe('executed');
  });

  it('honors a cancellation or replacement just before the trigger', () => {
    const { store, id, token } = setup();
    store.stage(id, token, staged());
    vi.setSystemTime(epoch + 3999);
    store.cancelStage(id, token, cancel());
    const next = store.stage(id, token, { ...staged([end], 2, 'later-stage-request'), commitWhenRemainingMs: 500 });
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).pending?.id).toBe(next.pending?.id);
    vi.setSystemTime(epoch + 4500);
    expect(store.staged(id, token).latestReceipt?.status).toBe('executed');
  });

  it('tests whole candidates atomically and executes the first legal batch in player order', () => {
    const { store, id, token, move } = setup();
    const illegal: RoomAction = { type: 'MOVE', unitId: 'missing-private-unit', to: { x: 4, y: 4 } };
    store.stage(id, token, { ...staged([move, illegal]), fallbacks: [[move, end], [{ type: 'RESIGN' }]] });
    vi.setSystemTime(epoch + 4000);
    const result = store.staged(id, token);
    expect(result.latestReceipt).toMatchObject({ status: 'executed', candidateIndex: 1, appliedActions: [move, end],
      failures: [{ candidateIndex: 0, code: 'ILLEGAL_ACTION' }] });
    const room = store.get(id);
    expect(room.state.phase).toBe('playing');
    expect(room.history).toHaveLength(1);
    expect(room.lastTurnReplay?.frames.map(frame => frame.action)).toEqual([move]);
    expect(store.moveHistory(id).entries.filter(e => e.kind === 'move')).toHaveLength(1);
  });

  it('consumes all-illegal stages without partial state, history, revision or extra turn samples', async () => {
    const { store, id, token, move } = setup();
    const original = store.get(id);
    const request = { ...staged([move, move]), fallbacks: [[end, end]] };
    const first = store.stage(id, token, request);
    vi.setSystemTime(epoch + 4000);
    const failed = store.staged(id, token);
    expect(failed).toMatchObject({ version: 2, pending: null, latestReceipt: { status: 'failed', failures: [{ candidateIndex: 0 }, { candidateIndex: 1 }] } });
    expect(store.get(id).state).toEqual(original.state);
    expect(store.get(id).history).toEqual(original.history);
    expect(store.moveHistory(id).total).toBe(0);
    expect(await store.wait(id, 1, 0)).toMatchObject({ changed: false, revision: 1, clock: { runningPlayer: 'white' } });
    expect(failed.clockPressure?.players.white.completedTurns).toBe(0);
    expect(store.stage(id, token, request).acknowledgement).toEqual(first.acknowledgement);
    vi.setSystemTime(epoch + 5000);
    expect(store.get(id).state.victoryReason).toBe('timeout');
    expect(store.staged(id, token).latestReceipt?.status).toBe('failed');
  });

  it('uses the current board after intervening plays and undo, and lets a committed staged move be undone normally', () => {
    const { store, id, token, move } = setup();
    const initial = store.get(id).state;
    store.stage(id, token, staged([move]));
    vi.setSystemTime(epoch + 1000);
    expect(store.act(id, token, command(1, [move])).staging?.pending).not.toBeNull();
    vi.setSystemTime(epoch + 2000);
    store.act(id, token, command(2, [{ type: 'UNDO' }]));
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).latestReceipt).toMatchObject({ status: 'executed', revision: 4 });
    expect(store.get(id)).toMatchObject({ canUndo: true, clock: { runningPlayer: 'white', deadlineAtMs: epoch + 5000 } });
    vi.setSystemTime(epoch + 4100);
    const undone = store.act(id, token, command(4, [{ type: 'UNDO' }]));
    expect(undone.state).toEqual(initial);
    expect(undone.staging?.latestReceipt?.status).toBe('executed'); // historical receipt, not a claim the move still stands
    store.act(id, token, command(5, [end]));
    expect(store.get(id).lastTurnReplay?.frames).toEqual([]);
    expect(store.moveHistory(id).entries.some(e => e.kind === 'move')).toBe(false);
  });

  it('re-evaluates fallbacks after a live board change without requiring the old revision', () => {
    const { store, id, token, move } = setup();
    store.stage(id, token, { ...staged([move, end]), fallbacks: [[end]] });
    store.act(id, token, command(1, [move]));
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).latestReceipt).toMatchObject({ status: 'executed', candidateIndex: 1, revision: 3 });
  });

  it('executes an authored UNDO alone with ordinary history/replay behavior', () => {
    const { store, id, token, move } = setup();
    const initial = store.get(id).state;
    store.act(id, token, command(1, [move]));
    store.stage(id, token, staged([{ type: 'UNDO' }]));
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).latestReceipt).toMatchObject({ status: 'executed', appliedActions: [{ type: 'UNDO' }] });
    expect(store.get(id).state).toEqual(initial);
    expect(store.moveHistory(id).entries).toEqual([]);
    store.act(id, token, command(3, [end]));
    expect(store.get(id).lastTurnReplay?.frames).toEqual([]);
  });

  it('can flag after a legal staged batch that omits end-turn', () => {
    const { store, id, token, move } = setup();
    store.stage(id, token, staged([move]));
    vi.advanceTimersByTime(5000);
    const room = store.get(id);
    expect(room.state.victoryReason).toBe('timeout');
    expect(room.history.map(h => h.actions)).toEqual([[move], []]);
    expect(room.clockPressure?.players.white.completedTurns).toBe(0);
    expect(store.staged(id, token).latestReceipt?.status).toBe('executed');
  });

  it.each(['handoff', 'resign'] as const)('clears pending plans on live %s without leaking into another turn', finish => {
    const { store, id, token, blackToken } = setup();
    store.stage(id, token, staged());
    const room = store.act(id, token, command(1, [finish === 'handoff' ? end : { type: 'RESIGN' }]));
    expect(room.staging).toMatchObject({ version: 2, pending: null, latestReceipt: { status: finish === 'handoff' ? 'turn_ended' : 'game_ended' } });
    if (finish === 'handoff') {
      store.act(id, blackToken, command(2, [end]));
      vi.setSystemTime(epoch + 4000);
      expect(store.get(id)).toMatchObject({ revision: 3, state: { turn: { currentPlayer: 'white', turnNumber: 2 } } });
      expect(() => store.stage(id, token, staged([end], 2, 'old-turn-stage'))).toThrow('own current full turn');
    }
  });

  it('keeps pending payloads, triggers, order and failures out of public snapshots, waits, history and opponent errors', async () => {
    const { store, id, token, blackToken } = setup();
    const result = store.stage(id, token, { ...staged([{ type: 'MOVE', unitId: 'SECRET_PLAN_ID', to: { x: 7, y: 8 } }]),
      fallbacks: [[{ type: 'PROMOTE_UNIT', unitId: 'SECRET_FALLBACK' }]] });
    const stageId = result.acknowledgement.stageId;
    const publicResults = [store.get(id), observe(store.get(id)), store.listActive(), store.moveHistory(id),
      await store.wait(id, 1, 0, undefined, token), store.get(id, blackToken), store.staged(id, blackToken)];
    for (const value of publicResults) {
      const text = JSON.stringify(value);
      for (const secret of ['SECRET_PLAN_ID', 'SECRET_FALLBACK', stageId, 'commitWhenRemainingMs', 'triggerAtMs']) expect(text).not.toContain(secret);
    }
    expect(store.get(id).staging).toBeUndefined();
    expect(store.get(id, token).staging?.pending?.id).toBe(stageId);
    expect(() => store.staged(id, blackToken, stageId)).toThrow('No stage with that ID belongs to this seat');
    expect(() => store.staged(id, 'bad-token')).toThrow('credential');
    vi.setSystemTime(epoch + 4000);
    store.staged(id, token);
    expect(JSON.stringify(store.get(id))).not.toContain('candidateIndex');
  });

  it.each([3000, 4500, 5000, 20000])('settles persisted work after restart at +%i ms without backdating', elapsed => {
    const path = file(), { store, id, token, move } = setup(path);
    const request = staged([move, end]), accepted = store.stage(id, token, request);
    close(store); vi.setSystemTime(epoch + elapsed);
    const reopened = open(path), second = open(path);
    let status = reopened.staged(id, token);
    if (elapsed === 3000) {
      expect(status.pending?.id).toBe(accepted.pending?.id);
      vi.advanceTimersByTime(1000);
      status = reopened.staged(id, token);
    }
    expect(status.pending).toBeNull();
    expect(status.latestReceipt?.status).toBe(elapsed < 5000 ? 'executed' : 'expired');
    expect(status.latestReceipt?.resolvedAtMs).toBe(epoch + Math.max(4000, elapsed));
    expect(second.get(id).revision).toBe(2);
    expect(second.stage(id, token, request).acknowledgement).toEqual(accepted.acknowledgement);
    expect(second.moveHistory(id).entries.filter(e => e.kind === (elapsed < 5000 ? 'move' : 'result'))).toHaveLength(1);
    if (elapsed >= 5000) {
      expect(second.get(id).history.at(-1)?.actions).toEqual([]);
      expect(() => second.cancelStage(id, token, cancel())).toThrow('ended on time');
    }
  });

  it('persists failed receipts across restart without trying the plan again', () => {
    const path = file(), { store, id, token, move } = setup(path);
    const result = store.stage(id, token, staged([move, move]));
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).latestReceipt?.status).toBe('failed');
    close(store);
    expect(open(path).staged(id, token, result.acknowledgement.stageId).requestedStage).toMatchObject({ status: 'failed' });
    expect(open(path).get(id).revision).toBe(1);
  });

  it('lets expiry win if validation itself finishes at the deadline', () => {
    const { store, id, token, move } = setup();
    store.stage(id, token, staged([move]));
    const apply = engine.applyAction;
    vi.spyOn(engine, 'applyAction').mockImplementationOnce((state, action) => {
      const result = apply(state, action);
      vi.setSystemTime(epoch + 5000);
      return result;
    });
    vi.setSystemTime(epoch + 4000);
    const status = store.staged(id, token);
    expect(status.latestReceipt?.status).toBe('expired');
    expect(store.get(id).state.victoryReason).toBe('timeout');
    expect(store.moveHistory(id).entries.map(e => e.kind)).toEqual(['result']);
  });

  it('does not expose private engine failures from a public read, and rolls back interrupted firing', () => {
    const { store, id, token, move } = setup();
    store.stage(id, token, staged([move]));
    vi.spyOn(engine, 'applyAction').mockImplementationOnce(() => { throw new Error('SECRET_PLAN_DIAGNOSTIC'); });
    vi.setSystemTime(epoch + 4000);
    expect(() => store.get(id)).toThrow('Staged play processing failed.');
    const status = store.staged(id, token); // retry after the transient failure
    expect(status.latestReceipt).toMatchObject({ status: 'executed', revision: 2 });
    expect(store.moveHistory(id).entries.filter(e => e.kind === 'move')).toHaveLength(1);
  });

  it('preserves immediate home-checkmate and records only the executed prefix', () => {
    const path = file(), { store, id, token } = setup(path);
    const invader = createUnit('fire_1', 'white', { x: 9, y: 8 });
    const db = new DatabaseSync(path);
    const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
    saved.state.board.units = [invader, createUnit('fire_1', 'black', { x: 4, y: 4 })];
    db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), id); db.close();
    const move: RoomAction = { type: 'MOVE', unitId: invader.id, to: { x: 9, y: 9 } };
    store.stage(id, token, staged([move, end]));
    vi.setSystemTime(epoch + 4000);
    expect(store.staged(id, token).latestReceipt).toMatchObject({ status: 'executed', appliedActions: [move] });
    const room = store.get(id);
    expect(room.state.victoryReason).toBe('home-checkmate');
    expect(room.history.at(-1)?.actions).toEqual([move]);
    expect(room.clockPressure?.players.white.completedTurns).toBe(0);
    expect(room.clock?.runningPlayer).toBeNull();
  });
});
