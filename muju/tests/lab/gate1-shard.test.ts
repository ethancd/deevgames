// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WHOLE_ROW, acquireShardLock, canonicalJson, gameContentHash, mergeShards, parseShardSpec, patchShardManifest,
  readShardGames, runShardGames, shardGamesFile, shardLockFile, shardManifestFile, shardOfTask, shardStem,
  stripVolatile, tasksForShard, type GameLine, type RowIdentity, type ShardSpec,
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
 * What `gate1.ts` stamps on a shard manifest once the whole shard finished CLEAN:
 * `status`. `runShardGames` owns `shardStatus` ("I played my whole share"); the
 * runner owns `status` ("and nothing went wrong afterwards"), and a merge now
 * requires both. These tests drive `runShardGames` directly, so they close the
 * shard the way the runner would.
 */
const finish = (out: string, shard: ShardSpec, patch: Record<string, unknown> = {}) =>
  patchShardManifest(out, shard, { status: 'complete', ...patch });
/** These fixtures pin a synthetic source identity, so the merge gets the same one. */
const MERGE = { sourceIdentity: () => IDENTITY.sourceIdentitySha256 };

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
        finish(out, { index, count });
        games.push(...result.games);
      }
      expect(games).toHaveLength(tiny.length);
      const merged = mergeShards(out, tiny, MERGE);
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
      finish(out, { index, count });
    }
  }

  it('accepts a complete row and returns it in schedule order', async () => {
    const out = dir();
    await runAll(out, 4);
    const merged = mergeShards(out, tiny, MERGE);
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
    expect(() => mergeShards(missing, tiny, MERGE)).toThrow(/is not a finished shard manifest/);
    writeFileSync(dropped, JSON.stringify({ shard: { index: 9, count: 4 }, identity: IDENTITY,
      status: 'complete', shardStatus: 'complete' }));
    expect(() => mergeShards(missing, tiny, MERGE)).toThrow(/Missing shard manifests: 3\/4/);

    // The runner refuses to CREATE a mixed directory, so this one is assembled
    // by hand — two shards run apart and their files collected together, which
    // is exactly how a row would come to be mixed in practice.
    const mixed = dir();
    await runShardGames({ out: mixed, shard: { index: 1, count: 2 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    finish(mixed, { index: 1, count: 2 });
    const elsewhere = dir();
    const strange = { ...IDENTITY, identityHash: 'identity-2' };
    await runShardGames({ out: elsewhere, shard: { index: 2, count: 2 }, tasks: tiny, identity: strange,
      play: async (t: Task) => fakeEntry(t, strange.identityHash) });
    finish(elsewhere, { index: 2, count: 2 });
    for (const file of [shardManifestFile({ index: 2, count: 2 }), shardGamesFile({ index: 2, count: 2 })]) {
      writeFileSync(`${mixed}/${file}`, readFileSync(`${elsewhere}/${file}`, 'utf8'));
    }
    expect(() => mergeShards(mixed, tiny, MERGE)).toThrow(/disagrees about identityHash/);

    const layouts = dir();
    await runShardGames({ out: layouts, shard: { index: 1, count: 2 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    finish(layouts, { index: 1, count: 2 });
    writeFileSync(`${layouts}/${shardManifestFile({ index: 1, count: 3 })}`,
      JSON.stringify({ shard: { index: 1, count: 3 }, identity: IDENTITY,
        status: 'complete', shardStatus: 'complete' }));
    expect(() => mergeShards(layouts, tiny, MERGE)).toThrow(/different layouts/);

    const short = dir();
    await runAll(short, 2);
    const path = `${short}/${shardGamesFile({ index: 1, count: 2 })}`;
    const kept = readFileSync(path, 'utf8').trim().split('\n').slice(0, -1);
    writeFileSync(path, kept.join('\n') + '\n');
    expect(() => mergeShards(short, tiny, MERGE)).toThrow(/shardStatus|is missing 1 game/);
  });

  it('refuses a directory with no shards at all', () => {
    const empty = dir();
    expect(() => mergeShards(empty, tiny, MERGE)).toThrow(/no shard manifests/);
    expect(readdirSync(empty)).toEqual([]);
  });

  it('is what the launcher plans, wall time included', () => {
    const options = { shards: 8, mode: 'full' as const, out: 'DIR', calibration: 'C/calibration.json',
      gameSeconds: 70, exec: false, acceptCalibration: [] };
    const plan = launchPlan(options);
    expect(plan.games).toBe(768);
    expect(plan.split).toHaveLength(8);
    expect(plan.split.reduce((a, s) => a + s.games, 0)).toBe(768);
    for (const s of plan.split) expect(s.games).toBe(96); // 384 pairs / 8, both seats
    expect(plan.split[2].command).toContain('--shard 3/8');
    expect(plan.split[2].command).toContain('--calibration C/calibration.json');
    expect(plan.split[2].command).not.toContain('--accept-calibration');
    expect(plan.merge).toBe('node --import tsx lab/ai/gate1.ts --merge DIR --mode full');
    // wall ~= ceil(shards/slots) * max(games per shard) * seconds, floored by
    // the total work divided by the slots: more shards buy restarts, not speed.
    const slots = plan.queue.slots;
    expect(plan.wallTime.sequentialHours).toBeCloseTo(768 * 70 / 3600, 1);
    expect(plan.wallTime.waves).toBe(Math.ceil(8 / slots));
    expect(plan.wallTime.estimatedHours).toBeCloseTo(Math.ceil(8 / slots) * 96 * 70 / 3600, 1);
    expect(plan.wallTime.floorHours).toBeCloseTo(768 * 70 / 3600 / slots, 1);
    expect(plan.wallTime.estimatedHours).toBeGreaterThanOrEqual(plan.wallTime.floorHours - 0.01);
    expect(launchPlan({ ...options, acceptCalibration: ['load', 'age'] }).split[0].command)
      .toContain('--accept-calibration=load,age');
    // The single switch it replaced is refused outright rather than silently ignored.
    expect(() => launchArgs(['--shards', '4', '--out', 'x', '--calibration', 'c', '--accept-loaded-calibration']))
      .toThrow(/one switch over four unrelated concessions/);
    expect(() => launchArgs(['--shards', '4', '--out', 'x', '--calibration', 'c', '--accept-calibration=nonsense']))
      .toThrow(/not one of load,machine,age,sources/);
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

/**
 * THE BLOCKER, reproduced.
 *
 * The reviewer's scenario, step for step: two shards run, both play every game
 * they own, and while the second one is playing, a source file changes under it.
 * `gate1.ts` notices AFTER the games are appended — that is the only moment it
 * can — marks the manifest `status: 'invalid'` with `sourceDrift`, writes the
 * error, appends a line to `failures.jsonl` and throws. But `runShardGames`'
 * `finally` has already stamped `shardStatus: 'complete'`, because the shard did
 * play its whole share, and `mergeShards` read only the games. Every game was
 * present, every content hash verified, every identity field agreed — and the
 * merge produced a clean row out of evidence the runner had declared void in
 * three separate places.
 *
 * Each case below merges cleanly on the old code and is refused now.
 */
describe('a merge refuses a shard that is complete but VOID', () => {
  const shards: ShardSpec[] = [{ index: 1, count: 2 }, { index: 2, count: 2 }];
  /** Two stub shards, both holding every game they own and both closed clean. */
  async function twoCleanShards() {
    const out = dir();
    for (const shard of shards) {
      await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
      finish(out, shard);
    }
    return out;
  }
  const manifestOf = (out: string, shard: ShardSpec) =>
    JSON.parse(readFileSync(`${out}/${shardManifestFile(shard)}`, 'utf8')) as Record<string, unknown>;

  it('merges two clean stub shards, so the refusals below are about the patch and nothing else', async () => {
    const out = await twoCleanShards();
    const merged = mergeShards(out, tiny, MERGE);
    expect(merged.entries).toHaveLength(tiny.length);
    expect(merged.sourceIdentityAtMerge).toBe(IDENTITY.sourceIdentitySha256);
    // Both halves of the verdict are on disk, which is what makes the patch below
    // a realistic edit rather than a hypothetical one.
    for (const shard of shards) {
      expect(manifestOf(out, shard)).toMatchObject({ status: 'complete', shardStatus: 'complete' });
    }
  });

  it('refuses the drifted shard although shardStatus says complete', async () => {
    const out = await twoCleanShards();
    // Exactly what gate1.ts writes when `driftedSources` fires after the games:
    // the shard's own completeness is untouched, and every other check still passes.
    patchShardManifest(out, shards[1], {
      status: 'invalid',
      sourceDrift: ['src/ai/planner/beam.ts'],
      error: 'Error: Sources changed during row; row void: src/ai/planner/beam.ts',
    });
    expect(manifestOf(out, shards[1]).shardStatus).toBe('complete'); // the hole, still open
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/records status "invalid", not "complete"/);
  });

  it.each([
    ['sourceDrift under a complete status', { sourceDrift: ['src/game/rules.ts'] }, /records sourceDrift/],
    ['an error under a complete status', { error: 'Correctness veto in Rush-h0-p3-white; row void' }, /is void/],
    ['a shard that never finished its share', { shardStatus: 'incomplete' }, /shardStatus "incomplete"/],
  ])('refuses %s', async (_name, patch, pattern) => {
    const out = await twoCleanShards();
    patchShardManifest(out, shards[1], patch);
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(pattern);
  });

  it('refuses a failure the shard was not re-completed after, and forgives one it was', async () => {
    const out = await twoCleanShards();
    const finishedAt = String(manifestOf(out, shards[1]).shardFinishedAt);
    const after = new Date(Date.parse(finishedAt) + 60_000).toISOString();
    const before = new Date(Date.parse(finishedAt) - 60_000).toISOString();
    // A failure recorded AFTER the last completion still stands.
    appendFileSync(`${out}/failures.jsonl`,
      JSON.stringify({ at: after, shard: shards[1], error: 'Sources changed during row; row void' }) + '\n');
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/has not been[\s\S]*re-completed after/);

    // A failure recorded BEFORE it is history: the shard was re-run and finished.
    writeFileSync(`${out}/failures.jsonl`,
      JSON.stringify({ at: before, shard: shards[1], error: 'simulated crash, later resumed' }) + '\n');
    expect(mergeShards(out, tiny, MERGE).entries).toHaveLength(tiny.length);

    // A failure with no timestamp cannot be shown to have been resolved, so it is not.
    writeFileSync(`${out}/failures.jsonl`,
      JSON.stringify({ shard: shards[1], error: 'a pre-timestamp failure line' }) + '\n');
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/has not been[\s\S]*re-completed after/);

    // As is a failure that names no shard of this layout, or one that is not JSON.
    writeFileSync(`${out}/failures.jsonl`, JSON.stringify({ at: before, error: 'orphan' }) + '\n');
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/name no shard of this layout/);
    writeFileSync(`${out}/failures.jsonl`, 'not json at all\n');
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/not JSON/);
  });

  it('re-hashes the sources at merge time against the identity the shards pinned', async () => {
    const out = await twoCleanShards();
    expect(() => mergeShards(out, tiny, { sourceIdentity: () => 'a'.repeat(64) }))
      .toThrow(/source tree at merge time hashes/);
    // And the default really is the live hasher, not a constant: merging this
    // synthetic row without the injection point is refused for the same reason.
    expect(() => mergeShards(out, tiny)).toThrow(/source tree at merge time hashes/);
  });

  it('refuses a shard manifest it cannot read, rather than merging around it', async () => {
    const out = await twoCleanShards();
    writeFileSync(`${out}/${shardManifestFile(shards[1])}`, '{ "shard": { "index": 2, ');
    expect(() => mergeShards(out, tiny, MERGE)).toThrow(/cannot be read as a shard manifest/);
  });
});

describe('files a fifteen-hour row can survive', () => {
  const shard: ShardSpec = { index: 1, count: 2 };

  it('rewrites a games file that lost its final newline, from the verified lines', async () => {
    const out = dir();
    await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
    const path = `${out}/${shardGamesFile(shard)}`;
    const intact = readFileSync(path, 'utf8');
    writeFileSync(path, intact.replace(/\n$/, '')); // complete lines, no trailing newline
    const mine = tasksForShard(tiny, shard);
    const expected = new Map(mine.map(t => [t.id, t]));
    const read = readShardGames(path, expected, IDENTITY, shard);
    expect(read.truncated).toBe(false);          // nothing was torn
    expect(read.missingFinalNewline).toBe(true); // but the next append would land on a game
    expect(read.games).toHaveLength(mine.length);

    const replayed: string[] = [];
    const resumed = await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => { replayed.push(t.id); return fakeEntry(t); } });
    expect(replayed).toEqual([]); // every line verified, so nothing is replayed
    expect(resumed.games).toHaveLength(mine.length);
    expect(readFileSync(path, 'utf8')).toBe(intact); // and the file is well formed again
    expect(JSON.parse(readFileSync(`${out}/${shardManifestFile(shard)}`, 'utf8')).missingFinalNewlineRewritten)
      .toBe(true);
  });

  it('takes an exclusive lock per shard and refuses a second live process', async () => {
    const out = dir();
    await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
    // The lock is given back when the shard finishes, so a resume can take it.
    expect(existsSync(`${out}/${shardLockFile(shard)}`)).toBe(false);
    const release = acquireShardLock(out, shard);
    await expect(runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) }))
      .rejects.toThrow(/already running in/);
    release();
    // A lock left behind by a DEAD process is stale and is reclaimed, so a crashed
    // shard does not need a human before it can resume.
    writeFileSync(`${out}/${shardLockFile(shard)}`, JSON.stringify({ pid: 2147483646, shard }));
    const after = await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    expect(after.games).toHaveLength(tasksForShard(tiny, shard).length);
  });

  it('treats an unreadable FOREIGN manifest as layout-only while a shard runs', async () => {
    const out = dir();
    const sibling: ShardSpec = { index: 2, count: 2 };
    await runShardGames({ out, shard: sibling, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
    writeFileSync(`${out}/${shardManifestFile(sibling)}`, '{ "shard": { "inde');
    // One damaged sibling file must not stop a healthy shard from running: its
    // layout is read from the FILE NAME, which is what protects the directory.
    const result = await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) });
    expect(result.games).toHaveLength(tasksForShard(tiny, shard).length);
    expect(JSON.parse(readFileSync(`${out}/${shardManifestFile(shard)}`, 'utf8')).unreadableForeignManifests)
      .toEqual([shardManifestFile(sibling)]);
    // The layout check still bites, from the name alone.
    await expect(runShardGames({ out, shard: { index: 1, count: 3 }, tasks: tiny, identity: IDENTITY,
      play: async (t: Task) => fakeEntry(t) })).rejects.toThrow(/a 2-shard layout/);
  });

  it('writes manifests atomically, leaving no partial file behind', async () => {
    const out = dir();
    await runShardGames({ out, shard, tasks: tiny, identity: IDENTITY, play: async (t: Task) => fakeEntry(t) });
    finish(out, shard);
    expect(readdirSync(out).filter(f => f.includes('.tmp-'))).toEqual([]);
    // Every manifest on disk parses; an interrupted write would leave one that did not.
    for (const file of readdirSync(out).filter(f => f.endsWith('.json'))) {
      expect(() => JSON.parse(readFileSync(`${out}/${file}`, 'utf8')), file).not.toThrow();
    }
  });
});
