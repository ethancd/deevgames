import type { Arc } from '../types';

/**
 * Final exam: near-game positions on the full 10×10 board, with the real map's
 * reserves (mined down where pieces have been standing). There are no arc
 * labels; each position asks the player's checklist in order: can I win now,
 * can I capture, am I safe, can I earn more?
 *
 * 1 wins now, 2 captures, 3 defends the home, 4 earns. The twist (5) pairs with
 * 3: when the enemy's invasion cannot be stopped, the only defense is to win
 * first. The conclusion (6) spends two turns on capture, rent and `#`.
 *
 * Search size is the constraint on a board this big. White's far-off pieces are
 * Poṉs (they cannot move), and in the reply puzzles Black has at most one
 * moving piece besides its Poṉs.
 */
export const ARC: Arc = {
  id: 'exam', title: 'Final exam', part: 'review', icon: 'exam',
  puzzles: [
    {
      id: 'exam-1',
      idea: 'Can I win now? The Irumbu walks to h10, removes the Umeme in the doorway (2 − 1 = 1 against DEF 1) and steps onto the home. Black\'s Straumr and Poṉ do 1 each against DEF 5, so it is `#`. The faster Kagari can walk in too, but the Straumr puts it out (2 + 1 = 3 against DEF 2).',
      board: [
        '8    M1+5 8    .  .  .  4  4    4    4',
        'M1+5 8    4    .  .  .  4  16   16   4',
        '8    4    4    .  .  .  4  16   16   4',
        '4    4    4    4  4  8  4  4    4    4',
        '4    4    4    8  8  8  4  4    4    4',
        '4    4    s2+4 4  8  8  8  4    4    4',
        '4    4    4    4  8  4  4  M3+4 4    4',
        '4    16   16   4  .  .  .  4    4    8',
        '4    16   16   4  .  .  F3 4    w2+4 m1+2',
        '4    4    4    4  .  .  .  8    l2+8 8',
      ],
      homes: true,
      goal: { kind: 'home' },
      solution: ['h7-h10', 'h10xi10', 'h10-j10', 'mine'],
      tries: [['g9-h10xi10', 'h10-j10', 'mine', 'end']],
    },
    {
      id: 'exam-2',
      idea: 'Can I capture? The Sach\'akuna is walled in by its own side. The Kagari does only 4 − 1 = 3 to the Ægirinn (DEF 4), so the Muju chips it first (0 + 1). Then the Kagari\'s blow kills, unlocks a second attack, steps into the gap and removes the Sach\'akuna (4 + 1 = 5). Hitting first closes the chain, and the way round through the Muju and the Poṉs costs too many actions. Black\'s Poṉ sits on its home, so the Kagari cannot walk in (11 squares, all four actions) for a `#` instead.',
      board: [
        '8    M1+5 8    .     .     .     4  4  4    4',
        'M1+5 8    4    .     .     .     4  16 16   4',
        '8    4    4    .     .     .     4  16 16   4',
        '4    4    4    4     F3+4  8     4  4  4    4',
        '4    4    4    P1+5  w3+5  p1+5  4  4  4    4',
        '4    4    4    m1+1  p3    m1+5  8  4  4    4',
        '4    4    4    4     m1+5  4     4  4  4    4',
        '4    16   16   4     .     .     .  4  4    8',
        '4    16   16   4     .     .     .  4  8    8',
        '4    4    4    4     .     .     .  8  8    m1+5',
      ],
      homes: true,
      goal: { kind: 'capture', targets: ['e6'] },
      solution: ['d5xe5', 'e4xe5', 'e4-e5xe6', 'mine'],
      tries: [
        ['e4xe5', 'd5xe5', 'e4-e5', 'mine'],
        ['e4-f4xf5', 'f4-f5xf6', 'mine'],
      ],
    },
    {
      id: 'exam-3',
      idea: 'Am I safe? A Sach\'akuna sits on your home and wins at Black\'s turn start. While it is there no `#` can be awarded, so the Veḷḷi\'s counter-invasion comes too late. The Hi (2 + 1 = 3) and the Poṉ (1) remove it together (DEF 4), but your own Muju (0) stands in the door: move it out, then strike. Black\'s home Poṉ keeps the game going.',
      board: [
        'p3   P1+5 8    .  .  .     4  4    4    4',
        'M1+5 8    F1+3 .  .  .     4  16   16   4',
        '8    4    4    .  .  .     4  16   16   4',
        '4    4    4    4  4  8     4  4    4    4',
        '4    4    4    8  8  8     4  4    4    4',
        '4    4    4    4  8  5     8  4    4    4',
        '4    4    4    4  8  4     4  4    4    4',
        '4    16   16   4  .  .     .  4    4    8',
        '4    16   16   4  .  .     .  4    4    m1+5',
        '4    4    4    4  .  .     .  8    M2+6 8',
      ],
      homes: true,
      goal: { kind: 'hold' },
      solution: ['b1-c1', 'c2-b1xa1', 'a2xa1', 'mine', 'end'],
      tries: [
        ['i10-j10', 'mine', 'end'],
        ['a2xa1', 'b1xa1', 'mine', 'end'],
      ],
    },
    {
      id: 'exam-4',
      idea: 'Can I earn more? The center is mined down, and the big bucket (Mining 8) wants a 16, but Black squatters hold two of them. The Honō removes the Muju (3 + 1 = 4) and the Sach\'akuna steps onto its 10 (or the Poṉ chips the Black Poṉ so the Sach\'akuna can finish it). On the best free square it takes only 5; alone it cannot remove the Muju (2 against DEF 3).',
      board: [
        '8    M1+5 8    .  .  .     4    4     4     4',
        'M1+5 8    4    .  .  .     4    m1+10 M1+10 4',
        '8    4    4    .  .  .     P3   p1+10 P1+10 4',
        '4    4    4    4  4  2     4    4     4     4',
        '4    4    4    6  3  F2+3  4    4     4     4',
        '4    4    4    4  4  5     5    4     4     4',
        '4    4    4    4  6  4     4    4     4     4',
        '4    16   16   4  .  .     .    4     4     8',
        '4    16   16   4  .  .     .    4     m1+5  8',
        '4    4    4    4  .  .     .    8     8     8',
      ],
      homes: true,
      goal: { kind: 'mine', atLeast: 21 },
      solution: ['f5-h4xh3', 'g3-h3', 'mine'],
      tries: [
        ['g3-g6', 'mine'],
        ['g3xh3', 'mine'],
      ],
    },
    {
      id: 'exam-5',
      idea: 'Twist: nothing can stop the Straumr walking into your home next turn with `#` (your Hi does 2 − 1 = 1 against DEF 3). So win first: the Sjór walks onto their home and mines 2 of its 8, and the bank of 2 + 2 promotes it to Straumr (DEF 3), beyond the Poṉ\'s 1 + 1 = 2. An unpromoted Sjór is removed by the Poṉ and the Straumr still walks in; a Hi run home is captured on the way.',
      board: [
        '8    8    8    .  .     .  4  4    4    4',
        'w2+6 8    4    .  .     .  4  M1   16   4',
        '8    4    4    .  .     .  4  16   M1   4',
        '4    4    4    4  F1+3  8  4  4    4    4',
        '4    4    4    8  8     8  4  4    4    4',
        '4    4    4    4  8     8  8  4    4    4',
        '4    4    4    4  8     4  4  4    4    4',
        '4    16   16   4  .     .  .  4    4    8',
        '4    16   16   4  .     .  .  4    4    m1+5',
        '4    4    4    4  .     .  W1 8    6    8',
      ],
      homes: true,
      banks: { white: 2 },
      goal: { kind: 'hold' },
      solution: ['g10-j10', 'mine', '^j10'],
      tries: [
        ['g10-j10', 'mine', 'end'],
        ['e4-b1', 'mine', 'end'],
        ['e4-a1', 'mine', 'end'],
      ],
    },
    {
      id: 'exam-6',
      idea: 'Conclusion, two turns: the Sjór is Black\'s only rescuer, and it puts out Fire (2 + 1 = 3 against DEF 2). Capture it now (4 − 1 = 3) from h7, whose crystals pay the Kagari\'s rent; next turn the Kagari walks in, mines 1 on the home for the second rent, and the Poṉ does 0. Rushing to the home lets the Sjór capture the Kagari; waiting on d10 lets it slip to a rescue post; capturing from the empty g8, or staging on the mined-out d9 (from where every rescue post is in reach), leaves the bank empty and the Kagari is released at next turn\'s upkeep. The far Poṉ on a10 keeps Black from being swept by elimination instead.',
      board: [
        '8    M1   8    .  .  .  4  4    4    4',
        'M1   8    4    .  .  .  4  16   16   4',
        '8    4    4    .  .  .  4  16   16   4',
        '4    4    4    4  4  8  4  4    4    4',
        '4    4    4    8  8  8  4  4    4    4',
        'F3+4 4    4    4  8  8  8  4    4    4',
        '4    4    4    4  8  4  4  4    4    4',
        '4    16   16   4  .  .  .  w1+4 4    8',
        '4    16   16   .  .  .  .  4    4    m1',
        'm1+4 4    4    4  .  .  .  8    6    8',
      ],
      homes: true,
      turns: 2,
      banks: { white: 2 },
      goal: { kind: 'home' },
      solution: ['a6-h7xh8', 'mine', 'end'],
      tries: [
        ['a6-h10', 'mine', 'end'],
        ['a6-d10', 'mine', 'end'],
        ['a6-g8xh8', 'mine', 'end'],
        ['a6-d9', 'mine', 'end'],
      ],
    },
  ],
};
