/**
 * MILESTONES M18's `tests/lab/texel.test.ts`: the tuning instrument's own
 * tests (DESIGN §5.15).
 *
 * Nothing here runs a search or reads a replay. The fit is exercised on a
 * SYNTHETIC corpus whose generating parameters are known, so "the fit works"
 * is a statement about recovery rather than about a number nobody can check;
 * the leakage and holdout rules are exercised against the committed opening
 * pools.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mulberry32 } from '../../lab/harness/rng';
import { FEATURE_COUNT, F } from '../../src/ai/hard/eval/features';
import { NDEF } from '../../src/ai/hard/core/catalog';
import {
  ROW_SCHEMA,
  assertNotInSrc,
  loadRefusalRules,
  refusalFor,
  scoreOf,
  splitOpenings,
  type TexelRow,
  type WeightVector,
} from '../../lab/hard-ai/tune/rows';
import { FIRE_1, FIRE_1_PIN, PARAM_COUNT, fit, freeParams, largestMoves, sigmoid, weightsOf } from '../../lab/hard-ai/tune/texel';
import { quietVerdict } from '../../lab/hard-ai/tune/corpus';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// --- the synthetic corpus --------------------------------------------------

/**
 * The planted model. `material[fire_1]` is the SCALE (pinned at 300 by DESIGN
 * §5.12, and the only thing that makes `k` and the parameter vector separately
 * identifiable), and one feature carries a known weight.
 */
const PLANTED_W = 500;
const PLANTED_FEATURE = F.BankLiquid;
const PLANTED_K = 1 / 400;

function plantedRow(id: string, opening: string, split: 'train' | 'heldout', fireDiff: number, featureValue: number, result: 1 | 0.5 | 0): TexelRow {
  const features = new Array<number>(FEATURE_COUNT).fill(0);
  features[PLANTED_FEATURE] = featureValue;
  const material = new Array<number>(NDEF).fill(0);
  material[FIRE_1] = fireDiff;
  return {
    schema: ROW_SCHEMA,
    id,
    result,
    side: 0,
    turn: 1,
    features,
    material,
    kpos: '0000000000000000',
    opening,
    pool: 'synthetic',
    handicap: 0,
    game: 'synthetic',
    run: 'synthetic',
    actions: 4,
    split,
  };
}

function syntheticCorpus(n: number, seed: number, split: 'train' | 'heldout', openingPrefix: string): TexelRow[] {
  const rng = mulberry32(seed);
  const rows: TexelRow[] = [];
  for (let i = 0; i < n; i++) {
    const fireDiff = Math.floor(rng() * 7) - 3;
    const featureValue = Math.floor(rng() * 17) - 8;
    const truth = FIRE_1_PIN * fireDiff + PLANTED_W * featureValue;
    const result: 1 | 0 = rng() < sigmoid(PLANTED_K * truth) ? 1 : 0;
    rows.push(plantedRow(`${openingPrefix}-${i}`, `${openingPrefix}-${i % 20}`, split, fireDiff, featureValue, result));
  }
  return rows;
}

function startWeights(): WeightVector {
  const w = new Array<number>(FEATURE_COUNT).fill(0);
  const material = new Array<number>(NDEF).fill(0);
  material[FIRE_1] = FIRE_1_PIN;
  return { w, material };
}

describe('texel fit on a planted corpus', () => {
  const train = syntheticCorpus(4000, 20260917, 'train', 'train');
  const heldout = syntheticCorpus(800, 20260918, 'heldout', 'held');
  const start = startWeights();
  // `--refit-k`. DESIGN §5.15 says "fit `k` first", and with `k` frozen at the
  // value the STARTING vector implies the pin on `material[fire_1]` no longer
  // fixes the scale: the sweep absorbs the scale error into the parameters
  // instead (measured below). Alternating the two recovers the planted model.
  const result = fit(train, heldout, start, { iterations: 20, steps: [100, 10, 1], refitK: true });
  const tuned = weightsOf(result.theta);

  it('recovers the planted weight within tolerance', () => {
    // The planted value is 500 cc; the fit starts at 0 and may only take
    // integer steps, so the tolerance is a band, not equality.
    expect(tuned.w[PLANTED_FEATURE]).toBeGreaterThan(0.6 * PLANTED_W);
    expect(tuned.w[PLANTED_FEATURE]).toBeLessThan(1.6 * PLANTED_W);
  });

  it('recovers k near the planted value', () => {
    expect(result.k).toBeGreaterThan(PLANTED_K / 3);
    expect(result.k).toBeLessThan(PLANTED_K * 3);
  });

  it('with k frozen at the starting vector, absorbs the scale error into the weights', () => {
    // Not a defect of the corpus: a statement about DESIGN §5.15's "fit `k`
    // first" when the starting vector is far from the fit. Held-out loss still
    // falls, so the gate expression would pass on a vector whose scale is wrong
    // by a factor of four.
    const frozen = fit(train, heldout, start, { iterations: 6, steps: [100, 10, 1], refitK: false });
    const frozenW = weightsOf(frozen.theta).w[PLANTED_FEATURE];
    expect(frozen.heldOutLossAfter).toBeLessThan(frozen.heldOutLossBefore);
    expect(frozenW).toBeGreaterThan(2 * PLANTED_W);
    expect(frozen.k).toBeLessThan(PLANTED_K / 3);
  });

  it('does not increase held-out log-loss', () => {
    expect(result.heldOutLossAfter).toBeLessThanOrEqual(result.heldOutLossBefore);
  });

  it('lowers training log-loss', () => {
    expect(result.trainLossAfter).toBeLessThan(result.trainLossBefore);
  });

  it('leaves every parameter an integer', () => {
    for (let i = 0; i < FEATURE_COUNT; i++) expect(Number.isInteger(tuned.w[i])).toBe(true);
    for (let d = 0; d < NDEF; d++) expect(Number.isInteger(tuned.material[d])).toBe(true);
  });

  it('keeps material[fire_1] pinned at 300', () => {
    expect(tuned.material[FIRE_1]).toBe(FIRE_1_PIN);
  });

  it('never moves a parameter whose column is identically zero', () => {
    // Only `fire_1` (pinned) and the planted feature carry any signal, so the
    // fit must leave the other 73 free parameters where it found them.
    for (let i = 1; i < FEATURE_COUNT; i++) {
      if (i === PLANTED_FEATURE) continue;
      expect(tuned.w[i]).toBe(0);
    }
    for (let d = 1; d < NDEF; d++) expect(tuned.material[d]).toBe(0);
  });

  it('reports the planted feature as the largest move', () => {
    const moves = largestMoves(start, tuned, 10);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0].kind).toBe('w');
    expect(moves[0].index).toBe(PLANTED_FEATURE);
  });

  it('leaves 74 of the 76 parameters free: w[Material] and material[fire_1] are pinned', () => {
    const free = freeParams();
    expect(PARAM_COUNT).toBe(FEATURE_COUNT + NDEF);
    expect(free).toHaveLength(PARAM_COUNT - 2);
    expect(free).not.toContain(F.Material);
    expect(free).not.toContain(FEATURE_COUNT + FIRE_1);
  });

  it('refuses a start vector whose material[fire_1] is not 300', () => {
    const bad = startWeights();
    bad.material[FIRE_1] = 301;
    expect(() => fit(train.slice(0, 10), heldout.slice(0, 10), bad, { iterations: 1, steps: [1], refitK: false })).toThrow(/fire_1/);
  });
});

describe('scoreOf', () => {
  it('skips w[F.Material] and scores material from the 18 counts', () => {
    const row = plantedRow('x', 'o', 'train', 2, 3, 1);
    row.features[F.Material] = 999;
    const weights: WeightVector = { w: new Array<number>(FEATURE_COUNT).fill(0), material: new Array<number>(NDEF).fill(0) };
    weights.w[F.Material] = 100;
    weights.w[PLANTED_FEATURE] = PLANTED_W;
    weights.material[FIRE_1] = FIRE_1_PIN;
    // 300 * 2 + 500 * 3 = 2100; the 999 in feature 0 contributes nothing.
    expect(scoreOf(row, weights)).toBe(2100);
  });
});

// --- the holdout split -----------------------------------------------------

describe('splitOpenings', () => {
  const ids = Array.from({ length: 100 }, (_, i) => `op-${i}`);

  it('puts no opening in both halves and loses none', () => {
    const split = splitOpenings(ids, 1);
    expect(new Set([...split.train, ...split.heldout]).size).toBe(ids.length);
    for (const id of split.heldout) expect(split.train).not.toContain(id);
    expect(split.train.length + split.heldout.length).toBe(ids.length);
  });

  it('holds out 20 % by default', () => {
    const split = splitOpenings(ids, 1);
    expect(split.heldout).toHaveLength(20);
    expect(split.train).toHaveLength(80);
  });

  it('is deterministic in the seed and changes with it', () => {
    expect(splitOpenings(ids, 1).heldout).toEqual(splitOpenings(ids, 1).heldout);
    expect(splitOpenings(ids, 2).heldout).not.toEqual(splitOpenings(ids, 1).heldout);
  });

  it('de-duplicates its input and sorts before shuffling, so discovery order cannot matter', () => {
    const shuffled = [...ids].reverse();
    expect(splitOpenings(shuffled, 7)).toEqual(splitOpenings([...ids, ...ids], 7));
  });

  it('never returns an empty half for two or more openings', () => {
    const split = splitOpenings(['a', 'b'], 3);
    expect(split.heldout).toHaveLength(1);
    expect(split.train).toHaveLength(1);
  });
});

// --- leakage ---------------------------------------------------------------

function poolIds(file: string): string[] {
  const text = fs.readFileSync(path.resolve(REPO_ROOT, 'lab/hard-ai/ladder/openings', file), 'utf8');
  return text
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => (JSON.parse(l) as { id: string }).id);
}

describe('leakage refusal', () => {
  const rules = loadRefusalRules(REPO_ROOT);

  it('finds both refused pools on disk', () => {
    expect(rules.missing).toEqual([]);
    expect(rules.pools).toEqual(['e1-sealed.jsonl', 'e2-val.jsonl']);
  });

  it('refuses every e1-sealed.jsonl opening', () => {
    for (const id of poolIds('e1-sealed.jsonl')) expect(refusalFor(id, null, rules)).toBe('id');
  });

  it('refuses every e2-val.jsonl opening', () => {
    for (const id of poolIds('e2-val.jsonl')) expect(refusalFor(id, null, rules)).not.toBeNull();
  });

  it('refuses a run drawn from a refused pool whatever its opening ids say', () => {
    expect(refusalFor('g3-s25', 'lab/hard-ai/ladder/openings/e1-sealed.jsonl', rules)).toBe('pool');
    expect(refusalFor('g3-s25', 'lab/hard-ai/ladder/openings/e2-val.jsonl', rules)).toBe('pool');
  });

  it('refuses an unknown e2- id by prefix', () => {
    expect(refusalFor('e2-g9-s999', null, rules)).toBe('prefix');
  });

  it('admits every development and E1/E2 validation opening', () => {
    // The point of the id SET: `e1-sealed.jsonl` shares the `e1-` prefix with
    // the development pool, so a prefix rule on `e1-` would refuse the one
    // stratum tuning may use (`lab/hard-ai/ladder/openings/ALLOCATION.md`).
    for (const file of ['e0-openings.jsonl', 'e1-dev.jsonl', 'e1-val.jsonl', 'e1-val2.jsonl', 'e1-baseline.jsonl']) {
      for (const id of poolIds(file)) {
        expect(refusalFor(id, `lab/hard-ai/ladder/openings/${file}`, rules)).toBeNull();
      }
    }
  });
});

describe('assertNotInSrc', () => {
  it('refuses an output directory inside src/', () => {
    expect(() => assertNotInSrc(path.resolve(REPO_ROOT, 'src/ai/hard/eval'), REPO_ROOT)).toThrow(/M20/);
  });

  it('allows lab/results', () => {
    expect(() => assertNotInSrc(path.resolve(REPO_ROOT, 'lab/results/hard-ai-e3/tune/texel'), REPO_ROOT)).not.toThrow();
  });
});

// --- the quiet rule --------------------------------------------------------

describe('quietVerdict', () => {
  const tables = (killMe: number, killThem: number, cornerMe: number, cornerThem: number) => ({
    killNow: [{ entry: [{ minActions: killMe }, { minActions: 255 }] }, { entry: [{ minActions: killThem }, { minActions: 255 }] }],
    home: [{ actionsToCorner: cornerMe }, { actionsToCorner: cornerThem }],
  });

  it('is quiet when no kill fits the action budget and neither corner is reachable in 4', () => {
    expect(quietVerdict({ actions: 4 } as never, tables(255, 255, 127, 127)).quiet).toBe(true);
  });

  it('is loud when either side can kill inside the budget', () => {
    expect(quietVerdict({ actions: 4 } as never, tables(4, 255, 127, 127)).quiet).toBe(false);
    expect(quietVerdict({ actions: 4 } as never, tables(255, 1, 127, 127)).quiet).toBe(false);
  });

  it('is loud when either corner is reachable in 4 actions or fewer', () => {
    expect(quietVerdict({ actions: 4 } as never, tables(255, 255, 4, 127)).quiet).toBe(false);
    expect(quietVerdict({ actions: 4 } as never, tables(255, 255, 127, 3)).quiet).toBe(false);
  });

  it('compares kills against the actions the node actually has left', () => {
    expect(quietVerdict({ actions: 1 } as never, tables(2, 255, 127, 127)).quiet).toBe(true);
    expect(quietVerdict({ actions: 4 } as never, tables(2, 255, 127, 127)).quiet).toBe(false);
  });
});
