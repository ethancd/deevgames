/**
 * Visual Regression Tests for Layout Invariance
 *
 * These tests ensure that UI elements maintain fixed sizes regardless of content by:
 * - Measuring actual rendered dimensions with getBoundingClientRect()
 * - Comparing computed styles with getComputedStyle()
 * - Verifying geometry stays constant across content variations
 *
 * Test approach:
 * ✅ Measure actual rendered pixels (getBoundingClientRect)
 * ✅ Compare computed styles (getComputedStyle)
 * ❌ NOT checking CSS classes (classes can be overridden or misconfigured)
 *
 * Coverage:
 * - Enemy HP changes shouldn't change card dimensions
 * - Turn indicator with/without hourglass should have same height
 * - Player alive/defeated should maintain same container height
 * - Name length variations shouldn't affect card size
 *
 * To run: npm test
 *
 * Based on techniques from:
 * - https://blog.openreplay.com/preventing-layout-shift-modern-css/
 * - https://vitest.dev/guide/browser/visual-regression-testing
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EnemyDisplay } from '../components/EnemyDisplay';
import { PlayerDisplay } from '../components/PlayerDisplay';
import { TurnTimeline } from '../components/TurnTimeline';
import type { Enemy, Player, TurnQueueEntry } from '../game/types';

describe('Layout Invariance - Enemy Display', () => {
  const createEnemy = (hp: number, maxHP: number = 20): Enemy => ({
    id: 'enemy-1',
    type: 'enemy',
    name: 'Goblin',
    hp,
    maxHP,
  });

  it('enemy at full HP should have same dimensions as low HP', () => {
    const fullHPEnemy = createEnemy(20);
    const lowHPEnemy = createEnemy(5);

    const { container: fullHP } = render(
      <EnemyDisplay enemy={fullHPEnemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const { container: lowHP } = render(
      <EnemyDisplay enemy={lowHPEnemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const fullHPButton = fullHP.querySelector('button');
    const lowHPButton = lowHP.querySelector('button');

    expect(fullHPButton).toBeTruthy();
    expect(lowHPButton).toBeTruthy();

    // Measure actual rendered dimensions
    const fullHPRect = fullHPButton!.getBoundingClientRect();
    const lowHPRect = lowHPButton!.getBoundingClientRect();

    expect(fullHPRect.height).toBe(lowHPRect.height);
    expect(fullHPRect.width).toBe(lowHPRect.width);
  });

  it('enemy HP numbers of different widths maintain stable layout', () => {
    // Test single-digit vs double-digit HP display
    const singleDigit = createEnemy(5, 20);
    const doubleDigit = createEnemy(18, 20);

    const { container: single } = render(
      <EnemyDisplay enemy={singleDigit} onAttack={() => {}} isPlayerTurn={true} />
    );

    const { container: double } = render(
      <EnemyDisplay enemy={doubleDigit} onAttack={() => {}} isPlayerTurn={true} />
    );

    const singleButton = single.querySelector('button');
    const doubleButton = double.querySelector('button');

    expect(singleButton).toBeTruthy();
    expect(doubleButton).toBeTruthy();

    // Measure actual rendered dimensions
    const singleRect = singleButton!.getBoundingClientRect();
    const doubleRect = doubleButton!.getBoundingClientRect();

    expect(singleRect.height).toBe(doubleRect.height);
    expect(singleRect.width).toBe(doubleRect.width);
  });

  it('enemy alive vs defeated should maintain same height', () => {
    const aliveEnemy = createEnemy(10);
    const deadEnemy = createEnemy(0);

    const { container: alive } = render(
      <EnemyDisplay enemy={aliveEnemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const { container: dead } = render(
      <EnemyDisplay enemy={deadEnemy} onAttack={() => {}} isPlayerTurn={false} />
    );

    const aliveButton = alive.querySelector('button');
    const deadButton = dead.querySelector('button');

    expect(aliveButton).toBeTruthy();
    expect(deadButton).toBeTruthy();

    // Measure actual rendered dimensions
    const aliveRect = aliveButton!.getBoundingClientRect();
    const deadRect = deadButton!.getBoundingClientRect();

    expect(aliveRect.height).toBe(deadRect.height);
  });

  it('enemy with different name lengths maintain stable layout', () => {
    const shortName = { ...createEnemy(15), name: 'Rat' };
    const longName = { ...createEnemy(15), name: 'Ancient Dragon' };

    const { container: short } = render(
      <EnemyDisplay enemy={shortName} onAttack={() => {}} isPlayerTurn={true} />
    );

    const { container: long } = render(
      <EnemyDisplay enemy={longName} onAttack={() => {}} isPlayerTurn={true} />
    );

    const shortButton = short.querySelector('button');
    const longButton = long.querySelector('button');

    expect(shortButton).toBeTruthy();
    expect(longButton).toBeTruthy();

    // Measure actual rendered dimensions
    const shortRect = shortButton!.getBoundingClientRect();
    const longRect = longButton!.getBoundingClientRect();

    expect(shortRect.height).toBe(longRect.height);
    expect(shortRect.width).toBe(longRect.width);
  });
});

describe('Layout Invariance - Player Display', () => {
  const createPlayer = (hp: number, maxHP: number = 50): Player => ({
    id: 'player',
    type: 'player',
    hp,
    maxHP,
  });

  it('player at full HP should have same dimensions as low HP', () => {
    const fullHPPlayer = createPlayer(50);
    const lowHPPlayer = createPlayer(10);

    const { container: fullHP } = render(<PlayerDisplay player={fullHPPlayer} />);
    const { container: lowHP } = render(<PlayerDisplay player={lowHPPlayer} />);

    const fullHPDiv = fullHP.querySelector('div');
    const lowHPDiv = lowHP.querySelector('div');

    expect(fullHPDiv).toBeTruthy();
    expect(lowHPDiv).toBeTruthy();

    // Measure actual rendered dimensions
    const fullHPRect = fullHPDiv!.getBoundingClientRect();
    const lowHPRect = lowHPDiv!.getBoundingClientRect();

    expect(fullHPRect.height).toBe(lowHPRect.height);
    expect(fullHPRect.width).toBe(lowHPRect.width);
  });

  it('player alive vs defeated should maintain same height', () => {
    const alivePlayer = createPlayer(30);
    const deadPlayer = createPlayer(0);

    const { container: alive } = render(<PlayerDisplay player={alivePlayer} />);
    const { container: dead } = render(<PlayerDisplay player={deadPlayer} />);

    const aliveDiv = alive.querySelector('div');
    const deadDiv = dead.querySelector('div');

    expect(aliveDiv).toBeTruthy();
    expect(deadDiv).toBeTruthy();

    // Measure actual rendered dimensions
    const aliveRect = aliveDiv!.getBoundingClientRect();
    const deadRect = deadDiv!.getBoundingClientRect();

    expect(aliveRect.height).toBe(deadRect.height);
  });
});

describe('Layout Invariance - Turn Timeline', () => {
  const enemies: Enemy[] = [
    { id: 'enemy-1', type: 'enemy', name: 'Goblin', hp: 20, maxHP: 20 },
    { id: 'enemy-2', type: 'enemy', name: 'Orc', hp: 20, maxHP: 20 },
  ];

  const turnQueue: TurnQueueEntry[] = [
    { entityId: 'player', entityType: 'player' },
    { entityId: 'enemy-1', entityType: 'enemy' },
    { entityId: 'player', entityType: 'player' },
    { entityId: 'enemy-2', entityType: 'enemy' },
  ];

  it('current turn indicator has same height for player turn and enemy turn (with emoji)', () => {
    const { container: playerTurn } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={0} enemies={enemies} />
    );

    const { container: enemyTurn } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={1} enemies={enemies} />
    );

    // Find the turn indicator divs (first div child inside the timeline)
    const playerIndicator = playerTurn.querySelector('div > div');
    const enemyIndicator = enemyTurn.querySelector('div > div');

    expect(playerIndicator).toBeTruthy();
    expect(enemyIndicator).toBeTruthy();

    // Measure actual rendered dimensions
    const playerRect = playerIndicator!.getBoundingClientRect();
    const enemyRect = enemyIndicator!.getBoundingClientRect();

    // Heights should match despite emoji in enemy turn
    expect(playerRect.height).toBe(enemyRect.height);
  });

  it('turn timeline container has consistent height with different queue states', () => {
    const { container: firstTurn } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={0} enemies={enemies} />
    );

    const { container: lastTurn } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={3} enemies={enemies} />
    );

    // Find the entire timeline container (outermost div)
    const firstTimeline = firstTurn.querySelector('div');
    const lastTimeline = lastTurn.querySelector('div');

    expect(firstTimeline).toBeTruthy();
    expect(lastTimeline).toBeTruthy();

    // Measure actual rendered dimensions
    const firstRect = firstTimeline!.getBoundingClientRect();
    const lastRect = lastTimeline!.getBoundingClientRect();

    // Timeline height should be consistent regardless of current turn index
    expect(firstRect.height).toBe(lastRect.height);
  });
});

describe('Layout Invariance - Computed Styles', () => {
  it('enemy buttons have explicit minimum height in computed styles', () => {
    const enemy = { id: 'e1', type: 'enemy' as const, name: 'Test', hp: 10, maxHP: 20 };
    const { container } = render(
      <EnemyDisplay enemy={enemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const button = container.querySelector('button');
    expect(button).toBeTruthy();

    // Check computed style has an explicit min-height value
    const computedStyle = window.getComputedStyle(button!);
    const minHeight = computedStyle.minHeight;

    // Should have a numeric min-height value (not 'auto' or '0px')
    expect(minHeight).not.toBe('auto');
    expect(minHeight).not.toBe('0px');
    expect(parseFloat(minHeight)).toBeGreaterThan(0);
  });

  it('player display has explicit minimum height in computed styles', () => {
    const player = { id: 'player', type: 'player' as const, hp: 30, maxHP: 50 };
    const { container } = render(<PlayerDisplay player={player} />);

    const playerDiv = container.querySelector('div');
    expect(playerDiv).toBeTruthy();

    // Check computed style has an explicit min-height value
    const computedStyle = window.getComputedStyle(playerDiv!);
    const minHeight = computedStyle.minHeight;

    // Should have a numeric min-height value (not 'auto' or '0px')
    expect(minHeight).not.toBe('auto');
    expect(minHeight).not.toBe('0px');
    expect(parseFloat(minHeight)).toBeGreaterThan(0);
  });
});
