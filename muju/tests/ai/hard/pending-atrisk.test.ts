// @vitest-environment node
/**
 * R4 (2026-09-21): `EvalFix.strength.pendingAtRiskShare16`, the share in
 * SIXTEENTHS of a pending summon's service present value that
 * `eval/pending.ts` credits when the commitment is flagged at risk.
 *
 * Absent — every shipped profile — means 0, which is the rule this file pins
 * first: an at-risk commitment is worth exactly its principal, so against an
 * opponent that can disrupt every summon a purchase carries no service value at
 * all. The knob is the measurable half of that diagnosis
 * (`hard@ablate:eval-atrisk-8` / `eval-atrisk-4`).
 */
import { describe, expect, it, vi } from 'vitest';
import { buildState, type StateSpec } from './game-fixture';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { newPendingDiagnostics, pendingDiagnostics } from '../../../src/ai/hard/eval/pending';
import { CC, type Side } from '../../../src/ai/hard/types';
import { DESKTOP, type EvalFix } from '../../../src/ai/hard/config';
import { activeCatalog, DEF_INDEX } from '../../../src/ai/hard/core/catalog';

vi.setConfig({ testTimeout: 10_000 });

const rep = new Replica();
const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const cat = activeCatalog();

/**
 * One White `plant_1` commitment on B2 over a 16-crystal cell (so its service
 * PV is nonzero) with a Black `plant_1` able to void the supporting rectangle —
 * the shape `tests/ai/hard/phasing-bootstrap.test.ts` uses for a risky
 * commitment, kept here so this file states its own fixture.
 */
const SQUARE = 11;
function spec(): StateSpec {
  const reserves = new Array<number>(100).fill(0);
  reserves[SQUARE] = 16;
  return {
    units: [
      { id: 'released', def: 'fire_2', owner: 'white', x: 6, y: 1 },
      { id: 'surviving-anchor', def: 'plant_1', owner: 'white', x: 1, y: 6 },
      { id: 'intruder', def: 'plant_1', owner: 'black', x: 3, y: 7 },
    ],
    pendingSummons: [{ id: 'paid', def: 'plant_1', owner: 'white', x: 1, y: 1 }],
    current: 'white',
    phase: 'action',
    actions: 4,
    white: 0,
    black: 0,
    reserves,
    victoryRule: 'elimination',
    inactivityRule: 'off',
  };
}

function valueAt(strength: EvalFix['strength']): { valueCc: number; risk: number; pv: number } {
  const p = rep.pack(buildState(spec()));
  const t = buildTables(p, sc, 0, 2, allocTables());
  if (strength !== undefined) t.evalFix = { strength };
  const d = pendingDiagnostics(p, t, sc, 0, newPendingDiagnostics());
  const side: Side = 0;
  return { valueCc: d.valueCc[side], risk: d.risk[side * 100 + SQUARE], pv: t.econ[side].pendingServicePVcc[SQUARE] };
}

describe('eval/pending.ts at-risk service credit (strength.pendingAtRiskShare16)', () => {
  it('credits nothing by default, and the knob is absent from every profile', () => {
    expect(DESKTOP.evalFix).toBeUndefined();
    const { valueCc, risk, pv } = valueAt(undefined);
    expect(risk).toBe(1);
    expect(pv).toBeGreaterThan(0);
    // Principal only: CC x the cost of the committed body.
    expect(valueCc).toBe(CC * cat.cost[DEF_INDEX.get('plant_1')!]);
  });

  it('an explicit share of 0 is the default, bit for bit', () => {
    expect(valueAt({ pendingAtRiskShare16: 0 }).valueCc).toBe(valueAt(undefined).valueCc);
  });

  it('credits the named sixteenths of the service PV, floored', () => {
    const base = valueAt(undefined);
    for (const share16 of [4, 8, 12, 16]) {
      const { valueCc } = valueAt({ pendingAtRiskShare16: share16 });
      expect(valueCc, `share ${share16}/16`).toBe(base.valueCc + ((base.pv * share16) >> 4));
    }
    // 16/16 is the whole service PV a commitment NOT at risk already gets,
    // TRUNCATED: the credit is `(pv * share) >> 4`, integer cc on every box,
    // while the un-risked branch adds the economy forecast's own fractional
    // value. The difference is the fraction of one centi-crystal.
    const full = valueAt({ pendingAtRiskShare16: 16 }).valueCc;
    expect(full).toBe(base.valueCc + Math.trunc(base.pv));
    expect(base.valueCc + base.pv - full).toBeLessThan(1);
    expect(valueAt({ pendingAtRiskShare16: 8 }).valueCc - base.valueCc).toBe(Math.trunc(base.pv * 8) >> 4);
  });

  it('leaves the risk flag itself alone: the knob prices the flag, it does not clear it', () => {
    expect(valueAt({ pendingAtRiskShare16: 8 }).risk).toBe(1);
    expect(valueAt({ pendingAtRiskShare16: 16 }).risk).toBe(1);
  });
});
