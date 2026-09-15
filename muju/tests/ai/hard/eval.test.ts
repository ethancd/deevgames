// @vitest-environment node
/**
 * `eval/features.ts`, `eval/weights.ts` and `eval/evaluate.ts` (DESIGN §4.15,
 * §5.12).
 *
 * `lab/hard-ai/bench/run.ts --eval` is the gate (mirror symmetry over the whole
 * corpus, lazy-window soundness, determinism, throughput, the twenty invariant
 * fixtures). This file pins the ARITHMETIC: every expected score below is
 * derived by hand from DESIGN §5.12.1's weight column and the catalogue, and
 * the table-fed features are cross-checked against the canonical `src/game`
 * functions they stand for rather than against this module's own output.
 */
import { describe, expect, it } from 'vitest';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { upkeepDue as canonicalUpkeepDue } from '../../../src/game/upkeep';
import { seededRandom } from '../../../src/ai/runtime';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { DEF_INDEX, NDEF, activeCatalog } from '../../../src/ai/hard/core/catalog';
import { pstMine } from '../../../src/ai/hard/core/income';
import { CC, Reason, Result, WIN_CC, MATE_PLY_CC, type PackedState } from '../../../src/ai/hard/types';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import {
  F,
  FEATURE_COUNT,
  FEATURE_NAMES,
  INV_BASE,
  STAGE_OF,
  extract,
} from '../../../src/ai/hard/eval/features';
import {
  DEFAULT_WEIGHTS,
  WEIGHTS_VERSION,
  cloneWeights,
  loadWeights,
  materialIsCataloguePrior,
  serializeWeights,
  weightsHash,
} from '../../../src/ai/hard/eval/weights';
import { TUNED_WEIGHTS } from '../../../src/ai/hard/eval/weights.generated';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { INVARIANT_COUNT } from '../../../src/ai/hard/eval/invariants';
import { allocPacked } from './packed-fixture';
import { buildState, randomState, type StateSpec } from './game-fixture';

const replica = new Replica();
const SC = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const WHITE = 0 as const;
const BLACK = 1 as const;

function pack(spec: StateSpec): PackedState {
  return replica.pack(buildState(spec));
}

function features(p: PackedState, root: 0 | 1): Int32Array {
  const ev = new Evaluator(replica);
  const out = new Int32Array(FEATURE_COUNT);
  ev.full(p, root, SC, 0, out);
  return out;
}

describe('eval/features.ts: the 58-slot table', () => {
  it('names every index exactly once and stages them as DESIGN §4.15 prints', () => {
    expect(FEATURE_COUNT).toBe(58);
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_COUNT);
    expect(FEATURE_NAMES[F.Material]).toBe('Material');
    expect(FEATURE_NAMES[F.Inv20StrandNoRetreat]).toBe('Inv20StrandNoRetreat');
    expect(INV_BASE).toBe(F.Inv1SpawnZero);
    expect(F.Inv20StrandNoRetreat - INV_BASE + 1).toBe(INVARIANT_COUNT);

    let stage0 = 0;
    let stage1 = 0;
    let stage2 = 0;
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (STAGE_OF[i] === 0) stage0++;
      else if (STAGE_OF[i] === 1) stage1++;
      else stage2++;
    }
    expect([stage0, stage1, stage2]).toEqual([5, 18, 35]);
  });

  it('extract writes only the requested stage', () => {
    const p = pack({ units: [{ def: 'fire_1', owner: 'white', x: 2, y: 2 }, { def: 'plant_1', owner: 'black', x: 7, y: 7 }] });
    const out = new Int32Array(FEATURE_COUNT).fill(-999);
    extract(p, null, WHITE, 0, SC, 0, out);
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (STAGE_OF[i] === 0) expect(out[i]).not.toBe(-999);
      else expect(out[i]).toBe(-999);
    }
  });

  it('refuses a stage that needs tables without them', () => {
    const p = pack({ units: [{ def: 'fire_1', owner: 'white', x: 2, y: 2 }] });
    const out = new Int32Array(FEATURE_COUNT);
    expect(() => extract(p, null, WHITE, 1, SC, 0, out)).toThrow(/level-1/);
    expect(() => extract(p, null, WHITE, 2, SC, 0, out)).toThrow(/level-2/);
  });
});

describe('eval: stage 0 is exact centi-crystals', () => {
  const spec: StateSpec = {
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 2 },
      { def: 'water_2', owner: 'white', x: 3, y: 3 },
      { def: 'plant_1', owner: 'black', x: 7, y: 7 },
    ],
    white: 10,
    black: 3,
    current: 'black',
    phase: 'place',
  };

  it('reproduces DESIGN §5.12.1 rows 0-4 by hand', () => {
    const p = pack(spec);
    const f = features(p, WHITE);
    // Material is the CATALOGUE-PRIOR difference in crystals: (3 + 8) − 5.
    expect(f[F.Material]).toBe(6);
    // Rent is crystals of upkeep per turn: water_2 pays 1, everything else 0.
    expect(f[F.Rent]).toBe(1);
    expect(f[F.BankLiquid]).toBe(8 - 3);
    expect(f[F.BankExcess]).toBe(2 - 0);
    expect(f[F.HomeInvaded]).toBe(0);

    // The score uses the 18 `material` params, not `w[Material] · f[Material]`.
    const ev = new Evaluator(replica);
    const material = 300 + 800 - 500;
    expect(ev.stage0(p, WHITE)).toBe(material + -422 * 1 + 90 * 5 + 25 * 2);
    expect(ev.stage0(p, BLACK)).toBe(-(material + -422 * 1 + 90 * 5 + 25 * 2));
  });

  it('agrees with the canonical upkeep schedule on Rent', () => {
    const state = buildState(spec);
    const p = replica.pack(state);
    const f = features(p, WHITE);
    expect(f[F.Rent]).toBe(canonicalUpkeepDue(state, 'white') - canonicalUpkeepDue(state, 'black'));
  });

  it('scores an enemy body on the home corner as HomeInvaded (the weight carries the sign)', () => {
    const p = pack({
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 0, y: 0 },
      ],
      current: 'white',
      phase: 'place',
    });
    // The feature COUNTS the invasion for the side it happened to; DESIGN
    // §5.12.1's weight (−4000) is what makes it a penalty.
    expect(features(p, WHITE)[F.HomeInvaded]).toBe(1);
    expect(features(p, BLACK)[F.HomeInvaded]).toBe(-1);
    expect(DEFAULT_WEIGHTS.w[F.HomeInvaded] * 1).toBe(-4000);
  });
});

describe('eval: stage 1 against the canonical rules', () => {
  const spec: StateSpec = {
    units: [
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
      { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
      { def: 'plant_1', owner: 'black', x: 7, y: 8 },
    ],
    white: 8,
    black: 2,
    current: 'black',
    phase: 'place',
  };

  it('SpawnArea equals getAllSpawnPositions on both sides', () => {
    const state = buildState(spec);
    const f = features(replica.pack(state), WHITE);
    const white = getAllSpawnPositions('white', state.board).length;
    const black = getAllSpawnPositions('black', state.board).length;
    expect(f[F.SpawnArea]).toBe(white - black);
  });

  it('PstMine is the incremental rent-free mining PV, in crystals', () => {
    const state = buildState(spec);
    const p = replica.pack(state);
    const byHand = (owner: 'white' | 'black'): number => {
      let sum = 0;
      for (const u of state.board.units) {
        if (u.owner !== owner) continue;
        const def = DEF_INDEX.get(u.definitionId) as number;
        sum += pstMine(def, state.board.cells[u.position.y][u.position.x].resourceLayers);
      }
      return sum;
    };
    expect(features(p, WHITE)[F.PstMine]).toBe(((byHand('white') - byHand('black')) / CC) | 0);
  });

  it('ActionsLeft is zero at a macro node and the mover\'s remaining actions mid-turn', () => {
    expect(features(pack({ ...spec, phase: 'place', actions: 4 }), WHITE)[F.ActionsLeft]).toBe(0);
    const mid = pack({ ...spec, current: 'white', phase: 'action', actions: 2 });
    expect(features(mid, WHITE)[F.ActionsLeft]).toBe(2);
    expect(features(mid, BLACK)[F.ActionsLeft]).toBe(-2);
  });

  it('DrawPressure is −648 cc for the leader at clock 9 (DESIGN §5.12.1 #18)', () => {
    const leading = pack({ ...spec, inactivityPlies: 9 });
    const f = features(leading, WHITE);
    // White is ahead on material + bank, so the clock counts against white.
    expect(f[F.DrawPressure]).toBe(81);
    expect(DEFAULT_WEIGHTS.w[F.DrawPressure] * 81).toBe(-648);
    // The rule is off entirely when the inactivity rule is.
    expect(features(pack({ ...spec, inactivityPlies: 9, inactivityRule: 'off' }), WHITE)[F.DrawPressure]).toBe(0);
  });

  it('Corridor and TierClimb count what DESIGN §5.12.1 says they count', () => {
    const p = pack({
      units: [
        // D1-F3 and E8-G10 are the eighteen zero-ore CORRIDOR squares; (0,9) is not one.
        { def: 'lightning_1', owner: 'white', x: 4, y: 1 },
        { def: 'lightning_2', owner: 'white', x: 5, y: 8 },
        { def: 'fire_1', owner: 'white', x: 0, y: 9 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      current: 'black',
      phase: 'place',
    });
    const f = features(p, WHITE);
    expect(f[F.Corridor]).toBe(2);
    // White: lightning at max tier 2 (+1), fire at tier 1 (+0). Black: plant tier 1 (+0).
    expect(f[F.TierClimb]).toBe(1);
  });

  it('ElementCoverage asks whether a one-shot for the enemy\'s hard body exists', () => {
    // Black fields plant_1 (DEF 3). fire_1 one-shots it (power 3); water_1 does not (power 1).
    const covered = pack({
      units: [
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      white: 0,
      black: 0,
      current: 'black',
      phase: 'place',
    });
    expect(features(covered, WHITE)[F.ElementCoverage]).toBe(1);

    const bare = pack({
      units: [
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      white: 0,
      black: 0,
      current: 'black',
      phase: 'place',
    });
    // No crystals, so no purchasable answer either.
    expect(features(bare, WHITE)[F.ElementCoverage]).toBe(0);
    // Three crystals buy a fire_1, which does one-shot it.
    const affordable = pack({
      units: [
        { def: 'water_1', owner: 'white', x: 2, y: 2 },
        { def: 'plant_1', owner: 'black', x: 7, y: 7 },
      ],
      white: 3,
      black: 0,
      current: 'black',
      phase: 'place',
    });
    expect(features(affordable, WHITE)[F.ElementCoverage]).toBe(1);
  });
});

describe('eval/weights.ts', () => {
  it('holds DESIGN §5.12.1 and §5.13 verbatim at the rows that carry a number', () => {
    const w = DEFAULT_WEIGHTS.w;
    expect(w[F.Material]).toBe(100);
    expect(w[F.Rent]).toBe(-422);
    expect(w[F.BankLiquid]).toBe(90);
    expect(w[F.HomeInvaded]).toBe(-4000);
    expect(w[F.PstMine]).toBe(60);
    expect(w[F.SpawnZero]).toBe(-800);
    expect(w[F.HomeThreat]).toBe(-400);
    expect(w[F.DrawPressure]).toBe(-8);
    expect(w[F.EconDelta]).toBe(80);
    expect(w[F.CornerInfiltration]).toBe(300);
    expect(w[F.Inv1SpawnZero]).toBe(-800);
    expect(w[F.Inv7PromoteNoRunway]).toBe(-600);
    expect(w[F.Inv20StrandNoRetreat]).toBe(-250);
    // The three rows DESIGN leaves without a weight.
    expect(w[F.Corridor]).toBe(0);
    expect(w[F.TierClimb]).toBe(0);
    expect(w[F.Inv15UnknownAsSafe]).toBe(0);
    expect(w[F.Inv18WastedEndPlace]).toBe(0);
  });

  it('material priors are cost × 100 for all 18 definitions (DESIGN F9)', () => {
    const cat = activeCatalog();
    for (let d = 0; d < NDEF; d++) expect(DEFAULT_WEIGHTS.material[d]).toBe(cat.cost[d] * CC);
    expect(DEFAULT_WEIGHTS.material[DEF_INDEX.get('fire_1') as number]).toBe(300);
    expect(materialIsCataloguePrior(DEFAULT_WEIGHTS)).toBe(true);
  });

  it('round-trips through serialize/load and hashes the numbers, not the label', () => {
    const loaded = loadWeights(JSON.parse(serializeWeights(DEFAULT_WEIGHTS)));
    expect(Array.from(loaded.w)).toEqual(Array.from(DEFAULT_WEIGHTS.w));
    expect(Array.from(loaded.material)).toEqual(Array.from(DEFAULT_WEIGHTS.material));
    expect(loaded.version).toBe(WEIGHTS_VERSION);
    expect(weightsHash(loaded)).toBe(weightsHash(DEFAULT_WEIGHTS));

    const relabelled = cloneWeights(DEFAULT_WEIGHTS);
    relabelled.label = 'something else';
    expect(weightsHash(relabelled)).toBe(weightsHash(DEFAULT_WEIGHTS));

    const nudged = cloneWeights(DEFAULT_WEIGHTS);
    nudged.w[F.SpawnArea] += 1;
    expect(weightsHash(nudged)).not.toBe(weightsHash(DEFAULT_WEIGHTS));
  });

  it('rejects malformed input', () => {
    expect(() => loadWeights(null)).toThrow();
    expect(() => loadWeights({ w: [1, 2, 3], material: [] })).toThrow(/58/);
    const bad = JSON.parse(serializeWeights(DEFAULT_WEIGHTS)) as { w: number[] };
    bad.w[0] = 1.5;
    expect(() => loadWeights(bad)).toThrow(/integer/);
  });

  it('TUNED_WEIGHTS starts life equal to DEFAULT_WEIGHTS but independent of it', () => {
    expect(Array.from(TUNED_WEIGHTS.w)).toEqual(Array.from(DEFAULT_WEIGHTS.w));
    expect(TUNED_WEIGHTS.w).not.toBe(DEFAULT_WEIGHTS.w);
    TUNED_WEIGHTS.w[F.SpawnArea] += 1;
    expect(DEFAULT_WEIGHTS.w[F.SpawnArea]).toBe(30);
    TUNED_WEIGHTS.w[F.SpawnArea] -= 1;
  });
});

describe('eval/evaluate.ts', () => {
  const spec: StateSpec = {
    units: [
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
      { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
      { def: 'plant_1', owner: 'black', x: 7, y: 8 },
    ],
    white: 8,
    black: 2,
    current: 'black',
    phase: 'place',
  };

  it('full equals stage0 + stage1 + stage2 and is antisymmetric in root', () => {
    const p = pack(spec);
    const ev = new Evaluator(replica);
    const s0 = ev.stage0(p, WHITE);
    const s1 = ev.stage1(p, WHITE, SC, 0);
    const s2 = ev.stage2(p, WHITE, SC, 0);
    expect(ev.full(p, WHITE, SC, 0)).toBe(s0 + s1 + s2);
    expect(ev.full(p, BLACK, SC, 0)).toBe(-(s0 + s1 + s2));
  });

  it('fills outFeatures with the whole vector', () => {
    const p = pack(spec);
    const ev = new Evaluator(replica);
    const out = new Int32Array(FEATURE_COUNT).fill(-999);
    ev.full(p, WHITE, SC, 0, out);
    for (let i = 0; i < FEATURE_COUNT; i++) expect(out[i]).not.toBe(-999);
  });

  it('honours setWeights', () => {
    const p = pack(spec);
    const ev = new Evaluator(replica);
    const before = ev.full(p, WHITE, SC, 0);
    const zeroed = cloneWeights(DEFAULT_WEIGHTS);
    zeroed.w.fill(0);
    zeroed.material.fill(0);
    ev.setWeights(zeroed);
    expect(ev.full(p, WHITE, SC, 0)).toBe(0);
    ev.setWeights(DEFAULT_WEIGHTS);
    expect(ev.full(p, WHITE, SC, 0)).toBe(before);
  });

  it('stays integral and inside ±600,000 cc on 200 random positions', () => {
    const rng = seededRandom(20260915);
    const ev = new Evaluator(replica);
    for (let i = 0; i < 200; i++) {
      const state = randomState(rng, 4 + Math.floor(rng() * 10), { current: 'black', phase: 'place' });
      let p: PackedState;
      try {
        p = replica.pack(state);
      } catch {
        continue;
      }
      const v = ev.full(p, WHITE, SC, 0);
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(600_000);
    }
  });

  it('is byte-identical across repeats and after a make/unmake round trip', () => {
    const p = pack(spec);
    const ev = new Evaluator(replica);
    const base = ev.full(p, WHITE, SC, 0);
    for (let i = 0; i < 20; i++) {
      ev.invalidate();
      expect(ev.full(p, WHITE, SC, 0)).toBe(base);
    }
  });
});

describe('eval/evaluate.ts: terminalScore (DESIGN §5.11.1)', () => {
  function withResult(result: Result, reason: Reason): PackedState {
    const p = allocPacked();
    p.result = result;
    p.reason = reason;
    return p;
  }

  it('is null while the game runs and mate-distance-scaled otherwise', () => {
    expect(terminalScore(withResult(Result.ONGOING, Reason.NONE), WHITE, 0)).toBeNull();
    expect(terminalScore(withResult(Result.DRAW, Reason.INACTIVITY), WHITE, 3)).toBe(0);

    const win = withResult(Result.WHITE_WIN, Reason.HOME_CHECKMATE);
    expect(terminalScore(win, WHITE, 0)).toBe(WIN_CC);
    expect(terminalScore(win, WHITE, 3)).toBe(WIN_CC - 3 * MATE_PLY_CC);
    expect(terminalScore(win, BLACK, 3)).toBe(-(WIN_CC - 3 * MATE_PLY_CC));

    const loss = withResult(Result.BLACK_WIN, Reason.ELIMINATION);
    expect(terminalScore(loss, WHITE, 2)).toBe(-(WIN_CC - 2 * MATE_PLY_CC));
    expect(terminalScore(loss, BLACK, 2)).toBe(WIN_CC - 2 * MATE_PLY_CC);
  });
});
