import { test, expect, type Page } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import type { GameState, PlayerId } from '../src/game/types';
import { SCHEMA_VERSION } from '../src/utils/persistence';

const vsAI = 'vs AI Play against the computer';

async function chooseAI(page: Page) {
  await page.getByRole('button', { name: vsAI, exact: true }).click();
}

async function seedGame(page: Page, state: GameState) {
  await page.addInitScript(({ saved, schemaVersion }) => {
    // Seed once so reload exercises the game's updated save, not the fixture.
    if (sessionStorage.getItem('player-side:seeded')) return;
    localStorage.setItem('elemental-tactics-save', JSON.stringify({
      schemaVersion, timestamp: Date.now(), state: saved,
    }));
    sessionStorage.setItem('player-side:seeded', 'true');
  }, { saved: state, schemaVersion: SCHEMA_VERSION });
}

test('Black lets the real White AI open at the chosen difficulty and shows its first-turn recap', async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker['postMessage']>) {
      const request = args[0];
      if (request?.type === 'search') {
        const searches = JSON.parse(sessionStorage.getItem('player-side:searches') ?? '[]');
        searches.push({ player: request.player, difficulty: request.difficulty });
        sessionStorage.setItem('player-side:searches', JSON.stringify(searches));
      }
      return Reflect.apply(original, this, args);
    };
  });
  await page.goto('./');
  await chooseAI(page);
  await expect(page.getByRole('group', { name: 'Play as', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'White', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Black', exact: true }).check();
  await page.getByLabel('AI Difficulty', { exact: true }).selectOption('easy');
  const worker = page.waitForEvent('worker');
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await worker;

  await expect(page.locator('.turn-strip')).toContainText('You · Turn 1', { timeout: 15000 });
  await expect(page.getByRole('button', { name: '↶ Undo', exact: true })).toBeDisabled();
  const searches = await page.evaluate(() => JSON.parse(sessionStorage.getItem('player-side:searches')!));
  expect(searches.length).toBeGreaterThan(0);
  expect(searches.every((request: { player: PlayerId; difficulty: string }) =>
    request.player === 'white' && request.difficulty === 'easy')).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('elemental-tactics-save')!).state);
  expect(saved.turn.currentPlayer).toBe('black');
  expect(saved.turn.turnNumber).toBe(1);
  expect(saved.lastIncome.player).toBe('white');
  await expect(page.locator('.income-recap summary')).toContainText('AI collected');
  await expect(page.locator('.score-strip > div').first()).toContainText('You');
  await expect(page.locator('.score-strip > div').first().locator('.player-dot')).toHaveClass('player-dot black');

  await page.getByRole('button', { name: 'Element advantages and match stats', exact: true }).click();
  const stats = page.getByRole('dialog', { name: 'Elements & match stats', exact: true });
  await expect(stats.getByText('AI Turn:', { exact: true })).toBeVisible();
  await stats.getByRole('button', { name: '✕', exact: true }).click();
  await expect(stats.getByText('AI Turn:', { exact: true })).toHaveCount(0);
  await stats.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.getByTestId('cell-8-8').click();
  await page.getByTestId('cell-6-8').click();

  await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.getByTestId('cell-8-8')).toHaveAttribute('aria-label', /black Sjor/);
  await expect(page.getByRole('button', { name: '↶ Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('black-human-tablet.png') });
  expect(errors).toEqual([]);
});

test('Black preference survives the mode menu and reload while resuming the saved Black turn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const state = createInitialGameState();
  state.turn.currentPlayer = 'black';
  state.turn.turnNumber = 4;
  state.players.black.resources = state.players.black.resourcesGained = 11;
  state.players.white.resources = state.players.white.resourcesGained = 4;
  await seedGame(page, state);
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  await page.goto('./');
  await chooseAI(page);
  await page.getByRole('radio', { name: 'Black', exact: true }).check();
  await page.screenshot({ path: test.info().outputPath('black-selected-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await expect(page.locator('.turn-strip')).toContainText('You · Turn 4');
  const resources = page.locator('.score-strip > div');
  await expect(resources.first()).toContainText('You ◆ 11');
  await expect(resources.last()).toContainText('AI ◆ 4');

  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Choose game mode', exact: true }).click();
  await chooseAI(page);
  await expect(page.getByRole('radio', { name: 'Black', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await page.getByTestId('cell-8-8').click();
  await page.getByTestId('cell-6-8').click();

  await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);

  await page.reload();
  await chooseAI(page);
  await expect(page.getByRole('radio', { name: 'Black', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /Continue saved game/ }).click();
  await expect(page.locator('.turn-strip')).toContainText('You · Turn 4');
  await expect(page.getByTestId('cell-6-8')).toHaveAttribute('aria-label', /black Sjor/);
  await expect(page.getByRole('button', { name: '↶ Undo', exact: true })).toBeDisabled();
  await expect(resources.first()).toContainText('You ◆ 11');
  expect(workers).toEqual([]);
});

for (const winner of ['black', 'white'] as const) {
  test(`playing Black shows the correct ${winner === 'black' ? 'victory celebration' : 'AI win'} result`, async ({ page }) => {
    const state = createInitialGameState();
    state.phase = 'victory';
    state.winner = winner;
    state.victoryReason = 'elimination';
    state.board.units = state.board.units.filter(unit => unit.owner === winner);
    await seedGame(page, state);
    await page.goto('./');
    await chooseAI(page);
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    await page.getByRole('button', { name: /Continue saved game/ }).click();

    const humanWon = winner === 'black';
    await expect(page.getByRole('heading', { name: humanWon ? 'You Win!' : 'AI Wins!', exact: true })).toBeVisible();
    await expect(page.getByText(humanWon ? '🎉' : '💀', { exact: true })).toBeVisible();
    await expect(page.getByText(humanWon ? '💀' : '🎉', { exact: true })).toHaveCount(0);
  });
}
