// @vitest-environment node
/**
 * `tables/threat.ts`, `tables/approach.ts` and `tables/context.ts` (DESIGN
 * §4.8–§4.10, §5.1, §5.2, §5.8).
 *
 * Every differential test here builds its expectation from the CANONICAL
 * engine (`getMovementRange`, `getMoveCost`, `getAllSpawnPositions`,
 * `getAffordablePurchases`, `applyAction`) on the same position, never from a
 * hand-copied number. The M6 gate runs the same comparisons at scale, and the
 * approach comparison against `server/analysis/tactics.ts approachTable`, from
 * `lab/hard-ai/oracles/threat.ts` — `server/**` is outside the root tsconfig
 * and may only be imported from `lab/**` (DESIGN §5.8), so the reference used
 * below is the same classification rebuilt from `src/game` primitives.
 */
import { describe, expect, it, vi } from 'vitest';
import { getAdjacentPositions, getUnitAt } from '../../../src/game/board';
import { resolveSummons } from '../../../src/game/summoning';
import { canAttack } from '../../../src/game/combat';
import { getMoveCost, getMovementRange } from '../../../src/game/movement';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import type { GameState, PlayerId, Position, Unit } from '../../../src/game/types';
import { getUnitDefinition } from '../../../src/game/units';
import { applyAction } from '../../../src/ai/simulate';
import { seededRandom } from '../../../src/ai/runtime';
import { bbCount, bbNew, bbNext, bbSet, Scratch, type BB } from '../../../src/ai/hard/core/bits';
import { activeCatalog, DEF_INDEX, powerIndex } from '../../../src/ai/hard/core/catalog';
import { Replica } from '../../../src/ai/hard/core/state';
import { BOARD, CORNER } from '../../../src/ai/hard/core/tables';
import { MAX_SLOTS, NO_SLOT, type PackedState, type Side } from '../../../src/ai/hard/types';
import { allocTables, buildTables, KILL_NEVER, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  exposedValueCc,
  nearestOwner,
  refreshExposure,
  STRIKE_MOVE_ACTIONS,
  strikeArea,
  strikeIfBoughtArea,
  UNREACHABLE,
  unitSpeeds,
} from '../../../src/ai/hard/tables/threat';
import {
  Approach,
  approachTable,
  classifyApproach,
  APPROACH_SCRATCH_BB,
  APPROACH_SCRATCH_I8,
} from '../../../src/ai/hard/tables/approach';
import { buildState, positionsOf, randomState, type UnitSpec } from './game-fixture';

// E0.5 timeout budget: slowest test 0.6 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const SIDE_OF: readonly PlayerId[] = ['white', 'black'];
const scratch = new Scratch(4, APPROACH_SCRATCH_BB, APPROACH_SCRATCH_I8);

function key(p: Position): number {
  return p.y * 10 + p.x;
}

function squaresOf(mask: BB): number[] {
  const out: number[] = [];
  for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) out.push(s);
  return out;
}

/** `dilate(getMovementRange(pos, speed, moves) ∪ {pos})` per unit, unioned (DESIGN F22). */
function oracleStrike(state: GameState, side: PlayerId, moves: number): number[] {
  const seen = new Set<number>();
  for (const u of state.board.units) {
    if (u.owner !== side || !canAttack(u)) continue;
    const speed = getUnitDefinition(u.definitionId).speed;
    const area: Position[] = [u.position];
    if (moves > 0) for (const r of getMovementRange(u.position, speed, moves, state.board)) area.push(r.position);
    for (const pos of area) {
      seen.add(key(pos));
      for (const n of getAdjacentPositions(pos)) seen.add(key(n));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Canonical batch resolution determines the real bodies and occupancy. */
function oracleStrikeIfBought(state: GameState, side: PlayerId): number[] {
  const before = side === state.turn.currentPlayer ? resolveSummons(state, side === 'white' ? 'black' : 'white') : state;
  const ids = new Set(before.board.units.map(u => u.id));
  const resolved = resolveSummons(before, side);
  const arrivals = resolved.board.units.filter(u => !ids.has(u.id));
  const seen = new Set<number>();
  for (const u of arrivals) {
    const speed = getUnitDefinition(u.definitionId).speed;
    for (const q of [u.position, ...getMovementRange(u.position, speed, 3, resolved.board).map(r => r.position)]) {
      seen.add(key(q));
      for (const n of getAdjacentPositions(q)) seen.add(key(n));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Level-1 strike/exposure maps for `p`, since `buildTables` lands at M12. */
function level1(p: PackedState, t: NodeTables): NodeTables {
  for (let side = 0; side < 2; side++) {
    strikeArea(p, side as Side, t, 3, t.strike[side]);
    strikeArea(p, side as Side, t, 3, t.strikeNext[side], 'nextAct');
    strikeIfBoughtArea(p, side as Side, t, t.strikeIfBought[side]);
  }
  refreshExposure(t);
  t.side = p.side;
  t.level = 1;
  return t;
}

/**
 * `server/analysis/tactics.ts:272 approachTable`'s classification, rebuilt from
 * `src/game` primitives: cheapest empty (or own) square adjacent to the target
 * that the attacker can reach and still pay for the hit; `strike-and-retreat`
 * when the post-attack board leaves it somewhere to go.
 */
function referenceApproach(state: GameState, attacker: Unit, target: Unit): { cls: number; d: number } {
  const speed = getUnitDefinition(attacker.definitionId).speed;
  const budget = state.turn.actionsRemaining;
  let bestCost = -1;
  let bestCls = Approach.NONE as number;
  if (!canAttack(attacker)) return { cls: Approach.NONE, d: -1 };
  for (const pos of getAdjacentPositions(target.position)) {
    const occupant = getUnitAt(state.board, pos);
    if (occupant && occupant.id !== attacker.id) continue;
    const same = key(pos) === key(attacker.position);
    const cost = same ? 0 : getMoveCost(attacker.position, pos, speed, state.board);
    if (cost === null || cost + 1 > budget) continue;
    let after = state;
    if (cost > 0) after = applyAction(after, { type: 'MOVE', unitId: attacker.id, to: pos });
    after = applyAction(after, { type: 'ATTACK', unitId: attacker.id, targetPosition: target.position });
    const left = budget - cost - 1;
    const retreat = after.phase === 'playing' ? getMovementRange(pos, speed, left, after.board).length : 0;
    const cls = retreat > 0 ? Approach.RETREAT : Approach.STRAND;
    if (bestCost < 0 || cost < bestCost || (cost === bestCost && cls > bestCls)) {
      bestCost = cost;
      bestCls = cls;
    }
  }
  return bestCost < 0 ? { cls: Approach.NONE, d: -1 } : { cls: bestCls, d: bestCost };
}

/** A target whose adjacent squares include the defender's home corner can end the game on the move. */
function touchesHomeCorner(target: Unit, defender: Side): boolean {
  return getAdjacentPositions(target.position).some(pos => key(pos) === CORNER[defender]);
}

describe('tables/threat.ts strikeArea', () => {
  it('equals dilate(getMovementRange(u, spd, 3) ∪ {u}) per unit on 1,000 random positions', () => {
    const rng = seededRandom(0x57524b31);
    const t = allocTables();
    const out = bbNew();
    let compared = 0;
    let nonEmpty = 0;
    for (let i = 0; i < 500; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 10));
      const p = replica.pack(state);
      for (let side = 0; side < 2; side++) {
        strikeArea(p, side as Side, t, 3, out);
        const expected = oracleStrike(state, SIDE_OF[side], 3);
        expect(squaresOf(out)).toEqual(expected);
        if (expected.length > 0) nonEmpty++;
        compared++;
      }
    }
    expect(compared).toBe(1_000);
    expect(nonEmpty).toBeGreaterThan(700);
  });

  it('agrees with the oracle for every move budget 0..4', () => {
    const rng = seededRandom(0x57524b32);
    const t = allocTables();
    const out = bbNew();
    for (let i = 0; i < 60; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 6));
      const p = replica.pack(state);
      for (let moves = 0; moves <= 4; moves++) {
        for (let side = 0; side < 2; side++) {
          strikeArea(p, side as Side, t, moves, out);
          expect(squaresOf(out)).toEqual(oracleStrike(state, SIDE_OF[side], moves));
        }
      }
    }
  });

  it('with zero move actions is exactly the units and their neighbours', () => {
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 0, y: 0 }] });
    const p = replica.pack(state);
    const t = allocTables();
    const out = bbNew();
    strikeArea(p, 0, t, 0, out);
    expect(squaresOf(out)).toEqual([0, 1, 10]);
  });

  it('a side with no living unit strikes nothing', () => {
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 4, y: 4 }] });
    const p = replica.pack(state);
    const t = allocTables();
    const out = bbNew();
    strikeArea(p, 1, t, 3, out);
    expect(bbCount(out)).toBe(0);
  });

  it('keeps a unit boxed in by its own side to its own neighbourhood', () => {
    // Speed 3 and three move actions, but every exit is occupied.
    const units: UnitSpec[] = [
      { def: 'lightning_1', owner: 'white', x: 5, y: 5 },
      { def: 'plant_1', owner: 'white', x: 4, y: 5 },
      { def: 'plant_1', owner: 'white', x: 6, y: 5 },
      { def: 'plant_1', owner: 'white', x: 5, y: 4 },
      { def: 'plant_1', owner: 'white', x: 5, y: 6 },
    ];
    const state = buildState({ units });
    const p = replica.pack(state);
    const t = allocTables();
    const out = bbNew();
    strikeArea(p, 0, t, 3, out);
    expect(squaresOf(out)).toEqual(oracleStrike(state, 'white', 3));
  });
});

describe('tables/threat.ts paid pending strike', () => {
  it('matches canonical simultaneous arrivals over 1,000 randomized side projections', () => {
    const rng = seededRandom(0x53494231);
    const t = allocTables();
    const out = bbNew();
    let compared = 0, nonEmpty = 0;
    for (let i = 0; i < 500; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 8), { white: 0, black: 0 });
      for (const side of SIDE_OF) {
        const legal = getAllSpawnPositions(side, state.board);
        for (let j = 0; j < Math.min(3, legal.length); j++) {
          const q = legal[(j * 7) % legal.length];
          if (state.pendingSummons!.some(s => s.owner === side && key(s.position) === key(q))) continue;
          const definitionId = ['lightning_1', 'water_1', 'fire_1'][j];
          state.pendingSummons!.push({ id: `p-${side}-${j}`, owner: side, definitionId, position: q, cost: getUnitDefinition(definitionId).cost });
        }
      }
      const p = replica.pack(state);
      for (let side = 0; side < 2; side++) {
        strikeIfBoughtArea(p, side as Side, t, out);
        const expected = oracleStrikeIfBought(state, SIDE_OF[side]);
        expect(squaresOf(out)).toEqual(expected);
        if (expected.length) nonEmpty++;
        compared++;
      }
    }
    expect(compared).toBe(1000);
    expect(nonEmpty).toBeGreaterThan(200);
  });
  it('cash without a commitment cannot contribute any pending strike', () => {
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 5, y: 5 }], white: 100 });
    const out = bbNew();
    strikeIfBoughtArea(replica.pack(state), 0, allocTables(), out);
    expect(bbCount(out)).toBe(0);
  });
  it('drops voided arrivals even when the bank could afford replacements', () => {
    const state = buildState({ units: [
      { def: 'plant_1', owner: 'white', x: 5, y: 5 },
      { def: 'plant_1', owner: 'black', x: 0, y: 0 },
    ], pendingSummons: [{ def: 'lightning_1', owner: 'white', x: 3, y: 3 }], white: 100 });
    const out = bbNew();
    strikeIfBoughtArea(replica.pack(state), 0, allocTables(), out);
    expect(squaresOf(out)).toEqual(oracleStrikeIfBought(state, 'white'));
    expect(bbCount(out)).toBe(0);
  });
  it('uses the purchased definition speed and includes an arrival that cannot move', () => {
    for (const definitionId of ['lightning_1', 'fire_1', 'water_1']) {
      const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 0, y: 1 }],
        pendingSummons: [{ def: definitionId, owner: 'white', x: 0, y: 0 }], white: 0 });
      const out = bbNew();
      strikeIfBoughtArea(replica.pack(state), 0, allocTables(), out);
      expect(squaresOf(out)).toEqual(oracleStrikeIfBought(state, 'white'));
      expect(Math.max(...squaresOf(out).map(s => s % 10 + Math.floor(s / 10)))).toBe(3 * getUnitDefinition(definitionId).speed + 1);
      state.board.units.push({ ...state.board.units[0], id: 'blocker', owner: 'black', position: { x: 1, y: 0 } });
      strikeIfBoughtArea(replica.pack(state), 0, allocTables(), out);
      expect(squaresOf(out)).toEqual([0, 1, 10]);
    }
  });
});

describe('tables/threat.ts exposure and value', () => {
  it('refreshExposure is the other side’s next-Act live strike ∪ paid pending strike', () => {
    const rng = seededRandom(0x45585031);
    const t = allocTables();
    for (let i = 0; i < 40; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 6), { white: 8, black: 8 });
      const p = replica.pack(state);
      level1(p, t);
      for (let side = 0; side < 2; side++) {
        const other = 1 - side;
        const expected = new Set<number>([
          ...squaresOf(t.strikeNext[other]),
          ...squaresOf(t.strikeIfBought[other]),
        ]);
        expect(squaresOf(t.exposure[side])).toEqual([...expected].sort((a, b) => a - b));
      }
    }
  });

  it('exposedValueCc sums the material standing inside our exposure', () => {
    const cat = activeCatalog();
    const material = new Int32Array(cat.cost.length);
    for (let d = 0; d < material.length; d++) material[d] = cat.cost[d] * 100;
    const rng = seededRandom(0x45585032);
    const t = allocTables();
    for (let i = 0; i < 40; i++) {
      const state = randomState(rng, 3 + Math.floor(rng() * 6), { white: 6, black: 6 });
      const p = replica.pack(state);
      level1(p, t);
      for (let side = 0; side < 2; side++) {
        let expected = 0;
        for (let slot = 0; slot < MAX_SLOTS; slot++) {
          if (p.sq[slot] === 255 || p.owner[slot] !== side) continue;
          if (!squaresOf(t.exposure[side]).includes(p.sq[slot])) continue;
          expected += cat.cost[p.defId[slot]] * 100;
        }
        expect(exposedValueCc(p, side as Side, t, material)).toBe(expected);
      }
    }
  });

  it('nearestOwner matches ceil(getMoveCost/speed) over every unit of the side', () => {
    const rng = seededRandom(0x4e454152);
    const t = allocTables();
    const outSlot = new Uint8Array(BOARD);
    const outCost = new Uint8Array(BOARD);
    for (let i = 0; i < 30; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 5));
      const p = replica.pack(state);
      for (let side = 0; side < 2; side++) {
        nearestOwner(p, side as Side, t, outSlot, outCost);
        for (let q = 0; q < BOARD; q++) {
          let best = UNREACHABLE;
          for (const u of state.board.units) {
            if (u.owner !== SIDE_OF[side]) continue;
            const speed = getUnitDefinition(u.definitionId).speed;
            const cost = key(u.position) === q ? 0 : getMoveCost(u.position, { x: q % 10, y: Math.floor(q / 10) }, speed, state.board);
            if (cost === null) continue;
            if (cost < best) best = cost;
          }
          expect(outCost[q]).toBe(best);
          expect(outSlot[q] === NO_SLOT).toBe(best === UNREACHABLE);
        }
      }
    }
  });

  it('unitSpeeds lists the distinct speeds of a side, ascending', () => {
    const state = buildState({
      units: [
        { def: 'lightning_1', owner: 'white', x: 0, y: 1 },
        { def: 'plant_1', owner: 'white', x: 1, y: 0 },
        { def: 'fire_1', owner: 'white', x: 2, y: 0 },
        { def: 'water_1', owner: 'white', x: 3, y: 0 },
      ],
    });
    const p = replica.pack(state);
    const out = new Int8Array(8);
    expect(out.subarray(0, unitSpeeds(p, 0, out))).toEqual(new Int8Array([1, 2, 3]));
    expect(unitSpeeds(p, 1, out)).toBe(0);
  });
});

describe('tables/approach.ts classifyApproach', () => {
  it('an adjacent attacker with a spare action can strike and retreat', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const target = p.pieceAt[4 * 10 + 5];
    const r = classifyApproach(p, t, 4 * 10 + 4, 1, target, scratch, 0);
    expect(r.cls).toBe(Approach.RETREAT);
    expect(r.d).toBe(0);
    expect(r.attackerSlot).toBe(p.pieceAt[4 * 10 + 4]);
    expect(r.buy).toBe(0);
    // `retreats` counts only the withdrawal squares the DEFENDER does not
    // already cover (DESIGN §5.8). A mobile defender's own strike map is
    // `dilate(reach(v, 1, 3))`, i.e. everything within four steps of it, so
    // every square one step from an adjacent attack square is inside it and
    // the count is zero even though the class is RETREAT.
    expect(r.retreats).toBe(0);
  });

  it('counts retreat squares outside the defender’s strike map (DESIGN §5.8)', () => {
    // Black's unit on J10 is walled in by White on I10 and J9, so its strike
    // map is just `dilate({J10})`. White attacks from I10 and can withdraw to
    // either of I10's two other neighbours, neither of which Black covers.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
        { def: 'plant_1', owner: 'white', x: 8, y: 9 },
        { def: 'plant_1', owner: 'white', x: 9, y: 8 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    expect(squaresOf(t.strike[1])).toEqual([89, 98, 99]);
    const r = classifyApproach(p, t, 98, 1, p.pieceAt[99], scratch, 0);
    expect(r.cls).toBe(Approach.RETREAT);
    expect(r.d).toBe(0);
    // `reach(I10, 1, 1) \ strike[black]` = {H10, I9} — the two squares the
    // attacker can step to that Black's boxed-in unit cannot answer.
    expect(r.retreats).toBe(2);
  });

  it('an attacker three actions away arrives stranded, four away not at all', () => {
    // Speed 1 attacker on A1; target on D1 is three steps away (STRAND),
    // target on E1 is four (NONE).
    const near = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 4, y: 0 },
      ],
    });
    const p = replica.pack(near);
    const t = level1(p, allocTables());
    const stranded = classifyApproach(p, t, 0, 1, p.pieceAt[4], scratch, 0);
    expect(stranded.d).toBe(3);
    expect(stranded.cls).toBe(Approach.STRAND);
    expect(stranded.retreats).toBe(0);

    const far = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 5, y: 0 },
      ],
    });
    const p2 = replica.pack(far);
    const t2 = level1(p2, allocTables());
    const none = classifyApproach(p2, t2, 0, 1, p2.pieceAt[5], scratch, 0);
    expect(none.cls).toBe(Approach.NONE);
    expect(none.d).toBe(-1);
  });

  it('a lethal hit on the defender’s last unit ends the game, so it is stranded', () => {
    const lethal = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
      ],
    });
    const p = replica.pack(lethal);
    const t = level1(p, allocTables());
    const r = classifyApproach(p, t, 4 * 10 + 4, 1, p.pieceAt[4 * 10 + 5], scratch, 0);
    expect(r.cls).toBe(Approach.STRAND);
    expect(r.d).toBe(0);
    expect(referenceApproach(lethal, lethal.board.units[0], lethal.board.units[1])).toEqual({
      cls: Approach.STRAND,
      d: 0,
    });
  });

  it('a boxed-in attack square is stranded even one action away', () => {
    // White muju on A1 hits black on A2 from A1 itself; A1's only other
    // neighbour, B1, is occupied, so after the (non-lethal) hit there is
    // nowhere to withdraw to.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 0 },
        { def: 'metal_3', owner: 'black', x: 0, y: 1 },
        { def: 'plant_1', owner: 'black', x: 1, y: 0 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const r = classifyApproach(p, t, 0, 1, p.pieceAt[10], scratch, 0);
    expect(r.d).toBe(0);
    expect(r.cls).toBe(Approach.STRAND);
    expect(referenceApproach(state, state.board.units[0], state.board.units[1])).toEqual({
      cls: Approach.STRAND,
      d: 0,
    });
  });

  it('a unit that has spent its attack cannot approach at all', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4, atkCount: 1 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    expect(classifyApproach(p, t, 4 * 10 + 4, 1, p.pieceAt[4 * 10 + 5], scratch, 0).cls).toBe(Approach.NONE);
  });

  it('spent flags reset only in the explicit next-Act horizon', () => {
    // Black cannot act this turn, but it is White's move: Black's approach on
    // White's unit is still real, because Black's flags reset at its startTurn.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4, canAct: false },
      ],
      current: 'white',
      actions: 1,
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const blackOnWhite = classifyApproach(p, t, 4 * 10 + 5, 1, p.pieceAt[4 * 10 + 4], scratch, 0);
    expect(blackOnWhite.cls).toBe(Approach.NONE);
    const blackNext = classifyApproach(p, t, 45, 1, p.pieceAt[44], scratch, 0, -1, 'nextAct');
    expect(blackNext.cls).toBe(Approach.RETREAT);
    // White has one action left: enough to hit from where it stands, but not
    // to withdraw afterwards.
    const whiteOnBlack = classifyApproach(p, t, 4 * 10 + 4, 1, p.pieceAt[4 * 10 + 5], scratch, 0);
    expect(whiteOnBlack.cls).toBe(Approach.STRAND);
    expect(whiteOnBlack.d).toBe(0);
  });

  it('matches the canonical classification on 400 random positions', () => {
    const rng = seededRandom(0x41505031);
    const t = allocTables();
    let pairs = 0;
    let retreats = 0;
    let strands = 0;
    let nones = 0;
    let skipped = 0;
    for (let i = 0; i < 400; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 8), {
        actions: 1 + Math.floor(rng() * 4),
        white: Math.floor(rng() * 10),
        black: Math.floor(rng() * 10),
      });
      const p = replica.pack(state);
      // A position whose mover already holds the enemy corner is adjudicated by
      // `resolveHomeCheckmate` inside every `applyAction` (simulate.ts:33), so
      // the canonical line ends the game before the retreat is measured. The
      // verdict needs the prover, which arrives at M10 and lives in a layer
      // `tables/**` may not import — the M6 oracle skips these positions too.
      if (replica.needsProof(p)) {
        skipped++;
        continue;
      }
      level1(p, t);
      const mover = SIDE_OF[p.side];
      for (const target of state.board.units) {
        if (target.owner === mover) continue;
        if (touchesHomeCorner(target, (1 - p.side) as Side)) continue;
        const targetSlot = p.pieceAt[key(target.position)];
        for (const attacker of state.board.units) {
          if (attacker.owner !== mover) continue;
          const speed = getUnitDefinition(attacker.definitionId).speed;
          const expected = referenceApproach(state, attacker, target);
          const actual = classifyApproach(p, t, key(attacker.position), speed, targetSlot, scratch, 0);
          expect({ cls: actual.cls as number, d: actual.d }).toEqual(expected);
          pairs++;
          if (expected.cls === Approach.RETREAT) retreats++;
          else if (expected.cls === Approach.STRAND) strands++;
          else nones++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(2_000);
    expect(retreats).toBeGreaterThan(50);
    expect(strands).toBeGreaterThan(10);
    expect(nones).toBeGreaterThan(500);
    // The adjudicated positions are a small tail, not most of the sample.
    expect(skipped).toBeLessThan(40);
  });
});

describe('tables/approach.ts approachTable', () => {
  it('keeps only lethal attackers, and reports the cheapest one', () => {
    // Black's Tanka (metal_3, defense 5) is adjacent to a white Muju and two
    // speed-3 actions from a white Kagari. Muju has ATK 0 and is elementally
    // neutral against metal, so it can never kill; Kagari has ATK 4 and fire
    // beats metal, so it kills in one. The table must ignore the free adjacent
    // approach and report the Kagari's. A second black unit keeps the kill from
    // ending the game, which would strand every attacker by definition.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 5, y: 4 },
        { def: 'fire_3', owner: 'white', x: 7, y: 4 },
        { def: 'metal_3', owner: 'black', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 0, y: 9 },
      ],
      current: 'black',
    });
    const cat = activeCatalog();
    const metal3 = DEF_INDEX.get('metal_3') as number;
    expect(cat.power[powerIndex(0, DEF_INDEX.get('plant_1') as number, metal3)]).toBeLessThan(cat.def[metal3]);
    expect(cat.power[powerIndex(0, DEF_INDEX.get('fire_3') as number, metal3)]).toBeGreaterThanOrEqual(cat.def[metal3]);

    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const cls = new Uint8Array(MAX_SLOTS);
    const retreats = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, scratch, 0, cls, retreats);
    const slot = p.pieceAt[4 * 10 + 4];

    // The Muju is the cheapest approach of all — and is not in the table.
    const muju = classifyApproach(p, t, 4 * 10 + 5, cat.spd[DEF_INDEX.get('plant_1') as number], slot, scratch, 0);
    expect(muju.cls).not.toBe(Approach.NONE);
    expect(muju.d).toBe(0);
    // The Kagari is two actions away (H5 is four steps from the nearest empty
    // square adjacent to E5, and speed 3 covers that in two).
    const kagari = classifyApproach(p, t, 4 * 10 + 7, cat.spd[DEF_INDEX.get('fire_3') as number], slot, scratch, 0);
    expect(kagari.d).toBe(2);
    expect(cls[slot]).toBe(kagari.cls);
    expect(cls[slot]).toBe(Approach.RETREAT);
    expect(retreats[slot]).toBe(kagari.retreats);
  });

  it('leaves slots the defender does not own untouched', () => {
    const state = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 5, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
      ],
      current: 'black',
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const cls = new Uint8Array(MAX_SLOTS);
    const retreats = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, scratch, 0, cls, retreats);
    expect(cls[p.pieceAt[4 * 10 + 5]]).toBe(Approach.NONE);
    expect(cls[p.pieceAt[4 * 10 + 4]]).not.toBe(Approach.NONE);
    for (let s = 0; s < MAX_SLOTS; s++) {
      if (s === p.pieceAt[4 * 10 + 4]) continue;
      expect(cls[s]).toBe(Approach.NONE);
    }
  });

  it('excludes an uncommitted purchase and finds only its paid next-Act arrival', () => {
    // White's single unit is a speed-1 Muju on B2, five steps from the nearest
    // square adjacent to Black's Muju on E5 — out of reach, and harmless if it
    // got there. Its spawn rectangle is {A1, B1, A2}; a Hi bought on B1 is
    // speed 2, elementally advantaged against plant, and six steps from E4.
    const units: UnitSpec[] = [
      { def: 'plant_1', owner: 'white', x: 1, y: 1 },
      { def: 'plant_1', owner: 'black', x: 4, y: 4 },
    ];
    const state = buildState({ units, white: 20, current: 'black' });
    const p = replica.pack(state);
    expect(positionsOf(getAllSpawnPositions('white', state.board))).toEqual([0, 1, 10]);
    const t = level1(p, allocTables());
    const cat = activeCatalog();
    const slot = p.pieceAt[4 * 10 + 4];

    // No existing white unit can reach it with four actions, promoted or not.
    const muju = DEF_INDEX.get('plant_1') as number;
    expect(classifyApproach(p, t, 11, cat.spd[muju], slot, scratch, 0).cls).toBe(Approach.NONE);
    expect(classifyApproach(p, t, 11, cat.spd[cat.nextDef[muju]], slot, scratch, 0, cat.nextDef[muju]).cls)
      .toBe(Approach.NONE);

    const cls = new Uint8Array(MAX_SLOTS);
    const retreats = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, scratch, 0, cls, retreats);
    expect(cls[slot]).toBe(Approach.NONE);
    state.pendingSummons = [{ id: 'paid-hi', owner: 'white', definitionId: 'fire_1', position: { x: 1, y: 0 }, cost: 3 }];
    const pending = replica.pack(state);
    approachTable(pending, level1(pending, allocTables()), 1, scratch, 0, cls, retreats, 'nextAct');
    // The paid arrival reaches its attack square on its fourth action.
    expect(cls[slot]).toBe(Approach.STRAND);

    const hi = DEF_INDEX.get('fire_1') as number;
    expect(cat.power[powerIndex(0, hi, muju)]).toBeGreaterThanOrEqual(cat.def[muju]);
    const viaBuy = classifyApproach(p, t, 1, cat.spd[hi], slot, scratch, 0, hi);
    expect(viaBuy.buy).toBe(1);
    expect(viaBuy.d).toBe(3);
    expect(viaBuy.cls).toBe(Approach.STRAND);
  });

  it('reports nothing when the attacker has no actions left', () => {
    const state = buildState({
      units: [
        { def: 'fire_3', owner: 'white', x: 5, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
      ],
      current: 'white',
      actions: 0,
    });
    const p = replica.pack(state);
    const t = level1(p, allocTables());
    const cls = new Uint8Array(MAX_SLOTS);
    const retreats = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, scratch, 0, cls, retreats);
    expect([...cls].every(c => c === Approach.NONE)).toBe(true);
  });
});

describe('tables/context.ts', () => {
  it('allocTables hands out a zeroed, fully allocated node', () => {
    const t = allocTables();
    expect(t.level).toBe(1);
    expect(t.strike[0].length).toBe(4);
    expect(t.strikeIfBought[1].length).toBe(4);
    expect(t.exposure[0].length).toBe(4);
    expect(t.cornerDist[0].length).toBe(BOARD);
    expect([...t.cornerDist[1]].every(d => d === -1)).toBe(true);
    expect(t.killActions.length).toBe(MAX_SLOTS);
    expect([...t.killActions].every(a => a === KILL_NEVER)).toBe(true);
    expect(t.killNow[0].entry.length).toBe(MAX_SLOTS);
    expect(t.killNow[0].entry[0].minActions).toBe(255);
    expect(t.approach.length).toBe(MAX_SLOTS);
    expect(t.retreats.length).toBe(MAX_SLOTS);
    expect(t.chain.length).toBe(MAX_SLOTS);
    expect(t.econ[0].income.length).toBe(6);
    expect(t.econ[1].turnsToInsolvency).toBe(7);
    expect(t.spawn[0].area).toBe(0);
  });

  it('every allocTables node owns its own buffers', () => {
    const a = allocTables();
    const b = allocTables();
    bbSet(a.strike[0], 7);
    expect(bbCount(b.strike[0])).toBe(0);
    a.killActions[3] = 1;
    expect(b.killActions[3]).toBe(KILL_NEVER);
    expect(a.killNow[0].entry[0]).not.toBe(a.killNow[1].entry[0]);
  });

  // M6 asserted here that `buildTables` throws "until M12"; M12 supplied the
  // body, so the assertion is now that the level-1 half this module owns is
  // actually filled — and memoised on the position, which is what lets the
  // lazy evaluator upgrade level 1 to level 2 without rebuilding (DESIGN §4.8).
  it('buildTables fills the level-1 half this module owns, once per position (M12)', () => {
    const t = allocTables();
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 2, y: 2 },
        { def: 'shadow_1', owner: 'black', x: 7, y: 7 },
      ],
      current: 'black',
      phase: 'place',
    });
    const p = replica.pack(state);
    expect(buildTables(p, scratch, 0, 1, t)).toBe(t);
    expect(t.level).toBe(1);
    expect(t.side).toBe(p.side);

    const expected = bbNew();
    strikeArea(p, 0, t, STRIKE_MOVE_ACTIONS, expected);
    expect(bbCount(t.strike[0])).toBe(bbCount(expected));
    expect(t.spawn[0].area).toBe(getAllSpawnPositions('white', state.board).length);
    // The level-2 half is untouched at level 1.
    expect(t.killActions[0]).toBe(KILL_NEVER);

    // A second call at the same level on the same position is a no-op: the
    // memo key is `Kturn`, so a hand-poked field survives it and a genuinely
    // different position does not hit.
    t.spawn[0].area = -1;
    buildTables(p, scratch, 0, 1, t);
    expect(t.spawn[0].area).toBe(-1);
    buildTables(p, scratch, 0, 2, t);
    expect(t.level).toBe(2);
    expect(t.spawn[0].area).toBe(-1);
  });
});
