import type { Arc } from '../types';

/**
 * Safety: the "out of check" arc. Every goal is judged after the enemy's best
 * reply. A danger is the enemy's trip plus its hit, paid from the same four
 * actions: a Speed-1 piece walks three squares and hits with the fourth, so a
 * square five away is safe (the Missing Fifth).
 *
 * The slow tank here is a Straumr (Speed 1, DEF 3): no two of your pieces can
 * remove it in one turn, so it must be dodged. Black banks exactly its rent
 * (1), or it would vanish at Black's own upkeep and end the game.
 */
export const ARC: Arc = {
  id: 'safety', title: 'Safety', part: 'combat', icon: 'safety',
  puzzles: [
    {
      id: 'safety-1',
      idea: 'Step out of reach: the slow Sjór can reach almost the whole board this turn; only the squares by the far corner are out of reach.',
      board: [
        '.  .  .  .',
        '.  .  .  .',
        '.  .  F1 .',
        '.  .  .  w1',
      ],
      goal: { kind: 'survive' },
      solution: ['c3-a1', 'mine', 'end'],
      tries: [['mine', 'end'], ['c3-c1', 'mine', 'end']],
    },
    {
      id: 'safety-2',
      idea: 'Count the trip plus the hit: the far Hi is four squares away, which the Straumr can walk three of and hit (the Missing Fifth). The Sjór needs exactly three steps, the Hi exactly one.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  W1 .',
        'F1 .  .  .  w2',
      ],
      banks: { black: 1 },
      goal: { kind: 'survive' },
      solution: ['d4-d1', 'a5-a3', 'mine', 'end'],
      tries: [
        ['d4-a3', 'mine', 'end'],
        ['d4-d2', 'a5-a3', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
    {
      id: 'safety-3',
      idea: 'Edges and corners: three Loş hit a Muju for 1 each, but a corner has only two neighbor squares, so only two can reach it.',
      board: [
        '.  P1 s1',
        '.  s1 .',
        's1 .  .',
      ],
      goal: { kind: 'survive' },
      solution: ['b1-a1', 'mine', 'end'],
      tries: [
        ['mine', 'end'],
        ['b1-a2', 'mine', 'end'],
      ],
    },
    {
      id: 'safety-4',
      idea: 'A friend in the hallway is a wall: the Hi is boxed in by its Poṉ, so the Muju steps into the only corridor. Hiding in the one-door corner alone fails.',
      board: [
        '.  M1 .  F1',
        '.  .  M1 .',
        '.  .  P1 .',
        '.  .  .  w2',
      ],
      banks: { black: 1 },
      goal: { kind: 'survive', pieces: ['d1'] },
      solution: ['c3-d3', 'mine', 'end'],
      tries: [
        ['d1-c1', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
    {
      id: 'safety-5',
      idea: 'The best defense is capturing the threat: no square is out of the fast Radi’s reach, but the Hi can spend all four actions removing it. The Poṉ keeps the game going and is the wrong capture.',
      board: [
        '.  F1 .  .  m1',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  l1 .',
      ],
      goal: { kind: 'survive' },
      solution: ['b1-c5xd5', 'mine', 'end'],
      tries: [
        ['b1-a3', 'mine', 'end'],
        ['b1-d1xe1', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
    {
      id: 'safety-6',
      idea: 'Two threats: remove the one you cannot outrun (the Radi), dodge the one you cannot remove (the Straumr).',
      board: [
        '.  .  l1 F1',
        '.  .  .  .',
        '.  W1 .  .',
        'w2 .  .  .',
      ],
      banks: { black: 1 },
      goal: { kind: 'survive' },
      solution: ['d1xc1', 'b3-d2', 'mine', 'end'],
      tries: [
        ['d1xc1', 'mine', 'end'],
        ['b3-d2', 'mine', 'end'],
        ['d1xc1', 'b3-c2', 'mine', 'end'],
        ['b3-b4xa4', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
    {
      id: 'safety-7',
      idea: 'Hit and run: an attack does not end a piece\'s turn, so capture the Radi beside the Sjór, then spend the last action getting five squares away from the Sjór.',
      board: [
        'F1 .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  l1 .  .',
        '.  .  .  w1 .',
      ],
      goal: { kind: 'all', goals: [{ kind: 'capture', targets: ['c4'] }, { kind: 'survive' }] },
      solution: ['a1-b4xc4', 'b4-a3', 'mine', 'end'],
      tries: [
        ['a1-b4xc4', 'mine', 'end'],
        ['a1-c3xc4', 'mine', 'end'],
      ],
    },
    {
      id: 'safety-8',
      idea: 'Save the valuable piece: nothing keeps both safe. The Sjór can run, but then the Hi takes the Muju; the Sjór captures the Hi and is lost to the Straumr instead.',
      board: [
        'P1 .  .  .',
        '.  .  .  .',
        '.  f1 .  .',
        '.  .  W1 w2',
      ],
      banks: { black: 1 },
      goal: { kind: 'survive', pieces: ['a1'] },
      solution: ['c4-c3xb3', 'mine', 'end'],
      tries: [
        ['c4-a2', 'mine', 'end'],
        ['c4-b1', 'mine', 'end'],
        ['c4xd4', 'mine', 'end'],
        ['mine', 'end'],
      ],
    },
  ],
};
