/**
 * `muju-phasing-4` (SPEC v3.4 §4.2, 2026-09-23): Cleave has no tier cap. The
 * frozen perft fixtures never reach a multi-kill chain inside their caps, so
 * they cannot see this rule at all; these positions are built to exercise it,
 * and the packed replica must enumerate exactly the canonical engine's action
 * trees and end positions for them.
 */
import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../../src/game/board';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState } from '../../../src/game/types';
import { endKeysCanonical, endKeysReplica, enumerateTurn, perftReplica } from '../../../src/ai/hard/verify/perft';

const ACT_ONLY = { act: 4, prepare: 0 } as const;

/** One white attacker at E5 among `victims`, plus a far black Ægirinn so no line ends in elimination. */
function chainPosition(attacker: string, victims: readonly [string, number, number][]): GameState {
  const s = createInitialGameState(undefined, 4, 0, 'phasing');
  s.board.units = [
    createUnit(attacker, 'white', { x: 4, y: 4 }),
    ...victims.map(([def, x, y]) => createUnit(def, 'black', { x, y })),
    createUnit('water_3', 'black', { x: 9, y: 8 }),
  ];
  return s;
}

const FOUR_MUJU: [string, number, number][] = [['plant_1', 4, 3], ['plant_1', 5, 4], ['plant_1', 4, 5], ['plant_1', 3, 4]];

const POSITIONS: [string, GameState][] = [
  // The owner's example: a Hi (Fire I, ATK 2 +1 vs Plant) among four Muju (DEF 3).
  ['Hi among four Muju', chainPosition('fire_1', FOUR_MUJU)],
  ['Honō among four Muju', chainPosition('fire_2', FOUR_MUJU)],
  // A survivor in the ring: hitting the Ægirinn closes the chain mid-sweep.
  ['Hi among three Muju and a survivor', chainPosition('fire_1', [['plant_1', 4, 3], ['plant_1', 5, 4], ['water_3', 4, 5], ['plant_1', 3, 4]])],
];

describe('Cleave without a tier cap: canonical and replica agree', () => {
  it('the canonical engine lets a Hi take all four Muju in one turn', () => {
    let s = chainPosition('fire_1', FOUR_MUJU);
    const hi = s.board.units[0];
    for (const [, x, y] of FOUR_MUJU) s = applyAction(s, { type: 'ATTACK', unitId: hi.id, targetPosition: { x, y } });
    expect(s.board.units.filter(u => u.definitionId === 'plant_1')).toEqual([]);
    expect(s.turn.actionsRemaining).toBe(0);
  });

  for (const [name, state] of POSITIONS) {
    it(`${name}: identical perft numbers and end positions`, () => {
      const canonical = enumerateTurn(state, ACT_ONLY);
      const replica = perftReplica(state, ACT_ONLY);
      expect(replica.sequences).toBe(canonical.sequences);
      expect(replica.midStates).toBe(canonical.midStates);
      expect(replica.endPositions).toBe(canonical.endPositions);
      expect([...endKeysReplica(state, ACT_ONLY)].sort()).toEqual([...endKeysCanonical(state, ACT_ONLY)].sort());
    });
  }
});
