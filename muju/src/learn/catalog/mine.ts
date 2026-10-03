import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'mine', title: 'Mining', part: 'basics', icon: 'mine',
  puzzles: [
    {
      id: 'mine-1', idea: 'Mine & prepare: a piece standing on crystals mines them when you press it.',
      board: [
        '.  .  .',
        '.  P1+3 .',
        '.  .  .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['mine'],
      freebie: true,
    },
    {
      id: 'mine-2', idea: 'A piece mines only the square it stands on when you press Mine & prepare: walk onto the crystals first, then press it.',
      board: [
        '.  .  .  .',
        'P1 .  .  3',
        '.  .  .  .',
        '.  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['a2-d2', 'mine'],
      tries: [['mine'], ['a2-c2', 'mine']],
    },
    {
      id: 'mine-3', idea: 'A piece takes at most what the square holds: the near 1 and the 2 fall short of the Muju\'s Mining 3; the far 4 pays in full, and one crystal stays behind.',
      board: [
        '.  .  .  .',
        '.  P1 1  .',
        '.  .  .  .',
        '2  .  .  4',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['b2-d4', 'mine'],
      tries: [['b2-c2', 'mine'], ['b2-a4', 'mine']],
    },
    {
      id: 'mine-4', idea: 'Every piece mines the square it ends on, each up to its own Mining: on three equal squares the Muju takes 3, the Sjór 2, the Hi 1.',
      board: [
        '.  P1 3  .',
        '.  .  .  .',
        'W1 .  .  3',
        '3  .  F1 .',
      ],
      goal: { kind: 'mine', atLeast: 6 },
      solution: ['b1-c1', 'a3-a4', 'c4-d3', 'mine'],
      tries: [['b1-c1', 'mine'], ['b1-c1', 'a3-a4', 'mine']],
    },
    {
      id: 'mine-5', idea: 'Mining 0: the Radi standing on the crystals takes nothing; it must step off (one action) so the Muju can walk on (three).',
      board: [
        '.  .  .  .',
        'P1 .  .  .',
        '.  .  L1+8 .',
        '.  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['c3-d4', 'a2-c3', 'mine'],
      tries: [['mine'], ['a2-c2', 'mine']],
    },
    {
      id: 'mine-6', idea: 'Match buckets to squares: the Muju (3) belongs on the 4 and the Sjór (2) on the 2; sending each to its nearest square makes 4, not 5.',
      board: [
        '.  .  .  .',
        '.  P1 2  .',
        '.  .  4  W1',
        '.  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 5 },
      solution: ['b2-c3', 'd3-c2', 'mine'],
      tries: [['b2-c2', 'd3-c3', 'mine']],
    },
    {
      id: 'mine-7', idea: 'The big bucket: the Sach\'akuna (Mining 8) belongs on the 16, not the near 4, even though the Muju must give the 16 up and settle for a 3.',
      board: [
        '.  .  .  .',
        '.  P1+16 3 .',
        '4  .  .  .',
        'P3 .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 11 },
      solution: ['b2-c2', 'a4-b2', 'mine'],
      tries: [['mine'], ['a4-a3', 'mine'], ['b2-c2', 'a4-a3', 'mine']],
    },
    {
      id: 'mine-8', idea: 'Reserves never refill: after the first payday the Muju\'s square is dark, so the second payday needs a new square; the adjacent 2 is one short and the far 3 takes the whole turn.',
      board: [
        '.  .  .  m1',
        '.  .  P1+3 .',
        '.  .  2  .',
        '3  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 6 },
      turns: 2,
      solution: ['mine', 'end'],
      tries: [['c2-c3', 'mine', 'end'], ['mine', 'end', 'mine', 'end', 'mine']],
    },
    {
      id: 'mine-9', idea: 'Conclusion: move the Mining 0 blocker aside, put the big bucket on the big square, and count every piece, even the Poṉ that cannot move.',
      board: [
        '.  .  .  .',
        '4  P3 L1 8',
        '.  M1+3 P1 3',
        '.  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 14 },
      solution: ['c2-c1', 'b2-d2', 'c3-d3', 'mine'],
      tries: [['b2-a2', 'c3-d3', 'mine'], ['c2-d2', 'c3-d3', 'mine'], ['c2-c1', 'c3-d2', 'b2-c2', 'mine']],
    },
  ],
};
