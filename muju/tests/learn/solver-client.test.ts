import { describe, expect, it } from 'vitest';
import { fixtureById } from '../../src/learn/fixtures';
import { makeContext } from '../../src/learn/goals';
import { LearnSolverClient, SolverCancelled } from '../../src/learn/worker/client';
import { heldWorkers } from './held-worker';

const spec = fixtureById('fx-capture')!;
const { start } = makeContext(spec);

describe('LearnSolverClient', () => {
  it('answers through the worker, one promise per request', async () => {
    const { workers, factory } = heldWorkers();
    const client = new LearnSolverClient(factory);
    const asked = client.canStillWin(spec, start);
    expect(workers).toHaveLength(1);
    workers[0].answer(workers[0].received[0]);
    await expect(asked).resolves.toBe('yes');
  });

  it('cancel stops a worker that is still searching, so the next request does not queue behind a stale one', async () => {
    const { workers, factory } = heldWorkers();
    const client = new LearnSolverClient(factory);
    const stale = client.solutionLine(spec, start);
    client.cancel();
    await expect(stale).rejects.toBeInstanceOf(SolverCancelled);
    expect(workers[0].terminated).toBe(true);
    const live = client.canStillWin(spec, start);
    expect(workers).toHaveLength(2);
    expect(workers[1].received.map(r => r.kind)).toEqual(['win']);
    workers[1].answer(workers[1].received[0]);
    await expect(live).resolves.toBe('yes');
  });

  it('cancel with nothing running keeps the worker', () => {
    const { workers, factory } = heldWorkers();
    const client = new LearnSolverClient(factory);
    void client.canStillWin(spec, start);
    workers[0].answer(workers[0].received[0]);
    client.cancel();
    expect(workers[0].terminated).toBe(false);
    void client.canStillWin(spec, start);
    expect(workers).toHaveLength(1);
  });
});
