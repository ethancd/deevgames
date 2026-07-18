// MusterScreen interaction: tapping an offer tile must dispatch pickReward with
// that offer (regression for "tapping a stack does nothing").
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MusterScreen } from '../src/screens/MusterScreen';
import { engine } from '../src/engine';
import type { RewardChoice, RunState } from '../src/engine';

function musterRun(): RunState {
  const base = engine.startRun('muster-screen-test');
  const stack = base.army[0];
  const offers: RewardChoice[] = [
    { kind: 'muster', stackId: stack.id, creatureId: stack.creatureId, count: 5, cost: 10 },
    { kind: 'skip' },
  ];
  return {
    ...base,
    gold: 9999,
    pendingMusterNodeId: base.map[0].id,
    pendingRewards: offers,
  } as RunState;
}

describe('MusterScreen', () => {
  it('renders a reinforce tile with current → new count', () => {
    render(<MusterScreen run={musterRun()} onPick={() => {}} onMarchOn={() => {}} />);
    const tile = screen.getByTestId('muster-reinforce');
    expect(tile.textContent).toMatch(/→/); // shows the count delta
  });

  it('tapping a reinforce tile dispatches pickReward with that offer', () => {
    const run = musterRun();
    const onPick = vi.fn();
    render(<MusterScreen run={run} onPick={onPick} onMarchOn={() => {}} />);
    fireEvent.click(screen.getByTestId('muster-reinforce'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ kind: 'muster' });
  });
});
