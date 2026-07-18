// Job lifecycle management for implement-cards background jobs. jobs.json
// (via server/persistence.ts) is the crash-detection log: on dev-server
// boot, any job still 'queued' | 'running' | 'testing' gets flipped to
// 'interrupted' and surfaced in the UI.
//
// JobManager owns the sequential (one-at-a-time) implement-job queue: it
// persists JobRecord state to jobs.json after every transition, and keeps a
// live in-memory log per job (not persisted -- an interrupted job just
// shows a generic recovery message, which is an acceptable loss for a
// dev-only tool) that GET /api/jobs/:id exposes for the polling UI.

import type { CardId, JobRecord, JobStatus } from '../shared/types';
import type { PersistencePaths } from './persistence';
import { readJobs, writeJobs, readRegistry, writeRegistry } from './persistence';
import { implementCards, type ImplementCardsParams, type ImplementCardsResult } from './claude';

const NON_TERMINAL_STATUSES: readonly JobStatus[] = ['queued', 'running', 'testing'];
const TERMINAL_STATUSES: readonly JobStatus[] = ['done', 'failed', 'needs-clarification', 'interrupted'];

let jobSequence = 0;

function nextJobId(round: number): string {
  jobSequence += 1;
  return `job-r${round}-${Date.now().toString(36)}-${jobSequence}`;
}

export function createJob(round: number, cardIds: CardId[]): JobRecord {
  const now = new Date().toISOString();
  return {
    id: nextJobId(round),
    status: 'queued',
    round,
    cardIds: [...cardIds],
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
}

export function updateJob(
  job: JobRecord,
  patch: Partial<Omit<JobRecord, 'id' | 'createdAt'>>
): JobRecord {
  return { ...job, ...patch, updatedAt: new Date().toISOString() };
}

export function getJob(jobs: JobRecord[], id: string): JobRecord | undefined {
  return jobs.find((job) => job.id === id);
}

export function isTerminalStatus(status: JobStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// Boot-time recovery scan: jobs stuck 'running' | 'queued' | 'testing' in
// jobs.json (because the previous dev-server process died mid-job) become
// 'interrupted'.
export function recoverInterruptedJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs.map((job) =>
    (NON_TERMINAL_STATUSES as readonly string[]).includes(job.status)
      ? updateJob(job, {
          status: 'interrupted',
          error: job.error ?? 'The dev server restarted while this job was in progress.',
        })
      : job
  );
}

export interface JobRecordWithLog extends JobRecord {
  log: string[];
}

// Executes one implement job attempt: given the job and a log sink, does
// whatever work is needed and resolves to a terminal-ish ImplementCardsResult
// ('failed' here means "this one attempt failed", not "give up" -- JobManager
// decides whether/how to retry).
export type ImplementRunner = (
  job: JobRecord,
  onLog: (line: string) => void
) => Promise<ImplementCardsResult>;

export interface JobManagerOptions {
  paths: PersistencePaths;
  projectRoot: string;
  // Injectable for tests; defaults to a real runner built from
  // server/claude.ts#implementCards + server/persistence.ts.
  runImplement?: ImplementRunner;
  // Injectable for tests; default to server/persistence.ts's readJobs/writeJobs.
  loadJobs?: (paths: PersistencePaths) => Promise<JobRecord[]>;
  saveJobs?: (paths: PersistencePaths, jobs: JobRecord[]) => Promise<void>;
}

const TESTING_MARKER_RE = /npm run test:cards|vitest/i;

// Owns the in-memory job list + a strictly sequential ("one at a time", per
// the plan) implement-job queue. Persists to jobs.json after every
// transition so a crash mid-job is recoverable on the next boot via
// recoverInterruptedJobs above.
export class JobManager {
  private jobs: JobRecord[] = [];
  private readonly logs = new Map<string, string[]>();
  private readonly queue: string[] = [];
  private draining = false;
  private readonly ready: Promise<void>;
  private readonly runImplement: ImplementRunner;

  constructor(private readonly options: JobManagerOptions) {
    this.runImplement = options.runImplement ?? this.defaultRunner();
    this.ready = this.bootstrap();
  }

  private defaultRunner(): ImplementRunner {
    return async (job, onLog) => {
      const registry = await readRegistry(this.options.paths);
      const cards = registry.filter((c) => job.cardIds.includes(c.id));
      const params: ImplementCardsParams = {
        round: job.round,
        cardIds: job.cardIds,
        cards,
        job,
        projectRoot: this.options.projectRoot,
        onLog,
        priorFailureOutput: job.error,
      };
      const result = await implementCards(params);
      if (result.status === 'done') {
        const updated = registry.map((c) =>
          job.cardIds.includes(c.id) ? { ...c, implemented: true } : c
        );
        await writeRegistry(this.options.paths, updated);
      }
      return result;
    };
  }

  private async bootstrap(): Promise<void> {
    const load = this.options.loadJobs ?? readJobs;
    const loaded = await load(this.options.paths);
    this.jobs = recoverInterruptedJobs(loaded);
    for (const job of this.jobs) {
      if (!this.logs.has(job.id)) this.logs.set(job.id, []);
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    const save = this.options.saveJobs ?? writeJobs;
    await save(this.options.paths, this.jobs);
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  async list(): Promise<JobRecord[]> {
    await this.ready;
    return this.jobs;
  }

  get(id: string): JobRecordWithLog | undefined {
    const job = getJob(this.jobs, id);
    if (!job) return undefined;
    return { ...job, log: this.logs.get(id) ?? [] };
  }

  async enqueue(round: number, cardIds: CardId[]): Promise<JobRecord> {
    await this.ready;
    const job = createJob(round, cardIds);
    this.jobs.push(job);
    this.logs.set(job.id, []);
    await this.persist();
    this.queue.push(job.id);
    void this.drain();
    return job;
  }

  // Manual retry (POST /api/jobs/:id/retry): re-queues a job that's
  // currently in a terminal-ish state, bumping its attempt count and
  // feeding the prior failure output back into the next attempt's prompt
  // (via JobManager's default runner reading job.error).
  async retry(id: string): Promise<JobRecord | undefined> {
    await this.ready;
    const idx = this.jobs.findIndex((job) => job.id === id);
    if (idx === -1) return undefined;

    const job = updateJob(this.jobs[idx], { status: 'queued' });
    this.jobs[idx] = job;
    await this.persist();
    this.queue.push(id);
    void this.drain();
    return job;
  }

  private appendLog(id: string, line: string): void {
    const log = this.logs.get(id) ?? [];
    log.push(line);
    this.logs.set(id, log);
  }

  private setStatus(id: string, patch: Partial<Omit<JobRecord, 'id' | 'createdAt'>>): void {
    const idx = this.jobs.findIndex((job) => job.id === id);
    if (idx === -1) return;
    this.jobs[idx] = updateJob(this.jobs[idx], patch);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let id: string | undefined;
      // eslint-disable-next-line no-cond-assign
      while ((id = this.queue.shift())) {
        await this.runOne(id);
      }
    } finally {
      this.draining = false;
    }
  }

  private async runOne(id: string): Promise<void> {
    const current = getJob(this.jobs, id);
    if (!current) return;

    const attempts = current.attempts + 1;
    this.setStatus(id, { status: 'running', attempts });
    await this.persist();
    this.appendLog(
      id,
      `Starting implement job (attempt ${attempts}) for: ${current.cardIds.join(', ')}`
    );

    const onLog = (line: string) => {
      this.appendLog(id, line);
      if (TESTING_MARKER_RE.test(line)) {
        const job = getJob(this.jobs, id);
        if (job && job.status === 'running') {
          this.setStatus(id, { status: 'testing' });
        }
      }
    };

    let result: ImplementCardsResult;
    try {
      const jobForRunner = getJob(this.jobs, id);
      if (!jobForRunner) return;
      result = await this.runImplement(jobForRunner, onLog);
    } catch (err) {
      result = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }

    if (result.status === 'done') {
      this.setStatus(id, { status: 'done', error: undefined, clarificationQuestion: undefined });
    } else if (result.status === 'needs-clarification') {
      this.setStatus(id, {
        status: 'needs-clarification',
        clarificationQuestion: result.clarificationQuestion,
      });
    } else {
      this.setStatus(id, {
        status: 'failed',
        error: result.error ?? 'Implement job failed with no error detail.',
      });
    }
    await this.persist();
  }
}
