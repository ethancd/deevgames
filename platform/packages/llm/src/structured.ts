// structuredCall: the ONE call pipeline every structured LLM interaction in
// this package goes through (judge.ts is documented sugar over this, not a
// second pipeline — see its own comment).
//
// JSON-STRING TRANSPORT, generalized from lution/server/claude.ts +
// lution/shared/atoms.ts: the Anthropic structured-outputs API rejects
// recursive $defs ("Circular reference detected") and open
// (additionalProperties: true) objects. Any schema that's recursive (an AST,
// a tree, anything with a Step/Filter/ValueExpr-shaped self-reference) can
// therefore never travel as the literal wire schema. The fix used throughout
// Lution (designCard's `composition`, compileCard's `composition`) and
// generalized here: the WIRE schema is always the flat, non-recursive
// envelope `{ payload: string }` (see wireSchemaFor below); the actual
// target shape is only ever described to the model in PROSE (the caller's
// prompt + schema JSON dump), and the real gate is server-side validate().

import type { LlmClient } from './client.ts';

export interface StructuredCallParams<T> {
  client: LlmClient;
  prompt: string;
  system?: string;
  /** JSON Schema (subset) describing the payload's target shape — used only
   * to brief the model in the prompt; never sent as the literal wire schema
   * (see the module doc comment above). */
  schema: object;
  /** Optional transform applied to the tolerantly-parsed payload before
   * validate() sees it (e.g. filling defaults, renaming legacy fields). */
  decode?(raw: unknown): unknown;
  validate(value: unknown): { ok: true; value: T } | { ok: false; errors: string[] };
  /** Number of RETRIES after the first attempt. Total attempts = retries + 1. */
  retries?: number;
  maxTokens?: number;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_MAX_TOKENS = 16000;

/**
 * The non-recursive wire envelope every structured call sends as its
 * jsonSchema. `description` fills the "JSON-encoded <...>" blank so the
 * model knows what the string it emits must decode to.
 */
export function wireSchemaFor(description: string): object {
  return {
    type: 'object',
    properties: {
      payload: {
        type: 'string',
        description: `JSON-encoded ${description}`,
      },
    },
    required: ['payload'],
    additionalProperties: false,
  } as const;
}

/**
 * Tolerant decode for the payload channel: if the model already returned an
 * object (some models ignore "stringify this" instructions), pass it
 * through unchanged. If it returned a string, JSON.parse it. Anything else
 * (not a string, unparseable, blank) resolves to undefined rather than
 * throwing — an absent/garbage payload is a validation failure like any
 * other, driving the normal retry-with-feedback loop rather than a thrown
 * exception mid-attempt. Mirrors lution/server/claude.ts's
 * parseCompositionString exactly (the framework this generalizes).
 */
export function parseTolerant(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseEnvelope(text: string): { ok: true; payload: unknown } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `response was not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof obj !== 'object' || obj === null || !('payload' in (obj as Record<string, unknown>))) {
    return { ok: false, error: 'response JSON is missing a "payload" field' };
  }
  return { ok: true, payload: (obj as Record<string, unknown>).payload };
}

export async function structuredCall<T>(params: StructuredCallParams<T>): Promise<T> {
  const { client, prompt, system, schema, decode, validate, maxTokens } = params;
  const retries = params.retries ?? DEFAULT_RETRIES;
  const wireSchema = wireSchemaFor(
    `value matching this JSON Schema (a single JSON value, stringified): ${JSON.stringify(schema)}`
  );
  const basePrompt = `${prompt}\n\nRespond with a single JSON object of the form {"payload": "<the JSON-encoded value described above, as a string>"} and nothing else.`;

  let errors: string[] = [];

  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptPrompt =
      errors.length > 0 ? `${basePrompt}\n\nPrevious attempt failed validation: ${errors.join('; ')}` : basePrompt;

    const response = await client.complete({
      system,
      prompt: attemptPrompt,
      maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      jsonSchema: wireSchema,
    });

    const envelope = parseEnvelope(response.text);
    if (!envelope.ok) {
      errors = [envelope.error];
      continue;
    }

    const parsedPayload = parseTolerant(envelope.payload);
    const decoded = decode ? decode(parsedPayload) : parsedPayload;
    const result = validate(decoded);
    if (result.ok) return result.value;
    errors = result.errors;
  }

  throw new Error(`structuredCall: exhausted ${retries + 1} attempt(s). Last errors: ${errors.join('; ')}`);
}
