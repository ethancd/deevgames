// @vitest-environment node
/**
 * `tables/home.ts` (DESIGN §4.12, §5.8, §5.10; SU §4.4, addendum 20b).
 *
 * Focused unit tests pinning `homeSafety`, `minTurnsToCorner` and
 * `homeRaceAvailable`'s semantics against hand-verified crafted positions,
 * plus a light-weight reproduction of the SU addendum 20b archived fixture
 * (`BUY lightning_1@G1 → J10`) from `lab/hard-ai/positions/authored.jsonl` —
 * the same fixture the M9 gate oracle (`lab/hard-ai/oracles/geometry.ts`)
 * checks at the `homeRaceOk` criterion.
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { spawnInfo } from '../../../src/ai/hard/core/spawn';
import { DEF_INDEX, activeCatalog, powerIndex } from '../../../src/ai/hard/core/catalog';
import { AKind, PA_NONE, paA, paB, paC, paKind } from '../../../src/ai/hard/core/action';
import { CORNER, CORNER_NEIGHBOURS } from '../../../src/ai/hard/core/tables';
import { Replica, newUndo } from '../../../src/ai/hard/core/state';
import { allocTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  HOME_NEVER,
  HOME_RACE_LINE_LEN,
  homeRaceAvailable,
  homeSafety,
  minTurnsToCorner,
  newHomeSafety,
} from '../../../src/ai/hard/tables/home';
import { findPosition, readPositions } from '../../../lab/hard-ai/positions/corpus';
import { buildState, type StateSpec } from './game-fixture';
import type { PackedState, Side } from '../../../src/ai/hard/types';

// E0.5 timeout budget: slowest test 0.3 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();

function level1(p: PackedState): NodeTables {
  const t = allocTables();
  for (let side = 0; side < 2; side++) spawnInfo(p, side as Side, t.spawn[side]);
  return t;
}

function sqOf(x: number, y: number): number {
  return y * 10 + x;
}

describe('tables/home.ts homeSafety', () => {
  it('actionsToCorner/turnsToCorner from a single existing enemy unit, no purchase threat', () => {
    // Black water_1 (speed 1) three squares from CORNER[white] = (0,0), on
    // an otherwise empty board so the BFS distance is the plain Manhattan
    // distance; black has no bank, so the purchase branch is empty.
    const state = buildState({ units: [{ def: 'water_1', owner: 'black', x: 3, y: 0 }] });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newHomeSafety();
    homeSafety(p, t, 0, out);
    expect(out.actionsToCorner).toBe(3);
    expect(out.turnsToCorner).toBe(1); // ceil(3/4)
    expect(out.buyThreat).toBe(0);
    expect(out.rescuers).toBe(0);
    expect(out.plug).toBe(0);
    expect(out.occupied).toBe(0);
  });

  it('HOME_NEVER when the enemy has neither a unit nor an affordable purchase', () => {
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 5, y: 5 }] });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newHomeSafety();
    homeSafety(p, t, 0, out);
    expect(out.actionsToCorner).toBe(HOME_NEVER);
    expect(out.turnsToCorner).toBe(HOME_NEVER);
    expect(out.buyThreat).toBe(0);
    expect(out.rescuers).toBe(0);
  });

  it('buyThreat: the purchase branch wins when it is faster than every existing unit', () => {
    // A black anchor at (1,0) opens the rectangle x in [1,9], y in [0,9], so
    // (2,0) — two squares from CORNER[white] = (0,0) — is a legal, empty
    // spawn square. With bank 3, black can afford lightning_1 (speed 3):
    // moveCost(2, spd 3) = 1 action. The only EXISTING black unit sits all
    // the way across the board (18 actions at speed 1), so the purchase
    // branch is strictly faster.
    const state = buildState({
      units: [
        { def: 'metal_1', owner: 'black', x: 1, y: 0 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ],
      black: 3,
    });
    const p = replica.pack(state);
    const t = level1(p);
    expect(t.spawn[1].legal[0] & (1 << sqOf(2, 0))).not.toBe(0); // (2,0) is legal for black
    const out = newHomeSafety();
    homeSafety(p, t, 0, out);
    expect(out.actionsToCorner).toBe(1);
    expect(out.buyThreat).toBe(1);
  });

  it('buyThreat: an existing unit that is faster than every affordable purchase wins instead', () => {
    // Same anchor and bank as above, but now an existing black lightning_1
    // (speed 3) sits one square from the corner: moveCost(1, spd 3) = 1,
    // tying the fastest purchase — ties favour the existing-unit branch
    // (`buyThreat = 1` only when the purchase branch is STRICTLY better or
    // ties it, per home.ts's `bestPurchase <= bestExisting`; make the
    // existing unit strictly faster here to pin the non-purchase case
    // unambiguously).
    const state = buildState({
      units: [
        { def: 'metal_1', owner: 'black', x: 1, y: 0 },
        { def: 'lightning_1', owner: 'black', x: 0, y: 1 }, // distance 1, spd 3 -> 1 action
      ],
      black: 3,
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newHomeSafety();
    homeSafety(p, t, 0, out);
    expect(out.actionsToCorner).toBe(1);
    expect(out.buyThreat).toBe(0);
  });

  it('rescuers counts own units on CORNER_NEIGHBOURS[side] with power > 0 against the nearest threat', () => {
    const [n0] = CORNER_NEIGHBOURS[0];
    const x = n0 % 10;
    const y = Math.floor(n0 / 10);
    // A lone black water_1 three squares out is the nearest threat. Only ONE
    // corner neighbour can ever hold a unit while the threat still has a
    // path in (a corner has exactly two neighbours; occupying BOTH — by
    // anyone — seals it and the threat's `actionsToCorner` reads HOME_NEVER
    // instead), so the two candidate rescuers are tested one at a time.
    // `cat.power`: fire_1 vs water_1 = 1 (qualifies); lightning_1 vs water_1
    // = 0 (does not) — asserted from the catalogue itself, not hard-coded.
    const cat = activeCatalog();
    const waterDef = DEF_INDEX.get('water_1') as number;
    const firePower = cat.power[powerIndex(0, DEF_INDEX.get('fire_1') as number, waterDef)];
    const lightningPower = cat.power[powerIndex(0, DEF_INDEX.get('lightning_1') as number, waterDef)];
    expect(firePower).toBeGreaterThan(0);
    expect(lightningPower).toBeLessThanOrEqual(0);

    const out = newHomeSafety();
    const qualifies = buildState({
      units: [
        { def: 'water_1', owner: 'black', x: 3, y: 0 },
        { def: 'fire_1', owner: 'white', x, y },
      ],
    });
    homeSafety(replica.pack(qualifies), level1(replica.pack(qualifies)), 0, out);
    expect(out.rescuers).toBe(1);

    const doesNotQualify = buildState({
      units: [
        { def: 'water_1', owner: 'black', x: 3, y: 0 },
        { def: 'lightning_1', owner: 'white', x, y },
      ],
    });
    homeSafety(replica.pack(doesNotQualify), level1(replica.pack(doesNotQualify)), 0, out);
    expect(out.rescuers).toBe(0);

    // No unit at all on the neighbours -> 0 rescuers, even with a threat.
    const empty = buildState({ units: [{ def: 'water_1', owner: 'black', x: 3, y: 0 }] });
    homeSafety(replica.pack(empty), level1(replica.pack(empty)), 0, out);
    expect(out.rescuers).toBe(0);

    // No threat at all -> 0 rescuers even with a unit on a neighbour (there
    // is nothing to be a rescuer against).
    const noThreat = buildState({ units: [{ def: 'fire_1', owner: 'white', x, y }] });
    homeSafety(replica.pack(noThreat), level1(replica.pack(noThreat)), 0, out);
    expect(out.rescuers).toBe(0);
  });

  it('plug and occupied reflect who (if anyone) sits on CORNER[side]', () => {
    const out = newHomeSafety();

    const empty = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 5, y: 5 }] });
    homeSafety(replica.pack(empty), level1(replica.pack(empty)), 0, out);
    expect([out.plug, out.occupied]).toEqual([0, 0]);

    const [cx, cy] = [CORNER[0] % 10, Math.floor(CORNER[0] / 10)];
    const plugged = buildState({ units: [{ def: 'plant_1', owner: 'white', x: cx, y: cy }] });
    homeSafety(replica.pack(plugged), level1(replica.pack(plugged)), 0, out);
    expect([out.plug, out.occupied]).toEqual([1, 0]);

    const occupied = buildState({ units: [{ def: 'plant_1', owner: 'black', x: cx, y: cy }] });
    homeSafety(replica.pack(occupied), level1(replica.pack(occupied)), 0, out);
    expect([out.plug, out.occupied]).toEqual([0, 1]);
  });

  it('a body standing on CORNER[side] makes both branches HOME_NEVER', () => {
    // A MOVE onto an occupied square is never legal, so a plugged corner is
    // unreachable for EVERY threat — existing unit or purchase alike. The
    // existing-unit branch inherits that for free (`bfsFrom` writes -1 on
    // occupied squares), the purchase branch does not (`bfsMulti` seeds its
    // sources at distance 0 regardless of occupancy), so it is the purchase
    // branch this pins.
    const out = newHomeSafety();

    // White anchor at (8,8) opens legal spawn squares three BFS steps from
    // CORNER[black] = (9,9); with bank 3 White can afford lightning_1
    // (speed 3), i.e. ONE action — except that Black's own plant_1 is
    // standing on (9,9).
    const plugged = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 8, y: 8 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 3,
    });
    const pPlug = replica.pack(plugged);
    homeSafety(pPlug, level1(pPlug), 1, out);
    expect(out.plug).toBe(1);
    expect(out.buyThreat).toBe(0);
    expect(out.actionsToCorner).toBe(HOME_NEVER);
    expect(out.turnsToCorner).toBe(HOME_NEVER);
    expect(minTurnsToCorner(pPlug, level1(pPlug), 0)).toBe(HOME_NEVER);

    // Same board with WHITE (the attacker itself) already on the corner: the
    // corner is equally un-enterable, and `occupied` is the field that says so.
    const held = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 8, y: 8 },
        { def: 'plant_1', owner: 'white', x: 9, y: 9 },
      ],
      white: 3,
    });
    const pHeld = replica.pack(held);
    homeSafety(pHeld, level1(pHeld), 1, out);
    expect(out.occupied).toBe(1);
    expect(out.actionsToCorner).toBe(HOME_NEVER);

    // Control: remove the plug and the same purchase threat is back at 1.
    const open = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 8, y: 8 }], white: 3 });
    const pOpen = replica.pack(open);
    homeSafety(pOpen, level1(pOpen), 1, out);
    expect(out.plug).toBe(0);
    expect(out.buyThreat).toBe(1);
    expect(out.actionsToCorner).toBe(1);
  });

  it('minTurnsToCorner(attacker) equals homeSafety(1 - attacker).turnsToCorner', () => {
    // attacker = BLACK racing CORNER[WHITE] = CORNER[1 - attacker].
    const state = buildState({ units: [{ def: 'lightning_1', owner: 'black', x: 6, y: 0 }] }); // dist 6, spd 3 -> 2 actions
    const p = replica.pack(state);
    const t = level1(p);
    const out = newHomeSafety();
    homeSafety(p, t, 0, out);
    expect(minTurnsToCorner(p, t, 1)).toBe(out.turnsToCorner);
    expect(minTurnsToCorner(p, t, 1)).toBe(1); // ceil(2/4)
  });
});

describe('tables/home.ts homeRaceAvailable', () => {
  const lightningDef = DEF_INDEX.get('lightning_1') as number;

  /**
   * Replays one `[BUY, END_PLACE, MOVE]` line through the canonical replica
   * exactly as the DESIGN §5.10 consumer does (`PA_NONE` words skipped), and
   * restores `p`. Returns the index of the first word `Replica.isLegal`
   * rejected, or -1 when the whole line applied.
   */
  function replayLine(p: PackedState, line: readonly number[]): number {
    const undo = newUndo();
    let applied = 0;
    let bad = -1;
    for (let w = 0; w < line.length; w++) {
      const a = line[w];
      if (a === PA_NONE) continue;
      if (!replica.isLegal(p, a)) {
        bad = w;
        break;
      }
      replica.make(p, a, undo);
      applied++;
    }
    for (let k = 0; k < applied; k++) replica.unmake(p, undo);
    return bad;
  }

  function lineAt(out: Int32Array, i: number): number[] {
    const base = i * HOME_RACE_LINE_LEN;
    return [out[base], out[base + 1], out[base + 2]];
  }

  it('BUY, END_PLACE, MOVE line: affordable tier-1 x legal spawn square reaching the enemy corner within budget', () => {
    // White anchor at (7,1) opens a rectangle that includes (6,0) = "G1";
    // BFS distance from (6,0) to CORNER[black] = (9,9) is 12, and lightning_1
    // (speed 3) costs ceil(12/3) = 4 actions — exactly the SU addendum 20b
    // shape, reproduced in miniature. White is in its PLACE phase: a BUY is
    // illegal anywhere else, so `homeRaceAvailable` reports nothing there.
    const state = buildState({
      units: [{ def: 'plant_1', owner: 'white', x: 7, y: 1 }],
      white: 3,
      phase: 'place',
      actions: 4,
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = new Int32Array(4 * HOME_RACE_LINE_LEN);
    const n = homeRaceAvailable(p, t, 0, out);
    expect(n).toBeGreaterThan(0);

    let found = false;
    for (let i = 0; i < n; i++) {
      const [buy, endPlace, move] = lineAt(out, i);
      expect(paKind(buy)).toBe(AKind.BUY);
      // Bank 3 buys the cheapest tier-1 outright, so nothing is affordable
      // afterwards and `finishPlacement` auto-advances the phase — the
      // explicit END_PLACE would be illegal and is elided to PA_NONE.
      expect(endPlace).toBe(PA_NONE);
      expect(paKind(move)).toBe(AKind.MOVE);
      expect(paB(move)).toBe(CORNER[1]);
      expect(paC(move)).toBeLessThanOrEqual(4);
      expect(replayLine(p, lineAt(out, i))).toBe(-1);
      if (paA(buy) === lightningDef && paB(buy) === sqOf(6, 0)) {
        found = true;
        expect(paC(move)).toBe(4);
      }
    }
    expect(found).toBe(true);
    // Every unused slot beyond the lines actually written is PA_NONE.
    for (let i = n * HOME_RACE_LINE_LEN; i < out.length; i++) expect(out[i]).toBe(PA_NONE);
  });

  it('keeps the explicit END_PLACE when the BUY leaves the Place phase alive', () => {
    // Bank 8: after a 3-crystal lightning_1 there are still 5 crystals and
    // spawn area left, so `canActInPlacePhase` stays true, `finishPlacement`
    // does NOT auto-advance, and the line needs its own END_PLACE to reach
    // the action phase.
    const state = buildState({
      units: [{ def: 'plant_1', owner: 'white', x: 7, y: 1 }],
      white: 8,
      phase: 'place',
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = new Int32Array(4 * HOME_RACE_LINE_LEN);
    const n = homeRaceAvailable(p, t, 0, out);
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect(paKind(out[i * HOME_RACE_LINE_LEN + 1])).toBe(AKind.END_PLACE);
      expect(replayLine(p, lineAt(out, i))).toBe(-1);
    }
  });

  it('returns 0 lines outside the Place phase, with upkeep pending, or for the side not to move', () => {
    const base: Pick<StateSpec, 'units' | 'white'> = {
      units: [{ def: 'plant_1', owner: 'white', x: 7, y: 1 }],
      white: 3,
    };
    const out = new Int32Array(4 * HOME_RACE_LINE_LEN);

    // Action phase: BUY is illegal (`isLegal` requires phase === 0).
    const acting = replica.pack(buildState({ ...base, phase: 'action' }));
    expect(homeRaceAvailable(acting, level1(acting), 0, out)).toBe(0);

    // Upkeep pending: `isLegal` answers only RESIGN.
    const owing = replica.pack(buildState({ ...base, phase: 'place', upkeepPending: true }));
    expect(homeRaceAvailable(owing, level1(owing), 0, out)).toBe(0);

    // Not the side to move: `make` would apply the BUY to `p.side` instead.
    const waiting = replica.pack(buildState({ ...base, phase: 'place', current: 'black' }));
    expect(homeRaceAvailable(waiting, level1(waiting), 0, out)).toBe(0);
  });

  it('returns 0 lines when the enemy corner is already occupied', () => {
    // The race is won by ENTERING the corner; a MOVE onto an occupied square
    // is never legal, whoever owns the occupant.
    const out = new Int32Array(4 * HOME_RACE_LINE_LEN);
    for (const owner of ['white', 'black'] as const) {
      const state = buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 7, y: 1 },
          { def: 'plant_1', owner, x: 9, y: 9 },
        ],
        white: 3,
        phase: 'place',
      });
      const p = replica.pack(state);
      expect(homeRaceAvailable(p, level1(p), 0, out)).toBe(0);
    }
  });

  it('returns 0 lines when nothing is affordable', () => {
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 7, y: 1 }], white: 0, phase: 'place' });
    const p = replica.pack(state);
    const t = level1(p);
    const out = new Int32Array(3 * HOME_RACE_LINE_LEN);
    expect(homeRaceAvailable(p, t, 0, out)).toBe(0);
    expect([...out].every(v => v === PA_NONE)).toBe(true);
  });

  it('returns 0 lines when nothing is reachable within the turn budget', () => {
    // A lone anchor at (1,1): every spawn square it opens is 17-18 BFS steps
    // from CORNER[black], and the fastest tier-1 (lightning_1, speed 3) needs
    // 6 actions to cross that — more than the 4 the action phase grants.
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 1, y: 1 }], white: 40, phase: 'place' });
    const p = replica.pack(state);
    const t = level1(p);
    const out = new Int32Array(3 * HOME_RACE_LINE_LEN);
    expect(homeRaceAvailable(p, t, 0, out)).toBe(0);
  });

  it('respects the output capacity (writes at most floor(out.length / 3) lines)', () => {
    const state = buildState({
      units: [{ def: 'plant_1', owner: 'white', x: 9, y: 1 }],
      white: 3,
      phase: 'place',
      actions: 4,
    });
    const p = replica.pack(state);
    const t = level1(p);
    const capacity = 2;
    const out = new Int32Array(capacity * HOME_RACE_LINE_LEN);
    const n = homeRaceAvailable(p, t, 0, out);
    expect(n).toBeLessThanOrEqual(capacity);
    expect(n).toBe(capacity); // the anchor's rectangle offers more than 2 usable squares
  });

  it('every line it emits on the position corpus is legal end to end', () => {
    // The blocker the M9 verifier found: `homeRaceAvailable`'s lines are
    // injected FORCED and replayed through canonical `applyAction` (DESIGN
    // §5.10), so an illegal line is a SILENTLY discarded home-race win. Two
    // archived fixtures cannot see that; the whole corpus can.
    const files = ['authored.jsonl', 'openings.jsonl', 'fuzz-1000.jsonl'];
    const dir = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');
    const out = new Int32Array(16 * HOME_RACE_LINE_LEN);
    let positions = 0;
    let lines = 0;
    const illegal: string[] = [];
    for (const file of files) {
      for (const stored of readPositions(path.join(dir, file))) {
        let p: PackedState;
        try {
          p = replica.pack(stored.state);
        } catch {
          continue;
        }
        positions++;
        const t = level1(p);
        const n = homeRaceAvailable(p, t, p.side, out);
        for (let i = 0; i < n; i++) {
          lines++;
          const bad = replayLine(p, lineAt(out, i));
          if (bad >= 0 && illegal.length < 10) illegal.push(`${stored.id} line ${i} word ${bad}`);
        }
      }
    }
    expect(positions).toBeGreaterThan(1000);
    expect(lines).toBeGreaterThan(0);
    expect(illegal).toEqual([]);
  });
});

describe('tables/home.ts — SU addendum 20b archived fixture', () => {
  const positions = readPositions(path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions/authored.jsonl'));
  const lightningDef = DEF_INDEX.get('lightning_1') as number;

  it('finds BUY lightning_1@G1 -> J10 at the archived "home-race" fixture', () => {
    const stored = findPosition(positions, 'home-race');
    const p = replica.pack(stored.state);
    const t = level1(p);
    const out = new Int32Array(8 * HOME_RACE_LINE_LEN);
    const n = homeRaceAvailable(p, t, 0, out);
    expect(n).toBeGreaterThan(0);
    let found = false;
    for (let i = 0; i < n; i++) {
      const base = i * HOME_RACE_LINE_LEN;
      if (paA(out[base]) === lightningDef && paB(out[base]) === sqOf(6, 0)) {
        found = true;
        expect(paB(out[base + 2])).toBe(CORNER[1]);
        expect(paC(out[base + 2])).toBe(4);
      }
    }
    expect(found).toBe(true);
  });

  it('finds no home race for White at the archived "promotion-kill" fixture (the window has closed)', () => {
    const stored = findPosition(positions, 'promotion-kill');
    const p = replica.pack(stored.state);
    const t = level1(p);
    const out = new Int32Array(8 * HOME_RACE_LINE_LEN);
    expect(homeRaceAvailable(p, t, 0, out)).toBe(0);
  });
});
