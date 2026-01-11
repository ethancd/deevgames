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

    it('no bonus when disadvantaged', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Attack: 2
      const defender = createUnit('water_1', 'ai', { x: 0, y: 1 }); // Water beats Fire

      expect(calculateAttackPower(attacker, defender)).toBe(2); // No bonus
    });

    it('no bonus for same element', () => {
      const attacker = createUnit('fire_1', 'player', { x: 0, y: 0 });
      const defender = createUnit('fire_1', 'ai', { x: 0, y: 1 });

      expect(calculateAttackPower(attacker, defender)).toBe(2);
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

    it('elemental disadvantage can prevent a kill', () => {
      let board = createEmptyBoard();
      const attacker = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Attack: 2
      const defender = createUnit('water_1', 'ai', { x: 5, y: 4 }); // Defense: 2
      // Fire is weak to Water, but no penalty - 2 vs 2 = kill
      // Actually no penalty for being disadvantaged, so this still kills
      board = addUnit(board, attacker);
      board = addUnit(board, defender);

      const result = resolveCombat(board, attacker.id, { x: 5, y: 4 });
      expect(result.eliminated).toBe(true); // 2 >= 2
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
});
