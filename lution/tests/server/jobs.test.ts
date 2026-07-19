import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createJob,
  updateJob,
  getJob,
  isTerminalStatus,
  recoverInterruptedJobs,
  JobManager,
} from '../../server/jobs';
import type { PersistencePaths } from '../../server/persistence';
import type { ImplementCardsResult } from '../../server/claude';
import type { JobRecord } from '../../shared/types';

describe('createJob / updateJob / getJob', () => {
  it('creates a fresh job in the queued state with zero attempts', () => {
    const job = createJob(3, ['card-a', 'card-b']);
    expect(job.status).toBe('queued');
    expect(job.round).toBe(3);
    expect(job.cardIds).toEqual(['card-a', 'card-b']);
    expect(job.attempts).toBe(0);
    expect(job.id).toBeTruthy();
  });

  it('mints distinct ids for jobs created back to back', () => {
    const a = createJob(1, ['x']);
    const b = createJob(1, ['x']);
    expect(a.id).not.toBe(b.id);
  });

  it('updateJob merges a patch and bumps updatedAt, preserving id/createdAt', async () => {
    const job = createJob(1, ['x']);
    await new Promise((r) => setTimeout(r, 2));
    const updated = updateJob(job, { status: 'running' });
    expect(updated.id).toBe(job.id);
    expect(updated.createdAt).toBe(job.createdAt);
    expect(updated.status).toBe('running');
    expect(updated.updatedAt).not.toBe(job.updatedAt);
  });

  it('getJob finds by id or returns undefined', () => {
    const job = createJob(1, ['x']);
    expect(getJob([job], job.id)).toBe(job);
    expect(getJob([job], 'nonexistent')).toBeUndefined();
  });
});

describe('isTerminalStatus', () => {
  it('classifies done/failed/needs-clarification/interrupted as terminal', () => {
    expect(isTerminalStatus('done')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('needs-clarification')).toBe(true);
    expect(isTerminalStatus('interrupted')).toBe(true);
  });

  it('classifies queued/running/testing as non-terminal', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('testing')).toBe(false);
  });
});

describe('recoverInterruptedJobs', () => {
  it('flips queued/running/testing jobs to interrupted', () => {
    const jobs: JobRecord[] = [
      { ...createJob(1, ['a']), status: 'queued' },
      { ...createJob(1, ['b']), status: 'running' },
      { ...createJob(1, ['c']), status: 'testing' },
    ];
    const recovered = recoverInterruptedJobs(jobs);
    expect(recovered.every((j) => j.status === 'interrupted')).toBe(true);
    expect(recovered.every((j) => typeof j.error === 'string')).toBe(true);
  });

  it('leaves terminal-status jobs untouched', () => {
    const done: JobRecord = { ...createJob(1, ['a']), status: 'done' };
    const failed: JobRecord = { ...createJob(1, ['b']), status: 'failed', error: 'boom' };
    const recovered = recoverInterruptedJobs([done, failed]);
    expect(recovered[0]).toEqual(done);
    expect(recovered[1]).toEqual(failed);
  });
});

describe('JobManager', () => {
  let dir: string;
  let paths: PersistencePaths;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lution-jobs-'));
    paths = { dataDir: path.join(dir, 'data'), nextCardsPath: path.join(dir, 'NEXT_CARDS.md') };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runs an enqueued job to completion via the injected runner and persists the result', async () => {
    const runImplement = vi.fn(
      async (): Promise<ImplementCardsResult> => ({ status: 'done' })
    );
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const job = await manager.enqueue(1, ['card-a']);
    // enqueue's drain() runs fire-and-forget; poll briefly for completion.
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('done');
    });

    expect(runImplement).toHaveBeenCalledTimes(1);
    const persisted = await (await import('../../server/persistence')).readJobs(paths);
    expect(persisted.find((j) => j.id === job.id)?.status).toBe('done');
  });

  it('runs jobs strictly one at a time (sequential queue)', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const runImplement = vi.fn(async (): Promise<ImplementCardsResult> => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent -= 1;
      return { status: 'done' };
    });
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const jobA = await manager.enqueue(1, ['a']);
    const jobB = await manager.enqueue(1, ['b']);

    await vi.waitFor(() => {
      expect(manager.get(jobA.id)?.status).toBe('done');
      expect(manager.get(jobB.id)?.status).toBe('done');
    });

    expect(maxConcurrent).toBe(1);
  });

  it('marks a job failed (not thrown) when the runner rejects', async () => {
    const runImplement = vi.fn(async (): Promise<ImplementCardsResult> => {
      throw new Error('kaboom');
    });
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const job = await manager.enqueue(1, ['a']);
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('failed');
    });
    expect(manager.get(job.id)?.error).toContain('kaboom');
  });

  it('maps a needs-clarification result to that job status with the question attached', async () => {
    const runImplement = vi.fn(
      async (): Promise<ImplementCardsResult> => ({
        status: 'needs-clarification',
        clarificationQuestion: 'What should X mean?',
      })
    );
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const job = await manager.enqueue(1, ['a']);
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('needs-clarification');
    });
    expect(manager.get(job.id)?.clarificationQuestion).toBe('What should X mean?');
  });

  it('retry() re-queues a job and increments its attempt count', async () => {
    let call = 0;
    const runImplement = vi.fn(async (): Promise<ImplementCardsResult> => {
      call += 1;
      return call === 1 ? { status: 'failed', error: 'first try failed' } : { status: 'done' };
    });
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const job = await manager.enqueue(1, ['a']);
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('failed');
    });
    expect(manager.get(job.id)?.attempts).toBe(1);

    await manager.retry(job.id);
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('done');
    });
    expect(manager.get(job.id)?.attempts).toBe(2);
  });

  it('boot-time recovery flips a previously-running job to interrupted', async () => {
    const stuckJob: JobRecord = {
      id: 'job-stuck',
      status: 'running',
      round: 1,
      cardIds: ['a'],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      attempts: 1,
    };
    const { writeJobs } = await import('../../server/persistence');
    await writeJobs(paths, [stuckJob]);

    const runImplement = vi.fn(async (): Promise<ImplementCardsResult> => ({ status: 'done' }));
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });
    await manager.whenReady();

    expect(manager.get('job-stuck')?.status).toBe('interrupted');
    expect(runImplement).not.toHaveBeenCalled();
  });

  it("get() exposes each job's accumulated log lines", async () => {
    const runImplement = vi.fn(async (_job: JobRecord, onLog: (line: string) => void): Promise<ImplementCardsResult> => {
      onLog('doing the thing');
      return { status: 'done' };
    });
    const manager = new JobManager({ paths, projectRoot: dir, runImplement });

    const job = await manager.enqueue(1, ['a']);
    await vi.waitFor(() => {
      expect(manager.get(job.id)?.status).toBe('done');
    });
    expect(manager.get(job.id)?.log.some((l) => l.includes('doing the thing'))).toBe(true);
  });
});
