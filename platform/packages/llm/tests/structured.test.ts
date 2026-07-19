import { describe, expect, it } from 'vitest';
import { structuredCall, wireSchemaFor, parseTolerant } from '../src/structured.ts';
import type { LlmClient, CompleteRequest } from '../src/client.ts';

function scriptedClient(responses: string[]): { client: LlmClient; calls: CompleteRequest[] } {
  const calls: CompleteRequest[] = [];
  let index = 0;
  const client: LlmClient = {
    async complete(req: CompleteRequest) {
      calls.push(req);
      const text = responses[index] ?? responses[responses.length - 1];
      index++;
      return { text };
    },
  };
  return { client, calls };
}

interface Thing {
  foo: string;
}

function validateThing(value: unknown): { ok: true; value: Thing } | { ok: false; errors: string[] } {
  if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).foo === 'string') {
    return { ok: true, value: value as Thing };
  }
  return { ok: false, errors: [`expected { foo: string }, got ${JSON.stringify(value)}`] };
}

describe('structuredCall — retry loop', () => {
  it('retries once when the first attempt fails validate, and feeds the errors back into the second prompt', async () => {
    const { client, calls } = scriptedClient([
      JSON.stringify({ payload: JSON.stringify({ foo: 42 }) }), // fails: foo must be a string
      JSON.stringify({ payload: JSON.stringify({ foo: 'bar' }) }), // passes
    ]);

    const result = await structuredCall<Thing>({
      client,
      prompt: 'produce a Thing',
      schema: { type: 'object', properties: { foo: { type: 'string' } }, required: ['foo'] },
      validate: validateThing,
    });

    expect(result).toEqual({ foo: 'bar' });
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain('Previous attempt failed validation');
    expect(calls[1].prompt).toContain('expected { foo: string }, got {"foo":42}');
    // First call must NOT already contain retry feedback (nothing to feed back yet).
    expect(calls[0].prompt).not.toContain('Previous attempt failed validation');
  });

  it('throws after exhausting all attempts, with the last errors in the message', async () => {
    const { client } = scriptedClient([
      JSON.stringify({ payload: JSON.stringify({ foo: 1 }) }),
      JSON.stringify({ payload: JSON.stringify({ foo: 2 }) }),
    ]);

    await expect(
      structuredCall<Thing>({
        client,
        prompt: 'produce a Thing',
        schema: { type: 'object' },
        validate: validateThing,
        retries: 1, // total attempts = 2
      })
    ).rejects.toThrow(/exhausted 2 attempt/);
  });
});

describe('structuredCall — JSON-string transport for recursive schemas', () => {
  // A self-nesting shape (an effect-AST-shaped composition), the reason the
  // JSON-string transport exists at all: the API rejects recursive $defs as
  // a literal wire schema, so the composition always travels as a string —
  // but a model that ignores the "stringify it" instruction and emits the
  // object directly must also be accepted (object passthrough).
  interface RecursiveComposition {
    trigger: string;
    body: { seq: unknown[] } | { atom: string };
  }
  const recursiveValue: RecursiveComposition = {
    trigger: 'onPlay',
    body: { seq: [{ atom: 'draw' }, { atom: 'discard' }] },
  };

  function validateComposition(
    value: unknown
  ): { ok: true; value: RecursiveComposition } | { ok: false; errors: string[] } {
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).trigger === 'string' &&
      'body' in (value as Record<string, unknown>)
    ) {
      return { ok: true, value: value as RecursiveComposition };
    }
    return { ok: false, errors: ['not a valid composition'] };
  }

  it('accepts the payload as a JSON-encoded string', async () => {
    const { client } = scriptedClient([JSON.stringify({ payload: JSON.stringify(recursiveValue) })]);
    const result = await structuredCall<RecursiveComposition>({
      client,
      prompt: 'compose it',
      schema: { type: 'object' },
      validate: validateComposition,
    });
    expect(result).toEqual(recursiveValue);
  });

  it('accepts the payload as a raw object (object passthrough)', async () => {
    // The model ignored the "encode as a string" instruction and returned
    // the object directly inside the payload field — must still work.
    const { client } = scriptedClient([JSON.stringify({ payload: recursiveValue })]);
    const result = await structuredCall<RecursiveComposition>({
      client,
      prompt: 'compose it',
      schema: { type: 'object' },
      validate: validateComposition,
    });
    expect(result).toEqual(recursiveValue);
  });
});

describe('wireSchemaFor / parseTolerant', () => {
  it('wireSchemaFor produces the flat { payload: string } envelope with the description filled in', () => {
    const schema = wireSchemaFor('a Widget object');
    expect(schema).toEqual({
      type: 'object',
      properties: {
        payload: { type: 'string', description: 'JSON-encoded a Widget object' },
      },
      required: ['payload'],
      additionalProperties: false,
    });
  });

  it('parseTolerant passes an object straight through', () => {
    expect(parseTolerant({ a: 1 })).toEqual({ a: 1 });
  });

  it('parseTolerant JSON.parses a string', () => {
    expect(parseTolerant('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseTolerant returns undefined for unparseable or blank input', () => {
    expect(parseTolerant('not json')).toBeUndefined();
    expect(parseTolerant('   ')).toBeUndefined();
    expect(parseTolerant(42)).toBeUndefined();
    expect(parseTolerant(undefined)).toBeUndefined();
  });
});
