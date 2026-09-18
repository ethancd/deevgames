/**
 * The cross-process heavy-work queue (EPIC-PLAN §6: "Cap all heavy
 * test/benchmark child processes combined at two on this shared machine. A
 * coordinator-held queue must account for nested shards.").
 *
 * The cap has to hold across WORKTREES, not just inside one ladder run: several
 * Claude sessions run their own checkouts of this repo at the same time, and
 * before this module a `--shards 12` ladder run took the load average on this
 * 12-core box to 79 and tripped vitest's 5 s default timeout three times
 * (docs/hard-ai/POSTMORTEM-2026-09-15.md §6). So the slots are FILES in one
 * fixed directory outside every worktree, `~/.local/state/muju-heavy/`
 * (`MUJU_HEAVY_DIR` overrides it; tests point it at a temp dir). `/tmp` is
 * deliberately not used: macOS cleanup wipes it and has already broken a
 * pidfile-based daemon in this environment.
 *
 * Protocol. A slot is the file `slot-<i>.json` for `i < slotCount()`
 * (`MUJU_HEAVY_SLOTS`, default 2). Acquiring is `open(path, 'wx')` — an atomic
 * exclusive create on a local filesystem — so exactly one process can hold a
 * given index. The file carries `{ pid, startedAt, label, host, cwd }`. A slot
 * whose `pid` is no longer alive (or whose JSON is unreadable) is STALE and is
 * reclaimed by unlinking it and retrying; two racing reclaimers are harmless
 * because only one of them can win the following exclusive create. Waiting is a
 * poll, not a lock queue: there is no fairness guarantee and none is needed at
 * two slots.
 *
 * WHOSE PID IS IN THE FILE: the leaf's. `shard.ts` must acquire the slot before
 * it can spawn the worker, so the record starts out naming the orchestrator and
 * is re-stamped with the child's pid by `reassignSlot` as soon as the child
 * exists. Staleness then tracks the process that is actually burning CPU, and a
 * release while that child still runs leaves the slot alone.
 *
 * WHO TAKES A SLOT: the leaf process that burns CPU — a ladder shard worker, a
 * benchmark, a probe, a vitest invocation an operator runs by hand. An
 * orchestrator that only spawns children (`ladder/run.ts`, `shard.ts`) must NOT
 * hold one, or a run with more shards than slots would deadlock against itself.
 * That is what "nested shards are accounted for" means here: `shard.ts` acquires
 * one slot per shard CHILD and spawns the child only once the slot is held, so
 * two concurrent ladder runs asking for six shards each still put two workers
 * on the CPU.
 *
 * `MUJU_HEAVY_BYPASS=1` skips the queue entirely (emergency only; it prints a
 * warning). `MUJU_HEAVY_SLOTS=<n>` changes the cap. CLI:
 *   node --import tsx lab/hard-ai/ladder/heavy.ts --status
 *   node --import tsx lab/hard-ai/ladder/heavy.ts --clear-stale
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SlotRecord {
  /**
   * OS process id of the holder; liveness of THIS pid defines staleness. After
   * `reassignSlot` it is the leaf that burns the CPU, not the acquirer.
   */
  pid: number;
  /** The acquirer's pid when the slot was re-stamped for a child; absent otherwise. */
  parentPid?: number;
  /** ISO timestamp of acquisition. */
  startedAt: string;
  /** Free-form holder description, e.g. `ladder-shard-3/12` or `probe hard@lab`. */
  label: string;
  host: string;
  cwd: string;
}

export interface SlotState {
  index: number;
  path: string;
  /** null when the slot file is absent, unreadable or malformed. */
  record: SlotRecord | null;
  /** true when the file exists but its holder pid is gone (or the file is corrupt). */
  stale: boolean;
}

export interface AcquireOptions {
  /** Give up and throw after this long. Default 30 minutes. */
  timeoutMs?: number;
  /** Poll interval while every slot is taken. Default 250 ms. */
  pollMs?: number;
  /** Called once, the first time this acquisition has to wait. Default: one stderr line. */
  onWait?: (info: { label: string; slots: SlotState[] }) => void;
}

/** A released slot. Idempotent: calling it twice is a no-op. */
export type ReleaseSlot = () => void;

const DEFAULT_SLOTS = 2;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 250;

export function heavyDir(): string {
  const override = process.env.MUJU_HEAVY_DIR;
  if (override && override.length > 0) return override;
  return path.join(os.homedir(), '.local', 'state', 'muju-heavy');
}

export function slotCount(): number {
  const raw = process.env.MUJU_HEAVY_SLOTS;
  if (raw === undefined || raw === '') return DEFAULT_SLOTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`MUJU_HEAVY_SLOTS must be a positive integer, got "${raw}"`);
  return n;
}

export function heavyBypassed(): boolean {
  return process.env.MUJU_HEAVY_BYPASS === '1';
}

function slotPath(index: number): string {
  return path.join(heavyDir(), `slot-${index}.json`);
}

/** True when `pid` is a live process this user can signal. EPERM means alive but foreign. */
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readSlot(index: number): SlotState {
  const p = slotPath(index);
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return { index, path: p, record: null, stale: false }; // free
  }
  let record: SlotRecord | null = null;
  try {
    const parsed = JSON.parse(raw) as Partial<SlotRecord>;
    if (typeof parsed.pid === 'number') {
      record = {
        pid: parsed.pid,
        ...(typeof parsed.parentPid === 'number' ? { parentPid: parsed.parentPid } : {}),
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : 'unknown',
        label: typeof parsed.label === 'string' ? parsed.label : 'unknown',
        host: typeof parsed.host === 'string' ? parsed.host : 'unknown',
        cwd: typeof parsed.cwd === 'string' ? parsed.cwd : 'unknown',
      };
    }
  } catch {
    record = null; // corrupt file: treat as a dead holder, below
  }
  // A file that exists but carries no usable pid is as good as a dead holder:
  // nothing can ever release it, so reclaim it rather than wedge the queue.
  return { index, path: p, record, stale: record === null || !pidAlive(record.pid) };
}

/** Current occupancy of every slot, free ones included. */
export function readSlots(): SlotState[] {
  const out: SlotState[] = [];
  for (let i = 0; i < slotCount(); i++) out.push(readSlot(i));
  return out;
}

/** Unlinks every slot whose holder is dead. Returns how many were reclaimed. */
export function clearStaleSlots(): number {
  let cleared = 0;
  for (const slot of readSlots()) {
    if (!slot.stale) continue;
    try {
      fs.unlinkSync(slot.path);
      cleared++;
    } catch {
      // someone else reclaimed it first; fine
    }
  }
  return cleared;
}

/**
 * Slots held by THIS process, so the exit handlers can give them back. The
 * value is the pid currently written in the file — `process.pid`, or the child
 * pid after `reassignSlot` — which is what decides whether the slot is still
 * ours to unlink.
 */
const held = new Map<string, number>(); // path -> pid we wrote
/** The release function issued for a slot, so `reassignSlot` can find its file. */
const releasePaths = new WeakMap<ReleaseSlot, string>();
let handlersInstalled = false;

function releasePath(p: string): void {
  const owner = held.get(p);
  if (owner === undefined) return;
  try {
    // Only unlink if the file is still ours: a slot we already lost (stale
    // reclaim by another process) may now belong to somebody else.
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SlotRecord>;
    if (parsed.pid !== owner) {
      held.delete(p);
      return;
    }
    // A slot re-stamped for a child belongs to the CHILD. If that child is
    // still running — the orchestrator was killed, or its `finally` ran early —
    // giving the slot back would put a third heavy process on a two-slot
    // machine. Leave it: once the child dies the record reads stale and the
    // next acquirer reclaims it.
    if (owner !== process.pid && pidAlive(owner)) return;
    held.delete(p);
    fs.unlinkSync(p);
  } catch {
    // already gone or unreadable: nothing to give back
    held.delete(p);
  }
}

function releaseAllHeld(): void {
  for (const p of [...held.keys()]) releasePath(p);
}

function installExitHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', releaseAllHeld);
  // Signals and a crash would otherwise leave the slot behind until the next
  // process notices the dead pid; give it back immediately and keep the default
  // "die on the signal" behaviour.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      releaseAllHeld();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }
  process.on('uncaughtException', err => {
    releaseAllHeld();
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}

/** Tries once to take any free slot. Returns its path, or null if all are taken. */
function tryAcquireOnce(label: string): string | null {
  fs.mkdirSync(heavyDir(), { recursive: true });
  const count = slotCount();
  for (let i = 0; i < count; i++) {
    const p = slotPath(i);
    const record: SlotRecord = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      label,
      host: os.hostname(),
      cwd: process.cwd(),
    };
    try {
      const fd = fs.openSync(p, 'wx'); // atomic exclusive create
      try {
        fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n');
      } finally {
        fs.closeSync(fd);
      }
      held.set(p, process.pid);
      installExitHandlers();
      return p;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const state = readSlot(i);
      if (state.stale) {
        try {
          fs.unlinkSync(p);
        } catch {
          // lost the reclaim race; the next pass will see whoever won
        }
        i--; // retry this index immediately
      }
    }
  }
  return null;
}

/**
 * Re-stamps a held slot with the pid of the process that actually burns the
 * CPU, and hands ownership of the slot to it.
 *
 * `ladder/shard.ts` acquires a slot in the ORCHESTRATOR and only then spawns
 * the worker, because a child cannot wait for a slot it has not been started to
 * wait for. Without this call the file names the orchestrator: kill the
 * orchestrator and the worker keeps searching while `--status` reports the slot
 * STALE and the next acquirer takes it — three heavy processes on two slots.
 * After this call staleness tracks the leaf, and `release()` frees the slot
 * only once that leaf is gone (see `releasePath`).
 *
 * Returns true when the file was re-stamped. False, not a throw, when there is
 * nothing to re-stamp: a release function this module did not issue (a test
 * stub, or `MUJU_HEAVY_BYPASS=1`), a slot already released, or a slot that was
 * reclaimed by somebody else. An invalid pid throws.
 */
export function reassignSlot(release: ReleaseSlot, pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`reassignSlot: pid must be a positive integer, got ${pid}`);
  const p = releasePaths.get(release);
  if (p === undefined) return false;
  const owner = held.get(p);
  if (owner === undefined) return false;
  let record: SlotRecord;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<SlotRecord>;
    if (parsed.pid !== owner) return false; // no longer ours
    record = {
      pid,
      parentPid: process.pid,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : new Date().toISOString(),
      label: typeof parsed.label === 'string' ? parsed.label : 'unknown',
      host: typeof parsed.host === 'string' ? parsed.host : os.hostname(),
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : process.cwd(),
    };
  } catch {
    return false;
  }
  fs.writeFileSync(p, JSON.stringify(record, null, 2) + '\n');
  held.set(p, pid);
  return true;
}

function defaultOnWait(info: { label: string; slots: SlotState[] }): void {
  const holders = info.slots
    .filter(s => s.record !== null)
    .map(s => `slot-${s.index}=${s.record?.label ?? '?'}(pid ${s.record?.pid ?? '?'})`)
    .join(', ');
  console.error(`heavy-queue: "${info.label}" waiting for one of ${slotCount()} slots; held by ${holders || 'unknown'}`);
}

/**
 * Blocks until one of the global heavy slots is free, then returns the function
 * that gives it back. Always call the release function (or let the process
 * exit, which releases it too).
 */
export async function acquireHeavySlot(label: string, opts: AcquireOptions = {}): Promise<ReleaseSlot> {
  if (heavyBypassed()) {
    console.error(`heavy-queue: MUJU_HEAVY_BYPASS=1, "${label}" is running UNGATED (the two-process cap is off)`);
    return () => {};
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const onWait = opts.onWait ?? defaultOnWait;
  const deadline = Date.now() + timeoutMs;
  let warned = false;
  for (;;) {
    const p = tryAcquireOnce(label);
    if (p !== null) {
      let done = false;
      const release: ReleaseSlot = () => {
        if (done) return;
        done = true;
        releasePath(p);
      };
      releasePaths.set(release, p);
      return release;
    }
    if (!warned) {
      warned = true;
      onWait({ label, slots: readSlots() });
    }
    if (Date.now() >= deadline) {
      throw new Error(`heavy-queue: "${label}" waited ${timeoutMs} ms for one of ${slotCount()} slots in ${heavyDir()} and gave up (see --status)`);
    }
    await new Promise<void>(resolve => setTimeout(resolve, pollMs));
  }
}

/** Convenience wrapper: hold a slot for exactly the duration of `fn`. */
export async function withHeavySlot<T>(label: string, fn: () => Promise<T>, opts: AcquireOptions = {}): Promise<T> {
  const release = await acquireHeavySlot(label, opts);
  try {
    return await fn();
  } finally {
    release();
  }
}

export function formatStatus(): string {
  const lines = [`heavy-queue: ${heavyDir()} (${slotCount()} slots${heavyBypassed() ? ', BYPASSED' : ''})`];
  for (const slot of readSlots()) {
    if (slot.record === null && !slot.stale) lines.push(`  slot-${slot.index}: free`);
    else if (slot.stale) lines.push(`  slot-${slot.index}: STALE (pid ${slot.record?.pid ?? '?'} gone) ${slot.record?.label ?? 'unreadable'}`);
    else lines.push(`  slot-${slot.index}: pid ${slot.record?.pid}${slot.record?.parentPid === undefined ? '' : ` (spawned by ${slot.record.parentPid})`} since ${slot.record?.startedAt} — ${slot.record?.label} [${slot.record?.cwd}]`);
  }
  return lines.join('\n');
}

function cli(argv: string[]): void {
  if (argv.includes('--clear-stale')) {
    const n = clearStaleSlots();
    console.log(`heavy-queue: reclaimed ${n} stale slot(s)`);
    console.log(formatStatus());
    return;
  }
  if (argv.includes('--status') || argv.length === 0) {
    console.log(formatStatus());
    return;
  }
  console.error('usage: node --import tsx lab/hard-ai/ladder/heavy.ts [--status | --clear-stale]');
  process.exitCode = 2;
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) cli(process.argv.slice(2));
