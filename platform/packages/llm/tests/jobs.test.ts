import { describe, expect, it, vi } from 'vitest';
import { runImplementJob } from '../src/jobs.ts';
import type { JobRunner, JobRunnerOptions } from '../src/jobs.ts';

function mockRunner(outputs: string[]): { runner: JobRunner; calls: JobRunnerOptions[] } {
  const calls: JobRunnerOptions[] = [];
  let index = 0;
  const runner: JobRunner = async (opts: JobRunnerOptions) => {
    calls.push(opts);
    const output = outputs[Math.min(index, outputs.length - 1)];
    index++;
    return { output };
  };
  return { runner, calls };
}

describe('runImplementJob — disallowedTools merge', () => {
  it('always merges both git spellings, even with no caller-supplied disallowedTools', async () => {
    const { runner, calls } = mockRunner(['ok']);
    const gate = vi.fn(async () => ({ pass: true }));

    await runImplementJob({ prompt: 'do it', cwd: '/tmp/game', gate, runner });

    expect(calls[0].disallowedTools).toEqual(expect.arrayContaining(['Bash(git *)', 'Bash(git:*)']));
  });

  it('merges both git spellings in even when the caller supplies their own disallowedTools list', async () => {
    const { runner, calls } = mockRunner(['ok']);
    const gate = vi.fn(async () => ({ pass: true }));

    await runImplementJob({
      prompt: 'do it',
      cwd: '/tmp/game',
      disallowedTools: ['Bash(rm *)'],
      gate,
      runner,
    });

    expect(calls[0].disallowedTools).toEqual(
      expect.arrayContaining(['Bash(rm *)', 'Bash(git *)', 'Bash(git:*)'])
    );
  });

  it('dedupes if the caller already included one of the two spellings', async () => {
    const { runner, calls } = mockRunner(['ok']);
    const gate = vi.fn(async () => ({ pass: true }));

    await runImplementJob({
      prompt: 'do it',
      cwd: '/tmp/game',
      disallowedTools: ['Bash(git *)'],
      gate,
      runner,
    });

    const gitEntries = calls[0].disallowedTools.filter((t) => t === 'Bash(git *)');
    expect(gitEntries).toHaveLength(1);
    expect(calls[0].disallowedTools).toEqual(expect.arrayContaining(['Bash(git *)', 'Bash(git:*)']));
  });
});

describe('runImplementJob — defaults, maxTurns, attempts', () => {
  it('uses the default allowedTools, maxTurns=50, attempts=3 when not specified', async () => {
    const { runner, calls } = mockRunner(['no', 'no', 'no']);
    const gate = vi.fn(async () => ({ pass: false }));

    const result = await runImplementJob({ prompt: 'do it', cwd: '/tmp/game', gate, runner });

    expect(calls).toHaveLength(3);
    expect(calls[0].allowedTools).toEqual(['Read', 'Write', 'Edit', 'Bash', 'Glob']);
    expect(calls[0].maxTurns).toBe(50);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
  });

  it('respects a caller-supplied maxTurns and attempts count', async () => {
    const { runner, calls } = mockRunner(['no', 'no']);
    const gate = vi.fn(async () => ({ pass: false }));

    const result = await runImplementJob({
      prompt: 'do it',
      cwd: '/tmp/game',
      maxTurns: 10,
      attempts: 2,
      gate,
      runner,
    });

    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.maxTurns === 10)).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.success).toBe(false);
  });
});

describe('runImplementJob — gate + feedback threading', () => {
  it('succeeds only when the gate passes, and stops immediately once it does', async () => {
    const { runner, calls } = mockRunner(['attempt-1-output', 'attempt-2-output']);
    let call = 0;
    const gate = vi.fn(async () => {
      call++;
      return { pass: call === 2, feedback: call === 1 ? 'tests failed: X' : undefined };
    });

    const result = await runImplementJob({ prompt: 'implement the card', cwd: '/tmp/game', gate, runner });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2); // must not run a third attempt after passing
  });

  it('threads gate feedback into the next attempt\'s prompt', async () => {
    const { runner, calls } = mockRunner(['attempt-1-output', 'attempt-2-output']);
    let call = 0;
    const gate = vi.fn(async () => {
      call++;
      return { pass: call === 2, feedback: call === 1 ? 'vitest failure: expected 2 got 3' : undefined };
    });

    await runImplementJob({ prompt: 'implement the card', cwd: '/tmp/game', gate, runner });

    expect(calls[0].prompt).toBe('implement the card');
    expect(calls[1].prompt).toContain('vitest failure: expected 2 got 3');
    expect(calls[1].prompt).toContain('implement the card');
  });

  it('reports failure with the log populated when every attempt fails the gate', async () => {
    const { runner } = mockRunner(['a', 'b', 'c']);
    const gate = vi.fn(async () => ({ pass: false, feedback: 'still broken' }));

    const result = await runImplementJob({ prompt: 'implement it', cwd: '/tmp/game', attempts: 3, gate, runner });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.log.length).toBeGreaterThan(0);
    expect(result.log.some((line) => line.includes('still broken'))).toBe(true);
  });
});

describe('runImplementJob — default runner never resolves the SDK when a mock runner is supplied', () => {
  it('does not import @anthropic-ai/claude-agent-sdk when a custom runner is used', async () => {
    // If the default runner's dynamic import were reached, this would either
    // throw (no real credentials/CLI) or hang. Supplying our own runner must
    // make the SDK import entirely unreachable.
    const { runner } = mockRunner(['ok']);
    const gate = vi.fn(async () => ({ pass: true }));
    const result = await runImplementJob({ prompt: 'x', cwd: '/tmp/game', gate, runner });
    expect(result.success).toBe(true);
  });
});
