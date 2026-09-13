// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { AnalysisService } from '../../server/analysis';
import { observe, legalActions } from '../../server/observation';
import type { RoomAction } from '../../src/online/types';

const epoch = 1800000000000;
const stores = new Set<RoomStore>(), directories: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => {
  stores.forEach(store => store.close()); stores.clear();
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
  vi.useRealTimers();
});
const open = (path?: string) => { const store = new RoomStore(path); stores.add(store); return store; };
function setup(path?: string) {
  const store = open(path), host = store.create({ name: 'White', timeControl: { delaySeconds: 2, bankSeconds: 20 } });
  const id = host.room.id, guest = store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  const tokens = { white: host.credentials.token, black: guest.credentials.token };
  const play = (actions: RoomAction[], preview = false) => {
    const room = store.get(id);
    return store.act(id, tokens[room.state.turn.currentPlayer], { expectedRevision: room.revision,
      requestId: `command-${room.revision}`, actions }, preview);
  };
  const endTurn = (elapsed: number) => {
    const room = store.get(id);
    vi.setSystemTime(room.clock!.turnStartedAtMs! + elapsed);
    return play([...(room.state.turn.phase === 'place' ? [{ type: 'END_PLACE_PHASE' } as const] : []), { type: 'END_ACTION_PHASE' }]);
  };
  return { store, id, tokens, play, endTurn };
}

describe('measured clock pressure', () => {
  it('averages per-turn bank spend, counts full turns, and reports projection with its sampling window', () => {
    const { store, id, endTurn } = setup();
    expect(store.get(id).clockPressure).toMatchObject({ sampling: { window: 'all_tracked_completed_turns',
      startedAtMs: epoch, startedRevision: 0, completeFromGameStart: true, terminalTurns: 'excluded' },
      players: { white: { completedTurns: 0, meanElapsedMs: null, meanBankSpentMs: null,
        projection: { status: 'no_samples', turnsCovered: null } } } });
    endTurn(1000); // White spends 0
    endTurn(1000); // Black spends 0
    const room = endTurn(4000); // White spends 2000: mean 1000, not max(0, 2500-2000)=500
    expect(room.clockPressure?.players.white).toEqual({ completedTurns: 2, totalElapsedMs: 5000, meanElapsedMs: 2500,
      totalBankSpentMs: 2000, meanBankSpentMs: 1000, remainingBankMs: 18000,
      firstTurnStartedAtMs: epoch, lastTurnCompletedAtMs: epoch + 6000,
      projection: { status: 'estimated', turnsCovered: 18 } });
    expect(room.clockPressure?.players.black).toMatchObject({ completedTurns: 1, totalBankSpentMs: 0,
      meanBankSpentMs: 0, projection: { status: 'no_observed_drain', turnsCovered: null } });
    expect(room.clockPressure?.projectionBasis).toBe('if historical pace continues; not turns left in the game');
    expect(JSON.stringify(room.clockPressure)).not.toMatch(/Infinity|NaN/);
  });

  it('includes partial play, previews and undo in elapsed time but never counts them as separate samples', () => {
    const { store, id, tokens, play, endTurn } = setup();
    const unitId = store.get(id).state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
    vi.setSystemTime(epoch + 1000);
    play([{ type: 'MOVE', unitId, to: { x: 2, y: 0 } }]);
    vi.setSystemTime(epoch + 3000);
    play([{ type: 'UNDO' }]);
    vi.setSystemTime(epoch + 4000);
    const preview = play([{ type: 'END_ACTION_PHASE' }], true);
    expect(preview.clock?.runningPlayer).toBe('white');
    expect(preview.clockPressure?.players.white).toMatchObject({ completedTurns: 0, remainingBankMs: 18000 });
    expect(store.get(id).clockPressure?.players.white.completedTurns).toBe(0);
    const ended = endTurn(5000);
    expect(ended.clockPressure?.players.white).toMatchObject({ completedTurns: 1, totalElapsedMs: 5000, totalBankSpentMs: 3000 });
    const retry = store.act(id, tokens.white, { expectedRevision: 3, requestId: 'command-3', actions: [{ type: 'END_ACTION_PHASE' }] });
    expect(retry.clockPressure).toEqual(ended.clockPressure);
  });

  it('projects remaining bank freshly on unchanged revisions, including cached briefing and waits', async () => {
    const { store, id, endTurn } = setup();
    endTurn(4000); endTurn(1000);
    const analysis = new AnalysisService();
    const before = store.get(id), first = analysis.briefing(before, 'white');
    expect(first.clockPressure).toEqual(before.clockPressure);
    vi.setSystemTime(before.clock!.turnStartedAtMs! + 3000);
    const after = store.get(id);
    expect(after.revision).toBe(before.revision);
    expect(after.clockPressure?.players.white).toMatchObject({ completedTurns: 1, remainingBankMs: 17000,
      meanBankSpentMs: 2000, projection: { status: 'estimated', turnsCovered: 8.5 } });
    expect(observe(after).clockPressure).toEqual(after.clockPressure);
    expect(legalActions(after, { limit: 1 }).clockPressure).toEqual(after.clockPressure);
    const cached = analysis.briefing(after, 'white', before.revision);
    expect(cached.clockPressure).toEqual(after.clockPressure);
    expect(cached.diff).toMatchObject({ mode: 'changed_sections' });
    expect(cached.sections.economy).toBeUndefined();
    const waited = await store.wait(id, after.revision, 0);
    expect(waited).toMatchObject({ changed: false, clockPressure: after.clockPressure });
  });

  it.each(['resign', 'timeout', 'draw'] as const)('excludes terminal turns (%s) while keeping earlier completed samples', terminal => {
    const { store, id, play, endTurn } = setup();
    endTurn(1000);
    if (terminal === 'resign') play([{ type: 'RESIGN' }]);
    else if (terminal === 'timeout') vi.setSystemTime(store.get(id).clock!.deadlineAtMs!);
    else for (let turn = 2; turn <= 10; turn++) endTurn(1000);
    const room = store.get(id), pressure = room.clockPressure!;
    expect(room.state.phase).toBe('victory');
    expect(pressure.players.white.completedTurns).toBe(terminal === 'draw' ? 5 : 1);
    expect(pressure.players.black.completedTurns).toBe(terminal === 'draw' ? 4 : 0);
    const saved = structuredClone(pressure);
    vi.setSystemTime(Date.now() + 100000);
    expect(store.get(id).clockPressure).toEqual(saved);
  });

  it('persists samples across restart, and marks missing old history without reconstructing it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'muju-pace-')); directories.push(directory);
    const path = join(directory, 'rooms.sqlite'), { store, id, tokens, endTurn } = setup(path);
    endTurn(4000);
    store.close(); stores.delete(store);
    const restored = open(path);
    expect(restored.get(id).clockPressure?.players.white).toMatchObject({ completedTurns: 1, totalBankSpentMs: 2000 });
    const db = new DatabaseSync(path);
    const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
    delete saved.clockHistory;
    db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), id); db.close();
    const old = restored.get(id);
    expect(old.clockPressure).toMatchObject({ sampling: { completeFromGameStart: false, startedRevision: 2, startedAtMs: epoch + 4000 },
      players: { white: { completedTurns: 0 }, black: { completedTurns: 0 } } });
    // The already-running Black turn is skipped. The next complete White turn is measured.
    vi.setSystemTime(epoch + 7000);
    restored.act(id, tokens.black, { expectedRevision: 2, requestId: 'old-black-turn-end', actions: [{ type: 'END_ACTION_PHASE' }] });
    vi.setSystemTime(epoch + 11000);
    const next = restored.act(id, tokens.white, { expectedRevision: 3, requestId: 'new-white-turn-end',
      actions: [{ type: 'END_PLACE_PHASE' }, { type: 'END_ACTION_PHASE' }] });
    expect(next.clockPressure?.players.white).toMatchObject({ completedTurns: 1, totalElapsedMs: 4000, totalBankSpentMs: 2000 });
    expect(next.clockPressure?.players.black.completedTurns).toBe(0);
    const untimed = restored.create({ name: 'Untimed' });
    expect(restored.get(untimed.room.id).clockPressure).toBeNull();
  });
});
