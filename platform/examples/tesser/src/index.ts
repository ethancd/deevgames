export {
  tesser,
  defaultSetup,
  footprintCells,
  volume,
  dimClass,
  speed,
  totalMeasure,
  otherSeat,
  pieceById,
  BOARD_W,
  BOARD_H,
  DEFAULT_PLY_CAP,
  SEATS,
} from './game.ts';
export type { Piece, TesserState, TesserAction, TesserConfig, TesserSeat, Dir, Cell } from './game.ts';
export { persistence, tesserStateSchema } from './persist.ts';
export { tesserEval, moveCount, bestStrikeDamage, advanceScore } from './eval.ts';
export { tesserMinimaxBot, orderTesserMoves, TESSER_MINIMAX_BUDGET } from './bots.ts';
