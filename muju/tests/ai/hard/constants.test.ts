// @vitest-environment node
/**
 * R13 constants-agreement test (DESIGN §7.8). Pins the canonical engine's
 * constants that `src/ai/hard/**` will assume once it exists. Only the parts
 * checkable from M1's own deliverables are covered here; the catalog.power
 * (`calculateAttackPower` agreement) and `PST_MINE`/`CORNER`/`CORNER_NEIGHBOURS`
 * checks depend on `src/ai/hard/core/{catalog,tables}.ts`, which land at M4 —
 * see `docs/hard-ai/design/DEVIATIONS.md` under M1.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ACTIONS_PER_TURN, isActionsPerTurn, MAX_BLACK_CRYSTAL_HANDICAP } from '../../../src/game/rules';
import { INITIAL_MAP_RESOURCES, MAX_RESOURCE_RESERVE } from '../../../src/game/resourceMap';
import { UPKEEP_BY_TIER } from '../../../src/game/upkeep';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING } from '../../../src/game/inactivity';
import {
  INACTIVITY_LIMIT as REPLICA_INACTIVITY_LIMIT,
  INACTIVITY_WARNING as REPLICA_INACTIVITY_WARNING,
  MAX_CLOCK,
} from '../../../src/ai/hard/core/state';
import { UNIT_DEFINITIONS } from '../../../src/game/units';
import { ACTIONS as LAB_SOLVER_ACTIONS } from '../../../lab/solver/model';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('R13 constants agreement (canonical engine)', () => {
  it('ACTIONS === 4 (rules.ts)', () => {
    expect(DEFAULT_ACTIONS_PER_TURN).toBe(4);
    expect(isActionsPerTurn(4)).toBe(true);
    expect(isActionsPerTurn(3)).toBe(false);
    expect(isActionsPerTurn(5)).toBe(false);
  });

  it('INITIAL_MAP_RESOURCES === 504', () => {
    expect(INITIAL_MAP_RESOURCES).toBe(504);
  });

  it('MAX_RESOURCE_RESERVE === 16', () => {
    expect(MAX_RESOURCE_RESERVE).toBe(16);
  });

  it('UPKEEP_BY_TIER = {1:0,2:1,3:2} for tiers 1-3', () => {
    expect(UPKEEP_BY_TIER[1]).toBe(0);
    expect(UPKEEP_BY_TIER[2]).toBe(1);
    expect(UPKEEP_BY_TIER[3]).toBe(2);
  });

  // `muju-phasing-2`, preregistration amendment A4 (2026-09-19): the inactivity
  // draw limit moved from 10 plies to 20, and the in-game warning kept its
  // three-ply margin, 7 -> 17. This is the pin the whole change hangs off.
  it('INACTIVITY_LIMIT === 20, INACTIVITY_WARNING === 17', () => {
    expect(INACTIVITY_LIMIT).toBe(20);
    expect(INACTIVITY_WARNING).toBe(17);
  });

  it('the warning keeps its three-ply margin below the draw', () => {
    expect(INACTIVITY_LIMIT - INACTIVITY_WARNING).toBe(3);
  });

  // The Hard replica carries a PACKED copy of the rules; the one thing it must
  // never do is carry a second copy of THIS number. `core/state.ts` re-exports
  // the canonical constants rather than restating them, and these assertions
  // fail the moment someone forks them apart again.
  it('the Hard replica re-exports the canonical limit rather than restating it', () => {
    expect(REPLICA_INACTIVITY_LIMIT).toBe(INACTIVITY_LIMIT);
    expect(REPLICA_INACTIVITY_WARNING).toBe(INACTIVITY_WARNING);
    expect(MAX_CLOCK).toBe(INACTIVITY_LIMIT);
  });

  it('tier-1 prices are [3,3,4,4,5,5] in catalogue order', () => {
    const tier1Prices = UNIT_DEFINITIONS.filter(d => d.tier === 1).map(d => d.cost);
    expect(tier1Prices).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it('PROOF_NODES === 20000 (homeCheckmate.ts, private constant read by source text)', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'src/game/homeCheckmate.ts'), 'utf8');
    const match = source.match(/const PROOF_NODES\s*=\s*(\d+)/);
    expect(match, 'PROOF_NODES declaration not found in homeCheckmate.ts').not.toBeNull();
    expect(Number(match![1])).toBe(20000);
  });

  it('MAX_BLACK_CRYSTAL_HANDICAP === 20', () => {
    expect(MAX_BLACK_CRYSTAL_HANDICAP).toBe(20);
  });

  it('lab/solver/model.ts ACTIONS === 4', () => {
    expect(LAB_SOLVER_ACTIONS).toBe(4);
  });
});
