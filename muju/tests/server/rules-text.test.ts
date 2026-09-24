// @vitest-environment node
/**
 * The agent-facing rules must teach where a unit can be bought, how mining
 * works and how upkeep can eliminate. Until 2026-09-24 `muju_rules` and the
 * public skill said "supporting rectangle" without ever defining it, and LLM
 * players in the Hard campaign guessed at purchase squares for whole games.
 * The worked example in the text is checked against the real spawn rule here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rules } from '../../server/observation';
import { getPurchasePositions } from '../../src/game/summoning';
import { buildState, type UnitSpec } from '../ai/hard/game-fixture';
import type { Position } from '../../src/game/types';

const square = (p: Position): string => `${'ABCDEFGHIJ'[p.x]}${p.y + 1}`;

function whiteSquares(enemies: UnitSpec[]): string[] {
  const state = buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 2 }, // C3
      { def: 'water_1', owner: 'white', x: 0, y: 4 }, // A5
      { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ...enemies,
    ],
    current: 'white',
    phase: 'place',
  });
  return getPurchasePositions(state, 'white').map(square).sort();
}

describe('agent-facing rules text', () => {
  it('defines the spawn rectangle, mining and upkeep elimination in muju_rules', () => {
    expect(rules.spawning).toMatch(/home corner \(White A1, Black J10\)/);
    expect(rules.spawning).toMatch(/any enemy unit/i);
    expect(rules.summons).toContain('see spawning');
    expect(rules.mining).toMatch(/never refill/);
    expect(rules.mining).toMatch(/kill clock/);
    expect(rules.upkeep).toContain('upkeep-elimination');
  });

  it.each(['public/skills/muju-hono-irumbu/SKILL.md', 'public/skills/muju-hono-tanka/SKILL.md'])(
    'teaches the same rules in %s', path => {
      const text = readFileSync(path, 'utf8');
      expect(text).toContain('**Where you can buy.**');
      expect(text).toMatch(/spawn rectangle/);
      expect(text).toContain('`upkeep-elimination`');
    });

  it('matches the worked example: C3 and A5 anchor A1–C3 and A1–A5', () => {
    const open = whiteSquares([]);
    expect(open).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2'].sort());
    // An enemy on B2 blocks A1–C3, not the A1–A5 column.
    expect(whiteSquares([{ def: 'fire_1', owner: 'black', x: 1, y: 1 }])).toEqual(['A1', 'A2', 'A3', 'A4']);
    // An enemy on the home corner blocks every rectangle.
    expect(whiteSquares([{ def: 'fire_1', owner: 'black', x: 0, y: 0 }])).toEqual([]);
  });
});
