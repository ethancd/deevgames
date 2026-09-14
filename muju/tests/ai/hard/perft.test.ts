// @vitest-environment node
/**
 * Perft regression (DESIGN §7.2) and position-corpus sanity checks (§7.5).
 * The frozen numbers themselves are re-verified end-to-end by
 * `npm run hard:perft -- --check` (the M1 gate); this file pins the same
 * three seed values at the unit-test level and exercises `corpus.ts`
 * (`readPositions`/`mirror180`) and the 11 authored fixtures / 797 openings
 * this milestone generates.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createInitialGameState } from '../../../src/game/board';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import { perftActions, perftMidStates, perftTurns, enumerateTurn } from '../../../src/ai/hard/verify/perft';
import { readPositions, mirror180, type StoredPosition } from '../../../lab/hard-ai/positions/corpus';

const POSITIONS_DIR = path.resolve(__dirname, '../../../lab/hard-ai/positions');
const AUTHORED_PATH = path.join(POSITIONS_DIR, 'authored.jsonl');
const OPENINGS_PATH = path.join(POSITIONS_DIR, 'openings.jsonl');

describe('canonical perft seed values (ET §8.1)', () => {
  const initial = createInitialGameState();

  it('perftActions(initial, 4) === 14959', () => {
    expect(perftActions(initial, 4)).toBe(14959);
  });

  it('perftMidStates(initial) === 1053', () => {
    expect(perftMidStates(initial)).toBe(1053);
  });

  it('perftTurns(initial) === 797', () => {
    expect(perftTurns(initial)).toBe(797);
  });

  it('is deterministic across repeated calls', () => {
    const a = enumerateTurn(initial, 4);
    const b = enumerateTurn(initial, 4);
    expect(b).toEqual(a);
  });

  it('counts nothing beyond a depth-0 budget except the immediate END_ACTION_PHASE choice', () => {
    // At the initial position END_ACTION_PHASE is legal turn 1 (a player may
    // pass with actions unused), so exactly one sequence completes at depth 0.
    const r = enumerateTurn(initial, 0);
    expect(r.sequences).toBe(1);
    expect(r.endPositions).toBe(1);
  });
});

describe('authored.jsonl (11 fixtures, DESIGN §7.2)', () => {
  const positions = readPositions(AUTHORED_PATH);
  const expectedIds = [
    'occupied-corner', 'blocked-rectangle', 'cleave-chain', 'clock-9', 'upkeep-pending',
    'rich-place', 'promotion-kill', 'home-race', 'endgame-dry', 'handicap-3', 'place-autoskip',
  ];

  it('has exactly the 11 expected ids, each schema muju-position-v1', () => {
    expect(positions).toHaveLength(11);
    expect(positions.map(p => p.id).sort()).toEqual([...expectedIds].sort());
    for (const p of positions) expect(p.schema).toBe('muju-position-v1');
  });

  it('every fixture is a legal, playing GameState with a well-formed rules block', () => {
    for (const p of positions) {
      expect(p.state.phase).toBe('playing');
      expect(() => generateAllActions(p.state, p.state.turn.currentPlayer)).not.toThrow();
      expect(p.rules.combatHandicap).toEqual({ white: 0, black: 0 });
      expect(['on', 'off']).toContain(p.rules.inactivityRule);
      expect(['elimination', 'home-or-elimination']).toContain(p.rules.victoryRule);
    }
  });

  it('perftActions at each fixture\'s frozen depth is a non-negative integer', () => {
    for (const p of positions) {
      const depth = p.depth ?? 4;
      const n = perftActions(p.state, depth);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
    // Explicit timeout: this walks all 11 fixtures at their frozen depths
    // (~3.5 s on an idle box) and would flake against vitest's 5 s default
    // when the whole suite runs in parallel.
  }, 120_000);

  it('occupied-corner: a black unit sits on white\'s home corner (0,0)', () => {
    const p = find(positions, 'occupied-corner');
    expect(p.state.board.units.some(u => u.owner === 'black' && u.position.x === 0 && u.position.y === 0)).toBe(true);
  });

  it('upkeep-pending: due (4) exceeds bank (0), and only PAY_UPKEEP candidates are legal', () => {
    const p = find(positions, 'upkeep-pending');
    expect(p.state.upkeepPending).toBe(true);
    const actions = generateAllActions(p.state, p.state.turn.currentPlayer);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(a => a.type === 'PAY_UPKEEP')).toBe(true);
  });

  it('cleave-chain: the same attacker can chain-kill all three adjacent DEF-1 targets', () => {
    const p = find(positions, 'cleave-chain');
    let state = p.state;
    for (let i = 0; i < 3; i++) {
      const atk = generateAllActions(state, 'white').find(a => a.type === 'ATTACK');
      expect(atk, `expected an available attack before kill ${i}`).toBeDefined();
      const before = state.board.units.length;
      state = applyAction(state, atk!);
      expect(state.board.units.length).toBe(before - 1);
    }
  });

  it('handicap-3: blackCrystalHandicap = 3 and black starts with 3 resources', () => {
    const p = find(positions, 'handicap-3');
    expect(p.state.blackCrystalHandicap).toBe(3);
    expect(p.state.players.black.resources).toBe(3);
    expect(p.rules.handicap).toBe(3);
  });

  it('place-autoskip: only END_PLACE_PHASE is legal', () => {
    const p = find(positions, 'place-autoskip');
    const actions = generateAllActions(p.state, p.state.turn.currentPlayer);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('END_PLACE_PHASE');
  });
});

describe('openings.jsonl (797 census end positions, replayed via canonical applyAction)', () => {
  const positions = readPositions(OPENINGS_PATH);

  it('has exactly 797 entries, all schema muju-position-v1', () => {
    expect(positions).toHaveLength(797);
    for (const p of positions) expect(p.schema).toBe('muju-position-v1');
  });

  it('every opening hands the turn to Black at a legal, playing GameState', () => {
    for (const p of positions) {
      expect(p.state.phase).toBe('playing');
      expect(p.state.turn.currentPlayer).toBe('black');
      expect(p.state.turn.phase).toBe('action');
    }
  });

  it('has 797 distinct board layouts (no duplicate end positions)', () => {
    const keys = new Set(
      positions.map(p =>
        [...p.state.board.units]
          .map(u => `${u.position.x},${u.position.y}:${u.owner}:${u.definitionId}`)
          .sort()
          .join('|'),
      ),
    );
    expect(keys.size).toBe(797);
  });

  it('ids are unique and sequential opening-001..opening-797', () => {
    const ids = positions.map(p => p.id).sort();
    const expected = Array.from({ length: 797 }, (_, i) => `opening-${String(i + 1).padStart(3, '0')}`).sort();
    expect(ids).toEqual(expected);
  });
});

describe('corpus.ts mirror180 (DESIGN F10, core/tables.ts rot180)', () => {
  it('flips every unit\'s square (99 - s) and swaps owner', () => {
    const initial = createInitialGameState();
    const mirrored = mirror180(initial);
    expect(mirrored.board.units).toHaveLength(initial.board.units.length);
    for (const u of initial.board.units) {
      const flipped = mirrored.board.units.find(v => v.id === u.id);
      expect(flipped).toBeDefined();
      expect(flipped!.position).toEqual({ x: 9 - u.position.x, y: 9 - u.position.y });
      expect(flipped!.owner).toBe(u.owner === 'white' ? 'black' : 'white');
    }
  });

  it('swaps currentPlayer and player resource pools', () => {
    const initial = createInitialGameState();
    const withBank = { ...initial, players: { white: { ...initial.players.white, resources: 5 }, black: { ...initial.players.black, resources: 9 } } };
    const mirrored = mirror180(withBank);
    expect(mirrored.turn.currentPlayer).toBe('black');
    expect(mirrored.players.white.resources).toBe(9);
    expect(mirrored.players.black.resources).toBe(5);
  });

  it('is an involution (mirror180(mirror180(s)) deep-equals s) on every authored fixture', () => {
    const positions = readPositions(AUTHORED_PATH);
    for (const p of positions) {
      expect(mirror180(mirror180(p.state))).toEqual(p.state);
    }
  });

  it('mirrors resourceLayers per-cell (cell (x,y) <- cell (9-x,9-y))', () => {
    const initial = createInitialGameState();
    const mirrored = mirror180(initial);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(mirrored.board.cells[y][x].resourceLayers).toBe(initial.board.cells[9 - y][9 - x].resourceLayers);
      }
    }
  });
});

function find(positions: StoredPosition[], id: string): StoredPosition {
  const p = positions.find(x => x.id === id);
  if (!p) throw new Error(`fixture not found: ${id}`);
  return p;
}
