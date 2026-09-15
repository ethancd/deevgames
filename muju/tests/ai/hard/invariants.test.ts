// @vitest-environment node
/**
 * `eval/invariants.ts` (DESIGN §4.15, §5.13).
 *
 * `lab/hard-ai/suites/invariants.suite.json` (scored by
 * `lab/hard-ai/bench/run.ts --eval`) is the gate: twenty authored fixtures,
 * each setting exactly its own bit and nothing else. This file pins the
 * SEMANTICS of the individual tests on minimal hand-built boards — in
 * particular the four DESIGN §5.13 rows that had to be restated to be
 * computable on a post-turn macro node, so a later change to a restatement
 * fails here and not only in the suite.
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../src/ai/runtime';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { INVARIANT_COUNT, invariantBits, leadCc } from '../../../src/ai/hard/eval/invariants';
import { buildState, randomState, type StateSpec, type UnitSpec } from './game-fixture';

const replica = new Replica();
const SC = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const tables = allocTables();
const WHITE: Side = 0;

function bits(spec: StateSpec, side: Side = WHITE): number {
  const p = replica.pack(buildState(spec));
  return bitsOf(p, side);
}

function bitsOf(p: PackedState, side: Side): number {
  tables.keyLo = -1 >>> 0;
  tables.keyHi = -1 >>> 0;
  buildTables(p, SC, 0, 2, tables);
  return invariantBits(p, tables, side, SC, 0);
}

/** Invariant `i` (1-based) as a mask bit. */
function bit(i: number): number {
  return 1 << (i - 1);
}

function has(mask: number, i: number): boolean {
  return (mask & bit(i)) !== 0;
}

/** Black's quiet quarter: two slow bodies and a bank under a tier-1 price, so
 * nothing black does can set a white invariant by itself. */
const BLACK_QUIET: UnitSpec[] = [
  { def: 'shadow_1', owner: 'black', x: 8, y: 8 },
  { def: 'plant_1', owner: 'black', x: 7, y: 8 },
];

/** White's quiet baseline: spawn depth 4, bank over the liquidity floor. */
const WHITE_QUIET: UnitSpec[] = [
  { def: 'water_1', owner: 'white', x: 2, y: 2 },
  { def: 'metal_1', owner: 'white', x: 1, y: 3 },
];

function board(units: UnitSpec[], extra: Partial<StateSpec> = {}): StateSpec {
  return { units: [...units, ...BLACK_QUIET], white: 8, black: 2, current: 'black', phase: 'place', ...extra };
}

describe('invariantBits: shape', () => {
  it('returns a 20-bit mask and nothing above it', () => {
    const rng = seededRandom(4242);
    for (let i = 0; i < 200; i++) {
      const state = randomState(rng, 4 + Math.floor(rng() * 10), { current: 'black', phase: 'place' });
      let p: PackedState;
      try {
        p = replica.pack(state);
      } catch {
        continue;
      }
      const mask = bitsOf(p, WHITE);
      expect(mask).toBe(mask >>> 0);
      expect(mask < 1 << INVARIANT_COUNT).toBe(true);
      // 15 and 18 are structural (DESIGN §5.13): never set, on any position.
      expect(has(mask, 15)).toBe(false);
      expect(has(mask, 18)).toBe(false);
      // Deterministic: the same position twice gives the same mask.
      expect(bitsOf(p, WHITE)).toBe(mask);
    }
  });

  it('is quiet on the baseline both fixtures are built from', () => {
    expect(bits(board(WHITE_QUIET))).toBe(0);
  });
});

describe('invariantBits: the rows DESIGN §5.13 states over the position', () => {
  it('1 — no spawn square left with crystals in hand', () => {
    // The lone anchor is the corner itself, whose rectangle is the one square
    // it already occupies.
    expect(has(bits(board([{ def: 'water_1', owner: 'white', x: 0, y: 0 }])), 1)).toBe(true);
    expect(
      has(
        bits(
          board([
            { def: 'water_1', owner: 'white', x: 0, y: 0 },
            { def: 'metal_1', owner: 'white', x: 2, y: 2 },
          ]),
        ),
        1,
      ),
    ).toBe(false);
    // Under three crystals there is nothing to spend, so it is not a violation.
    expect(has(bits(board([{ def: 'water_1', owner: 'white', x: 0, y: 0 }], { white: 2 })), 1)).toBe(false);
  });

  it('2 — both corner neighbours sealed by own speed-1 miners', () => {
    const sealed = board([
      { def: 'plant_1', owner: 'white', x: 1, y: 0 },
      { def: 'plant_1', owner: 'white', x: 0, y: 1 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]);
    expect(has(bits(sealed), 2)).toBe(true);
    const half = board([
      { def: 'plant_1', owner: 'white', x: 1, y: 0 },
      { def: 'plant_1', owner: 'white', x: 2, y: 0 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]);
    expect(has(bits(half), 2)).toBe(false);
    // A speed-2 body on the neighbour can step aside, so it does not seal.
    const mobile = board([
      { def: 'plant_1', owner: 'white', x: 1, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]);
    expect(has(bits(mobile), 2)).toBe(false);
  });

  it('14 — the liquidity floor only bites on a turn that won nothing', () => {
    expect(has(bits(board(WHITE_QUIET, { white: 3 })), 14)).toBe(true);
    expect(has(bits(board(WHITE_QUIET, { white: 6 })), 14)).toBe(false);
    // A kill this turn (`lastAttackKilled`) pays for the empty bank.
    const won = board([{ ...WHITE_QUIET[0], atkCount: 1, lastAttackKilled: true }, WHITE_QUIET[1]], { white: 3 });
    expect(has(bits(won), 14)).toBe(false);
  });

  it('16 — the clock only counts against the side that is ahead', () => {
    const ahead = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }], { inactivityPlies: 7 });
    expect(has(bits(ahead), 16)).toBe(true);
    expect(has(bits(ahead, 1), 16)).toBe(false);
    const early = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }], { inactivityPlies: 6 });
    expect(has(bits(early), 16)).toBe(false);
    // With the draw rule off there is no clock to discipline.
    const noRule = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 1, y: 4 }], {
      inactivityPlies: 7,
      inactivityRule: 'off',
    });
    expect(has(bits(noRule), 16)).toBe(false);
  });
});

describe('invariantBits: the rows restated over the post-turn position', () => {
  it('8 and 9 split a chip by whether a kill was on the table, and never both fire', () => {
    // metal_1 next to black's shadow_1 one-shots it, so a kill IS available.
    const chipWithKill = board([
      { def: 'metal_1', owner: 'white', x: 8, y: 7, atkCount: 1, lastAttackKilled: false },
      { def: 'metal_1', owner: 'white', x: 1, y: 3 },
    ]);
    const withKill = bits(chipWithKill);
    expect(has(withKill, 8)).toBe(true);
    expect(has(withKill, 9)).toBe(false);

    // plant_1 has attack 0: nothing white owns can kill anything.
    const chipNoKill = board([
      { def: 'plant_1', owner: 'white', x: 2, y: 2, atkCount: 1, lastAttackKilled: false },
      { def: 'plant_1', owner: 'white', x: 1, y: 3 },
    ]);
    const noKill = bits(chipNoKill);
    expect(has(noKill, 8)).toBe(false);
    expect(has(noKill, 9)).toBe(true);

    // No attack at all: neither.
    const quiet = bits(
      board([
        { def: 'metal_1', owner: 'white', x: 8, y: 7 },
        { def: 'metal_1', owner: 'white', x: 1, y: 3 },
      ]),
    );
    expect(has(quiet, 8)).toBe(false);
    expect(has(quiet, 9)).toBe(false);
  });

  it('9 also sees a damaged enemy that is still alive', () => {
    // An `upkeepPending` node has not run `resetUnitActions` yet, so the
    // incoming player's damage is still on the board.
    const damaged = board([...WHITE_QUIET], { upkeepPending: true });
    damaged.units = damaged.units.map(u => (u.owner === 'black' && u.x === 8 ? { ...u, damage: 1 } : u));
    expect(has(bits(damaged), 9)).toBe(true);
  });

  it('5 — a miner bought this turn onto a thin cell with no job', () => {
    // (3,0) holds no ore at all; plant_1 mines 3, so it needs 6 to be worth it.
    const poor = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 3, y: 0, placedThisTurn: true }]);
    expect(has(bits(poor), 5)).toBe(true);
    // (3,4) holds 8.
    const fat = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 3, y: 4, placedThisTurn: true }]);
    expect(has(bits(fat), 5)).toBe(false);
    // The same square, but the body was already there before this turn.
    const old = board([...WHITE_QUIET, { def: 'plant_1', owner: 'white', x: 3, y: 0 }]);
    expect(has(bits(old), 5)).toBe(false);
    // A non-miner on the same thin square is not a poor MINER square.
    const runner = board([...WHITE_QUIET, { def: 'lightning_1', owner: 'white', x: 3, y: 0, placedThisTurn: true }]);
    expect(has(bits(runner), 5)).toBe(false);
  });

  it('7 — a promotion this turn into an upkeep bill nothing can carry', () => {
    const units: UnitSpec[] = [
      { def: 'lightning_3', owner: 'white', x: 2, y: 2, promotedThisPlacement: true },
      { def: 'lightning_3', owner: 'white', x: 1, y: 3 },
    ];
    expect(has(bits(board(units, { white: 6 })), 7)).toBe(true);
    const unpromoted: UnitSpec[] = [
      { def: 'lightning_3', owner: 'white', x: 2, y: 2 },
      { def: 'lightning_3', owner: 'white', x: 1, y: 3 },
    ];
    expect(has(bits(board(unpromoted, { white: 6 })), 7)).toBe(false);
  });

  it('17 — this turn\'s purchase blocked the only way out of the home pocket', () => {
    const blocked = board([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'lightning_1', owner: 'white', x: 1, y: 0, placedThisTurn: true },
      { def: 'water_1', owner: 'white', x: 3, y: 2 },
    ]);
    expect(has(bits(blocked), 17)).toBe(true);
    const clear = board([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'lightning_1', owner: 'white', x: 2, y: 0, placedThisTurn: true },
      { def: 'water_1', owner: 'white', x: 3, y: 2 },
    ]);
    expect(has(bits(clear), 17)).toBe(false);
    // Nothing was bought this turn: the same board cannot self-block.
    const notPlaced = board([
      { def: 'water_1', owner: 'white', x: 0, y: 0 },
      { def: 'shadow_1', owner: 'white', x: 0, y: 1 },
      { def: 'lightning_1', owner: 'white', x: 1, y: 0 },
      { def: 'water_1', owner: 'white', x: 3, y: 2 },
    ]);
    expect(has(bits(notPlaced), 17)).toBe(false);
  });

  it('20 — the body that made the kill has nowhere black does not already cover', () => {
    const boxed = board([
      { def: 'metal_1', owner: 'white', x: 8, y: 9, atkCount: 1, lastAttackKilled: true },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]);
    expect(has(bits(boxed), 20)).toBe(true);
    const safe = board([
      { def: 'metal_1', owner: 'white', x: 2, y: 3, atkCount: 1, lastAttackKilled: true },
      { def: 'water_1', owner: 'white', x: 2, y: 2 },
    ]);
    expect(has(bits(safe), 20)).toBe(false);
  });
});

describe('leadCc', () => {
  it('is the catalogue material plus bank difference, in centi-crystals', () => {
    const p = replica.pack(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 2, y: 2 },
          { def: 'plant_1', owner: 'black', x: 7, y: 7 },
        ],
        white: 5,
        black: 1,
        current: 'black',
        phase: 'place',
      }),
    );
    // fire_1 costs 3, plant_1 costs 5; the bank difference is 4 crystals.
    expect(leadCc(p, WHITE)).toBe(300 - 500 + 400);
    expect(leadCc(p, 1)).toBe(-(300 - 500 + 400));
  });
});
