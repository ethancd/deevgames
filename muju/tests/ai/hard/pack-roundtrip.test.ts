// @vitest-environment node
/**
 * `pack` / `unpack` (DESIGN §3.1, §4.4), PHASING ONLY as of M2.
 *
 * The gate criterion is the `pack -> unpack -> pack` fixed point on every
 * corpus position: `authored.jsonl` (11), `openings.jsonl` (the 797 census end
 * positions) and `fuzz-1000.jsonl` (the fuzzer's stratified macro-node sample).
 * The corpus predates Phasing and stores no ruleset, so each position is read
 * through `asPhasing` — a Phasing position over the same board, never a
 * conversion of a Standard match (see `asPhasing`'s own note, and the
 * `PackError` test below, which pins that `pack` refuses to do it silently).
 *
 * The rest pins the field-by-field mapping including the square-keyed
 * commitment plane, the `PackError` contract and the places where the round
 * trip is deliberately lossy.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { createInitialGameState } from '../../../src/game/board';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getAttackCount } from '../../../src/game/combat';
import { isLegalAction } from '../../../src/game/legality';
import { generateAllActions } from '../../../src/ai/moves';
import { seededRandom } from '../../../src/ai/runtime';
import {
  F_CAN_ACT,
  F_LAST_KILLED,
  F_PLACED,
  F_PROMOTED,
  PEND_STRIDE,
  Reason,
  Result,
} from '../../../src/ai/hard/types';
import { DEF_ID, DEF_INDEX } from '../../../src/ai/hard/core/catalog';
import { PackError, Replica, allocState, copyState } from '../../../src/ai/hard/core/state';
import { readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import { asPhasing, buildState, buildSummon, randomState } from './game-fixture';

// E0.5 timeout budget: slowest test 0.3 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const replica = new Replica();
const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../lab/hard-ai/positions');

function corpus(): StoredPosition[] {
  return [
    ...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')),
    ...readPositions(path.join(CORPUS_DIR, 'openings.jsonl')),
    ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')),
  ];
}

/**
 * Commitments on the first `n` squares the mover could legally buy onto, so a
 * corpus position also exercises the pending plane. The costs are catalogue
 * costs, which is all `pack` admits.
 */
function withCommitments(state: GameState, n: number): GameState {
  const player = state.turn.currentPlayer;
  const squares = getAllSpawnPositions(player, state.board).slice(0, n);
  return asPhasing(
    state,
    squares.map((position, i) => buildSummon({ def: i % 2 === 0 ? 'fire_1' : 'plant_1', owner: player, x: position.x, y: position.y }, i)),
  );
}

describe('pack / unpack', () => {
  it('pack -> unpack -> pack is a fixed point on every corpus position', () => {
    const positions = corpus();
    expect(positions.length).toBe(11 + 797 + 1000);
    const a = allocState();
    const b = allocState();
    let withPendings = 0;
    for (const stored of positions) {
      for (const state of [asPhasing(stored.state), withCommitments(stored.state, 3)]) {
        replica.pack(state, a);
        replica.pack(replica.unpack(a), b);
        expect(replica.digest(b)).toBe(replica.digest(a));
        // ...and the second round trip is still the same state.
        replica.pack(replica.unpack(b), b);
        expect(replica.digest(b)).toBe(replica.digest(a));
        if (a.pendCount[0] + a.pendCount[1] > 0) withPendings++;
      }
    }
    // The commitment plane must actually have been exercised.
    expect(withPendings).toBeGreaterThan(500);
  });

  it('unpack emits ruleset "phasing" and the commitments, square ascending per side', () => {
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 1, id: 'w0' },
        { def: 'plant_1', owner: 'black', x: 9, y: 8, id: 'b0' },
      ],
      phase: 'place',
      white: 20,
      black: 20,
      pendingSummons: [
        { def: 'water_1', owner: 'white', x: 1, y: 1, id: 'later' },
        { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'earlier' },
        { def: 'metal_1', owner: 'black', x: 9, y: 9, id: 'theirs' },
      ],
    });
    const p = replica.pack(state);
    const back = replica.unpack(p);
    expect(back.ruleset).toBe('phasing');
    // Buy ORDER is deliberately forgotten: the plane is square-keyed, so the
    // commitments come back white-then-black, square ascending.
    expect((back.pendingSummons ?? []).map(s => `${s.owner}.${s.position.y * 10 + s.position.x}.${s.definitionId}.${s.cost}.${s.id}`)).toEqual([
      'white.0.fire_1.3.earlier',
      'white.11.water_1.4.later',
      'black.99.metal_1.5.theirs',
    ]);
    // The ids are carried purely for fidelity; a commitment the search created
    // has none, and gets a deterministic square-derived name instead.
    const anonymous = replica.pack(state, allocState());
    anonymous.pendIds.length = 0;
    expect((replica.unpack(anonymous).pendingSummons ?? []).map(s => s.id)).toEqual([
      'pending-white-0',
      'pending-white-11',
      'pending-black-99',
    ]);
  });

  it('the unpacked state is legally equivalent: the canonical action set is unchanged', () => {
    const positions = [...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')), ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')).slice(0, 200)];
    for (const stored of positions) {
      if (stored.state.phase !== 'playing') continue;
      const state = withCommitments(stored.state, 2);
      const round = replica.unpack(replica.pack(state));
      const before = generateAllActions(state, state.turn.currentPlayer).map(describeAction).sort();
      const after = generateAllActions(round, round.turn.currentPlayer).map(describeAction).sort();
      expect(after).toEqual(before);
      for (const action of generateAllActions(round, round.turn.currentPlayer)) {
        expect(isLegalAction(round, action)).toBe(true);
      }
    }
  });

  it('every PackedState field mirrors the GameState field DESIGN §3.1 names', () => {
    const state = buildState({
      units: [
        { def: 'metal_3', owner: 'white', x: 2, y: 3, damage: 4, atkCount: 2, canAct: false, lastAttackKilled: true },
        { def: 'plant_1', owner: 'black', x: 7, y: 8, placedThisTurn: true, promotedThisPlacement: true },
      ],
      white: 11,
      black: 17,
      whiteGained: 40,
      blackGained: 20,
      current: 'black',
      phase: 'place',
      actions: 2,
      turnNumber: 9,
      upkeepPending: true,
      inactivityPlies: 6,
      progressThisTurn: true,
      victoryRule: 'elimination',
      inactivityRule: 'off',
      reviewUpkeep: { white: true, black: false },
      handicap: 3,
      pendingSummons: [{ def: 'water_1', owner: 'black', x: 6, y: 8, id: 'pending-a' }],
    });
    const p = replica.pack(state);
    expect(p.sq[0]).toBe(32);
    expect(DEF_ID[p.defId[0]]).toBe('metal_3');
    expect(p.owner[0]).toBe(0);
    expect(p.damage[0]).toBe(4);
    expect(p.atkCount[0]).toBe(2);
    expect(p.uflags[0]).toBe(F_LAST_KILLED);
    expect(p.uflags[1]).toBe(F_CAN_ACT | F_PLACED | F_PROMOTED);
    expect(p.slotCount).toBe(2);
    expect(p.pieceAt[32]).toBe(0);
    expect(p.pieceAt[87]).toBe(1);
    expect([...p.bank]).toEqual([11, 17]);
    expect([...p.gained]).toEqual([40, 20]);
    expect(p.side).toBe(1);
    expect(p.phase).toBe(0);
    expect(p.actions).toBe(2);
    expect(p.turnNumber).toBe(9);
    expect(p.upkeepPending).toBe(1);
    expect(p.clock).toBe(6);
    expect(p.progress).toBe(1);
    expect(p.handicap).toBe(3);
    expect(p.victoryHome).toBe(0);
    expect(p.drawRuleOn).toBe(0);
    expect([...p.reviewUpkeep]).toEqual([1, 0]);
    expect(p.result).toBe(Result.ONGOING);
    expect(p.reason).toBe(Reason.NONE);
    expect(p.originIds[0]).toBe('u0');
    // The commitment plane: `[side * 100 + sq]`, `defId + 1`, exact paid cost,
    // plus the derived bitboard and counters `rehash` rebuilds.
    const i = 1 * PEND_STRIDE + 86;
    expect(p.pendDef[i]).toBe((DEF_INDEX.get('water_1') as number) + 1);
    expect(p.pendCost[i]).toBe(4);
    expect(p.pendIds[i]).toBe('pending-a');
    expect(p.pendBB[1 * 4 + (86 >>> 5)]).toBe(1 << (86 & 31));
    expect([...p.pendCount]).toEqual([0, 1]);
    expect([...p.pendCostSum]).toEqual([0, 4]);
    // A commitment is NOT a unit: it occupies nothing and owns no slot.
    expect(p.pieceAt[86]).toBe(255);
    expect(p.slotCount).toBe(2);
  });

  it('atkCount is getAttackCount, so a legacy hasAttacked-only unit packs as 1', () => {
    const state = buildState({ units: [{ def: 'fire_3', owner: 'white', x: 0, y: 0 }] });
    state.board.units[0] = { ...state.board.units[0], hasAttacked: true, attackedThisTurn: undefined };
    expect(getAttackCount(state.board.units[0])).toBe(1);
    expect(replica.pack(state).atkCount[0]).toBe(1);
  });

  it('a victory state packs its result and reason, and unpacks back to phase victory', () => {
    for (const [reason, code] of [
      ['elimination', Reason.ELIMINATION],
      ['upkeep-elimination', Reason.UPKEEP_ELIMINATION],
      ['home-occupation', Reason.HOME_OCCUPATION],
      ['home-checkmate', Reason.HOME_CHECKMATE],
      ['inactivity', Reason.INACTIVITY],
      ['resignation', Reason.RESIGNATION],
    ] as const) {
      const won: GameState = {
        ...buildState({ units: [{ def: 'fire_1', owner: 'black', x: 0, y: 0 }] }),
        phase: 'victory',
        winner: 'black',
        victoryReason: reason,
      };
      const p = replica.pack(won);
      expect(p.result).toBe(Result.BLACK_WIN);
      expect(p.reason).toBe(code);
      const back = replica.unpack(p);
      expect(back.phase).toBe('victory');
      expect(back.winner).toBe('black');
      expect(back.victoryReason).toBe(reason);
    }
    const drawn: GameState = {
      ...buildState({ units: [{ def: 'fire_1', owner: 'black', x: 0, y: 0 }] }),
      phase: 'victory',
      winner: null,
      victoryReason: 'inactivity',
    };
    expect(replica.pack(drawn).result).toBe(Result.DRAW);
  });

  it('pack throws PackError on every input DESIGN §3.1 and M2 item A reject', () => {
    const base = buildState({ units: [{ def: 'fire_1', owner: 'white', x: 0, y: 0 }] });

    // M2 item A: the replica is Phasing-only, and a MISSING ruleset means
    // Standard (rules.ts:4) — never silently reinterpreted as Phasing.
    const standard: GameState = { ...base, ruleset: 'standard' };
    expect(() => replica.pack(standard)).toThrow(PackError);
    expect(() => replica.pack(standard)).toThrow(/ruleset "standard" is not "phasing"/);
    const { ruleset: _dropped, ...noRuleset } = base;
    expect(() => replica.pack(noRuleset as GameState)).toThrow(/ruleset "standard"/);

    // A commitment whose stored cost is not the catalogue cost carries
    // information the packed form cannot represent (the plane hashes the
    // DEFINITION only), so it is refused rather than quietly rounded.
    const wrongCost: GameState = {
      ...base,
      pendingSummons: [{ ...buildSummon({ def: 'fire_1', owner: 'white', x: 1, y: 0 }, 0), cost: 2 }],
    };
    expect(() => replica.pack(wrongCost)).toThrow(/paid 2, catalogue cost of "fire_1" is 3/);

    const unknownSummonDef: GameState = {
      ...base,
      pendingSummons: [{ ...buildSummon({ def: 'fire_1', owner: 'white', x: 1, y: 0 }, 0), definitionId: 'chimera_9' }],
    };
    expect(() => replica.pack(unknownSummonDef)).toThrow(/unknown definitionId "chimera_9"/);

    // `hasPendingSummon` makes this unreachable in play; the square-keyed plane
    // cannot hold two, so it is refused rather than losing one.
    const doubled: GameState = {
      ...base,
      pendingSummons: [
        buildSummon({ def: 'fire_1', owner: 'white', x: 1, y: 0, id: 'a' }, 0),
        buildSummon({ def: 'plant_1', owner: 'white', x: 1, y: 0, id: 'b' }, 1),
      ],
    };
    expect(() => replica.pack(doubled)).toThrow(/two pending summons on square 1/);

    // ...but the two sides may each hold one on the same square.
    const shared: GameState = {
      ...base,
      pendingSummons: [
        buildSummon({ def: 'fire_1', owner: 'white', x: 1, y: 0, id: 'a' }, 0),
        buildSummon({ def: 'fire_1', owner: 'black', x: 1, y: 0, id: 'b' }, 1),
      ],
    };
    expect([...replica.pack(shared, allocState()).pendCount]).toEqual([1, 1]);

    const setup: GameState = { ...base, phase: 'setup' };
    expect(() => replica.pack(setup)).toThrow(PackError);

    const sixActions = { ...base, actionsPerTurn: 6 } as unknown as GameState;
    expect(() => replica.pack(sixActions)).toThrow(PackError);

    const unknownDef: GameState = {
      ...base,
      board: { ...base.board, units: [{ ...base.board.units[0], definitionId: 'chimera_9' }] },
    };
    expect(() => replica.pack(unknownDef)).toThrow(PackError);

    const badReserve: GameState = {
      ...base,
      board: {
        ...base.board,
        cells: base.board.cells.map((row, y) => row.map((c, x) => (x === 3 && y === 3 ? { ...c, resourceLayers: 17 } : c))),
      },
    };
    expect(() => replica.pack(badReserve)).toThrow(PackError);

    const tooMany: GameState = {
      ...base,
      board: {
        ...base.board,
        units: Array.from({ length: 129 }, (_, i) => ({ ...base.board.units[0], id: `u${i}`, position: { x: i % 10, y: (i / 10) | 0 } })),
      },
    };
    expect(() => replica.pack(tooMany)).toThrow(PackError);
  });

  it('copyState produces an independent, digest-identical state', () => {
    const rng = seededRandom(0x434f5059);
    const dst = allocState();
    for (let i = 0; i < 200; i++) {
      const p = replica.pack(randomState(rng, 1 + Math.floor(rng() * 10), {
        pendingSummons: [{ def: 'fire_1', owner: 'white', x: i % 10, y: 0 }],
        white: 9,
      }));
      copyState(dst, p);
      expect(replica.digest(dst)).toBe(replica.digest(p));
      expect(dst.originIds).toEqual(p.originIds);
      expect([...dst.pendDef]).toEqual([...p.pendDef]);
      expect([...dst.pendCost]).toEqual([...p.pendCost]);
      expect([...dst.pendBB]).toEqual([...p.pendBB]);
      expect([...dst.pendCount]).toEqual([...p.pendCount]);
      expect([...dst.pendCostSum]).toEqual([...p.pendCostSum]);
      expect(dst.pendIds).toEqual(p.pendIds);
      dst.sq[0] = 99;
      dst.bank[0] += 5;
      // Black square 99, which the white-only fixture never commits to.
      dst.pendDef[PEND_STRIDE + 99] = 1;
      expect(p.bank[0]).not.toBe(dst.bank[0]);
      expect(p.pendDef[PEND_STRIDE + 99]).toBe(0);
      replica.check(p);
    }
  });

  it('the initial position packs the numbers ET §8.1 quotes, and starts in ACT', () => {
    const p = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
    expect(p.slotCount).toBe(6);
    expect(p.side).toBe(0);
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    expect(p.turnNumber).toBe(1);
    expect([...p.bank]).toEqual([0, 0]);
    let reserve = 0;
    for (let s = 0; s < 100; s++) reserve += p.reserve[s];
    expect(reserve).toBe(504);
    // "Both players begin their first turn in Act": no commitments, ACT phase.
    expect([...p.pendCount]).toEqual([0, 0]);
    expect(p.upkeepPending).toBe(0);
    replica.check(p);
  });
});

function describeAction(a: ReturnType<typeof generateAllActions>[number]): string {
  return JSON.stringify(a);
}
