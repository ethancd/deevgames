import { describe, expect, it } from 'vitest';
import { makeJudge } from '../src/judge.ts';
import type { LlmClient, CompleteRequest } from '../src/client.ts';

function scriptedClient(responses: string[]): { client: LlmClient; calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  let index = 0;
  const client: LlmClient = {
    async complete(req: CompleteRequest) {
      calls.push(req);
      const text = responses[Math.min(index, responses.length - 1)];
      index++;
      return { text };
    },
  };
  return { client, calls };
}

type Verdict = 'DUPLICATE' | 'NOT_DUPLICATE';

describe('makeJudge', () => {
  it('returns a valid enum member on the first well-formed response', async () => {
    const { client, calls } = scriptedClient([JSON.stringify({ payload: JSON.stringify('DUPLICATE') })]);

    const judge = makeJudge<Verdict>({
      client,
      instruction: 'Is the candidate a duplicate?',
      options: ['DUPLICATE', 'NOT_DUPLICATE'] as const,
    });

    const verdict = await judge('candidate card text');
    expect(verdict).toBe('DUPLICATE');
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain('candidate card text');
    expect(calls[0].prompt).toContain('DUPLICATE, NOT_DUPLICATE');
  });

  it('retries on garbage (unparseable payload) and succeeds once a valid enum member arrives', async () => {
    const { client, calls } = scriptedClient([
      JSON.stringify({ payload: 'not valid json at all' }), // garbage -> parseTolerant -> undefined -> validate fails
      JSON.stringify({ payload: JSON.stringify('NOT_DUPLICATE') }),
    ]);

    const judge = makeJudge<Verdict>({
      client,
      instruction: 'Is the candidate a duplicate?',
      options: ['DUPLICATE', 'NOT_DUPLICATE'] as const,
    });

    const verdict = await judge('some subject');
    expect(verdict).toBe('NOT_DUPLICATE');
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain('Previous attempt failed validation');
  });

  it('retries on a value outside the enum, then succeeds', async () => {
    const { client } = scriptedClient([
      JSON.stringify({ payload: JSON.stringify('MAYBE') }), // valid JSON, but not one of the allowed options
      JSON.stringify({ payload: JSON.stringify('DUPLICATE') }),
    ]);

    const judge = makeJudge<Verdict>({
      client,
      instruction: 'Judge it',
      options: ['DUPLICATE', 'NOT_DUPLICATE'] as const,
    });

    await expect(judge('x')).resolves.toBe('DUPLICATE');
  });

  it('throws once retries are exhausted on persistent garbage', async () => {
    const { client } = scriptedClient([
      JSON.stringify({ payload: 'garbage' }),
      JSON.stringify({ payload: 'still garbage' }),
      JSON.stringify({ payload: 'more garbage' }),
    ]);

    const judge = makeJudge<Verdict>({
      client,
      instruction: 'Judge it',
      options: ['DUPLICATE', 'NOT_DUPLICATE'] as const,
      retries: 2,
    });

    await expect(judge('x')).rejects.toThrow(/exhausted 3 attempt/);
  });
});
