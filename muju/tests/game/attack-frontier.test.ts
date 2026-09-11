import { describe, expect, it } from 'vitest';
import { addUnit, createEmptyBoard, createUnit } from '../../src/game/board';
import { getAttackFrontier } from '../../src/game/movement';

describe('enemy attack frontier', () => {
  it.each([
    ['water_1', {x: 3, y: 3}, {x: 4, y: 3}],
    ['fire_1', {x: 9, y: 2}, {x: 9, y: 3}],
    ['lightning_1', {x: 9, y: 7}, {x: 9, y: 8}],
  ] as const)('%s reserves the sixth action for attacking', (id, last, beyond) => {
    const enemy = createUnit(id, 'black', {x: 0, y: 0});
    const frontier = getAttackFrontier(enemy, addUnit(createEmptyBoard(), enemy));
    expect(frontier).toContainEqual(last);
    expect(frontier).not.toContainEqual(beyond);
    expect(frontier).not.toContainEqual({x: 1, y: 1});
    expect(frontier).not.toContainEqual(enemy.position);
  });

  it('clips the outline to board edges even when speed covers the entire board', () => {
    const enemy = createUnit('lightning_3', 'black', {x: 5, y: 5});
    const frontier = getAttackFrontier(enemy, addUnit(createEmptyBoard(), enemy));
    expect(frontier).toHaveLength(36);
    expect(frontier.every(p => p.x === 0 || p.y === 0 || p.x === 9 || p.y === 9)).toBe(true);
  });

  it('uses paths around blockers rather than an unobstructed distance diamond', () => {
    const enemy = createUnit('water_1', 'black', {x: 0, y: 0});
    let board = addUnit(createEmptyBoard(), enemy);
    for (let y = 0; y < 4; y++) board = addUnit(board, createUnit('metal_1', 'black', {x: 2, y}));
    const frontier = getAttackFrontier(enemy, board);
    expect(frontier).not.toContainEqual({x: 3, y: 0});
    expect(frontier).toContainEqual({x: 2, y: 4});
    expect(frontier).not.toContainEqual({x: 3, y: 4});
    expect(frontier.some(p => p.x === 2 && p.y < 4)).toBe(false);
  });

  it('includes occupied targets regardless of lethality and never moves through them', () => {
    const enemy = createUnit('water_1', 'black', {x: 5, y: 5});
    const positions = [{x: 5, y: 4}, {x: 5, y: 6}, {x: 4, y: 5}, {x: 6, y: 5}];
    const board = positions.reduce((b, p) => addUnit(b, createUnit('metal_3', 'white', p)), addUnit(createEmptyBoard(), enemy));
    const frontier = getAttackFrontier(enemy, board);
    expect(frontier).toHaveLength(4);
    for (const p of positions) expect(frontier).toContainEqual(p);
  });

  it('previews a fresh enemy turn and recalculates after a blocker moves', () => {
    const enemy = createUnit('water_1', 'black', {x: 0, y: 0});
    enemy.canActThisTurn = false;
    enemy.hasAttacked = true;
    const blockers = [{x: 0, y: 1}, {x: 1, y: 0}].map(p => createUnit('metal_1', 'black', p));
    const board = blockers.reduce((b, u) => addUnit(b, u), addUnit(createEmptyBoard(), enemy));
    expect(getAttackFrontier(enemy, board)).toEqual([]);
    const opened = {...board, units: board.units.filter(u => u.id !== blockers[0].id)};
    expect(getAttackFrontier(enemy, opened)).toContainEqual({x: 0, y: 6});
  });
});
