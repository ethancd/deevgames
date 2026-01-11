# Muju Hono Tanka: Elemental Tactics - Web Implementation Spec

## Overview

A browser-based implementation of Elemental Tactics, a two-player strategy board game combining territorial control (Go), tactical combat (Chess), and economic management (StarCraft). This implementation will support single-player vs AI.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Vitest

---

## Game Rules Summary

### Board & Setup
- **Board:** 10×10 square grid (100 squares)
- **Players:** Start at opposite corners — Player at (0,0), AI at (9,9)
- **Starting Units:** Each player begins with 3 units and 0 resources:
  - Hi (Fire) at relative position (1,0)
  - Sjor (Water) at (1,1)
  - Muju (Plant) at (0,1)
- **Resources:** All 100 squares start unmined with 5 resource layers each

### Turn Structure
Each turn has 3 phases:

1. **Place Phase:** Place units that finished building. Promote existing units (optional).
2. **Action Phase:** Spend up to 4 action steps. Each step = one action (move/attack/mine) by one piece. Each piece may perform at most one of each action type per turn.
3. **Queue Phase:** Pay resources to queue new units. Build times vary by unit. Queue is hidden from opponent.

### Actions

**Movement:**
- Orthogonal only (no diagonals)
- Speed stat = squares moved per move action
- Cannot move through or onto occupied squares

**Combat:**
- Melee only (orthogonally adjacent)
- If Attack ≥ Defense, defender is eliminated
- Combined attacks: Multiple pieces attacking same target sum their Attack
- Elemental bonus: +1 Attack and +1 Defense vs disadvantaged element

**Mining:**
- Each square has 5 depth layers (1 resource each)
- Mining stat = maximum depth reachable ("rope length")
- Mining removes topmost remaining layers up to Mining stat
- Once layers below Mining depth remain, square is "dry" for that piece

### Spawning
- Pick an anchor piece you control
- Define spawn rectangle: your starting corner to anchor (diagonal corners)
- If no enemies inside rectangle, place new unit on any empty square within
- Enemy infiltration blocks spawn zones

### Promotion
- Pay cost difference to upgrade a unit to next tier of same element
- Cannot skip tiers; Tier 4 cannot promote
- Promoted pieces cannot act that turn
- Happens during Place Phase

### Elemental System

**Six Elements:**
| Element | Language/Region | Archetype |
|---------|-----------------|-----------|
| Fire | Japanese/Asia | Rush |
| Lightning | Swahili/Africa | Rush |
| Water | Norse/Europe | Balanced |
| Wind | Hawaiian-Māori/Oceania | Balanced |
| Plant | Quechua-Nahuatl/South America | Expand |
| Metal | Lakota/North America | Expand |

**Combat Triangles:**
- Triangle 1: Fire → Plant → Water → Fire
- Triangle 2: Lightning → Metal → Wind → Lightning
- Cross-triangle matchups are neutral

### Victory Conditions
- **Elimination:** Destroy all enemy units (with nothing in build queue)
- **Resignation:** Player concedes

---

## Unit Stats (from canonical spreadsheet)

### Fire (Rush) - Japanese
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Hi | 1 | 2 | 1 | 1 | 1 | 1 | 1 |
| Hono | 2 | 3 | 1 | 2 | 1 | 3 | 1 |
| Kagari | 3 | 4 | 2 | 2 | 1 | 6 | 2 |
| Gokamoka | 4 | 6 | 3 | 3 | 1 | 10 | 2 |

### Lightning (Rush) - Swahili
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Radi | 1 | 1 | 1 | 2 | 1 | 1 | 1 |
| Umeme | 2 | 2 | 1 | 3 | 1 | 3 | 1 |
| Kimubunga | 3 | 2 | 1 | 4 | 1 | 6 | 2 |
| Dhorubakali | 4 | 3 | 1 | 5 | 1 | 10 | 2 |

### Water (Balanced) - Norse
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Sjor | 1 | 2 | 2 | 1 | 1 | 2 | 1 |
| Straumr | 2 | 2 | 3 | 1 | 2 | 4 | 2 |
| Aegirinn | 3 | 3 | 4 | 2 | 3 | 10 | 2 |
| Hafkafstormur | 4 | 4 | 5 | 3 | 3 | 15 | 3 |

### Wind (Balanced) - Hawaiian/Māori
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Hau | 1 | 2 | 1 | 2 | 1 | 2 | 1 |
| Moni | 2 | 3 | 2 | 2 | 1 | 4 | 2 |
| Tawhiri | 3 | 4 | 2 | 3 | 2 | 10 | 2 |
| Awhatamangi | 4 | 4 | 3 | 4 | 2 | 15 | 3 |

### Plant (Expand) - Quechua/Nahuatl
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Muju | 1 | 1 | 3 | 1 | 2 | 3 | 2 |
| Sachita | 2 | 1 | 3 | 1 | 3 | 6 | 2 |
| Sachakuna | 3 | 1 | 4 | 1 | 4 | 12 | 3 |
| Cuauhtlimallki | 4 | 2 | 5 | 1 | 5 | 20 | 3 |

### Metal (Expand) - Lakota
| Name | Tier | Atk | Def | Speed | Mining | Cost | Build Time |
|------|------|-----|-----|-------|--------|------|------------|
| Inyan | 1 | 1 | 3 | 1 | 2 | 3 | 2 |
| Mazaska | 2 | 2 | 4 | 1 | 2 | 6 | 2 |
| Tunkasila | 3 | 2 | 6 | 1 | 3 | 12 | 3 |
| Wakanwicasa | 4 | 2 | 8 | 1 | 4 | 20 | 3 |

---

## Architecture

### Directory Structure

```
elemental/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── postcss.config.js
├── index.html
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Root component
│   ├── index.css                # Tailwind imports
│   │
│   ├── game/
│   │   ├── types.ts             # Core type definitions
│   │   ├── units.ts             # Unit definitions and stats
│   │   ├── elements.ts          # Element system and combat triangles
│   │   ├── board.ts             # Board state and grid operations
│   │   ├── movement.ts          # Movement validation and pathfinding
│   │   ├── combat.ts            # Combat resolution
│   │   ├── mining.ts            # Resource extraction logic
│   │   ├── spawning.ts          # Spawn zone calculation
│   │   ├── building.ts          # Unit queue and build time management
│   │   ├── promotion.ts         # Unit promotion logic
│   │   ├── turn.ts              # Turn structure and phase management
│   │   └── victory.ts           # Win condition checking
│   │
│   ├── ai/
│   │   ├── types.ts             # AI-specific types
│   │   ├── evaluation.ts        # Board state evaluation heuristics
│   │   ├── moves.ts             # Move generation
│   │   └── engine.ts            # AI decision engine
│   │
│   ├── hooks/
│   │   ├── useGameState.ts      # Main game state management
│   │   ├── useActionPhase.ts    # Action step tracking
│   │   ├── useAI.ts             # AI turn execution
│   │   └── useAnimations.ts     # Animation state
│   │
│   ├── components/
│   │   ├── GameScreen.tsx       # Main game container
│   │   ├── Board.tsx            # 10x10 grid rendering
│   │   ├── Cell.tsx             # Individual cell with resource display
│   │   ├── Unit.tsx             # Unit piece rendering
│   │   ├── UnitTooltip.tsx      # Unit stats on hover
│   │   ├── ActionBar.tsx        # Action step indicators
│   │   ├── ResourceDisplay.tsx  # Player resource counter
│   │   ├── BuildQueue.tsx       # Units being built
│   │   ├── UnitShop.tsx         # Available units to build
│   │   ├── PhaseIndicator.tsx   # Current phase display
│   │   ├── TurnIndicator.tsx    # Whose turn it is
│   │   ├── ElementIcon.tsx      # Element symbols
│   │   ├── VictoryScreen.tsx    # Game over display
│   │   └── GameSetup.tsx        # Pre-game configuration
│   │
│   └── utils/
│       ├── coordinates.ts       # Position utilities
│       └── constants.ts         # Game constants
│
└── tests/
    ├── setup.ts
    ├── game/
    │   ├── movement.test.ts
    │   ├── combat.test.ts
    │   ├── mining.test.ts
    │   ├── spawning.test.ts
    │   ├── building.test.ts
    │   ├── promotion.test.ts
    │   └── victory.test.ts
    ├── ai/
    │   ├── evaluation.test.ts
    │   └── moves.test.ts
    └── components/
        ├── Board.test.tsx
        └── GameScreen.test.tsx
```

---

## Core Types

```typescript
// src/game/types.ts

// === Position & Board ===

export interface Position {
  x: number;  // 0-9
  y: number;  // 0-9
}

export type PlayerId = 'player' | 'ai';

// === Elements ===

export type Element = 'fire' | 'lightning' | 'water' | 'wind' | 'plant' | 'metal';

export type Archetype = 'rush' | 'balanced' | 'expand';

export type Tier = 1 | 2 | 3 | 4;

// === Units ===

export interface UnitDefinition {
  id: string;           // e.g., "fire_1", "plant_3"
  name: string;         // e.g., "Hi", "Sachakuna"
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
  id: string;              // Unique instance ID
  definitionId: string;    // References UnitDefinition
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
  resourceLayers: number;  // 0-5, remaining extractable resources
  minedDepth: number;      // 0-5, how deep mining has gone
}

export interface BoardState {
  cells: Cell[][];  // 10x10 grid
  units: Unit[];
}

// === Building ===

export interface QueuedUnit {
  definitionId: string;
  turnsRemaining: number;
  owner: PlayerId;
}

// === Turn & Phase ===

export type TurnPhase = 'place' | 'action' | 'queue';

export interface TurnState {
  currentPlayer: PlayerId;
  phase: TurnPhase;
  actionsRemaining: number;  // 0-4 during action phase
  turnNumber: number;
}

// === Game State ===

export type GamePhase = 'setup' | 'playing' | 'victory';

export interface PlayerState {
  id: PlayerId;
  resources: number;
  buildQueue: QueuedUnit[];
  startCorner: Position;  // (0,0) or (9,9)
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
  selectedUnit: string | null;       // Unit ID
  validMoves: Position[];            // Highlighted valid moves
  validAttacks: Position[];          // Highlighted valid attacks
  pendingAttacks: PendingAttack[];   // Attacks queued this turn
}

// === Actions ===

export interface PendingAttack {
  attackerId: string;
  targetPosition: Position;
}

export type GameAction =
  | { type: 'SELECT_UNIT'; unitId: string }
  | { type: 'DESELECT' }
  | { type: 'MOVE'; unitId: string; to: Position }
  | { type: 'ATTACK'; unitId: string; targetPosition: Position }
  | { type: 'MINE'; unitId: string }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'QUEUE_UNIT'; definitionId: string }
  | { type: 'PROMOTE_UNIT'; unitId: string }
  | { type: 'END_TURN' }
  | { type: 'RESIGN' };
```

---

## Game Logic Modules

### elements.ts - Elemental System

```typescript
// Combat advantage relationships
// Triangle 1: fire → plant → water → fire
// Triangle 2: lightning → metal → wind → lightning

export function getElementAdvantage(attacker: Element, defender: Element): boolean;
// Returns true if attacker has advantage over defender

export function getCombatBonus(attacker: Element, defender: Element): { attack: number; defense: number };
// Returns { attack: 1, defense: 1 } if advantage, { attack: 0, defense: 0 } otherwise
```

### movement.ts - Movement Logic

```typescript
export function getValidMoves(unit: Unit, board: BoardState): Position[];
// Returns all valid destination squares considering:
// - Speed stat (max distance)
// - Orthogonal movement only
// - Cannot pass through pieces
// - Cannot end on occupied square

export function isPathClear(from: Position, to: Position, board: BoardState): boolean;
// Checks if orthogonal path is unobstructed

export function getMoveDistance(from: Position, to: Position): number;
// Manhattan distance for orthogonal movement
```

### combat.ts - Combat Resolution

```typescript
export function getValidAttacks(unit: Unit, board: BoardState): Position[];
// Returns adjacent enemy positions

export function resolveCombat(
  attackers: Unit[],
  defender: Unit,
  getDefinition: (id: string) => UnitDefinition
): { defenderEliminated: boolean; totalDamage: number };
// Sums attacker Attack values, applies elemental bonuses
// Returns whether defender is eliminated (totalAttack >= defenderDefense)

export function calculateAttackPower(
  attacker: UnitDefinition,
  defender: UnitDefinition
): number;
// Base attack + elemental bonus if applicable
```

### mining.ts - Resource Extraction

```typescript
export function canMine(unit: Unit, cell: Cell, getDefinition: (id: string) => UnitDefinition): boolean;
// True if cell has resources at depths reachable by unit's mining stat

export function extractResources(
  unit: Unit,
  cell: Cell,
  getDefinition: (id: string) => UnitDefinition
): { resourcesGained: number; newCell: Cell };
// Extracts topmost layers up to mining stat
// Returns resources gained and updated cell state

export function getReachableDepth(miningPower: number, currentMinedDepth: number): number;
// How many layers this unit can extract given current cell state
```

### spawning.ts - Spawn Zone Calculation

```typescript
export function getSpawnZone(
  anchor: Unit,
  startCorner: Position,
  board: BoardState
): Position[] | null;
// Returns valid spawn positions or null if enemies block the rectangle

export function isSpawnBlocked(
  anchor: Unit,
  startCorner: Position,
  board: BoardState
): boolean;
// Returns true if any enemy is within the spawn rectangle

export function getSpawnRectangle(anchor: Position, startCorner: Position): Position[];
// Returns all positions within the rectangle defined by two corners
```

### building.ts - Build Queue Management

```typescript
export function canAfford(cost: number, resources: number): boolean;

export function queueUnit(
  definitionId: string,
  playerState: PlayerState,
  getDefinition: (id: string) => UnitDefinition
): PlayerState;
// Deducts cost, adds to build queue

export function advanceBuildQueue(queue: QueuedUnit[]): {
  updatedQueue: QueuedUnit[];
  readyUnits: string[];  // definitionIds ready to place
};
// Decrements turnsRemaining, returns units at 0
```

### promotion.ts - Unit Promotion

```typescript
export function canPromote(unit: Unit, playerResources: number): boolean;
// True if not tier 4 and player can afford difference

export function getPromotionCost(currentUnit: UnitDefinition): number;
// Cost difference to next tier

export function getPromotedDefinitionId(currentDefinitionId: string): string | null;
// Returns next tier definition ID or null if tier 4

export function promoteUnit(
  unit: Unit,
  getDefinition: (id: string) => UnitDefinition
): { promotedUnit: Unit; cost: number };
```

### turn.ts - Turn Management

```typescript
export function startTurn(state: GameState): GameState;
// Advances build queues, prepares place phase

export function startPlacePhase(state: GameState): GameState;
// Ready units can be placed

export function startActionPhase(state: GameState): GameState;
// Reset action tracking, set actionsRemaining to 4

export function useAction(state: GameState): GameState;
// Decrements actionsRemaining

export function startQueuePhase(state: GameState): GameState;
// Allow unit queuing

export function endTurn(state: GameState): GameState;
// Switch current player, start their turn
```

### victory.ts - Win Condition

```typescript
export function checkVictory(state: GameState): PlayerId | null;
// Returns winner if one player has no units and empty build queue

export function getUnitCount(state: GameState, player: PlayerId): number;

export function hasUnitsOrQueued(state: GameState, player: PlayerId): boolean;
```

---

## AI System

### Evaluation Heuristics

The AI evaluates board positions using weighted factors:

```typescript
interface EvaluationWeights {
  unitValue: number;        // Sum of unit costs on board
  resourceAdvantage: number; // Resource differential
  territoryControl: number;  // Squares in spawn zones
  miningPotential: number;   // Accessible unmined squares
  threatLevel: number;       // Units threatening enemy pieces
  kingDistance: number;      // Proximity to high-value targets
}

export function evaluatePosition(state: GameState, forPlayer: PlayerId): number;
// Returns numeric score (positive = advantage for forPlayer)
```

### Move Generation

```typescript
export interface AIMove {
  actions: GameAction[];  // Sequence of up to 4 actions
  score: number;          // Evaluated outcome
}

export function generateAllMoves(state: GameState, player: PlayerId): AIMove[];
// Generates legal action sequences

export function findBestMove(state: GameState, depth: number): AIMove;
// Uses minimax with alpha-beta pruning
```

### AI Difficulty Levels

```typescript
export type AIDifficulty = 'easy' | 'medium' | 'hard';

// Easy: Random legal moves, no lookahead
// Medium: 1-ply evaluation, simple heuristics
// Hard: 2-3 ply minimax, full heuristics
```

---

## UI Components

### Board.tsx

- 10×10 grid with cell coordinates
- Visual distinction for:
  - Resource levels (color intensity or symbols)
  - Spawn zones (highlighted when placing)
  - Valid moves (green highlight)
  - Valid attacks (red highlight)
  - Selected unit (border/glow)

### Cell.tsx

- Shows resource depth (0-5) visually
- Mine icon or resource indicator
- Click handlers for movement/attack targets

### Unit.tsx

- Element-colored piece (Fire=red, Water=blue, etc.)
- Tier indicator (size or symbol)
- Shows which player owns it
- Visual state for "acted this turn"

### ActionBar.tsx

- 4 step indicators (filled/empty)
- End Action Phase button
- Current phase label

### BuildQueue.tsx

- Player's queued units with turns remaining
- Progress bar per unit

### UnitShop.tsx

- All 24 unit types organized by element
- Shows cost, stats, build time
- Disabled if can't afford
- Only visible during Queue phase

### GameScreen.tsx Layout

```
+------------------------------------------+
|  Turn: 5    Phase: Action    Steps: ●●○○ |
+------------------------------------------+
|                                          |
|               [10x10 BOARD]              |
|                                          |
+------------------------------------------+
| Resources: 12      Build Queue: Hi (1t)  |
+------------------------------------------+
|            [UNIT SHOP / INFO]            |
+------------------------------------------+
```

---

## User Interactions

### Selection & Actions

1. **Select Unit:** Click owned unit → highlights valid moves/attacks
2. **Move:** Click highlighted move square → unit moves, uses 1 step
3. **Attack:** Click highlighted attack square → attack queued (resolved end of action phase or immediately if combined attack ready)
4. **Mine:** Right-click or dedicated button on selected unit → extracts resources, uses 1 step
5. **Deselect:** Click empty space or press Escape

### Phase Transitions

- **Place Phase:** Click spawn zone to place ready units; click units to promote
- **Action Phase:** Perform up to 4 steps; "End Actions" button to proceed
- **Queue Phase:** Click units in shop to queue; "End Turn" button

### AI Turn

- Brief delay for "thinking" visual
- AI actions animate sequentially
- Player can see AI moves execute

---

## Visual Design

### Color Palette (Element Colors)

| Element | Primary | Secondary |
|---------|---------|-----------|
| Fire | #EF4444 (red-500) | #FCA5A5 (red-300) |
| Lightning | #EAB308 (yellow-500) | #FDE047 (yellow-300) |
| Water | #3B82F6 (blue-500) | #93C5FD (blue-300) |
| Wind | #22D3EE (cyan-400) | #A5F3FC (cyan-200) |
| Plant | #22C55E (green-500) | #86EFAC (green-300) |
| Metal | #6B7280 (gray-500) | #D1D5DB (gray-300) |

### Board Styling

- Light grid: `#F3F4F6` (gray-100)
- Grid lines: `#E5E7EB` (gray-200)
- Resource-rich cells: Darker/richer color
- Depleted cells: Pale/desaturated

### Animations

- Unit movement: 200ms slide
- Attack: Flash on target
- Elimination: Fade out + particles
- Mining: Resource number tick down
- Build complete: Pop-in effect

---

## State Management

### useGameState Hook

```typescript
export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return {
    state,
    // Action dispatchers
    selectUnit: (unitId: string) => void,
    moveUnit: (unitId: string, to: Position) => void,
    attackWith: (unitId: string, target: Position) => void,
    mineWith: (unitId: string) => void,
    endActionPhase: () => void,
    queueUnit: (definitionId: string) => void,
    promoteUnit: (unitId: string) => void,
    endTurn: () => void,
    resign: () => void,
    // Derived state
    canEndTurn: boolean,
    isPlayerTurn: boolean,
    selectedUnitData: Unit | null,
  };
}
```

### Game Reducer

Handles all `GameAction` types, enforces rules, updates state immutably.

---

## Testing Strategy

### Unit Tests (game logic)

- Movement validation edge cases
- Combat resolution with elemental bonuses
- Mining depth mechanics
- Spawn zone blocking
- Build queue advancement
- Promotion costs and restrictions
- Victory conditions

### Integration Tests

- Full turn sequences
- AI move generation
- Multi-unit combined attacks
- Spawn → Place → Action → Queue flow

### Component Tests

- Board renders correct grid
- Unit selection/highlighting
- Phase transitions in UI
- Resource display updates

---

## Implementation Phases

### Phase 1: Core Engine
- Type definitions
- Unit definitions data
- Board state management
- Movement logic
- Basic combat (no combined attacks)
- Mining system
- Turn structure

### Phase 2: Full Rules
- Combined attacks
- Elemental bonuses
- Spawning system
- Build queue
- Promotion
- Victory conditions

### Phase 3: Basic UI
- Board rendering
- Unit pieces
- Selection & highlighting
- Action execution
- Phase indicators
- Resource display

### Phase 4: AI Opponent
- Random move AI (easy)
- Heuristic evaluation
- Minimax implementation
- Difficulty settings

### Phase 5: Polish
- Animations
- Sound effects (optional)
- Game setup screen
- Victory/defeat screens
- Responsive layout
- Keyboard shortcuts

---

## Open Questions / Future Considerations

1. **Undo system:** Allow undoing moves within current turn?
2. **Replay system:** Save/review game history?
3. **Multiplayer:** Future WebSocket-based online play?
4. **Tutorial:** Guided first game?
5. **Mobile:** Touch-friendly interface?

---

## Appendix: Full Unit Data (JSON)

```json
{
  "units": [
    { "id": "fire_1", "name": "Hi", "element": "fire", "tier": 1, "archetype": "rush", "attack": 2, "defense": 1, "speed": 1, "mining": 1, "cost": 1, "buildTime": 1 },
    { "id": "fire_2", "name": "Hono", "element": "fire", "tier": 2, "archetype": "rush", "attack": 3, "defense": 1, "speed": 2, "mining": 1, "cost": 3, "buildTime": 1 },
    { "id": "fire_3", "name": "Kagari", "element": "fire", "tier": 3, "archetype": "rush", "attack": 4, "defense": 2, "speed": 2, "mining": 1, "cost": 6, "buildTime": 2 },
    { "id": "fire_4", "name": "Gokamoka", "element": "fire", "tier": 4, "archetype": "rush", "attack": 6, "defense": 3, "speed": 3, "mining": 1, "cost": 10, "buildTime": 2 },

    { "id": "lightning_1", "name": "Radi", "element": "lightning", "tier": 1, "archetype": "rush", "attack": 1, "defense": 1, "speed": 2, "mining": 1, "cost": 1, "buildTime": 1 },
    { "id": "lightning_2", "name": "Umeme", "element": "lightning", "tier": 2, "archetype": "rush", "attack": 2, "defense": 1, "speed": 3, "mining": 1, "cost": 3, "buildTime": 1 },
    { "id": "lightning_3", "name": "Kimubunga", "element": "lightning", "tier": 3, "archetype": "rush", "attack": 2, "defense": 1, "speed": 4, "mining": 1, "cost": 6, "buildTime": 2 },
    { "id": "lightning_4", "name": "Dhorubakali", "element": "lightning", "tier": 4, "archetype": "rush", "attack": 3, "defense": 1, "speed": 5, "mining": 1, "cost": 10, "buildTime": 2 },

    { "id": "water_1", "name": "Sjor", "element": "water", "tier": 1, "archetype": "balanced", "attack": 2, "defense": 2, "speed": 1, "mining": 1, "cost": 2, "buildTime": 1 },
    { "id": "water_2", "name": "Straumr", "element": "water", "tier": 2, "archetype": "balanced", "attack": 2, "defense": 3, "speed": 1, "mining": 2, "cost": 4, "buildTime": 2 },
    { "id": "water_3", "name": "Aegirinn", "element": "water", "tier": 3, "archetype": "balanced", "attack": 3, "defense": 4, "speed": 2, "mining": 3, "cost": 10, "buildTime": 2 },
    { "id": "water_4", "name": "Hafkafstormur", "element": "water", "tier": 4, "archetype": "balanced", "attack": 4, "defense": 5, "speed": 3, "mining": 3, "cost": 15, "buildTime": 3 },

    { "id": "wind_1", "name": "Hau", "element": "wind", "tier": 1, "archetype": "balanced", "attack": 2, "defense": 1, "speed": 2, "mining": 1, "cost": 2, "buildTime": 1 },
    { "id": "wind_2", "name": "Moni", "element": "wind", "tier": 2, "archetype": "balanced", "attack": 3, "defense": 2, "speed": 2, "mining": 1, "cost": 4, "buildTime": 2 },
    { "id": "wind_3", "name": "Tawhiri", "element": "wind", "tier": 3, "archetype": "balanced", "attack": 4, "defense": 2, "speed": 3, "mining": 2, "cost": 10, "buildTime": 2 },
    { "id": "wind_4", "name": "Awhatamangi", "element": "wind", "tier": 4, "archetype": "balanced", "attack": 4, "defense": 3, "speed": 4, "mining": 2, "cost": 15, "buildTime": 3 },

    { "id": "plant_1", "name": "Muju", "element": "plant", "tier": 1, "archetype": "expand", "attack": 1, "defense": 3, "speed": 1, "mining": 2, "cost": 3, "buildTime": 2 },
    { "id": "plant_2", "name": "Sachita", "element": "plant", "tier": 2, "archetype": "expand", "attack": 1, "defense": 3, "speed": 1, "mining": 3, "cost": 6, "buildTime": 2 },
    { "id": "plant_3", "name": "Sachakuna", "element": "plant", "tier": 3, "archetype": "expand", "attack": 1, "defense": 4, "speed": 1, "mining": 4, "cost": 12, "buildTime": 3 },
    { "id": "plant_4", "name": "Cuauhtlimallki", "element": "plant", "tier": 4, "archetype": "expand", "attack": 2, "defense": 5, "speed": 1, "mining": 5, "cost": 20, "buildTime": 3 },

    { "id": "metal_1", "name": "Inyan", "element": "metal", "tier": 1, "archetype": "expand", "attack": 1, "defense": 3, "speed": 1, "mining": 2, "cost": 3, "buildTime": 2 },
    { "id": "metal_2", "name": "Mazaska", "element": "metal", "tier": 2, "archetype": "expand", "attack": 2, "defense": 4, "speed": 1, "mining": 2, "cost": 6, "buildTime": 2 },
    { "id": "metal_3", "name": "Tunkasila", "element": "metal", "tier": 3, "archetype": "expand", "attack": 2, "defense": 6, "speed": 1, "mining": 3, "cost": 12, "buildTime": 3 },
    { "id": "metal_4", "name": "Wakanwicasa", "element": "metal", "tier": 4, "archetype": "expand", "attack": 2, "defense": 8, "speed": 1, "mining": 4, "cost": 20, "buildTime": 3 }
  ]
}
```
