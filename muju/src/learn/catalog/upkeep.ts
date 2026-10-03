import type { Arc } from '../types';

/**
 * Upkeep: rent is paid right after mining, 1 for each tier-2 piece and 2 for
 * each tier-3 piece; tier 1 is free. Most goals are "Keep the X this turn",
 * judged after upkeep. Those boards have no enemy piece, so the game ends at
 * Mine & prepare (as in the Mining arc) once upkeep is settled. A resting piece
 * (`~`, mid-turn) has already acted, so the others must earn its rent. Bank and
 * promotion goals need Prepare, so they keep a Black piece: in upkeep-5 nothing
 * can capture it (a capture would end the game with the bank still full); in
 * upkeep-6 it sits inside the Hi's rectangle so no summon is for sale.
 */
export const ARC: Arc = {
  id: 'upkeep', title: 'Upkeep', part: 'economy', icon: 'upkeep',
  puzzles: [
    {
      id: 'upkeep-1', idea: 'A Honō\'s rent is 1, paid right after mining. The bank is empty and the Honō has already acted, so the Muju steps onto the crystal before Mine & prepare, or the Honō leaves at upkeep.',
      board: [
        '.  .   .',
        '.  F2~ .',
        'P1 1   .',
      ],
      homes: true,
      actions: 3,
      goal: { kind: 'keep', pieces: ['b2'] },
      solution: ['a3-b3', 'mine'],
    },
    {
      id: 'upkeep-2', idea: 'Tier 3 rent is 2: the near 1 would keep a Honō but not the Kagari, so the Muju spends all three actions walking to the 2.',
      board: [
        '.   P1  1',
        '.   .   .',
        'F3~ .   2',
      ],
      homes: true,
      actions: 3,
      goal: { kind: 'keep', pieces: ['a3'] },
      solution: ['b1-c3', 'mine'],
      tries: [['b1-c1', 'mine']],
    },
    {
      id: 'upkeep-3', idea: 'Rent adds up, and every piece mines: the Kagari and the Honō owe 2 + 1 = 3, and the Muju\'s best square holds only 2. One Fire piece steps onto the 1 and pays the rest (Fire mines 1). The Muju alone, or a Fire piece alone, leaves one of them unpaid.',
      board: [
        '.  .  .  .',
        'F3 .  P1 .',
        '.  .  .  2',
        'F2 1  .  .',
      ],
      homes: true,
      goal: { kind: 'keep', pieces: ['a2', 'a4'] },
      solution: ['c2-d3', 'a4-b4', 'mine'],
      tries: [['c2-d3', 'mine'], ['a4-b4', 'mine'], ['a2-b4', 'mine']],
    },
    {
      id: 'upkeep-4', idea: 'Short on crystals, you choose what to keep. Lightning mines nothing, so the Muju\'s 2 is all there is, against rent of 2 + 1 + 1. Unticking the Kimbunga is the quick fix; keeping it means letting both Umeme go. The Muju is tier 1: always kept, never charged.',
      board: [
        'L2 .  L2',
        '.  P1 .',
        'L3 2  .',
      ],
      homes: true,
      goal: { kind: 'keep', pieces: ['a3'] },
      solution: ['b2-b3', 'mine', 'keep a3 b3'],
      tries: [['b2-b3', 'mine', 'keep a1 c1 b3'], ['a3-b3', 'mine']],
    },
    {
      id: 'upkeep-5', idea: 'Rent comes out of the bank: it already holds 4, but ending the turn pays the Karanlık\'s 2 from it. The free Radi stands on the 2 and mines nothing (Mining 0), so it steps aside for the Muju.',
      board: [
        '.   .   .     .',
        '.   P1  L1+2  .',
        'S3~ .   .     .',
        '.   .   .     m1',
      ],
      homes: true,
      actions: 3,
      banks: { white: 4 },
      goal: { kind: 'bank', atLeast: 4 },
      solution: ['c2-c1', 'b2-c2', 'mine', 'end'],
      tries: [['mine', 'end'], ['c2-c1', 'mine', 'end']],
    },
    {
      id: 'upkeep-6', idea: 'A promotion\'s new rent starts next turn: the bank holds 12, exactly Honō (4) plus Kagari (8), and the new Honō costs nothing more this turn. Next turn it owes 1 right after mining, before Prepare, so it must walk onto the crystal first. (The Poṉ inside the Hi\'s rectangle means nothing is for sale, which keeps the search small.)',
      board: [
        '.  .  .  .',
        '.  m1 .  .',
        '.  .  F1 .',
        '1  .  .  .',
      ],
      homes: true,
      turns: 2,
      prepare: true,
      banks: { white: 12 },
      goal: { kind: 'promote', to: 'F3' },
      solution: ['^c3', 'end'],
      tries: [['end'], ['^c3', 'end', 'mine', 'end', 'mine']],
    },
    {
      id: 'upkeep-7', idea: 'Conclusion: the Irumbu and the Honō owe 2 + 1 = 3, and the Umeme owes 1 more but mines nothing. It even stands on the 3, so it steps aside; the Muju takes the 3, or the near 2 while the Honō mines 1 on the 3. Three crystals cannot pay 4: let the Umeme go, not the Irumbu.',
      board: [
        'M3~ .   .     .',
        '.   F2  .     .',
        'P1  .   L2+3  .',
        '2   .   .     .',
      ],
      homes: true,
      actions: 3,
      goal: { kind: 'keep', pieces: ['a1', 'b2'] },
      solution: ['c3-d3', 'a3-c3', 'mine', 'keep a1 b2 c3'],
      tries: [['a3-a4', 'mine'], ['c3-d3', 'a3-c3', 'mine', 'keep b2 d3 c3']],
    },
  ],
};
