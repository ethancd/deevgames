// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExplorerStore, positionHash } from '../../server/explorer/store';
import type { AIAction } from '../../src/ai/types';
import { isLegalAction } from '../../src/game/legality';
import { createInitialGameState } from '../../src/game/board';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); });
const quiet: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
function setup(config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'muju-explorer-test-')), path = join(dir, 'rooms.sqlite');
  let store = new ExplorerStore(path); cleanup.push(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const { experiment, token } = store.create(config), id = experiment.id;
  return { get store() { return store; }, id, token,
    restart() { store.close(); store = new ExplorerStore(path); },
    claim() { return store.claim(id, token, 'test-runner')!; },
    assess(p = 0.5) { const job = this.claim(); expect(job.kind).toBe('assess'); return store.submit(id, token, job.id,
      { kind: 'assess', assessment: { whiteWin: p, pressure: 'balanced', counterplay: 'Both have choices.', explanation: 'Position assessment.' }, memory: `${job.player} private memory` }); },
    turn(actions = quiet) { const job = this.claim(); expect(job.kind).toBe('turn'); return store.submit(id, token, job.id, { kind: 'turn', actions, explanation: 'Complete turn', memory: 'Learned a line.' }); },
  };
}
it('uses 9.5, 5 games, 100 total player-turns and hides the first assessment across restart', () => {
  const run = setup();
  expect(run.store.get(run.id).config).toMatchObject({ handicap: 9.5, maxGames: 5, maxPlies: 100 });
  const white = run.claim(); expect(white.player).toBe('white');
  const publicView = run.assess(0.61); expect(publicView.checkpoints[0].assessments).toEqual({});
  run.restart(); const black = run.claim();
  expect(black.player).toBe('black'); expect(black.prompt).not.toContain('0.61'); expect(black.prompt).not.toContain('white private memory');
  const revealed = run.assess(0.44);
  expect(revealed.checkpoints[0].assessments).toMatchObject({ white: { whiteWin: 0.61 }, black: { whiteWin: 0.44 } });
});
it('rejects incomplete/illegal turns atomically and enforces the global ply cap', () => {
  const run = setup({ maxPlies: 1 }); run.assess(); run.assess();
  const job = run.claim();
  expect(() => run.store.submit(run.id, run.token, job.id, { kind: 'turn', actions: [{ type: 'END_ACTION_PHASE' }], explanation: '', memory: '' })).toThrow('complete turn');
  expect(run.store.get(run.id).plies).toBe(0);
  const done = run.turn(); expect(done).toMatchObject({ plies: 1, status: 'complete', stopReason: 'move-budget' });
  expect(done.games[0].outcome?.winner).toBeNull();
  expect(run.store.claim(run.id, run.token, 'test-runner')).toBeNull();
});
it('requires consecutive bilateral agreement, and records consensus separately from a rules win', () => {
  const run = setup(); run.assess(0.95); run.assess(0.95); run.turn();
  run.assess(0.95); run.assess(0.6); expect(run.claim().kind).toBe('turn'); run.turn();
  run.assess(0.95); run.assess(0.95); run.turn(); run.assess(0.95);
  const result = run.assess(0.95);
  expect(result.games[0].outcome).toMatchObject({ kind: 'consensus', winner: 'white' });
  expect(result.checkpoints.at(-1)!.state.phase).toBe('playing');
  expect(run.claim()).toMatchObject({ kind: 'branch', player: 'black' });
});
it('terminal-only mode ignores unanimous forecasts and stops at the game cap after a rules result', () => {
  const run = setup({ terminalOnly: true, maxGames: 1 });
  for (let i = 0; i < 10; i++) { run.assess(0.99); run.assess(0.99); run.turn(); }
  expect(run.store.get(run.id)).toMatchObject({ status: 'complete', stopReason: 'game-budget', plies: 10 });
  expect(run.store.get(run.id).games[0].outcome).toMatchObject({ kind: 'rules', winner: 'black' });
  expect(run.claim()).toBeNull();
});
it('rejects actions after a terminal turn atomically and labels an operator stop unresolved', () => {
  const run = setup({ terminalOnly: true });
  for (let i = 0; i < 9; i++) { run.assess(); run.assess(); run.turn(); }
  run.assess(); run.assess();
  expect(() => run.turn([...quiet, { type: 'END_ACTION_PHASE' }])).toThrow('after the turn ended');
  expect(run.store.get(run.id).plies).toBe(9);
  const stopped = run.store.control(run.id, run.token, 'stop');
  expect(stopped.games[0].outcome).toMatchObject({ kind: 'stopped', winner: null });
});
it('reclaims an expired lease without accepting its stale submission', () => {
  const run = setup(), old = run.claim(), now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 400_000);
  const next = run.store.claim(run.id, run.token, 'replacement-runner')!;
  expect(next.id).not.toBe(old.id); expect(next.checkpointId).toBe(old.checkpointId);
  expect(() => run.store.submit(run.id, run.token, old.id, { kind: 'assess', assessment: { whiteWin: 0.5, pressure: 'balanced', counterplay: '', explanation: '' }, memory: '' })).toThrow('expired');
  expect(run.store.get(run.id).plies).toBe(0);
});
it('forks exactly from a losing decision, preserves the parent, counts only new turns, and survives restart', () => {
  const run = setup({ maxGames: 2 });
  for (let i = 0; i < 10; i++) { run.assess(); run.assess(); run.turn(); }
  const before = run.store.get(run.id), parent = structuredClone(before.games[0]);
  expect(parent.outcome).toMatchObject({ kind: 'rules', winner: 'black' });
  const job = run.claim(); expect(job).toMatchObject({ kind: 'branch', player: 'white' });
  const cp = before.checkpoints[8], unit = cp.state.board.units.find(u => u.owner === 'white')!;
  let move: AIAction | undefined;
  for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) { const action: AIAction = { type: 'MOVE', unitId: unit.id, to: { x, y } }; if (isLegalAction(cp.state, action)) move ??= action; }
  const duplicate = { kind: 'branch', checkpointId: cp.id, actions: quiet, explanation: 'Retry', memory: 'Try better' };
  expect(() => run.store.submit(run.id, run.token, job.id, duplicate)).toThrow('already explored');
  const result = { ...duplicate, actions: [move!, ...quiet] };
  const after = run.store.submit(run.id, run.token, job.id, result);
  expect(after.games[0]).toEqual(parent); expect(after.games).toHaveLength(2); expect(after.plies).toBe(11);
  expect(after.games[1].checkpoints.slice(0, -1)).toEqual(parent.checkpoints.slice(0, 9));
  expect(after.checkpoints.at(-1)!.state.blackCrystalHandicap).toBe(9.5);
  run.restart();
  expect(run.store.submit(run.id, run.token, job.id, result)).toEqual(after);
  expect(() => run.store.submit(run.id, run.token, job.id, duplicate)).toThrow('another result');
});
it('rejects stale leases and invalid credentials, pauses durably and counts inference calls idempotently', () => {
  const run = setup({ maxModelCalls: 1 }), job = run.claim();
  expect(() => run.store.claim(run.id, 'wrong', 'test-other')).toThrow('private experiment');
  expect(run.store.claim(run.id, run.token, 'test-other')).toBeNull();
  expect(run.store.call(run.id, run.token, job.id, 'unique-call')).toEqual({ allowed: true });
  run.store.call(run.id, run.token, job.id, 'unique-call'); expect(run.store.get(run.id).modelCalls).toBe(1);
  expect(run.store.call(run.id, run.token, job.id, 'another-call')).toEqual({ allowed: false });
  run.restart(); expect(run.store.get(run.id)).toMatchObject({ status: 'paused', stopReason: 'model-call-budget' });
  expect(() => run.store.query(run.id, run.token, job.id, {})).toThrow('expired');
  expect(() => run.store.control(run.id, run.token, 'resume')).toThrow('budget is exhausted');
});
it('does not reveal a lone estimate in exports or allow assessments to preview another board', () => {
  const run = setup(); run.assess(0.91); const job = run.claim();
  expect(JSON.stringify(run.store.get(run.id))).not.toContain('0.91');
  expect(() => run.store.query(run.id, run.token, job.id, { actions: quiet })).toThrow('Assess the current');
  expect(run.store.query(run.id, run.token, job.id, {}).legal.total).toBeGreaterThan(0);
});
it('canonical hashes ignore random piece IDs and presentation while retaining resources and kill clock', () => {
  const initial = createInitialGameState(undefined, 4, 9.5, 'phasing'), equivalent = structuredClone(initial);
  equivalent.board.units.forEach((u, i) => u.id = `other-${i}`); equivalent.board.units.reverse();
  equivalent.lastIncome = { player: 'white', turnNumber: 1, total: 5, takes: [] };
  expect(positionHash(equivalent)).toBe(positionHash(initial));
  equivalent.inactivityPlies = 3; expect(positionHash(equivalent)).not.toBe(positionHash(initial));
});
it('serves public evidence and authenticates runner mutations through HTTP', async () => {
  const rooms = new RoomStore(), explorer = new ExplorerStore(); cleanup.push(() => { rooms.close(); explorer.close(); });
  const server = createApp(rooms, { publicUrl: 'http://localhost', explorer }).listen(0, '127.0.0.1'); cleanup.push(() => server.close());
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/muju/experiments`;
  const created = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
  const view = await fetch(`${url}/${created.experiment.id}/export`).then(r => r.json());
  expect(view.experiment.config.handicap).toBe(9.5); expect(JSON.stringify(view)).not.toContain(created.token);
  const rejected = await fetch(`${url}/${created.experiment.id}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"workerId":"anonymous"}' });
  expect(rejected.status).toBe(401);
});
