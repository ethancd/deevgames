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
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../src/ai/runtime';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { INVARIANT_COUNT, invariantBits, leadCc } from '../../../src/ai/hard/eval/invariants';
import { buildState, randomState, type StateSpec, type UnitSpec } from './game-fixture';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { isLegalAction } from '../../../src/game/legality';
import { canAttack } from '../../../src/game/combat';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 0.2 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

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
    const root = (withFreshAttacker: boolean) => buildState({
      current: 'white', phase: 'action', actions: 4, white: 8, black: 8,
      reserves: new Array<number>(100).fill(0), units: [
        { def: 'water_1', owner: 'white', x: 2, y: 2, id: 'chipper' },
        ...(withFreshAttacker ? [{ def: 'fire_1', owner: 'white' as const, x: 6, y: 6, id: 'fresh' }] : []),
        { def: 'metal_3', owner: 'black', x: 3, y: 2, id: 'durable-target' },
        { def: 'fire_1', owner: 'black', x: 7, y: 6, id: 'kill-target' },
      ],
    });
    const play = (state: GameState, actions: AIAction[]): GameState => {
      for (const action of actions) {
        expect(state.phase).toBe('playing');
        expect(state.turn.currentPlayer).toBe('white');
        expect(isLegalAction(state, action)).toBe(true);
        const next = applyAction(state, action);
        expect(next).not.toBe(state);
        state = next;
      }
      return state;
    };
    const chip: AIAction = { type: 'ATTACK', unitId: 'chipper', targetPosition: { x: 3, y: 2 } };
    const finish: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
    const handoff = (state: GameState) => {
      const end = play(state, finish);
      expect(end.phase).toBe('playing');
      expect(end.turn).toMatchObject({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4 });
      expect(end.upkeepPending).toBe(false);
      // Incoming Black heals; only White's authentic nonlethal-attack flag
      // remains as evidence of the chip on this post-turn position.
      expect(end.board.units.filter(u => u.owner === 'black').every(u => u.damageTaken === 0)).toBe(true);
      return end;
    };

    const chippedWithKill = play(root(true), [chip]);
    expect(chippedWithKill.turn.actionsRemaining).toBe(3);
    expect(chippedWithKill.board.units.find(u => u.id === 'durable-target')!.damageTaken).toBeGreaterThan(0);
    expect(canAttack(chippedWithKill.board.units.find(u => u.id === 'chipper')!)).toBe(false);
    expect(canAttack(chippedWithKill.board.units.find(u => u.id === 'fresh')!)).toBe(true);
    // A DISTINCT unused attacker can take the kill. The old fixture reused a
    // tier-I attacker after its nonlethal hit, which cannot unlock another hit.
    const lethal: AIAction = { type: 'ATTACK', unitId: 'fresh', targetPosition: { x: 7, y: 6 } };
    const alternative = play(chippedWithKill, [lethal]);
    expect(alternative.board.units.some(u => u.id === 'kill-target')).toBe(false);
    expect(alternative.board.units.some(u => u.id === 'durable-target')).toBe(true);
    const withKill = bitsOf(replica.pack(handoff(chippedWithKill)), WHITE);
    expect(has(withKill, 8)).toBe(true);
    expect(has(withKill, 9)).toBe(false);

    // Without the fresh body, the only attacker has closed its chain. Moving
    // cannot restore an attack, and Prepare cannot grant another current Act.
    const chippedNoKill = play(root(false), [chip]);
    expect(chippedNoKill.board.units.filter(u => u.owner === 'white').every(u => !canAttack(u))).toBe(true);
    expect(isLegalAction(chippedNoKill, chip)).toBe(false);
    const noKill = bitsOf(replica.pack(handoff(chippedNoKill)), WHITE);
    expect(has(noKill, 8)).toBe(false);
    expect(has(noKill, 9)).toBe(true);

    // The same lethal alternative exists, but without a chip neither bit fires.
    const quiet = bitsOf(replica.pack(handoff(root(true))), WHITE);
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

/**
 * E3.2 B4 (`config.ts EvalFix.inv3RetreatConjunct`,
 * `docs/hard-ai/e3/E3.2-CORRECTNESS-ARM.md`). The champion's invariant 3 is
 * pinned above as the engine actually computes it; this block pins what the
 * FLAG changes, and only that: the second conjunct of DESIGN §5.13 row 3,
 * "and the attacker has `retreats > 0`" (DESIGN.md:1448). Nothing above is
 * edited — with the flag absent the bit is exactly what it was.
 */
describe('eval/invariants.ts — invariant 3 under EvalFix.inv3RetreatConjunct (E3.2 B4)', () => {
  const VICTIM: UnitSpec = { def: 'metal_1', owner: 'white', x: 4, y: 4 };
  /** A second white body, far away: a lethal hit on the defender's LAST unit is
   * STRAND, not RETREAT (`tables/approach.ts`), so the pair needs it. */
  const SPARE: UnitSpec = { def: 'metal_1', owner: 'white', x: 0, y: 9 };
  const ATTACKER: UnitSpec = { def: 'fire_2', owner: 'black', x: 6, y: 4 };
  /** Three white bodies that put every escape square of the attacker inside
   * White's own strike, so `t.retreats === 0`. */
  const WALL: UnitSpec[] = [
    { def: 'plant_1', owner: 'white', x: 6, y: 2 },
    { def: 'plant_1', owner: 'white', x: 6, y: 6 },
    { def: 'plant_1', owner: 'white', x: 8, y: 4 },
  ];

  function bitsWithFix(units: UnitSpec[], on: boolean): number {
    const p = replica.pack(buildState({ units, reserves: new Array<number>(100).fill(0) }));
    const t = allocTables();
    t.evalFix = on ? { inv3RetreatConjunct: true } : null;
    buildTables(p, SC, 0, 2, t);
    return invariantBits(p, t, WHITE, SC, 0);
  }

  it('keeps the bit when the attacker has a retreat square, clears it when it has none', () => {
    const available = [VICTIM, SPARE, ATTACKER];
    const denied = [VICTIM, SPARE, ATTACKER, ...WALL];
    // The champion cannot tell the two apart.
    expect(has(bitsWithFix(available, false), 3)).toBe(true);
    expect(has(bitsWithFix(denied, false), 3)).toBe(true);
    // DESIGN's predicate can.
    expect(has(bitsWithFix(available, true), 3)).toBe(true);
    expect(has(bitsWithFix(denied, true), 3)).toBe(false);
  });

  it('changes no other invariant bit on either member', () => {
    for (const units of [[VICTIM, SPARE, ATTACKER], [VICTIM, SPARE, ATTACKER, ...WALL]]) {
      const off = bitsWithFix(units, false);
      const on = bitsWithFix(units, true);
      expect((off ^ on) & ~bit(3)).toBe(0);
    }
  });
});
