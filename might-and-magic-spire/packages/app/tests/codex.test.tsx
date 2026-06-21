// Codex (data explorer/editor) tests: it lists the imported corpus, shows the
// engine-adapted in-game stats, and recomputes them live when a source stat is
// edited — the whole point of the tool.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CodexScreen } from '../src/screens/CodexScreen';

describe('CodexScreen', () => {
  it('lists creatures and shows the Skeleton adapted to "Deal 5 damage."', () => {
    render(<CodexScreen onExit={() => {}} />);
    // The Skeleton is the canonical tier-1 creature; its adapted card text is
    // pinned. (It renders twice: on the Card face and in the adapted stat table.)
    expect(screen.getByRole('heading', { name: 'Skeleton' })).toBeInTheDocument();
    expect(screen.getAllByText('Deal 5 damage.').length).toBeGreaterThan(0);
  });

  it('recomputes the adapted card live when the Attack stat is edited', () => {
    render(<CodexScreen onExit={() => {}} />);
    const attack = screen.getByLabelText('Attack') as HTMLInputElement;
    fireEvent.change(attack, { target: { value: '9' } });
    // Adapter: magnitude = attack, so the card text must follow immediately.
    expect(screen.getAllByText('Deal 9 damage.').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Deal 5 damage.')).toHaveLength(0);
  });

  it('switches tabs and adapts an artifact class to a relic rarity', () => {
    render(<CodexScreen onExit={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Artifacts/ }));
    // The "In-game" section should report a rarity derived from ArtifactClass.
    const adapted = screen.getByText(/In-game/).closest('section')!;
    expect(within(adapted).getByText(/common|uncommon|rare/)).toBeInTheDocument();
  });

  it('calls onExit from the Title button', () => {
    const onExit = vi.fn();
    render(<CodexScreen onExit={onExit} />);
    fireEvent.click(screen.getByText('← Title'));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
