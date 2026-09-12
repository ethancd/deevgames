import { test, expect } from '@playwright/test';

test('pass and play alternates both human turns', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  for (const player of [2, 1, 2, 1]) {
    if(await page.getByRole('button',{name:'Start actions →'}).count())await page.getByRole('button',{name:'Start actions →'}).click();
    await page.getByRole('button', { name: 'End turn' }).click();
    const overlay = page.getByText('Pass device to').locator('..');
    await expect(overlay).toContainText(`Player ${player}`);
    await overlay.click();
    await expect(page.locator('.turn-strip')).toContainText(`Player ${player}`);
    await expect(page.locator('.action-budget strong')).toHaveText(/4 actions|Buy & promote/);
  }
});

test('handoff clears undo and Player 2 can play and undo only their own move', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'End turn' }).click();
  await page.getByText('Tap anywhere to continue').click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.getByTestId('cell-8-8').click();
  await page.getByTestId('cell-6-8').click();

  await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('cell-8-8')).toHaveAttribute('aria-label', /black Sjor/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.locator('.turn-strip')).toContainText('Player 2');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.turn-strip')).toContainText('Player 2');
});
