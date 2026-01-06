# FORGE: Web App Specification (Revised)

## Overview

FORGE is a 2-player competitive card drafting/auction game where players build tableaus of tech and doctrine cards by bidding symbols. The game is part of a larger 4-game series (AZAD MINOR), but must function as a standalone experience.

-----

## Game Rules Summary

### Setup

- **Unbounded grid** that expands during play
- Initial layout:
  - Center space: EMPTY
  - 4 cards orthogonally adjacent to center: FACE-UP (available for purchase)
  - 8 cards adjacent to those 4: FACE-DOWN (show faction color/symbol on back)
  - Remaining cards in draw pile
- Each player starts with symbols (from Game 1, or default: 4 of each symbol = 16 total)
- Symbols: Mars (♂), Venus (♀), Mercury (☿), Moon (☽)

### Turn Structure

On your turn, you MUST do exactly one:

**A) BUY a card**

1. Select an available card
2. Pay its symbol cost
3. Opponent may COUNTER-BID by paying original cost + 1 (any symbol)
4. If countered, original player may FINAL-BID by paying original cost + 2 (any symbols)
5. Highest bidder pays their bid, takes card into their tableau
6. If opponent won via counter-bid, it's still the original player's turn
7. The purchased card's space becomes empty
8. Adjacent face-down cards flip face-up
9. New cards dealt face-down adjacent to cards that just flipped up
10. Turn passes (unless opponent won via counter-bid)

**B) BURN a card**

- Select an available card
- Remove it from the game; space becomes RUINS
- Ruins block adjacency (adjacent cards do NOT become available)
- Burning is free
- Turn passes to opponent

### Availability Rules

A card is "available" if:
- It is face-up
- It is orthogonally adjacent to an empty space

### Game End

- After each turn, check: can either player afford any available card?
- If NO: game ends immediately
- If YES: game continues
- Players total their VP (base + conditional, evaluated at game end)
- Highest VP wins; tiebreaker: most unspent symbols, then most cards

-----

## Data Model

### Card

```typescript
interface Card {
  id: string;                    // Unique identifier
  name: string;
  faction: Faction;
  cost: number;                  // Total symbol count (0-4)
  symbols: string;               // e.g., "♂♂♀" or "any any"
  baseVP: number;
  conditionalVP: string | null;  // e.g., "+1 per Crimson Covenant card" or null
  game3Effect: string;
  // Derived at runtime:
  parsedCost: SymbolCost;        // Parsed symbol requirements
}

type Faction =
  | "Crimson Covenant"
  | "Iron Tide"
  | "Void Legion"
  | "Silk Network"
  | "Dream Garden"
  | "Ghost Protocol"
  | "General";

interface SymbolCost {
  mars: number;
  venus: number;
  mercury: number;
  moon: number;
  any: number;  // "any" symbols can be paid with any type (including duplicates)
}
```

### Player State

```typescript
interface Player {
  id: string;
  name: string;
  symbols: SymbolPool;
  tableau: Card[];
  // Tracking for conditionals (evaluated at game end):
  cardsWonByCounterBid: number;
  // Computed:
  totalVP: number;
}

interface SymbolPool {
  mars: number;
  venus: number;
  mercury: number;
  moon: number;
}
```

### Grid State (Unbounded)

```typescript
interface GridState {
  cells: Map<string, GridCell>;  // Key: "x,y" coordinate string
  drawPile: Card[];              // Remaining cards to deal
  bounds: {                      // Current grid bounds (for rendering)
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface GridCell {
  type: "card" | "empty" | "ruins";
  card?: Card;                 // If type === "card"
  faceUp: boolean;             // Cards can be face-down (show faction back)
  x: number;
  y: number;
}

// Coordinate system:
// (0,0) is center (starts empty)
// Orthogonal neighbors of (0,0): (0,1), (0,-1), (1,0), (-1,0)
```

### Game State

```typescript
interface GameState {
  phase: GamePhase;
  players: [Player, Player];
  currentPlayerIndex: 0 | 1;
  grid: GridState;

  // Bid state (when phase is "bidding")
  activeBid?: {
    cardPos: { x: number; y: number };  // Grid position of card being bid on
    originalBidder: 0 | 1;
    currentBid: SymbolPool;             // Symbols committed
    bidStage: "initial" | "countered" | "final";
    counterBidder?: 0 | 1;
  };

  // Tracking
  cardsBurnedThisGame: number;
  turnHistory: TurnEvent[];

  // Game result
  winner?: 0 | 1 | "tie";
}

type GamePhase =
  | "setup"
  | "playing"
  | "bidding"      // Sub-phase during a buy action
  | "game_over";

interface TurnEvent {
  player: 0 | 1;
  action: "buy" | "burn" | "counter_bid" | "final_bid" | "decline_counter";
  cardId?: string;
  symbolsSpent?: SymbolPool;
  wonByCounter?: boolean;
}
```

-----

## Core Game Logic

### Adjacency Calculation

```typescript
function getAdjacentPositions(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x, y: y + 1 },  // Up
    { x, y: y - 1 },  // Down
    { x: x + 1, y },  // Right
    { x: x - 1, y },  // Left
  ];
}

function getAvailableCards(grid: GridState): Array<{ x: number; y: number; card: Card }> {
  const available: Array<{ x: number; y: number; card: Card }> = [];

  for (const [key, cell] of grid.cells.entries()) {
    if (cell.type !== "card" || !cell.faceUp) continue;

    // Check if adjacent to an empty space
    const adjacents = getAdjacentPositions(cell.x, cell.y);
    const hasAdjacentEmpty = adjacents.some(pos => {
      const adjCell = grid.cells.get(`${pos.x},${pos.y}`);
      return adjCell?.type === "empty";
    });

    if (hasAdjacentEmpty) {
      available.push({ x: cell.x, y: cell.y, card: cell.card! });
    }
  }

  return available;
}
```

### Card Purchase Flow

```typescript
function initiateBuy(
  state: GameState,
  pos: { x: number; y: number },
  payment: SymbolPool
): GameState {
  // Validate: card is available, player can afford it
  // Set phase to "bidding", record initial bid
  // Return new state awaiting opponent response
}

function handleCounterBid(state: GameState, counterPayment: SymbolPool): GameState {
  // Opponent pays ORIGINAL COST + 1 (any symbol)
  // Update bid state to "countered"
  // Original player can now final-bid or decline
}

function handleFinalBid(state: GameState, finalPayment: SymbolPool): GameState {
  // Original player pays ORIGINAL COST + 2 (any symbols)
  // Resolve: original player wins the card
  // Process card acquisition
}

function handleDeclineCounter(state: GameState): GameState {
  // Original player declines to final-bid
  // Counter-bidder wins the card
  // IMPORTANT: Turn does NOT pass — original player acts again
}

function handleDeclineInitialBid(state: GameState): GameState {
  // Opponent declines to counter-bid
  // Original bidder wins the card
  // Turn passes normally to opponent
}

function resolveCardAcquisition(
  state: GameState,
  winnerIndex: 0 | 1,
  pos: { x: number; y: number },
  wonByCounter: boolean
): GameState {
  // 1. Add card to winner's tableau
  // 2. Deduct symbols from winner
  // 3. Mark grid cell as empty
  // 4. Flip adjacent face-down cards to face-up
  // 5. For each card that just flipped:
  //    - Get its adjacent positions
  //    - For each empty adjacent position (not ruins, not occupied):
  //      - If draw pile not empty, deal a new face-down card there
  // 6. Update tracking (cardsWonByCounterBid if applicable)
  // 7. Check game end condition
  // 8. If not ended:
  //    - If wonByCounter: keep same player's turn
  //    - Else: advance turn to opponent
}
```

### Burn Logic

```typescript
function burnCard(state: GameState, pos: { x: number; y: number }): GameState {
  // 1. Validate card is available
  // 2. Remove card from grid, mark cell as RUINS
  // 3. Increment cardsBurnedThisGame
  // 4. RUINS blocks adjacency — no cards become available from this
  // 5. Check game end condition
  // 6. Advance turn to opponent
}
```

### Symbol Payment Validation

```typescript
function canPayCost(available: SymbolPool, required: SymbolCost): boolean {
  // First, try to satisfy specific symbol requirements
  let remaining = { ...available };

  // Pay specific symbols
  if (remaining.mars < required.mars) return false;
  if (remaining.venus < required.venus) return false;
  if (remaining.mercury < required.mercury) return false;
  if (remaining.moon < required.moon) return false;

  remaining.mars -= required.mars;
  remaining.venus -= required.venus;
  remaining.mercury -= required.mercury;
  remaining.moon -= required.moon;

  // Check if we can pay "any" symbols with what's left
  const totalRemaining = remaining.mars + remaining.venus +
                         remaining.mercury + remaining.moon;

  return totalRemaining >= required.any;
}

// For counter-bid: originalCost + 1 any symbol
function getCounterBidCost(originalCost: SymbolCost): SymbolCost {
  return {
    ...originalCost,
    any: originalCost.any + 1
  };
}

// For final-bid: originalCost + 2 any symbols
function getFinalBidCost(originalCost: SymbolCost): SymbolCost {
  return {
    ...originalCost,
    any: originalCost.any + 2
  };
}
```

### Game End Detection

```typescript
function checkGameEnd(state: GameState): boolean {
  const available = getAvailableCards(state.grid);
  if (available.length === 0) return true;

  // Check if EITHER player can afford ANY available card
  const canEitherPlayerBuy = state.players.some(player =>
    available.some(({ card }) => canPayCost(player.symbols, card.parsedCost))
  );

  // Game ends when neither player can afford any available card
  return !canEitherPlayerBuy;
}
```

### VP Calculation

**IMPORTANT: All conditional VP is evaluated at game end only.**

```typescript
function calculateVP(player: Player, state: GameState): number {
  let total = 0;

  for (const card of player.tableau) {
    // Base VP
    total += card.baseVP;

    // Conditional VP (evaluated at game end)
    if (card.conditionalVP) {
      total += evaluateConditional(card.conditionalVP, player, state, card);
    }
  }

  return total;
}

function evaluateConditional(
  conditional: string,
  player: Player,
  state: GameState,
  card: Card
): number {
  // All conditional VP patterns from card data:

  // Faction-based:
  // "+2 if you have another card of this faction"
  // "+1 per [Faction] card" (e.g., "+1 per Crimson Covenant card")
  // "+1 per faction represented" (General doesn't count)
  // "+2 per faction with 2+ cards"
  // "+2 if cards from 3+ factions"
  // "+4 if cards from 4+ factions"

  // Counter-bidding:
  // "+3 if you won a card by counter-bidding"
  // "+2 per card you won by counter-bidding"

  // Grid state:
  // "+3 if ≤12 cards remain face up in grid"
  // "+1 per ruins space in grid"
  // "+3 if you have burned 3+ cards"
  // "+2 if ≥4 cards burned this game"
  // "+1 per card you burned this game"

  // Tableau size:
  // "+3 if you have ≤4 cards total"
  // "+2 per card fewer than opponent (min 0)"
  // "+3 if this is your 5th+ card"
  // "+1 per card you have (including this)"

  // Symbol-based:
  // "+4 if you have 1 of each symbol unspent"
  // "+8 if you have 2 of each symbol unspent"

  // Implementation: regex patterns + evaluator functions (see Appendix below)
}
```

-----

## UI Components

### Main Layout

```
┌─────────────────────────────────────────────────────────────┐
│  FORGE                                        [Rules] [Quit]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Player 1: Alice                    Player 2: Bob          │
│   ♂:4 ♀:3 ☿:2 ☽:5                   ♂:2 ♀:4 ☿:3 ☽:3       │
│   VP: 12                             VP: 9                  │
│   [Their Turn]                                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              GRID (unbounded, scrollable/pannable)          │
│                                                             │
│                [?]    [?]    [?]                            │
│                       ↑                                     │
│          [?]  [Card] [EMPTY] [Card]  [?]                   │
│                 ←               →                           │
│                [?]   [Card]   [?]                           │
│                       ↓                                     │
│                                                             │
│   Available cards highlighted. Grid expands as cards dealt  │
│   [Zoom: - +]  [Recenter]                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   YOUR TABLEAU (scrollable)                                 │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                      │
│   │Card 1│ │Card 2│ │Card 3│ │Card 4│ ...                  │
│   └──────┘ └──────┘ └──────┘ └──────┘                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   Action Log (collapsible)                                  │
│   > Alice bought "Crimson Agent" for ♂♀                    │
│   > Bob burned "Supply Cache"                               │
│   > ...                                                     │
└─────────────────────────────────────────────────────────────┘
```

### Card Component

```
Face-Up Card:
┌────────────────────┐
│ [Faction Color]    │
│ Card Name          │
│                    │
│ Cost: ♂♂♀         │
│ VP: 2              │
│ or                 │
│ VP: +1 per X       │
│                    │
│ G3: Effect text    │
└────────────────────┘

Face-Down Card:
┌────────────────────┐
│                    │
│    [Faction        │
│     Color/Icon]    │
│                    │
│        ?           │
│                    │
└────────────────────┘

Ruins:
┌────────────────────┐
│ ░░░░░░░░░░░░░░░░░░ │
│ ░░░ RUINS ░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░ │
└────────────────────┘

Empty:
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐

│                   │
      (empty)
│                   │

└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### Bidding Modal

```
┌─────────────────────────────────────────┐
│           BIDDING: Card Name            │
├─────────────────────────────────────────┤
│  Cost: ♂♂♀ (3 symbols)                 │
│                                         │
│  Your symbols: ♂:4 ♀:3 ☿:2 ☽:5        │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Pay with:                       │   │
│  │  ♂: [2] [-][+]                  │   │
│  │  ♀: [1] [-][+]                  │   │
│  │  ☿: [0] [-][+]                  │   │
│  │  ☽: [0] [-][+]                  │   │
│  │                                 │   │
│  │  Total: 3 symbols ✓             │   │
│  │  ("any" can be paid with any)  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Cancel]                    [Confirm]  │
└─────────────────────────────────────────┘
```

### Counter-Bid UI

```
┌─────────────────────────────────────────┐
│        COUNTER-BID OPPORTUNITY          │
├─────────────────────────────────────────┤
│  Alice wants to buy: Card Name          │
│  Original cost: ♂♂♀ (3 symbols)        │
│                                         │
│  To counter: pay original + 1 any       │
│  Required: ♂♂♀ + any 1 symbol          │
│                                         │
│  Your symbols: ♂:2 ♀:4 ☿:3 ☽:3        │
│                                         │
│  [Decline]              [Counter-Bid]   │
└─────────────────────────────────────────┘
```

### Final-Bid UI

```
┌─────────────────────────────────────────┐
│         BOB COUNTER-BID!                │
├─────────────────────────────────────────┤
│  Bob has counter-bid on: Card Name      │
│                                         │
│  To win: pay original + 2 any           │
│  Required: ♂♂♀ + any 2 symbols         │
│                                         │
│  Your symbols: ♂:4 ♀:3 ☿:2 ☽:5        │
│                                         │
│  [Let Them Have It]       [Final Bid]   │
└─────────────────────────────────────────┘
```

-----

## User Interactions

### Available Actions by Phase

|Phase              |Current Player Actions                                     |Opponent Actions      |
|-------------------|-----------------------------------------------------------|----------------------|
|playing            |Select available card to buy, Select available card to burn|Wait                  |
|bidding (initial)  |Wait for opponent                                          |Counter-bid or Decline|
|bidding (countered)|Final-bid or Decline                                       |Wait                  |
|game_over          |View results, New Game                                     |View results, New Game|

### Click/Tap Targets

- **Grid cards (available)**: Opens buy dialog or burn confirmation
- **Grid cards (face-down)**: Shows faction hint tooltip
- **Grid cells (empty)**: No action
- **Grid cells (ruins)**: Shows "Ruins - blocks adjacency" tooltip
- **Tableau cards**: Shows full card detail modal
- **Symbol counters**: No action (display only)
- **Opponent tableau**: Shows read-only card details

-----

## Multiplayer Architecture

### Option A: Real-time (WebSocket)

```typescript
// Server events
type ServerEvent =
  | { type: "game_state"; state: GameState }
  | { type: "your_turn" }
  | { type: "opponent_action"; action: TurnEvent }
  | { type: "counter_bid_opportunity"; card: Card; originalBid: SymbolPool }
  | { type: "bid_countered"; counterBid: SymbolPool }
  | { type: "game_over"; winner: 0 | 1 | "tie"; finalScores: [number, number] }

// Client events
type ClientEvent =
  | { type: "buy"; pos: { x: number; y: number }; payment: SymbolPool }
  | { type: "burn"; pos: { x: number; y: number } }
  | { type: "counter_bid"; payment: SymbolPool }
  | { type: "decline_counter" }
  | { type: "final_bid"; payment: SymbolPool }
  | { type: "decline_final" }
```

### Option B: Hot-seat (Local 2-player)

- Single browser, players take turns
- "Pass device" prompt between turns
- Optional: hide opponent's exact symbol counts until game end

### Option C: Async (Database-backed)

- Game state stored in database
- Players notified (email/push) when it's their turn
- Timeout handling for abandoned games

-----

## Technical Implementation

### Recommended Stack

- **Frontend**: React + TypeScript
- **State Management**: Zustand or Redux Toolkit
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion (card flips, movements, grid expansion)
- **Backend** (if multiplayer):
  - Node.js + Express or Next.js API routes
  - WebSocket: Socket.io or native WS
  - Database: PostgreSQL or Firebase

### Key Technical Challenges

1. **Unbounded grid rendering**: Need efficient rendering with viewport culling. Consider virtual scrolling or canvas-based rendering for large grids.
2. **Symbol payment UI**: Must handle "any" symbols elegantly. Show which symbols can satisfy requirement, let player choose allocation.
3. **Conditional VP parsing**: Need robust parser for conditional strings. (Will update after seeing spreadsheet)
4. **Grid state transitions**: When a card is purchased:
   - Animate card moving to tableau
   - Mark cell empty
   - Flip adjacent cards (with animation)
   - Deal new cards from pile to cells adjacent to flipped cards (with animation)
   - Recalculate available cards
5. **Counter-bid timing**: Need clear UI states and possibly a timer for counter-bid decisions in real-time play.
6. **"Turn doesn't pass after counter-bid win"**: This is unusual and needs clear UI feedback. The original player must understand they still act.
7. **Grid coordinate system**: Use Map<string, GridCell> with "x,y" keys for sparse grid storage.

-----

## Card Data Import

### Expected CSV/JSON Format

```typescript
interface CardImport {
  name: string;
  faction: string;
  cost: number;
  symbols: string;       // Format TBD from spreadsheet
  baseVP: number;
  conditionalVP: string; // Format TBD from spreadsheet
  game3Effect: string;
}
```

### Parsing Symbols

```typescript
function parseSymbols(symbolStr: string): SymbolCost {
  if (symbolStr === "free" || symbolStr === "") {
    return { mars: 0, venus: 0, mercury: 0, moon: 0, any: 0 };
  }

  // Count specific symbols
  const mars = (symbolStr.match(/♂/g) || []).length;
  const venus = (symbolStr.match(/♀/g) || []).length;
  const mercury = (symbolStr.match(/☿/g) || []).length;
  const moon = (symbolStr.match(/☽/g) || []).length;

  // Count "any" keyword occurrences
  let any = (symbolStr.toLowerCase().match(/any/g) || []).length;

  // Handle digit notation (e.g., "♂☽1" means mars + moon + 1 any)
  const digitMatch = symbolStr.match(/\d+/);
  if (digitMatch) {
    any += parseInt(digitMatch[0]);
  }

  return { mars, venus, mercury, moon, any };
}
```

-----

## Game Setup Flow

### New Game

1. Load card data from imported sheet
2. Shuffle all cards (or subset if using faction draft)
3. Initialize unbounded grid:
   - Place empty cell at (0, 0)
   - Deal 4 face-up cards at (0,1), (0,-1), (1,0), (-1,0)
   - Deal 8 face-down cards adjacent to those 4 cards
4. Place remaining cards in draw pile
5. Assign starting symbols to each player
6. Randomly determine first player
7. Begin play phase

### Starting Symbols

- **Standalone**: Each player gets 4♂, 4♀, 4☿, 4☽ (16 total)
- **From Game 1 (Snatch)**: Import symbol pools from previous game

-----

## Victory Screen

```
┌─────────────────────────────────────────────────────────────┐
│                      GAME OVER                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    🏆 ALICE WINS! 🏆                        │
│                                                             │
│   ┌─────────────────┐     ┌─────────────────┐              │
│   │     ALICE       │     │      BOB        │              │
│   │                 │     │                 │              │
│   │   VP: 18        │     │   VP: 14        │              │
│   │                 │     │                 │              │
│   │  Base: 12       │     │  Base: 10       │              │
│   │  Conditional: 6 │     │  Conditional: 4 │              │
│   │                 │     │                 │              │
│   │  Cards: 6       │     │  Cards: 5       │              │
│   │  Symbols: 3     │     │  Symbols: 7     │              │
│   └─────────────────┘     └─────────────────┘              │
│                                                             │
│   VP Breakdown (click to expand)                            │
│   > Crimson Base: 3 (conditional: 3 Crimson cards)         │
│   > Iron Agent: 2 (base)                                   │
│   > ...                                                     │
│                                                             │
│   [View Tableaus]    [Rematch]    [New Game]    [Exit]     │
│                                                             │
│   ─────────────────────────────────────────────────────    │
│   Continue to Game 3: SKIRMISH?                             │
│   Your tableau carries forward as your army.                │
│   [Continue to Skirmish →]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

-----

## Testing Checklist

### Unit Tests

- [ ] Symbol cost parsing
- [ ] Adjacency calculation (unbounded grid)
- [ ] Available card detection
- [ ] Payment validation (including "any" symbols)
- [ ] VP calculation for each conditional type
- [ ] Game end detection
- [ ] Bid resolution logic
- [ ] Grid expansion logic

### Integration Tests

- [ ] Complete game flow (buy only)
- [ ] Complete game flow (with burns)
- [ ] Counter-bid flow
- [ ] Final-bid flow
- [ ] Turn persistence after counter-bid loss
- [ ] Card dealing after purchase (flip + deal chain)
- [ ] Ruins blocking adjacency
- [ ] Grid expansion as cards are dealt

### UI Tests

- [ ] Grid renders correctly (unbounded)
- [ ] Available cards highlighted
- [ ] Face-down cards show faction
- [ ] Bidding modal flow
- [ ] Counter-bid timing
- [ ] Symbol payment allocation
- [ ] VP updates at game end
- [ ] Game over screen accuracy
- [ ] Grid panning/zooming

### Edge Cases

- [ ] Last card purchased (game ends)
- [ ] All remaining cards unaffordable (game ends)
- [ ] "any" symbol payment with mixed requirements
- [ ] 0-cost cards
- [ ] Ruins blocking adjacency
- [ ] Draw pile empty (no new cards dealt)
- [ ] Grid expands in multiple directions
- [ ] Counter-bid when opponent has exactly enough symbols

-----

## Future Enhancements

### Phase 1 (MVP)

- Hot-seat 2-player
- All core game logic
- Basic UI with unbounded grid

### Phase 2

- AI opponent (simple: random valid moves)
- Improved AI (heuristic-based)

### Phase 3

- Online multiplayer (WebSocket)
- User accounts
- Match history

### Phase 4

- Integration with Game 1 (Snatch) and Game 3 (Skirmish)
- Campaign mode (play all 4 games in sequence)
- Spectator mode

-----

## File Structure (Suggested)

```
deevgames/forge/
├── src/
│   ├── components/
│   │   ├── Grid.tsx
│   │   ├── GridCell.tsx
│   │   ├── Card.tsx
│   │   ├── CardDetail.tsx
│   │   ├── PlayerPanel.tsx
│   │   ├── SymbolCounter.tsx
│   │   ├── Tableau.tsx
│   │   ├── BidModal.tsx
│   │   ├── CounterBidModal.tsx
│   │   ├── GameOverScreen.tsx
│   │   └── ActionLog.tsx
│   ├── game/
│   │   ├── types.ts
│   │   ├── state.ts
│   │   ├── actions.ts
│   │   ├── adjacency.ts
│   │   ├── bidding.ts
│   │   ├── scoring.ts
│   │   ├── conditionals.ts
│   │   └── gridExpansion.ts
│   ├── data/
│   │   ├── cards.json
│   │   └── cardLoader.ts
│   ├── hooks/
│   │   ├── useGameState.ts
│   │   └── useMultiplayer.ts
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── adjacency.test.ts
│   ├── scoring.test.ts
│   ├── bidding.test.ts
│   ├── conditionals.test.ts
│   └── gridExpansion.test.ts
├── package.json
└── README.md
```

-----

## Notes

- **Unbounded grid** is the major architectural decision
- All conditional VP evaluated at game end (not during play)
- Counter-bid and final-bid add to original cost (not replace it)
- Turn only stays with original player if they lose a counter-bid
- Draw pile can run out (game continues without dealing new cards)
- Ruins are permanent blockers

**Next steps**: Review spreadsheet for updated symbol syntax and conditional VP formats.
