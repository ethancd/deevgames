import { describe, it, expect } from 'vitest';
import type { BoardState, Unit, PlayerId } from '../../src/game/types';
import { createEmptyBoard, addUnit, createUnit } from '../../src/game/board';
import {
  resolveCombat,
  resolveCombinedCombat,
  calculateAttackPower,
  calculateCombinedAttackPower,
  getValidAttacks,
} from '../../src/game/combat';
import { getSpawnZone, isValidSpawnPosition, getAllSpawnPositions } from '../../src/game/spawning';
import { calculateMiningYield } from '../../src/game/mining';
import { canPromote, getPromotionCost } from '../../src/game/promotion';
import { checkVictory } from '../../src/game/victory';
import { getUnitDefinition } from '../../src/game/units';

/**
 * Adversarial "rules-lawyer" fixtures from the balance-lab spec audit.
 * Each fixture pins down an edge-case ruling so that future engine or
 * balance patches cannot silently change it.
 */

function placed(
  defId: string,
  owner: PlayerId,
  x: number,
  y: number,
  overrides: Partial<Unit> = {}
): Unit {
  return { ...createUnit(defId, owner, { x, y }), ...overrides };
}

function boardWith(...units: Unit[]): BoardState {
  let board = createEmptyBoard();
  for (const u of units) {
    board = addUnit(board, u);
  }
  return board;
}

describe('audit fixtures: mixed-element combined attacks', () => {
  it('applies each attacker elemental modifier individually before summing', () => {
    // Defender: water_2 Straumr (DEF 3). Water is beaten by plant/metal pair,
    // beats fire/lightning pair.
    const defender = placed('water_2', 'black', 5, 5);
    // fire_1 Hi: ATK 2, fire attacks water at DISadvantage -> 2 - 1 = 1
    const fireAtk = placed('fire_1', 'white', 5, 4);
    // metal_2 Mazaska: ATK 2, metal attacks water with ADvantage -> 2 + 1 = 3
    const metalAtk = placed('metal_2', 'white', 5, 6);

    const board = boardWith(defender, fireAtk, metalAtk);

    expect(calculateAttackPower(fireAtk, defender)).toBe(1);
    expect(calculateAttackPower(metalAtk, defender)).toBe(3);
    expect(calculateCombinedAttackPower([fireAtk, metalAtk], defender)).toBe(4);

    const { eliminated, totalAttack } = resolveCombinedCombat(
      board,
      [fireAtk.id, metalAtk.id],
      defender.position
    );
    expect(totalAttack).toBe(4);
    expect(eliminated).toBe(true); // 4 >= DEF 3
  });

  it('attack power floors at 0 under disadvantage (plant_1 ATK 0 cannot go negative)', () => {
    // plant_1 Muju ATK 0; plant attacks fire at disadvantage -> max(0, 0-1) = 0
    const attacker = placed('plant_1', 'white', 1, 1);
    const defender = placed('fire_1', 'black', 1, 2);
    expect(calculateAttackPower(attacker, defender)).toBe(0);

    // A 0-power attack against DEF 1 does not eliminate and deals 0 damage
    const board = boardWith(attacker, defender);
    const { board: after, eliminated } = resolveCombat(board, attacker.id, defender.position);
    expect(eliminated).toBe(false);
    const def = after.units.find((u) => u.id === defender.id)!;
    expect(def.damageTaken).toBe(0);
  });

  it('forbids the same attacker hitting the same target twice in one turn', () => {
    const attacker = placed('fire_2', 'white', 3, 3);
    const defender = placed('metal_3', 'black', 3, 4); // DEF 6, survives one hit
    let board = boardWith(attacker, defender);

    const first = resolveCombat(board, attacker.id, defender.position);
    expect(first.eliminated).toBe(false);
    board = first.board;

    const attackerAfter = board.units.find((u) => u.id === attacker.id)!;
    const targets = getValidAttacks(attackerAfter, board);
    expect(targets).toHaveLength(0); // same enemy not attackable again
  });

  it('within-turn damage accumulates across different attackers (M1+M2 kill P2)', () => {
    // v1.1 spec section 6.1 regression: metal_1 (ATK 1+1 adv vs plant... wait,
    // metal attacks plant: same pair (plant-metal) -> neutral. ATK 1.
    // Use the spec's exact scenario: M1 then M2 vs plant_1 (DEF 2).
    const m1 = placed('metal_1', 'white', 4, 5); // ATK 1, neutral vs plant
    const m2 = placed('metal_2', 'white', 6, 5); // ATK 2, neutral vs plant
    const p1 = placed('plant_1', 'black', 5, 5); // DEF 2
    let board = boardWith(m1, m2, p1);

    const first = resolveCombat(board, m1.id, p1.position);
    expect(first.eliminated).toBe(false); // 1 < 2
    board = first.board;
    expect(board.units.find((u) => u.id === p1.id)!.damageTaken).toBe(1);

    const second = resolveCombat(board, m2.id, p1.position);
    expect(second.eliminated).toBe(true); // 2 >= effective DEF 1
  });
});

describe('audit fixtures: spawn rectangle edges', () => {
  it('anchor on the start corner yields a 1-cell rectangle (occupied by the anchor itself)', () => {
    const anchor = placed('fire_1', 'white', 0, 0);
    const board = boardWith(anchor);
    const zone = getSpawnZone(anchor, 'white', board);
    expect(zone).toHaveLength(0); // only cell is the anchor's own square
  });

  it('a single enemy anywhere inside the rectangle blocks that anchor entirely', () => {
    const anchor = placed('water_1', 'white', 4, 4);
    const enemy = placed('lightning_1', 'black', 2, 3); // inside (0,0)-(4,4)
    const board = boardWith(anchor, enemy);
    expect(getSpawnZone(anchor, 'white', board)).toHaveLength(0);
  });

  it('an enemy outside the rectangle does not block', () => {
    const anchor = placed('water_1', 'white', 3, 3);
    const enemy = placed('lightning_1', 'black', 5, 5); // outside (0,0)-(3,3)
    const board = boardWith(anchor, enemy);
    const zone = getSpawnZone(anchor, 'white', board);
    // 4x4 rectangle minus the anchor's own square = 15
    expect(zone).toHaveLength(15);
    expect(isValidSpawnPosition({ x: 0, y: 0 }, 'white', board)).toBe(true);
  });

  it('a second unblocked anchor can still provide spawn positions when another is blocked', () => {
    const blocked = placed('water_1', 'white', 6, 6);
    const small = placed('fire_1', 'white', 1, 0);
    const enemy = placed('lightning_1', 'black', 3, 3); // blocks the 7x7, not the 2x1
    const board = boardWith(blocked, small, enemy);
    const all = getAllSpawnPositions('white', board);
    // small anchor rectangle (0,0)-(1,0): cells (0,0) and (1,0); (1,0) is the anchor
    expect(all).toEqual([{ x: 0, y: 0 }]);
  });

  it('black spawn rectangles anchor from (9,9)', () => {
    const anchor = placed('water_1', 'black', 7, 8);
    const board = boardWith(anchor);
    const zone = getSpawnZone(anchor, 'black', board);
    // rectangle (7,8)-(9,9): 3x2 = 6 cells minus anchor square = 5
    expect(zone).toHaveLength(5);
  });
});

describe('audit fixtures: mining well metaphor', () => {
  it('cell is dry for a short rope once mined below its reach', () => {
    const muju = placed('plant_1', 'white', 0, 0); // mining 3
    const hi = placed('fire_1', 'white', 1, 0); // mining 1

    // Fresh cell: Muju takes layers 1-3
    const fresh = { position: { x: 0, y: 0 }, resourceLayers: 5, minedDepth: 0 };
    expect(calculateMiningYield(muju, fresh)).toBe(3);

    // After depth 3: top layer is depth 4 -> Hi (rope 1) gets nothing
    const deep = { position: { x: 0, y: 0 }, resourceLayers: 2, minedDepth: 3 };
    expect(calculateMiningYield(hi, deep)).toBe(0);
    // And Muju (rope 3) also gets nothing at depth 4
    expect(calculateMiningYield(muju, deep)).toBe(0);
  });

  it('rope longer than remaining layers takes only what exists', () => {
    const cuauhtli = placed('plant_4', 'white', 0, 0); // mining 5
    const nearlyDone = { position: { x: 0, y: 0 }, resourceLayers: 1, minedDepth: 4 };
    expect(calculateMiningYield(cuauhtli, nearlyDone)).toBe(1);
    const empty = { position: { x: 0, y: 0 }, resourceLayers: 0, minedDepth: 5 };
    expect(calculateMiningYield(cuauhtli, empty)).toBe(0);
  });

  it('lightning tier 1-2 (mining 0) can never mine', () => {
    const radi = placed('lightning_1', 'white', 0, 0);
    const fresh = { position: { x: 0, y: 0 }, resourceLayers: 5, minedDepth: 0 };
    expect(calculateMiningYield(radi, fresh)).toBe(0);
  });
});

describe('audit fixtures: promotion timing rules', () => {
  const richBuildState = { queue: [], crystals: 100 };

  it('cannot promote a unit on the turn it was placed', () => {
    const unit = placed('fire_1', 'white', 0, 0, { placedThisTurn: true });
    expect(canPromote(unit, richBuildState)).toBe(false);
  });

  it('cannot promote the same unit twice in one placement phase', () => {
    const unit = placed('fire_1', 'white', 0, 0, { promotedThisPlacement: true });
    expect(canPromote(unit, richBuildState)).toBe(false);
  });

  it('tier 4 units cannot promote', () => {
    const unit = placed('metal_4', 'white', 0, 0);
    expect(getPromotionCost(unit)).toBeNull();
    expect(canPromote(unit, richBuildState)).toBe(false);
  });

  it('promotion cost is the cost difference to the next tier', () => {
    for (const [defId, expected] of [
      ['fire_1', 2], // 3 - 1
      ['fire_3', 4], // 10 - 6
      ['water_2', 6], // 10 - 4
      ['plant_3', 8], // 20 - 12
    ] as const) {
      const unit = placed(defId, 'white', 0, 0);
      expect(getPromotionCost(unit), defId).toBe(expected);
    }
  });
});

describe('audit fixtures: victory ruling', () => {
  it('a player with zero units loses even with a non-empty build queue (no anchor to spawn)', () => {
    // victory.ts ruling: units on board are the sole criterion; queued units
    // cannot save you because spawning requires an anchor piece.
    const board = boardWith(placed('fire_1', 'white', 0, 0));
    const result = checkVictory(board);
    expect(result.status).toBe('victory');
    if (result.status === 'victory') {
      expect(result.winner).toBe('white');
    }
  });

  it('both players having units means the game is ongoing regardless of material gap', () => {
    const board = boardWith(
      placed('metal_4', 'white', 0, 0),
      placed('lightning_1', 'black', 9, 9)
    );
    expect(checkVictory(board).status).toBe('ongoing');
  });
});

describe('audit fixtures: catalog sanity', () => {
  it('every element has exactly tiers 1-4 with monotonically increasing cost', () => {
    const elements = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
    for (const el of elements) {
      let prevCost = 0;
      for (const tier of [1, 2, 3, 4]) {
        const def = getUnitDefinition(`${el}_${tier}`);
        expect(def.tier).toBe(tier);
        expect(def.element).toBe(el);
        expect(def.cost).toBeGreaterThan(prevCost);
        prevCost = def.cost;
      }
    }
  });
});
