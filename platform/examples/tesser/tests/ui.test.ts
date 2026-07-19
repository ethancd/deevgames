// @vitest-environment jsdom
//
// Stage D web UI tests (jsdom). Type-checked by web/tsconfig.json (DOM lib),
// excluded from the package's base tsconfig — see tsconfig.json.
//
// Layout-invariance note: per @deev/ui's README, test/layout.ts assertions
// are guarded against jsdom false-passes — jsdom has no layout engine, so
// the helpers' documented jsdom behavior is to throw NO_LAYOUT_ENGINE_MESSAGE
// instead of rubber-stamping 0x0 rect comparisons. We assert exactly that;
// browser-mode validation of the success path stays deferred (platform README).

import { afterEach, describe, expect, it } from 'vitest';
import { engineHash } from '@deev/core';
import {
  NO_LAYOUT_ENGINE_MESSAGE,
  expectExplicitSize,
  expectStableRect,
  isLayoutCapable,
  type StorageLike,
} from '@deev/ui';
import { persistence, tesser } from '../src/index.ts';
import type { TesserState } from '../src/index.ts';
import { SAVE_KEY, createApp, type AppHandle } from '../web/app.ts';

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function seedSave(storage: StorageLike, state: TesserState): void {
  storage.setItem(
    SAVE_KEY,
    JSON.stringify(persistence.save(state, { engineHash: engineHash(tesser) })),
  );
}

let cleanups: Array<() => void> = [];

function mount(storage: StorageLike): { app: AppHandle; root: HTMLElement } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(root, { storage, autoAi: false, toastTickMs: 0 });
  cleanups.push(() => {
    app.destroy();
    root.remove();
  });
  return { app, root };
}

afterEach(() => {
  for (const fn of cleanups.reverse()) fn();
  cleanups = [];
  document.body.innerHTML = '';
});

function pieceEl(root: HTMLElement, id: string): HTMLElement {
  const elm = root.querySelector<HTMLElement>(`[data-piece-id="${id}"]`);
  if (!elm) throw new Error(`piece element '${id}' not rendered`);
  return elm;
}

function cellEl(root: HTMLElement, x: number, y: number): HTMLElement {
  const elm = root.querySelector<HTMLElement>(`[data-cell="${x},${y}"]`);
  if (!elm) throw new Error(`cell (${x},${y}) not rendered`);
  return elm;
}

function dockButton(root: HTMLElement, label: string): HTMLButtonElement {
  const dock = root.querySelector('.ts-dock');
  if (!dock) throw new Error('dock not rendered');
  const btn = [...dock.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').trim().startsWith(label),
  );
  if (!btn) throw new Error(`no dock button starting with "${label}"`);
  return btn;
}

describe('tesser web ui', () => {
  it('mounts and renders the 6 initial pieces at their grid positions', () => {
    const { root } = mount(fakeStorage());

    expect(root.querySelectorAll('[data-cell]')).toHaveLength(48);
    const pieces = root.querySelectorAll('[data-piece-id]');
    expect(pieces).toHaveLength(6);

    // §2.3 anchors, y=0 rendered at top (north's back rank), south near player.
    const expected: Record<string, { x: number; y: number; w: number; d: number }> = {
      'S-shield': { x: 0, y: 5, w: 3, d: 2 },
      'S-keep': { x: 3, y: 5, w: 2, d: 2 },
      'S-lance': { x: 1, y: 7, w: 4, d: 1 },
      'N-shield': { x: 3, y: 1, w: 3, d: 2 },
      'N-keep': { x: 1, y: 1, w: 2, d: 2 },
      'N-lance': { x: 1, y: 0, w: 4, d: 1 },
    };
    for (const [id, pos] of Object.entries(expected)) {
      const elm = pieceEl(root, id);
      expect(elm.dataset.x, id).toBe(String(pos.x));
      expect(elm.dataset.y, id).toBe(String(pos.y));
      expect(parseFloat(elm.style.left), id).toBeCloseTo((pos.x / 6) * 100, 5);
      expect(parseFloat(elm.style.top), id).toBeCloseTo((pos.y / 8) * 100, 5);
      expect(parseFloat(elm.style.width), id).toBeCloseTo((pos.w / 6) * 100, 5);
      expect(parseFloat(elm.style.height), id).toBeCloseTo((pos.d / 8) * 100, 5);
    }

    // Height numeral + measure rendered; seats visually distinct via classes.
    const keep = pieceEl(root, 'S-keep');
    expect(keep.textContent).toContain('h2');
    expect(keep.textContent).toContain('8');
    expect(keep.classList.contains('ts-south')).toBe(true);
    expect(pieceEl(root, 'N-keep').classList.contains('ts-north')).toBe(true);
  });

  it('tap-selecting an own piece shows the grouped action dock', () => {
    const { root } = mount(fakeStorage());

    pieceEl(root, 'S-lance').click();

    const dock = root.querySelector('.ts-dock')!;
    expect(dock.textContent).toContain('Lance');
    for (const label of ['Move', 'Attack', 'Fold', 'Pass']) {
      expect(() => dockButton(root, label)).not.toThrow();
    }

    // Tapping elsewhere (a non-candidate cell) cancels the selection.
    cellEl(root, 0, 0).click();
    expect(root.querySelector('.ts-dock')!.textContent).toContain('Tap one of your pieces');
  });

  it('runs a scripted move + attack through the confirm machine and updates state + DOM', () => {
    const storage = fakeStorage();
    seedSave(storage, {
      pieces: [
        { id: 'S-lance', seat: 'south', x: 1, y: 7, w: 4, d: 1, h: 1, measure: 4 },
        { id: 'N-shield', seat: 'north', x: 1, y: 4, w: 3, d: 2, h: 1, measure: 6 },
        { id: 'N-keep', seat: 'north', x: 4, y: 0, w: 2, d: 2, h: 2, measure: 8 },
      ],
      current: 'south',
      ply: 0,
      plyCap: 100,
    });
    const { app, root } = mount(storage);
    expect(app.state().pieces).toHaveLength(3); // resumed the seeded state

    // --- Move: select lance -> Move group -> destination cell -> Confirm.
    pieceEl(root, 'S-lance').click();
    dockButton(root, 'Move').click();
    const dest = cellEl(root, 1, 6);
    expect(dest.classList.contains('ts-cand')).toBe(true);
    dest.click();
    expect(root.querySelector('.ts-dock')!.textContent).toContain('Move 1 north');
    dockButton(root, 'Confirm').click();

    expect(app.state().ply).toBe(1);
    expect(app.state().current).toBe('north');
    const lance = app.state().pieces.find((p) => p.id === 'S-lance')!;
    expect(lance.y).toBe(6);
    expect(parseFloat(pieceEl(root, 'S-lance').style.top)).toBeCloseTo(75, 5);

    // North replies (scripted directly; AI is disabled in tests).
    expect(app.dispatch({ type: 'pass' })).toBe(true);

    // --- Attack: select lance -> Attack group -> target cell -> Confirm.
    pieceEl(root, 'S-lance').click();
    dockButton(root, 'Attack').click();
    const target = cellEl(root, 2, 5);
    expect(target.classList.contains('ts-cand')).toBe(true);
    target.click();
    dockButton(root, 'Confirm').click();

    // Lance strike footprint x1-4,y5 overlaps shield (x1-3, y4-5) on 3 cells:
    // damage = 3 × min(1,1) = 3; wounded piece renders measure/volume.
    expect(app.state().ply).toBe(3);
    const shield = app.state().pieces.find((p) => p.id === 'N-shield')!;
    expect(shield.measure).toBe(3);
    expect(pieceEl(root, 'N-shield').textContent).toContain('3/6');
    expect(pieceEl(root, 'N-shield').classList.contains('ts-wounded')).toBe(true);
    // Attacker never enters the enemy cells.
    expect(app.state().pieces.find((p) => p.id === 'S-lance')!.y).toBe(6);
    // Last-action highlight covers the strike cells.
    expect(cellEl(root, 2, 5).classList.contains('ts-last')).toBe(true);
    // Attack is a commit point: no undo across it.
    expect(app.canUndoTurn()).toBe(false);
  });

  it('saves after every action and resumes from an injected StorageLike', () => {
    const storage = fakeStorage();
    const first = mount(storage);
    expect(first.app.dispatch({ type: 'move', piece: 'S-lance', dir: 'E', steps: 1 })).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    first.app.destroy();

    const second = mount(storage);
    expect(second.app.state().ply).toBe(1);
    const lance = second.app.state().pieces.find((p) => p.id === 'S-lance')!;
    expect(lance.x).toBe(2);
    expect(parseFloat(pieceEl(second.root, 'S-lance').style.left)).toBeCloseTo((2 / 6) * 100, 5);

    // Restart (New Game) clears the save down to a fresh initial position.
    second.app.restart();
    expect(second.app.state().ply).toBe(0);
    expect(second.app.state().pieces.find((p) => p.id === 'S-lance')!.x).toBe(1);
  });

  it('undo reverts a full player turn but refuses to cross commit points', () => {
    const storage = fakeStorage();
    const { app } = mount(storage);

    // move (non-commit) + AI-side pass (non-commit) -> undo both.
    app.dispatch({ type: 'move', piece: 'S-lance', dir: 'E', steps: 1 });
    app.dispatch({ type: 'pass' });
    expect(app.state().ply).toBe(2);
    expect(app.canUndoTurn()).toBe(true);
    expect(app.undoTurn()).toBe(true);
    expect(app.state().ply).toBe(0);
    expect(app.state().current).toBe('south');
    expect(app.state().pieces.find((p) => p.id === 'S-lance')!.x).toBe(1);

    // fold is a commit point -> undo refused.
    app.dispatch({ type: 'fold', piece: 'S-lance', w: 1, d: 1, h: 4, x: 1, y: 7 });
    expect(app.state().ply).toBe(1);
    expect(app.canUndoTurn()).toBe(false);
    expect(app.undoTurn()).toBe(false);
    expect(app.state().ply).toBe(1);
  });

  it('the Opponent seam plays a legal north reply via aiStep()', async () => {
    // Works whichever way the seam resolves: tesserMinimaxBot when
    // src/bots.ts exists (guarded dynamic import), greedy fallback otherwise.
    const { app } = mount(fakeStorage());
    app.dispatch({ type: 'move', piece: 'S-lance', dir: 'E', steps: 1 });
    expect(app.state().current).toBe('north');
    await app.aiStep();
    expect(app.state().ply).toBe(2);
    expect(app.state().current).toBe('south');
  });

  it('layout-invariance helpers exhibit their documented jsdom guard behavior', () => {
    const { root } = mount(fakeStorage());
    const board = root.querySelector<HTMLElement>('.ts-board')!;

    // jsdom has no layout engine; the @deev/ui helpers must refuse to
    // false-pass and instead throw the pointed error (see @deev/ui README).
    expect(isLayoutCapable()).toBe(false);
    expect(() => expectExplicitSize(board)).toThrowError(NO_LAYOUT_ENGINE_MESSAGE);
    expect(() =>
      expectStableRect(() => board, ['measure 8', 'measure 5/8']),
    ).toThrowError(NO_LAYOUT_ENGINE_MESSAGE);
  });
});
