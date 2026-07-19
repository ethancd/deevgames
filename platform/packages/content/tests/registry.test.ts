import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { loadRegistry } from '../src/registry.ts';

const Item = z.object({
  id: z.string(),
  name: z.string(),
  refsTo: z.array(z.string()).default([]),
});
type Item = z.infer<typeof Item>;

describe('loadRegistry', () => {
  it('loads good items while duplicate ids, dangling refs, and schema failures land in warnings', () => {
    const raw: unknown[] = [
      { id: 'a', name: 'Alpha', refsTo: ['b'] },
      { id: 'b', name: 'Bravo', refsTo: [] },
      { id: 'a', name: 'Alpha again', refsTo: [] }, // duplicate id
      { id: 'c', name: 'Charlie', refsTo: ['zzz'] }, // dangling ref
      { id: 'bad', name: 42 }, // schema failure: name must be a string
    ];

    const result = loadRegistry({
      items: raw,
      schema: Item,
      idOf: (item) => item.id,
      refs: [{ name: 'refsTo', from: (item) => item.refsTo, toIds: (allIds) => allIds }],
    });

    // good items load, in order, first-occurrence-wins for the duplicate id
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);

    expect(result.warnings.some((w) => w.includes('duplicate id "a"'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('dangling ref') && w.includes('"zzz"'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('schema validation failed'))).toBe(true);

    // never silently lost: one warning per problem, not one blanket "there were errors"
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('supports a fixed Set of valid target ids for refs (not just "all loaded ids")', () => {
    const raw: unknown[] = [{ id: 'a', name: 'Alpha', refsTo: ['known'] }];
    const result = loadRegistry({
      items: raw,
      schema: Item,
      idOf: (item) => item.id,
      refs: [{ name: 'refsTo', from: (item) => item.refsTo, toIds: new Set(['known']) }],
    });

    expect(result.items).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('throws on a malformed input shape (items not an array) rather than warning', () => {
    expect(() =>
      loadRegistry({
        items: 'not-an-array' as unknown as unknown[],
        schema: Item,
        idOf: (item) => item.id,
      }),
    ).toThrow();
  });

  it('loads cleanly with no refs configured', () => {
    const result = loadRegistry({
      items: [{ id: 'a', name: 'Alpha' }],
      schema: Item,
      idOf: (item) => item.id,
    });
    expect(result.items).toEqual([{ id: 'a', name: 'Alpha', refsTo: [] }]);
    expect(result.warnings).toEqual([]);
  });
});
