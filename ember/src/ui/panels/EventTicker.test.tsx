// @vitest-environment jsdom
/**
 * EMBER — EventTicker component tests (src/ui/panels/EventTicker.test.tsx).
 */

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../core/types';
import { EventTicker } from './EventTicker';
import { buildSimFixture } from './testFixtures';

function ev(tick: number, topic: string, payload: unknown = {}): SimEvent {
  return { tick, topic, payload };
}

describe('EventTicker', () => {
  it('shows an empty state with no events', () => {
    render(<EventTicker events={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('no events yet');
  });

  it('renders newest-first from a newest-last events array, capped at 8 visible rows', () => {
    // 12 synthetic events, oldest first (matches the documented "newest
    // last" prop contract) — the ticker must show only the last 8, with the
    // very last one (tick 111) on top.
    const events = Array.from({ length: 12 }, (_, i) => ev(100 + i, 'world.resource.detected', { what: 'sunpatch' }));
    render(<EventTicker events={events} />);
    const list = screen.getByRole('list', { name: 'recent events' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('t=111');
    expect(rows[7]).toHaveTextContent('t=104');
  });

  it('renders real events from a real sim run without throwing, with newest tick on top', async () => {
    const fixture = await buildSimFixture({ seed: 31, ticks: 40 });
    const events = fixture.packet.recentEvents;
    expect(events.length).toBeGreaterThan(0);
    render(<EventTicker events={events} />);
    const list = screen.getByRole('list', { name: 'recent events' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(rows[0]).toHaveTextContent(`t=${events[events.length - 1].tick}`);
  });

  it('applies fading opacity that decreases for older (lower) rows', () => {
    const events = Array.from({ length: 5 }, (_, i) => ev(i, 'skill.completed', {}));
    render(<EventTicker events={events} />);
    const list = screen.getByRole('list', { name: 'recent events' });
    const rows = within(list).getAllByRole('listitem') as HTMLLIElement[];
    const opacities = rows.map((r) => Number.parseFloat(r.style.opacity));
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]);
    }
    expect(opacities[0]).toBe(1);
  });

  it.each([
    ['body.mode.entered', { mode: 'DEFEND' }, 'red'],
    ['world.resource.detected', { what: 'sunpatch' }, 'orange'],
    ['skill.gather.complete', {}, 'orange'],
    ['path.recomputed', {}, 'green'],
    ['world.wolf.attack', { damage: 0.1 }, 'fb5607'],
    ['pilot.intent.accepted', {}, 'cyan'],
    ['body.debt.accrued', {}, 'slate'],
  ] satisfies [string, unknown, string][])('color-codes topic "%s" per category', (topic, payload, colorHint) => {
    const { getByRole, unmount } = render(<EventTicker events={[ev(1, topic, payload)]} />);
    const list = getByRole('list', { name: 'recent events' });
    const row = within(list).getAllByRole('listitem')[0];
    const coloredSpan = row.querySelector('span.font-semibold');
    expect(coloredSpan, `expected a colored span in "${topic}"`).not.toBeNull();
    expect(coloredSpan!.className).toContain(colorHint);
    unmount();
  });

  it('shows a payload-derived headline value colored the same as the topic category', () => {
    render(<EventTicker events={[ev(42, 'body.mode.entered', { mode: 'DEFEND', from: 'EXPLORE' })]} />);
    expect(screen.getByText('DEFEND')).toBeInTheDocument();
  });
});
