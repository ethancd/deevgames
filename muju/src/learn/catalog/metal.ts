import type { Arc } from '../types';

/**
 * Metal: the wall. ATK 1 / 1 / 2, DEF 3 / 4 / 5, Speed 0 / 1 / 2, Mining
 * 3 / 4 / 5. It beats Water and Shadow (+1); tiers 1 and 2 do nothing to Fire
 * and Lightning (1 − 1 = 0). The Poṉ cannot move but strikes and mines where
 * it stands. Its tactic is the opposite of Fire's: hit and stand.
 *
 * Banks: metal-5 and metal-6 hold exactly the rent of the tier-2 and tier-3
 * pieces on both sides, so upkeep (taught later) never decides the outcome.
 */
export const ARC: Arc = {
  id: 'metal', title: 'Metal', part: 'elements', icon: 'metal',
  puzzles: [
    {
      id: 'metal-1', idea: 'The Poṉ cannot move, but it strikes beside itself: Metal beats Water and Shadow, so its 1 + 1 = 2 removes the Sjór, and the kill opens its next attack on the Loş.',
      board: [
        '.  w1 .',
        '.  M1 s1',
        '.  .  .',
      ],
      goal: { kind: 'capture', targets: ['b1', 'c2'] },
      solution: ['b2xb1', 'b2xc2'],
    },
    {
      id: 'metal-2', idea: 'Meet the Veḷḷi and the Irumbu. The Veḷḷi hits like the Poṉ (1 + 1 = 2): enough for the Sjór, not for the Straumr (DEF 3). Only the Irumbu hits for 2 + 1 = 3, and its Speed 2 brings it over in two actions. The Veḷḷi’s blow on the Straumr, or the Irumbu’s trip to the Sjór, leaves the other wall standing.',
      board: [
        '.  .  .  w1',
        '.  .  .  M2',
        '.  .  .  w2',
        'M3 .  .  .',
      ],
      goal: { kind: 'capture', targets: ['d1', 'd3'] },
      solution: ['d2xd1', 'a4-c3xd3'],
      tries: [['d2xd3', 'a4-c3xd3'], ['a4-c1xd1']],
    },
    {
      id: 'metal-3', idea: 'Metal mines 3 / 4 / 5 by tier. The Poṉ mines where it stands; the Veḷḷi steps back onto the 4, although the 5 is right beside it, so the Irumbu can run six squares (Speed 2) to the 5: 3 + 4 + 5 = 12. The Veḷḷi on the 5 takes only 4.',
      board: [
        '.  4  M2 5',
        '.  .  .  .',
        '.  .  .  .',
        'M3 .  .  M1+3',
      ],
      goal: { kind: 'mine', atLeast: 12 },
      solution: ['c1-b1', 'a4-d1', 'mine'],
      tries: [['c1-d1', 'a4-b1', 'mine']],
    },
    {
      id: 'metal-4', idea: 'Tiers 1 and 2 do nothing to Fire and Lightning (1 − 1 = 0): the Poṉ and the Veḷḷi stand beside the targets in vain. The Irumbu’s 2 − 1 = 1 is enough for any DEF-1 piece, so it takes the Radi, walks, and takes the Honō.',
      board: [
        '.  M1 .  .',
        '.  l1 .  .',
        'M3 .  .  .',
        '.  .  f2 M2',
      ],
      goal: { kind: 'capture', targets: ['b2', 'c4'] },
      solution: ['a3-b3xb2', 'b3-c3xc4'],
      tries: [['b1xb2'], ['d4xc4']],
    },
    {
      id: 'metal-5', idea: 'Hit and stand: both Metal pieces beat the Sjór, but only the Irumbu (DEF 5) can stay inside the Honō’s reach afterward (3 + 1 = 4). The nearer Veḷḷi (DEF 4) would fall, and its trip leaves no action to run back. Killing the Honō instead leaves the Sjór.',
      board: [
        'M2 .  .  .  M3',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  w1 .  .  .',
        '.  .  .  .  f2',
      ],
      banks: { white: 3, black: 1 },
      goal: { kind: 'all', goals: [{ kind: 'capture', targets: ['b4'] }, { kind: 'survive' }] },
      solution: ['e1-c4xb4', 'mine', 'end'],
      tries: [['a1-b3xb4', 'mine', 'end'], ['e1-e4xe5', 'mine', 'end']],
    },
    {
      id: 'metal-6', idea: 'Conclusion: it takes two to break an Irumbu. On the 5 it shrugs off the Honō alone (4 of 5), but the Radi joins in (2 + 4 = 6), so the Irumbu kills the Radi first (2 − 1 = 1) and then takes the 5. The Poṉ beside the Radi does 0 and mines where it stands: 3 + 5 = 8.',
      board: [
        '.  .  .  .  M1+3',
        '.  .  .  .  l1',
        '.  .  .  M3 .',
        '.  .  5  .  .',
        'f2 .  .  .  .',
      ],
      banks: { black: 1 },
      goal: { kind: 'all', goals: [{ kind: 'mine', atLeast: 8 }, { kind: 'survive' }] },
      solution: ['d3-e3xe2', 'e3-c4', 'mine', 'end'],
      tries: [['d3-c4', 'mine', 'end'], ['e1xe2', 'd3-e3xe2', 'mine', 'end']],
    },
  ],
};
