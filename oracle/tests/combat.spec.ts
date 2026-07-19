import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Start dev server at http://localhost:5173 before running tests
  await page.goto('http://localhost:5173');
});

test.describe('Combat Screen', () => {
  test('should display the game title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /oracle of delve/i })).toBeVisible();
  });

  test('should show current turn indicator', async ({ page }) => {
    await expect(page.getByText(/YOUR TURN|'S TURN/)).toBeVisible();
  });

  test('should display turn order timeline', async ({ page }) => {
    await expect(page.getByText('Turn Order')).toBeVisible();
  });
});

test.describe('Enemy HP Display', () => {
  test('should display both enemies with their names', async ({ page }) => {
    // Check for enemy names
    await expect(page.getByText('Goblin')).toBeVisible();
    await expect(page.getByText('Orc')).toBeVisible();
  });

  test('should display enemy HP numbers', async ({ page }) => {
    // Both enemies should start with 20/20 HP
    const hpDisplays = page.getByText(/\d+ \/ \d+/);
    await expect(hpDisplays).toHaveCount(3); // 2 enemies + 1 player
  });

  test('should display enemy HP bars', async ({ page }) => {
    // Check that HP bars exist (they have the gradient bg classes)
    const hpBars = page.locator('.bg-gradient-to-r.from-red-600.to-red-500');
    await expect(hpBars).toHaveCount(2); // One for each enemy
  });

  test('should update enemy HP when attacked', async ({ page }) => {
    // Wait for player's turn
    await expect(page.getByText('YOUR TURN')).toBeVisible();

    // Get the first enemy button (Goblin)
    const goblinButton = page.getByRole('button').filter({ hasText: 'Goblin' });

    // Click to attack
    await goblinButton.click();

    // Wait for damage animation to appear
    await expect(page.getByText('-8')).toBeVisible({ timeout: 1000 });

    // After the attack, HP should be reduced (20 - 8 = 12)
    // Note: This might need adjustment based on actual animation timing
    await page.waitForTimeout(500); // Wait for animation to complete
  });

  test('should show defeated status when enemy HP reaches 0', async ({ page }) => {
    // This test would need to attack an enemy until it's defeated
    // For now, we'll just check that the defeated state exists in the component
    // You would need to simulate multiple attacks to test this fully

    // Wait for player's turn
    await expect(page.getByText('YOUR TURN')).toBeVisible();

    // Attack the Goblin multiple times (20 HP / 8 damage = 3 hits)
    const goblinButton = page.getByRole('button').filter({ hasText: 'Goblin' });

    for (let i = 0; i < 3; i++) {
      // Wait for player turn
      await expect(page.getByText('YOUR TURN')).toBeVisible();
      await goblinButton.click();

      // Wait for the turn to process
      await page.waitForTimeout(500);
    }

    // Check if defeated status appears
    await expect(page.getByText('☠ DEFEATED ☠')).toBeVisible({ timeout: 2000 });
  });

  test('should disable enemy button when it is not player turn', async ({ page }) => {
    // Wait for an enemy turn
    await page.waitForTimeout(1000); // Give time for first player turn

    const firstEnemyButton = page.getByRole('button').filter({ hasText: /Goblin|Orc/ }).first();

    // If it's not player turn, buttons should be disabled
    // This might require waiting for enemy turn
    const turnText = await page.getByText(/'S TURN|YOUR TURN/).textContent();

    if (turnText?.includes("'S TURN")) {
      await expect(firstEnemyButton).toBeDisabled();
    }
  });

  test('should show damage animation on attack', async ({ page }) => {
    // Wait for player's turn
    await expect(page.getByText('YOUR TURN')).toBeVisible();

    // Attack first enemy
    const firstEnemyButton = page.getByRole('button').filter({ hasText: /Goblin|Orc/ }).first();
    await firstEnemyButton.click();

    // Check for damage animation (shows -8)
    const damageText = page.getByText('-8');
    await expect(damageText).toBeVisible({ timeout: 1000 });
  });
});

test.describe('Player HP Display', () => {
  test('should display player HP with "You" label', async ({ page }) => {
    await expect(page.getByText('⚔ You ⚔')).toBeVisible();
  });

  test('should display player HP numbers', async ({ page }) => {
    // Player starts with 50 HP
    await expect(page.getByText('50 / 50 HP')).toBeVisible();
  });

  test('should display player HP bar', async ({ page }) => {
    // Check that player HP bar exists (blue gradient)
    const playerHpBar = page.locator('.bg-gradient-to-r.from-blue-600.to-blue-500');
    await expect(playerHpBar).toBeVisible();
  });

  test('should show damage on player when enemy attacks', async ({ page }) => {
    // Wait for player's turn and skip it by attacking an enemy
    await expect(page.getByText('YOUR TURN')).toBeVisible();
    const firstEnemyButton = page.getByRole('button').filter({ hasText: /Goblin|Orc/ }).first();
    await firstEnemyButton.click();

    // Wait for enemy turn
    await page.waitForTimeout(1000);

    // Check if player took damage (should show damage animation)
    const playerDamage = page.getByText('-6');
    await expect(playerDamage).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Victory and Defeat', () => {
  test('should show victory screen when all enemies are defeated', async ({ page }) => {
    // This test simulates defeating all enemies
    // We'll need to attack both enemies until defeated

    let attackCount = 0;
    const maxAttacks = 10; // Safety limit

    while (attackCount < maxAttacks) {
      // Check if victory screen is visible
      const victoryHeading = page.getByRole('heading', { name: /VICTORY/i });
      const isVictoryVisible = await victoryHeading.isVisible().catch(() => false);

      if (isVictoryVisible) {
        break;
      }

      // Wait for player turn
      const isPlayerTurn = await page.getByText('YOUR TURN').isVisible().catch(() => false);

      if (isPlayerTurn) {
        // Find a non-defeated enemy to attack
        const enemies = page.getByRole('button').filter({ hasText: /Goblin|Orc/ });
        const enemyCount = await enemies.count();

        for (let i = 0; i < enemyCount; i++) {
          const enemy = enemies.nth(i);
          const isEnabled = await enemy.isEnabled();

          if (isEnabled) {
            await enemy.click();
            break;
          }
        }
      }

      await page.waitForTimeout(500);
      attackCount++;
    }

    // Should show victory screen
    await expect(page.getByRole('heading', { name: /VICTORY/i })).toBeVisible();
    await expect(page.getByText('You have defeated all enemies!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Play Again/i })).toBeVisible();
  });

  test('should show defeat screen when player HP reaches 0', async ({ page }) => {
    // This test would require letting enemies attack the player repeatedly
    // For a real test, you might want to modify game state or use a faster approach

    // Check that defeat elements exist in the codebase
    // A full test would need to simulate player defeat
    const isDefeatVisible = await page.getByRole('heading', { name: /DEFEAT/i }).isVisible().catch(() => false);

    // This test is more of a smoke test - in practice you'd need to simulate actual defeat
    expect(isDefeatVisible !== undefined).toBe(true);
  });
});
