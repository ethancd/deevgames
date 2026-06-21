// Component smoke tests + a thin integration drive of the App state machine,
// confirming the screens render fixture/engine data and respond to touch.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';
import { Card } from '../src/components/Card';
import { fixtureCard } from '@mms/schema';

describe('Card', () => {
  it('renders name, cost and rules text off a CardDef', () => {
    render(<Card card={fixtureCard} />);
    expect(screen.getByText('Skeleton')).toBeInTheDocument();
    expect(screen.getByText(fixtureCard.text)).toBeInTheDocument();
    // accessible label carries the cost for screen readers
    expect(
      screen.getByRole('button', { name: /cost 1/i }),
    ).toBeInTheDocument();
  });
});

describe('App run flow', () => {
  it('boots on the title screen (hello, run)', () => {
    render(<App />);
    expect(screen.getByText(/SPIRE/)).toBeInTheDocument();
    expect(screen.getByTestId('start-run')).toBeInTheDocument();
  });

  it('starts a run and renders the act map with a reachable node', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    expect(screen.getByText(/THE NECROPOLIS SPIRE/)).toBeInTheDocument();
    const reachable = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('enters a combat node and shows hand, energy, and enemy intents', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    const reachable = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    fireEvent.click(reachable[0]);

    // If we landed on a combat node we should see combat chrome.
    if (screen.queryByTestId('energy')) {
      expect(screen.getByTestId('energy')).toBeInTheDocument();
      expect(screen.getByTestId('end-turn')).toBeInTheDocument();
      expect(screen.getAllByTestId('enemy').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('intent').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('card').length).toBeGreaterThan(0);
    } else {
      // a non-combat node resolves to a reward choice screen
      expect(screen.getByTestId('reward-choices')).toBeInTheDocument();
    }
  });

  it('playing a card and ending the turn keeps the game responsive', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    // walk into the first combat we can find across reachable nodes
    const nodes = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    fireEvent.click(nodes[0]);
    const endTurn = screen.queryByTestId('end-turn');
    if (endTurn) {
      const cards = screen.getAllByTestId('card');
      // tapping a card should not crash; energy is still present afterwards
      fireEvent.click(cards[0]);
      fireEvent.click(endTurn);
      expect(screen.getByTestId('energy')).toBeInTheDocument();
    }
  });
});
