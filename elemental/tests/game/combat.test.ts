import { describe, it, expect } from 'vitest';
import {
  canAttack,
  getValidAttacks,
  isValidAttack,
  calculateAttackPower,
  calculateDefense,
  resolveCombat,
  executeAttack,
  getThreatsTo,
  getAttackersFor,
  canBeEliminated,
} from '../../src/game/combat';
import {
  createEmptyBoard,
  createUnit,
  addUnit,
  getUnitAt,
} from '../../src/game/board';

describe('Combat Module', () => {
  describe('canAttack', () => {
    it('returns true for fresh unit', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      expect(canAttack(unit)).toBe(true);
    });

    it('returns false if unit has already attacked', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.hasAttacked = true;
      expect(canAttack(unit)).toBe(false);
    });

    it('returns false if unit cannot act this turn', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.canActThisTurn = false;
      expect(canAttack(unit)).toBe(false);
    });
  });

  describe('getValidAttacks', () => {
    it('returns empty if unit cannot attack', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      unit.hasAttacked = true;
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, enemy);

      expect(getValidAttacks(unit, board)).toEqual([]);
    });

    it('returns adjacent enemy positions', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, enemy);

      const attacks = getValidAttacks(unit, board);
      expect(attacks).toHaveLength(1);
      expect(attacks).toContainEqual({ x: 5, y: 4 });
    });

    it('does not include friendly units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const friendly = createUnit('water_1', 'player', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, friendly);

      const attacks = getValidAttacks(unit, board);
      expect(attacks).toHaveLength(0);
    });

    it('returns multiple adjacent enemies', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy1 = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      const enemy2 = createUnit('fire_1', 'ai', { x: 4, y: 5 });
      board = addUnit(board, unit);
      board = addUnit(board, enemy1);
      board = addUnit(board, enemy2);

      const attacks = getValidAttacks(unit, board);
      expect(attacks).toHaveLength(2);
    });

    it('does not include non-adjacent enemies', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 3 }); // 2 squares away
      board = addUnit(board, unit);
      board = addUnit(board, enemy);

      const attacks = getValidAttacks(unit, board);
      expect(attacks).toHaveLength(0);
    });

    it('does not include diagonal enemies', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('fire_1', 'ai', { x: 6, y: 6 }); // diagonal
      board = addUnit(board, unit);
      board = addUnit(board, enemy);

      const attacks = getValidAttacks(unit, board);
      expect(attacks).toHaveLength(0);
    });
  });

  describe('calculateAttackPower', () => {
    it('returns base attack for neutral matchup', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('lightning_1', 'ai', { x: 0, y: 1 });

      expect(calculateAttackPower(attacker, defender)).toBe(2);
    });

    it('adds +1 for elemental advantage', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('plant_1', 'ai', { x: 0, y: 1 }); // Fire beats Plant

      expect(calculateAttackPower(attacker, defender)).toBe(3); // 2 + 1
    });

    it('subtracts 1 when disadvantaged', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('water_1', 'ai', { x: 0, y: 1 }); // Water beats Fire

      expect(calculateAttackPower(attacker, defender)).toBe(1); // 2 - 1
    });

    it('no modifier for same element', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 });
      const defender = createUnit('fire_1', 'ai', { x: 0, y: 1 });

      expect(calculateAttackPower(attacker, defender)).toBe(2);
    });

    it('attack power cannot go below 0', () => {
      // Radi has attack 1, disadvantage gives -1, should floor at 0
      const attacker = createUnit('lightning_1', 'player', { x: 0, y: 0 }); // Attack: 1
      const defender = createUnit('wind_1', 'ai', { x: 0, y: 1 }); // Wind beats Lightning

      expect(calculateAttackPower(attacker, defender)).toBe(0); // max(0, 1-1)
    });
  });

  describe('calculateDefense', () => {
    it('returns base defense value', () => {
      const defender = createUnit('fire_1', 'ai', { x: 0, y: 0 }); // Defense: 1
      expect(calculateDefense(defender)).toBe(1);
    });

    it('returns high defense for metal units', () => {
      const defender = createUnit('metal_4', 'ai', { x: 0, y: 0 }); // Defense: 8
      expect(calculateDefense(defender)).toBe(8);
    });
  });

  describe('resolveCombat', () => {
    it('eliminates defender when attack >= defense', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Attack: 2
      const defender = createUnit('fire_1', 'ai', { x: 5, y: 4 }); // Defense: 1
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });

      expect(result.eliminated).toBe(true);
      expect(getUnitAt(result.board, { x: 5, y: 4 })).toBeNull();
    });

    it('defender survives when attack < defense', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('lightning_1', 'player', { x: 5, y: 5 }); // Attack: 1
      const defender = createUnit('water_1', 'ai', { x: 5, y: 4 }); // Defense: 2
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });

      expect(result.eliminated).toBe(false);
      expect(getUnitAt(result.board, { x: 5, y: 4 })).not.toBeNull();
    });

    it('marks attacker as having attacked', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const defender = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });
      const updatedAttacker = result.board.units.find((u) => u.id === attacker.id);

      expect(updatedAttacker?.hasAttacked).toBe(true);
    });

    it('elemental advantage allows kill of otherwise surviving unit', () => {
      let board = createEmptyBoard();
      // Hi (Fire, Attack 2) vs Sjor (Water, Defense 2)
      // Normally 2 vs 2 = kill, but let's test with elemental advantage
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Attack: 2
      const defender = createUnit('plant_1', 'ai', { x: 5, y: 4 }); // Defense: 3
      // Fire has advantage over Plant: 2+1 = 3 vs 3 = kill
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });
      expect(result.eliminated).toBe(true);
    });

    it('elemental disadvantage prevents a kill', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Attack: 2
      const defender = createUnit('water_1', 'ai', { x: 5, y: 4 }); // Defense: 2
      // Fire is weak to Water: 2 - 1 = 1 attack vs 2 defense = survives
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });
      expect(result.eliminated).toBe(false); // 1 < 2
    });

    it('returns original board if attacker not found', () => {
      const board = createEmptyBoard();
      const result = resolveCombat(board, 'nonexistent', { x: 5, y: 4 });
      expect(result.board).toBe(board);
      expect(result.eliminated).toBe(false);
    });
  });

  describe('getThreatsTo', () => {
    it('returns adjacent enemy units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, enemy);

      const threats = getThreatsTo(unit, board);
      expect(threats).toHaveLength(1);
      expect(threats[0].id).toBe(enemy.id);
    });

    it('does not include friendly units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const friendly = createUnit('water_1', 'player', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, friendly);

      const threats = getThreatsTo(unit, board);
      expect(threats).toHaveLength(0);
    });
  });

  describe('getAttackersFor', () => {
    it('returns friendly units that can attack target position', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, attacker);
      board = addUnit(board, enemy);

      const attackers = getAttackersFor({ x: 5, y: 4 }, board, 'player');
      expect(attackers).toHaveLength(1);
      expect(attackers[0].id).toBe(attacker.id);
    });

    it('excludes units that have already attacked', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 });
      attacker.hasAttacked = true;
      const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
      board = addUnit(board, attacker);
      board = addUnit(board, enemy);

      const attackers = getAttackersFor({ x: 5, y: 4 }, board, 'player');
      expect(attackers).toHaveLength(0);
    });
  });

  describe('canBeEliminated', () => {
    it('returns true if attacker can kill defender', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('fire_1', 'ai', { x: 0, y: 1 }); // Defense: 1

      expect(canBeEliminated(defender, attacker)).toBe(true);
    });

    it('returns false if attacker cannot kill defender', () => {
      const attacker = createUnit('lightning_1', 'player', { x: 0, y: 0 }); // Attack: 1
      const defender = createUnit('water_1', 'ai', { x: 0, y: 1 }); // Defense: 2

      expect(canBeEliminated(defender, attacker)).toBe(false);
    });

    it('accounts for elemental advantage', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('plant_1', 'ai', { x: 0, y: 1 }); // Defense: 3
      // Fire has advantage: 2 + 1 = 3 >= 3

      expect(canBeEliminated(defender, attacker)).toBe(true);
    });
  });

  describe('Combat scenarios from game rules', () => {
    it('Hi (Fire, 2 atk) kills Hi (Fire, 1 def)', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 });
      const defender = createUnit('fire_1', 'ai', { x: 0, y: 1 });
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 0, y: 1 });
      expect(result.eliminated).toBe(true);
    });

    it('Radi (Lightning, 1 atk) cannot kill Sjor (Water, 2 def)', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('lightning_1', 'player', { x: 0, y: 0 });
      const defender = createUnit('water_1', 'ai', { x: 0, y: 1 });
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 0, y: 1 });
      expect(result.eliminated).toBe(false);
    });

    it('Muju (Plant, 1 atk) cannot kill Inyan (Metal, 3 def)', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('plant_1', 'player', { x: 0, y: 0 });
      const defender = createUnit('metal_1', 'ai', { x: 0, y: 1 });
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 0, y: 1 });
      expect(result.eliminated).toBe(false);
    });

    it('Gokamoka (Fire tier 4, 6 atk) kills Cuauhtlimallki (Plant tier 4, 5 def)', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_4', 'player', { x: 0, y: 0 });
      const defender = createUnit('plant_4', 'ai', { x: 0, y: 1 });
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      // Fire has advantage over Plant: 6 + 1 = 7 >= 5
      const result = resolveCombat(board, attacker.id, { x: 0, y: 1 });
      expect(result.eliminated).toBe(true);
    });
  });

  describe('Combined attacks with elemental modifiers (Phase 2 preview)', () => {
    // These tests demonstrate how elemental modifiers affect combined attacks
    // The actual combined attack resolution will be implemented in Phase 2,
    // but we test the math here to ensure the modifier system works correctly

    it('three disadvantaged 2-atk units cannot kill a 4-def unit', () => {
      // Scenario: 3x Fire units (2 atk each) vs Water unit (4 def, made up for test)
      // Fire is weak to Water: each attacker gets -1
      // Combined: (2-1) + (2-1) + (2-1) = 3 total attack
      // 3 < 4, so defender survives

      const attacker1 = createUnit('fire_1', 'player', { x: 0, y: 0 }); // 2 atk
      const attacker2 = createUnit('fire_1', 'player', { x: 1, y: 1 }); // 2 atk
      const attacker3 = createUnit('fire_1', 'player', { x: 2, y: 2 }); // 2 atk
      const defender = createUnit('water_3', 'ai', { x: 5, y: 5 }); // 4 def (Aegirinn)

      // Calculate individual attack powers
      const power1 = calculateAttackPower(attacker1, defender);
      const power2 = calculateAttackPower(attacker2, defender);
      const power3 = calculateAttackPower(attacker3, defender);

      expect(power1).toBe(1); // 2 - 1 disadvantage
      expect(power2).toBe(1);
      expect(power3).toBe(1);

      // Combined attack
      const totalAttack = power1 + power2 + power3;
      const defense = calculateDefense(defender);

      expect(totalAttack).toBe(3);
      expect(defense).toBe(4);
      expect(totalAttack < defense).toBe(true); // Defender survives!
    });

    it('three neutral 2-atk units CAN kill a 4-def unit', () => {
      // Same scenario but cross-triangle (neutral matchup)
      // Combined: 2 + 2 + 2 = 6 total attack
      // 6 >= 4, defender eliminated

      const attacker1 = createUnit('fire_1', 'player', { x: 0, y: 0 }); // 2 atk
      const attacker2 = createUnit('fire_1', 'player', { x: 1, y: 1 }); // 2 atk
      const attacker3 = createUnit('fire_1', 'player', { x: 2, y: 2 }); // 2 atk
      const defender = createUnit('lightning_3', 'ai', { x: 5, y: 5 }); // Cross-triangle

      const power1 = calculateAttackPower(attacker1, defender);
      const power2 = calculateAttackPower(attacker2, defender);
      const power3 = calculateAttackPower(attacker3, defender);

      expect(power1).toBe(2); // No modifier
      expect(power2).toBe(2);
      expect(power3).toBe(2);

      const totalAttack = power1 + power2 + power3;
      expect(totalAttack).toBe(6);
    });

    it('three advantaged 1-atk units CAN kill a 4-def unit', () => {
      // 3x Lightning units (1 atk each) vs Metal unit (4 def)
      // Lightning beats Metal: each attacker gets +1
      // Combined: (1+1) + (1+1) + (1+1) = 6 total attack
      // 6 >= 4, defender eliminated

      const attacker1 = createUnit('lightning_1', 'player', { x: 0, y: 0 }); // 1 atk
      const attacker2 = createUnit('lightning_1', 'player', { x: 1, y: 1 }); // 1 atk
      const attacker3 = createUnit('lightning_1', 'player', { x: 2, y: 2 }); // 1 atk
      const defender = createUnit('metal_2', 'ai', { x: 5, y: 5 }); // 4 def (Mazaska)

      const power1 = calculateAttackPower(attacker1, defender);
      const power2 = calculateAttackPower(attacker2, defender);
      const power3 = calculateAttackPower(attacker3, defender);

      expect(power1).toBe(2); // 1 + 1 advantage
      expect(power2).toBe(2);
      expect(power3).toBe(2);

      const totalAttack = power1 + power2 + power3;
      const defense = calculateDefense(defender);

      expect(totalAttack).toBe(6);
      expect(defense).toBe(4);
      expect(totalAttack >= defense).toBe(true); // Defender eliminated!
    });

    it('mixed elemental modifiers in combined attack', () => {
      // Fire + Water + Lightning vs Plant (3 def)
      // Fire vs Plant: advantage (+1) → 2+1 = 3
      // Water vs Plant: disadvantage (-1) → 2-1 = 1
      // Lightning vs Plant: neutral → 1
      // Combined: 3 + 1 + 1 = 5 >= 3, defender eliminated

      const fireAttacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // 2 atk
      const waterAttacker = createUnit('water_1', 'player', { x: 1, y: 1 }); // 2 atk
      const lightningAttacker = createUnit('lightning_1', 'player', { x: 2, y: 2 }); // 1 atk
      const defender = createUnit('plant_1', 'ai', { x: 5, y: 5 }); // 3 def

      const firePower = calculateAttackPower(fireAttacker, defender);
      const waterPower = calculateAttackPower(waterAttacker, defender);
      const lightningPower = calculateAttackPower(lightningAttacker, defender);

      expect(firePower).toBe(3); // advantage
      expect(waterPower).toBe(1); // disadvantage
      expect(lightningPower).toBe(1); // neutral (cross-triangle)

      const totalAttack = firePower + waterPower + lightningPower;
      expect(totalAttack).toBe(5);
    });
  });
});
