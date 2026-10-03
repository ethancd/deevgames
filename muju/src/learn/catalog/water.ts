import type { Arc } from '../types';

/**
 * Water: the balanced element. ATK 2 / 2 / 3, DEF 2 / 3 / 4, Speed 1 / 1 / 2,
 * Mining 2 / 2 / 3. It puts out Fire and Lightning (+1), is even against Water
 * and Shadow, and loses a point against Plant and Metal, which also hit it +1.
 * Slow and steady: it mines where lighter pieces would sink.
 *
 * Rent: the Straumr owes 1 and the Ægirinn 2 at upkeep, which the course
 * teaches later. In the reply puzzles here White banks exactly that rent, so a
 * wrong line that mines short never opens the keep panel or loses a piece to
 * a rule the player has not met; the winning lines pay it from mining anyway.
 */
export const ARC: Arc = {
  id: 'water', title: 'Water', part: 'elements', icon: 'water',
  puzzles: [
    {
      id: 'water-1', idea: 'Water puts out Fire and Lightning: a tier-1 Sjór hits for 2 + 1 = 3, enough for a Kagari (DEF 2), and each kill opens its next attack on the Kimbunga.',
      board: [
        '.  f3 .',
        '.  W1 l3',
        '.  .  .',
      ],
      goal: { kind: 'capture', targets: ['b1', 'c2'] },
      solution: ['b2xb1', 'b2xc2'],
    },
    {
      id: 'water-2', idea: 'Fire is weak against Water: each Hi does 2 − 1 = 1. Two Hi still sink a Sjór (DEF 2) but not a Straumr (DEF 3), so the slow Straumr spends all four actions to mine in their crossfire, not the nearer Sjór. Its 2 crystals also pay its rent.',
      board: [
        'W2 .  .  .',
        '.  .  .  f1',
        'W1 .  2  .',
        '.  .  .  f1',
      ],
      banks: { white: 1 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 2 }, { kind: 'survive' }] },
      solution: ['a1-c3', 'mine', 'end'],
      tries: [['a3-c3', 'mine', 'end']],
    },
    {
      id: 'water-3', idea: 'Water against Water is even: the Sjór does 2 to a Straumr (DEF 3) and its chain closes. The Ægirinn (ATK 3, Speed 2) breaks the Straumr wall, and the kill lets it step through and put out the Hi.',
      board: [
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  W3 .  .',
        '.  .  .  .  w2',
        '.  W1 .  w2 f1',
      ],
      goal: { kind: 'capture', targets: ['e5'] },
      solution: ['c3-c5xd5', 'c5-d5xe5'],
      tries: [['b5-c5xd5']],
    },
    {
      id: 'water-4', idea: 'Plant beats Water, so a Plant wall does not break: even the Ægirinn does only 3 − 1 = 2 to a Muju (DEF 3), and the near door stays shut. The far door takes every action of its Speed 2.',
      board: [
        '.  .  p1 l2',
        '.  .  .  .',
        '.  .  .  .',
        'W3 .  .  .',
      ],
      goal: { kind: 'capture', targets: ['d1'] },
      solution: ['a4-d2xd1'],
      tries: [['a4-b1xc1'], ['a4-c2xc1']],
    },
    {
      id: 'water-5', idea: 'Metal beats Water: the Poṉ (ATK 1, Speed 0) does 1 + 1 = 2 and sinks a Sjór, while the Hi does only 2 − 1 = 1. The Sjór puts out the Radi from beside the Hi, not from beside the Poṉ.',
      board: [
        'W1 .  .  .',
        '.  .  .  f1',
        'm1 .  l1 .',
        '.  .  .  .',
      ],
      goal: { kind: 'all', goals: [{ kind: 'capture', targets: ['c3'] }, { kind: 'survive' }] },
      solution: ['a1-c2xc3', 'mine', 'end'],
      tries: [['a1-b3xc3', 'mine', 'end']],
    },
    {
      id: 'water-6', idea: 'Conclusion: each tier mines where it can survive. The Ægirinn (DEF 4) takes the 3 beside the Poṉ (2 + 1 = 3 with the Hi); the Sjór walks past the 2 beside the Poṉ to the corner; the Straumr steps down. Mining 3 + 2 + 2 also pays the rent.',
      board: [
        '2  3  .  W3 .',
        '2  m1 .  .  .',
        'W1 .  .  .  f1',
        'W2 .  .  .  .',
        '2  .  .  .  .',
      ],
      banks: { white: 3 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 7 }, { kind: 'survive' }] },
      solution: ['d1-b1', 'a3-a1', 'a4-a5', 'mine', 'end'],
      tries: [['d1-b1', 'a3-a2', 'a4-a5', 'mine', 'end']],
    },
  ],
};
