import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { balancedColumns, LearnScreen } from '../../src/learn/LearnScreen';
import { ARCS } from '../../src/learn/catalog';
import { emptyProgress } from '../../src/learn/progress';

afterEach(cleanup);

describe('map tiles', () => {
  it('wrap into balanced rows of at most seven: no orphan tile', () => {
    expect([9, 10, 14, 6, 8, 7, 12, 1].map(n => balancedColumns(n))).toEqual([5, 5, 7, 6, 4, 7, 6, 1]);
    // Narrow cards allow six or five per row, still balanced.
    expect([9, 8, 14, 7].map(n => balancedColumns(n, 6))).toEqual([5, 4, 5, 4]);
    expect([9, 6, 10].map(n => balancedColumns(n, 5))).toEqual([5, 3, 5]);
    // The last row is never more than one tile shorter than the others.
    for (let n = 1; n <= 30; n++) for (const max of [5, 6, 7]) {
      const cols = balancedColumns(n, max);
      expect(cols).toBeLessThanOrEqual(max);
      const last = n % cols || cols;
      if (n > cols) expect(cols - last, `${n} in rows of ${max}`).toBeLessThanOrEqual(Math.ceil(n / cols) - 1);
    }
  });

  it('each arc carries its column counts for the stylesheet', () => {
    render(<LearnScreen progress={emptyProgress()} onOpen={() => {}} onBack={() => {}} onProgressChange={() => {}} />);
    for (const arc of ARCS) {
      const list = document.querySelector(`[data-testid="learn-arc-${arc.id}"] .learn-tiles`) as HTMLElement;
      expect(list.style.getPropertyValue('--cols-7'), arc.id).toBe(String(balancedColumns(arc.puzzles.length, 7)));
      expect(list.style.getPropertyValue('--cols-5'), arc.id).toBe(String(balancedColumns(arc.puzzles.length, 5)));
    }
  });
});
