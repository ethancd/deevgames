/**
 * Spawns `shardCount` `node --import tsx lab/hard-ai/ladder/worker.ts` child
 * processes (DESIGN §7.7), each given a `--shard-index`/`--shard-count` pair
 * so it can compute its own contiguous slice of pair indices
 * (`pairing.ts#shardRange`) independently — no coordination between shards
 * beyond "run to completion, write your files, exit 0". Rejects if any
 * shard exits non-zero, with its stderr tail attached.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { WorkSpec } from './engines';
import { workKey } from './engines';

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

function runOneShard(args: ShardRunArgs, shardIndex: number, shardCount: number): Promise<void> {
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
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`ladder shard ${shardIndex}/${shardCount} exited ${code}:\n${stderr.slice(-4000)}`));
    });
  });
}

/** Runs every shard concurrently (each owns disjoint pair indices, so this is safe) and resolves once all have exited 0. */
export async function runSharded(args: ShardRunArgs): Promise<void> {
  const effectiveShards = Math.max(1, Math.min(args.shardCount, args.pairs));
  const runs: Promise<void>[] = [];
  for (let i = 0; i < effectiveShards; i++) runs.push(runOneShard(args, i, effectiveShards));
  await Promise.all(runs);
}
