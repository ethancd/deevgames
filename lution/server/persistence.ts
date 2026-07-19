// Atomic (tmp-file + rename) disk persistence for data/{cards,match-state,
// jobs}.json and NEXT_CARDS.md. The Vite dev-server plugin (server/plugin.ts)
// is the only writer; the client only ever reaches disk indirectly, through
// the /api router (server/router.ts).
//
// Writes are additionally serialized per-target-file via an in-process
// promise-chain lock (withLock below). tmp-file + rename already prevents a
// reader from ever observing a half-written file; the lock exists so two
// concurrent writers to the *same* file within this process can't race their
// renames and silently drop one update (this is a single dev-server process,
// so an in-memory lock is sufficient -- no cross-process coordination needed).
//
// IMPORTANT: withLock/atomicWriteJson only cover the physical write. They do
// NOT make a caller's readRegistry() -> mutate -> writeRegistry() sequence
// atomic as a whole -- two concurrent callers can each read the same
// pre-mutation registry, and whichever writes second silently clobbers the
// first's addition (a classic lost update). withRegistryLock below closes
// that gap: it serializes the entire logical read-modify-write transaction
// (not just the final fs write) for every registry mutation. It uses a
// DIFFERENT lock key than atomicWriteJson's per-file lock -- reusing the same
// key would deadlock (a withRegistryLock callback that itself calls
// writeRegistry would be waiting on a lock it already holds).

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CardDef, JobRecord, MatchMeta, MatchState } from '../shared/types';

export interface PersistencePaths {
  // Absolute path to the project's data/ directory (contains cards.json,
  // match-state.json, jobs.json).
  dataDir: string;
  // Absolute path to NEXT_CARDS.md (audit trail, appended each round).
  nextCardsPath: string;
}

const writeLocks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = writeLocks.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  // Swallow errors here so a failed write doesn't wedge the lock chain for
  // subsequent writers; the error itself still propagates to this call's
  // caller via `run`.
  writeLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await withLock(filePath, async () => {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = path.join(
      dir,
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
    );
    await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    try {
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      await fs.rm(tmpPath, { force: true });
      throw err;
    }
  });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if (isEnoent(err)) return fallback;
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}

function cardsPath(paths: PersistencePaths): string {
  return path.join(paths.dataDir, 'cards.json');
}
function matchStatePath(paths: PersistencePaths): string {
  return path.join(paths.dataDir, 'match-state.json');
}
function jobsPath(paths: PersistencePaths): string {
  return path.join(paths.dataDir, 'jobs.json');
}
function resolvePendingPath(paths: PersistencePaths): string {
  return path.join(paths.dataDir, 'resolve-pending.json');
}
function metaPath(paths: PersistencePaths): string {
  return path.join(paths.dataDir, 'meta.json');
}

// Transaction-level lock for the registry file: serializes the FULL
// read-mint-write (or read-mutate-write) sequence for every registry
// mutation (POST /api/registry/cards, POST /api/design-card, POST
// /api/resolve-round), not just the final atomicWriteJson call. Callers
// should read the registry with readRegistry() *inside* the callback (not
// before acquiring the lock) so they always mutate the freshest copy.
export function withRegistryLock<T>(
  paths: PersistencePaths,
  fn: () => Promise<T>
): Promise<T> {
  return withLock(`${cardsPath(paths)}::txn`, fn);
}

export async function readRegistry(paths: PersistencePaths): Promise<CardDef[]> {
  return readJsonFile<CardDef[]>(cardsPath(paths), []);
}

export async function writeRegistry(
  paths: PersistencePaths,
  registry: CardDef[]
): Promise<void> {
  await atomicWriteJson(cardsPath(paths), registry);
}

export async function readMatchState(paths: PersistencePaths): Promise<MatchState | null> {
  return readJsonFile<MatchState | null>(matchStatePath(paths), null);
}

export async function writeMatchState(
  paths: PersistencePaths,
  state: MatchState
): Promise<void> {
  await atomicWriteJson(matchStatePath(paths), state);
}

// --- match meta (data/meta.json) --------------------------------------
//
// Survives across matches (unlike match-state.json, which POST /api/new-match
// wholesale replaces): records who lost the most recent inner game and,
// separately, who lost the most recent CONCLUDED match, so a brand-new
// match's opening design round (round 1, before any inner game has been
// played) can still assign the loser's keep/steal choice per the "last
// match/game loser" rules instead of always coin-flipping.
export async function readMatchMeta(paths: PersistencePaths): Promise<MatchMeta | null> {
  return readJsonFile<MatchMeta | null>(metaPath(paths), null);
}

export async function writeMatchMeta(paths: PersistencePaths, meta: MatchMeta): Promise<void> {
  await atomicWriteJson(metaPath(paths), meta);
}

export async function readJobs(paths: PersistencePaths): Promise<JobRecord[]> {
  return readJsonFile<JobRecord[]>(jobsPath(paths), []);
}

export async function writeJobs(paths: PersistencePaths, jobs: JobRecord[]): Promise<void> {
  await atomicWriteJson(jobsPath(paths), jobs);
}

// --- resolve-round "atomic pair" write ---------------------------------
//
// handleResolveRound (server/router.ts) needs to persist a new registry AND
// a new match-state as a single logical unit: a crash between the two
// individually-atomic tmp+rename writes would leave a card marked destroyed
// in cards.json while match-state.json's decks/roundHistory never reflect
// the resolution (or vice versa). True cross-file atomicity isn't possible
// with plain fs writes, so this uses a write-ahead marker instead: write
// BOTH new documents into one pending-transaction file first, then write the
// two real files, then delete the marker. If the process dies at any point
// before the marker is deleted, recoverPendingResolution (called once at
// dev-server boot, before any request is served) replays the same two
// writes from the marker's contents and deletes it. Because both target
// writes are idempotent (each is just "write this exact final document"),
// replaying is safe no matter which of the two had already landed.
export interface ResolvePendingTransaction {
  registry: CardDef[];
  match: MatchState;
}

export async function writeResolvePending(
  paths: PersistencePaths,
  txn: ResolvePendingTransaction
): Promise<void> {
  await atomicWriteJson(resolvePendingPath(paths), txn);
}

export async function clearResolvePending(paths: PersistencePaths): Promise<void> {
  await withLock(resolvePendingPath(paths), async () => {
    await fs.rm(resolvePendingPath(paths), { force: true });
  });
}

async function readResolvePending(
  paths: PersistencePaths
): Promise<ResolvePendingTransaction | null> {
  return readJsonFile<ResolvePendingTransaction | null>(resolvePendingPath(paths), null);
}

// Writes a resolve-round result as one WAL-guarded transaction: marker ->
// registry -> match-state -> clear marker. Called from inside
// withRegistryLock by server/router.ts's handleResolveRound.
export async function writeResolveTransaction(
  paths: PersistencePaths,
  txn: ResolvePendingTransaction
): Promise<void> {
  await writeResolvePending(paths, txn);
  await writeRegistry(paths, txn.registry);
  await writeMatchState(paths, txn.match);
  await clearResolvePending(paths);
}

// Boot-time recovery (mirrors server/jobs.ts's recoverInterruptedJobs): if a
// resolve-round transaction marker is still on disk, the previous process
// died mid-transaction -- replay it (both writes are idempotent full-document
// writes) and clear the marker. Returns true if a recovery actually happened.
export async function recoverPendingResolution(paths: PersistencePaths): Promise<boolean> {
  const pending = await readResolvePending(paths);
  if (!pending) return false;
  await writeRegistry(paths, pending.registry);
  await writeMatchState(paths, pending.match);
  await clearResolvePending(paths);
  return true;
}

// Appends one round's audit-trail entry to NEXT_CARDS.md (created if absent).
export async function appendNextCardsEntry(
  paths: PersistencePaths,
  entry: string
): Promise<void> {
  await withLock(paths.nextCardsPath, async () => {
    await fs.mkdir(path.dirname(paths.nextCardsPath), { recursive: true });
    try {
      await fs.access(paths.nextCardsPath);
    } catch {
      await fs.writeFile(
        paths.nextCardsPath,
        '# NEXT_CARDS.md\n\nAudit trail of each design round: both revealed designs, the round\nwinner, and the keep/steal/destroy resolution. Appended by the dev server\n(server/nextCards.ts) after each POST /api/next-cards call.\n\n',
        'utf8'
      );
    }
    const suffix = entry.endsWith('\n') ? entry : `${entry}\n`;
    await fs.appendFile(paths.nextCardsPath, suffix, 'utf8');
  });
}
