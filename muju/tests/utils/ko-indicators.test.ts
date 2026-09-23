import { describe, it, expect } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { ownKoTargets, enemyKoThreats } from '../../src/utils/koIndicators';

function boardWith(...units: ReturnType<typeof createUnit>[]) {
  return { ...createInitialGameState().board, units };
}

describe('ownKoTargets (own unit selected, forward direction)', () => {
  it('includes an adjacent enemy it can eliminate now, excludes an adjacent enemy it can only wound', () => {
    const unit = createUnit('fire_2', 'white', { x: 0, y: 0 }); // attack 3, +1 vs metal (fire beats plant/metal)
    const killable = createUnit('metal_1', 'black', { x: 1, y: 0 }); // defense 3: 3+1 >= 3, lethal
    // water is in the pair fire/lightning are weak to, so fire is at -1 here.
    const woundOnly = createUnit('water_3', 'black', { x: 0, y: 1 }); // defense 4: 3-1 < 4, wound only
    const board = boardWith(unit, killable, woundOnly);
    const targets = ownKoTargets(unit, board, 4);
    expect(targets).toEqual([{ x: 1, y: 0 }]);
  });

  it('includes a farther enemy only reachable via move-then-attack', () => {
    const unit = createUnit('fire_2', 'white', { x: 0, y: 0 }); // attack 3, speed 2
    const farKillable = createUnit('plant_1', 'black', { x: 4, y: 0 }); // defense 3: 3 >= 3, lethal
    const board = boardWith(unit, farKillable);
    // Distance 4 at speed 2 costs 2 move actions, leaving 1 for the attack: 3 of 4 actions.
    expect(ownKoTargets(unit, board, 4)).toEqual([{ x: 4, y: 0 }]);
    // With only 2 actions total, there is exactly 1 move action's worth of speed left after
    // reserving the attack action, which is not enough distance to reach an adjacent square.
    expect(ownKoTargets(unit, board, 2)).toEqual([]);
  });

  it('is empty once the unit has no attack left this turn', () => {
    const unit = { ...createUnit('fire_1', 'white', { x: 0, y: 0 }), hasAttacked: true, attackedThisTurn: ['prior'], lastAttackKilled: false };
    const target = createUnit('lightning_1', 'black', { x: 1, y: 0 });
    const board = boardWith(unit, target);
    expect(ownKoTargets(unit, board, 4)).toEqual([]);
  });
});

describe('enemyKoThreats (enemy inspected, reverse direction)', () => {
  it('projects a fresh turn for the enemy, ignoring its current spent attack/AP state', () => {
    const enemy = {
      ...createUnit('fire_2', 'black', { x: 5, y: 5 }), // attack 3
      canActThisTurn: false, hasAttacked: true, attackedThisTurn: ['already-used'], lastAttackKilled: false,
    };
    const myUnit = createUnit('metal_1', 'white', { x: 6, y: 5 }); // defense 3: 3 >= 3, lethal
    const board = boardWith(enemy, myUnit);
    expect(enemyKoThreats(enemy, board, 4)).toEqual([{ x: 6, y: 5 }]);
  });

  it('excludes a unit it could only wound, and uses the defender\'s current (unhealed) defense', () => {
    const enemy = createUnit('fire_2', 'black', { x: 5, y: 5 }); // attack 3
    const safe = createUnit('metal_3', 'white', { x: 6, y: 5 }); // defense 5: 3 < 5, safe
    const damaged = { ...createUnit('metal_2', 'white', { x: 4, y: 5 }), damageTaken: 1 }; // defense 4-1=3: 3 >= 3, lethal only because of current damage
    const board = boardWith(enemy, safe, damaged);
    expect(enemyKoThreats(enemy, board, 4)).toEqual([{ x: 4, y: 5 }]);
  });

  it('is a single-attacker projection: never includes a target only killable by combining with another unit', () => {
    // Two separate enemies, each individually too weak to kill this defender; neither call sums them.
    const enemyA = createUnit('lightning_1', 'black', { x: 0, y: 0 }); // attack 1
    const enemyB = createUnit('lightning_1', 'black', { x: 9, y: 9 }); // attack 1
    const tough = createUnit('metal_3', 'white', { x: 1, y: 0 }); // defense 5
    const board = boardWith(enemyA, enemyB, tough);
    expect(enemyKoThreats(enemyA, board, 4)).toEqual([]);
  });
});
