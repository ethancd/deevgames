import { describe, it, expect } from 'vitest';
import {
  canMineAction,
  canMine,
  calculateMiningYield,
  executeMine,
  getTotalBoardResources,
  isDepleted,
  isDryForUnit,
} from '../../src/game/mining';
import {
  createEmptyBoard,
  createUnit,
  addUnit,
  getCell,
  updateCell,
  BOARD_SIZE,
  INITIAL_RESOURCE_LAYERS,
} from '../../src/game/board';

describe('Mining Module', () => {
  describe('canMineAction', () => {
    it('returns true for fresh unit', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      expect(canMineAction(unit)).toBe(true);
    });

    it('returns false if unit has already mined', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.hasMined = true;
      expect(canMineAction(unit)).toBe(false);
    });

    it('returns false if unit cannot act this turn', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.canActThisTurn = false;
      expect(canMineAction(unit)).toBe(false);
    });
  });

  describe('The Well Metaphor - calculateMiningYield', () => {
    describe('Fresh cell (all 5 layers available)', () => {
      it('Hi (Mining 1) extracts 1 resource from fresh cell', () => {
        const unit = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Mining: 1
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 5, minedDepth: 0 };

        expect(calculateMiningYield(unit, cell)).toBe(1);
      });

      it('Muju (Mining 2) extracts 2 resources from fresh cell', () => {
        const unit = createUnit('plant_1', 'player', { x: 0, y: 0 }); // Mining: 2
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 5, minedDepth: 0 };

        expect(calculateMiningYield(unit, cell)).toBe(2);
      });

      it('Cuauhtlimallki (Mining 5) extracts all 5 resources from fresh cell', () => {
        const unit = createUnit('plant_4', 'player', { x: 0, y: 0 }); // Mining: 5
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 5, minedDepth: 0 };

        expect(calculateMiningYield(unit, cell)).toBe(5);
      });
    });

    describe('Partially mined cell', () => {
      it('Hi (Mining 1) gets 0 from cell where depth 1 is already mined', () => {
        const unit = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Mining: 1
        // Cell was mined once: minedDepth=1, top layer now at depth 2
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 4, minedDepth: 1 };

        // Top layer is at depth 2, but Hi can only reach depth 1
        expect(calculateMiningYield(unit, cell)).toBe(0);
      });

      it('Muju (Mining 2) gets 1 from cell where depth 1 is mined', () => {
        const unit = createUnit('plant_1', 'player', { x: 0, y: 0 }); // Mining: 2
        // minedDepth=1, top layer at depth 2
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 4, minedDepth: 1 };

        // Muju can reach depths 1-2, top layer is at depth 2, gets 1 layer
        expect(calculateMiningYield(unit, cell)).toBe(1);
      });

      it('Muju (Mining 2) gets 0 from cell where depths 1-2 are mined', () => {
        const unit = createUnit('plant_1', 'player', { x: 0, y: 0 }); // Mining: 2
        // minedDepth=2, top layer at depth 3
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 3, minedDepth: 2 };

        // Muju can reach depths 1-2, but top layer is at depth 3
        expect(calculateMiningYield(unit, cell)).toBe(0);
      });

      it('Sachita (Mining 3) gets 1 from cell where depths 1-2 are mined', () => {
        const unit = createUnit('plant_2', 'player', { x: 0, y: 0 }); // Mining: 3
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 3, minedDepth: 2 };

        // Can reach depth 3, gets 1 layer
        expect(calculateMiningYield(unit, cell)).toBe(1);
      });
    });

    describe('Depleted cell', () => {
      it('returns 0 for completely depleted cell', () => {
        const unit = createUnit('plant_4', 'player', { x: 0, y: 0 }); // Mining: 5
        const cell = { position: { x: 0, y: 0 }, resourceLayers: 0, minedDepth: 5 };

        expect(calculateMiningYield(unit, cell)).toBe(0);
      });
    });
  });

  describe('canMine', () => {
    it('returns true if unit can extract resources', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      expect(canMine(unit, board)).toBe(true);
    });

    it('returns false if cell is dry for this unit', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Mining: 1
      board = addUnit(board, unit);
      // Mine depth 1 already
      board = updateCell(board, { x: 5, y: 5 }, { resourceLayers: 4, minedDepth: 1 });

      expect(canMine(unit, board)).toBe(false);
    });

    it('returns false if unit has already mined', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      unit.hasMined = true;
      board = addUnit(board, unit);

      expect(canMine(unit, board)).toBe(false);
    });

    it('returns false if cell is completely depleted', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_4', 'player', { x: 5, y: 5 }); // Mining: 5
      board = addUnit(board, unit);
      board = updateCell(board, { x: 5, y: 5 }, { resourceLayers: 0, minedDepth: 5 });

      expect(canMine(unit, board)).toBe(false);
    });
  });

  describe('executeMine', () => {
    it('extracts correct resources and updates cell', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_1', 'player', { x: 5, y: 5 }); // Mining: 2
      board = addUnit(board, unit);

      const result = executeMine(board, unit.id, 0);

      expect(result.amountMined).toBe(2);
      expect(result.newResources).toBe(2);

      const cell = getCell(result.board, { x: 5, y: 5 });
      expect(cell?.resourceLayers).toBe(3);
      expect(cell?.minedDepth).toBe(2);
    });

    it('marks unit as having mined', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      const result = executeMine(board, unit.id, 0);
      const minedUnit = result.board.units.find((u) => u.id === unit.id);

      expect(minedUnit?.hasMined).toBe(true);
    });

    it('adds to existing resources', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_1', 'player', { x: 5, y: 5 }); // Mining: 2
      board = addUnit(board, unit);

      const result = executeMine(board, unit.id, 10);

      expect(result.newResources).toBe(12);
    });

    it('returns 0 if cell is dry for unit', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 }); // Mining: 1
      board = addUnit(board, unit);
      board = updateCell(board, { x: 5, y: 5 }, { resourceLayers: 4, minedDepth: 1 });

      const result = executeMine(board, unit.id, 5);

      expect(result.amountMined).toBe(0);
      expect(result.newResources).toBe(5);
    });

    it('is immutable - original board unchanged', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      executeMine(board, unit.id, 0);

      const cell = getCell(board, { x: 5, y: 5 });
      expect(cell?.resourceLayers).toBe(5);
    });
  });

  describe('getTotalBoardResources', () => {
    it('returns 500 for fresh board (10x10 * 5 resources)', () => {
      const board = createEmptyBoard();
      expect(getTotalBoardResources(board)).toBe(500);
    });

    it('decreases after mining', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_4', 'player', { x: 5, y: 5 }); // Mining: 5
      board = addUnit(board, unit);

      const result = executeMine(board, unit.id, 0);
      expect(getTotalBoardResources(result.board)).toBe(495);
    });
  });

  describe('isDepleted', () => {
    it('returns true for fully mined cell', () => {
      const cell = { position: { x: 0, y: 0 }, resourceLayers: 0, minedDepth: 5 };
      expect(isDepleted(cell)).toBe(true);
    });

    it('returns false for cell with resources', () => {
      const cell = { position: { x: 0, y: 0 }, resourceLayers: 3, minedDepth: 2 };
      expect(isDepleted(cell)).toBe(false);
    });
  });

  describe('isDryForUnit', () => {
    it('returns true if unit cannot reach remaining layers', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Mining: 1
      const cell = { position: { x: 0, y: 0 }, resourceLayers: 4, minedDepth: 1 };
      expect(isDryForUnit(unit, cell)).toBe(true);
    });

    it('returns false if unit can reach remaining layers', () => {
      const unit = createUnit('plant_1', 'player', { x: 0, y: 0 }); // Mining: 2
      const cell = { position: { x: 0, y: 0 }, resourceLayers: 4, minedDepth: 1 };
      expect(isDryForUnit(unit, cell)).toBe(false);
    });

    it('returns true for depleted cell', () => {
      const unit = createUnit('plant_4', 'player', { x: 0, y: 0 });
      const cell = { position: { x: 0, y: 0 }, resourceLayers: 0, minedDepth: 5 };
      expect(isDryForUnit(unit, cell)).toBe(true);
    });
  });

  describe('Mining progression scenarios', () => {
    it('sequence: Hi mines, then Muju mines, then Hi is dry', () => {
      let board = createEmptyBoard();
      const hi = createUnit('fire_1', 'player', { x: 0, y: 0 }); // Mining: 1
      const muju = createUnit('plant_1', 'player', { x: 0, y: 0 }); // Mining: 2
      muju.id = 'muju-test'; // Override for testing

      // Start fresh - Hi mines depth 1
      let cell = getCell(board, { x: 0, y: 0 })!;
      expect(calculateMiningYield(hi, cell)).toBe(1);

      // After Hi mines
      board = updateCell(board, { x: 0, y: 0 }, { resourceLayers: 4, minedDepth: 1 });
      cell = getCell(board, { x: 0, y: 0 })!;

      // Hi is now dry (top layer at depth 2, Hi can only reach depth 1)
      expect(calculateMiningYield(hi, cell)).toBe(0);

      // Muju can still mine (depth 2)
      expect(calculateMiningYield(muju, cell)).toBe(1);

      // After Muju mines
      board = updateCell(board, { x: 0, y: 0 }, { resourceLayers: 3, minedDepth: 2 });
      cell = getCell(board, { x: 0, y: 0 })!;

      // Muju is now dry too (top layer at depth 3)
      expect(calculateMiningYield(muju, cell)).toBe(0);
    });

    it('Cuauhtlimallki (Mining 5) can fully deplete a cell in one action', () => {
      let board = createEmptyBoard();
      const unit = createUnit('plant_4', 'player', { x: 5, y: 5 }); // Mining: 5
      board = addUnit(board, unit);

      const result = executeMine(board, unit.id, 0);

      expect(result.amountMined).toBe(5);
      const cell = getCell(result.board, { x: 5, y: 5 });
      expect(cell?.resourceLayers).toBe(0);
      expect(isDepleted(cell!)).toBe(true);
    });

    it('multiple units mine same cell progressively', () => {
      let board = createEmptyBoard();

      // First: Sachita (Mining 3) extracts 3
      let cell = getCell(board, { x: 0, y: 0 })!;
      const sachita = createUnit('plant_2', 'player', { x: 0, y: 0 });
      expect(calculateMiningYield(sachita, cell)).toBe(3);

      board = updateCell(board, { x: 0, y: 0 }, { resourceLayers: 2, minedDepth: 3 });
      cell = getCell(board, { x: 0, y: 0 })!;

      // Sachita is now dry (top at depth 4)
      expect(calculateMiningYield(sachita, cell)).toBe(0);

      // Sachakuna (Mining 4) can get 1 more
      const sachakuna = createUnit('plant_3', 'player', { x: 0, y: 0 });
      expect(calculateMiningYield(sachakuna, cell)).toBe(1);

      board = updateCell(board, { x: 0, y: 0 }, { resourceLayers: 1, minedDepth: 4 });
      cell = getCell(board, { x: 0, y: 0 })!;

      // Sachakuna is now dry (top at depth 5)
      expect(calculateMiningYield(sachakuna, cell)).toBe(0);

      // Only Cuauhtlimallki (Mining 5) can get the last one
      const cuauhtlimallki = createUnit('plant_4', 'player', { x: 0, y: 0 });
      expect(calculateMiningYield(cuauhtlimallki, cell)).toBe(1);
    });
  });
});
