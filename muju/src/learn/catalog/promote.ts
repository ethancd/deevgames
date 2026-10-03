import type { Arc } from '../types';

/**
 * Promotion: 4 crystals for tier 1 → 2 and 8 for tier 2 → 3, in Prepare, once
 * per piece per turn. Every puzzle shows both homes (economy arcs do). Rent is
 * the next arc, so where a two-turn puzzle's new tier-2 piece reaches an upkeep
 * (promote-3, promote-8) a crystal mined that turn covers it and the bank never
 * drops unexplained. Black tier-2 pieces get a bank of 1 for their own rent:
 * a piece lost at Black's upkeep would count as captured.
 */
export const ARC: Arc = {
  id: 'promote', title: 'Promotion', part: 'economy', icon: 'promote',
  puzzles: [
    {
      id: 'promote-1', idea: 'Promotion happens in Prepare and costs 4 crystals for tier 1 to tier 2: the bank holds exactly 4, so tap the Hi and make it a Honō.',
      board: [
        '.  .  .',
        '.  F1 .',
        '.  .  m1',
      ],
      homes: true,
      prepare: true,
      banks: { white: 4 },
      goal: { kind: 'promote', to: 'F2' },
      solution: ['^b2'],
    },
    {
      id: 'promote-2', idea: 'This turn\'s income pays for it: the bank holds 1, so the Muju walks onto the 3 and mines before Prepare opens; 1 + 3 = 4 promotes it to a Mallki.',
      board: [
        '.  .  .  .',
        'P1 .  3  .',
        '.  .  .  .',
        '.  .  .  m1',
      ],
      homes: true,
      banks: { white: 1 },
      goal: { kind: 'promote', to: 'P2' },
      solution: ['a2-c2', 'mine', '^c2'],
      tries: [['mine']],
    },
    {
      id: 'promote-3', idea: 'One tier per piece per turn: 4 then 8. The Poṉ mines 3 of its 4 crystals, 9 + 3 = 12, and climbs to Veḷḷi now and to Irumbu next turn. Saving the bank for next turn gets only one step. (The last crystal quietly covers the Veḷḷi\'s rent next turn.)',
      board: [
        'M1+4 .  .',
        '.    .  .',
        '.    .  m1',
      ],
      homes: true,
      turns: 2,
      banks: { white: 9 },
      goal: { kind: 'promote', to: 'M3' },
      solution: ['mine', '^a1', 'end'],
      tries: [['mine', 'end']],
    },
    {
      id: 'promote-4', idea: 'Promote for a threshold: the Hi does 2 + 1 = 3 to the Veḷḷi (DEF 4), one short, and the damage heals at Black\'s turn start. A Honō does 3 + 1 = 4, and at Speed 2 it catches the Veḷḷi wherever it runs. A summoned Hi cannot: the Veḷḷi simply walks away from it. (It starts too far from a1 to invade your home.)',
      board: [
        '.  .  .  .  .',
        '.  F1 .  .  .',
        '.  .  .  .  .',
        '.  .  .  m2 .',
        '.  .  .  .  m1',
      ],
      homes: true,
      turns: 2,
      banks: { white: 4, black: 1 },
      goal: { kind: 'capture', targets: ['d4'] },
      solution: ['mine', '^b2', 'end'],
      tries: [['b2-d3xd4', 'mine', 'end'], ['mine', '+F1@a1', 'end'], ['mine', 'end']],
    },
    {
      id: 'promote-5', idea: 'Promote for defense: the Loş (Speed 2) reaches the Sjór wherever it runs and hits 2 against DEF 2, and it stands one square beyond the Sjór\'s own trip plus hit. A Straumr has DEF 3, so promote and stay.',
      board: [
        '.  .  .  .',
        'W1 .  .  .',
        '.  .  .  .',
        '.  .  .  s1',
      ],
      homes: true,
      banks: { white: 4 },
      goal: { kind: 'survive' },
      solution: ['mine', '^a2', 'end'],
      tries: [['mine', 'end'], ['a2-a1', 'mine', 'end'], ['a2-c3', 'mine', 'end']],
    },
    {
      id: 'promote-6', idea: 'Choose which piece to promote: the Poṉ hits the Loş and the Sjór for 1 + 1 = 2 each, and a kill would let it hit again. A Gölge keeps DEF 2, so promoting the Loş saves nothing; it steps away instead. The Sjór is walled in by its own Poṉ and becomes a Straumr (DEF 3).',
      board: [
        '.  .  .  .',
        '.  .  .  .',
        'M1 S1 .  .',
        'W1 m1 .  m1',
      ],
      homes: true,
      banks: { white: 4 },
      goal: { kind: 'survive' },
      solution: ['b3-b2', 'mine', '^a4', 'end'],
      tries: [['mine', '^b3', 'end'], ['b3-b2', 'mine', '^b2', 'end'], ['mine', '^a4', 'end']],
    },
    {
      id: 'promote-7', idea: 'A piece may promote on the turn it arrives. There is no Hi yet: mine to 4, summon a Hi, then next turn it lands, the Muju mines 3 more, and the new Hi becomes a Honō. Spending the 4 on the Muju now leaves no Hi to promote.',
      board: [
        '.  .    .  .',
        '.  P1+6 .  .',
        '.  .    .  .',
        '.  .    .  m1',
      ],
      homes: true,
      turns: 2,
      banks: { white: 1 },
      goal: { kind: 'promote', to: 'F2' },
      solution: ['mine', '+F1@a1', 'end'],
      tries: [['mine', '^b2', 'end'], ['mine', 'end']],
    },
    {
      id: 'promote-8', idea: 'Conclusion: promote the miner. Only one square holds crystals, and a Poṉ squats on it. The Hi steps in and removes it (2 + 1 = 3) without blocking the Muju\'s path; the Muju walks on and mines 3, and the bank of 1 + 3 = 4 makes it a Mallki, which mines 5 next turn: 3 + 5 = 8. Promoting the Hi, or saving, gets only 3 + 3. The far Poṉ keeps the game going and is out of the Hi\'s spare actions.',
      board: [
        '.  .  .    .  .',
        '.  P1 .    .  .',
        'F1 .  m1+8 .  .',
        '.  .  .    .  .',
        '.  .  .    .  m1',
      ],
      homes: true,
      turns: 2,
      banks: { white: 1 },
      goal: { kind: 'mine', atLeast: 8 },
      solution: ['a3-b3xc3', 'b2-c3', 'mine', '^c3', 'end'],
      tries: [['a3-b3xc3', 'b2-c3', 'mine', '^b3', 'end'], ['a3-b3xc3', 'b2-c3', 'mine', 'end']],
    },
  ],
};
