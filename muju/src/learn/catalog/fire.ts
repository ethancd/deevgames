import type { Arc } from '../types';

/**
 * Fire: the rush element. ATK 2 / 3 / 4, DEF 1 / 1 / 2, Speed 2 / 2 / 3, and
 * Mining 1 at every tier. It breaks Plant and Metal (+1), loses a point against
 * Water and Shadow, and dies to almost anything, so its tactic is hit and run.
 *
 * Banks: a tier-2 or tier-3 piece owes rent at its owner's upkeep, which the
 * course teaches later. In the two reply puzzles the banks hold exactly that
 * rent, for both sides, so upkeep never decides the outcome.
 */
export const ARC: Arc = {
  id: 'fire', title: 'Fire', part: 'elements', icon: 'fire',
  puzzles: [
    {
      id: 'fire-1', idea: 'Fire breaks Plant and Metal: a Hi’s 2 + 1 = 3 removes a Muju and a Poṉ, and each kill opens the next attack.',
      board: [
        'F1 .  .',
        '.  .  p1',
        '.  m1 .',
      ],
      goal: { kind: 'capture', targets: ['c2', 'b3'] },
      solution: ['a1-b2xc2', 'b2xb3'],
    },
    {
      id: 'fire-2', idea: 'Meet all three tiers, and Fire’s one weak stat: Hi, Honō and Kagari all mine 1, so the Kagari on the 8 takes 1, the same as on a 1. Three pieces need three squares; the walk to the far 8 costs three actions and leaves a piece off the crystals.',
      board: [
        '.  .  .  .  8',
        '.  .  .  .  .',
        'F1 .  .  .  .',
        '1  .  1  .  .',
        'F3 1  F2 .  .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['a3-a4', 'a5-b5', 'c5-c4', 'mine'],
      tries: [['a5-e1', 'a3-a4', 'mine'], ['a5-e1', 'c5-c4', 'mine']],
    },
    {
      id: 'fire-3', idea: 'Only a Kagari one-shots an Irumbu (4 + 1 = 5), so each kill opens the next attack; its Speed 3 carries it between them. The Honō only chips one (4 of 5).',
      board: [
        '.  .  .  .  F3',
        '.  .  .  .  .',
        '.  .  m3 F2 .',
        'm3 .  .  .  .',
        '.  .  .  .  .',
      ],
      goal: { kind: 'capture', targets: ['c3', 'a4'] },
      solution: ['e1-c2xc3', 'c2-a3xa4'],
      tries: [['d3xc3', 'e1-c2xc3']],
    },
    {
      id: 'fire-4', idea: 'Each tier breaks its own wall: the Hi takes the Muju (3), the Honō the Loş (3 − 1 = 2 against Shadow’s DEF 2), the Kagari the Irumbu (5). The Kagari needs the fourth action to arrive, so every blow must kill: the Hi only chips the Loş, the Honō only chips the Irumbu.',
      board: [
        'p1 F1 s1 .',
        '.  .  F2 m3',
        '.  .  .  .',
        '.  F3 .  .',
      ],
      goal: { kind: 'capture', targets: ['a1', 'c1', 'd2'] },
      solution: ['b4-d3xd2', 'b1xa1', 'c2xc1'],
      tries: [['b1xc1', 'c2xd2', 'b4-d3xd2'], ['c2xd2', 'b4-d3xd2', 'b1xa1']],
    },
    {
      id: 'fire-5', idea: 'Fire is fragile: even a Sach’akuna burns a Hi (2 − 1 = 1 against DEF 1), and the Hi cannot hurt it back (3 against 4). Strike the Muju, then run out of reach. Black’s 2 crystals pay the Sach’akuna’s rent, so the reply ends normally instead of in an upkeep wipe-out.',
      board: [
        '.  .  .  .  .',
        '.  .  .  F1 .',
        '.  .  .  .  .',
        '.  p1 .  .  .',
        'p3 .  .  .  .',
      ],
      banks: { black: 2 },
      goal: { kind: 'all', goals: [{ kind: 'capture', targets: ['b4'] }, { kind: 'survive' }] },
      solution: ['d2-b3xb4', 'b3-c2', 'mine', 'end'],
      tries: [['d2-b3xb4', 'mine', 'end'], ['d2-c4xb4', 'mine', 'end']],
    },
    {
      id: 'fire-6', idea: 'Conclusion: the Irumbu is boxed in by its own Poṉ and Sjór, and the Sjór would burn the Hi beside it (2 + 1 against DEF 1), which can only chip it. The Kagari runs three squares in one action, puts out the Sjór (4 − 1 = 3), steps into the opened door and one-shots the Irumbu. Breaking the Poṉ door instead leaves the Sjór alive; the Hi’s chip or its escape costs the action the Kagari needs. White’s 2 crystals pay the Kagari’s rent; Black’s 2 keep a surviving Irumbu from leaving at upkeep (which would count as captured).',
      board: [
        '.  .  .  .',
        '.  .  .  F1',
        '.  .  .  w1',
        'F3 .  m1 m3',
      ],
      banks: { white: 2, black: 2 },
      goal: { kind: 'all', goals: [{ kind: 'capture', targets: ['d4'] }, { kind: 'survive' }] },
      solution: ['a4-c3xd3', 'c3-d3xd4', 'mine', 'end'],
      tries: [['a4-b4xc4', 'b4-c4xd4', 'mine', 'end'], ['d2xd3', 'a4-c3xd3', 'c3-d3', 'mine', 'end'], ['d2-b1', 'a4-c3xd3', 'mine', 'end']],
    },
  ],
};
