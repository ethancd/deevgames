// @vitest-environment node
/**
 * `src/ai/hard/gen/upkeep.ts` (DESIGN §5.10).
 *
 * The keep-set generator is a REPLICA of `upkeepActions` (`upkeep.ts:34-55`),
 * so the load-bearing tests are DIFFERENTIAL: the candidate SET this module
 * produces is compared entry for entry against the canonical engine's own on
 * hand-built positions and on a random sweep, in both the exact (≤ 12
 * rent-bearing bodies) and greedy (> 12) branches. The ranking — the one place
 * §5.10 is richer than `Replica.genKeepSets` — is pinned separately.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildState, randomState, type UnitSpec } from './game-fixture';
import { upkeepActions } from '../../../src/game/upkeep';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { KEEP_SET_CAPACITY, keepSetHas, newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { MAX_RENT_UNITS, genKeepSets } from '../../../src/ai/hard/gen/upkeep';
import { CORNER } from '../../../src/ai/hard/core/tables';
import { DEAD, MAX_SLOTS, type PackedState } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 0.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const rep = new Replica();
const sc = new Scratch(4, 8, 4, 4);
const tables: NodeTables = allocTables();
const cat = activeCatalog();

function prepare(state: GameState): { p: PackedState; t: NodeTables } {
  const p = rep.pack(state, allocState());
  p.proverMode = 2;
  buildTables(p, sc, 0, 2, tables);
  return { p, t: tables };
}

/** Every keep set in `out`, as a sorted list of canonical unit ids. */
function setsOf(p: PackedState, out: KeepSetTable, n: number): string[][] {
  const sets: string[][] = [];
  for (let i = 0; i < n; i++) {
    const ids: string[] = [];
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD) continue;
      if (keepSetHas(out, i, slot)) ids.push(p.originIds[slot]);
    }
    sets.push(ids.sort());
  }
  return sets;
}

/** `upkeepActions`'s own sets, in the same normalised shape. */
function canonicalSets(state: GameState): string[][] {
  return upkeepActions(state).map(a => {
    if (a.type !== 'PAY_UPKEEP') throw new Error('upkeepActions emitted a non-PAY_UPKEEP action');
    return [...a.keepUnitIds].sort();
  });
}

function keyOf(ids: readonly string[]): string {
  return ids.join('|');
}

function upkeepState(units: UnitSpec[], white: number): GameState {
  return buildState({
    units: [...units, { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' }],
    white,
    black: 6,
    current: 'white',
    phase: 'place',
    upkeepPending: true,
    turnNumber: 9,
  });
}

/**
 * §5.10's `RANK_RESCUER` clause dominates every other term, so once the ranked
 * list drops a rescuer-keeping set it can never pick one up again: the sets that
 * keep `rescuer` are a prefix of the emitted list.
 */
function expectRescuerPrefix(out: KeepSetTable, n: number, rescuer: number): void {
  let dropped = false;
  for (let i = 0; i < n; i++) {
    if (keepSetHas(out, i, rescuer)) expect(dropped).toBe(false);
    else dropped = true;
  }
}

describe('gen/upkeep.ts genKeepSets (DESIGN §5.10)', () => {
  const out = newKeepSetTable();

  it('returns 0 when no upkeep is pending', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_2', owner: 'white', x: 4, y: 4, id: 'w-hono' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 6,
        current: 'white',
        phase: 'place',
      }),
    );
    expect(genKeepSets(p, t, out)).toBe(0);
  });

  it('reproduces `upkeepActions` exactly on the exact-enumeration branch', () => {
    const state = upkeepState(
      [
        { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'w-tier1' },
        { def: 'fire_2', owner: 'white', x: 1, y: 0, id: 'w-hono' },
        { def: 'water_2', owner: 'white', x: 2, y: 0, id: 'w-straumr' },
        { def: 'plant_3', owner: 'white', x: 3, y: 0, id: 'w-sachakuna' },
      ],
      3,
    );
    const { p, t } = prepare(state);
    const n = genKeepSets(p, t, out);
    const mine = setsOf(p, out, n).map(keyOf).sort();
    const theirs = canonicalSets(state).map(keyOf).sort();
    expect(mine).toEqual(theirs);
  });

  it('keeps every rent-free (tier-1) body in every set, as `isUpkeepSelectionLegal` demands', () => {
    const state = upkeepState(
      [
        { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'w-t1a' },
        { def: 'plant_1', owner: 'white', x: 1, y: 0, id: 'w-t1b' },
        { def: 'fire_2', owner: 'white', x: 2, y: 0, id: 'w-hono' },
      ],
      1,
    );
    const { p, t } = prepare(state);
    const n = genKeepSets(p, t, out);
    expect(n).toBeGreaterThan(0);
    for (const ids of setsOf(p, out, n)) {
      expect(ids).toContain('w-t1a');
      expect(ids).toContain('w-t1b');
    }
  });

  it('every emitted set is a legal PAY_UPKEEP selection', () => {
    const state = upkeepState(
      [
        { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'w-t1' },
        { def: 'fire_2', owner: 'white', x: 1, y: 0, id: 'w-hono' },
        { def: 'water_3', owner: 'white', x: 2, y: 0, id: 'w-aegirinn' },
      ],
      2,
    );
    const { p, t } = prepare(state);
    const n = genKeepSets(p, t, out);
    for (let i = 0; i < n; i++) {
      let due = 0;
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        if (p.sq[slot] === DEAD || p.owner[slot] !== 0) continue;
        const kept = keepSetHas(out, i, slot);
        if (cat.upkeep[p.defId[slot]] === 0) expect(kept).toBe(true);
        if (kept) due += cat.upkeep[p.defId[slot]];
      }
      expect(due).toBeLessThanOrEqual(p.bank[0]);
    }
  });

  it('falls back to the empty set plus four greedy orderings above 12 rent-bearing bodies', () => {
    const units: UnitSpec[] = [];
    for (let i = 0; i < MAX_RENT_UNITS + 1; i++) {
      units.push({ def: i % 2 === 0 ? 'fire_2' : 'water_2', owner: 'white', x: i % 10, y: Math.floor(i / 10), id: `w-${i}` });
    }
    const state = upkeepState(units, 5);
    const { p, t } = prepare(state);
    const n = genKeepSets(p, t, out);
    expect(n).toBe(5);
    const mine = setsOf(p, out, n).map(keyOf).sort();
    const theirs = canonicalSets(state).map(keyOf).sort();
    expect(mine).toEqual(theirs);
  });

  it('agrees with `upkeepActions` on a random sweep, capped at 64 sets', () => {
    let seed = 0x13571357;
    const rng = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    let compared = 0;
    let capped = 0;
    for (let i = 0; i < 120; i++) {
      const state = randomState(rng, 6 + Math.floor(rng() * 12), {
        current: 'white',
        phase: 'place',
        upkeepPending: true,
        white: Math.floor(rng() * 14),
        turnNumber: 9,
      });
      // `upkeepActions` and the replica both need at least one owned body.
      if (!state.board.units.some(u => u.owner === 'white')) continue;
      const { p, t } = prepare(state);
      const n = genKeepSets(p, t, out);
      const theirs = canonicalSets(state);
      if (theirs.length > KEEP_SET_CAPACITY) {
        // The ranked cap bit: every emitted set must still be one of theirs.
        capped++;
        expect(n).toBe(KEEP_SET_CAPACITY);
        const theirKeys = new Set(theirs.map(keyOf));
        for (const ids of setsOf(p, out, n)) expect(theirKeys.has(keyOf(ids))).toBe(true);
      } else {
        expect(setsOf(p, out, n).map(keyOf).sort()).toEqual(theirs.map(keyOf).sort());
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(50);
    expect(capped).toBeGreaterThan(0);
  });

  it('ranks the rescuer next to my corner above a richer body further away', () => {
    // Two rent-bearing bodies, only one affordable: the rescuer on B1 (adjacent
    // to A1) must be the one the top-ranked set keeps.
    const units: UnitSpec[] = [];
    // Ten rent-1 bodies plus the rescuer and a far, richer body: twelve
    // rent-bearing units (the exact-enumeration branch) whose affordable
    // subsets run past the 64-set cap, so the §5.10 ranking is what chooses.
    for (let i = 0; i < 10; i++) {
      units.push({ def: 'fire_2', owner: 'white', x: i, y: 3, id: `w-filler-${i}` });
    }
    units.push({ def: 'water_2', owner: 'white', x: 1, y: 0, id: 'w-rescuer' });
    units.push({ def: 'water_3', owner: 'white', x: 9, y: 0, id: 'w-rich' });
    const state = upkeepState(units, 12);
    const { p, t } = prepare(state);
    const n = genKeepSets(p, t, out);
    expect(n).toBe(KEEP_SET_CAPACITY);
    // The rescuer sits on a corner neighbour of White's own corner.
    const rescuer = p.originIds.findIndex(id => id === 'w-rescuer');
    expect(rescuer).toBeGreaterThanOrEqual(0);
    const neighbours = [CORNER[0] + 1, CORNER[0] + 10];
    expect(neighbours).toContain(p.sq[rescuer]);
    // The ORDER is the contract, not mere presence: `RANK_RESCUER` dominates
    // every other clause, so the best-ranked set keeps the rescuer and the
    // rescuer-keeping sets are a PREFIX of the emitted list.
    expect(keepSetHas(out, 0, rescuer)).toBe(true);
    expectRescuerPrefix(out, n, rescuer);
  });

  it('ranks below the 64-set cap too: set 0 keeps the corner rescuer', () => {
    // Four rent-bearing bodies — eight affordable subsets, far under
    // `KEEP_SET_CAPACITY` — so nothing is truncated and the emitted ORDER is
    // the only thing §5.10's ranking can be read off. `gen/generate.ts` takes a
    // prefix of this list at interior nodes, so entry 0 must be the best set
    // here exactly as it is above the cap.
    const units: UnitSpec[] = [
      { def: 'fire_2', owner: 'white', x: 4, y: 3, id: 'w-filler-0' },
      { def: 'fire_2', owner: 'white', x: 5, y: 3, id: 'w-filler-1' },
      { def: 'water_2', owner: 'white', x: 1, y: 0, id: 'w-rescuer' },
      { def: 'water_3', owner: 'white', x: 9, y: 0, id: 'w-rich' },
    ];
    // Rent 1 + 1 + 1 + 2 = 5 against a bank of 2: keeping everything is
    // unaffordable, so the ranking has to choose.
    const { p, t } = prepare(upkeepState(units, 2));
    const n = genKeepSets(p, t, out);
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(KEEP_SET_CAPACITY);
    const rescuer = p.originIds.findIndex(id => id === 'w-rescuer');
    const rich = p.originIds.findIndex(id => id === 'w-rich');
    expect(rescuer).toBeGreaterThanOrEqual(0);
    expect(rich).toBeGreaterThanOrEqual(0);
    expect([CORNER[0] + 1, CORNER[0] + 10]).toContain(p.sq[rescuer]);
    expect(keepSetHas(out, 0, rescuer)).toBe(true);
    expectRescuerPrefix(out, n, rescuer);
    // The richer body alone never outranks the rescuer.
    for (let i = 0; i < n; i++) {
      if (keepSetHas(out, i, rich) && !keepSetHas(out, i, rescuer)) {
        expect(keepSetHas(out, 0, rescuer)).toBe(true);
        expect(i).toBeGreaterThan(0);
      }
    }
  });

  it('never emits more than KEEP_SET_CAPACITY sets', () => {
    const units: UnitSpec[] = [];
    for (let i = 0; i < MAX_RENT_UNITS; i++) units.push({ def: 'fire_2', owner: 'white', x: i % 10, y: Math.floor(i / 10), id: `w-${i}` });
    const { p, t } = prepare(upkeepState(units, MAX_RENT_UNITS));
    const n = genKeepSets(p, t, out);
    expect(n).toBeLessThanOrEqual(KEEP_SET_CAPACITY);
  });
});
