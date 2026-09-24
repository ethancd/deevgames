import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionBar, actionCount } from '../src/components/ActionBar';
import { Cell } from '../src/components/Cell';
import type { Cell as BoardCell } from '../src/game/types';

afterEach(cleanup);

const budget = (actionsRemaining: number, phase: 'place' | 'action' = 'action') => render(
  <ActionBar actionsRemaining={actionsRemaining} phase={phase} phasing isPlayerTurn onEndPlacePhase={() => {}} onEndActionPhase={() => {}} />,
).container.querySelector('.action-budget')!;

describe('action count copy', () => {
  it('uses the singular only for exactly one action', () => {
    expect([0, 1, 2, 4].map(actionCount)).toEqual(['0 actions', '1 action', '2 actions', '4 actions']);
  });

  it.each([
    [0, '0 actions', '0 actions remaining'],
    [1, '1 action', '1 action remaining'],
    [2, '2 actions', '2 actions remaining'],
  ])('ActionBar with %i left shows "%s"', (n, text, label) => {
    const el = budget(n);
    expect(el.querySelector('strong')!.textContent).toBe(text);
    expect(el.getAttribute('aria-label')).toBe(label);
  });

  it('keeps the Prepare label outside the action phase', () => {
    expect(budget(1, 'place').querySelector('strong')!.textContent).toBe('Summon & promote');
  });

  it.each([[1, 'move costs 1 action'], [2, 'move costs 2 actions']])('board reach label for cost %i', (moveCost, fragment) => {
    const cell: BoardCell = { position: { x: 3, y: 3 }, resourceLayers: 0 };
    const { container } = render(<Cell cell={cell} isValidMove={false} isValidAttack={false} isValidSpawn={false} isSelected={false}
      movementRangeActions={4 - moveCost} moveCost={moveCost} onClick={() => {}} />);
    const label = container.querySelector('[aria-label]')!.getAttribute('aria-label')!;
    expect(label).toContain(fragment);
    expect(label).not.toMatch(/move costs 1 actions/);
  });
});
