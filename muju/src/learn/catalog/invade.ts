import type { Arc } from '../types';

/**
 * Invasion: occupy the enemy home (bottom-right) and make sure the defender's
 * whole army and four actions cannot remove you. Every one-turn goal here is
 * home checkmate (`#`), judged when Prepare opens and after every Prepare
 * action, so the invader must first survive your own upkeep.
 *
 * A corner has only two doors, and three attacks on it cost at least five
 * actions, so at most two defenders can hit the invader in one turn. Scenery enemies
 * stay on the board so that a capture never ends the game by elimination.
 */
export const ARC: Arc = {
  id: 'invade', title: 'Invasion', part: 'winning', icon: 'invade',
  puzzles: [
    {
      id: 'invade-1',
      idea: 'Walk in where nobody can reach you: the Sjór stands four squares from either door, so it arrives with no action left to hit, and the Hi on the enemy home cannot be removed. Mine & prepare, and it is home checkmate.',
      board: [
        '.  .  F1 .  .',
        '.  .  .  .  .',
        '.  w1 .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['c1-e5', 'mine'],
    },
    {
      id: 'invade-2',
      idea: 'Arrival is not winning: the Sjór steps to the door and burns the Hi (2 + 1 = 3), but it only scratches a Muju (2 - 1 = 1). Pick the invader it cannot hurt.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  F1 .  P1',
        '.  .  .  .  .',
        '.  .  w1 .  .',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['e3-e5', 'mine'],
      tries: [['c3-e5', 'mine', 'end']],
    },
    {
      id: 'invade-3',
      idea: 'A corner has two doors: the Karanlık kills anything it can touch, but it needs two actions to reach a door\'s neighbor. With both doors plugged it must kill a plug and step in, and runs out of actions.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        's3 .  .  .  P1',
        '.  .  F1 .  .',
        '.  .  P1 .  .',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['c4-e5', 'c5-d5', 'e3-e4', 'mine'],
      tries: [['c4-e5', 'c5-d5', 'mine', 'end'], ['c4-e5', 'e3-e4', 'mine', 'end'], ['c4-e5', 'mine', 'end']],
    },
    {
      id: 'invade-4',
      idea: 'Clear the home: a piece on it keeps you out. The Hi breaks the door (2 + 1 = 3 against a Muju), Cleave gives it a second blow for the Muju on the home, and the last action steps in. The other Muju cannot hurt a Hi.',
      board: [
        '.  .  .  m1',
        '.  .  .  .',
        '.  .  F1 p1',
        '.  .  p1 p1',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['c3xd3', 'c3-d3xd4', 'd3-d4', 'mine'],
      tries: [['c3xd3', 'c3xc4', 'c3-d3xd4', 'mine', 'end']],
    },
    {
      id: 'invade-5',
      idea: 'Remove the rescuer first: the enemy Hi beside the door would burn a Muju on the home (2 + 1 = 3), so the Hi captures it, then the Muju walks in. The Sjór only scratches a Muju (2 - 1 = 1) but would burn the Hi (2 + 1 = 3), so the Hi is the remover, not the invader.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  F1 .  f1',
        '.  w1 .  .  .',
        '.  .  P1 .  .',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['c3-d3xe3', 'c5-e5', 'mine'],
      tries: [['c5-e5', 'mine', 'end'], ['c3-e5', 'mine', 'end'], ['c3-d3xe3', 'd3-e5', 'mine', 'end']],
    },
    {
      id: 'invade-6',
      idea: 'Survive your own upkeep: nothing here can remove the Irumbu (3 + 1 = 4 against DEF 5), but its rent is 2 and the bank is empty. The Muju must stand on the 2 when you press Mine & prepare, or the Irumbu leaves before the checkmate is judged. (The Sjór stands one action too far for the Irumbu to sweep both enemies and win by elimination instead.)',
      board: [
        '.  .  .  .  .',
        'P1 .  .  .  w1',
        '.  .  M3 .  .',
        '2  .  .  .  .',
        '.  .  f1 .  .',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['c3-e5', 'a2-a4', 'mine'],
      tries: [['c3-e5', 'mine'], ['c3-c4xc5', 'c4-e5', 'mine']],
    },
    {
      id: 'invade-7',
      idea: 'The home square\'s crystal pays the invader\'s rent: the Honō mines 1 on the home, so the Sjór is free to plug the door the Straumr would use. Sending the Sjór to the 2 for rent (the old way) leaves the door open. The Poṉ kills a Sjór on the home (1 + 1 = 2) but does 0 to the Honō.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  F2 .  2  .',
        '.  .  .  W1 m1',
        'w2 .  .  .  1',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['b3-e5', 'd4-d5', 'mine'],
      tries: [['b3-e5', 'd4-d3', 'mine', 'end'], ['b3-e5', 'mine', 'end'], ['d4-e5', 'mine', 'end']],
    },
    {
      id: 'invade-8',
      idea: 'Fortify in Prepare: the Honō does 3 - 1 = 2 to a Sjór (DEF 2) but not to a Straumr (DEF 3). Checkmate is judged again after every Prepare action, so walk in, mine, and promote. One plug is not enough: the Honō reaches the other door.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  W1',
        '.  .  P1 .  .',
        'f2 .  .  .  .',
      ],
      homes: true,
      banks: { white: 4 },
      goal: { kind: 'home' },
      solution: ['e3-e5', 'mine', '^e5'],
      tries: [['e3-e5', 'mine', 'end'], ['e3-e5', 'c4-d5', 'mine', 'end']],
    },
    {
      id: 'invade-9',
      idea: 'Two turns: approach without being caught, then invade. The Loş and the Sjór remove each other in one hit (2 against DEF 2), and the Sjór reaches four squares (three steps and a hit). Stop exactly five squares away: one closer and it strikes first, one farther and you cannot reach a door, strike and step in next turn. The edge squares sit beside a Poṉ (1 + 1 = 2).',
      board: [
        'S1 .  .  .  m1',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        'm1 .  .  .  w1',
      ],
      homes: true,
      turns: 2,
      goal: { kind: 'home' },
      solution: ['a1-c2', 'mine', 'end'],
      tries: [['a1-c3', 'mine', 'end'], ['a1-d1', 'mine', 'end'], ['a1-b2', 'mine', 'end']],
    },
    {
      id: 'invade-10',
      idea: 'Conclusion: clear, pay, fortify. The Honō captures the Hi (Cleave), steps into the door, captures the Muju on the home and steps in. The home\'s crystal pays the Honō\'s rent, so the bank of 8 is still whole for the Kagari: DEF 2 holds against the Radi\'s 1.',
      board: [
        '.  .  .  .  l1',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  F2 f1 p1+1',
      ],
      homes: true,
      banks: { white: 8 },
      goal: { kind: 'home' },
      solution: ['c5xd5', 'c5-d5xe5', 'd5-e5', 'mine', '^e5'],
      tries: [['c5xd5', 'c5-d5xe5', 'd5-e5', 'mine', 'end'], ['c5-e4xe5', 'e4-e5', 'mine', '^e5', 'end']],
    },
  ],
};
