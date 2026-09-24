/**
 * Publisher (SPEC.md Component D): the single writer for the campaign's shared
 * memory (`memory/experiences.jsonl`, `memory/playbook.md`,
 * `memory/snapshots/v<N>/`). Every write path goes through `withPublishLock`
 * so two games finishing at once can never interleave a partial append or a
 * playbook curation.
 *
 * CLI:
 *   node --import tsx tools/llm-pilot/publish.ts --append <gameDir>
 *   node --import tsx tools/llm-pilot/publish.ts --curate [--dry-run]
 *   node --import tsx tools/llm-pilot/publish.ts --snapshot --pair P01 --version 1
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripApiKeys } from './auth';
import {
  actionsLogPath, experiencesPath, playbookPath, publishLockPath, snapshotDir, memoryDir, ensureCampaignDirs,
  type GameId, type Effort, type ModelId, type Seat, type ToolTier,
} from './pilot';

const execFileAsync = promisify(execFile);

export interface ExperienceRecord {
  gameId: GameId;
  pairId: string;
  model: ModelId;
  effort: Effort;
  toolTier: ToolTier;
  llmSeat: Seat;
  handicap: number;
  result: 'win' | 'loss' | 'draw' | 'truncated' | 'invalid';
  turns: number;
  /** Revisions (from actions.jsonl) the reflection cites as evidence. Every
   * one must actually appear in this game's action log — a reflection cannot
   * cite a room revision that never happened. */
  citedRevisions: number[];
  /** The room's final revision. When present, a citation is valid iff 0 <= r <= finalRevision
   * (every such revision is a real, replayable room state — engine moves included); citations
   * outside it are DROPPED into `droppedCitations`, never silently kept. */
  finalRevision?: number;
  droppedCitations?: number[];
  reflection: string;
  writtenAt: string;
  label?: string;
  /** Engine source hash the game ran against. Absent on pilot records, which all ran the
   * fire-only purchase menu (source 98ac82cfe61c…); see the playbook's engine-change section. */
  engineSourceSha256?: string;
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

/** A lock whose holder pid is alive is never reclaimed before this (curation holds the lock for a
 * whole Claude call over the playbook, which can take several minutes). */
const LOCK_STALE_MS = 45 * 60_000;
function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
/** Directory-create is atomic on a local filesystem, same trick as
 * lab/hard-ai/ladder/heavy.ts's slot files. Stale (dead pid, or older than
 * LOCK_STALE_MS with no live pid file) locks are reclaimed so a crashed
 * publisher never wedges every later game's publish step. */
export async function withPublishLock<T>(fn: () => Promise<T> | T, opts: { pollMs?: number; timeoutMs?: number } = {}): Promise<T> {
  ensureCampaignDirs();
  const lockPath = publishLockPath();
  const pollMs = opts.pollMs ?? 200, timeoutMs = opts.timeoutMs ?? 40 * 60_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockPath, { recursive: false });
      writeFileSync(join(lockPath, 'holder.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const holder = JSON.parse(readFileSync(join(lockPath, 'holder.json'), 'utf8')) as { pid: number; startedAt: string };
        stale = !pidAlive(holder.pid) || Date.now() - Date.parse(holder.startedAt) > LOCK_STALE_MS;
      } catch { stale = true; }
      if (stale) { try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* lost the reclaim race */ } continue; }
      if (Date.now() >= deadline) throw new Error(`publish lock: timed out after ${timeoutMs}ms waiting for ${lockPath}`);
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  }
  try { return await fn(); }
  finally { try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* already reclaimed as stale; fine */ } }
}

// ---------------------------------------------------------------------------
// Revision citation check
// ---------------------------------------------------------------------------

/** Every revision an accepted action batch produced for this game, read from
 * its own actions.jsonl (one line per accepted batch, written by the gateway
 * per SPEC.md Component B: `{revision, requestId, actions, resultingStateHash}`). */
export function actionRevisionsFor(gameId: GameId): Set<number> {
  const path = actionsLogPath(gameId);
  if (!existsSync(path)) return new Set();
  const revisions = new Set<number>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { revision?: number };
      if (typeof entry.revision === 'number') revisions.add(entry.revision);
    } catch { /* a malformed line is a game-log defect, not a publish-time crash; skip it */ }
  }
  return revisions;
}
export class UncitedRevisionError extends Error {
  constructor(public gameId: GameId, public missing: number[]) {
    super(`Reflection for ${gameId} cites revision(s) [${missing.join(', ')}] not present in its own actions.jsonl.`);
  }
}
export function assertCitationsExist(record: ExperienceRecord): void {
  const actual = actionRevisionsFor(record.gameId);
  const missing = record.citedRevisions.filter(revision => !actual.has(revision));
  if (missing.length > 0) throw new UncitedRevisionError(record.gameId, missing);
}

// ---------------------------------------------------------------------------
// experiences.jsonl / playbook.md
// ---------------------------------------------------------------------------

/** Appends one reflection record. Verifies its cited revisions first — a
 * failing check throws (the caller reports the game `failed`-to-publish
 * rather than silently dropping the citation requirement) and never partially
 * appends. Does not itself curate the playbook; call `curatePlaybook`
 * separately (dispatch does this once per finished game, after appending). */
export function filterCitations(record: ExperienceRecord): ExperienceRecord {
  if (record.finalRevision === undefined) { assertCitationsExist(record); return record; }
  const valid = record.citedRevisions.filter(r => Number.isInteger(r) && r >= 0 && r <= record.finalRevision!);
  const dropped = record.citedRevisions.filter(r => !valid.includes(r));
  return { ...record, citedRevisions: valid, droppedCitations: dropped };
}
export async function appendExperience(input: ExperienceRecord): Promise<ExperienceRecord> {
  const record = filterCitations(input);
  await withPublishLock(() => {
    mkdirSync(memoryDir(), { recursive: true });
    appendFileSync(experiencesPath(), `${JSON.stringify(record)}\n`, { mode: 0o644 });
  });
  return record;
}
export function readExperiences(): ExperienceRecord[] {
  if (!existsSync(experiencesPath())) return [];
  return readFileSync(experiencesPath(), 'utf8').split('\n').filter(line => line.trim())
    .map(line => JSON.parse(line) as ExperienceRecord);
}
export function playbookVersion(): number {
  if (!existsSync(playbookPath())) return 0;
  const match = readFileSync(playbookPath(), 'utf8').match(/^version:\s*(\d+)/m);
  return match ? Number(match[1]) : 0;
}
/** Served-playbook budget. Wave 1's reached ~11k words (v47); the players who read it paid in clock. */
export const PLAYBOOK_WORD_TARGET = 3000;
const CURATOR_PROMPT_PREAMBLE = `You are curating the shared strategy playbook for a Muju LLM-vs-Hard-engine pilot.
Read the JSON experience records below (one per line, most recent last). Produce an updated
playbook: concise, evidence-linked (cite gameId and revision numbers from the records — never
invent a revision), organized by tool tier and by recurring pattern. Preserve any counterexample
that contradicts an earlier claim; do not silently drop it. Output ONLY the new playbook body in
Markdown, starting with the line "version: <N>" where <N> is one more than the current version.
Do not fabricate outcomes not present in the records.
The engine changed during the campaign. Records without "engineSourceSha256" (all pilot games) ran a Hard engine
whose purchase menu was almost only fire_1; later records name the engine they ran. Keep the playbook's
"Read this first: the engine changed" section (update it, don't drop it), and label every claim about Hard's own
behaviour with the engine it was observed on, keeping old-engine and current-engine evidence apart. Claims about
the rules, the tools, or the LLM's own mistakes don't depend on the engine.
LENGTH: keep the playbook under ${PLAYBOOK_WORD_TARGET} words. Players read it at the start of a timed game, and every
word costs them clock for the rest of it. The full evidence stays in the experience records you are given each
time, so distil rather than accumulate: keep the rules primer verbatim, keep the engine-change section, and keep
the claims a player can act on, each with its strongest citations and any live counterexample (cite it briefly;
don't drop it). Don't keep per-game detail sections, complete game lists, running totals for every game, or lists
of record inconsistencies.`;
/**
 * Curates memory/playbook.md from experiences.jsonl via a Claude subscription
 * call (never the OpenAI API, per SPEC.md). `dryRun` composes the prompt and
 * returns it without spawning the CLI or touching the playbook — used by
 * `--curate --dry-run` and by tests.
 */
export async function curatePlaybook(opts: { dryRun?: boolean } = {}): Promise<{ prompt: string; nextVersion: number; wrote: boolean; words?: number }> {
  const compose = () => {
    // Read under the lock (see below): two games finishing together must not curate from the same stale state.
    const currentVersion = playbookVersion();
    const nextVersion = currentVersion + 1;
    const current = existsSync(playbookPath()) ? readFileSync(playbookPath(), 'utf8') : '(no playbook yet)';
    const prompt = [CURATOR_PROMPT_PREAMBLE, '', `Current version: ${currentVersion}. Write version: ${nextVersion}.`, '',
      '## Current playbook', current, '', '## Experience records', ...readExperiences().map(r => JSON.stringify(r))].join('\n');
    return { currentVersion, nextVersion, prompt };
  };
  if (opts.dryRun) { const { prompt, nextVersion } = compose(); return { prompt, nextVersion, wrote: false }; }
  return withPublishLock(async () => {
    const { currentVersion, nextVersion, prompt } = compose();
    // Subscription route only: API keys stripped, no tools, no MCP, run outside the repo.
    const cwd = mkdtempSync(join(tmpdir(), 'muju-pilot-curate-'));
    const { stdout } = await execFileAsync('claude', ['-p', prompt, '--model', 'claude-sonnet-5', '--effort', 'medium',
      '--output-format', 'text', '--tools', '', '--strict-mcp-config', '--permission-mode', 'dontAsk'],
      { maxBuffer: 16 * 1024 * 1024, timeout: 300_000, env: stripApiKeys().env, cwd });
    const body = stdout.trim();
    const header = body.match(/^version:\s*(\d+)/);
    if (!header || Number(header[1]) !== nextVersion) throw new Error(`Playbook curation did not return a "version: ${nextVersion}" document; refusing to overwrite.`);
    if (existsSync(playbookPath())) {
      mkdirSync(join(memoryDir(), 'playbook.history'), { recursive: true });
      cpSync(playbookPath(), join(memoryDir(), 'playbook.history', `v${currentVersion}.md`));
    }
    writeFileSync(playbookPath(), `${body}\n`, { mode: 0o644 });
    return { prompt, nextVersion, wrote: true, words: body.split(/\s+/).length };
  });
}

// ---------------------------------------------------------------------------
// Snapshots (frozen per pair, at its first leg's start — read-only for players)
// ---------------------------------------------------------------------------

/** Freezes the current playbook + experiences into memory/snapshots/v<N>/ and
 * returns its directory. Idempotent: re-freezing an existing version number
 * overwrites it with the current memory (only the dispatcher decides whether
 * a version is "already frozen for this pair"). */
export function freezeSnapshot(version: number): string {
  const dir = snapshotDir(version);
  mkdirSync(dir, { recursive: true });
  if (existsSync(playbookPath())) cpSync(playbookPath(), join(dir, 'playbook.md'));
  else writeFileSync(join(dir, 'playbook.md'), 'version: 0\n(no playbook yet)\n');
  if (existsSync(experiencesPath())) cpSync(experiencesPath(), join(dir, 'experiences.jsonl'));
  else writeFileSync(join(dir, 'experiences.jsonl'), '');
  return dir;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function cli(argv: string[]): Promise<void> {
  if (argv.includes('--append')) {
    const gameDirArg = argv[argv.indexOf('--append') + 1];
    if (!gameDirArg) throw new Error('--append requires a game directory containing manifest.json + reflection record.');
    const recordPath = join(gameDirArg, 'experience.json');
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as ExperienceRecord;
    await appendExperience(record);
    console.log(`Appended experience for ${record.gameId}.`);
    return;
  }
  if (argv.includes('--curate')) {
    const result = await curatePlaybook({ dryRun: argv.includes('--dry-run') });
    if (!result.wrote) { console.log(result.prompt); console.log(`\n[dry-run] would write playbook version: ${result.nextVersion}`); }
    else console.log(`Playbook updated to version ${result.nextVersion}.`);
    return;
  }
  if (argv.includes('--snapshot')) {
    const version = Number(argv[argv.indexOf('--version') + 1]);
    if (!Number.isInteger(version) || version < 1) throw new Error('--snapshot requires --version <positive integer>.');
    console.log(`Froze snapshot at ${freezeSnapshot(version)}`);
    return;
  }
  console.error('usage: node --import tsx tools/llm-pilot/publish.ts (--append <gameDir> | --curate [--dry-run] | --snapshot --version <N>)');
  process.exitCode = 2;
}
const invokedDirectly = process.argv[1] !== undefined && new URL(import.meta.url).pathname === process.argv[1];
if (invokedDirectly) cli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
