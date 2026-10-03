import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'attack', title: 'Attacking', part: 'combat', icon: 'attack',
  puzzles: [
    {
      id: 'attack-1', idea: 'Tap the enemy beside your piece: one attack, one action, and ATK 2 against DEF 1 removes it.',
      board: [
        '.  .  .',
        '.  F1 .',
        '.  l1 .',
      ],
      goal: { kind: 'capture', targets: ['b3'] },
      solution: ['b2xb3'],
    },
    {
      id: 'attack-2', idea: 'Move, then attack: tap the enemy from afar, preview the landing square, confirm.',
      board: [
        '.  .  .  F1',
        '.  .  .  .',
        '.  l1 .  .',
        '.  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b3'] },
      solution: ['d1-c3xb3'],
      tries: [['d1-c3', 'mine']],
    },
    {
      id: 'attack-3', idea: 'The trip plus the hit must fit: the near Sjór can reach the enemy but has no action left to hit; the far, faster Loş can.',
      board: [
        'S1 W1 .  .',
        '.  .  .  .',
        '.  .  .  .',
        '.  .  .  w1',
      ],
      goal: { kind: 'capture', targets: ['d4'] },
      solution: ['a1-c4xd4'],
      tries: [['b1-c4']],
    },
    {
      id: 'attack-4', idea: 'Not every piece can hurt: the Muju beside the enemy has ATK 0; the far Hi needs all four actions.',
      board: [
        '.  .  .  .  F1',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  P1 .  .',
        '.  .  f1 .  .',
      ],
      goal: { kind: 'capture', targets: ['c5'] },
      solution: ['e1-d5xc5'],
      tries: [['c4xc5'], ['c4-b4', 'e1-c4']],
    },
    {
      id: 'attack-5', idea: 'Defense matters: the fast Radi hits the Kagari for 1 of its 2; only the Hi\'s 2 removes it.',
      board: [
        'L1 .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  f3',
        '.  .  .  .  .',
        'F1 .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['e3'] },
      solution: ['a5-e4xe3'],
      tries: [['a1-e2xe3']],
    },
    {
      id: 'attack-6', idea: 'Two targets, two attackers, one budget (2 + 2): the Radi is the nearer piece to the Kagari but can only remove the enemy Radi, so the Hi takes the Kagari and the Radi crosses the board.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  f3',
        '.  .  F1 .  .',
        'l1 .  .  .  L1',
        '.  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['e2', 'a4'] },
      solution: ['c3-d2xe2', 'e4-b4xa4'],
      tries: [['c3-b4xa4', 'e4-e3xe2']],
    },
    {
      id: 'attack-7', idea: 'No zone of control: the Hi walks between two Kagari to its target (3 + 1); stopping to kill either guard, even the one beside the target, costs the hit.',
      board: [
        '.  .  .  F1',
        '.  .  .  .',
        'f3 .  f3 .',
        'l1 .  .  .',
      ],
      goal: { kind: 'capture', targets: ['a4'] },
      solution: ['d1-b4xa4'],
      tries: [['d1-c2xc3'], ['d1-a2xa3']],
    },
    {
      id: 'attack-8', idea: 'Conclusion: your Radi blocks the Hi\'s door to the Kagari. Sent after the enemy Radi, it clears the door, and the Hi removes the Kagari that the Muju (0) and the Radi (1) cannot; 2 + 2 actions.',
      board: [
        '.  .  .  .',
        'l1 .  F1 .',
        '.  .  .  P1',
        '.  .  L1 f3',
      ],
      goal: { kind: 'capture', targets: ['d4', 'a2'] },
      solution: ['c4-a3xa2', 'c2-c4xd4'],
      tries: [['c4xd4'], ['d3xd4'], ['c2-b2xa2']],
    },
  ],
};
