import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'plant', title: 'Plant', part: 'elements', icon: 'plant',
  puzzles: [
    {
      id: 'plant-1', idea: 'Plant pieces are the best miners, 3 / 5 / 8 by tier: the Muju, the Mallki and the Sach\'akuna each step onto their own square, and the big bucket takes the big one.',
      board: [
        '.  P1 3',
        '8  P3 .',
        '.  5  P2',
      ],
      goal: { kind: 'mine', atLeast: 16 },
      solution: ['b1-c1', 'b2-a2', 'c3-b3', 'mine'],
    },
    {
      id: 'plant-2', idea: 'Big buckets want big squares, even far away: at Speed 1 the Sach\'akuna spends three actions walking to the 8, and the Mallki takes the 5. The short trips put the Mallki on the 8 and the Sach\'akuna on the 5, where each takes only 5.',
      board: [
        '8  .  .',
        'P2 5  .',
        '.  P3 .',
      ],
      goal: { kind: 'mine', atLeast: 13 },
      solution: ['b3-a1', 'a2-b2', 'mine'],
      tries: [['a2-a1', 'b3-b2', 'mine']],
    },
    {
      id: 'plant-3', idea: 'Plant beats Water and Shadow: the Mallki\'s 1 + 1 = 2 removes a Sjór and even a Karanlık (Shadow has DEF 2 at every tier), and each kill opens its next attack. The Muju\'s 0 + 1 = 1 only wastes an action.',
      board: [
        'P2 .  .',
        '.  .  w1',
        '.  s3 P1',
      ],
      goal: { kind: 'capture', targets: ['c2', 'b3'] },
      solution: ['a1-b2xb3', 'b2xc2'],
      tries: [['c3xc2', 'a1-b2xc2']],
    },
    {
      id: 'plant-4', idea: 'Each Plant tier hits one harder, and the Muju finishes: against an Ægirinn (DEF 4) the near Mallki and Muju make only 2 + 1 = 3; the far Sach\'akuna\'s 2 + 1 = 3 and the Muju\'s last 1 make 4.',
      board: [
        '.  .  w3',
        'P3 P2 P1',
        '.  .  .',
      ],
      goal: { kind: 'capture', targets: ['c1'] },
      solution: ['a2-b1xc1', 'c2xc1'],
      tries: [['b2-b1xc1', 'c2xc1']],
    },
    {
      id: 'plant-5', idea: 'Twist, and a callback to Teamwork: a Muju finishes a hurt Sjór, but Plant loses to Fire, so against a wounded Kagari (1 left of DEF 2) the Muju\'s 0 − 1 and the Mallki\'s 1 − 1 are both 0. Only the Sach\'akuna\'s 2 − 1 = 1 finishes it, and the two actions left are exactly its step and its blow.',
      board: [
        '.  .  .    .',
        '.  P2 f3!1 P1',
        '.  .  .    .',
        '.  .  P3   .',
      ],
      actions: 2,
      goal: { kind: 'capture', targets: ['c2'] },
      solution: ['c4-c3xc2'],
      tries: [['b2xc2'], ['d2xc2'], ['b2xc2', 'd2xc2']],
    },
    {
      id: 'plant-6', idea: 'Conclusion: Fire hunts slow Plant (the Hi does 2 + 1 = 3 to a Muju or a Mallki), and only the Sach\'akuna can answer it (2 − 1 = 1). It removes the Hi, then every tier steps onto its own square: 8 + 5 + 3. Mining without the kill loses a piece; the Mallki\'s blow does 0.',
      board: [
        'P1 3  .  .',
        '.  .  P2 5',
        '8  P3 f1 .',
        '.  .  .  m1',
      ],
      banks: { white: 3 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 16 }, { kind: 'survive' }] },
      solution: ['b3xc3', 'b3-a3', 'c2-d2', 'a1-b1', 'mine', 'end'],
      tries: [['b3-a3', 'c2-d2', 'a1-b1', 'mine', 'end'], ['c2xc3', 'b3-a3', 'c2-d2', 'a1-b1', 'mine', 'end']],
    },
  ],
};
