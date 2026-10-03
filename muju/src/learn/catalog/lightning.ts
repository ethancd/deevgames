import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'lightning', title: 'Lightning', part: 'elements', icon: 'lightning',
  puzzles: [
    {
      id: 'lightning-1', idea: 'A Radi runs 3 squares per action: it crosses the board (7 squares in 3 actions) and still has the fourth action to strike the Hi (1 against 1).',
      board: [
        'L1 .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  f1',
      ],
      goal: { kind: 'capture', targets: ['e5'] },
      solution: ['a1-d5xe5'],
    },
    {
      id: 'lightning-2', idea: 'Speed buys travel, never damage: the Radi beside the Muju hits for only 1 + 1 = 2. The far Umeme runs 4 squares per action and hits for 2 + 1 = 3.',
      board: [
        '.  .  .  .  .  L2',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        'L1 .  .  .  .  .',
        'p1 .  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['a6'] },
      solution: ['f1-b6xa6'],
      tries: [['a5xa6']],
    },
    {
      id: 'lightning-3', idea: 'A Kimbunga runs 5 squares per action: it kills the Radi beside it, then crosses 10 squares in two actions to kill the Hi. The nearer Umeme needs three.',
      board: [
        'L3 l1 .  .  .  .  .  .',
        '.  .  .  .  .  .  .  .',
        '.  .  .  .  .  .  .  .',
        '.  .  .  .  .  .  .  .',
        '.  .  .  .  .  .  .  f1',
        '.  .  .  .  .  .  .  .',
        '.  .  .  .  .  .  .  .',
        'L2 .  .  .  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b1', 'h5'] },
      solution: ['a1xb1', 'a1-g5xh5'],
      tries: [['a1xb1', 'a8-g5'], ['a8-g5xh5']],
    },
    {
      id: 'lightning-4', idea: 'Shadow beats Lightning: a Radi does 1 - 1 = 0 to a Loş, and the empty hit closes its chain. The Radi takes the Hi; the Kimbunga (3 - 1 = 2) crosses to take the Loş.',
      board: [
        'L3 .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  f1 L1 s1 .',
      ],
      goal: { kind: 'capture', targets: ['c6', 'e6'] },
      solution: ['d6xc6', 'a1-e5xe6'],
      tries: [['d6xe6'], ['a1-c5xc6', 'd6xe6']],
    },
    {
      id: 'lightning-5', idea: 'Lightning mines nothing (Mining 0), so its job is to clear the way: the Radi runs over and kills the Hi sitting on the crystals in three actions, and the spare fourth action steps the Muju in. The Radi on the near crystals mines 0.',
      board: [
        '.  .  .  .  f1+3',
        '.  .  .  .  P1',
        'L1 .  .  .  .',
        '3  .  .  .  .',
        '.  .  .  .  m1',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['a3-d1xe1', 'e2-e1', 'mine'],
      tries: [['a3-a4', 'mine']],
    },
    {
      id: 'lightning-6', idea: 'Conclusion: no square is out of the enemy Radi\'s reach, so kill it first; nothing hurts the Sjór (1 - 1 = 0), so outrun it. The last action runs 3 squares along the edge to the one square past its trip plus hit; running back up is not far enough.',
      board: [
        '.  L1 .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  w1',
        '.  .  .  .  l1',
      ],
      goal: { kind: 'survive' },
      solution: ['b1-d5xe5', 'd5-a5', 'mine', 'end'],
      tries: [['b1-d5xe5', 'mine', 'end'], ['b1-d5xe5', 'd5-d2', 'mine', 'end'], ['mine', 'end']],
    },
  ],
};
