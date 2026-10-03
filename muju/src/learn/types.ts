import type { PlayerId } from '../game/types';

/**
 * Learn to Play: the puzzle curriculum's data model.
 *
 * A puzzle is a plain object. Its position is an ASCII board (see `notation.ts`),
 * its goal is a small predicate tree (see `goals.ts`), and its moves are only ever
 * played through `applyAction`. Every puzzle is proved by `solver.ts` in
 * `tests/learn/catalog.test.ts`, so a rules or stat change that breaks one fails CI.
 */

/** A square in puzzle notation: column letter, then row number from the top (`a1` is White's home). */
export type Square = string;

export type Goal =
  /** Your pieces stand on every flag at once (`piece` names which piece must do it). */
  | { kind: 'reach'; flags: Square[]; piece?: Square }
  /** Crystals mined during the puzzle, summed over every one of your turns. */
  | { kind: 'mine'; atLeast: number }
  /** These enemy pieces (named by their starting squares) are all removed. */
  | { kind: 'capture'; targets: Square[] }
  /** Win by capturing every enemy piece. */
  | { kind: 'eliminate' }
  /** Win at the enemy home: home checkmate (`#`) or occupation at your turn start. */
  | { kind: 'home' }
  /** Commit summons in Prepare. `arrive` waits for them to land at your next turn start. */
  | { kind: 'summon'; type?: string; at?: Square[]; count?: number; arrive?: boolean }
  /** One of your pieces is (or becomes) this type; `piece` pins which one. */
  | { kind: 'promote'; to: string; piece?: Square }
  /** Crystals left in your bank when your last turn ends. */
  | { kind: 'bank'; atLeast: number }
  /** These pieces of yours are still on the board when your last turn ends (upkeep). */
  | { kind: 'keep'; pieces: Square[] }
  /** These pieces of yours (default: all) survive the enemy turn after your last turn. */
  | { kind: 'survive'; pieces?: Square[] }
  /** The enemy does not win in its turn after your last turn. */
  | { kind: 'hold' }
  /**
   * The enemy's pending summons (all of them, or those landing on these squares)
   * are refunded instead of landing at its next turn start: stand on the landing
   * square, put a piece inside every rectangle that supports it, or remove its anchors.
   */
  | { kind: 'deny'; at?: Square[] }
  /** Every listed goal at once. */
  | { kind: 'all'; goals: Goal[] };

export interface PendingSpec { at: Square; type: string; owner?: PlayerId }

export interface PuzzleSpec {
  /** Stable forever: progress is stored under it. Never reuse a retired id. */
  id: string;
  /** Rows from the top (row 1) down; tokens separated by spaces. See `notation.ts`. */
  board: string[];
  goal: Goal;
  /** Your turns to reach the goal. Default 1. */
  turns?: number;
  /** The side you play. Default white. */
  side?: PlayerId;
  /** Banked crystals at the start. Default 0 each. */
  banks?: Partial<Record<PlayerId, number>>;
  /** Actions left in your first turn. Default 4. */
  actions?: number;
  /** Start in Prepare, as if you had just pressed Mine & prepare. */
  prepare?: boolean;
  /** Show the homes and play home occupation and checkmate. Default false: elimination only, homes hidden. */
  homes?: boolean;
  /** Ask for the keep-set every upkeep, even when everything is affordable. */
  reviewUpkeep?: boolean;
  /** Public summons already committed, landing at their owner's next turn start. */
  pending?: PendingSpec[];
  /** Let the enemy buy in its replies (only matters with 3+ turns). Default false. */
  opponentBuys?: boolean;
  /** One intended line for your first turn, in move notation (see `notation.ts`). */
  solution: string[];
  /** Tempting wrong first turns; each must fail. */
  tries?: string[][];
  /** The first exposure to an idea may be solved by simply ending the turn. */
  freebie?: boolean;
  /** Author's intent, for maintainers only; never shown to players. */
  idea: string;
  /** Replace the generated goal line (rarely needed). */
  text?: string;
}

export type PartId = 'basics' | 'combat' | 'elements' | 'economy' | 'winning' | 'review';
export type ArcIcon = 'move' | 'mine' | 'attack' | 'elements' | 'team' | 'cleave' | 'safety'
  | 'summon' | 'deny' | 'promote' | 'upkeep' | 'eliminate' | 'invade' | 'defend' | 'review' | 'exam'
  | 'fire' | 'lightning' | 'water' | 'shadow' | 'plant' | 'metal';

export interface Arc {
  id: string;
  title: string;
  part: PartId;
  icon: ArcIcon;
  puzzles: PuzzleSpec[];
}
