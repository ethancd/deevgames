import { test, expect, type Page } from '@playwright/test';

/**
 * The AI's turn clock, in a real browser: the player picks a thinking time on
 * the mode screen, and while the AI seat thinks a stopwatch counts that
 * allowance down beside the status copy, with one line saying what the clock
 * means. It is gone as soon as the AI has moved — the engine never waits its
 * clock out — and it fits both a phone and a desktop without pushing the board
 * or the decision panel around.
 *
 * AN ALLOWANCE TOO SHORT TO COUNT DOWN GETS NO DIAL. Easy at `quick` is one
 * second, where a stopwatch would mount, sweep a whole revolution and unmount
 * again every turn; three seconds is the shortest allowance that gets one
 * (`AIThinkingTimer.tsx AI_TIMER_MIN_BUDGET_MS`).
 */
async function startVsAI(page: Page, difficulty: 'easy' | 'medium' | 'hard', pace: 'quick' | 'normal' | 'deep'): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'vs AI Play against the computer', exact: true }).click();
  await page.getByLabel('AI Difficulty').selectOption(difficulty);
  await page.getByLabel('Thinking time').selectOption(pace);
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
}

/** Hands the turn to the AI: a Phasing turn is Act, then Prepare. */
async function endHumanTurn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mine & prepare →' }).click();
  await page.getByRole('button', { name: 'End turn →' }).click();
}

for (const [width, height] of [[390, 844], [1280, 900]]) {
  test(`AI turn clock appears while the AI thinks and leaves with its move at ${width}×${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    // Easy at `normal` is three seconds: the shortest allowance that gets a dial.
    await startVsAI(page, 'easy', 'normal');
    const board = (await page.locator('.battle-board').boundingBox())!;
    await endHumanTurn(page);

    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer).toHaveAttribute('aria-label', /AI thinking, \d+ seconds? left of 3$/);
    // And the panel says what the dial is counting, on one line at 390 px.
    await expect(page.getByText('Up to 3 s · moves as soon as it\'s ready')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`ai-timer-${width}x${height}.png`) });

    // The AI moves as soon as it is ready; the dial goes with the turn.
    await expect(page.locator('.turn-strip')).toContainText('You', { timeout: 20000 });
    await expect(timer).toHaveCount(0);

    // Nothing moved to make room for it: same board, and the fixed-height
    // decision panel never had to scroll.
    expect(await page.locator('.battle-board').boundingBox()).toEqual(board);
    const panel = await page.locator('.decision-panel').evaluate(e => ({ h: e.clientHeight, sh: e.scrollHeight }));
    expect(panel.sh).toBeLessThanOrEqual(panel.h + 1);
  });
}

test('a one-second allowance gets the line but no dial to flicker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startVsAI(page, 'easy', 'quick');
  await endHumanTurn(page);
  // No stopwatch at any point of the AI's turn — not while it thinks…
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.locator('.turn-strip')).toContainText('You', { timeout: 15000 });
  // …and none left behind after it.
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('a deeper pace funds a longer turn without holding the AI to it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startVsAI(page, 'easy', 'deep');
  await endHumanTurn(page);
  const timer = page.getByRole('timer');
  await expect(timer).toBeVisible();
  // Easy at `deep` is ten seconds — the dial is counting that down…
  await expect(timer).toHaveAttribute('aria-label', /AI thinking, \d+ seconds? left of 10$/);
  await expect(page.getByText('Up to 10 s · moves as soon as it\'s ready')).toBeVisible();
  // …and the turn still ends when the search does, well inside the allowance.
  await expect(page.locator('.turn-strip')).toContainText('You', { timeout: 20000 });
  await expect(timer).toHaveCount(0);
});
