import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaimToast } from '../src/components/ClaimToast';

describe('ClaimToast', () => {
  it('shows the formatted bonus for a stat tile', () => {
    render(<ClaimToast claim={{ tile: 'defense', amount: 1 }} resetKey="n1" />);
    expect(screen.getByText(/\+1 Defense/)).toBeInTheDocument();
  });

  it('shows XP amount', () => {
    render(<ClaimToast claim={{ tile: 'xp', amount: 120 }} resetKey="n2" />);
    expect(screen.getByText(/\+120 XP/)).toBeInTheDocument();
  });
});
