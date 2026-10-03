import type { Arc } from '../types';

/**
 * Shadow: Fire's dark twin. ATK 2 / 3 / 4 like Fire, but DEF 2 at every tier,
 * Speed 2 / 2 / 3 and Mining 0 / 1 / 2. It beats Fire and Lightning (+1) and
 * loses a point against Plant and Metal, which also hit it +1: a Poṉ kills a
 * Karanlık.
 *
 * Banks: in the reply puzzles each side holds exactly the rent of its tier-2
 * and tier-3 pieces, so an enemy never vanishes at its own upkeep, and a wrong
 * line that mines short never opens the keep panel before Upkeep is taught.
 */
export const ARC: Arc = {
  id: 'shadow', title: 'Shadow', part: 'elements', icon: 'shadow',
  puzzles: [
    {
      id: 'shadow-1', idea: 'Shadow puts out Fire: a tier-1 Loş runs 2 squares per action and hits the tier-3 Kagari for 2 + 1 = 3, enough for its DEF 2.',
      board: [
        '.  .  .  f3',
        '.  .  .  .',
        '.  .  .  .',
        'S1 .  .  .',
      ],
      goal: { kind: 'capture', targets: ['d1'] },
      solution: ['a4-c1xd1'],
    },
    {
      id: 'shadow-2', idea: 'The Karanlık hits so hard that Plant’s and Metal’s −1 still leaves 4 − 1 = 3, enough to break the Muju or the Poṉ walling in the Kimbunga; the kill opens its next attack. The Gölge beside the Muju only chips it (3 − 1 = 2).',
      board: [
        '.  .  .  .',
        '.  S3 .  S2',
        '.  .  .  p1',
        '.  .  m1 l3',
      ],
      goal: { kind: 'capture', targets: ['d4'] },
      solution: ['b2-c3xd3', 'c3-d3xd4'],
      tries: [['d2xd3', 'b2-c3xd3', 'c3-d3']],
    },
    {
      id: 'shadow-3', idea: 'Loş mines nothing (Mining 0), the Gölge 1, the Karanlık 2. The Loş must step off the 2 so the Karanlık can stand on it; the Gölge takes the 1.',
      board: [
        '.  .    .  S3',
        '.  .    .  .',
        '.  S1+2 .  .',
        '1  .    S2 .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['b3-b2', 'd1-b3', 'c4-a4', 'mine'],
      tries: [['mine'], ['b3-b2', 'c4-b3', 'd1-a4', 'mine']],
    },
    {
      id: 'shadow-4', idea: 'Lightning does −1 to Shadow: the Umeme beside the Loş only wounds it (2 − 1 = 1 against DEF 2), but the Kimbunga (3 − 1 = 2) kills it, and at Speed 5 it reaches every square. The Loş must run five squares to the Kimbunga and strike it (2 + 1 = 3); taking the Umeme first leaves no action for the hit. Black’s 3 crystals pay its rent.',
      board: [
        '.  .  .  S1',
        '.  .  .  l2',
        '.  .  .  .',
        'l3 .  .  .',
      ],
      banks: { black: 3 },
      goal: { kind: 'survive' },
      solution: ['d1-b4xa4', 'mine', 'end'],
      tries: [['d1xd2', 'd1-b4', 'mine', 'end'], ['d1xd2', 'd1-d4', 'mine', 'end']],
    },
    {
      id: 'shadow-5', idea: 'DEF 2 at every tier: a tier-1 Poṉ does 1 + 1 = 2 and removes the tier-3 Karanlık parked beside it. Strike first: the Karanlık’s 4 − 1 = 3 removes the Poṉ, then it mines. The far Poṉ keeps the game going.',
      board: [
        '.  m1 .  .  m1',
        '.  2  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  S3 .',
      ],
      banks: { white: 2 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 2 }, { kind: 'survive' }] },
      solution: ['d5-b2xb1', 'mine', 'end'],
      tries: [['d5-b2', 'mine', 'end']],
    },
    {
      id: 'shadow-6', idea: 'Conclusion: every Shadow tier has its job. The Loş mines nothing, so it takes the Kagari (2 + 1 = 3) and the Gölge mines the 1; the Karanlık strikes the Poṉ first (4 − 1 = 3) and mines the 2. The far Poṉ keeps the game going; Black’s 2 crystals pay a surviving Kagari’s rent.',
      board: [
        '.  .  .  S1 f3',
        '.  .  .  1  S2',
        '.  .  .  .  .',
        'm1 2  .  S3 .',
        '.  .  .  .  m1',
      ],
      banks: { white: 3, black: 2 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 3 }, { kind: 'survive' }] },
      solution: ['d1xe1', 'e2-d2', 'd4-b4xa4', 'mine', 'end'],
      tries: [['e2xe1', 'd1-d2', 'd4-b4xa4', 'mine'], ['d1xe1', 'e2-d2', 'd4-b4', 'mine', 'end'], ['d4-b4xa4', 'e2-d2', 'mine', 'end']],
    },
  ],
};
