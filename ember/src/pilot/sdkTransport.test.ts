/**
 * EMBER — sdkTransport tests (src/pilot/sdkTransport.test.ts).
 *
 * No live API calls are ever made here (there is no key in this
 * environment, and the task brief forbids it). mapSdkError()'s taxonomy is
 * fully exercised using real `@anthropic-ai/sdk` error CLASSES constructed
 * in-process — never a network request. createSdkTransport() itself is
 * only smoke-tested for construction/shape (it must not throw, and must
 * never touch the network on construction — the SDK client is lazy).
 */

import { describe, expect, it } from 'vitest';
import { APIConnectionError, APIError, AuthenticationError, InternalServerError, RateLimitError } from '@anthropic-ai/sdk';
import { createSdkTransport, mapSdkError, LLMTransportError } from './sdkTransport';

const FAKE_KEY = 'sk-ant-super-secret-do-not-leak-XYZ123';

function headers(): Headers {
  return new Headers();
}

describe('createSdkTransport', () => {
  it('constructs without making any network call and returns a callable transport', () => {
    const transport = createSdkTransport({ apiKey: FAKE_KEY });
    expect(typeof transport).toBe('function');
  });
});

describe('mapSdkError taxonomy', () => {
  it('maps AuthenticationError (401) to a non-retryable auth-classed LLMTransportError', () => {
    const sdkErr = new AuthenticationError(401, { error: { message: `key ${FAKE_KEY} invalid` } }, 'msg', headers());
    const mapped = mapSdkError(sdkErr);
    expect(mapped).toBeInstanceOf(LLMTransportError);
    expect(mapped.status).toBe(401);
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).not.toContain(FAKE_KEY);
  });

  it('maps RateLimitError (429) to a retryable LLMTransportError', () => {
    const sdkErr = new RateLimitError(429, { error: { message: 'slow down' } }, 'msg', headers());
    const mapped = mapSdkError(sdkErr);
    expect(mapped.status).toBe(429);
    expect(mapped.retryable).toBe(true);
  });

  it('maps InternalServerError (5xx) to a retryable LLMTransportError', () => {
    const sdkErr = new InternalServerError(503, { error: { message: 'oops' } }, 'msg', headers());
    const mapped = mapSdkError(sdkErr);
    expect(mapped.status).toBe(503);
    expect(mapped.retryable).toBe(true);
  });

  it('maps APIConnectionError to a retryable, statusless LLMTransportError', () => {
    const sdkErr = new APIConnectionError({ message: `network down, key was ${FAKE_KEY}` });
    const mapped = mapSdkError(sdkErr);
    expect(mapped.status).toBeUndefined();
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).not.toContain(FAKE_KEY);
  });

  it('maps a generic non-retryable APIError (e.g. 400) to a non-retryable LLMTransportError', () => {
    const sdkErr = APIError.generate(400, { error: { message: `bad request from ${FAKE_KEY}` } }, 'msg', headers());
    const mapped = mapSdkError(sdkErr);
    expect(mapped.status).toBe(400);
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).not.toContain(FAKE_KEY);
  });

  it('maps a totally unrecognized thrown value to a safe unknown_error', () => {
    const mapped = mapSdkError(`plain string mentioning ${FAKE_KEY}`);
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).not.toContain(FAKE_KEY);
  });

  it('never includes the original error message/body in the mapped message, for any class', () => {
    const secretsInMessages = [
      new AuthenticationError(401, {}, `leak ${FAKE_KEY}`, headers()),
      new RateLimitError(429, {}, `leak ${FAKE_KEY}`, headers()),
      new InternalServerError(500, {}, `leak ${FAKE_KEY}`, headers()),
      new APIConnectionError({ message: `leak ${FAKE_KEY}` }),
    ];
    for (const err of secretsInMessages) {
      const mapped = mapSdkError(err);
      expect(mapped.message).not.toContain(FAKE_KEY);
      expect(JSON.stringify(mapped)).not.toContain(FAKE_KEY);
    }
  });
});
