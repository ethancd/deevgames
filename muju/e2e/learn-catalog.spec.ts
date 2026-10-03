import { test, expect, type Page } from './fixtures';
import { applyAction } from '../src/ai/simulate';
import type { AIAction } from '../src/ai/types';
import { getUnitById } from '../src/game/board';
import { getUnitDefinition } from '../src/game/units';
import type { GameState } from '../src/game/types';
import { PUZZLES } from '../src/learn/catalog';
import { evaluate, goalText, makeContext } from '../src/learn/goals';
import { playLine } from '../src/learn/notation';
import { PuzzleSearch, compressLine } from '../src/learn/solver';

/**
 * Every puzzle in the catalog, solved by tapping the real board: the author's
 * first turn, then (for two-turn puzzles) a solver line computed from the
 * live position after the enemy's reply. Proves that each puzzle's idea can be
 * played through the actual controls (moves, attack previews, Mine & prepare,
 * the shop, promotion, the keep panel, End turn) and that the screen calls it
 * solved. `?probe=1` exposes the live position.
 *
 *   MUJU_BASE_URL=http://127.0.0.1:3002/muju/ npx playwright test e2e/learn-catalog.spec.ts
 */
test.describe.configure({ mode: 'parallel' });

const cell = (page: Page, x: number, y: number) => page.getByTestId(`cell-${x}-${y}`);
const solved = (page: Page) => page.getByTestId('puzzle-success');
type Probe = { id: string; phase: string; state: GameState };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __mujuLearn?: Probe }).__mujuLearn ?? null);

async function pick(page: Page, x: number, y: number) {
  const square = cell(page, x, y);
  if (await square.getAttribute('aria-pressed') !== 'true') await square.click();
}

/** Tap one action the way a player does. */
async function tap(page: Page, state: GameState, action: AIAction) {
  switch (action.type) {
    case 'MOVE': {
      const unit = getUnitById(state.board, action.unitId)!;
      await pick(page, unit.position.x, unit.position.y);
      await cell(page, action.to.x, action.to.y).click();
      return;
    }
    case 'ATTACK': {
      const unit = getUnitById(state.board, action.unitId)!;
      await pick(page, unit.position.x, unit.position.y);
      await cell(page, action.targetPosition.x, action.targetPosition.y).click();
      await page.getByRole('button', { name: 'Confirm attack' }).click();
      return;
    }
    case 'END_ACTION_PHASE': await page.getByRole('button', { name: /Mine & prepare/ }).click(); return;
    case 'END_PLACE_PHASE': await page.getByRole('button', { name: /End turn/ }).click(); return;
    case 'BUY_UNIT': {
      const def = getUnitDefinition(action.definitionId);
      await page.getByRole('button', { name: `Summon ${def.name} · ${def.cost} crystals`, exact: true }).click();
      await cell(page, action.position.x, action.position.y).click();
      return;
    }
    case 'PROMOTE_UNIT': {
      const unit = getUnitById(state.board, action.unitId)!;
      await cell(page, unit.position.x, unit.position.y).click();
      await page.getByRole('button', { name: /^Promote/ }).click();
      return;
    }
    case 'PAY_UPKEEP': {
      const dialog = page.getByRole('dialog', { name: 'Choose upkeep' });
      for (const box of await dialog.getByRole('checkbox').all()) {
        const label = await box.evaluate(e => e.closest('label')!.textContent ?? '');
        const kept = action.keepUnitIds.some(id => { const u = getUnitById(state.board, id)!; return label.includes(`${String.fromCharCode(65 + u.position.x)}${u.position.y + 1}`); });
        if (await box.isEnabled() && (await box.isChecked()) !== kept) await box.click();
      }
      await dialog.getByRole('button', { name: /Pay upkeep/ }).click();
      return;
    }
    default: throw new Error(`cannot tap ${action.type}`);
  }
}

/** Tap a line until the puzzle is solved (judged on the live position); returns true once solved. */
async function play(page: Page, ctx: ReturnType<typeof makeContext>, from: GameState, actions: readonly AIAction[]): Promise<boolean> {
  const isSolved = async () => { const p = await probe(page); return !!p && evaluate(ctx, p.state) === 'solved'; };
  let state = from;
  for (const action of actions) {
    if (await isSolved()) return true;
    await tap(page, state, action);
    state = applyAction(state, action);
  }
  return isSolved();
}

for (const { puzzle: spec, arc } of PUZZLES) {
  test(`${arc.id} · ${spec.id}: ${goalText(spec)}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`./?learn=${spec.id}&probe=1`);
    await expect(page.getByTestId('puzzle-goal')).toContainText(goalText(spec));
    const ctx = makeContext(spec);
    let done = await play(page, ctx, ctx.start, playLine(ctx.start, spec.solution).actions);
    // Later turns: wait for the enemy's reply to hand back, then solve from the live position.
    for (let turn = 1; !done && turn < (spec.turns ?? 1) + 1; turn++) {
      let status = 'waiting';
      await expect.poll(async () => {
        const p = await probe(page);
        if (!p) return status = 'waiting';
        if (evaluate(ctx, p.state) === 'solved') return status = 'solved';
        const ready = p.phase === 'playing' && p.state.phase === 'playing' && p.state.turn.currentPlayer === ctx.hero;
        return status = ready ? 'ready' : 'waiting';
      }, { timeout: 30_000 }).not.toBe('waiting');
      if (status === 'solved') break;
      const live = (await probe(page))!.state;
      const line = new PuzzleSearch(ctx).line(live);
      expect(line, 'the solver finds a winning line from the live position').not.toBeNull();
      done = await play(page, ctx, live, compressLine(live, line!));
    }
    await expect(solved(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('puzzle-failure')).toHaveCount(0);
  });
}
