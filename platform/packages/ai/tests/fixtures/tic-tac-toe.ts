// Perfect-information fixture for minimax tests. legal() intentionally
// ignores its `seat` argument (both seats "could" play any open cell — the
// seat only matters for whose mark gets placed in apply()), matching the
// platform convention that legal() is a pure function of state, not of turn
// order, for symmetric board games.

import type { GameDef, Rng, Seat } from '@deev/core';

export type Mark = 'X' | 'O';

export interface TicTacToeState {
  board: Array<Mark | null>;
  toMove: Mark;
}

export type TicTacToeAction = number; // cell index 0..8

export type TicTacToeConfig = Record<string, never>;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winner(board: Array<Mark | null>): Mark | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

function other(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}

export const ticTacToe: GameDef<TicTacToeState, TicTacToeAction, TicTacToeConfig, TicTacToeState> = {
  id: 'fixture-tic-tac-toe',
  version: '1.0.0',
  init(_config: TicTacToeConfig, _rng: Rng): TicTacToeState {
    return { board: new Array(9).fill(null), toMove: 'X' };
  },
  seats(_config: TicTacToeConfig): Seat[] {
    return ['X', 'O'];
  },
  toAct(state: TicTacToeState): Seat[] {
    return [state.toMove];
  },
  legal(state: TicTacToeState, _seat: Seat): TicTacToeAction[] {
    const cells: number[] = [];
    state.board.forEach((v, i) => {
      if (v === null) cells.push(i);
    });
    return cells;
  },
  apply(state: TicTacToeState, action: TicTacToeAction, _rng: Rng): TicTacToeState {
    const board = state.board.slice();
    board[action] = state.toMove;
    return { board, toMove: other(state.toMove) };
  },
  terminal(state: TicTacToeState) {
    const w = winner(state.board);
    if (w) {
      return {
        winner: w,
        scores: { X: w === 'X' ? 1 : 0, O: w === 'O' ? 1 : 0 },
        reason: 'three-in-a-row',
      };
    }
    if (state.board.every((v) => v !== null)) {
      return { winner: null, scores: { X: 0.5, O: 0.5 }, reason: 'draw' };
    }
    return null;
  },
};

/** Empty board, X to move. */
export function emptyPosition(): TicTacToeState {
  return { board: new Array(9).fill(null), toMove: 'X' };
}

/**
 * X X .
 * . . O
 * O . .
 * X to move: playing cell 2 completes the top row and wins immediately.
 */
export function winInOne(): TicTacToeState {
  return {
    board: ['X', 'X', null, null, null, 'O', 'O', null, null],
    toMove: 'X',
  };
}

/**
 * X X .
 * . O .
 * . . .
 * O to move: X threatens cell 2 (top row); O must block there.
 */
export function mustBlock(): TicTacToeState {
  return {
    board: ['X', 'X', null, null, 'O', null, null, null, null],
    toMove: 'O',
  };
}

/**
 * X O .
 * O . X
 * . . .
 * X to move (X: cells 0,5; O: cells 1,3). Playing cell 8 creates a genuine
 * fork: it opens the main diagonal (0,4,8, needs 4) AND column 2 (2,5,8,
 * needs 2) simultaneously — O can block only one, so X forces a win. Verified
 * by hand: no single move gives X an immediate three-in-a-row (no line
 * already holds two X's before this move), and every other candidate cell
 * (2, 4, 6, 7) opens at most one threat, not two. Needs lookahead depth >= 3
 * (the fork move, O's forced block, X's winning reply) to see the forced win.
 */
export function forkInTwo(): TicTacToeState {
  return {
    board: ['X', 'O', null, 'O', null, 'X', null, null, null],
    toMove: 'X',
  };
}
