// === Position & Board ===

export interface Position {
  x: number; // 0-9
  y: number; // 0-9
}

export type PlayerId = 'white' | 'black';

// === Game Modes ===

export type GameMode = 'vs-ai' | 'pass-play' | 'ai-vs-ai' | 'online';

export type ControlType = 'human' | 'ai' | 'remote';
export type ActionsPerTurn = 4;

export interface GameConfig {
  actionsPerTurn?: ActionsPerTurn;
  /** Starting crystals granted to Black; omitted or 0 means no handicap. */
  blackCrystalHandicap?: number;
  /** Explicit new-game setup; omitted preserves legacy resume behavior. */
  newGame?: boolean;
  mode: GameMode;
  controls: Record<PlayerId, ControlType>;
  aiDifficulty: Record<PlayerId, import('../ai/types').AIDifficulty>;
}

// === Elements ===

export type Element =
  | 'fire'
  | 'lightning'
  | 'water'
  | 'shadow'
  | 'plant'
  | 'metal';

export type Archetype = 'rush' | 'balanced' | 'expand';

export type Tier = 1 | 2 | 3;

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
}

export interface Unit {
  id: string; // Unique instance ID
  definitionId: string; // References UnitDefinition
  owner: PlayerId;
  position: Position;
  // Turn action tracking
  hasMoved: boolean;
  hasAttacked: boolean;
  // State flags
  canActThisTurn: boolean; // Action eligibility; placement and promotion do not impose summoning sickness
  // Damage state (resets at end of attacker's turn)
  damageTaken: number; // Reduces effective defense; resets when attacked player's turn starts
  // Promotion tracking (resets at end of placement phase)
  promotedThisPlacement?: boolean; // True if already promoted during current placement phase
  // Placement tracking (resets at start of owning player's turn)
  placedThisTurn?: boolean; // True if unit was placed this turn (can't be promoted same turn)
  // Attack tracking (resets at start of owning player's turn)
  attackedThisTurn?: string[]; // All targets attacked this turn, including eliminated units
  lastAttackKilled?: boolean; // Only this unit's own killing blow unlocks its next attack
}

// === Board ===

export interface Cell {
  position: Position;
  resourceLayers: number; // 0-16, remaining crystals
}

export interface BoardState {
  /** Initial reserves for conservation checks and lab layouts. */
  initialResourceLayers?: readonly number[];
  cells: Cell[][]; // 10x10 grid, indexed as cells[y][x]
  units: Unit[];
}

// === Turn & Phase ===

export type TurnPhase = 'place' | 'action';

export interface TurnState {
  currentPlayer: PlayerId;
  phase: TurnPhase;
  actionsRemaining: number; // 0-6 during action phase
  turnNumber: number;
}

// === Game State ===

export type GamePhase = 'setup' | 'playing' | 'victory';

export interface PlayerState {
  id: PlayerId;
  resources: number;
  startCorner: Position; // (0,0) or (9,9)
  // Visible stats for opponent tracking
  resourcesGained: number; // Total crystals collected at turn end
  resourcesUpkeep?: number; // Cumulative upkeep paid (telemetry)
}

export type VictoryReason = 'elimination' | 'home-occupation' | 'home-checkmate' | 'resignation' | 'inactivity' | 'upkeep-elimination' | 'timeout';

export interface IncomeTake { unitId: string; definitionId: string; position: Position; amount: number }

export interface GameState {
  /** Four shared actions for every current-rule match. */
  actionsPerTurn?: ActionsPerTurn;
  /** Starting crystals granted to Black; omitted or 0 means no handicap. */
  blackCrystalHandicap?: number;
  lastIncome?: { player: PlayerId; turnNumber: number; total: number; takes: IncomeTake[] };
  /** Omitted means current rules; explicit elimination is for historical lab comparisons. */
  victoryRule?: 'elimination' | 'home-or-elimination';
  victoryReason?: VictoryReason;
  upkeepPending?: boolean;
  reviewUpkeep?: Partial<Record<PlayerId, boolean>>;
  lastUpkeep?: {player: PlayerId; paid: number; released: {id: string; definitionId: string; tier: number}[]; turnNumber: number};
  inactivityPlies?: number;
  /** True only after an enemy was killed by an attack this turn. */
  progressThisTurn?: boolean;
  /** Lab control only; absent enables current draw rule. */
  inactivityRule?: 'on' | 'off';
  phase: GamePhase;
  board: BoardState;
  players: {
    white: PlayerState;
    black: PlayerState;
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
  | { type: 'END_PLACE_PHASE' }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'PROMOTE_UNIT'; unitId: string }
  | { type: 'BUY_UNIT'; definitionId: string; position: Position }
  | { type: 'PAY_UPKEEP'; keepUnitIds: string[] }
  | { type: 'SET_UPKEEP_REVIEW'; player: PlayerId; enabled: boolean }
  | { type: 'RESIGN' }
  | { type: 'APPLY_AI_ACTION'; aiAction: import('../ai/types').AIAction }
  | { type: 'RESET_GAME' }
  | { type: 'RESTORE_STATE'; state: GameState };
