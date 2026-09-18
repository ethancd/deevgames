// @vitest-environment node
/**
 * `pack` / `unpack` (DESIGN §3.1, §4.4).
 *
 * The gate criterion is the `pack -> unpack -> pack` fixed point on every
 * corpus position: `authored.jsonl` (11), `openings.jsonl` (the 797 census end
 * positions) and `fuzz-1000.jsonl` (the M5 fuzzer's stratified macro-node
 * sample). The rest pins the field-by-field mapping, the `PackError` contract
 * and the two places where the round trip is deliberately lossy.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { createInitialGameState } from '../../../src/game/board';
import { getAttackCount } from '../../../src/game/combat';
import { isLegalAction } from '../../../src/game/legality';
import { generateAllActions } from '../../../src/ai/moves';
import { seededRandom } from '../../../src/ai/runtime';
import {
  F_CAN_ACT,
  F_LAST_KILLED,
  F_PLACED,
  F_PROMOTED,
  Reason,
  Result,
} from '../../../src/ai/hard/types';
import { DEF_ID } from '../../../src/ai/hard/core/catalog';
import { PackError, Replica, allocState, copyState } from '../../../src/ai/hard/core/state';
import { readPositions, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';
import { buildState, randomState } from './game-fixture';

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

describe('pack / unpack', () => {
  it('pack -> unpack -> pack is a fixed point on every corpus position', () => {
    const positions = corpus();
    expect(positions.length).toBe(11 + 797 + 1000);
    const a = allocState();
    const b = allocState();
    for (const stored of positions) {
      replica.pack(stored.state, a);
      replica.pack(replica.unpack(a), b);
      expect(replica.digest(b)).toBe(replica.digest(a));
      // ...and the second round trip is still the same state.
      replica.pack(replica.unpack(b), b);
      expect(replica.digest(b)).toBe(replica.digest(a));
    }
  });

  it('the unpacked state is legally equivalent: the canonical action set is unchanged', () => {
    const positions = [...readPositions(path.join(CORPUS_DIR, 'authored.jsonl')), ...readPositions(path.join(CORPUS_DIR, 'fuzz-1000.jsonl')).slice(0, 200)];
    for (const stored of positions) {
      const state = stored.state;
      if (state.phase !== 'playing') continue;
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

  it('pack throws PackError on the five inputs DESIGN §3.1 rejects', () => {
    const base = buildState({ units: [{ def: 'fire_1', owner: 'white', x: 0, y: 0 }] });

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
      const p = replica.pack(randomState(rng, 1 + Math.floor(rng() * 10)));
      copyState(dst, p);
      expect(replica.digest(dst)).toBe(replica.digest(p));
      expect(dst.originIds).toEqual(p.originIds);
      dst.sq[0] = 99;
      dst.bank[0] += 5;
      expect(p.bank[0]).not.toBe(dst.bank[0]);
      replica.check(p);
    }
  });

  it('the initial position packs the numbers ET §8.1 quotes', () => {
    const p = replica.pack(createInitialGameState());
    expect(p.slotCount).toBe(6);
    expect(p.side).toBe(0);
    expect(p.phase).toBe(1);
    expect(p.actions).toBe(4);
    expect(p.turnNumber).toBe(1);
    expect([...p.bank]).toEqual([0, 0]);
    let reserve = 0;
    for (let s = 0; s < 100; s++) reserve += p.reserve[s];
    expect(reserve).toBe(504);
    replica.check(p);
  });
});

function describeAction(a: ReturnType<typeof generateAllActions>[number]): string {
  return JSON.stringify(a);
}
