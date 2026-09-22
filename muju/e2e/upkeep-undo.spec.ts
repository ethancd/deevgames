import { test, expect } from '@playwright/test';
import { createInitialGameState } from '../src/game/board';
import { SCHEMA_VERSION } from '../src/utils/persistence';

test('Phasing upkeep choice stays open, can be undone past, and the keyboard drives the turn', async ({ page }) => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  // No income, so the higher tiers cannot all be paid for after mining.
  for (const row of state.board.cells) for (const cell of row) cell.resourceLayers = 0;
  state.board.units[0].definitionId = 'fire_2'; state.board.units[1].definitionId = 'water_3'; state.board.units[2].definitionId = 'plant_3';
  state.players.white.resources = 4;
  const cellOf = (u: { position: { x: number; y: number } }) => page.getByTestId(`cell-${u.position.x}-${u.position.y}`);
  const byCoordinate = (a: typeof state.board.units[number], b: typeof a) => a.position.x - b.position.x || a.position.y - b.position.y;
  const mine = state.board.units.filter(u => u.owner === 'white').sort(byCoordinate);
  const theirs = state.board.units.filter(u => u.owner === 'black').sort(byCoordinate);

  await page.addInitScript(({ state, schemaVersion }) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion, timestamp: Date.now(), state }));
    sessionStorage.setItem('seeded', '1');
  }, { state, schemaVersion: SCHEMA_VERSION });
  await page.goto('./');
  await page.getByRole('button', { name: 'Pass & Play' }).click();
  await page.getByRole('button', { name: /Continue saved game/ }).click();

  // Tab visits own pieces, then the opponent's, in A–J then 1–10 order; Escape clears.
  for (const unit of [...mine, ...theirs]) { await page.keyboard.press('Tab'); await expect(cellOf(unit)).toBeFocused(); await expect(page.locator('.unit-detail')).toBeVisible(); }
  await page.keyboard.press('Tab'); await expect(cellOf(mine[0])).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(cellOf(theirs.at(-1)!)).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('.unit-detail')).toHaveCount(0);

  // U opens the unit guide; 1–3 pick the tier, A S D F G H the element, Tab walks the catalogue.
  await page.keyboard.press('u');
  const guide = page.getByRole('dialog', { name: 'Unit guide' }), detail = guide.locator('.shop-piece-name');
  const tier = guide.getByRole('group', { name: 'Unit tier' }).getByRole('button', { pressed: true });
  await expect(detail).toHaveText('Hi');
  await page.keyboard.press('2'); await expect(detail).toHaveText('Hono');
  await page.keyboard.press('d'); await expect(detail).toHaveText('Straumr');
  await page.keyboard.press('3'); await expect(detail).toHaveText('Aegirinn');
  await page.keyboard.press('a'); await page.keyboard.press('1'); await expect(detail).toHaveText('Hi');
  await page.keyboard.press('Tab'); await expect(detail).toHaveText('Radi'); await expect(tier).toHaveText('Tier 1');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(detail).toHaveText('Hono');
  await page.keyboard.press('Shift+Tab'); await expect(tier).toHaveText('Tier 1'); await expect(detail).not.toHaveText('Hono');
  await page.keyboard.press('u'); await expect(guide).toHaveCount(0);

  // Enter completes the phase even with focus left on a clicked button or square.
  await cellOf(mine[0]).click();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Choose upkeep' });
  await expect(dialog).toContainText('Upkeep 5 / 4');

  // Chromium lets a second Escape past onCancel; the mandatory choice must survive it.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pay upkeep & continue' })).toBeDisabled();

  // Back to the action phase from inside the modal, by button and by shortcut.
  await dialog.getByRole('button', { name: 'Undo last step' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();

  // Release a piece, change your mind, and undo past the release to the action phase.
  await page.getByRole('button', { name: 'Mine & prepare' }).click();
  await dialog.getByRole('checkbox', { name: /Aegirinn/ }).uncheck();
  await dialog.getByRole('checkbox', { name: /Sachakuna/ }).uncheck();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
  await expect(page.locator('.progress-clock')).toContainText('released 2');
  // A S D F G H choose the purchase by element, as they do in the unit guide.
  await page.keyboard.press('s'); await expect(page.getByRole('button', { name: /Summon Radi/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: /Summon Radi/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Aegirinn/ })).toBeChecked();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mine & prepare' })).toBeEnabled();
  await expect(cellOf(state.board.units[1])).toHaveAttribute('aria-label', /Aegirinn/);
});
