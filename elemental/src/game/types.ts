// === Position & Board ===

export interface Position {
  x: number; // 0-9
  y: number; // 0-9
}

export type PlayerId = 'player' | 'ai';

// === Elements ===

export type Element =
  | 'fire'
  | 'lightning'
  | 'water'
  | 'wind'
  | 'plant'
  | 'metal';

export type Archetype = 'rush' | 'balanced' | 'expand';

export type Tier = 1 | 2 | 3 | 4;

// === Units ===

export interface UnitDefinition {
  id: string; // e.g., "fire_1", "plant_3"
  name: string; // e.g., "Hi", "Sachakuna"
  element: Element;
  tier: Tier;
  archetype: Archetype;
  attack: number;
  defense: number;
  speed: number;
  mining: number;
  cost: number;
  buildTime: number;
}

export interface Unit {
  id: string; // Unique instance ID
  definitionId: string; // References UnitDefinition
  owner: PlayerId;
  position: Position;
  // Turn action tracking
  hasMoved: boolean;
  hasAttacked: boolean;
  hasMined: boolean;
  // State flags
  canActThisTurn: boolean; // False if just placed or promoted
}

// === Board ===

export interface Cell {
  position: Position;
  resourceLayers: number; // 0-5, remaining extractable resources
  minedDepth: number; // 0-5, how deep mining has gone (5 - resourceLayers)
}

export interface BoardState {
  cells: Cell[][]; // 10x10 grid, indexed as cells[y][x]
  units: Unit[];
}

// === Building ===

export interface QueuedUnit {
  id: string; // Unique queue entry ID
  definitionId: string;
  turnsRemaining: number;
  owner: PlayerId;
}

// === Turn & Phase ===

export type TurnPhase = 'place' | 'action' | 'queue';

export interface TurnState {
  currentPlayer: PlayerId;
  phase: TurnPhase;
  actionsRemaining: number; // 0-4 during action phase
  turnNumber: number;
}

// === Game State ===

export type GamePhase = 'setup' | 'playing' | 'victory';

export interface PlayerState {
  id: PlayerId;
  resources: number;
  buildQueue: QueuedUnit[];
  startCorner: Position; // (0,0) or (9,9)
}

export interface GameState {
  phase: GamePhase;
  board: BoardState;
  players: {
    player: PlayerState;
    ai: PlayerState;
  };
  turn: TurnState;
  winner: PlayerId | null;
  selectedUnit: string | null; // Unit ID
  validMoves: Position[]; // Highlighted valid moves
  validAttacks: Position[]; // Highlighted valid attacks
}

// === Actions ===

export type GameAction =
  | { type: 'SELECT_UNIT'; unitId: string }
  | { type: 'DESELECT' }
  | { type: 'MOVE'; unitId: string; to: Position }
  | { type: 'ATTACK'; unitId: string; targetPosition: Position }
  | { type: 'MINE'; unitId: string }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'QUEUE_UNIT'; definitionId: string }
  | { type: 'PROMOTE_UNIT'; unitId: string }
  | { type: 'PLACE_UNIT'; queuedUnitId: string; position: Position }
  | { type: 'END_TURN' }
  | { type: 'RESIGN' };
