import { test, expect, type Page } from '@playwright/test';

/**
 * THE PHASING AI, in a real browser.
 *
 * Phasing is the only ruleset shipped since 2026-09-21, so a vs-AI game needs
 * no opt-in, no ruleset control and carries no preview badge — the first test
 * here is that guard, and it is the one that must never stop failing to find an
 * opt-in. The rest is the engine itself: the AI plays a COMPLETE Phasing turn
 * through the real reducer — Act, END_ACTION_PHASE (mine, then upkeep),
 * Prepare, END_PLACE_PHASE — and hands the turn back with no error banner.
 *
 * Modelled on `e2e/ai-timer.spec.ts` (how a vs-AI game is started and handed
 * over) and `e2e/phasing.spec.ts` (what a Phasing turn looks like).
 */

/** The human (white) plays a whole Phasing turn: Act, then Prepare. */
async function playHumanPhasingTurn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await page.getByRole('button', { name: 'End turn' }).click();
}

async function startPhasingVsAI(page: Page, difficulty: 'easy' | 'medium' | 'hard', pace: 'quick' | 'normal' | 'deep'): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'vs AI Play against the computer', exact: true }).click();
  await page.getByLabel('AI Difficulty').selectOption(difficulty);
  await page.getByLabel('Thinking time').selectOption(pace);
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
}

/** Waits for the AI's whole Phasing turn to finish and control to come back. */
async function expectAITurnCompletes(page: Page, timeout: number): Promise<void> {
  await expect(page.locator('.turn-strip')).toContainText('You', { timeout });
  // The turn came back legally: no "AI stopped thinking" banner, and the human
  // is at the start of his own Act phase rather than stranded mid-turn.
  await expect(page.getByText('The AI stopped thinking. Try again to keep playing.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();
}

test('vs-AI starts under Phasing with no opt-in and no ruleset control', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'vs AI Play against the computer', exact: true }).click();
  // No ruleset control anywhere, no preview badge, and nothing to opt into:
  // Phasing is what the AI plays.
  await expect(page.getByRole('radio', { name: /Phasing/ })).toHaveCount(0);
  await expect(page.getByText('Preview · unreleased AI')).toHaveCount(0);
  await expect(page.getByText('AI plays Standard rules. Try Phasing in Pass & Play or online.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();

  // Pass & Play is the same one ruleset, equally unbadged.
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await expect(page.getByRole('radio', { name: /Phasing/ })).toHaveCount(0);
  await expect(page.getByText('Preview · unreleased AI')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await expect(page.locator('.ruleset-badge')).toHaveText('Phasing');
});

test('Easy plays a complete Phasing turn against the owner', async ({ page }, info) => {
  test.setTimeout(90_000);
  await startPhasingVsAI(page, 'easy', 'normal');
  await playHumanPhasingTurn(page);
  await expectAITurnCompletes(page, 45_000);
  // The summoning panel is the shared one, mounted for both sides. (It is
  // empty, and therefore zero-height, until somebody commits a summon, so it is
  // located by class rather than by role here.)
  await expect(page.locator('.summoning-status')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('phasing-ai-easy.png'), fullPage: true });

  // Keep playing until the AI commits a summon of its own. Its commitment is
  // rendered exactly as a human's is — the same dashed silhouette on the board
  // and the same "committed" entry in the panel — because both come from the
  // one `pendingSummons` list and neither the board nor `SummoningStatus`
  // knows or cares which seat is an engine.
  const aiCommitment = page.locator('[aria-label*="phasing in, not an occupant"][aria-label*="black"]');
  for (let exchange = 0; exchange < 8 && await aiCommitment.count() === 0; exchange++) {
    await playHumanPhasingTurn(page);
    await expectAITurnCompletes(page, 45_000);
  }
  await expect(aiCommitment.first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Phasing summons' })).toContainText('◆ committed');
  await page.screenshot({ path: info.outputPath('phasing-ai-easy-summon.png'), fullPage: true });
});

test('Hard plays a complete Phasing turn with no engine failure counted', async ({ page }, info) => {
  test.setTimeout(180_000);
  await startPhasingVsAI(page, 'hard', 'quick');
  await playHumanPhasingTurn(page);
  await expectAITurnCompletes(page, 90_000);
  await page.screenshot({ path: info.outputPath('phasing-ai-hard.png'), fullPage: true });

  const diag = await page.evaluate(() => (window as unknown as { __mujuHardDiag?: Record<string, number> }).__mujuHardDiag);
  expect(diag, 'the hard route must have installed its counters').toBeTruthy();
  // The real HardEngine answered, and nothing fell back: no pack failure, no
  // engine throw, no replica divergence, no action the canonical rules refused,
  // and no worker error.
  expect(diag!.hardTurns).toBeGreaterThan(0);
  expect({
    packError: diag!.packError, engineError: diag!.engineError, divergence: diag!.divergence,
    invalidSuffix: diag!.invalidSuffix, workerError: diag!.workerError,
    emptyPlan: diag!.emptyPlan, budgetExhausted: diag!.budgetExhausted,
  }).toEqual({ packError: 0, engineError: 0, divergence: 0, invalidSuffix: 0, workerError: 0,
    emptyPlan: 0, budgetExhausted: 0 });
});
