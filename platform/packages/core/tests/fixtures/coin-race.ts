// Toy game for core tests: two seats race to 5 coins. 'step' gains 1 coin,
// 'gamble' gains rng.int(3) coins (0-2) — exercises engine-rng-in-apply.
// 'reveal' is a commit-point action that flips a hidden flag.

import type { GameDef } from '../../src/game.ts';

export interface RaceState {
  coins: Record<string, number>;
  current: 'a' | 'b';
  revealed: boolean;
}

export type RaceAction = 'step' | 'gamble' | 'reveal';

export const coinRace: GameDef<RaceState, RaceAction, { target?: number }> = {
  id: 'coin-race',
  version: '1.0.0',
  init: () => ({ coins: { a: 0, b: 0 }, current: 'a', revealed: false }),
  seats: () => ['a', 'b'],
  toAct: (s) => [s.current],
  legal: () => ['step', 'gamble', 'reveal'],
  apply: (s, action, rng) => {
    const gain = action === 'step' ? 1 : action === 'gamble' ? rng.int(3) : 0;
    return {
      coins: { ...s.coins, [s.current]: s.coins[s.current] + gain },
      current: s.current === 'a' ? 'b' : 'a',
      revealed: s.revealed || action === 'reveal',
    };
  },
  terminal: (s) => {
    for (const seat of ['a', 'b'] as const) {
      if (s.coins[seat] >= 5) return { winner: seat, reason: 'target' };
    }
    return null;
  },
  score: (s, seat) => s.coins[seat],
  isCommitPoint: (_s, action) => action === 'reveal',
};
