import { describe, expect, it } from 'vitest';
import { anthropicClient } from '../src/client.ts';
import type { FetchLikeResponse } from '../src/client.ts';

describe('anthropicClient — zero-key CI guarantee', () => {
  it('constructs fine with an empty injected env (no throw at construction or import)', () => {
    expect(() => anthropicClient({ model: 'claude-sonnet-5', env: {} })).not.toThrow();
  });

  it('rejects the first complete() call with an error naming both default env vars', async () => {
    const client = anthropicClient({ model: 'claude-sonnet-5', env: {} });
    await expect(client.complete({ prompt: 'hello', maxTokens: 100 })).rejects.toThrow(
      /ANTHROPIC_API_KEY.*ANTHROPIC_PERSONAL_API_KEY|ANTHROPIC_PERSONAL_API_KEY.*ANTHROPIC_API_KEY/
    );
  });

  it('names every custom env var tried, not just the defaults', async () => {
    const client = anthropicClient({ model: 'claude-sonnet-5', env: {}, apiKeyEnvs: ['MY_CUSTOM_KEY'] });
    await expect(client.complete({ prompt: 'hi', maxTokens: 100 })).rejects.toThrow(/MY_CUSTOM_KEY/);
  });

  it('never touches process.env when env is injected — reads only the injected object', async () => {
    // Even if a real key happens to be set in this test process's env, an
    // injected empty env must win — proving env resolution is not silently
    // falling back to globalThis.process.env.
    const client = anthropicClient({ model: 'claude-sonnet-5', env: {} });
    await expect(client.complete({ prompt: 'hi', maxTokens: 100 })).rejects.toThrow(/no API key found/);
  });
});

describe('anthropicClient — successful call over an injected fetch', () => {
  it('sends the expected request shape and extracts the text block', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: { method: string; headers: Record<string, string>; body: string } | undefined;

    const fetchImpl = async (
      url: string,
      init: { method: string; headers: Record<string, string>; body: string }
    ): Promise<FetchLikeResponse> => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'hello back' }] }),
        text: async () => '',
      };
    };

    const client = anthropicClient({
      model: 'claude-sonnet-5',
      env: { ANTHROPIC_API_KEY: 'sk-test-key' },
      fetchImpl,
    });

    const result = await client.complete({ system: 'be terse', prompt: 'say hi', maxTokens: 50 });

    expect(result.text).toBe('hello back');
    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedInit?.headers['x-api-key']).toBe('sk-test-key');
    expect(capturedInit?.headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(capturedInit!.body) as Record<string, unknown>;
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(50);
    expect(body.system).toBe('be terse');
    expect(body.messages).toEqual([{ role: 'user', content: 'say hi' }]);
  });

  it('includes output_config.format when jsonSchema is passed', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = async (
      _url: string,
      init: { body: string }
    ): Promise<FetchLikeResponse> => {
      capturedBody = JSON.parse(init.body) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ content: [] }), text: async () => '' };
    };

    const client = anthropicClient({ model: 'claude-sonnet-5', env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
    const schema = { type: 'object', properties: { x: { type: 'string' } } };
    await client.complete({ prompt: 'p', maxTokens: 10, jsonSchema: schema });

    expect(capturedBody?.output_config).toEqual({ format: { type: 'json_schema', schema } });
  });

  it('surfaces a clear error on a non-ok HTTP response', async () => {
    const fetchImpl = async (): Promise<FetchLikeResponse> => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'rate limited',
    });
    const client = anthropicClient({ model: 'claude-sonnet-5', env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
    await expect(client.complete({ prompt: 'p', maxTokens: 10 })).rejects.toThrow(/429/);
  });
});
