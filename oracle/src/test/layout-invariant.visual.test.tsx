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
 * To run:
 * - `npm test` - Quick tests using jsdom (may have false positives due to no layout engine)
 * - `npm run test:visual` - Full browser tests with Playwright (requires browser install)
 *
 * ⚠️  jsdom Limitation:
 * jsdom doesn't perform real layout calculations. getBoundingClientRect() may return 0x0
 * for all elements, causing tests to pass incorrectly. For true visual regression testing,
 * use Playwright with `npm run test:visual` (requires `npx playwright install chromium`).
 *
 * Based on techniques from:
 * - https://blog.openreplay.com/preventing-layout-shift-modern-css/
 * - https://vitest.dev/guide/browser/visual-regression-testing
 * - https://vitest.dev/config/browser
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

describe('Layout Invariance - Enemy List Spacing', () => {
  const createEnemy = (id: string, name: string, hp: number, maxHP: number = 20): Enemy => ({
    id,
    type: 'enemy',
    name,
    hp,
    maxHP,
  });

  // Helper to render a list of enemies in a container (simulating CombatScreen layout)
  const EnemyList = ({ enemies, isPlayerTurn }: { enemies: Enemy[]; isPlayerTurn: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="enemy-list">
      {enemies.map(enemy => (
        <EnemyDisplay
          key={enemy.id}
          enemy={enemy}
          onAttack={() => {}}
          isPlayerTurn={isPlayerTurn}
        />
      ))}
    </div>
  );

  it('spacing between enemies stays constant regardless of HP values', () => {
    const fullHPEnemies = [
      createEnemy('e1', 'Goblin', 20, 20),
      createEnemy('e2', 'Orc', 30, 30),
      createEnemy('e3', 'Troll', 40, 40),
    ];

    const mixedHPEnemies = [
      createEnemy('e1', 'Goblin', 5, 20),   // Low HP
      createEnemy('e2', 'Orc', 0, 30),      // Dead
      createEnemy('e3', 'Troll', 40, 40),   // Full HP
    ];

    const { container: fullHP } = render(<EnemyList enemies={fullHPEnemies} isPlayerTurn={true} />);
    const { container: mixedHP } = render(<EnemyList enemies={mixedHPEnemies} isPlayerTurn={true} />);

    // Get all enemy buttons in each list
    const fullHPButtons = fullHP.querySelectorAll('button');
    const mixedHPButtons = mixedHP.querySelectorAll('button');

    expect(fullHPButtons.length).toBe(3);
    expect(mixedHPButtons.length).toBe(3);

    // Calculate gaps between consecutive enemies
    const getGaps = (buttons: NodeListOf<Element>) => {
      const gaps: number[] = [];
      for (let i = 0; i < buttons.length - 1; i++) {
        const current = buttons[i].getBoundingClientRect();
        const next = buttons[i + 1].getBoundingClientRect();
        // Gap = top of next element - bottom of current element
        gaps.push(next.top - current.bottom);
      }
      return gaps;
    };

    const fullHPGaps = getGaps(fullHPButtons);
    const mixedHPGaps = getGaps(mixedHPButtons);

    // All gaps should be equal within each list
    expect(fullHPGaps[0]).toBe(fullHPGaps[1]);
    expect(mixedHPGaps[0]).toBe(mixedHPGaps[1]);

    // Gaps should be the same between both lists
    expect(fullHPGaps[0]).toBe(mixedHPGaps[0]);
    expect(fullHPGaps[1]).toBe(mixedHPGaps[1]);
  });

  it('spacing between enemies stays constant regardless of turn state', () => {
    const enemies = [
      createEnemy('e1', 'Goblin', 15, 20),
      createEnemy('e2', 'Orc', 25, 30),
    ];

    const { container: playerTurn } = render(<EnemyList enemies={enemies} isPlayerTurn={true} />);
    const { container: enemyTurn } = render(<EnemyList enemies={enemies} isPlayerTurn={false} />);

    const playerTurnButtons = playerTurn.querySelectorAll('button');
    const enemyTurnButtons = enemyTurn.querySelectorAll('button');

    // Calculate gap between the two enemies
    const playerTurnGap = playerTurnButtons[1].getBoundingClientRect().top -
                          playerTurnButtons[0].getBoundingClientRect().bottom;
    const enemyTurnGap = enemyTurnButtons[1].getBoundingClientRect().top -
                         enemyTurnButtons[0].getBoundingClientRect().bottom;

    // Gap should be the same regardless of turn state
    expect(playerTurnGap).toBe(enemyTurnGap);
  });

  it('spacing between enemies stays constant with different name lengths', () => {
    const shortNames = [
      createEnemy('e1', 'Rat', 10, 20),
      createEnemy('e2', 'Bat', 10, 20),
    ];

    const longNames = [
      createEnemy('e1', 'Ancient Dragon', 10, 20),
      createEnemy('e2', 'Skeleton Warrior', 10, 20),
    ];

    const { container: shortContainer } = render(<EnemyList enemies={shortNames} isPlayerTurn={true} />);
    const { container: longContainer } = render(<EnemyList enemies={longNames} isPlayerTurn={true} />);

    const shortButtons = shortContainer.querySelectorAll('button');
    const longButtons = longContainer.querySelectorAll('button');

    const shortGap = shortButtons[1].getBoundingClientRect().top -
                     shortButtons[0].getBoundingClientRect().bottom;
    const longGap = longButtons[1].getBoundingClientRect().top -
                    longButtons[0].getBoundingClientRect().bottom;

    // Gap should be the same regardless of name length
    expect(shortGap).toBe(longGap);
  });

  it('enemy list container has explicit gap in computed styles', () => {
    const enemies = [
      createEnemy('e1', 'Goblin', 20, 20),
      createEnemy('e2', 'Orc', 30, 30),
    ];

    const { container } = render(<EnemyList enemies={enemies} isPlayerTurn={true} />);
    const list = container.querySelector('[data-testid="enemy-list"]');

    expect(list).toBeTruthy();

    const computedStyle = window.getComputedStyle(list!);
    const gap = computedStyle.gap || computedStyle.rowGap;

    // Should have an explicit gap value (not '0px' or 'normal')
    expect(gap).not.toBe('normal');
    expect(gap).not.toBe('0px');
    expect(parseFloat(gap)).toBeGreaterThan(0);
  });
});

describe('Layout Invariance - Enemy to Player Spacing', () => {
  const createEnemy = (id: string, name: string, hp: number, maxHP: number = 20): Enemy => ({
    id,
    type: 'enemy',
    name,
    hp,
    maxHP,
  });

  const createPlayer = (hp: number, maxHP: number = 50): Player => ({
    id: 'player',
    type: 'player',
    hp,
    maxHP,
  });

  // Helper to render enemies + player in a layout (simulating CombatScreen)
  const CombatLayout = ({
    enemies,
    player,
    isPlayerTurn
  }: {
    enemies: Enemy[];
    player: Player;
    isPlayerTurn: boolean;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} data-testid="combat-layout">
      {/* Enemies section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="enemy-section">
        {enemies.map(enemy => (
          <EnemyDisplay
            key={enemy.id}
            enemy={enemy}
            onAttack={() => {}}
            isPlayerTurn={isPlayerTurn}
          />
        ))}
      </div>

      {/* Player section */}
      <div style={{ paddingTop: '1rem' }} data-testid="player-section">
        <PlayerDisplay player={player} />
      </div>
    </div>
  );

  it('spacing between enemies and player stays constant regardless of enemy HP', () => {
    const fullHPEnemies = [
      createEnemy('e1', 'Goblin', 20, 20),
      createEnemy('e2', 'Orc', 30, 30),
    ];
    const lowHPEnemies = [
      createEnemy('e1', 'Goblin', 3, 20),
      createEnemy('e2', 'Orc', 0, 30),  // Dead
    ];
    const player = createPlayer(50);

    const { container: fullHP } = render(
      <CombatLayout enemies={fullHPEnemies} player={player} isPlayerTurn={true} />
    );
    const { container: lowHP } = render(
      <CombatLayout enemies={lowHPEnemies} player={player} isPlayerTurn={true} />
    );

    // Get the last enemy button and player div in each
    const fullHPEnemyButtons = fullHP.querySelectorAll('[data-testid="enemy-section"] button');
    const lowHPEnemyButtons = lowHP.querySelectorAll('[data-testid="enemy-section"] button');
    const fullHPPlayer = fullHP.querySelector('[data-testid="player-section"] > div');
    const lowHPPlayer = lowHP.querySelector('[data-testid="player-section"] > div');

    const lastFullHPEnemy = fullHPEnemyButtons[fullHPEnemyButtons.length - 1];
    const lastLowHPEnemy = lowHPEnemyButtons[lowHPEnemyButtons.length - 1];

    // Calculate gap between last enemy and player
    const fullHPGap = fullHPPlayer!.getBoundingClientRect().top -
                      lastFullHPEnemy.getBoundingClientRect().bottom;
    const lowHPGap = lowHPPlayer!.getBoundingClientRect().top -
                     lastLowHPEnemy.getBoundingClientRect().bottom;

    expect(fullHPGap).toBe(lowHPGap);
  });

  it('spacing between enemies and player stays constant regardless of player HP', () => {
    const enemies = [createEnemy('e1', 'Goblin', 15, 20)];
    const fullHPPlayer = createPlayer(50, 50);
    const lowHPPlayer = createPlayer(10, 50);
    const deadPlayer = createPlayer(0, 50);

    const { container: fullHP } = render(
      <CombatLayout enemies={enemies} player={fullHPPlayer} isPlayerTurn={true} />
    );
    const { container: lowHP } = render(
      <CombatLayout enemies={enemies} player={lowHPPlayer} isPlayerTurn={true} />
    );
    const { container: dead } = render(
      <CombatLayout enemies={enemies} player={deadPlayer} isPlayerTurn={false} />
    );

    const getGap = (container: Element) => {
      const enemyButton = container.querySelector('[data-testid="enemy-section"] button');
      const playerDiv = container.querySelector('[data-testid="player-section"] > div');
      return playerDiv!.getBoundingClientRect().top - enemyButton!.getBoundingClientRect().bottom;
    };

    const fullHPGap = getGap(fullHP);
    const lowHPGap = getGap(lowHP);
    const deadGap = getGap(dead);

    expect(fullHPGap).toBe(lowHPGap);
    expect(fullHPGap).toBe(deadGap);
  });

  it('combat layout has explicit gap between sections in computed styles', () => {
    const enemies = [createEnemy('e1', 'Goblin', 20, 20)];
    const player = createPlayer(50);

    const { container } = render(
      <CombatLayout enemies={enemies} player={player} isPlayerTurn={true} />
    );

    const layout = container.querySelector('[data-testid="combat-layout"]');
    expect(layout).toBeTruthy();

    const computedStyle = window.getComputedStyle(layout!);
    const gap = computedStyle.gap || computedStyle.rowGap;

    // Should have an explicit gap value
    expect(gap).not.toBe('normal');
    expect(gap).not.toBe('0px');
    expect(parseFloat(gap)).toBeGreaterThan(0);
  });
});

describe('Layout Invariance - Computed Styles', () => {
  it('enemy buttons have explicit fixed height in computed styles', () => {
    const enemy = { id: 'e1', type: 'enemy' as const, name: 'Test', hp: 10, maxHP: 20 };
    const { container } = render(
      <EnemyDisplay enemy={enemy} onAttack={() => {}} isPlayerTurn={true} />
    );

    const button = container.querySelector('button');
    expect(button).toBeTruthy();

    // Check computed style has an explicit height value
    const computedStyle = window.getComputedStyle(button!);
    const height = computedStyle.height;

    // Should have a numeric height value (not 'auto' or '0px')
    expect(height).not.toBe('auto');
    expect(height).not.toBe('0px');
    expect(parseFloat(height)).toBeGreaterThan(0);
  });

  it('player display has explicit fixed height in computed styles', () => {
    const player = { id: 'player', type: 'player' as const, hp: 30, maxHP: 50 };
    const { container } = render(<PlayerDisplay player={player} />);

    const playerDiv = container.querySelector('div');
    expect(playerDiv).toBeTruthy();

    // Check computed style has an explicit height value
    const computedStyle = window.getComputedStyle(playerDiv!);
    const height = computedStyle.height;

    // Should have a numeric height value (not 'auto' or '0px')
    expect(height).not.toBe('auto');
    expect(height).not.toBe('0px');
    expect(parseFloat(height)).toBeGreaterThan(0);
  });
});
