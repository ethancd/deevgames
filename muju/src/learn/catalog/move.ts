import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'move', title: 'Moving', part: 'basics', icon: 'move',
  puzzles: [
    {
      id: 'move-1', idea: 'Tap a piece, tap a square: one step costs one action.',
      board: [
        'P1 .  .',
        '.  .  .',
        '.  .  .',
      ],
      goal: { kind: 'reach', flags: ['b1'] },
      solution: ['a1-b1'],
    },
  ],
};
