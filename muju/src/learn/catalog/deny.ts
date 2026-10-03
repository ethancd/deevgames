import type { Arc } from '../types';

/**
 * Stopping summons: the enemy's pending summons land at its next turn start only
 * if the square is empty and some clear rectangle (their home corner to one of
 * their pieces, with none of yours inside) still contains it. Every puzzle is
 * judged right after your hand-over, so the enemy never gets to move first.
 * Where your pieces can capture, a spare enemy piece whose own rectangle misses
 * the landing square keeps the game going, so a kill is never an elimination win.
 * Their home stays out of reach until the puzzle that is about it.
 */
export const ARC: Arc = {
  id: 'deny', title: 'Stopping summons', part: 'economy', icon: 'deny',
  puzzles: [
    {
      id: 'deny-1', idea: 'Stand on the landing square: a summon needs an empty square. The Muju walks its four steps onto the Hi\'s square. The Loş\'s rectangle (b5 to e5) is only the bottom row, so stopping one step short, beside the landing square, changes nothing.',
      board: [
        '.  .  P1 .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
        '.  s1 .  .  .',
      ],
      homes: true,
      pending: [{ at: 'c5', type: 'F1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['c1-c5', 'mine', 'end'],
      tries: [['c1-c4', 'mine', 'end']],
    },
    {
      id: 'deny-2', idea: 'Step into the rectangle anywhere: the landing square is five steps away, out of the Muju\'s reach, but the Poṉ\'s rectangle (d1 to e5, the two right columns) is three steps away. Any square inside it breaks it. Walking toward the summon and stopping beside it on c5 stays outside.',
      board: [
        '.  .  .  m1 .',
        '.  .  .  .  .',
        'P1 .  .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'd5', type: 'W1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['a3-d3', 'mine', 'end'],
      tries: [['a3-c5', 'mine', 'end'], ['a3-a5', 'mine', 'end']],
    },
    {
      id: 'deny-3', idea: 'Kill the only anchor: the landing square and its rectangle (c3 to e5) are out of the slow Sjór\'s reach, but the Loş that spans the rectangle is not (Water against Shadow is neutral: 2 against DEF 2). The Poṉ on e2 keeps Black alive; its own rectangle is the right column, which misses d3. Standing right above the landing square does nothing.',
      board: [
        'W1 .  .  .  .',
        '.  .  .  .  m1',
        '.  .  s1 .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'd3', type: 'L1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['a1-c2xc3', 'mine', 'end'],
      tries: [['a1-d2', 'mine', 'end']],
    },
    {
      id: 'deny-4', idea: 'A wound is not enough: Fire against Water does 2 − 1 = 1, so the Hi only chips the Sjór, the anchor stands and the Hi lands. The Muju beside it adds the second point (Plant against Water, 0 + 1), and the two hits together remove it. Your Poṉ on d4 and their spare Poṉ on d5 seal the rectangle (e3 to e5), so stepping in is not an option; the spare\'s own rectangle (d5 to e5) misses e4.',
      board: [
        '.  .  .  .  .',
        'F1 .  .  .  P1',
        '.  .  .  .  w1',
        '.  .  .  M1 .',
        '.  .  .  m1 .',
      ],
      homes: true,
      pending: [{ at: 'e4', type: 'F1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['a2-d3xe3', 'e2xe3', 'mine', 'end'],
      tries: [['a2-d3xe3', 'mine', 'end'], ['e2xe3', 'mine', 'end']],
    },
    {
      id: 'deny-5', idea: 'Two anchors cover the landing square: the Hi\'s rectangle (c2 to e5) and the Loş\'s (b3 to e5) both contain c3, so killing one leaves the other. The Sjór steps to b2, between them, and Cleaves both (3 against the Hi, 2 against the Loş). Every four-step path into the shared part runs through an anchor, and stepping into one rectangle alone (d2 or b4) leaves the other. The Poṉ\'s rectangle is the right column, so it keeps Black alive without covering c3.',
      board: [
        'W1 .  .  .  m1',
        '.  .  f1 .  .',
        '.  s1 .  .  .',
        '.  .  .  .  .',
        '.  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'c3', type: 'P1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['a1-b2xc2', 'b2xb3', 'mine', 'end'],
      tries: [['a1-b2xc2', 'mine', 'end'], ['a1-b2xb3', 'mine', 'end'], ['a1-d2', 'mine', 'end'], ['a1-b4', 'mine', 'end']],
    },
    {
      id: 'deny-6', idea: 'Two summons, two rectangles, two pieces: the Poṉ on a5 spans the bottom two rows, where the Hi lands, and the Poṉ on e1 spans the right two columns, where the Radi lands. The Muju steps into the rows and the Sjór into the columns, two actions each. Their overlap near the home is out of reach, and neither piece can hurt a Poṉ.',
      board: [
        '.  .  .  .  m1 .',
        '.  .  W1 .  .  .',
        '.  P1 .  .  .  .',
        '.  .  .  .  .  .',
        'm1 .  .  .  .  .',
        '.  .  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'c6', type: 'F1', owner: 'black' }, { at: 'f3', type: 'L1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['b3-b5', 'c2-e2', 'mine', 'end'],
      tries: [['b3-b5', 'mine', 'end'], ['c2-e2', 'mine', 'end'], ['c2-c5', 'mine', 'end']],
    },
    {
      id: 'deny-7', idea: 'One piece in the overlap stops both: every rectangle runs to their home, so the Sjór\'s rows (a4 to f6) and the Loş\'s columns (d1 to f6) overlap in the bottom-right corner. Blocking them one at a time, as in the last puzzle, costs 2 actions for the Hi and 3 for the slow Muju, one too many. The Hi alone reaches the overlap in 3. Neither anchor can be removed in time (the Hi does 1 to each).',
      board: [
        '.  P1 .  s1 .  .',
        'F1 .  .  .  .  .',
        '.  .  .  .  .  .',
        'w1 .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'b6', type: 'F1', owner: 'black' }, { at: 'f2', type: 'L1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['a2-d4', 'mine', 'end'],
      tries: [['a2-d2', 'b1-b3', 'mine', 'end'], ['a2-b4', 'mine', 'end'], ['a2-d2', 'mine', 'end']],
    },
    {
      id: 'deny-8', idea: 'Their home is in every rectangle: the Sjór\'s bottom row, the Sjór\'s right column and the Loş\'s quarter (d3 to f6) each support a summon, and the only square in all three is their home. The Hi reaches it with exactly four actions, so every summon is refunded at once. Splitting the work (the Muju on c6, the Hi into the column) runs out of actions. It is not a checkmate: the Sjór on f2 walks down and removes the Hi, but only after the summons have failed.',
      board: [
        '.  .  .  .  .  .',
        '.  F1 .  .  .  w1',
        '.  .  .  s1 .  .',
        '.  .  P1 .  .  .',
        '.  .  .  .  .  .',
        '.  w1 .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'c6', type: 'F1', owner: 'black' }, { at: 'f4', type: 'L1', owner: 'black' }, { at: 'e5', type: 'S1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['b2-f6', 'mine', 'end'],
      tries: [['b2-f3', 'mine', 'end'], ['c4-c6', 'b2-e3', 'mine', 'end'], ['b2-e6', 'mine', 'end']],
    },
    {
      id: 'deny-9', idea: 'They sit on their own home, so the last puzzle\'s trick is gone; but every other rectangle contains one of the home\'s two neighbors, e6 and f5. Four summons, two pieces: the Poṉ on d6 and the Muju on f4 anchor the two summons beside the home (their rectangles are d6 to f6 and f4 to f6), and the far Sjór and Loş anchor the other two along the bottom row and the right column. The doors are the only squares in reach, and they are in every rectangle: the Muju plugs one and the Sjór walks through e5 to the other, four actions exactly. Stepping into the bottom row at c6 stops the b6 summon but not e6, whose small rectangle misses c6; the same holds for the right column.',
      board: [
        '.  .  .  .  .  s1',
        '.  .  .  .  .  .',
        '.  .  .  .  .  .',
        '.  .  .  .  .  p1',
        '.  .  W1 .  P1 .',
        'w1 .  .  m1 .  m1',
      ],
      homes: true,
      pending: [
        { at: 'e6', type: 'F1', owner: 'black' }, { at: 'f5', type: 'F1', owner: 'black' },
        { at: 'b6', type: 'W1', owner: 'black' }, { at: 'f2', type: 'W1', owner: 'black' },
      ],
      goal: { kind: 'deny' },
      solution: ['e5-e6', 'c5-f5', 'mine', 'end'],
      tries: [['c5-c6', 'e5-f5', 'mine', 'end'], ['e5-e6', 'c5-c6', 'mine', 'end'], ['e5-f5', 'mine', 'end']],
    },
    {
      id: 'deny-10', idea: 'Conclusion, kills and blocks together: the Radi\'s and the Loş\'s rectangles both cover f5 and their shared part is out of reach, so the Sjór steps to e3 and Cleaves both (3 against the Radi, 2 against the Loş), which also stops the summon on e6 that only the Loş supports. The Sjór on a7 cannot be removed, so the Muju steps into its bottom row instead of walking toward the landing square on d7.',
      board: [
        '.  .  .  .  .  .  .',
        '.  .  .  .  W1 .  .',
        '.  .  .  .  .  l1 .',
        '.  .  .  .  s1 .  .',
        '.  .  .  .  .  .  .',
        '.  P1 .  .  .  .  .',
        'w1 .  .  .  .  .  .',
      ],
      homes: true,
      pending: [{ at: 'f5', type: 'W1', owner: 'black' }, { at: 'e6', type: 'M1', owner: 'black' }, { at: 'd7', type: 'P1', owner: 'black' }],
      goal: { kind: 'deny' },
      solution: ['e2-e3xf3', 'e3xe4', 'b6-b7', 'mine', 'end'],
      tries: [['e2-e3xf3', 'b6-b7', 'mine', 'end'], ['e2-e3xe4', 'b6-b7', 'mine', 'end'], ['e2-e3xf3', 'e3xe4', 'b6-c6', 'mine', 'end']],
    },
  ],
};
