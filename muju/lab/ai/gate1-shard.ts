/**
 * Running a Gate 1 full row in pieces, and putting it back together.
 *
 * THE PROBLEM. A full row is 768 games. As one sequential process that is on the
 * order of fifteen hours, and any failure — a machine restart, an OOM, a `^C`,
 * one source file edited by another lane — loses everything, because a row is
 * void unless it is one identity end to end. Fifteen hours is long enough that
 * "run it again" is not a plan.
 *
 * THE SHAPE OF THE FIX. The schedule is partitioned deterministically by (cell,
 * pair index) — never by list position, never round-robin over a filtered list —
 * so shard membership is a pure function of the task and of `n` alone:
 *
 *   node --import tsx lab/ai/gate1.ts --mode full --shard 3/8 --calibration … --out DIR
 *   … (the other seven) …
 *   node --import tsx lab/ai/gate1.ts --merge DIR
 *
 * Each shard writes only its own games, to its own file, under its own manifest.
 * `--merge` then verifies that every scheduled game is present EXACTLY ONCE,
 * that every shard ran the same identity, calibration, seed and source tree, and
 * only then produces the row summary. Re-running a shard re-reads its file,
 * verifies each game against its content hash, keeps what is intact and plays
 * only what is missing.
 *
 * WHY THIS IS SAFE TO SPLIT. A game's seed is `seedFor(row seed, cell, pair)`
 * (`gate1-report.ts`) and nothing else — not the list index, not a counter, not
 * the order the process happens to reach it — and each seat's stream is derived
 * from it inside `playGame`. Both seats of a pair therefore stay in one shard
 * and a game's record does not depend on which shard ran it or when. The test
 * suite pins exactly that: layouts 1/1, 3/3 and 8/8 produce byte-identical game
 * records on a synthetic schedule.
 *
 * WHAT "BYTE-IDENTICAL" CAN MEAN HERE. A `GameRecord` carries wall-clock fields
 * — `startedAt`, `durationMs`, per-seat `decisionMs`/`turnMs`, adapter timings —
 * and an entry carries the load average at the moment it ran. Those differ
 * between two runs of the same game on the same machine, let alone two shard
 * layouts. `gameContentHash` therefore hashes the entry with exactly those keys
 * removed (`VOLATILE_KEYS`), under canonical key ordering, and that hash is what
 * resume verifies and what the determinism test compares. Everything a result
 * depends on — winner, win type, turns, purchases, the game's action hash, the
 * per-decision work ledger — is inside it.
 */
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { FULL_PAIRS, cellIndex, type Entry, type Mode, type Task } from './gate1-report';
import { sourceIdentitySha256 } from './gate1-sources';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Write a file by writing a sibling temp file and renaming it over the target.
 *
 * `rename(2)` within one directory is atomic, so a reader — the next shard's
 * layout scan, a merge, an operator — never sees a half-written manifest, and a
 * process killed mid-write leaves the previous complete version in place. A
 * manifest is the only record of what a shard attempted, so a torn one is worse
 * than a missing one: it reads as "not a finished shard manifest" no matter what
 * the shard actually did.
 */
export function writeFileAtomic(path: string, contents: string): void {
  const temp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}`;
  const fd = openSync(temp, 'wx');
  try {
    writeSync(fd, contents);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, path);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* the rename failure is the real error */ }
    throw error;
  }
}

export const writeJsonAtomic = (path: string, value: unknown): void =>
  writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n');

export const shardLockFile = (shard: ShardSpec): string => `lock-${shardStem(shard)}.json`;

/**
 * An `O_EXCL` lock file per shard, so two processes cannot play one shard into one
 * directory at the same time.
 *
 * The identity and layout checks below catch a shard run under the WRONG row; they
 * cannot catch the same shard running TWICE concurrently, which is the easy
 * mistake to make with eight commands in a terminal and a resumable runner. Both
 * processes would read the same verified prefix, both would decide the same games
 * are missing, and both would append them — leaving a games file with duplicate
 * lines that `readShardGames` then refuses, after hours of play.
 *
 * A lock whose holder pid is dead is stale and is reclaimed, the same rule
 * `lab/hard-ai/ladder/heavy.ts` uses for its slots, so a crashed shard does not
 * need a human to unwedge it before it can resume.
 */
export function acquireShardLock(out: string, shard: ShardSpec): () => void {
  const path = `${out}/${shardLockFile(shard)}`;
  const record = () => JSON.stringify({ pid: process.pid, host: hostname(), cwd: process.cwd(),
    shard, startedAt: new Date().toISOString() }, null, 2) + '\n';
  const alive = (pid: unknown): boolean => {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      try { writeSync(fd, record()); } finally { closeSync(fd); }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try { unlinkSync(path); } catch { /* already gone */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let held: { pid?: number } = {};
      try { held = JSON.parse(readFileSync(path, 'utf8')) as { pid?: number }; } catch { held = {}; }
      if (alive(held.pid)) {
        throw new Error(`${shardStem(shard)} is already running in ${out} (pid ${held.pid}). ` +
          'Two processes must not play one shard into one directory; wait for it, or remove ' +
          `${shardLockFile(shard)} once you have confirmed that process is gone.`);
      }
      // Stale: the holder is dead, so the lock can never be given back by it.
      try { unlinkSync(path); } catch { /* lost the reclaim race; the retry sees the winner */ }
    }
  }
  throw new Error(`Could not take the ${shardStem(shard)} lock in ${out}`);
}

export interface ShardSpec {
  /** 1-based, so a command line reads `--shard 3/8`. */
  index: number;
  count: number;
}
/** The whole row in one process: the default, and what `--merge` expects to be absent. */
export const WHOLE_ROW: ShardSpec = { index: 1, count: 1 };

/**
 * Everything every shard of one row must agree on. A shard that disagrees about
 * any of it did not run in the same experiment, and merging them would produce a
 * summary of two different rows.
 */
export interface RowIdentity {
  identityHash: string;
  mode: Mode;
  seed: number;
  calibrationSha256: string;
  sourceIdentitySha256: string;
  openingsDigest: string;
}

/** A stored game: the row entry as written, plus the hash of its stable content. */
export type GameLine = Entry & { contentSha256: string } & Record<string, unknown>;

export function parseShardSpec(raw: string): ShardSpec {
  const match = /^(\d+)\/(\d+)$/.exec(raw);
  if (!match) throw new Error(`--shard wants i/n (1-based), got ${JSON.stringify(raw)}`);
  const index = Number(match[1]), count = Number(match[2]);
  if (count < 1 || count > FULL_PAIRS) throw new Error(`--shard count must be 1..${FULL_PAIRS}, got ${count}`);
  if (index < 1 || index > count) throw new Error(`--shard index must be 1..${count}, got ${index}`);
  return { index, count };
}

/**
 * Which shard owns a task, as a pure function of (cell, pair index, n).
 *
 * Both seats of a pair land in the same shard because neither `cellIndex` nor
 * `pair` distinguishes them — a pair is the unit of evidence and must not be
 * split across processes that could run at different identities. Interleaving by
 * `cell * 48 + pair` rather than blocking by cell also means each shard holds a
 * slice of EVERY cell, so a shard that dies leaves every cell equally short
 * instead of wiping one out.
 */
export function shardOfTask(task: Task, count: number): number {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Bad shard count ${count}`);
  return (cellIndex(task.opponent, task.handicap) * FULL_PAIRS + task.pair) % count + 1;
}

export function tasksForShard(tasks: readonly Task[], shard: ShardSpec): Task[] {
  return tasks.filter(t => shardOfTask(t, shard.count) === shard.index);
}

export const shardStem = (shard: ShardSpec): string => `shard-${shard.index}-of-${shard.count}`;
export const shardGamesFile = (shard: ShardSpec): string => `games-${shardStem(shard)}.jsonl`;
export const shardManifestFile = (shard: ShardSpec): string => `manifest-${shardStem(shard)}.json`;
export const shardManifestPath = (out: string, shard: ShardSpec): string => `${out}/${shardManifestFile(shard)}`;

/**
 * ONE manifest per shard, written by whoever has something to say about it.
 *
 * The runner opens it before the first game (so a crash during setup still
 * leaves a record of what was attempted), this module fills in the identity and
 * the counters, and the runner closes it with the outcome. They therefore PATCH
 * a shared file rather than each writing their own: two manifests for one shard
 * is how a merge ends up reading the wrong one.
 */
export function patchShardManifest(out: string, shard: ShardSpec, patch: Record<string, unknown>): Record<string, unknown> {
  const path = shardManifestPath(out, shard);
  const existing: Record<string, unknown> = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> : {};
  const merged = { ...existing, ...patch };
  writeJsonAtomic(path, merged);
  return merged;
}

/**
 * Keys whose value is a measurement of the clock rather than of the game. They
 * are removed — at any depth — before an entry is hashed or compared, because a
 * game replayed identically still takes a different number of milliseconds.
 */
export const VOLATILE_KEYS: readonly string[] = [
  'startedAt', 'finishedAt', 'durationMs', 'elapsedMs', 'decisionMs', 'turnMs', 'searchMs', 'hardTiming', 'load',
  'contentSha256',
];

/** Deep copy with `keys` dropped everywhere. Arrays keep their order and length. */
export function stripVolatile(value: unknown, keys: readonly string[] = VOLATILE_KEYS): unknown {
  if (Array.isArray(value)) return value.map(v => stripVolatile(v, keys));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !keys.includes(k))
      .map(([k, v]) => [k, stripVolatile(v, keys)]));
  }
  return value;
}

/** JSON with every object's keys in sorted order, so field order cannot matter. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The identity of a game's RESULT: everything but the clock. */
export function gameContentHash(entry: Record<string, unknown>): string {
  return sha(canonicalJson(stripVolatile(entry)));
}

export interface ReadShardResult {
  games: GameLine[];
  /** True when a torn final line (an interrupted append) was dropped. */
  truncated: boolean;
  /**
   * True when the file's last line carried no trailing newline although it parsed
   * and verified. `appendFileSync` writes `line + '\n'`, so this can only happen
   * if the process died between the two halves of one write, or a tool rewrote the
   * file. The CONTENT is intact, but the next append would concatenate onto that
   * line and destroy it, so the file is rewritten from the verified lines before
   * anything else is written to it.
   */
  missingFinalNewline: boolean;
}

/**
 * Reads a shard's games back and verifies every one of them.
 *
 * A line that fails its content hash, names another identity, names a game this
 * shard does not own, disagrees with the schedule, or repeats one already read
 * is a hard failure: resume must never build on evidence it cannot vouch for. A
 * torn FINAL line is different — `appendFileSync` is not atomic, so a process
 * killed mid-write leaves one — and is dropped so the game can be replayed.
 */
export function readShardGames(path: string, expected: ReadonlyMap<string, Task>, identity: RowIdentity,
  shard: ShardSpec): ReadShardResult {
  if (!existsSync(path)) return { games: [], truncated: false, missingFinalNewline: false };
  const raw = readFileSync(path, 'utf8');
  const missingFinalNewline = raw.length > 0 && !raw.endsWith('\n');
  const lines = raw.split('\n').filter(l => l.length > 0);
  const games: GameLine[] = [];
  let truncated = false;
  lines.forEach((line, i) => {
    let parsed: GameLine;
    try {
      parsed = JSON.parse(line) as GameLine;
    } catch (error) {
      if (i === lines.length - 1) { truncated = true; return; } // interrupted append
      throw new Error(`${path} line ${i + 1} is not JSON and is not the last line: ${String(error)}`);
    }
    const where = `${path} line ${i + 1}`;
    const task = expected.get(parsed.task?.id);
    if (!task) throw new Error(`${where}: game ${parsed.task?.id} is not scheduled for ${shardStem(shard)}`);
    if (JSON.stringify(task) !== JSON.stringify(parsed.task)) throw new Error(`${where}: schedule mismatch ${task.id}`);
    if (parsed.identityHash !== identity.identityHash) {
      throw new Error(`${where}: game ${task.id} was played at identity ${parsed.identityHash}, not ` +
        `${identity.identityHash}. A row is one identity end to end; start a new output directory.`);
    }
    const recomputed = gameContentHash(parsed);
    if (parsed.contentSha256 !== recomputed) {
      throw new Error(`${where}: game ${task.id} failed its content hash (stored ${parsed.contentSha256}, ` +
        `computed ${recomputed}); the file has been edited or corrupted`);
    }
    if (games.some(g => g.task.id === task.id)) throw new Error(`${where}: game ${task.id} appears twice`);
    games.push(parsed);
  });
  // A torn tail was dropped, so the surviving lines all end in a newline again.
  return { games, truncated, missingFinalNewline: missingFinalNewline && !truncated };
}

export interface ShardRunOptions {
  out: string;
  shard: ShardSpec;
  /** The WHOLE row schedule; the shard's own share is selected here. */
  tasks: readonly Task[];
  identity: RowIdentity;
  /** Plays one game and returns its entry, without a content hash. */
  play: (task: Task) => Promise<Record<string, unknown>>;
  /** Called for every game the shard ends up holding, resumed ones included. */
  onGame?: (line: GameLine, info: { resumed: boolean }) => void;
  /** Extra fields for this shard's manifest (device, queue, git, …). */
  manifestExtras?: Record<string, unknown>;
}

export interface ShardRunResult {
  shard: ShardSpec;
  games: GameLine[];
  played: string[];
  resumed: string[];
  gamesPath: string;
  manifestPath: string;
}

/** Plays (or resumes) exactly this shard's share of the row. */
export async function runShardGames(options: ShardRunOptions): Promise<ShardRunResult> {
  const { out, shard } = options;
  const mine = tasksForShard(options.tasks, shard);
  if (!mine.length) throw new Error(`${shardStem(shard)} holds no games; use a smaller --shard count`);
  const expected = new Map(mine.map(t => [t.id, t]));
  const gamesPath = `${out}/${shardGamesFile(shard)}`;
  mkdirSync(out, { recursive: true }); // a shard run is resumable, so the directory may exist
  mkdirSync(`${out}/replays`, { recursive: true });
  const releaseLock = acquireShardLock(out, shard);
  try {
    return await runShardGamesLocked(options, mine, expected, gamesPath);
  } finally {
    releaseLock();
  }
}

async function runShardGamesLocked(options: ShardRunOptions, mine: Task[],
  expected: ReadonlyMap<string, Task>, gamesPath: string): Promise<ShardRunResult> {
  const { out, shard, identity } = options;
  // One directory holds one row at one layout. Both checks run before a game is
  // played: a mixed directory is only detectable at merge time otherwise, hours
  // later, with no way to tell which half to keep. A manifest that carries no
  // `identity` yet is a shard the runner has opened but not started, so only its
  // LAYOUT is checked — there is nothing else in it to disagree with.
  const unreadableForeignManifests: string[] = [];
  for (const file of readdirSync(out)) {
    const match = /^manifest-shard-\d+-of-(\d+)\.json$/.exec(file);
    if (!match) continue;
    // THE LAYOUT CHECK COMES FIRST, because it reads the FILE NAME rather than the
    // file, and it is the check that protects the directory.
    if (Number(match[1]) !== shard.count) {
      throw new Error(`${out} already holds ${file}, a ${match[1]}-shard layout, but this process is ` +
        `${shardStem(shard)}. Re-run the row under one layout, or start a new directory.`);
    }
    const mineOwnFile = file === shardManifestFile(shard);
    let previous: { identity?: RowIdentity };
    try {
      previous = JSON.parse(readFileSync(`${out}/${file}`, 'utf8')) as { identity?: RowIdentity };
    } catch (error) {
      // An unreadable FOREIGN manifest is LAYOUT-ONLY, not fatal. Another shard's
      // half-written or clobbered manifest says nothing about whether THIS shard
      // may proceed: its layout has already been checked from the file name, its
      // games are verified against their own content hashes, and the MERGE — which
      // is where a row is assembled — still refuses it outright. Refusing here
      // instead would let one damaged sibling file stop seven healthy shards from
      // resuming, which is precisely the fifteen-hour loss sharding exists to
      // prevent. This shard's OWN manifest is a different matter: it is the record
      // of what this process is doing, and it is written atomically, so an
      // unreadable one means something is wrong with this run.
      if (mineOwnFile) {
        throw new Error(`${file} is this shard's own manifest and cannot be read: ${String(error)}. ` +
          'It is written atomically, so an unreadable one is not a torn write; investigate before resuming.');
      }
      unreadableForeignManifests.push(file);
      continue;
    }
    if (!previous.identity) continue;
    for (const key of Object.keys(identity) as (keyof RowIdentity)[]) {
      if (previous.identity[key] !== identity[key]) {
        throw new Error(`${file} was written for a different row (${key} differs). A row is one identity ` +
          'end to end; resume into the same directory only with the same calibration, seed and source tree.');
      }
    }
  }
  const { games: existing, truncated, missingFinalNewline } = readShardGames(gamesPath, expected, identity, shard);
  if (truncated || missingFinalNewline) {
    // Rewrite from the VERIFIED lines only: without the torn tail, and with the
    // final newline restored so the next append cannot land on top of a game.
    writeFileAtomic(gamesPath, existing.map(g => JSON.stringify(g)).join('\n') + (existing.length ? '\n' : ''));
  }
  const resumed = existing.map(g => g.task.id);
  const games: GameLine[] = [...existing];
  const played: string[] = [];
  const writeManifest = (status: string, extra: Record<string, unknown> = {}) =>
    patchShardManifest(out, shard, { shardSchema: 'muju-gate1-shard-v2', shard, shardStatus: status, identity,
      expectedGames: mine.length, completedGames: games.length, resumedGames: resumed.length,
      gamesFile: shardGamesFile(shard), games: mine.map(t => t.id), truncatedTailDropped: truncated,
      missingFinalNewlineRewritten: missingFinalNewline,
      ...(unreadableForeignManifests.length ? { unreadableForeignManifests } : {}),
      ...options.manifestExtras, ...extra });
  writeManifest('running', { shardStartedAt: new Date().toISOString() });

  for (const line of existing) options.onGame?.(line, { resumed: true });
  try {
    for (const task of mine) {
      if (games.some(g => g.task.id === task.id)) continue; // already played and verified
      const entry = await options.play(task);
      if ((entry as { identityHash?: string }).identityHash !== identity.identityHash) {
        throw new Error(`Game ${task.id} was produced at a different identity than the shard declares`);
      }
      const line = { ...entry, contentSha256: '' } as GameLine;
      line.contentSha256 = gameContentHash(line);
      appendFileSync(gamesPath, JSON.stringify(line) + '\n');
      games.push(line);
      played.push(task.id);
      options.onGame?.(line, { resumed: false });
    }
  } finally {
    writeManifest(games.length === mine.length ? 'complete' : 'incomplete',
      { shardFinishedAt: new Date().toISOString() });
  }
  return { shard, games, played, resumed, gamesPath, manifestPath: shardManifestPath(out, shard) };
}

/**
 * The row identity the shards in `dir` claim, read before anything is
 * scheduled. A merge needs the MODE before it can build the schedule it checks
 * the shards against, and taking that from a command-line flag means a
 * mistyped `--mode` reports 768 missing games instead of the truth.
 */
export function peekRowIdentity(dir: string): RowIdentity {
  const files = readdirSync(dir).filter(f => /^manifest-shard-\d+-of-\d+\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`${dir} holds no shard manifests (manifest-shard-i-of-n.json)`);
  // The MODE is all this needs, and any shard of the row can supply it, so one
  // unreadable or never-started manifest must not stop the merge before it has
  // even built the schedule it is going to check the shards against.
  for (const file of files) {
    let parsed: { identity?: RowIdentity };
    try {
      parsed = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as { identity?: RowIdentity };
    } catch { continue; }
    if (parsed.identity) return parsed.identity;
  }
  throw new Error(`No shard manifest in ${dir} carries a readable row identity (looked at ${files.join(', ')}); ` +
    'no shard got as far as pinning one.');
}

/** One line of `failures.jsonl`, as `gate1.ts` appends it. */
export interface ShardFailure {
  shard?: ShardSpec;
  /** ISO timestamp the failure was recorded at. A line without one is unforgivable. */
  at?: string;
  task?: { id?: string };
  error?: string;
}

/**
 * Every failure a row has recorded, in file order. A line that is not JSON is kept
 * as an unattributable failure rather than skipped: `failures.jsonl` is the file a
 * row writes when something has already gone wrong, and a merge may not decide
 * that an unreadable failure record is no failure at all.
 */
export function readShardFailures(dir: string): { failures: ShardFailure[]; unreadableLines: number } {
  const path = `${dir}/failures.jsonl`;
  if (!existsSync(path)) return { failures: [], unreadableLines: 0 };
  const failures: ShardFailure[] = [];
  let unreadableLines = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.length) continue;
    try {
      failures.push(JSON.parse(line) as ShardFailure);
    } catch {
      unreadableLines++;
    }
  }
  return { failures, unreadableLines };
}

export interface MergeResult {
  shards: ShardSpec[];
  identity: RowIdentity;
  entries: GameLine[];
  /** Games per shard, in shard order, for the merged manifest. */
  perShard: { shard: ShardSpec; games: number }[];
  /** The shard manifests themselves, shard order, for provenance the row keeps
   * (the calibration's path and any accepted refusals live in their extras). */
  manifests: Record<string, unknown>[];
  /** The tree identity re-hashed at MERGE time, for the merged manifest. */
  sourceIdentityAtMerge: string;
}

export interface MergeOptions {
  /**
   * Re-hash the tree at merge time. Defaults to the real hasher
   * (`gate1-sources.ts`); tests that merge synthetic identities inject their own.
   */
  sourceIdentity?: () => string;
}

/**
 * Collects every shard of a row in `dir`, verifying as it goes that the pieces
 * are pieces of ONE row: one identity, one calibration, one seed, one source
 * tree, one shard count, none missing, and every scheduled game present exactly
 * once. Anything else throws rather than produce a summary that looks whole.
 *
 * WHY THIS FUNCTION READS A SHARD'S STATUS AND ITS FAILURES, NOT ONLY ITS GAMES.
 *
 * It used to read neither, and the hole that left was the one thing about this
 * instrument that could turn a VOID row into a clean summary. `gate1.ts` detects
 * source drift AFTER a shard's games are appended — that is the only time it can
 * be detected — and marks the manifest `status: 'invalid'` with `sourceDrift`
 * naming the files, writes the error, appends a line to `failures.jsonl` and
 * throws. But the drift check runs INSIDE `runShardGames`' caller, so by then
 * `runShardGames`' own `finally` has already stamped `shardStatus: 'complete'`
 * (all of that shard's games were in fact played), and `mergeShards` looked at
 * nothing else. Every scheduled game was present, every hash verified, every
 * identity field agreed — the shard's games had been played against a tree that
 * changed underneath them, the runner had said so in three places, and the merge
 * wrote `gate1: 'passed'`.
 *
 * So a shard is only merged when all five of these hold:
 *
 *   1. `status === 'complete'` — the RUNNER's verdict on the whole shard,
 *   2. `shardStatus === 'complete'` — every game of its share is present,
 *   3. no `sourceDrift`,
 *   4. no `error`,
 *   5. no unresolved line in `failures.jsonl` naming it.
 *
 * (5) is about time, not presence: a shard that failed and was then re-run to
 * completion is fine, and its failure line is history. So a failure is forgiven
 * only when the manifest records a completion STRICTLY LATER than the failure was
 * recorded. A failure line with no timestamp, or a manifest with no completion
 * time, cannot be shown to have been resolved and is therefore not forgiven.
 *
 * And the tree is re-hashed HERE, against the identity the shards pinned, because
 * a merge is itself a reading of the sources: the summary is computed by this
 * process, from this checkout, and if that checkout is not the one the games were
 * played in then the report is describing engines that are no longer there.
 */
export function mergeShards(dir: string, tasks: readonly Task[], options: MergeOptions = {}): MergeResult {
  const files = readdirSync(dir).filter(f => /^manifest-shard-\d+-of-\d+\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`${dir} holds no shard manifests (manifest-shard-i-of-n.json)`);
  const manifests = files.map(file => {
    let parsed: Record<string, unknown> & { shard: ShardSpec; identity: RowIdentity };
    try {
      parsed = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as typeof parsed;
    } catch (error) {
      // Tolerated during a RUN (another shard's business), never here: a shard
      // whose manifest cannot be read has no verdict, and a row is not merged out
      // of shards whose outcome is unknown.
      throw new Error(`${file} cannot be read as a shard manifest (${String(error)}); a row is merged only from ` +
        'shards whose manifest states their outcome. Re-run that shard (it resumes) before merging.');
    }
    if (!parsed.shard || !parsed.identity) {
      throw new Error(`${file} is not a finished shard manifest (no shard/identity): that shard never started, ` +
        'or never got as far as pinning the row identity');
    }
    return { ...parsed, file };
  });
  const count = manifests[0].shard.count;
  const identity = manifests[0].identity;
  for (const m of manifests) {
    if (m.shard.count !== count) {
      throw new Error(`${m.file} was run as 1 of ${m.shard.count} shards, but ${manifests[0].file} as 1 of ${count}: ` +
        'these are different layouts of the row and cannot be merged');
    }
    for (const key of Object.keys(identity) as (keyof RowIdentity)[]) {
      if (m.identity[key] !== identity[key]) {
        throw new Error(`${m.file} disagrees about ${key}: ${String(m.identity[key])} vs ${String(identity[key])}. ` +
          'Shards of one row must share identity, calibration, seed and source tree.');
      }
    }
  }
  const seen = new Set(manifests.map(m => m.shard.index));
  const missing = Array.from({ length: count }, (_, i) => i + 1).filter(i => !seen.has(i));
  if (missing.length) throw new Error(`Missing shard manifests: ${missing.map(i => `${i}/${count}`).join(', ')}`);
  if (seen.size !== manifests.length) throw new Error('Two manifests claim the same shard index');

  // The tree the SUMMARY is being computed in must be the tree the games were
  // played in. A merge that re-derives nothing cannot notice that it is reading
  // one row's evidence with another row's rules.
  const sourceIdentityAtMerge = (options.sourceIdentity ?? sourceIdentitySha256)();
  if (sourceIdentityAtMerge !== identity.sourceIdentitySha256) {
    throw new Error(`The source tree at merge time hashes ${sourceIdentityAtMerge.slice(0, 12)}, but these shards ` +
      `were played against ${String(identity.sourceIdentitySha256).slice(0, 12)}. A row is one identity end to end, ` +
      'and that includes the checkout its summary is computed in: check out the tree the row ran in and merge there.');
  }

  // Every way a shard can be VOID although all of its games are present.
  const { failures, unreadableLines } = readShardFailures(dir);
  if (unreadableLines) {
    throw new Error(`${dir}/failures.jsonl holds ${unreadableLines} line(s) that are not JSON. A row does not merge ` +
      'while its own failure log cannot be read: an unreadable failure is not an absent one.');
  }
  for (const m of manifests) {
    const stem = shardStem(m.shard);
    const status = (m as { status?: unknown }).status;
    const shardStatus = (m as { shardStatus?: unknown }).shardStatus;
    const drift = (m as { sourceDrift?: unknown }).sourceDrift;
    const error = (m as { error?: unknown }).error;
    if (status !== 'complete') {
      throw new Error(`${m.file} records status ${JSON.stringify(status ?? null)}, not "complete": ${stem} did not ` +
        'finish cleanly, so its games are not row evidence. A shard that was voided stays voided — re-run it into a ' +
        'directory whose identity it can match, or start the row again.');
    }
    if (shardStatus !== 'complete') {
      throw new Error(`${m.file} records shardStatus ${JSON.stringify(shardStatus ?? null)}, not "complete": ${stem} ` +
        'has not played its whole share. Re-run that shard (it resumes) before merging.');
    }
    if (Array.isArray(drift) ? drift.length : drift) {
      throw new Error(`${m.file} records sourceDrift ${JSON.stringify(drift)}: the tree changed while ${stem} was ` +
        'playing, so its games were not all measured at one identity. Those games are VOID and may not be pooled.');
    }
    if (error) {
      throw new Error(`${m.file} records an error, so ${stem} is void: ${String(error).split('\n')[0]}`);
    }
    const completedAt = Date.parse(String((m as { shardFinishedAt?: unknown }).shardFinishedAt ??
      (m as { finishedAt?: unknown }).finishedAt ?? ''));
    const mineFailures = failures.filter(f => f.shard?.index === m.shard.index && f.shard?.count === m.shard.count);
    const unresolved = mineFailures.filter(f => {
      const at = Date.parse(String(f.at ?? ''));
      // Unforgiven unless the shard demonstrably completed AFTERWARDS.
      return !Number.isFinite(at) || !Number.isFinite(completedAt) || completedAt <= at;
    });
    if (unresolved.length) {
      throw new Error(`failures.jsonl records ${unresolved.length} failure(s) for ${stem} that it has not been ` +
        `re-completed after (last completion ${String((m as { shardFinishedAt?: unknown }).shardFinishedAt ?? 'none')}` +
        `): ${String(unresolved[0].error ?? 'no message').split('\n')[0]}. Re-run that shard to completion, or treat ` +
        'the row as void.');
    }
  }
  const unattributed = failures.filter(f => !f.shard ||
    !manifests.some(m => m.shard.index === f.shard?.index && m.shard.count === f.shard?.count));
  if (unattributed.length) {
    throw new Error(`failures.jsonl records ${unattributed.length} failure(s) that name no shard of this layout; ` +
      'the row holds a failure nothing has accounted for and is not merged.');
  }

  const byId = new Map(tasks.map(t => [t.id, t]));
  const entries: GameLine[] = [];
  const perShard: { shard: ShardSpec; games: number }[] = [];
  manifests.sort((a, b) => a.shard.index - b.shard.index);
  for (const m of manifests) {
    const expected = new Map(tasksForShard(tasks, m.shard).map(t => [t.id, t]));
    const { games, truncated } = readShardGames(`${dir}/${shardGamesFile(m.shard)}`, expected, identity, m.shard);
    if (truncated) {
      throw new Error(`${shardGamesFile(m.shard)} ends in a torn line: that shard was interrupted and must be ` +
        're-run (it will resume) before the row can be merged');
    }
    const short = [...expected.keys()].filter(id => !games.some(g => g.task.id === id));
    if (short.length) {
      throw new Error(`${shardStem(m.shard)} is missing ${short.length} game(s), e.g. ${short.slice(0, 3).join(', ')}`);
    }
    entries.push(...games);
    perShard.push({ shard: m.shard, games: games.length });
  }
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.task.id, (counts.get(e.task.id) ?? 0) + 1);
  const duplicated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicated.length) throw new Error(`Merged row holds duplicates: ${duplicated.slice(0, 5).join(', ')}`);
  const absent = [...byId.keys()].filter(id => !counts.has(id));
  if (absent.length) throw new Error(`Merged row is missing ${absent.length} game(s), e.g. ${absent.slice(0, 3).join(', ')}`);
  // Schedule order, never file order, so the merged evidence reads the same
  // whatever layout produced it.
  const order = new Map(tasks.map((t, i) => [t.id, i]));
  entries.sort((a, b) => (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0));
  return { shards: manifests.map(m => m.shard), identity, entries, perShard, manifests, sourceIdentityAtMerge };
}
