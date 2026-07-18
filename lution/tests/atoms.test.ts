import { describe, it, expect } from 'vitest';
import {
  ATOM_JSON_SCHEMA,
  ATOM_NAMES,
  validateCompositionShape,
  validateCompositionSemantics,
  type AtomCall,
  type CardComposition,
  type Selector,
} from '../shared/atoms';

// --- small builders, kept local to this test file for readability ---

function selfSelector(): Selector {
  return { zone: 'inPlay', owner: 'self', pick: 'self' };
}

function baseComposition(overrides: Partial<CardComposition> = {}): CardComposition {
  return {
    cardType: 'keeper',
    baseValue: 1,
    effects: [],
    ...overrides,
  };
}

describe('validateCompositionShape', () => {
  it('accepts a minimal valid composition', () => {
    const result = validateCompositionShape(baseComposition());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toBeDefined();
  });

  it('accepts a richer, realistic composition', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onPlay',
          body: {
            type: 'seq',
            steps: [
              { atom: 'draw', target: 'self', count: { type: 'literal', value: 1 } },
              {
                atom: 'discard',
                selector: { zone: 'hand', owner: 'opponent', pick: 'chooser', chooser: 'opponent' },
              },
            ],
          },
        },
      ],
    });
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object input', () => {
    expect(validateCompositionShape(null).ok).toBe(false);
    expect(validateCompositionShape('nope').ok).toBe(false);
    expect(validateCompositionShape(42).ok).toBe(false);
  });

  it('rejects missing/invalid cardType', () => {
    const result = validateCompositionShape({ ...baseComposition(), cardType: 'weapon' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('cardType'))).toBe(true);
  });

  it('rejects missing baseValue', () => {
    const input = baseComposition() as unknown as Record<string, unknown>;
    delete input.baseValue;
    const result = validateCompositionShape(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('baseValue'))).toBe(true);
  });

  it('rejects non-array effects', () => {
    const result = validateCompositionShape({ ...baseComposition(), effects: 'nope' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('effects'))).toBe(true);
  });

  it('rejects an unknown atom discriminant', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onPlay', body: { atom: 'summonMeteor' } as unknown as AtomCall }],
    });
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('atom'))).toBe(true);
  });

  it('rejects pick:chooser with no chooser field', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'chooser' } },
        },
      ],
    });
    // Shape validation itself doesn't require `chooser` to be present (it's
    // an optional field structurally) -- that's a semantic rule. Confirm the
    // shape passes so we can distinguish it from the semantic failure below.
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(true);
  });

  it('rejects non-array steps in a seq', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onPlay', body: { type: 'seq', steps: 'nope' } as unknown as CardComposition['effects'][number]['body'] }],
    });
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('steps'))).toBe(true);
  });

  it('rejects an unknown trigger', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onFullMoon' as CardComposition['effects'][number]['trigger'], body: { atom: 'cancelDestroy' } }],
    });
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('trigger'))).toBe(true);
  });

  it('collects multiple errors in one pass rather than stopping at the first', () => {
    const composition = { cardType: 'weapon', baseValue: 'not-a-number', effects: 'nope' };
    const result = validateCompositionShape(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('accepts an omitted strategy field (the common case)', () => {
    const result = validateCompositionShape(baseComposition());
    expect(result.ok).toBe(true);
  });

  it('accepts a strategy override with both fields, or just one', () => {
    expect(validateCompositionShape(baseComposition({ strategy: { playValue: 1_000_000 } })).ok).toBe(true);
    expect(validateCompositionShape(baseComposition({ strategy: { stealTargetValue: 0 } })).ok).toBe(true);
    expect(
      validateCompositionShape(baseComposition({ strategy: { playValue: 5, stealTargetValue: 3 } })).ok
    ).toBe(true);
  });

  it('rejects a non-object strategy field', () => {
    const result = validateCompositionShape({ ...baseComposition(), strategy: 'huge' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('strategy'))).toBe(true);
  });

  it('rejects a non-finite strategy.playValue or strategy.stealTargetValue', () => {
    expect(validateCompositionShape(baseComposition({ strategy: { playValue: NaN } })).ok).toBe(false);
    expect(
      validateCompositionShape({ ...baseComposition(), strategy: { playValue: 'a lot' } }).ok
    ).toBe(false);
    expect(
      validateCompositionShape({ ...baseComposition(), strategy: { stealTargetValue: Infinity } }).ok
    ).toBe(false);
  });
});

describe('validateCompositionSemantics', () => {
  it('accepts a composition with no semantic issues', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onEnterPlay', body: { atom: 'grantImmunity', kind: 'freeze', target: 'self' } }],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(true);
  });

  it('flags an unknown byName cardId when knownCardIds is supplied', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onPlay',
          body: {
            atom: 'destroy',
            selector: {
              zone: 'inPlay',
              owner: 'opponent',
              pick: 'all',
              filter: { type: 'byName', cardId: 'does-not-exist' },
            },
          },
        },
      ],
    });
    const ok = validateCompositionSemantics(composition, { knownCardIds: new Set(['starter-humble-lemma']) });
    expect(ok.ok).toBe(false);
    expect(ok.errors.some((e) => e.includes('does-not-exist'))).toBe(true);

    const passes = validateCompositionSemantics(composition, { knownCardIds: new Set(['does-not-exist']) });
    expect(passes.ok).toBe(true);

    // No knownCardIds supplied at all -- byName is not checked (registry
    // -agnostic caller).
    const noCtx = validateCompositionSemantics(composition);
    expect(noCtx.ok).toBe(true);
  });

  it('rejects scoreDelta on an action card', () => {
    const composition = baseComposition({
      cardType: 'action',
      baseValue: 0,
      scoreDelta: { type: 'literal', value: 1 },
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('scoreDelta'))).toBe(true);
  });

  it('allows scoreDelta on a keeper', () => {
    const composition = baseComposition({ scoreDelta: { type: 'literal', value: 1 } });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('rejects grantImmunity under a trigger other than onEnterPlay', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onTurnStart', body: { atom: 'grantImmunity', kind: 'freeze', target: 'self' } }],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('grantImmunity'))).toBe(true);
  });

  it('rejects cancelDestroy under a trigger other than onBeforeDestroy', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onPlay', body: { atom: 'cancelDestroy' } }],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('cancelDestroy'))).toBe(true);
  });

  it('accepts cancelDestroy under onBeforeDestroy', () => {
    const composition = baseComposition({
      effects: [{ trigger: 'onBeforeDestroy', body: { atom: 'cancelDestroy' } }],
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('rejects the wrong zone for discard/destroy/freezeInHand/freezeInPlay/tutorAndPlay', () => {
    const cases: AtomCall[] = [
      { atom: 'discard', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all' } },
      { atom: 'destroy', selector: { zone: 'hand', owner: 'opponent', pick: 'all' } },
      { atom: 'freezeInHand', selector: { zone: 'inPlay', owner: 'self', pick: 'all' } },
      { atom: 'freezeInPlay', selector: { zone: 'hand', owner: 'self', pick: 'all' }, to: { type: 'literal', value: 1 } },
      { atom: 'tutorAndPlay', selector: { zone: 'hand', owner: 'self', pick: 'chooser', chooser: 'self' } },
    ];
    for (const body of cases) {
      const composition = baseComposition({ effects: [{ trigger: 'onPlay', body }] });
      const result = validateCompositionSemantics(composition);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('.zone'))).toBe(true);
    }
  });

  it('accepts setBaseValueOverride with pick:self and no inPlay zone requirement', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: { atom: 'setBaseValueOverride', selector: selfSelector(), value: { type: 'literal', value: 3 } },
        },
      ],
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('requires inPlay zone for setBaseValueOverride when pick is not self', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: {
            atom: 'setBaseValueOverride',
            selector: { zone: 'hand', owner: 'self', pick: 'all' },
            value: { type: 'literal', value: 3 },
          },
        },
      ],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
  });

  it('rejects tutorAndPlay with pick other than chooser/random', () => {
    const composition = baseComposition({
      effects: [
        { trigger: 'onPlay', body: { atom: 'tutorAndPlay', selector: { zone: 'drawPile', owner: 'self', pick: 'all' } } },
      ],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('tutorAndPlay'))).toBe(true);
  });

  it('requires chooser when pick is chooser/maxValue/minValue', () => {
    const picks: Array<Selector['pick']> = ['chooser', 'maxValue', 'minValue'];
    for (const pick of picks) {
      const composition = baseComposition({
        effects: [
          { trigger: 'onPlay', body: { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick } } },
        ],
      });
      const result = validateCompositionSemantics(composition);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('chooser'))).toBe(true);
    }
  });

  it('rejects a dangling boundCardValue with no matching freezeInHand bindAs', () => {
    const composition = baseComposition({ scoreDelta: { type: 'boundCardValue', bindAs: 'ghost' } });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('allows freezeInHand bindAs with no boundCardValue reader (bind-without-read is a no-op, not an error)', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'self', pick: 'all' }, bindAs: 'own' },
        },
      ],
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('accepts a matching bindAs/boundCardValue pair', () => {
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'self', pick: 'all' }, bindAs: 'own' },
        },
      ],
      scoreDelta: { type: 'boundCardValue', bindAs: 'own' },
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('rejects a count() selector that is not pick:all', () => {
    const composition = baseComposition({
      scoreDelta: { type: 'count', selector: { zone: 'inPlay', owner: 'any', pick: 'random' } },
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("pick:'all'"))).toBe(true);
  });

  it('rejects a composition exceeding the max step count', () => {
    // 45 sequential atoms (over the 40 cap).
    const steps: AtomCall[] = Array.from({ length: 45 }, () => ({ atom: 'cancelDestroy' }));
    const composition = baseComposition({
      effects: [{ trigger: 'onBeforeDestroy', body: { type: 'seq', steps } }],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('step count'))).toBe(true);
  });

  it('accepts a log atom using only the three known placeholders', () => {
    const composition = baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        { trigger: 'onPlay', body: { atom: 'log', message: "{owner}'s {card} finds {target}!" } },
      ],
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('accepts a log atom with no placeholders at all (pure flavor text)', () => {
    const composition = baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'log', message: 'The vault hums quietly.' } }],
    });
    expect(validateCompositionSemantics(composition).ok).toBe(true);
  });

  it('rejects a log atom message with an unknown placeholder ("keep templates honest")', () => {
    const composition = baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        { trigger: 'onPlay', body: { atom: 'log', message: 'On {date}, {owner} felt a chill.' } },
      ],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('{date}'))).toBe(true);
  });

  it('rejects a composition exceeding the max nesting depth', () => {
    // Build a deeply right-nested `not(not(not(...)))` filter, 10 levels deep.
    let filter: import('../shared/atoms').Filter = { type: 'excludeSelf' };
    for (let i = 0; i < 10; i++) {
      filter = { type: 'not', filter };
    }
    const composition = baseComposition({
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'all', filter } },
        },
      ],
    });
    const result = validateCompositionSemantics(composition);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('nesting depth'))).toBe(true);
  });
});

// --- Drift check: one representative composition per atom, exercising both
// validators AND a structural roundtrip against ATOM_JSON_SCHEMA. ---

describe('ATOM_JSON_SCHEMA drift check', () => {
  it('has exactly one oneOf branch per atom name, and no extras', () => {
    const branches = ATOM_JSON_SCHEMA.$defs.AtomCall.oneOf;
    const schemaAtomNames = branches.map((b) => b.properties.atom.const).sort();
    const catalogAtomNames = [...ATOM_NAMES].sort();
    expect(schemaAtomNames).toEqual(catalogAtomNames);
  });

  it('CardComposition schema requires the same top-level fields the shape validator does', () => {
    const schema = ATOM_JSON_SCHEMA.$defs.CardComposition;
    expect(schema.required).toEqual(expect.arrayContaining(['cardType', 'baseValue', 'effects']));
  });

  // One minimal, realistic composition per atom (16 total), lifted from the
  // real-module coverage map in the M1 plan's §3.
  const representativeCompositions: Record<(typeof ATOM_NAMES)[number], CardComposition> = {
    draw: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'draw', target: 'self', count: { type: 'literal', value: 1 } } }],
    }),
    discard: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'discard', selector: { zone: 'hand', owner: 'opponent', pick: 'chooser', chooser: 'opponent' } },
        },
      ],
    }),
    destroy: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'destroy', selector: { zone: 'inPlay', owner: 'opponent', pick: 'maxValue', chooser: 'opponent' } },
        },
      ],
    }),
    bounceToHand: baseComposition({
      effects: [{ trigger: 'onBeforeDestroy', body: { atom: 'bounceToHand' } }],
    }),
    changeController: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            atom: 'changeController',
            selector: { zone: 'inPlay', owner: 'self', pick: 'minValue', chooser: 'self' },
            to: 'opponent',
          },
        },
      ],
    }),
    freezeInPlay: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: {
            atom: 'freezeInPlay',
            selector: { zone: 'inPlay', owner: 'any', pick: 'all' },
            to: { type: 'literal', value: 1 },
          },
        },
      ],
    }),
    freezeInHand: baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: { atom: 'freezeInHand', selector: { zone: 'hand', owner: 'self', pick: 'chooser', chooser: 'self' }, bindAs: 'own' },
        },
      ],
      scoreDelta: { type: 'boundCardValue', bindAs: 'own' },
    }),
    grantImmunity: baseComposition({
      effects: [{ trigger: 'onEnterPlay', body: { atom: 'grantImmunity', kind: 'freeze', target: 'self' } }],
    }),
    setCounter: baseComposition({
      effects: [
        { trigger: 'onLeavePlay', body: { atom: 'setCounter', name: 'bonus', value: { type: 'literal', value: 0 } } },
      ],
      scoreDelta: { type: 'counter', name: 'bonus' },
    }),
    incrementCounter: baseComposition({
      effects: [{ trigger: 'onTurnStart', body: { atom: 'incrementCounter', name: 'bonus' } }],
      scoreDelta: { type: 'counter', name: 'bonus' },
    }),
    setBaseValueOverride: baseComposition({
      effects: [
        {
          trigger: 'onEnterPlay',
          body: { atom: 'setBaseValueOverride', selector: selfSelector(), value: { type: 'literal', value: 2 } },
        },
      ],
    }),
    cancelDestroy: baseComposition({
      effects: [{ trigger: 'onBeforeDestroy', body: { atom: 'cancelDestroy' } }],
    }),
    forceWin: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'forceWin', winner: 'self' } }],
    }),
    grantExtraTurn: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'grantExtraTurn', target: 'self' } }],
    }),
    skipNextDraw: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [{ trigger: 'onPlay', body: { atom: 'skipNextDraw', target: 'opponent' } }],
    }),
    tutorAndPlay: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'tutorAndPlay', selector: { zone: 'drawPile', owner: 'self', pick: 'chooser', chooser: 'self' } },
        },
      ],
    }),
    log: baseComposition({
      cardType: 'action',
      baseValue: 0,
      effects: [
        {
          trigger: 'onPlay',
          body: { atom: 'log', message: "{owner}'s {card} finds {target}." },
        },
      ],
    }),
  };

  it.each(ATOM_NAMES)('atom "%s" has a valid, representative composition', (atomName) => {
    const composition = representativeCompositions[atomName];
    expect(composition).toBeDefined();

    const shapeResult = validateCompositionShape(composition);
    expect(shapeResult.ok, `shape errors for ${atomName}: ${shapeResult.errors.join('; ')}`).toBe(true);

    const semanticResult = validateCompositionSemantics(composition);
    expect(semanticResult.ok, `semantic errors for ${atomName}: ${semanticResult.errors.join('; ')}`).toBe(true);

    // Structural roundtrip: the atom name used by this fixture must have a
    // matching branch in ATOM_JSON_SCHEMA.
    const schemaNames = new Set(ATOM_JSON_SCHEMA.$defs.AtomCall.oneOf.map((b) => b.properties.atom.const));
    expect(schemaNames.has(atomName)).toBe(true);
  });

  it('covers every atom in ATOM_NAMES with a fixture (no silent gaps)', () => {
    expect(Object.keys(representativeCompositions).sort()).toEqual([...ATOM_NAMES].sort());
  });
});
