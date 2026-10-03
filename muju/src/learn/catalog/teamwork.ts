import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'teamwork', title: 'Teamwork', part: 'combat', icon: 'team',
  puzzles: [
    {
      id: 'teamwork-1', idea: 'Damage adds up within a turn: two Hi do 1 + 1 to a Sjór (DEF 2) and remove it together.',
      board: [
        '.  .  .',
        'F1 w1 F1',
        '.  .  .',
      ],
      goal: { kind: 'capture', targets: ['b2'] },
      solution: ['a2xb2', 'c2xb2'],
    },
    {
      id: 'teamwork-2', idea: 'Bigger walls take more hits: the Honō alone does 4 to an Irumbu (DEF 5); the Radi adds 2.',
      board: [
        '.  .  .  L1',
        '.  .  .  .',
        '.  m3 .  .',
        'F2 .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b3'] },
      solution: ['d1-c3xb3', 'a4-a3xb3'],
      tries: [['a4-a3xb3', 'mine'], ['d1-c3xb3', 'mine']],
    },
    {
      id: 'teamwork-3', idea: 'A wounded piece needs only what is left: mid-turn, even a Muju (0 + 1) finishes a hurt Sjór, so the Hi is free for the enemy Hi.',
      board: [
        '.   .    .  .',
        'F1~ w1!1 .  .',
        '.   P1   F1 f1',
        '.   .    .  .',
      ],
      actions: 2,
      goal: { kind: 'capture', targets: ['b2', 'd3'] },
      solution: ['b3xb2', 'c3xd3'],
      tries: [['c3-c2xb2']],
    },
    {
      id: 'teamwork-4', idea: 'Count before you swing: two Hi make only 2 against a Straumr (DEF 3); the Sjór (2) must walk in and hit with one Hi.',
      board: [
        '.  F1 .  .',
        'F1 w2 .  .',
        '.  .  .  .',
        '.  .  W1 .',
      ],
      goal: { kind: 'capture', targets: ['b2'] },
      solution: ['c4-c2xb2', 'a2xb2'],
      tries: [['a2xb2', 'b1xb2']],
    },
    {
      id: 'teamwork-5', idea: 'Damage heals at its owner\'s turn start: a Radi chip on turn 1 is gone by turn 2, and its action is lost. Spend turn 1 walking the Sjór in, then strike together (2 + 1 against the Poṉ\'s 3).',
      board: [
        '.  W1 .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  L1',
        '.  .  .  .  m1',
      ],
      turns: 2,
      goal: { kind: 'capture', targets: ['e5'] },
      solution: ['b1-b5', 'mine', 'end'],
      tries: [['e4xe5', 'b1-b4', 'mine', 'end'], ['e4xe5', 'mine', 'end']],
    },
    {
      id: 'teamwork-6', idea: 'A zero-damage hit is legal and useless: each Poṉ does 1 − 1 = 0 to the Kagari (DEF 2), so 0 + 0 is 0; the two Radi must come and do 1 + 1.',
      board: [
        '.  .  .  L1',
        '.  .  .  .',
        'M1 f3 M1 .',
        '.  .  .  L1',
      ],
      goal: { kind: 'capture', targets: ['b3'] },
      solution: ['d1-b2xb3', 'd4-b4xb3'],
      tries: [['a3xb3', 'c3xb3'], ['a3xb3', 'd1-b2xb3']],
    },
    {
      id: 'teamwork-7', idea: 'Conclusion: split the team. The Straumr (DEF 3) falls to Poṉ 2 + Muju 1 (the Radi does 0); only the Hi can remove the Kagari, so it must not join the pile.',
      board: [
        '.  P1 .  .  .',
        'M1 w2 L1 .  .',
        '.  .  .  .  .',
        '.  .  F1 .  f3',
        '.  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['b2', 'e4'] },
      solution: ['a2xb2', 'b1xb2', 'c4-d4xe4'],
      tries: [['c4-b3xb2', 'a2xb2'], ['a2xb2', 'c4-b3xb2'], ['c2xb2', 'a2xb2', 'b1xb2']],
    },
  ],
};
