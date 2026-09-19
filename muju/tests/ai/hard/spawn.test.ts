// @vitest-environment node
/**
 * `core/spawn.ts` against `src/game/spawning.ts` (DESIGN §4.6, §5.8).
 *
 * The gate criterion is the first test: `spawnInfo().legal` equals
 * `getAllSpawnPositions` as a set on 50,000 positions. `isLegalSpawn` is
 * checked against `isValidSpawnPosition` on every square of a sample of those,
 * and the what-if primitives are checked against the canonical answer for the
 * board they describe (remove the unit / add the unit, then ask the canonical
 * engine) rather than against a hand-written expectation.
 */
import { describe, expect, it, vi } from 'vitest';
import { getAllSpawnPositions, isValidSpawnPosition } from '../../../src/game/spawning';
import { getPurchasePositions } from '../../../src/game/summoning';
import type { PlayerId } from '../../../src/game/types';
import { seededRandom } from '../../../src/ai/runtime';
import { bbNew, bbNext, bbCount } from '../../../src/ai/hard/core/bits';
import {
  anchorsVoidedBy,
  blockingSet,
  isLegalSpawn,
  newSpawnInfo,
  spawnInfo,
  spawnMaskWith,
  spawnMaskWithout,
} from '../../../src/ai/hard/core/spawn';
import { Replica } from '../../../src/ai/hard/core/state';
import { buildState, buildUnit, positionsOf, randomState, type UnitSpec } from './game-fixture';

// E0.5 timeout budget: slowest test 1.5 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 20 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 20_000 });

const replica = new Replica();
const SIDE_OF: readonly PlayerId[] = ['white', 'black'];

function squaresOf(mask: Uint32Array): number[] {
  const out: number[] = [];
  for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) out.push(s);
  return out;
}

describe('core/spawn.ts', () => {
  it('spawnInfo().legal equals getAllSpawnPositions as a set on 50,000 positions', () => {
    const rng = seededRandom(0x5350574e);
    const info = newSpawnInfo();
    let compared = 0;
    let nonEmpty = 0;
    let blocked = 0;
    for (let i = 0; i < 25_000; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 9));
      const p = replica.pack(state);
      for (let side = 0; side < 2; side++) {
        spawnInfo(p, side as 0 | 1, info);
        const expected = positionsOf(getAllSpawnPositions(SIDE_OF[side], state.board));
        expect(squaresOf(info.legal)).toEqual(expected);
        expect(info.area).toBe(expected.length);
        if (expected.length > 0) nonEmpty++;
        else blocked++;
        compared++;
      }
    }
    expect(compared).toBe(50_000);
    expect(nonEmpty).toBeGreaterThan(20_000);
    expect(blocked).toBeGreaterThan(1_000);
  });

  it('isLegalSpawn equals isValidSpawnPosition on every square', () => {
    const rng = seededRandom(0x49535047);
    for (let i = 0; i < 400; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 8));
      const p = replica.pack(state);
      for (let side = 0; side < 2; side++) {
        for (let s = 0; s < 100; s++) {
          const expected = isValidSpawnPosition({ x: s % 10, y: Math.floor(s / 10) }, SIDE_OF[side], state.board);
          expect(isLegalSpawn(p, side as 0 | 1, s)).toBe(expected);
        }
      }
    }
  });

  it('reserveSum and anchors match the rule they abbreviate', () => {
    const info = newSpawnInfo();
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 1, y: 3 },
        { def: 'fire_1', owner: 'white', x: 2, y: 2 },
        { def: 'water_1', owner: 'black', x: 1, y: 1 },
      ],
    });
    const p = replica.pack(state);
    spawnInfo(p, 0, info);
    // Black's Sjor on B2 sits inside BOTH white rectangles, so white has no anchor.
    expect(bbCount(info.anchors)).toBe(0);
    expect(info.area).toBe(0);
    expect(info.reserveSum).toBe(0);
    expect(info.depth).toBe(0);

    const open = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 1, y: 2 }] });
    const q = replica.pack(open);
    spawnInfo(q, 0, info);
    // Rectangle (0,0)..(1,2) is six squares, one of them the anchor itself.
    expect(info.area).toBe(5);
    expect(info.depth).toBe(3);
    let sum = 0;
    for (const s of squaresOf(info.legal)) sum += q.reserve[s];
    expect(info.reserveSum).toBe(sum);
  });

  it('spawnMaskWithout equals the canonical mask for the board with that unit removed', () => {
    const rng = seededRandom(0x574f5554);
    const mask = bbNew();
    for (let i = 0; i < 400; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 7));
      const p = replica.pack(state);
      const slot = Math.floor(rng() * state.board.units.length);
      const side = (rng() < 0.5 ? 0 : 1) as 0 | 1;
      spawnMaskWithout(p, side, slot, mask);
      const without = {
        ...state,
        board: { ...state.board, units: state.board.units.filter((_, k) => k !== slot) },
      };
      expect(squaresOf(mask)).toEqual(positionsOf(getAllSpawnPositions(SIDE_OF[side], without.board)));
    }
  });

  it('spawnMaskWith equals the canonical mask for the board with a unit added there', () => {
    const rng = seededRandom(0x57495448);
    const mask = bbNew();
    let checked = 0;
    for (let i = 0; i < 600 && checked < 400; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 6));
      const p = replica.pack(state);
      const side = (rng() < 0.5 ? 0 : 1) as 0 | 1;
      const extra = Math.floor(rng() * 100);
      if (p.pieceAt[extra] !== 255) continue;
      spawnMaskWith(p, side, extra, mask);
      const added: UnitSpec = { def: 'fire_1', owner: SIDE_OF[side], x: extra % 10, y: Math.floor(extra / 10) };
      const withUnit = {
        ...state,
        board: {
          ...state.board,
          units: [...state.board.units, buildUnit(added, 900)],
        },
      };
      expect(squaresOf(mask)).toEqual(positionsOf(getAllSpawnPositions(SIDE_OF[side], withUnit.board)));
      checked++;
    }
    expect(checked).toBe(400);
  });

  it('anchorsVoidedBy counts unblocked anchors whose rectangle holds the square; the corner voids all', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 1, y: 1 },
        { def: 'fire_1', owner: 'white', x: 4, y: 0 },
        { def: 'water_1', owner: 'white', x: 0, y: 5 },
      ],
    });
    const p = replica.pack(state);
    // (0,0) lies in every white rectangle.
    expect(anchorsVoidedBy(p, 0, 0)).toBe(3);
    // (4,0) lies in the (0,0)..(4,0) rectangle only.
    expect(anchorsVoidedBy(p, 0, 4)).toBe(1);
    // (5,5) lies in none of them.
    expect(anchorsVoidedBy(p, 0, 55)).toBe(0);
  });

  it('blockingSet is an exact minimum cover over the unblocked rectangles', () => {
    const mask = bbNew();
    // One anchor: any empty square of its rectangle covers it, so the minimum is 1.
    const one = replica.pack(buildState({ units: [{ def: 'plant_1', owner: 'white', x: 3, y: 3 }] }));
    expect(blockingSet(one, 0, null, 3, mask)).toBe(1);
    expect(mask.length).toBe(4);

    // Two incomparable anchors — (3,0) and (0,3) — still share the corner column
    // and row at (0,0), so one square covers both.
    const two = replica.pack(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 3, y: 0 },
          { def: 'water_1', owner: 'white', x: 0, y: 3 },
        ],
      }),
    );
    expect(blockingSet(two, 0, null, 3, mask)).toBe(1);
    expect(squaresOf(mask)).toEqual([0]);

    // Restricting the candidate set to squares that cover only one rectangle
    // each forces two squares.
    const candidate = bbNew();
    candidate[0] = 0;
    candidate[1] = 0;
    candidate[2] = 0;
    candidate[3] = 0;
    for (const s of [1, 2, 3, 10, 20, 30]) candidate[s >>> 5] |= 1 << (s & 31);
    expect(blockingSet(two, 0, candidate, 3, mask)).toBe(2);

    // No unblocked anchor at all -> 0.
    const smothered = replica.pack(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 1, y: 1 },
          { def: 'fire_1', owner: 'black', x: 0, y: 1 },
        ],
      }),
    );
    expect(blockingSet(smothered, 0, null, 3, mask)).toBe(0);

    // A candidate set that cannot cover everything reports `cap + 1`.
    const empty = bbNew();
    expect(blockingSet(two, 0, empty, 3, mask)).toBe(4);
  });

  it('a minimum cover really does void every anchor', () => {
    const rng = seededRandom(0x434f5652);
    const mask = bbNew();
    const info = newSpawnInfo();
    let covers = 0;
    for (let i = 0; i < 300; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 5));
      const p = replica.pack(state);
      const side = (rng() < 0.5 ? 0 : 1) as 0 | 1;
      const minimum = blockingSet(p, side, null, 4, mask);
      if (minimum === 0 || minimum > 4) continue;
      const intruders: UnitSpec[] = squaresOf(mask).map(s => ({
        def: 'lightning_1',
        owner: SIDE_OF[1 - side],
        x: s % 10,
        y: Math.floor(s / 10),
      }));
      const blockedBoard = {
        ...state.board,
        units: [...state.board.units, ...intruders.map((u, k) => buildUnit(u, 1000 + k))],
      };
      expect(getAllSpawnPositions(SIDE_OF[side], blockedBoard)).toEqual([]);
      // ...and one fewer square would not have done it.
      const p2 = replica.pack({ ...state, board: blockedBoard });
      spawnInfo(p2, side, info);
      expect(info.area).toBe(0);
      covers++;
    }
    expect(covers).toBeGreaterThan(100);
  });

  it('is commitment-blind: a pending summon neither anchors, blocks nor occupies', () => {
    // "They are not actual units: they cannot occupy squares, block movement,
    // attack, be attacked, mine, promote, anchor or block rectangles"
    // (`docs/PHASING-2026-09-16.md`). `core/spawn.ts` therefore reads `occBy`
    // and nothing else — the pending MASK is `genPlace`'s business, not the
    // geometry's.
    const spec = {
      units: [
        { def: 'plant_1', owner: 'white' as const, x: 1, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black' as const, x: 8, y: 8, id: 'b0' },
      ],
    };
    const bare = replica.pack(buildState(spec));
    const info = newSpawnInfo();
    const withInfo = newSpawnInfo();
    spawnInfo(bare, 0, info);
    const baseline = squaresOf(info.legal);
    expect(baseline).toContain(0);

    for (const owner of ['white', 'black'] as const) {
      // A commitment ON a legal spawn square, and one FAR OUTSIDE White's
      // rectangles: neither changes the geometry for either side.
      const committed = replica.pack(
        buildState({
          ...spec,
          white: 20,
          black: 20,
          pendingSummons: [
            { def: 'fire_1', owner, x: 0, y: 0 },
            { def: 'fire_1', owner, x: 5, y: 5 },
          ],
        }),
      );
      for (const side of [0, 1] as const) {
        spawnInfo(bare, side, info);
        spawnInfo(committed, side, withInfo);
        expect(squaresOf(withInfo.legal), `${owner} / side ${side}`).toEqual(squaresOf(info.legal));
        expect(squaresOf(withInfo.anchors)).toEqual(squaresOf(info.anchors));
        expect(withInfo.depth).toBe(info.depth);
        expect(withInfo.reserveSum).toBe(info.reserveSum);
        // ...and `isLegalSpawn` still says yes on the very square the commitment
        // sits on: it remains a valid SPAWN position, and is only no longer a
        // valid BUY for its own owner. That split is the whole reason the mask
        // lives in `genPlace` instead of here.
        expect(isLegalSpawn(committed, side, 0)).toBe(isLegalSpawn(bare, side, 0));
      }
      // The canonical purchase set is the geometry MINUS the side's own
      // commitments (`getPurchasePositions`, summoning.ts:9-11).
      const state = buildState({
        ...spec,
        white: 20,
        pendingSummons: [
          { def: 'fire_1', owner, x: 0, y: 0 },
          { def: 'fire_1', owner, x: 5, y: 5 },
        ],
      });
      const purchasable = positionsOf(getPurchasePositions(state, 'white'));
      const expected = owner === 'white' ? baseline.filter(sq => sq !== 0) : baseline;
      expect(purchasable, owner).toEqual(expected);
    }
  });
});
