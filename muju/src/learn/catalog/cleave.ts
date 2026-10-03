import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'cleave', title: 'Cleave', part: 'combat', icon: 'cleave',
  puzzles: [
    {
      id: 'cleave-1', idea: 'A kill unlocks another attack by the same piece: the Hi takes both Muju.',
      board: [
        '.  .  .',
        'p1 F1 p1',
        '.  .  .',
      ],
      goal: { kind: 'capture', targets: ['a2', 'c2'] },
      solution: ['b2xa2', 'b2xc2'],
    },
    {
      id: 'cleave-2', idea: 'Move between kills: walking neither restores nor spends the next attack. The Radi (1 vs 1) kills the Hi beside it, runs two actions, and kills the other; going for the far Hi first leaves one action, enough to arrive but not to hit.',
      board: [
        'L1 f1 .  .',
        '.  .  .  .',
        '.  .  .  f1',
        '.  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b1', 'd3'] },
      solution: ['a1xb1', 'a1-d2xd3'],
      tries: [['a1-c3xd3'], ['a1-d2xd3']],
    },
    {
      id: 'cleave-3', idea: 'Four kills from one piece: the four actions are the only cap.',
      board: [
        '.  .  .  .  .',
        '.  .  p1 .  .',
        '.  p1 F1 p1 .',
        '.  .  p1 .  .',
        '.  .  .  .  F1',
      ],
      goal: { kind: 'capture', targets: ['c2', 'b3', 'd3', 'c4'] },
      solution: ['c3xc2', 'c3xb3', 'c3xd3', 'c3xc4'],
      tries: [['e5-d4xd3']],
    },
    {
      id: 'cleave-4', idea: 'A survivor closes the chain: the Hi must kill the Muju beside it before it steps over and hits the Sjór (a 1-damage blow that ends its attacks); your Muju finishes the Sjór. Hitting the Sjór first leaves the enemy Muju standing, and chipping the Sjór first so the Hi kills it strands the Hi two squares from the Muju.',
      board: [
        '.  .  .  .',
        'p1 F1 .  w1',
        '.  .  .  P1',
        '.  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['a2', 'd2'] },
      solution: ['b2xa2', 'b2-c2xd2', 'd3xd2'],
      tries: [['b2-c2xd2', 'd3xd2'], ['d3xd2', 'b2-c2xd2']],
    },
    {
      id: 'cleave-5', idea: 'Chip first with another piece, so the chainer\'s blow kills the Sjór and it walks on to the next kill.',
      board: [
        '.  .  .',
        '.  P1 .',
        'p1 w1 F1',
      ],
      goal: { kind: 'capture', targets: ['b3', 'a3'] },
      solution: ['b2xb3', 'c3xb3', 'c3-b3xa3'],
      tries: [['c3xb3', 'b2xb3', 'c3-b3']],
    },
    {
      id: 'cleave-6', idea: 'Every attack still costs an action: chipping the Sjór first leaves one Muju standing; the Poṉ kills it in one blow.',
      board: [
        '.  M1 .  .',
        '.  w1 P1 .',
        'p1 F1 p1 .',
        '.  p1 .  .',
      ],
      goal: { kind: 'capture', targets: ['b2', 'a3', 'c3', 'b4'] },
      solution: ['b1xb2', 'b3xa3', 'b3xc3', 'b3xb4'],
      tries: [['c2xb2', 'b3xb2', 'b3xa3', 'b3xc3'], ['b3xa3', 'b3xc3', 'b3xb4', 'b3xb2']],
    },
    {
      id: 'cleave-7', idea: 'A teammate\'s kill does not reopen a closed chain: each Hi takes its own Muju before the Sjór.',
      board: [
        '.  .  .  p1',
        'p1 F1 w1 F1',
        '.  .  .  .',
        '.  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['a2', 'c2', 'd1'] },
      solution: ['b2xa2', 'b2xc2', 'd2xc2', 'd2xd1'],
      tries: [['b2xc2', 'd2xc2', 'd2xd1']],
    },
    {
      id: 'cleave-8', idea: 'Conclusion: the kill that opens the road comes first, the Sjór is left alone, and the Hi walks between kills.',
      board: [
        '.  .  .  .  .',
        '.  F1 w1 P1 .',
        '.  p1 .  p1 .',
        '.  .  p1 .  .',
        '.  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b3', 'd3', 'c4'] },
      solution: ['b2xb3', 'b2-c3xd3', 'c3xc4'],
      tries: [['b2xc2'], ['d2xc2', 'b2xc2', 'b2-c3xd3'], ['b2xb3', 'b2-b4xc4']],
    },
  ],
};
