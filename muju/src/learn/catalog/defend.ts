import type { Arc } from '../types';

/**
 * Defense: the other side of Invasion. Every goal is "Don't let them win",
 * judged after the enemy's best reply. An invader already on your home wins
 * when their turn starts, so it must be removed now. A runner that reaches
 * your home wins at once (`#`) if your whole army cannot remove it next turn,
 * so it must be stopped, or kept out, before it lands.
 *
 * A harmless enemy Poṉ keeps the game going where removing the invader would
 * otherwise end it by elimination.
 */
export const ARC: Arc = {
  id: 'defend', title: 'Defense', part: 'winning', icon: 'defend',
  puzzles: [
    {
      id: 'defend-1',
      idea: 'An invader on your home wins when its turn starts: remove it now.',
      board: [
        'l1 .  .  .',
        '.  F1 .  .',
        '.  .  .  .',
        '.  .  .  m1',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['b2-b1xa1', 'mine', 'end'],
    },
    {
      id: 'defend-2',
      idea: 'A corner has two doors, so two attackers can hit the invader: each Hi does 2 − 1 = 1 to the Loş, and 1 + 1 removes it. Each Hi must take the door nearest to it; one Hi alone only chips it.',
      board: [
        's1 .  .  .',
        '.  .  .  .',
        'F1 F1 .  .',
        '.  .  .  m1',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['a3-a2xa1', 'b3-b1xa1', 'mine', 'end'],
      tries: [
        ['a3-a2xa1', 'mine', 'end'],
        ['b3-a2xa1', 'mine', 'end'],
      ],
    },
    {
      id: 'defend-3',
      idea: 'Make room: your own Muju and Poṉ fill both doors and do 0 to the Hi. The Poṉ cannot move, so the Muju steps aside and the Hi takes its door.',
      board: [
        'f1 P1 .  .',
        'M1 .  .  .',
        '.  .  F1 .',
        '.  .  .  m1',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['b1-b2', 'c3-b1xa1', 'mine', 'end'],
      tries: [
        ['b1xa1', 'a2xa1', 'mine', 'end'],
        ['c3-c1', 'b1xa1', 'mine', 'end'],
      ],
    },
    {
      id: 'defend-4',
      idea: 'Stop the runner before it lands: your Hi has wounded the Loş, and the Muju (0 + 1) can finish it now. Once it heals and reaches your home, the Muju alone does 1 against DEF 2 and cannot remove it.',
      board: [
        '.  .  .  .    .',
        '.  .  .  .    .',
        '.  .  .  s1!1 F1~',
        '.  .  P1 .    .',
        '.  .  .  .    m1',
      ],
      homes: true,
      actions: 2,
      goal: { kind: 'hold' },
      solution: ['c4-d4xd3', 'mine', 'end'],
      tries: [
        ['c4-b4', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
    {
      id: 'defend-5',
      idea: 'Front door first: the Mallki on 8 crystals is a juicy capture for the Hi (2 + 1 against DEF 3), but the Sjór on your home needs both the Hi (2 − 1) and the Muju (0 + 1), and there are not enough actions for all three blows.',
      board: [
        'w1 .  P1   .  .',
        '.  .  .    .  .',
        '.  F1 p2+8 .  .',
        '.  .  .    .  .',
        '.  .  .    .  .',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['b3-a2xa1', 'c1-b1xa1', 'mine', 'end'],
      tries: [
        ['b3xc3', 'b3-a2xa1', 'c1-b1', 'mine', 'end'],
        ['b3xc3', 'c1-b1xa1', 'mine', 'end'],
      ],
    },
    {
      id: 'defend-6',
      idea: 'Plug the doors: your Poṉ holds the home, but the Umeme (2 + 1) can kill it from a door and step in, and nothing of yours can hurt a Lightning piece. Fill both doors with the two Muju so it cannot get next to the Poṉ: breaking a plug and getting in would take it five actions.',
      board: [
        'M1 .  .  P1 .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        'P1 .  .  .  .',
        '.  .  .  l2 .',
      ],
      homes: true,
      banks: { black: 1 },
      goal: { kind: 'hold' },
      solution: ['a4-a2', 'd1-b1', 'mine', 'end'],
      tries: [
        ['mine', 'end'],
        ['a4-a2', 'mine', 'end'],
        ['d1-b1', 'mine', 'end'],
      ],
    },
    {
      id: 'defend-7',
      idea: 'A counter-invasion does not save you: the Radi could walk into their home where nothing can reach it, but their Hi is already on yours, so no `#` is given and they win first when their turn starts. Spend all four actions removing it instead.',
      board: [
        'f1 .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  L1',
        'm1 .  .  .  .  .',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['f5-b1xa1', 'mine', 'end'],
      tries: [
        ['f5-f6', 'mine', 'end'],
      ],
    },
    {
      id: 'defend-8',
      idea: 'Conclusion: the Loş needs two hits (1 + 1), and the Hi reaches the free door as fast as the far Muju. But a Hi left in a door falls to the Radi (1 against DEF 1), which then walks in where no Muju can hurt it. The two Muju must make the hits, so they also hold both doors.',
      board: [
        's1 P1 .  .  .',
        '.  .  .  .  .',
        '.  .  F1 .  .',
        'P1 .  .  l1 .',
        '.  .  .  .  .',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['b1xa1', 'a4-a2xa1', 'mine', 'end'],
      tries: [
        ['c3-a2xa1', 'b1xa1', 'mine', 'end'],
        ['c3-d3xd4', 'b1xa1', 'mine', 'end'],
      ],
    },
  ],
};
