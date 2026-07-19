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
export {
  missionSchema,
  missionPieceSchema,
  parsePieceString,
  parsePieceList,
  parseCampaignCsv,
  campaignContent,
  missionVerifier,
  missionSolvedByBot,
  missionPieces,
  missionConfig,
  TESSER_VERIFY_BUDGET,
} from './puzzles.ts';
export type { Mission, MissionPiece } from './puzzles.ts';
