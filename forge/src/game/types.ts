export type Faction =
  | "Crimson Covenant"
  | "Iron Tide"
  | "Void Legion"
  | "Silk Network"
  | "Dream Garden"
  | "Ghost Protocol"
  | "General";

export interface SymbolCost {
  mars: number;
  venus: number;
  mercury: number;
  moon: number;
  any: number;
}

export interface Card {
  id: string;
  name: string;
  faction: Faction;
  cost: number;
  symbols: string;
  baseVP: number;
  conditionalVP: string;
  game3Effect: string;
  parsedCost: SymbolCost;
}

export interface SymbolPool {
  mars: number;
  venus: number;
  mercury: number;
  moon: number;
}

export interface Player {
  id: string;
  name: string;
  symbols: SymbolPool;
  tableau: Card[];
  cardsWonByCounterBid: number;
  cardsBurnedThisGame: number;
}

export type Position = { x: number; y: number };

export interface GridCell {
  type: "card" | "empty" | "ruins";
  card?: Card;
  faceUp: boolean;
  x: number;
  y: number;
}

export interface GridState {
  cells: Map<string, GridCell>;
  drawPile: Card[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export type GamePhase = "setup" | "playing" | "bidding" | "game_over";

export type PlayerIndex = 0 | 1;

export interface ActiveBid {
  cardPos: Position;
  originalBidder: PlayerIndex;
  currentBid: SymbolPool;
  bidStage: "initial" | "countered" | "final";
  counterBidder?: PlayerIndex;
}

export interface GameState {
  phase: GamePhase;
  players: [Player, Player];
  currentPlayerIndex: PlayerIndex;
  grid: GridState;
  activeBid?: ActiveBid;
  cardsBurnedThisGame: number;
  turnHistory: TurnEvent[];
  winner?: PlayerIndex | "tie";
}

export interface TurnEvent {
  player: PlayerIndex;
  action: "buy" | "burn" | "counter_bid" | "final_bid" | "decline_counter";
  cardId?: string;
  symbolsSpent?: SymbolPool;
  wonByCounter?: boolean;
}
