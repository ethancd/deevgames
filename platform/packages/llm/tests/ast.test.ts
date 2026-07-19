import { describe, expect, it } from 'vitest';
import { defineCatalog } from '../src/ast.ts';
import type { Composition } from '../src/ast.ts';

function buildTestCatalog() {
  return defineCatalog({
    name: 'test-game',
    atoms: {
      draw: {
        doc: 'Draws one or more cards for a player.',
        params: {
          type: 'object',
          properties: { target: { type: 'string', enum: ['self', 'opponent'] }, count: { type: 'number' } },
          required: ['target'],
        },
      },
      discard: {
        doc: 'Discards cards matching a selector; pairs well with `draw`.',
        params: {
          type: 'object',
          properties: { count: { type: 'number' } },
          required: [],
        },
      },
    },
    semanticRules: [
      {
        name: 'no-empty-body-seq',
        check(composition: Composition): string | null {
          const body = composition.body as { seq?: unknown[] };
          if ('seq' in body && Array.isArray(body.seq) && body.seq.length === 0) {
            return 'a seq step must not be empty';
          }
          return null;
        },
      },
    ],
  });
}

describe('defineCatalog — validateShape', () => {
  it('accepts a well-formed composition', () => {
    const catalog = buildTestCatalog();
    const result = catalog.validateShape({
      trigger: 'onPlay',
      body: { atom: 'draw', params: { target: 'self', count: 1 } },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an unknown atom name', () => {
    const catalog = buildTestCatalog();
    const result = catalog.validateShape({
      trigger: 'onPlay',
      body: { atom: 'summonDragon', params: {} },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown atom') && e.includes('summonDragon'))).toBe(true);
  });

  it('rejects bad params against the atom\'s own param schema', () => {
    const catalog = buildTestCatalog();
    const result = catalog.validateShape({
      trigger: 'onPlay',
      // target must be 'self'|'opponent' and is required — omitted and wrong type both.
      body: { atom: 'draw', params: { count: 'not-a-number' } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required property "target"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('count') && e.includes('expected type "number"'))).toBe(true);
  });

  it('validates seq and if steps recursively', () => {
    const catalog = buildTestCatalog();
    const good = catalog.validateShape({
      trigger: 'onTurnStart',
      body: {
        seq: [
          { atom: 'draw', params: { target: 'self' } },
          { if: { cond: {}, then: [{ atom: 'discard', params: {} }] } },
        ],
      },
    });
    expect(good.ok).toBe(true);

    const bad = catalog.validateShape({
      trigger: 'onTurnStart',
      body: { seq: [{ atom: 'nope', params: {} }] },
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects a non-object composition', () => {
    const catalog = buildTestCatalog();
    expect(catalog.validateShape(null).ok).toBe(false);
    expect(catalog.validateShape('not an object').ok).toBe(false);
  });
});

describe('defineCatalog — validateSemantics', () => {
  it('runs semantic rules and collects violation messages', () => {
    const catalog = buildTestCatalog();
    const violating: Composition = { trigger: 'onPlay', body: { seq: [] } };
    const errors = catalog.validateSemantics(violating);
    expect(errors).toEqual(['no-empty-body-seq: a seq step must not be empty']);
  });

  it('returns no errors when every rule passes', () => {
    const catalog = buildTestCatalog();
    const fine: Composition = { trigger: 'onPlay', body: { atom: 'draw' } };
    expect(catalog.validateSemantics(fine)).toEqual([]);
  });
});

describe('defineCatalog — catalogDriftCheck', () => {
  it('reports no drift for a well-formed catalog', () => {
    const catalog = buildTestCatalog();
    expect(catalog.catalogDriftCheck()).toEqual([]);
  });

  it('catches a doc pointing at a renamed/removed atom via a stale backtick reference', () => {
    const catalog = defineCatalog({
      name: 'desynced-game',
      atoms: {
        draw: {
          doc: 'Draws cards. See also the sibling atom `discardAll`, which does not exist here.',
          params: { type: 'object' },
        },
      },
    });
    const errors = catalog.catalogDriftCheck();
    expect(errors.some((e) => e.includes('discardAll') && e.includes('not a known atom'))).toBe(true);
  });
});

describe('defineCatalog — wireSchema', () => {
  it('is a non-recursive JSON-string envelope: no $ref/$defs, stringifies without cycles', () => {
    const catalog = buildTestCatalog();
    const schema = catalog.wireSchema();

    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('$ref');
    expect(serialized).not.toContain('$defs');

    const parsedBack = JSON.parse(serialized) as {
      type: string;
      properties: { composition: { type: string; description: string } };
      required: string[];
    };
    expect(parsedBack.type).toBe('object');
    expect(parsedBack.properties.composition.type).toBe('string');
    expect(parsedBack.required).toEqual(['composition']);
    expect(parsedBack.properties.composition.description).toContain('draw');
    expect(parsedBack.properties.composition.description).toContain('discard');
  });
});
