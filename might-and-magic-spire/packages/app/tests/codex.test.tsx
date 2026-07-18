// Codex (data explorer/editor) tests: it lists the imported corpus, shows the
// engine-adapted IN-GAME stats (the army-model Stack / Equipment the rebuilt
// engine produces), and recomputes them live when a source stat is edited —
// the whole point of the tool.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CodexScreen } from '../src/screens/CodexScreen';

describe('CodexScreen', () => {
  it('lists creatures and shows the Skeleton adapted to a tier-1 front-rank stack', () => {
    render(<CodexScreen onExit={() => {}} />);
    // The Skeleton is the canonical tier-1 creature; the adapter turns it into a
    // front-rank Stack carrying its real HoMM3 stats (Attack 5).
    expect(screen.getByRole('heading', { name: 'Skeleton' })).toBeInTheDocument();
    const adapted = screen.getByText(/In-game/).closest('section')!;
    expect(within(adapted).getByText('front')).toBeInTheDocument();
    expect(within(adapted).getByText('5')).toBeInTheDocument(); // adapted Attack
  });

  it('recomputes the adapted stack live when the Attack stat is edited', () => {
    render(<CodexScreen onExit={() => {}} />);
    const attack = screen.getByLabelText('Attack') as HTMLInputElement;
    fireEvent.change(attack, { target: { value: '9' } });
    // Adapter carries Attack verbatim, so the in-game stack's Attack must follow.
    const adapted = screen.getByText(/In-game/).closest('section')!;
    expect(within(adapted).getByText('9')).toBeInTheDocument();
  });

  it('switches tabs and adapts an artifact class to an equipment rarity', () => {
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
