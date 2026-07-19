// JSON-shaped content registry loader: validates a raw item array against a
// schema, checks id uniqueness and cross-reference wiring, and reports every
// data problem as a warning rather than dropping it silently or throwing.
//
// Philosophy (contrasts deliberately with schema.ts's fixtureIssues, which is
// for *your own* canonical fixtures and is allowed to be strict): data coming
// from a registry is real, possibly-external content that a game should still
// be able to boot with, minus the bad records — so schema failures, duplicate
// ids, and dangling refs all land in `warnings` and the offending item is
// excluded from `items`, never thrown. Only a malformed *shape* (e.g. `items`
// not being an array at all) throws, since that's a programmer/integration
// error, not a data-quality one.

import type { ZodType } from 'zod';

export interface RefSpec<T> {
  /** Name for this reference, used in warning messages (e.g. "card.sourceId -> creature"). */
  name: string;
  /** Extract the ids this item refers to (may be empty). */
  from(item: T): string[];
  /** The universe of valid target ids: either a fixed set, or a function of
   * all successfully-loaded ids (so refs can point within the same registry). */
  toIds: Set<string> | ((allIds: Set<string>) => Set<string>);
}

export interface LoadRegistryOptions<T> {
  items: unknown[];
  // Input/Def left free (rather than tied to T) so T is inferred from the
  // schema's Output only — pinning Input to T as well (the default when you
  // write `ZodType<T>`) forces TS to unify T against the *pre-default,
  // pre-transform* input shape too, which silently widens/optionalizes T
  // whenever the schema uses `.default()`/`.transform()`. Bit us during
  // development with a `.default([])` field; worth documenting.
  schema: ZodType<T, any, any>;
  idOf(item: T): string;
  refs?: Array<RefSpec<T>>;
}

export interface RegistryResult<T> {
  items: T[];
  warnings: string[];
}

export function loadRegistry<T>(opts: LoadRegistryOptions<T>): RegistryResult<T> {
  const { items, schema, idOf, refs = [] } = opts;

  if (!Array.isArray(items)) {
    throw new TypeError('loadRegistry: `items` must be an array — this is a malformed-input-shape error, not a data-quality warning');
  }

  const warnings: string[] = [];
  const valid: T[] = [];
  const seenIds = new Set<string>();

  items.forEach((raw, index) => {
    const result = schema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '<root>'}: ${issue.message}`)
        .join('; ');
      warnings.push(`item[${index}]: schema validation failed — ${detail}`);
      return;
    }

    const item = result.data;
    const id = idOf(item);

    if (seenIds.has(id)) {
      warnings.push(`item[${index}]: duplicate id "${id}" — first occurrence kept, this one dropped`);
      return;
    }

    seenIds.add(id);
    valid.push(item);
  });

  const allIds = new Set(valid.map(idOf));

  for (const ref of refs) {
    const toIds = typeof ref.toIds === 'function' ? ref.toIds(allIds) : ref.toIds;

    for (const item of valid) {
      const fromId = idOf(item);
      for (const target of ref.from(item)) {
        if (!toIds.has(target)) {
          warnings.push(`dangling ref "${ref.name}": ${fromId} -> "${target}" (no matching id)`);
        }
      }
    }
  }

  return { items: valid, warnings };
}
