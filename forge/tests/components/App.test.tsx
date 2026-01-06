import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../src/App';

describe('App Component', () => {
  it('should render the game title', () => {
    render(<App />);
    expect(screen.getByText('FORGE')).toBeInTheDocument();
  });

  it('should render player panels', () => {
    render(<App />);
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
  });

  it('should render new game button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /New Game/i })).toBeInTheDocument();
  });
});
