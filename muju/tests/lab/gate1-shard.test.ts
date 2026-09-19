// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WHOLE_ROW, canonicalJson, gameContentHash, mergeShards, parseShardSpec, runShardGames,
  shardGamesFile, shardManifestFile, shardOfTask, shardStem, stripVolatile, tasksForShard,
  type GameLine, type RowIdentity, type ShardSpec,
} from '../../lab/ai/gate1-shard';
import { DEFAULT_GAME_SECONDS, launchPlan, parseArgs as launchArgs } from '../../lab/ai/gate1-launch';
import { FULL_PAIRS, schedule, type Task } from '../../lab/ai/gate1-report';
import { loadGate1Book, gate1StartState, scheduleOpenings } from '../../lab/ai/gate1-openings';
import { createTraceHasher } from '../../lab/ai/gate1-trace';
import { createExpandBot, createRushBot } from '../../lab/harness/bots/archetypes';
import { playGame } from '../../lab/harness/runner';
import { DEFAULT_MATCH_OPTIONS } from '../../lab/harness/types';

const book = loadGate1Book();
const openings = scheduleOpenings(book);
const full = schedule('full', openings);
const IDENTITY: RowIdentity = {
  identityHash: 'identity-1', mode: 'full', seed: 20260960,
  calibrationSha256: 'calib-1', sourceIdentitySha256: 'sources-1', openingsDigest: 'book-1',
};
const dir = () => mkdtempSync(join(tmpdir(), 'gate1-shard-'));

/**
 * A tiny synthetic schedule: one cell, eight pairs, sixteen games. Eight pairs
 * is the smallest schedule that fills all of 1/1, 3/3 and 8/8 — with the real
 * 384-pair row every layout up to 48 shards is full by construction.
 */
const tiny = full.filter(t => t.opponent === 'Rush' && t.handicap === 0 && t.pair < 8);

/** A stand-in for a played game: deterministic in the task, nothing else. */
const fakeEntry = (task: Task, identity = IDENTITY.identityHash) => ({
  task, identityHash: identity,
  gameSha256: gameContentHash({ id: task.id, seed: task.seed }),
  record: { winner: task.hardSeat, seed: task.seed, durationMs: Math.random(), startedAt: new Date().toISOString() },
  load: { before: [Math.random()], after: [Math.random()] },
});

describe('shard arithmetic', () => {
  it('parses i/n and refuses anything else', () => {
    expect(parseShardSpec('1/1')).toEqual(WHOLE_ROW);
    expect(parseShardSpec('3/8')).toEqual({ index: 3, count: 8 });
    for (const bad of ['', '0/8', '9/8', '8', '1/0', '-1/8', '1/2/3', '1.5/8', `1/${FULL_PAIRS + 1}`, 'a/b']) {
      expect(() => parseShardSpec(bad), bad).toThrow();
    }
  });

  it('partitions the whole row exactly once, keeping both seats of a pair together', () => {
    for (const count of [1, 2, 3, 8, 16, 48]) {
      const seen = new Map<string, number>();
      for (let index = 1; index <= count; index++) {
        for (const task of tasksForShard(full, { index, count })) {
          expect(seen.has(task.id)).toBe(false);
          seen.set(task.id, index);
        }
      }
      expect(seen.size).toBe(full.length);
      // A pair is the unit of evidence: never split across two processes.
      for (const task of full) expect(seen.get(`${task.pairId}-white`)).toBe(seen.get(`${task.pairId}-black`));
      // And every shard holds a slice of EVERY cell, so losing one shard does
      // not wipe out a cell.
      for (let index = 1; index <= count; index++) {
        const mine = tasksForShard(full, { index, count });
        expect(mine.length).toBeGreaterThan(0);
        expect(new Set(mine.map(t => `${t.opponent}-h${t.handicap}`)).size).toBe(8);
      }
    }
  });

  it('assigns a shard from the cell and pair alone, never from list position', () => {
    const shuffled = [...full].reverse();
    for (const task of shuffled) expect(shardOfTask(task, 8)).toBe(shardOfTask(task, 8));
    for (const count of [3, 8]) {
      const byId = new Map(full.map(t => [t.id, shardOfTask(t, count)]));
      for (const task of shuffled) expect(shardOfTask(task, count)).toBe(byId.get(task.id));
    }
    expect(() => shardOfTask(full[0], 0)).toThrow();
  });
});

describe('content hashing', () => {
  it('ignores key order and every clock measurement, and nothing else', () => {
    const a = { b: 1, a: { d: [1, 2], c: 'x' } };
    const b = { a: { c: 'x', d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] })); // arrays keep order
    const entry = { task: { id: 'g' }, record: { winner: 'white', durationMs: 5, startedAt: 'then',
      players: { white: { plies: 3, decisionMs: 1, turnMs: [1, 2] } } }, load: [1, 2] };
    const slower = { task: { id: 'g' }, record: { winner: 'white', durationMs: 5000, startedAt: 'later',
      players: { white: { plies: 3, decisionMs: 900, turnMs: [400, 500] } } }, load: [9, 9] };
    expect(gameContentHash(entry)).toBe(gameContentHash(slower));
    expect(stripVolatile(entry)).toEqual({ task: { id: 'g' }, record: { winner: 'white', players: { white: { plies: 3 } } } });
    // A different RESULT is a different game, however fast it was played.
    expect(gameContentHash({ ...entry, record: { ...entry.record, winner: 'black' } })).not.toBe(gameContentHash(entry));
  });
});

/**
 * A3 §4 and the review's third point: "a game's result does not depend on which
 * shard or order ran it". The games below are played by the harness with
 * SCRIPTED stub engines (seeded archetypes, no search), so the whole
 * seed-to-record path is real while the test stays cheap.
 */
describe('shard layout does not change a game', () => {
  async function playStub(task: Task) {
    const opening = book.openings[task.openingIndex];
    const initialState = gate1StartState(opening, task.handicap);
    const trace = createTraceHasher(task.startSha256);
    const stub = task.hardSeat === 'white'
      ? { white: createRushBot(), black: createExpandBot() }
      : { white: createExpandBot(), black: createRushBot() };
    const { record } = await playGame({
      bots: stub, seed: task.seed, runId: 'shard-test', engineHash: IDENTITY.identityHash,
      experiment: 'gate1-shard-test', initialState,
      options: { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: task.handicap, actionsPerTurn: 4,
        maxTurns: 4, upkeep: 'shipped', inactivityRule: 'on' },
      onAction(before, _after, action) { trace.push(before, action); },
    });
    return { task, identityHash: IDENTITY.identityHash, record,
      gameSha256: trace.digest(), plies: trace.steps.length, load: { before: [0], after: [0] } };
  }

  it('produces byte-identical game records at layouts 1/1, 3/3 and 8/8', async () => {
    const byLayout = new Map<number, Map<string, string>>();
    for (const count of [1, 3, 8]) {
      const out = dir();
      const games: GameLine[] = [];
      for (let index = 1; index <= count; index++) {
        const result = await runShardGames({ out, shard: { index, count }, tasks: tiny,
          identity: IDENTITY, play: playStub });
        expect(result.played).toHaveLength(tasksForShard(tiny, { index, count }).length);
        expect(result.resumed).toEqual([]);
        games.push(...result.games);
      }
      expect(games).toHaveLength(tiny.length);
      const merged = mergeShards(out, tiny);
      expect(merged.entries.map(e => e.task.id)).toEqual(tiny.map(t => t.id)); // schedule order
      byLayout.set(count, new Map(merged.entries.map(e =>
        [e.task.id, canonicalJson(stripVolatile(e))])));
    }
    const [one, three, eight] = [byLayout.get(1)!, byLayout.get(3)!, byLayout.get(8)!];
    expect([...one.keys()].sort()).toEqual([...eight.keys()].sort());
    for (const [id, content] of one) {
      expect(three.get(id), id).toBe(content);
      expect(eight.get(id), id).toBe(content);
    }
    // The stub games are not all the same game, so the comparison has teeth.
    expect(new Set([...one.values()]).size).toBe(tiny.length);
  }, 180000);
});

describe('resume', () => {
  it('replays only what is missing, and never trusts a line it cannot verify', async () => {
    const out = dir();
    const shard: ShardSpec = { index: 1, count: 2 };
    const mine = tasksForShard(tiny, shard);
    let fail = 3;
    const flaky = async (task: Task) => {
      if (--fail === 0) throw new Error('simulated crash');
      return fakeEntry(task);
    };
    await expect(runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: flaky }))
      .rejects.toThrow('simulated crash');
    const partial = readFileSync(`${out}/${shardGamesFile(shard)}`, 'utf8').trim().split('\n');
    expect(partial).toHaveLength(2);
    expect(JSON.parse(readFileSync(`${out}/${shardManifestFile(shard)}`, 'utf8')).shardStatus).toBe('incomplete');

    const played: string[] = [];
    const second = await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async (task: Task) => { played.push(task.id); return fakeEntry(task); } });
    expect(second.resumed).toEqual(mine.slice(0, 2).map(t => t.id));
    expect(played).toEqual(mine.slice(2).map(t => t.id)); // the two survivors were NOT replayed
    expect(second.games.map(g => g.task.id)).toEqual(mine.map(t => t.id));
    expect(JSON.parse(readFileSync(`${out}/${shardManifestFile(shard)}`, 'utf8')).shardStatus).toBe('complete');
    // A second resume of a finished shard plays nothing at all.
    const third = await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async () => { throw new Error('should not play'); } });
    expect(third.played).toEqual([]);
    expect(third.resumed).toHaveLength(mine.length);
  });

  it('drops a torn final line but refuses a corrupted earlier one', async () => {
    const shard: ShardSpec = { index: 1, count: 2 };
    const mine = tasksForShard(tiny, shard);
    const seed = async (out: string) => runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async (task: Task) => fakeEntry(task) });

    const torn = dir();
    await seed(torn);
    appendFileSync(`${torn}/${shardGamesFile(shard)}`, '{"task":{"id":"half');
    const replayed: string[] = [];
    const after = await runShardGames({ out: torn, shard, tasks: tiny, identity: IDENTITY,
      play: async (task: Task) => { replayed.push(task.id); return fakeEntry(task); } });
    expect(replayed).toEqual([]); // the torn tail was not a game
    expect(after.games).toHaveLength(mine.length);
    expect(readFileSync(`${torn}/${shardGamesFile(shard)}`, 'utf8')).not.toContain('half');

    const edited = dir();
    await seed(edited);
    const lines = readFileSync(`${edited}/${shardGamesFile(shard)}`, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[0]) as GameLine;
    (tampered.record as { winner?: string }).winner = 'black'; // a result, quietly changed
    lines[0] = JSON.stringify(tampered);
    writeFileSync(`${edited}/${shardGamesFile(shard)}`, lines.join('\n') + '\n');
    await expect(runShardGames({ out: edited, shard, tasks: tiny, identity: IDENTITY,
      play: async (task: Task) => fakeEntry(task) })).rejects.toThrow(/failed its content hash/);
  });

  it('refuses to mix identities, layouts, or another shard\'s games', async () => {
    const out = dir();
    const shard: ShardSpec = { index: 1, count: 2 };
    await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });

    const other = { ...IDENTITY, calibrationSha256: 'calib-2' };
    await expect(runShardGames({ out, shard, tasks: tiny, identity: other, play: async (t: Task) => fakeEntry(t) }))
      .rejects.toThrow(/different row \(calibrationSha256 differs\)/);
    await expect(runShardGames({ out, shard: { index: 1, count: 4 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) })).rejects.toThrow(/a 2-shard layout, but this process is shard-1-of-4/);
    // A game produced at another identity is refused as it is written, not later.
    const fresh = dir();
    await expect(runShardGames({ out: fresh, shard, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t, 'identity-2') })).rejects.toThrow(/different identity/);
    // As is a line for a game this shard does not own.
    const foreign = dir();
    await runShardGames({ out: foreign, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
    const intruder = tasksForShard(tiny, { index: 2, count: 2 })[0];
    const line = { ...fakeEntry(intruder), contentSha256: '' };
    line.contentSha256 = gameContentHash(line);
    appendFileSync(`${foreign}/${shardGamesFile(shard)}`, JSON.stringify(line) + '\n');
    await expect(runShardGames({ out: foreign, shard, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) })).rejects.toThrow(/is not scheduled for shard-1-of-2/);
  });
});

describe('merge', () => {
  async function runAll(out: string, count: number, identityFor: (index: number) => RowIdentity = () => IDENTITY) {
    for (let index = 1; index <= count; index++) {
      await runShardGames({ out, shard: { index, count }, tasks: tiny, identity: identityFor(index),
        play: async (task: Task) => fakeEntry(task, identityFor(index).identityHash) });
    }
  }

  it('accepts a complete row and returns it in schedule order', async () => {
    const out = dir();
    await runAll(out, 4);
    const merged = mergeShards(out, tiny);
    expect(merged.entries.map(e => e.task.id)).toEqual(tiny.map(t => t.id));
    expect(merged.shards).toHaveLength(4);
    expect(merged.perShard.reduce((a, s) => a + s.games, 0)).toBe(tiny.length);
    expect(merged.identity).toEqual(IDENTITY);
    expect(new Set(merged.entries.map(e => e.task.id)).size).toBe(tiny.length); // exactly once
  });

  it('refuses a missing shard, a mixed identity, a mixed layout and a short shard', async () => {
    const missing = dir();
    await runAll(missing, 4);
    const dropped = `${missing}/${shardManifestFile({ index: 3, count: 4 })}`;
    writeFileSync(dropped, JSON.stringify({ note: 'not a shard manifest' }));
    expect(() => mergeShards(missing, tiny)).toThrow(/is not a finished shard manifest/);
    writeFileSync(dropped, JSON.stringify({ shard: { index: 9, count: 4 }, identity: IDENTITY, shardStatus: 'complete' }));
    expect(() => mergeShards(missing, tiny)).toThrow(/Missing shard manifests: 3\/4/);

    // The runner refuses to CREATE a mixed directory, so this one is assembled
    // by hand — two shards run apart and their files collected together, which
    // is exactly how a row would come to be mixed in practice.
    const mixed = dir();
    await runShardGames({ out: mixed, shard: { index: 1, count: 2 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    const elsewhere = dir();
    const strange = { ...IDENTITY, identityHash: 'identity-2' };
    await runShardGames({ out: elsewhere, shard: { index: 2, count: 2 }, tasks: tiny, identity: strange,
      play: async (t: Task) => fakeEntry(t, strange.identityHash) });
    for (const file of [shardManifestFile({ index: 2, count: 2 }), shardGamesFile({ index: 2, count: 2 })]) {
      writeFileSync(`${mixed}/${file}`, readFileSync(`${elsewhere}/${file}`, 'utf8'));
    }
    expect(() => mergeShards(mixed, tiny)).toThrow(/disagrees about identityHash/);

    const layouts = dir();
    await runShardGames({ out: layouts, shard: { index: 1, count: 2 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    writeFileSync(`${layouts}/${shardManifestFile({ index: 1, count: 3 })}`,
      JSON.stringify({ shard: { index: 1, count: 3 }, identity: IDENTITY, shardStatus: 'complete' }));
    expect(() => mergeShards(layouts, tiny)).toThrow(/different layouts/);

    const short = dir();
    await runAll(short, 2);
    const path = `${short}/${shardGamesFile({ index: 1, count: 2 })}`;
    const kept = readFileSync(path, 'utf8').trim().split('\n').slice(0, -1);
    writeFileSync(path, kept.join('\n') + '\n');
    expect(() => mergeShards(short, tiny)).toThrow(/is missing 1 game/);
  });

  it('refuses a directory with no shards at all', () => {
    const empty = dir();
    expect(() => mergeShards(empty, tiny)).toThrow(/no shard manifests/);
    expect(readdirSync(empty)).toEqual([]);
  });

  it('is what the launcher plans, wall time included', () => {
    const options = { shards: 8, mode: 'full' as const, out: 'DIR', calibration: 'C/calibration.json',
      gameSeconds: 70, exec: false, acceptLoadedCalibration: false };
    const plan = launchPlan(options);
    expect(plan.games).toBe(768);
    expect(plan.split).toHaveLength(8);
    expect(plan.split.reduce((a, s) => a + s.games, 0)).toBe(768);
    for (const s of plan.split) expect(s.games).toBe(96); // 384 pairs / 8, both seats
    expect(plan.split[2].command).toContain('--shard 3/8');
    expect(plan.split[2].command).toContain('--calibration C/calibration.json');
    expect(plan.split[2].command).not.toContain('--accept-loaded-calibration');
    expect(plan.merge).toBe('node --import tsx lab/ai/gate1.ts --merge DIR --mode full');
    // wall ~= ceil(shards/slots) * max(games per shard) * seconds, floored by
    // the total work divided by the slots: more shards buy restarts, not speed.
    const slots = plan.queue.slots;
    expect(plan.wallTime.sequentialHours).toBeCloseTo(768 * 70 / 3600, 1);
    expect(plan.wallTime.waves).toBe(Math.ceil(8 / slots));
    expect(plan.wallTime.estimatedHours).toBeCloseTo(Math.ceil(8 / slots) * 96 * 70 / 3600, 1);
    expect(plan.wallTime.floorHours).toBeCloseTo(768 * 70 / 3600 / slots, 1);
    expect(plan.wallTime.estimatedHours).toBeGreaterThanOrEqual(plan.wallTime.floorHours - 0.01);
    expect(launchPlan({ ...options, acceptLoadedCalibration: true }).split[0].command)
      .toContain('--accept-loaded-calibration');
    for (const args of [[], ['--shards', '8'], ['--shards', '0', '--out', 'x', '--calibration', 'c'],
      ['--shards', '8', '--out', 'x'], ['--shards', '8', '--out', 'x', '--calibration', 'c', '--mode', 'wall']]) {
      expect(() => launchArgs(args), args.join(' ')).toThrow();
    }
    expect(launchArgs(['--shards', '4', '--out', 'x', '--calibration', 'c']).gameSeconds).toBe(DEFAULT_GAME_SECONDS);
    expect(launchArgs(['--shards', '4', '--out', 'x', '--calibration', 'c', '--exec']).exec).toBe(true);
  });

  it('names its files after the layout so two layouts cannot overwrite each other', () => {
    expect(shardStem({ index: 3, count: 8 })).toBe('shard-3-of-8');
    expect(shardGamesFile({ index: 3, count: 8 })).toBe('games-shard-3-of-8.jsonl');
    expect(shardManifestFile({ index: 3, count: 8 })).toBe('manifest-shard-3-of-8.json');
    expect(shardGamesFile(WHOLE_ROW)).toBe('games-shard-1-of-1.jsonl');
  });
});
