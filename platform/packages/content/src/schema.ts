// Schema-first content definitions: a zod schema, its canonical fixtures, and
// optional cross-fixture "seam" assertions (the MMS packages/schema pattern —
// see fixtures.test.ts there — generalized into a reusable helper instead of
// a bespoke describe() block per content package).
//
// The core idea, lifted directly from might-and-magic-spire: fixtures are not
// just examples, they are the drift test. Every fixture must validate against
// the schema, and any fixture that references another fixture by id (a
// "seam" — e.g. card.sourceId === creature.id) gets an explicit assertion so
// that drift between two fixtures (one edited, one not) is caught immediately
// instead of silently rotting.

import type { ZodType } from 'zod';

/** A cross-fixture wiring assertion. `check` throws (with a descriptive
 * message) when the seam is violated; it receives the full fixture array so
 * it can compare fixtures against one another. */
export interface Seam<T> {
  name: string;
  check(fixtures: T[]): void;
}

export interface ContentDef<T> {
  name: string;
  // Input/Def left free rather than tied to T — see the identical note in
  // registry.ts's LoadRegistryOptions. Matters here too: a schema with
  // `.default()` on any field would otherwise force T's inferred shape back
  // to the pre-default input type wherever fixtures/seams reference T.
  schema: ZodType<T, any, any>;
  fixtures: T[];
  seams?: Array<Seam<T>>;
}

export interface Content<T> {
  name: string;
  schema: ZodType<T, any, any>;
  fixtures: T[];
  /** Parse arbitrary input against the schema, throwing a contextual error
   * (content name + zod issue paths/messages) on failure. */
  parse(raw: unknown): T;
  /** Validate every fixture against the schema and run every seam check.
   * Returns a list of human-readable issue strings; empty means healthy.
   * Never throws — schema failures and seam-check throws are both collected,
   * not propagated, so this is safe to call from a test assertion. */
  fixtureIssues(): string[];
}

function describeZodIssues(name: string, error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  return error.issues
    .map((issue) => `${name}: ${issue.path.length > 0 ? issue.path.join('.') : '<root>'}: ${issue.message}`)
    .join('; ');
}

export function defineContent<T>(def: ContentDef<T>): Content<T> {
  const { name, schema, fixtures, seams = [] } = def;

  return {
    name,
    schema,
    fixtures,

    parse(raw: unknown): T {
      const result = schema.safeParse(raw);
      if (!result.success) {
        throw new Error(`defineContent(${JSON.stringify(name)}).parse failed — ${describeZodIssues(name, result.error)}`);
      }
      return result.data;
    },

    fixtureIssues(): string[] {
      const issues: string[] = [];

      fixtures.forEach((fixture, index) => {
        const result = schema.safeParse(fixture);
        if (!result.success) {
          for (const issue of result.error.issues) {
            const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
            issues.push(`${name}: fixture[${index}] failed schema validation at ${path}: ${issue.message}`);
          }
        }
      });

      for (const seam of seams) {
        try {
          seam.check(fixtures);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          issues.push(`${name}: seam "${seam.name}" violated — ${detail}`);
        }
      }

      return issues;
    },
  };
}

/**
 * Vitest-agnostic drift-test helper: callers invoke this inside their own
 * describe()/it() and assert the result is an empty array, e.g.:
 *
 *   describe('creature content', () => {
 *     it('fixtures match schema and seams hold', () => {
 *       expect(fixtureDriftTest(creatureContent)).toEqual([]);
 *     });
 *   });
 *
 * Kept as a plain function (no vitest import) so it works in any test runner.
 */
export function fixtureDriftTest<T>(content: Content<T>): string[] {
  return content.fixtureIssues();
}
