// @vitest-environment jsdom
/**
 * EMBER — GroundTruthPanel component tests
 * (src/ui/panels/GroundTruthPanel.test.tsx).
 */

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroundTruthPanel } from './GroundTruthPanel';
import { buildSimFixture } from './testFixtures';

describe('GroundTruthPanel', () => {
  it('renders header, six meter rows (with values + sparklines), mode chip, and wolf line from a real sim', async () => {
    const fixture = await buildSimFixture({ seed: 21, ticks: 30 });
    render(<GroundTruthPanel body={fixture.body} wolf={fixture.wolf} history={fixture.history} />);

    expect(screen.getByText('GROUND TRUTH')).toBeInTheDocument();
    expect(screen.getByText('(dev)')).toBeInTheDocument();

    const meters = screen.getByRole('list', { name: 'body meters' });
    const rows = within(meters).getAllByRole('listitem');
    expect(rows).toHaveLength(6);

    for (const v of ['fuel', 'heat', 'damage', 'fatigue', 'activation', 'stability'] as const) {
      const row = meters.querySelector(`[data-row="${v}"]`);
      expect(row, `missing row for ${v}`).not.toBeNull();
      expect(row).toHaveTextContent(fixture.body[v].toFixed(2));
      // one meter bar (role=img) + one sparkline <polyline> per row
      expect(row!.querySelectorAll('polyline')).toHaveLength(1);
    }

    expect(screen.getByText(fixture.body.mode)).toBeInTheDocument();
    expect(screen.getByText(`wolf: ${fixture.wolf.state}`)).toBeInTheDocument();
  });

  it('draws a non-empty sparkline once history has points, and copes with empty history', async () => {
    const fixture = await buildSimFixture({ seed: 22, ticks: 20 });
    expect(fixture.history.length).toBeGreaterThan(0);

    const withHistory = render(
      <GroundTruthPanel body={fixture.body} wolf={fixture.wolf} history={fixture.history} />,
    );
    const fuelRow = withHistory.container.querySelector('[data-row="fuel"]')!;
    const polyline = fuelRow.querySelector('polyline')!;
    expect(polyline.getAttribute('points')).not.toBe('');
    withHistory.unmount();

    const empty = render(<GroundTruthPanel body={fixture.body} wolf={fixture.wolf} history={[]} />);
    // Should not throw, and should still render all six rows.
    expect(empty.getByRole('list', { name: 'body meters' }).querySelectorAll('li')).toHaveLength(6);
    empty.unmount();
  });

  it.each([
    ['EXPLORE', 'green'],
    ['CONSERVE', 'amber'],
    ['DEFEND', 'red'],
    ['RECOVER', 'violet'],
  ] as const)('colors the %s mode chip %s', async (mode, color) => {
    const fixture = await buildSimFixture({ seed: 23, ticks: 8 });
    const body = { ...fixture.body, mode };
    const { getByText, unmount } = render(<GroundTruthPanel body={body} wolf={fixture.wolf} history={fixture.history} />);
    const chip = getByText(mode);
    expect(chip.className).toContain(color);
    unmount();
  });
});
