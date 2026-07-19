// makeJudge: documented SUGAR over structuredCall. Deliberately NOT a second
// call pipeline — an LLM-as-judge is just a structured call whose schema is
// a string enum and whose validate() checks membership. Reusing
// structuredCall means judges get the same JSON-string transport, the same
// tolerant parse, and the same retry-with-feedback loop as every other
// structured call in this package for free, with zero drift risk between
// two independently-maintained request paths.

import type { LlmClient } from './client.ts';
import { structuredCall } from './structured.ts';

export interface MakeJudgeParams<T extends string> {
  client: LlmClient;
  /** The judging instruction/rubric; the subject being judged is appended
   * at call time (see the returned function). */
  instruction: string;
  options: readonly T[];
  /** Number of retries after the first attempt (passed through to
   * structuredCall; same default of 2). */
  retries?: number;
  maxTokens?: number;
}

/**
 * Returns a function `(subject) => Promise<T>` — call it once per thing you
 * want judged. `T` is narrowed to the caller's own enum-of-strings type, but
 * validity is checked at runtime against `options` regardless of what the
 * model actually returns.
 */
export function makeJudge<T extends string>(params: MakeJudgeParams<T>): (subject: string) => Promise<T> {
  const { client, instruction, options, retries, maxTokens } = params;
  const schema = { type: 'string', enum: [...options] } as const;

  return (subject: string): Promise<T> =>
    structuredCall<T>({
      client,
      prompt: `${instruction}\n\nSubject to judge:\n${subject}\n\nRespond with exactly one of: ${options.join(', ')}.`,
      schema,
      retries,
      maxTokens,
      validate(value) {
        if (typeof value === 'string' && (options as readonly string[]).includes(value)) {
          return { ok: true, value: value as T };
        }
        return {
          ok: false,
          errors: [`expected one of ${options.join(', ')}, got ${JSON.stringify(value)}`],
        };
      },
    });
}
