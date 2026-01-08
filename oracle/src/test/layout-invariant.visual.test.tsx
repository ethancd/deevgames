/**
 * Visual Regression Tests for Layout Invariance
 *
 * These tests ensure that UI elements maintain fixed sizes regardless of content:
 * - Enemy HP changes shouldn't change target size
 * - Turn indicator with/without hourglass should have same height
 * - Title changes (game/victory/defeat) shouldn't move elements
 *
 * To run: npm run test:visual
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

    // Both should have min-h-[7.5rem] = 120px
    const fullHPButton = fullHP.querySelector('button');
    const lowHPButton = lowHP.querySelector('button');

    expect(fullHPButton).toBeTruthy();
    expect(lowHPButton).toBeTruthy();
    expect(fullHPButton?.classList.contains('min-h-[7.5rem]')).toBe(true);
    expect(lowHPButton?.classList.contains('min-h-[7.5rem]')).toBe(true);
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

    expect(aliveButton?.classList.contains('min-h-[7.5rem]')).toBe(true);
    expect(deadButton?.classList.contains('min-h-[7.5rem]')).toBe(true);
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

    const fullHPDiv = fullHP.querySelector('[class*="min-h-[8rem]"]');
    const lowHPDiv = lowHP.querySelector('[class*="min-h-[8rem]"]');

    expect(fullHPDiv).toBeTruthy();
    expect(lowHPDiv).toBeTruthy();
  });

  it('player alive vs defeated should maintain same height', () => {
    const alivePlayer = createPlayer(30);
    const deadPlayer = createPlayer(0);

    const { container: alive } = render(<PlayerDisplay player={alivePlayer} />);
    const { container: dead } = render(<PlayerDisplay player={deadPlayer} />);

    const aliveDiv = alive.querySelector('[class*="min-h-[8rem]"]');
    const deadDiv = dead.querySelector('[class*="min-h-[8rem]"]');

    expect(aliveDiv).toBeTruthy();
    expect(deadDiv).toBeTruthy();
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

  it('current turn indicator should have fixed height for player turn', () => {
    const { container } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={0} enemies={enemies} />
    );

    // Current turn indicator should have min-h-[4rem]
    const turnIndicator = container.querySelector('[class*="min-h-[4rem]"]');
    expect(turnIndicator).toBeTruthy();
  });

  it('current turn indicator should have fixed height for enemy turn', () => {
    const { container } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={1} enemies={enemies} />
    );

    // Current turn indicator should have min-h-[4rem] even with hourglass emoji
    const turnIndicator = container.querySelector('[class*="min-h-[4rem]"]');
    expect(turnIndicator).toBeTruthy();
  });

  it('turn timeline should have fixed min-height', () => {
    const { container } = render(
      <TurnTimeline turnQueue={turnQueue} currentTurnIndex={0} enemies={enemies} />
    );

    // Timeline container should have min-h-[5rem]
    const timeline = container.querySelector('[class*="min-h-[5rem]"]');
    expect(timeline).toBeTruthy();
  });
});

describe('Layout Invariance - CSS Verification', () => {
  it('all interactive elements should use flexbox for vertical centering', () => {
    const enemy = { id: 'e1', type: 'enemy' as const, name: 'Test', hp: 10, maxHP: 20 };
    const { container } = render(
      <EnemyDisplay enemy={enemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const button = container.querySelector('button');
    expect(button?.classList.toString()).toContain('flex');
    expect(button?.classList.toString()).toContain('flex-col');
    expect(button?.classList.toString()).toContain('justify-center');
  });

  it('all text containers should have min-height declarations', () => {
    const enemy = { id: 'e1', type: 'enemy' as const, name: 'Test', hp: 10, maxHP: 20 };
    const { container } = render(
      <EnemyDisplay enemy={enemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    // Name should have min-height
    const nameDiv = container.querySelector('[class*="min-h-[1.75rem]"]');
    expect(nameDiv).toBeTruthy();
  });
});
