// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  acquireHeavySlot,
  clearStaleSlots,
  formatStatus,
  heavyDir,
  readSlots,
  reassignSlot,
  slotCount,
  type ReleaseSlot,
} from '../../lab/hard-ai/ladder/heavy';
import { runSharded, type ShardRunArgs } from '../../lab/hard-ai/ladder/shard';

/**
 * The machine-wide heavy-work queue (EPIC-PLAN §6's two-process cap) and the
 * ladder shard gate that depends on it. Every case runs against a throwaway
 * slot directory via `MUJU_HEAVY_DIR`, never the real `~/.local/state/muju-heavy`.
 *
 * These are file-system and timing tests, not engine tests: they hold slots for
 * milliseconds and poll every few ms, so the per-test budget below is small.
 */

const TEST_TIMEOUT_MS = 10_000; // file + poll only; no engine work runs here

let dir = '';
const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-heavy-test-'));
  setEnv('MUJU_HEAVY_DIR', dir);
  setEnv('MUJU_HEAVY_SLOTS', '2');
  setEnv('MUJU_HEAVY_BYPASS', undefined);
});

afterEach(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const key of Object.keys(envBackup)) delete envBackup[key];
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A pid far above macOS's default pid ceiling: guaranteed not to be running. */
const DEAD_PID = 999_999;

function writeSlotFile(index: number, pid: number, label = 'fake'): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `slot-${index}.json`);
  fs.writeFileSync(p, JSON.stringify({ pid, startedAt: new Date().toISOString(), label, host: 'test', cwd: dir }));
  return p;
}

function fast(label: string, onWait?: (info: { label: string }) => void): Promise<ReleaseSlot> {
  return acquireHeavySlot(label, { timeoutMs: 5_000, pollMs: 5, onWait });
}

describe('heavy-work queue', () => {
  it('points at ~/.local/state by default and at MUJU_HEAVY_DIR when set', () => {
    expect(heavyDir()).toBe(dir);
    setEnv('MUJU_HEAVY_DIR', undefined);
    expect(heavyDir()).toBe(path.join(os.homedir(), '.local', 'state', 'muju-heavy'));
    expect(heavyDir()).not.toContain('/tmp/'); // /tmp cleanup has eaten pidfiles here before
  }, TEST_TIMEOUT_MS);

  it('hands out exactly MUJU_HEAVY_SLOTS slots and makes the next acquirer wait', async () => {
    const a = await fast('a');
    const b = await fast('b');
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(2);
    await expect(acquireHeavySlot('c', { timeoutMs: 40, pollMs: 5 })).rejects.toThrow(/waited 40 ms/);
    a();
    b();
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('records pid, label and start time, and releases idempotently', async () => {
    const release = await fast('probe hard@lab');
    const occupied = readSlots().filter(s => s.record !== null);
    expect(occupied).toHaveLength(1);
    expect(occupied[0].record?.pid).toBe(process.pid);
    expect(occupied[0].record?.label).toBe('probe hard@lab');
    expect(Date.parse(occupied[0].record?.startedAt ?? '')).not.toBeNaN();
    expect(formatStatus()).toContain('probe hard@lab');
    release();
    release(); // second call must not throw or free somebody else's slot
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('reclaims a slot whose holder process is gone', async () => {
    writeSlotFile(0, DEAD_PID, 'crashed-shard');
    writeSlotFile(1, process.pid, 'live-holder');
    const slots = readSlots();
    expect(slots[0].stale).toBe(true);
    expect(slots[1].stale).toBe(false);
    const release = await fast('newcomer');
    const after = readSlots();
    expect(after[0].record?.pid).toBe(process.pid);
    expect(after[0].record?.label).toBe('newcomer'); // took the dead holder's slot, not the live one
    expect(after[1].record?.label).toBe('live-holder');
    release();
  }, TEST_TIMEOUT_MS);

  it('treats an unreadable slot file as stale and --clear-stale removes it', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'slot-0.json'), 'not json at all');
    writeSlotFile(1, DEAD_PID);
    expect(readSlots().every(s => s.stale)).toBe(true);
    expect(clearStaleSlots()).toBe(2);
    expect(readSlots().every(s => s.record === null && !s.stale)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('admits a waiting third acquirer as soon as a slot is released', async () => {
    const a = await fast('a');
    const b = await fast('b');
    const waits: string[] = [];
    let admitted = false;
    const third = fast('c', info => { waits.push(info.label); }).then(release => { admitted = true; return release; });
    await new Promise<void>(resolve => setTimeout(resolve, 60));
    expect(admitted, 'third acquirer must not get in while both slots are held').toBe(false);
    expect(waits).toEqual(['c']); // exactly one "waiting" line, not one per poll
    a();
    const release = await third;
    expect(admitted).toBe(true);
    expect(readSlots().some(s => s.record?.label === 'c')).toBe(true);
    release();
    b();
  }, TEST_TIMEOUT_MS);

  it('MUJU_HEAVY_BYPASS=1 skips the queue without taking a slot', async () => {
    const a = await fast('a');
    const b = await fast('b');
    setEnv('MUJU_HEAVY_BYPASS', '1');
    const bypass = await acquireHeavySlot('emergency', { timeoutMs: 40, pollMs: 5 });
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(2); // still only a and b
    bypass(); // no-op release
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(2);
    a();
    b();
  }, TEST_TIMEOUT_MS);

  it('honours MUJU_HEAVY_SLOTS and rejects a nonsense value', async () => {
    setEnv('MUJU_HEAVY_SLOTS', '3');
    expect(slotCount()).toBe(3);
    const held = [await fast('a'), await fast('b'), await fast('c')];
    await expect(acquireHeavySlot('d', { timeoutMs: 30, pollMs: 5 })).rejects.toThrow(/gave up/);
    for (const release of held) release();
    setEnv('MUJU_HEAVY_SLOTS', 'banana');
    expect(() => slotCount()).toThrow(/positive integer/);
  }, TEST_TIMEOUT_MS);
});

describe('ladder shard gate', () => {
  const args: ShardRunArgs = {
    a: 'hard@lab', b: 'Rush', work: { mode: 'wall', ms: 1000 }, handicaps: [0],
    seed: 1, pairs: 8, shardCount: 4, legality: 'as-shipped', out: '/dev/null',
  };

  /** Measures the peak number of shards `runSharded` keeps in flight at once. */
  async function peakConcurrency(
    runArgs: ShardRunArgs,
    acquireSlot: (label: string) => Promise<ReleaseSlot>,
  ): Promise<{ peak: number; started: number[] }> {
    let live = 0;
    let peak = 0;
    const started: number[] = [];
    await runSharded(runArgs, {
      spawnShard: async (_a, shardIndex) => {
        started.push(shardIndex);
        live++;
        peak = Math.max(peak, live);
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        live--;
      },
      acquireSlot,
    });
    return { peak, started: started.sort((x, y) => x - y) };
  }

  it('reproducer: with no slot gate every shard runs at once (pre-E0.5 behaviour)', async () => {
    // Exactly what `shard.ts` did before E0.5 — spawn them all and hope. Four
    // shards of a `--shards 12`-style run land on the CPU together; twelve of
    // them took the load average to 79 and tripped three 5 s test timeouts
    // (POSTMORTEM-2026-09-15 §6). Kept as the contrast for the case below.
    const ungated = async (): Promise<ReleaseSlot> => () => {};
    const { peak, started } = await peakConcurrency(args, ungated);
    expect(started).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(4);
  }, TEST_TIMEOUT_MS);

  it('never runs more shards at once than the queue has slots', async () => {
    let live = 0;
    let peak = 0;
    const started: number[] = [];
    const waited: string[] = [];
    await runSharded(args, {
      spawnShard: async (_a, shardIndex) => {
        started.push(shardIndex);
        live++;
        peak = Math.max(peak, live);
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        live--;
      },
      acquireSlot: label => acquireHeavySlot(label, { timeoutMs: 5_000, pollMs: 5, onWait: i => { waited.push(i.label); } }),
    });
    expect(started.sort((x, y) => x - y)).toEqual([0, 1, 2, 3]); // every shard still ran
    expect(peak).toBe(2); // ...but never more than MUJU_HEAVY_SLOTS at a time
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0); // all released
    expect(waited.length).toBeGreaterThan(0);
    expect(waited[0]).toMatch(/^ladder-shard \d+\/4 hard@lab-vs-Rush wall:1000$/); // the "waiting" line names the shard
  }, TEST_TIMEOUT_MS);

  it('shares the cap with heavy work from other processes', async () => {
    const outsider = await fast('another worktree');
    let peak = 0;
    let live = 0;
    await runSharded({ ...args, shardCount: 3, pairs: 6 }, {
      spawnShard: async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise<void>(resolve => setTimeout(resolve, 15));
        live--;
      },
      acquireSlot: label => acquireHeavySlot(label, { timeoutMs: 5_000, pollMs: 5, onWait: () => {} }),
    });
    expect(peak).toBe(1); // one slot was already taken, so only one shard could run
    outsider();
  }, TEST_TIMEOUT_MS);
});

/**
 * WHOSE PID IS IN THE SLOT (E0 cross-lane fix). `shard.ts` acquires the slot in
 * the ORCHESTRATOR and then spawns the worker, so the slot file used to record
 * `run.ts`'s pid rather than the pid of the process that actually burns the
 * CPU. Kill the orchestrator and the worker keeps searching while `--status`
 * calls the slot STALE and the next acquirer takes it: three heavy processes on
 * a two-slot machine. The slot must name the leaf.
 */
describe('heavy slot leaf pid', () => {
  /** A real, live, foreign process to stand in for a shard worker. */
  function spawnSleeper(): ChildProcess {
    return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  }

  function waitForExit(child: ChildProcess): Promise<void> {
    return new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', () => { resolve(); });
    });
  }

  it('re-stamps the slot with the child pid, keeping the acquirer as parentPid', async () => {
    const release = await fast('ladder-shard 0/2');
    const child = spawnSleeper();
    expect(child.pid).toBeDefined();
    expect(reassignSlot(release, child.pid ?? 0)).toBe(true);

    const slot = readSlots().filter(s => s.record !== null)[0];
    expect(slot.record?.pid).toBe(child.pid);
    expect(slot.record?.parentPid).toBe(process.pid);
    expect(slot.stale).toBe(false); // the leaf is alive, so the slot is held
    expect(slot.record?.label).toBe('ladder-shard 0/2');

    child.kill('SIGKILL');
    await waitForExit(child);
    release();
  }, TEST_TIMEOUT_MS);

  it('keeps the slot while the leaf outlives the orchestrator, and frees it once the leaf is gone', async () => {
    const release = await fast('ladder-shard 0/2');
    const child = spawnSleeper();
    reassignSlot(release, child.pid ?? 0);

    // The orchestrator dies (or its `finally` runs early) while the child is
    // still searching: the slot must NOT be handed to the next acquirer.
    release();
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(1);
    expect(readSlots()[0].stale).toBe(false);

    child.kill('SIGKILL');
    await waitForExit(child);
    // Now nothing is burning CPU: the slot reads stale and is reclaimable.
    expect(readSlots()[0].stale).toBe(true);
    expect(clearStaleSlots()).toBe(1);
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('reports nothing to re-stamp for a release function the queue did not issue', async () => {
    expect(reassignSlot(() => {}, process.pid)).toBe(false); // a test stub or a bypassed queue
    const release = await fast('x');
    release();
    expect(reassignSlot(release, process.pid)).toBe(false); // already given back
    expect(() => reassignSlot(release, 0)).toThrow(/pid/);
  }, TEST_TIMEOUT_MS);

  it('runSharded re-stamps each shard slot with the spawned child and frees it on exit', async () => {
    const recorded: Array<{ pid: number | undefined; slotPid: number | undefined }> = [];
    await runSharded(
      { a: 'hard@lab', b: 'Rush', work: { mode: 'wall', ms: 1000 }, handicaps: [0], seed: 1, pairs: 2, shardCount: 2, legality: 'as-shipped', out: '/dev/null' },
      {
        spawnShard: async (_a, _i, _n, onSpawn) => {
          const child = spawnSleeper();
          onSpawn?.(child.pid ?? 0);
          const slot = readSlots().find(s => s.record?.pid === child.pid);
          recorded.push({ pid: child.pid, slotPid: slot?.record?.pid });
          child.kill('SIGKILL');
          await waitForExit(child);
        },
        acquireSlot: label => acquireHeavySlot(label, { timeoutMs: 5_000, pollMs: 5, onWait: () => {} }),
      },
    );
    expect(recorded).toHaveLength(2);
    for (const r of recorded) expect(r.slotPid).toBe(r.pid); // the slot named the leaf, not this process
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0); // released once the leaves exited
  }, TEST_TIMEOUT_MS);
});

/**
 * `runSharded` used to `Promise.all` its shards: the first non-zero exit
 * rejected while the siblings were still playing, so `run.ts` had to wait the
 * others out by polling their status files before it could merge. It now
 * settles every shard itself and reports all of the failures at once.
 */
describe('runSharded failure handling', () => {
  const args: ShardRunArgs = {
    a: 'hard@lab', b: 'Rush', work: { mode: 'wall', ms: 1000 }, handicaps: [0],
    seed: 1, pairs: 8, shardCount: 4, legality: 'as-shipped', out: '/dev/null',
  };

  it('waits for every shard to exit before rejecting, and names each failure', async () => {
    const finished: number[] = [];
    const error = await runSharded(
      { ...args, shardCount: 4, pairs: 8 },
      {
        spawnShard: async (_a, shardIndex) => {
          if (shardIndex === 0) throw new Error('ladder shard 0/4 exited 1:\nboom');
          await new Promise<void>(resolve => setTimeout(resolve, 20));
          if (shardIndex === 2) throw new Error('ladder shard 2/4 exited 3:\nsegfault');
          finished.push(shardIndex);
        },
        acquireSlot: () => Promise.resolve(() => {}),
      },
    ).then(() => null, (e: unknown) => e as Error);

    expect(error).toBeInstanceOf(Error);
    expect(finished.sort((x, y) => x - y)).toEqual([1, 3]); // the survivors ran to completion
    expect(error?.message).toContain('shard 0/4');
    expect(error?.message).toContain('shard 2/4');
    expect(error?.message).toContain('boom');
    expect(error?.message).toContain('segfault');
  }, TEST_TIMEOUT_MS);

  it('releases every slot even when a shard fails', async () => {
    const held: number[] = [];
    await runSharded(
      { ...args, shardCount: 2, pairs: 4 },
      {
        spawnShard: async (_a, shardIndex) => {
          held.push(shardIndex);
          throw new Error(`ladder shard ${shardIndex}/2 exited 1`);
        },
        acquireSlot: label => acquireHeavySlot(label, { timeoutMs: 5_000, pollMs: 5, onWait: () => {} }),
      },
    ).catch(() => undefined);
    expect(held.sort((x, y) => x - y)).toEqual([0, 1]);
    expect(readSlots().filter(s => s.record !== null)).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});
