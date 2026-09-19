// @vitest-environment node
/**
 * `tables/geometry.ts` (DESIGN §4.12, §5.8; SU §4.1).
 *
 * `spawnGeometry`'s pass-through fields (`area`, `reserveSum`, `anchorDepth`)
 * are pinned against the already-gated `core/spawn.ts spawnInfo` (M5) it
 * reads from `t.spawn[side]`; `blocking` is pinned against the already-gated
 * `core/spawn.ts blockingSet` (M5) called with `t.exposure[side]` as the
 * candidate, confirming the WIRING (which candidate set, which cap) rather
 * than re-testing `blockingSet` itself. The SU §4.1 F5 fixture (30 squares,
 * 27 empty, one enemy on C3 collapsing that to 2, blocking 1) is reproduced
 * here directly as a focused regression, in addition to the M9 gate oracle's
 * differential run at scale (`lab/hard-ai/oracles/geometry.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { isLegalAction } from '../../../src/game/legality';
import type { PlayerId } from '../../../src/game/types';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { seededRandom } from '../../../src/ai/runtime';
import { Scratch, bbHas, bbNew } from '../../../src/ai/hard/core/bits';
import { blockingSet, spawnInfo } from '../../../src/ai/hard/core/spawn';
import { CC, type PackedState, type Side } from '../../../src/ai/hard/types';
import { CORNER_NEIGHBOURS } from '../../../src/ai/hard/core/tables';
import { Replica } from '../../../src/ai/hard/core/state';
import { allocTables, KILL_NEVER, type NodeTables } from '../../../src/ai/hard/tables/context';
import { STRIKE_MOVE_ACTIONS, refreshExposure, strikeArea, strikeIfBoughtArea } from '../../../src/ai/hard/tables/threat';
import { newSpawnGeometry, spawnGeometry } from '../../../src/ai/hard/tables/geometry';
import { buildState, randomState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const SIDE_OF: readonly PlayerId[] = ['white', 'black'];
/** `spawnGeometry`'s `sc`/`ply` params are unused by its body (DESIGN §4.8's
 * frozen signature); one shared throwaway `Scratch` suffices for every call. */
const sc = new Scratch(1, 1, 1, 1);

/** Level-1 tables `spawnGeometry` reads: live spawn geometry and next-Act
 * exposure. Current strikes alone do not populate the Phasing exposure map. */
function level1(p: PackedState): NodeTables {
  const t = allocTables();
  for (let side = 0; side < 2; side++) {
    spawnInfo(p, side as Side, t.spawn[side]);
    const currentMoves = side === p.side ? Math.max(0, Math.min(STRIKE_MOVE_ACTIONS, p.actions - 1)) : STRIKE_MOVE_ACTIONS;
    strikeArea(p, side as Side, t, currentMoves, t.strike[side]);
    strikeArea(p, side as Side, t, STRIKE_MOVE_ACTIONS, t.strikeNext[side], 'nextAct');
    strikeIfBoughtArea(p, side as Side, t, t.strikeIfBought[side]);
  }
  refreshExposure(t);
  return t;
}

describe('tables/geometry.ts spawnGeometry', () => {
  it('area, reserveSum and anchorDepth pass through spawnInfo exactly', () => {
    const rng = seededRandom(0x4745314f);
    const out = newSpawnGeometry();
    for (let i = 0; i < 300; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 8));
      const p = replica.pack(state);
      const t = level1(p);
      for (const side of [0, 1] as const) {
        spawnGeometry(p, t, side, sc, 0, out);
        expect(out.area).toBe(t.spawn[side].area);
        expect(out.reserveSum).toBe(t.spawn[side].reserveSum);
        expect(out.anchorDepth).toBe(t.spawn[side].depth);
        // Cross-check against the canonical engine directly too (belt and braces).
        const expectedArea = getAllSpawnPositions(SIDE_OF[side], state.board).length;
        expect(out.area).toBe(expectedArea);
      }
    }
  });

  it('convertible = min(bank, 5 * area) * CC; zeroCliff = [area == 0 && bank >= 3]', () => {
    const out = newSpawnGeometry();

    // No anchors at all (own unit smothered by an enemy) -> area 0.
    const smothered = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 1, y: 1 },
        { def: 'fire_1', owner: 'black', x: 0, y: 0 },
      ],
      white: 5,
    });
    const p1 = replica.pack(smothered);
    const t1 = level1(p1);
    spawnGeometry(p1, t1, 0, sc, 0, out);
    expect(out.area).toBe(0);
    expect(out.convertible).toBe(0);
    expect(out.zeroCliff).toBe(1); // area 0, bank 5 >= 3

    const noCliff = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 1, y: 1 },
        { def: 'fire_1', owner: 'black', x: 0, y: 0 },
      ],
      white: 2,
    });
    const p2 = replica.pack(noCliff);
    const t2 = level1(p2);
    spawnGeometry(p2, t2, 0, sc, 0, out);
    expect(out.area).toBe(0);
    expect(out.zeroCliff).toBe(0); // bank 2 < 3, even though area is 0

    const rich = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 4, y: 4 }], white: 40 });
    const p3 = replica.pack(rich);
    const t3 = level1(p3);
    spawnGeometry(p3, t3, 0, sc, 0, out);
    expect(out.area).toBeGreaterThan(0);
    expect(out.zeroCliff).toBe(0);
    expect(out.convertible).toBe(Math.min(40, 5 * out.area) * CC);

    const poor = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 4, y: 4 }], white: 1 });
    const p4 = replica.pack(poor);
    const t4 = level1(p4);
    spawnGeometry(p4, t4, 0, sc, 0, out);
    expect(out.convertible).toBe(1 * CC); // min(1, 5*area) == 1
  });

  it('blocking equals blockingSet(p, side, exposure[side], cap 2, ...) — the reachability-filtered candidate', () => {
    const out = newSpawnGeometry();
    const scratch = bbNew();

    // Single unblocked anchor, plus a slow distant enemy so exposure[white]
    // is non-empty without covering the whole board.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 3, y: 3 },
        { def: 'water_1', owner: 'black', x: 9, y: 9 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    spawnGeometry(p, t, 0, sc, 0, out);
    const direct = blockingSet(p, 0, t.exposure[0], 2, scratch);
    expect(out.blocking).toBe(direct);

    // A candidate = null run (the whole board) can only be <= the
    // exposure-filtered run, since exposure is a subset of "everywhere".
    const unfiltered = blockingSet(p, 0, null, 2, scratch);
    expect(unfiltered).toBeLessThanOrEqual(out.blocking);
  });

  it('SU §4.1: White Hi at F5 -> 30 squares, 27 empty; enemy on C3 -> 2, blocking 1', () => {
    // The default White start layout (Hi@(1,0), Sjor@(1,1), Muju@(0,1)) with
    // the Hi relocated to F5 = (5,4): rectangle (0..5, 0..4) is 30 squares,
    // 3 of which (F5 itself, Sjor@(1,1), Muju@(0,1)) are occupied -> 27 empty.
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 5, y: 4 },
        { def: 'water_1', owner: 'white', x: 1, y: 1 },
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newSpawnGeometry();
    spawnGeometry(p, t, 0, sc, 0, out);
    expect(out.area).toBe(27);
    expect(getAllSpawnPositions('white', state.board).length).toBe(27);

    const withEnemy = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 5, y: 4 },
        { def: 'water_1', owner: 'white', x: 1, y: 1 },
        { def: 'plant_1', owner: 'white', x: 0, y: 1 },
        { def: 'fire_1', owner: 'black', x: 2, y: 2 }, // C3
      ],
    });
    const p2 = replica.pack(withEnemy);
    const t2 = level1(p2);
    spawnGeometry(p2, t2, 0, sc, 0, out);
    expect(out.area).toBe(2);
    expect(getAllSpawnPositions('white', withEnemy.board).length).toBe(2);
    const scratch = bbNew();
    expect(blockingSet(p2, 0, null, 2, scratch)).toBe(1);
    expect(out.blocking).toBe(1);

    // Independently exhibit a legal occupation of the remaining rectangle.
    // Black's next Act reaches A1 after White's full handoff, and the
    // canonical spawn oracle then reports no White recruitment squares.
    let after = withEnemy;
    for (const action of [
      { type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' },
      { type: 'MOVE', unitId: 'u3', to: { x: 2, y: 0 } },
      { type: 'MOVE', unitId: 'u3', to: { x: 0, y: 0 } },
    ] satisfies AIAction[]) {
      expect(isLegalAction(after, action), action.type).toBe(true);
      after = applyAction(after, action);
    }
    expect(getAllSpawnPositions('white', after.board)).toEqual([]);
  });

  it('paid next-Act arrivals can disrupt an anchor at zero bank; affordable uncommitted units cannot', () => {
    const root = buildState({ phase: 'place', actions: 0, reserves: new Array(100).fill(0), units: [
      { def: 'plant_1', owner: 'white', x: 4, y: 4 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4 },
    ], pendingSummons: [{ id: 'paid-fire', def: 'fire_1', owner: 'black', x: 5, y: 5 }] });
    const p = replica.pack(root), t = level1(p), out = newSpawnGeometry();
    const intruderSquare = 43; // D5, inside White's sole supporting rectangle.
    expect(bbHas(t.strike[1], intruderSquare)).toBe(false);
    expect(bbHas(t.strikeNext[1], intruderSquare)).toBe(false); // live Yan is immobile
    expect(bbHas(t.strikeIfBought[1], intruderSquare)).toBe(true);
    spawnGeometry(p, t, 0, sc, 0, out);
    expect(out.blocking).toBe(1);
    expect(root.players.black.resources).toBe(0);

    const unpaid = buildState({ phase: 'place', actions: 0, black: 100,
      reserves: new Array(100).fill(0), units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      ] });
    const noArrival = replica.pack(unpaid), noArrivalTables = level1(noArrival);
    expect(bbHas(noArrivalTables.exposure[0], intruderSquare)).toBe(false);
    spawnGeometry(noArrival, noArrivalTables, 0, sc, 0, out);
    expect(out.blocking).toBe(3); // no reachable candidate within the cap

    let after = root;
    for (const action of [
      { type: 'END_PLACE_PHASE' },
      { type: 'MOVE', unitId: 'paid-fire', to: { x: 3, y: 5 } },
      { type: 'MOVE', unitId: 'paid-fire', to: { x: 3, y: 4 } },
    ] satisfies AIAction[]) {
      expect(isLegalAction(after, action), action.type).toBe(true);
      after = applyAction(after, action);
    }
    expect(after.pendingSummons).toEqual([]);
    expect(after.players.black.resources).toBe(0);
    expect(getAllSpawnPositions('white', after.board)).toEqual([]);
  });

  it('infiltrationAnchors sums, per own unit inside an enemy rectangle, how many enemy anchors it falls inside', () => {
    // Two black anchors — (5,9) (row y=9, x in [5,9]) and (9,5) (column x=9,
    // y in [5,9]) — both rectangles contain the corner (9,9), so a white
    // intruder ON the corner infiltrates both at once ("a body on the enemy
    // corner voids ALL of them", DESIGN §5.8). A second white intruder at
    // (7,9) falls only inside the first anchor's rectangle.
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 9 },
        { def: 'water_1', owner: 'black', x: 9, y: 5 },
        { def: 'fire_1', owner: 'white', x: 9, y: 9 }, // the black corner
        { def: 'fire_1', owner: 'white', x: 7, y: 9 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newSpawnGeometry();
    spawnGeometry(p, t, 0, sc, 0, out); // side = WHITE: infiltrationAnchors is MY OWN units voiding the enemy's
    expect(out.infiltrationAnchors).toBe(3); // 2 (corner) + 1 ((7,9) in the row-anchor's rectangle only)

    // A single infiltrator that reaches only one rectangle counts once.
    const single = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 9 },
        { def: 'fire_1', owner: 'white', x: 7, y: 9 },
      ],
    });
    const p2 = replica.pack(single);
    const t2 = level1(p2);
    spawnGeometry(p2, t2, 0, sc, 0, out);
    expect(out.infiltrationAnchors).toBe(1);

    // No own units on the board at all: nothing to infiltrate with.
    const none = buildState({ units: [{ def: 'plant_1', owner: 'black', x: 5, y: 9 }] });
    const p3 = replica.pack(none);
    const t3 = level1(p3);
    spawnGeometry(p3, t3, 0, sc, 0, out);
    expect(out.infiltrationAnchors).toBe(0);
  });

  it('cornerNeighboursHeld counts own speed-1 units on CORNER_NEIGHBOURS[side]', () => {
    const [n0, n1] = CORNER_NEIGHBOURS[0];
    const sq = (s: number): { x: number; y: number } => ({ x: s % 10, y: Math.floor(s / 10) });
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: sq(n0).x, y: sq(n0).y }, // Muju, speed 1
        { def: 'water_1', owner: 'white', x: sq(n1).x, y: sq(n1).y }, // Sjor, speed 1
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newSpawnGeometry();
    spawnGeometry(p, t, 0, sc, 0, out);
    expect(out.cornerNeighboursHeld).toBe(2);

    const fastOnly = buildState({
      units: [{ def: 'lightning_1', owner: 'white', x: sq(n0).x, y: sq(n0).y }], // Radi, speed 3
    });
    const p2 = replica.pack(fastOnly);
    const t2 = level1(p2);
    spawnGeometry(p2, t2, 0, sc, 0, out);
    expect(out.cornerNeighboursHeld).toBe(0);
  });

  it('fragility = 2*[blocking <= 1] + [killActions[deepestAnchor] <= 4]', () => {
    // A lone anchor plus an enemy just outside its rectangle, so
    // exposure[white] covers a spot in that rectangle and `blocking` resolves
    // to a real (small) number rather than "cap + 1" for a candidate set that
    // cannot reach the rectangle at all this turn (see the "blocking
    // equals..." and F5 tests for the reachability-filtered candidate).
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 4, y: 4 },
        { def: 'fire_1', owner: 'black', x: 5, y: 4 }, // outside RECT(4,4); inside its own strike reach
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newSpawnGeometry();

    // Untouched killActions defaults to KILL_NEVER (127) from allocTables, so
    // the "<= 4" term reads false and blocking is a lone anchor's 1.
    spawnGeometry(p, t, 0, sc, 0, out);
    expect(out.blocking).toBe(1);
    expect(t.killActions.every(v => v === KILL_NEVER)).toBe(true);
    expect(out.fragility).toBe(2); // 2*[blocking<=1] + 0

    // Simulate `kill.ts` (M7, level 2) having found a fast kill on the
    // deepest anchor's slot.
    const deepestSlot = p.pieceAt[44];
    t.killActions[deepestSlot] = 3;
    spawnGeometry(p, t, 0, sc, 0, out);
    expect(out.fragility).toBe(3); // 2*[blocking<=1] + 1
  });

  it("blockingSet's witness squares are always empty (spawnGeometry's wiring inherits the contract)", () => {
    const scratch = bbNew();
    const state = buildState({ units: [{ def: 'plant_1', owner: 'white', x: 4, y: 4 }] });
    const p = replica.pack(state);
    const t = level1(p);
    const out = newSpawnGeometry();
    spawnGeometry(p, t, 0, sc, 0, out);
    blockingSet(p, 0, t.exposure[0], 2, scratch);
    for (let s = 0; s < 100; s++) {
      if ((scratch[s >>> 5] & (1 << (s & 31))) !== 0) expect(p.pieceAt[s]).toBe(255);
    }
  });
  /**
   * E3.2 B3, the canonical fact behind the flag (`config.ts EvalFix
   * .infiltrationPerAnchor`, `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md`). The
   * case above pins `infiltrationAnchors` PER SIDE; what it cannot see is that
   * the ordered-pair relation it counts is SYMMETRIC — `s ∈ RECT[BLACK][a]` iff
   * `a ∈ RECT[WHITE][s]` with the corners at squares 0 and 99 — so the two
   * sides' counts are equal on every position and the `Infiltration` FEATURE,
   * which is the difference, is identically zero. `tests/ai/hard/
   * eval-correct.test.ts` carries the test on the difference; this is the
   * per-side statement of the same fact, next to the case it qualifies.
   */
  it('the pair count is the same for both sides, which is why the feature is zero (E3.2 B3)', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'black', x: 5, y: 9 },
        { def: 'water_1', owner: 'black', x: 9, y: 5 },
        { def: 'fire_1', owner: 'white', x: 9, y: 9 },
        { def: 'fire_1', owner: 'white', x: 7, y: 9 },
      ],
    });
    const p = replica.pack(state);
    const t = level1(p);
    const white = newSpawnGeometry();
    const black = newSpawnGeometry();
    spawnGeometry(p, t, 0, sc, 0, white);
    spawnGeometry(p, t, 1, sc, 0, black);
    expect(white.infiltrationAnchors).toBe(3);
    expect(black.infiltrationAnchors).toBe(white.infiltrationAnchors);
  });
});
