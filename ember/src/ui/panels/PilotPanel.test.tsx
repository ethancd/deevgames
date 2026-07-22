// @vitest-environment jsdom
/**
 * EMBER — PilotPanel component tests (src/ui/panels/PilotPanel.test.tsx).
 */

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContextPacket, Intent, SkillName } from '../../core/types';
import { createBody, computeInteroception } from '../../body';
import { createRng } from '../../core/rng';
import { generateWorld } from '../../sim';
import { PilotPanel } from './PilotPanel';
import { buildSimFixture } from './testFixtures';

function baseIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    goal: 'Test goal narration',
    skill: 'wait',
    params: {},
    interruptConditions: [],
    thought: 'a thought',
    ...overrides,
  };
}

function packetWith(intoOverrides: Partial<ContextPacket> = {}): ContextPacket {
  return {
    tick: 100,
    observations: [],
    interoception: {
      global: {
        activation: 'mid',
        capacity: 'mid',
        stability: 'mid',
        temperature: 'mid',
        trend: 'stable',
        confidence: 0.8,
      },
      salient: [],
      drives: [
        { drive: 'safety', urgency: 0.2 },
        { drive: 'fuel', urgency: 0.5 },
      ],
      availableRegulation: [],
    },
    activeIntent: null,
    recentEvents: [],
    skills: [],
    ...intoOverrides,
  };
}

describe('PilotPanel', () => {
  it('shows the empty state when packet is null', () => {
    render(<PilotPanel packet={null} intent={null} narrationEnabled />);
    expect(screen.getByRole('status')).toHaveTextContent('no pilot consultation yet');
    expect(screen.queryByText('PILOT VIEW')).toBeInTheDocument();
  });

  it('renders a real ContextPacket from a real sim: header, 4 interoception rows, drive rows, intent banner', async () => {
    const fixture = await buildSimFixture({ seed: 11, ticks: 24 });
    render(<PilotPanel packet={fixture.packet} intent={fixture.intent} narrationEnabled />);

    expect(screen.getByText('PILOT VIEW')).toBeInTheDocument();

    const interoList = screen.getByRole('list', { name: 'interoception readings' });
    expect(within(interoList).getAllByRole('listitem')).toHaveLength(4);
    // capacity/activation/stability/temperature rows are all present.
    for (const row of ['capacity', 'activation', 'stability', 'temperature']) {
      expect(interoList.querySelector(`[data-row="${row}"]`)).not.toBeNull();
    }
    // Confidence is shown as a whole-number percentage derived straight
    // from interoception.global.confidence (same value for every row, since
    // the pinned Interoception type exposes only one global confidence).
    const expectedPct = `${Math.round(fixture.packet.interoception.global.confidence * 100)}%`;
    expect(within(interoList).getAllByText(expectedPct)).toHaveLength(4);

    const drivesList = screen.getByRole('list', { name: 'drives' });
    const driveRows = within(drivesList).getAllByRole('listitem');
    expect(driveRows).toHaveLength(fixture.packet.interoception.drives.length);
    // Drive rows preserve the packet's array order, so match by index
    // rather than by text (urgencies can legitimately collide at "0.00").
    fixture.packet.interoception.drives.forEach((d, i) => {
      expect(driveRows[i]).toHaveTextContent(d.drive);
      expect(driveRows[i]).toHaveTextContent(d.urgency.toFixed(2));
    });

    const banner = screen.getByRole('status', { name: 'current intent' });
    expect(banner).toHaveTextContent(`skill: ${fixture.intent.skill}`);
  });

  it('renders identically for two distinct BodyState objects that produce the same packet (proves it reads only the packet)', () => {
    const world = generateWorld(3, createRng(3).fork('worldgen'));
    const bodyA = createBody({ fuel: 0.42, heat: 0.55, activation: 0.63, fatigue: 0.2, damage: 0.05 });
    const bodyB = createBody({ fuel: 0.42, heat: 0.55, activation: 0.63, fatigue: 0.2, damage: 0.05 });
    // Two DISTINCT BodyState object identities with equal field values.
    expect(bodyA).not.toBe(bodyB);
    expect(bodyA).toEqual(bodyB);

    // Same rng seed => identical noise draw sequence => structurally equal
    // Interoception even though it came from two different body objects.
    const introA = computeInteroception(bodyA, world, null, createRng(99));
    const introB = computeInteroception(bodyB, world, null, createRng(99));
    expect(introA).toEqual(introB);

    const packetA = packetWith({ interoception: introA });
    const packetB = packetWith({ interoception: introB });
    const intent = baseIntent({ skill: 'move_to', params: { dest: { x: 5, y: 6 }, style: 'direct' } });

    const a = render(<PilotPanel packet={packetA} intent={intent} narrationEnabled />);
    const htmlA = a.container.innerHTML;
    a.unmount();
    const b = render(<PilotPanel packet={packetB} intent={intent} narrationEnabled />);
    const htmlB = b.container.innerHTML;
    b.unmount();

    expect(htmlA).toBe(htmlB);
  });

  it('hides goal narration when narrationEnabled is false, shows it when true', () => {
    const packet = packetWith();
    const intent = baseIntent({ goal: 'Head to the den' });

    const withNarration = render(<PilotPanel packet={packet} intent={intent} narrationEnabled />);
    expect(withNarration.getByText('Head to the den')).toBeInTheDocument();
    withNarration.unmount();

    const withoutNarration = render(<PilotPanel packet={packet} intent={intent} narrationEnabled={false} />);
    expect(withoutNarration.queryByText('Head to the den')).not.toBeInTheDocument();
    withoutNarration.unmount();
  });

  it.each([
    ['flee', 'amber'],
    ['shelter', 'amber'],
    ['rest', 'violet'],
    ['consume', 'violet'],
    ['move_to', 'teal'],
    ['gather', 'teal'],
    // Neutral tint ('gray' in the IntentTint type) renders with slate-family
    // Tailwind classes, matching the rest of this dark UI's neutral palette.
    ['wait', 'slate'],
    ['focus', 'slate'],
  ] satisfies [SkillName, string][])('tints the intent banner %s -> %s', (skill, colorHint) => {
    const packet = packetWith();
    const intent = baseIntent({ skill });
    const { getByRole, unmount } = render(<PilotPanel packet={packet} intent={intent} narrationEnabled />);
    const banner = getByRole('status', { name: 'current intent' });
    expect(banner.className).toContain(colorHint);
    unmount();
  });

  it('falls back to packet.activeIntent when intent prop is null', () => {
    const activeIntent = baseIntent({ skill: 'gather', params: { target: 'deadwood-1' } });
    const packet = packetWith({ activeIntent: { intent: activeIntent, status: 'running' } });
    render(<PilotPanel packet={packet} intent={null} narrationEnabled />);
    expect(screen.getByRole('status', { name: 'current intent' })).toHaveTextContent('skill: gather');
    expect(screen.getByText(/target: deadwood-1/)).toBeInTheDocument();
  });
});
