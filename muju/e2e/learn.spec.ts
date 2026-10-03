import { test as plain } from '@playwright/test';
import { test, expect, seedLearn, type Page } from './fixtures';
import { applyAction } from '../src/ai/simulate';
import { getUnitById } from '../src/game/board';
import { getUnitDefinition } from '../src/game/units';
import { buildPuzzleState } from '../src/learn/build';
import { ARCS, PUZZLES, PUZZLE_COUNT } from '../src/learn/catalog';
import { fixtureById } from '../src/learn/fixtures';
import { goalText } from '../src/learn/goals';
import { parseMove } from '../src/learn/notation';
import type { PuzzleSpec } from '../src/learn/types';

/**
 * Learn to Play, end to end: the home screen's count, the course map, solving
 * by tapping the real board, the persisted check mark, Next, failure with Undo
 * and Retry, hints, the enemy's reply, browser Back, and phone / landscape fit.
 * The catalog's first puzzle is played from its own `solution`, so the spec
 * follows whatever the authors ship; fixed-shape cases use the test fixtures
 * behind `?fixture=1`.
 */
const SHOTS = '/tmp/muju-puzzles/shots';
const KEY = 'muju:learn:v1';
const first = PUZZLES[0];
const cell = (page: Page, x: number, y: number) => page.getByTestId(`cell-${x}-${y}`);
const progress = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

/** Select a piece unless it already is. */
async function pick(page: Page, x: number, y: number) {
  const square = cell(page, x, y);
  if (await square.getAttribute('aria-pressed') !== 'true') await square.click();
}

/** Play a notation line the way a player does: tap, tap, confirm, buttons. */
async function playByTapping(page: Page, spec: PuzzleSpec, line: readonly string[]) {
  let state = buildPuzzleState(spec);
  for (const move of line) {
    for (const action of parseMove(state, move)) {
      switch (action.type) {
        case 'MOVE': {
          const unit = getUnitById(state.board, action.unitId)!;
          await pick(page, unit.position.x, unit.position.y);
          await cell(page, action.to.x, action.to.y).click();
          break;
        }
        case 'ATTACK': {
          const unit = getUnitById(state.board, action.unitId)!;
          await pick(page, unit.position.x, unit.position.y);
          await cell(page, action.targetPosition.x, action.targetPosition.y).click();
          await page.getByRole('button', { name: 'Confirm attack' }).click();
          break;
        }
        case 'END_ACTION_PHASE': await page.getByRole('button', { name: /Mine & prepare/ }).click(); break;
        case 'END_PLACE_PHASE': await page.getByRole('button', { name: /End turn/ }).click(); break;
        case 'BUY_UNIT': {
          const def = getUnitDefinition(action.definitionId);
          await page.getByRole('button', { name: `Summon ${def.name} · ${def.cost} crystals`, exact: true }).click();
          await cell(page, action.position.x, action.position.y).click();
          break;
        }
        case 'PROMOTE_UNIT': {
          const unit = getUnitById(state.board, action.unitId)!;
          await cell(page, unit.position.x, unit.position.y).click();
          await page.getByRole('button', { name: /^Promote/ }).click();
          break;
        }
        case 'PAY_UPKEEP': {
          const dialog = page.getByRole('dialog', { name: 'Choose upkeep' });
          for (const box of await dialog.getByRole('checkbox').all()) {
            const label = await box.evaluate(e => e.closest('label')!.textContent ?? '');
            const kept = action.keepUnitIds.some(id => { const u = getUnitById(state.board, id)!; return label.includes(`${String.fromCharCode(65 + u.position.x)}${u.position.y + 1}`); });
            if (await box.isEnabled() && (await box.isChecked()) !== kept) await box.click();
          }
          await dialog.getByRole('button', { name: /Pay upkeep/ }).click();
          break;
        }
      }
      state = applyAction(state, action);
    }
  }
}

async function fits(page: Page) {
  const d = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
  expect(d.sw).toBeLessThanOrEqual(d.w);
  expect(d.sh).toBeLessThanOrEqual(d.h);
  for (const selector of ['.battle-board', '.learn-goal', '.decision-panel', '.learn-controls', '.action-bar']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box, selector).not.toBeNull();
    expect(box.y, selector).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(d.h + 1);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(d.w + 1);
  }
  // Thumb targets.
  for (const name of ['Retry', 'Hint']) {
    const box = (await page.locator('.learn-controls').getByRole('button', { name }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(40);
  }
  // Every square of the sub-board is on screen and square.
  const board = (await page.locator('.battle-grid').boundingBox())!;
  expect(board.y + board.height).toBeLessThanOrEqual(d.h + 1);
  expect(Math.abs(board.width - board.height)).toBeLessThanOrEqual(2);
}

test('the home screen offers Learn to Play with the puzzle count, and opens the map', async ({ page }) => {
  await page.goto('./');
  const learn = page.getByRole('button', { name: /^Learn to Play/ });
  await expect(learn).toBeVisible();
  await expect(learn).toContainText(`${PUZZLE_COUNT} puzzles`);
  // First, before Play vs AI and Play online; the old Puzzles entry is gone.
  const primaries = await page.locator('.mode-primary button').allTextContents();
  expect(primaries[0]).toMatch(/^Learn to Play/);
  expect(primaries[1]).toMatch(/^Play vs AI/);
  expect(primaries[2]).toMatch(/^Play online/);
  await expect(page.getByRole('button', { name: /^Puzzles/ })).toHaveCount(0);
  await learn.click();
  await expect(page).toHaveURL(/\?learn=1/);
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
  await expect(page.getByTestId('learn-total')).toHaveText(`0 / ${PUZZLE_COUNT}`);
  await expect(page.getByTestId('learn-continue')).toContainText('Start');
  // Every arc is listed with its count and one tile per puzzle; nothing is locked.
  for (const arc of ARCS) {
    const row = page.getByTestId(`learn-arc-${arc.id}`);
    await expect(row).toContainText(arc.title);
    await expect(row).toContainText(`0 / ${arc.puzzles.length}`);
    await expect(row.locator('.learn-tile')).toHaveCount(arc.puzzles.length);
    await expect(row.locator('.learn-tile[disabled]')).toHaveCount(0);
  }
  await expect(page.locator('.learn-tile.is-next')).toHaveCount(1);
  await expect(page.locator('.learn-tile.is-next')).toHaveText('1');
  await page.getByRole('button', { name: '← Modes' }).click();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page).not.toHaveURL(/learn=/);
});

test('the first puzzle is solved by tapping, the check persists on the map, and Next moves on', async ({ page }) => {
  await page.goto(`./?learn=${first.puzzle.id}`);
  await expect(page.locator('.game-shell-puzzle')).toBeVisible();
  await expect(page.getByTestId('puzzle-goal')).toContainText(goalText(first.puzzle));
  await expect(page.getByRole('heading', { name: new RegExp(first.arc.title) })).toContainText(`1 / ${first.arc.puzzles.length}`);
  // Match furniture that is not a puzzle's business is gone; the real action bar is there.
  await expect(page.locator('.progress-clock')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'How to play' })).toHaveCount(0);
  await expect(page.locator('.score-strip')).toContainText('Opponent');
  await expect(page.getByRole('button', { name: /Mine & prepare/ })).toBeVisible();
  await expect(page.getByTestId('puzzle-narration')).toContainText(goalText(first.puzzle));
  // The player's saved match is never touched.
  expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBeNull();

  await playByTapping(page, first.puzzle, first.puzzle.solution);
  const success = page.getByTestId('puzzle-success');
  await expect(success).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('puzzle-narration')).toContainText('Solved');
  expect(await progress(page)).toMatchObject({ version: 1, solved: { [first.puzzle.id]: { clean: true } }, last: first.puzzle.id });
  expect(await page.evaluate(() => localStorage.getItem('elemental-tactics-save'))).toBeNull();
  await page.screenshot({ path: `${SHOTS}/e2e-solved.png` });

  const second = PUZZLES[1];
  await success.getByRole('button', { name: second ? 'Next →' : 'All puzzles →' }).click();
  if (second) {
    await expect(page).toHaveURL(new RegExp(`learn=${second.puzzle.id}`));
    await expect(page.getByTestId('puzzle-goal')).toContainText(goalText(second.puzzle));
    await page.getByRole('button', { name: '← Learn' }).click();
  }
  await expect(page).toHaveURL(/learn=1/);
  await expect(page.getByTestId(`learn-tile-${first.puzzle.id}`)).toHaveClass(/is-solved/);
  await expect(page.getByTestId(`learn-tile-${first.puzzle.id}`)).toHaveText('✓');
  await expect(page.getByTestId('learn-total')).toHaveText(`1 / ${PUZZLE_COUNT}`);
  await expect(page.getByTestId('learn-continue')).toContainText('Continue');
  // Reload: still there; the home screen counts it too.
  await page.goto('./');
  await expect(page.getByRole('button', { name: /^Learn to Play/ })).toContainText(`1 / ${PUZZLE_COUNT} puzzles`);
});

test('a line that can no longer win fails at once; Undo takes it back and Retry restarts', async ({ page }) => {
  const spec = fixtureById('fx-capture')!;
  await page.goto('./?learn=fx-capture&fixture=1');
  await expect(page.getByTestId('puzzle-goal')).toContainText('Capture the Radi this turn');
  // The target wears a ring.
  await expect(page.locator('.board-square.learn-target')).toHaveCount(1);
  // Two actions to c2 and the Poṉ kill leave one action with the Radi out of reach.
  await playByTapping(page, spec, ['a1-c2', 'c2xc3']);
  const failure = page.getByTestId('puzzle-failure');
  await expect(failure).toBeVisible({ timeout: 6000 });
  await expect(failure).toHaveAttribute('data-failure', 'stuck');
  await expect(page.getByTestId('puzzle-narration')).toContainText('Not solved');
  await page.screenshot({ path: `${SHOTS}/e2e-failed.png` });
  // The board is locked under the card.
  await expect(page.getByRole('button', { name: /Mine & prepare/ })).toBeDisabled();
  await failure.getByRole('button', { name: 'Undo' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.locator('.action-budget strong')).toHaveText('2 actions');
  await expect(cell(page, 2, 2)).toHaveAttribute('aria-label', /black Poṉ/);
  await page.locator('.learn-controls').getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', /white Hi/);
  expect(await progress(page)).toBeNull();
  // Now solve it from the fresh start.
  await playByTapping(page, spec, spec.solution);
  await expect(page.getByTestId('puzzle-success')).toBeVisible({ timeout: 6000 });
});

test('a hint lights the piece, Show me plays the line, and the solve is marked as helped', async ({ page }) => {
  const spec = fixtureById('fx-mine')!;
  await page.goto('./?learn=fx-mine&fixture=1');
  await expect(page.getByTestId('puzzle-progress')).toHaveText('0 / 3');
  const hint = page.locator('.learn-controls').getByRole('button', { name: 'Hint' });
  await hint.click();
  await expect(page.locator('.unit-wrap.learn-hint-piece')).toHaveCount(1);
  await expect(cell(page, 0, 0).locator('..').locator('.learn-hint-piece')).toHaveCount(1);
  const show = page.locator('.learn-controls').getByRole('button', { name: 'Show me' });
  await expect(show).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/e2e-hint.png` });
  await show.click();
  // The line plays itself, then the puzzle restarts for the player.
  await expect(cell(page, 1, 1)).toHaveAttribute('aria-label', /white Muju/, { timeout: 6000 });
  await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', /white Muju/, { timeout: 8000 });
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  // Live progress: standing on the 8-crystal square projects 3.
  await playByTapping(page, spec, ['a1-a2', 'a2-b2']);
  await expect(page.getByTestId('puzzle-progress')).toHaveText('3 / 3');
  await playByTapping(page, spec, ['mine']);
  await expect(page.getByTestId('puzzle-success')).toBeVisible({ timeout: 6000 });
  await expect(page.getByTestId('puzzle-success').locator('.learn-card-hinted')).toBeVisible();
  expect(await progress(page)).toMatchObject({ solved: { 'fx-mine': { clean: false } } });
});

test('the enemy replies through the real game: a survive goal is judged after its turn', async ({ page }) => {
  const spec = fixtureById('fx-survive')!;
  await page.goto('./?learn=fx-survive&fixture=1');
  await expect(page.getByTestId('puzzle-goal')).toContainText('Keep all your pieces safe');
  // Standing still is already lost at Prepare: the Sjór can walk over and strike. Flagged before the turn can end.
  await playByTapping(page, spec, ['mine']);
  const failure = page.getByTestId('puzzle-failure');
  await expect(failure).toBeVisible({ timeout: 6000 });
  await expect(failure).toHaveAttribute('data-failure', 'stuck');
  await expect(page.getByRole('button', { name: /End turn/ })).toBeDisabled();
  await failure.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.action-budget strong')).toHaveText('4 actions');
  // Step out of reach, end the turn, and watch the opponent's turn play out at the AI's cadence.
  await playByTapping(page, spec, spec.solution);
  await expect(page.locator('.turn-strip')).toContainText('Opponent');
  await expect(page.getByRole('button', { name: /Mine & prepare|End turn/ })).toBeDisabled();
  await expect(page.getByTestId('puzzle-success')).toBeVisible({ timeout: 12000 });
  await expect(cell(page, 0, 0)).toHaveAttribute('aria-label', /white Hi/);
  // The opponent's turn was recorded, so Instant replay has something to show.
  await expect(page.locator('.turn-strip')).toContainText('Turn 2');
});

test('browser Back walks puzzle → map → modes; a deep link skips the tutorial gate', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Learn to Play/ }).click();
  await page.getByTestId(`learn-tile-${first.puzzle.id}`).click();
  await expect(page.locator('.game-shell-puzzle')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`learn=${first.puzzle.id}`));
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
  await expect(page).toHaveURL(/learn=1/);
  await page.goBack();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page).not.toHaveURL(/learn=/);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
});

test('← Learn and ← Modes step back through history, so browser Back never repeats a page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Learn to Play/ }).click();
  await page.getByTestId(`learn-tile-${first.puzzle.id}`).click();
  await expect(page.locator('.game-shell-puzzle')).toBeVisible();
  await page.getByRole('button', { name: '← Learn' }).click();
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
  await expect(page).toHaveURL(/learn=1/);
  await page.goBack();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await expect(page).not.toHaveURL(/learn=/);
  await page.goForward();
  await page.getByRole('button', { name: '← Modes' }).click();
  await expect(page.getByRole('button', { name: /^Play vs AI/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
});

plain('a first visitor who follows a Learn link sees the puzzle, not the tutorial', async ({ page }) => {
  await page.goto(`./?learn=${first.puzzle.id}`);
  await expect(page.locator('main.onboarding')).toHaveCount(0);
  await expect(page.locator('.game-shell-puzzle')).toBeVisible();
  await page.goto('./?learn=1');
  await expect(page.locator('main.onboarding')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
  // An unknown id lands on the map.
  await page.goto('./?learn=no-such-puzzle');
  await expect(page.getByRole('heading', { name: 'Learn to Play' })).toBeVisible();
});

test('Reset progress asks first, then clears every check', async ({ page, context }) => {
  await seedLearn(context, { version: 1, solved: { [first.puzzle.id]: { at: '2026-10-02T00:00:00Z', clean: true } }, last: first.puzzle.id });
  await page.goto('./?learn=1');
  await expect(page.getByTestId('learn-total')).toHaveText(`1 / ${PUZZLE_COUNT}`);
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('learn-total')).toHaveText(`1 / ${PUZZLE_COUNT}`);
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('learn-total')).toHaveText(`0 / ${PUZZLE_COUNT}`);
  await expect(page.locator('.learn-tile.is-solved')).toHaveCount(0);
  expect(await progress(page)).toBeNull();
});

for (const [width, height] of [[390, 664], [375, 667], [320, 568], [844, 390], [1280, 800]] as const) {
  test(`a puzzle and the map fit ${width}×${height} without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // The largest board the course uses, and a small one.
    const big = PUZZLES.reduce((a, b) => b.puzzle.board.length > a.puzzle.board.length ? b : a, PUZZLES[0]);
    for (const entry of [first, big]) {
      await page.goto(`./?learn=${entry.puzzle.id}`);
      await expect(page.locator('.game-shell-puzzle')).toBeVisible();
      await fits(page);
      // Pieces are never tiny in huge squares: a piece fills most of its square.
      const square = (await page.locator('.board-square').first().boundingBox())!;
      const piece = (await page.locator('.unit-token').first().boundingBox())!;
      expect(piece.width / square.width).toBeGreaterThan(0.55);
    }
    await page.screenshot({ path: `${SHOTS}/e2e-puzzle-${width}x${height}.png` });
    await page.goto('./?learn=1');
    await expect(page.getByTestId('learn-continue')).toBeVisible();
    const d = await page.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth }));
    expect(d.sw).toBeLessThanOrEqual(d.w);
    const tile = (await page.locator('.learn-tile').first().boundingBox())!;
    expect(tile.width).toBeGreaterThanOrEqual(40);
    expect(tile.height).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: `${SHOTS}/e2e-map-${width}x${height}.png` });
  });
}

test('reduced motion still solves and celebrates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const spec = fixtureById('fx-reach')!;
  await page.goto('./?learn=fx-reach&fixture=1');
  await expect(page.locator('.board-square.learn-flag')).toHaveCount(1);
  await playByTapping(page, spec, spec.solution);
  await expect(page.getByTestId('puzzle-success')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.board-square.learn-flag.is-reached')).toHaveCount(1);
});
