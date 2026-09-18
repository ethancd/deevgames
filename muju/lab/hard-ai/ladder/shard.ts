/**
 * Spawns `shardCount` `node --import tsx lab/hard-ai/ladder/worker.ts` child
 * processes (DESIGN §7.7), each given a `--shard-index`/`--shard-count` pair
 * so it can compute its own contiguous slice of pair indices
 * (`pairing.ts#shardRange`) independently — no coordination between shards
 * beyond "run to completion, write your files, exit 0". Waits for every shard
 * to exit and then, if any exited non-zero, rejects with one error naming each
 * failed shard and carrying its stderr tail.
 *
 * RESOURCE GATE (E0.5, EPIC-PLAN §6). Every shard child now takes one slot of
 * the machine-wide heavy-work queue (`heavy.ts`) BEFORE it is spawned and gives
 * it back when it exits, so `--shards 12` no longer puts twelve searches on a
 * twelve-core box — the extra shards queue and exactly `MUJU_HEAVY_SLOTS`
 * (default 2) run at a time, counting shards from OTHER ladder runs and other
 * worktrees as well. `--shards` above the slot count stays legal; it changes how
 * the pair list is cut, not how much CPU the run takes. This orchestrator itself
 * holds no slot: if it did, a run with more shards than slots would deadlock
 * waiting for itself. The slot has to be taken before the child exists, so it
 * is re-stamped with the child's pid (`heavy.ts#reassignSlot`) as soon as the
 * spawn returns: staleness and `--status` then name the process that is
 * actually burning CPU, and killing this orchestrator no longer frees a slot
 * whose worker is still running.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { WorkSpec } from './engines';
import { workKey } from './engines';
import { acquireHeavySlot, reassignSlot, type ReleaseSlot } from './heavy';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const WORKER_PATH = path.resolve(import.meta.dirname, 'worker.ts');

export interface ShardRunArgs {
  a: string;
  b: string;
  work: WorkSpec;
  handicaps: number[];
  seed: number;
  pairs: number;
  shardCount: number;
  legality: 'as-shipped' | 'strict';
  out: string;
}

/**
 * Seams the concurrency test replaces: the real implementations spawn a child
 * process and touch the shared slot directory, neither of which a unit test
 * wants. Production callers pass nothing.
 */
export interface ShardDeps {
  /** `onSpawn` is called with the child's pid as soon as it exists (see `runSharded`). */
  spawnShard?: (args: ShardRunArgs, shardIndex: number, shardCount: number, onSpawn?: (pid: number) => void) => Promise<void>;
  acquireSlot?: (label: string) => Promise<ReleaseSlot>;
  reassign?: (release: ReleaseSlot, pid: number) => boolean;
}

function runOneShard(args: ShardRunArgs, shardIndex: number, shardCount: number, onSpawn?: (pid: number) => void): Promise<void> {
  const cliArgs = [
    '--import', 'tsx', WORKER_PATH,
    '--a', args.a,
    '--b', args.b,
    '--work', workKey(args.work),
    '--handicaps', args.handicaps.join(','),
    '--seed', String(args.seed),
    '--pairs', String(args.pairs),
    '--shard-index', String(shardIndex),
    '--shard-count', String(shardCount),
    '--legality', args.legality,
    '--out', args.out,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid !== undefined) onSpawn?.(child.pid);
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`ladder shard ${shardIndex}/${shardCount} exited ${code}:\n${stderr.slice(-4000)}`));
    });
  });
}

/**
 * Runs every shard (each owns disjoint pair indices, so they are independent)
 * and resolves once all have exited 0 — but never more than the heavy queue's
 * slot count at a time. A shard that has to wait prints one line naming itself.
 *
 * ALL SHARDS SETTLE. A failure does not short-circuit the others: every child
 * is waited out, and only then does this reject, with one error naming each
 * shard that failed and carrying its message. `Promise.all` rejected on the
 * first non-zero exit while the siblings were still playing and still writing
 * their files, which is what forced `run.ts` to poll status files before it
 * could merge (`run.ts#awaitShardsSettled`, which stays as the guard for a
 * shard that outlives this process).
 */
export async function runSharded(args: ShardRunArgs, deps: ShardDeps = {}): Promise<void> {
  const spawnShard = deps.spawnShard ?? runOneShard;
  const acquireSlot = deps.acquireSlot ?? ((label: string) => acquireHeavySlot(label));
  const reassign = deps.reassign ?? reassignSlot;
  const effectiveShards = Math.max(1, Math.min(args.shardCount, args.pairs));
  const runs: Promise<void>[] = [];
  for (let i = 0; i < effectiveShards; i++) {
    const shardIndex = i;
    const label = `ladder-shard ${shardIndex}/${effectiveShards} ${args.a}-vs-${args.b} ${workKey(args.work)}`;
    runs.push((async () => {
      const release = await acquireSlot(label);
      try {
        // The slot was taken by THIS process because the child did not exist
        // yet; hand it to the child the moment it does, so the record names the
        // process that burns the CPU (`heavy.ts#reassignSlot`).
        await spawnShard(args, shardIndex, effectiveShards, pid => { reassign(release, pid); });
      } finally {
        release();
      }
    })());
  }
  const settled = await Promise.allSettled(runs);
  const failures = settled
    .map((result, index) => ({ result, index }))
    .filter((entry): entry is { result: PromiseRejectedResult; index: number } => entry.result.status === 'rejected');
  if (failures.length === 0) return;
  const detail = failures
    .map(({ result, index }) => {
      const reason: unknown = result.reason;
      const message = reason instanceof Error ? (reason.message || reason.name) : String(reason);
      return `shard ${index}/${effectiveShards}: ${message}`;
    })
    .join('\n');
  throw new Error(`ladder: ${failures.length} of ${effectiveShards} shard(s) failed:\n${detail}`);
}
