import type { Arc } from '../types';

/**
 * Elimination: a player with no pieces on the board loses, and the capture that
 * empties the board wins at once, mid-turn. Nothing after it happens: no
 * mining, no upkeep, no reply, no arrivals. The goal line never rings targets,
 * so the player has to count the enemy, and with four actions each enemy piece
 * costs at least one of them.
 *
 * Homes are hidden in this arc. With them shown, a stray walk into the enemy
 * home would win the game by `#` while the eliminate goal marked the puzzle
 * failed, and a pending summon needs no visible home to be read.
 */
export const ARC: Arc = {
  id: 'eliminate', title: 'Elimination', part: 'winning', icon: 'eliminate',
  puzzles: [
    {
      id: 'eliminate-1',
      idea: 'The last capture wins at once: the lone Poṉ that kept earlier puzzles going is Black\'s last piece. The Hi (2 + 1 = 3) walks over and removes it, and the game ends mid-turn with actions to spare.',
      board: [
        '.  .  .  .',
        '.  F1 .  .',
        '.  .  .  m1',
        '.  .  .  .',
      ],
      goal: { kind: 'eliminate' },
      solution: ['b2-c3xd3'],
    },
    {
      id: 'eliminate-2',
      idea: 'Two left, and Cleave sweeps them: only the Honō can remove the Sjór (3 − 1 = 2), so it kills the Muju, walks two actions and kills again. The Hi\'s chip on the Sjór (2 − 1 = 1) spends the action the Honō needs.',
      board: [
        '.  .  .  .  .',
        'p1 F2 .  .  .',
        '.  .  .  .  w1',
        '.  .  .  .  F1',
        '.  .  .  .  .',
      ],
      goal: { kind: 'eliminate' },
      solution: ['b2xa2', 'b2-d3xe3'],
      tries: [['e4xe3', 'b2xa2'], ['b2-d3xe3']],
    },
    {
      id: 'eliminate-3',
      idea: 'A sweep through a blocker: the Poṉ in the doorway counts too. The Honō kills it, steps into its square and takes the Muju and the Loş from there; walking around to the Loş first leaves one piece standing.',
      board: [
        '.  .  .  .',
        '.  .  .  .',
        '.  .  s1 .',
        '.  p1 m1 F2',
      ],
      goal: { kind: 'eliminate' },
      solution: ['d4xc4', 'd4-c4xb4', 'c4xc3'],
      tries: [['d4-d3xc3'], ['d4xc4', 'd4-d3xc3']],
    },
    {
      id: 'eliminate-4',
      idea: 'Count the enemy and assign attackers: four pieces and four actions, so nobody can walk and every blow must kill, which means one piece must kill twice. Only the Poṉ reaches the Loş (2), only the Hi kills the Muju (3), only the Sjór kills the Hi (3); the enemy Sjór falls to the Sjór or the Poṉ after its first kill. The Hi on the Sjór (1), the Poṉ on the Hi (0) and the Sjór on the Muju (1) each close a chain that was needed.',
      board: [
        '.  f1 W1 p1',
        '.  M1 w1 F1',
        '.  s1 .  .',
        '.  .  .  .',
      ],
      goal: { kind: 'eliminate' },
      solution: ['b2xb3', 'c1xb1', 'c1xc2', 'd2xd1'],
      tries: [['d2xc2'], ['b2xb1'], ['c1xd1']],
    },
    {
      id: 'eliminate-5',
      idea: 'Twist, mid-turn: three actions left, exactly the Honō\'s step plus two blows. Black\'s pending Sjór is not a piece (no queue exception), and the last capture wins at once, so it never lands. Stepping the Muju onto its square to block it spends the action the second blow needs.',
      board: [
        '.  F2 s1 .',
        '.  .  .  P1',
        '.  .  f1 .',
        '.  .  .  .',
      ],
      actions: 3,
      banks: { white: 1 },
      pending: [{ at: 'd3', type: 'W1', owner: 'black' }],
      goal: { kind: 'eliminate' },
      solution: ['b1-c2xc1', 'c2xc3'],
      tries: [['d2-d3', 'b1-c2xc1'], ['b1-b3xc3']],
    },
    {
      id: 'eliminate-6',
      idea: 'Conclusion over two turns: the Poṉs cannot move, so they can wait; the fast Radi kills a Honō (1 against DEF 1) wherever it stands. Remove the Radi first and end on the crystal to pay the Honō\'s rent of 1, then walk back and sweep both Poṉs with all four actions. The Cleave sweep of the Poṉs now loses the Honō to the Radi; forgetting the rent loses it at upkeep.',
      board: [
        '.  .  .  .  .',
        '.  .  .  l1 .',
        '.  .  .  .  1',
        'm1 F2 .  .  .',
        '.  m1 .  .  .',
      ],
      turns: 2,
      goal: { kind: 'eliminate' },
      solution: ['b4-d3xd2', 'd3-e3', 'mine', 'end'],
      tries: [
        ['b4xa4', 'b4xb5', 'b4-e3', 'mine', 'end'],
        ['b4-d3xd2', 'd3-b3', 'mine', 'keep'],
      ],
    },
  ],
};
