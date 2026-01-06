# FORGE Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for building FORGE as a hot-seat multiplayer web game.

---

## Phase 1: Project Setup & Testing Infrastructure

**Goal:** Set up development environment with test-driven development capabilities

### Steps:

1. **Initialize React + TypeScript project**
   - Use Vite for fast dev server
   - Set up TypeScript strict mode
   - Configure Tailwind CSS

2. **Set up testing infrastructure**
   - Install Vitest (fast unit testing)
   - Install Testing Library (React component testing)
   - Configure test scripts
   - Create test utilities

3. **Project structure**
   ```
   forge/
   ├── src/
   │   ├── game/           # Pure game logic (business logic)
   │   ├── components/     # React components
   │   ├── hooks/          # React hooks
   │   ├── utils/          # Utilities
   │   └── App.tsx
   ├── tests/
   │   ├── game/           # Game logic tests
   │   └── components/     # Component tests
   ├── cards.json          # Card data
   └── package.json
   ```

4. **Verification**
   - `npm run dev` starts dev server
   - `npm run test` runs all tests
   - `npm run test:watch` runs tests in watch mode

**Acceptance Criteria:**
- [ ] Dev server runs on localhost
- [ ] Test suite runs and passes (even if only 1 dummy test)
- [ ] Hot reload works
- [ ] TypeScript compiles without errors

---

## Phase 2: Core Data Structures & Card Loading

**Goal:** Implement TypeScript interfaces and load card data

### Steps:

1. **Implement core types** (`src/game/types.ts`)
   - `Card`, `Faction`, `SymbolCost`
   - `Player`, `SymbolPool`
   - `GridCell`, `GridState`
   - `GameState`, `GamePhase`
   - `TurnEvent`

2. **Implement card parser** (`src/game/cardLoader.ts`)
   - `parseSymbols(symbolStr: string): SymbolCost`
   - `loadCards(): Card[]`
   - Add unique IDs to cards

3. **Write tests** (`tests/game/cardLoader.test.ts`)
   - Test symbol parsing: "♂♀" → {mars: 1, venus: 1, mercury: 0, moon: 0, any: 0}
   - Test "any" parsing: "any any" → {mars: 0, venus: 0, mercury: 0, moon: 0, any: 2}
   - Test digit notation: "♂☽1" → {mars: 1, venus: 0, mercury: 0, moon: 1, any: 1}
   - Test "free": "free" → all zeros
   - Test card loading: loads all 82 cards with valid data

**Acceptance Criteria:**
- [ ] All card parsing tests pass
- [ ] 82 cards load successfully
- [ ] All cards have valid parsed costs

---

## Phase 3: Grid Logic (Adjacency & Availability)

**Goal:** Implement unbounded grid with coordinate system and adjacency rules

### Steps:

1. **Implement adjacency** (`src/game/adjacency.ts`)
   - `getAdjacentPositions(x: number, y: number): Position[]`
   - Returns 4 orthogonal neighbors

2. **Implement grid utilities** (`src/game/grid.ts`)
   - `createInitialGrid(cards: Card[]): GridState`
   - `getAvailableCards(grid: GridState): AvailableCard[]`
   - `getCellAt(grid: GridState, x: number, y: number): GridCell | null`

3. **Write tests** (`tests/game/adjacency.test.ts`)
   - Test adjacency: (0,0) → [(0,1), (0,-1), (1,0), (-1,0)]
   - Test adjacency: (5,3) → [(5,4), (5,2), (6,3), (4,3)]

4. **Write tests** (`tests/game/grid.test.ts`)
   - Test initial grid: center (0,0) is empty
   - Test initial grid: 4 cards at (0,1), (0,-1), (1,0), (-1,0) are face-up
   - Test initial grid: 8 cards around those are face-down
   - Test availability: face-up cards adjacent to empty are available
   - Test availability: face-down cards are not available
   - Test availability: cards not adjacent to empty are not available
   - Test ruins: ruins cells don't make adjacent cards available

**Acceptance Criteria:**
- [ ] All adjacency tests pass
- [ ] Initial grid setup is correct
- [ ] Available card detection works correctly
- [ ] Ruins block adjacency

---

## Phase 4: Symbol Payment Logic

**Goal:** Implement payment validation for buying cards

### Steps:

1. **Implement payment logic** (`src/game/payment.ts`)
   - `canPayCost(available: SymbolPool, required: SymbolCost): boolean`
   - `createPayment(symbols: SymbolPool, required: SymbolCost): SymbolPool | null`
   - `deductSymbols(pool: SymbolPool, payment: SymbolPool): SymbolPool`
   - `getCounterBidCost(originalCost: SymbolCost): SymbolCost`
   - `getFinalBidCost(originalCost: SymbolCost): SymbolCost`

2. **Write tests** (`tests/game/payment.test.ts`)
   - Test basic payment: {♂:2, ♀:1} can pay ♂♀
   - Test "any" payment: {♂:3, ♀:1} can pay ♂ + any (using ♂ or ♀)
   - Test "any" payment: "any any" can be paid with any combination
   - Test insufficient funds: {♂:1} cannot pay ♂♂
   - Test counter-bid cost: ♂♀ → ♂♀ + any
   - Test final-bid cost: ♂♀ → ♂♀ + any + any

**Acceptance Criteria:**
- [ ] Payment validation works for all symbol types
- [ ] "Any" symbols can be paid with any type
- [ ] Counter-bid and final-bid costs calculated correctly
- [ ] All payment tests pass

---

## Phase 5: Game Actions (Buy, Burn, Bidding)

**Goal:** Implement core game actions with state transitions

### Steps:

1. **Implement game actions** (`src/game/actions.ts`)
   - `initiateBuy(state: GameState, pos: Position, payment: SymbolPool): GameState`
   - `handleCounterBid(state: GameState, payment: SymbolPool): GameState`
   - `handleFinalBid(state: GameState, payment: SymbolPool): GameState`
   - `handleDeclineCounter(state: GameState): GameState`
   - `handleDeclineInitialBid(state: GameState): GameState`
   - `resolveCardAcquisition(state: GameState, winner: PlayerIndex, pos: Position, wonByCounter: boolean): GameState`
   - `burnCard(state: GameState, pos: Position): GameState`

2. **Implement grid expansion** (`src/game/gridExpansion.ts`)
   - `flipAdjacentCards(grid: GridState, pos: Position): GridState`
   - `dealNewCards(grid: GridState, positions: Position[]): GridState`

3. **Write tests** (`tests/game/actions.test.ts`)
   - Test buy flow: initiate buy → opponent declines → card acquired, turn passes
   - Test counter-bid: initiate → counter → original declines → opponent wins, original player's turn
   - Test final-bid: initiate → counter → final → original player wins, turn passes
   - Test burn: burn card → cell becomes ruins → turn passes
   - Test grid expansion: buy card → adjacent flip → new cards dealt
   - Test empty draw pile: buy card → no new cards dealt

**Acceptance Criteria:**
- [ ] Buy action works correctly
- [ ] Counter-bid flow works (turn stays with original player)
- [ ] Final-bid flow works
- [ ] Burn action works (creates ruins)
- [ ] Grid expands correctly after purchases
- [ ] All action tests pass

---

## Phase 6: Game End & Victory

**Goal:** Implement game end detection and VP calculation

### Steps:

1. **Implement game end logic** (`src/game/gameEnd.ts`)
   - `checkGameEnd(state: GameState): boolean`
   - `calculateWinner(state: GameState): PlayerIndex | "tie"`

2. **Implement VP calculation** (`src/game/scoring.ts`)
   - `calculateVP(player: Player, state: GameState): number`
   - `evaluateConditional(conditional: string, player: Player, state: GameState, card: Card): number`
   - Implement all 19 conditional VP patterns (use regex + evaluator functions)

3. **Write tests** (`tests/game/gameEnd.test.ts`)
   - Test game continues: available cards exist, player can afford one
   - Test game ends: available cards exist, neither player can afford any
   - Test game ends: no available cards (grid exhausted)

4. **Write tests** (`tests/game/scoring.test.ts`)
   - Test base VP: sum of all base VP
   - Test each conditional pattern (19 tests):
     - "+2 if you have another card of this faction"
     - "+1 per Crimson Covenant card"
     - "+1 per faction represented"
     - "+2 per faction with 2+ cards"
     - "+2 if cards from 3+ factions"
     - "+4 if cards from 4+ factions"
     - "+3 if you won a card by counter-bidding"
     - "+2 per card you won by counter-bidding"
     - "+3 if ≤12 cards remain face up in grid"
     - "+1 per ruins space in grid"
     - "+3 if you have burned 3+ cards"
     - "+2 if ≥4 cards burned this game"
     - "+1 per card you burned this game"
     - "+3 if you have ≤4 cards total"
     - "+2 per card fewer than opponent (min 0)"
     - "+3 if this is your 5th+ card"
     - "+1 per card you have (including this)"
     - "+4 if you have 1 of each symbol unspent"
     - "+8 if you have 2 of each symbol unspent"
   - Test tiebreakers: VP → symbols → cards

**Acceptance Criteria:**
- [ ] Game end detection works
- [ ] All conditional VP patterns work correctly
- [ ] Winner calculation correct (including tiebreakers)
- [ ] All scoring tests pass

---

## Phase 7: Game State Management

**Goal:** Create React state management for the game

### Steps:

1. **Create game state hook** (`src/hooks/useGameState.ts`)
   - `useGameState()` - manages GameState
   - Returns state and action dispatchers:
     - `buyCard(pos, payment)`
     - `counterBid(payment)`
     - `finalBid(payment)`
     - `declineCounter()`
     - `declineInitialBid()`
     - `burnCard(pos)`
     - `newGame()`

2. **Write integration tests** (`tests/game/integration.test.ts`)
   - Test complete game flow: setup → buy → buy → counter → final → buy → game end
   - Test turn tracking throughout game
   - Test state transitions

**Acceptance Criteria:**
- [ ] Game state hook works
- [ ] Actions update state correctly
- [ ] Integration tests pass

---

## Phase 8: Basic UI Components

**Goal:** Build foundational UI components (no game logic yet)

### Steps:

1. **Card component** (`src/components/Card.tsx`)
   - Display card face-up (name, faction, cost, VP, G3 effect)
   - Display card face-down (faction color/icon)
   - Props: `card`, `faceUp`, `onClick`

2. **Grid component** (`src/components/Grid.tsx`)
   - Render unbounded grid (use CSS Grid or Canvas)
   - Display cells: cards, empty, ruins
   - Highlight available cards
   - Handle pan/zoom
   - Props: `gridState`, `onCardClick`

3. **Player panel** (`src/components/PlayerPanel.tsx`)
   - Display player name
   - Display symbol pool (♂:4 ♀:3 ☿:2 ☽:5)
   - Display VP
   - Display "Your Turn" indicator
   - Props: `player`, `isCurrentPlayer`

4. **Tableau component** (`src/components/Tableau.tsx`)
   - Display scrollable list of player's cards
   - Click to view card details
   - Props: `cards`, `onCardClick`

5. **Write component tests** (`tests/components/*.test.tsx`)
   - Test Card renders face-up correctly
   - Test Card renders face-down correctly
   - Test Grid renders cells
   - Test PlayerPanel shows symbols
   - Test Tableau shows cards

**Acceptance Criteria:**
- [ ] All components render without errors
- [ ] Components display correct data
- [ ] Component tests pass

---

## Phase 9: Bidding UI & Modals

**Goal:** Build interactive bidding interface

### Steps:

1. **Bid modal** (`src/components/BidModal.tsx`)
   - Symbol selector (increment/decrement for each symbol type)
   - Show total and required cost
   - Validate payment meets requirements
   - Confirm/Cancel buttons

2. **Counter-bid modal** (`src/components/CounterBidModal.tsx`)
   - Show original bid
   - Show counter-bid requirement (original + 1 any)
   - Symbol selector
   - Decline/Counter buttons

3. **Final-bid modal** (`src/components/FinalBidModal.tsx`)
   - Show counter-bid
   - Show final-bid requirement (original + 2 any)
   - Symbol selector
   - Decline/Final Bid buttons

4. **Write modal tests**
   - Test payment validation in bid modal
   - Test counter-bid cost calculation
   - Test final-bid cost calculation

**Acceptance Criteria:**
- [ ] Modals render correctly
- [ ] Payment validation works in UI
- [ ] Modal tests pass

---

## Phase 10: Game Flow Integration

**Goal:** Wire up components to game state

### Steps:

1. **Main game screen** (`src/App.tsx`)
   - Render Grid, PlayerPanels, Tableaus
   - Handle card clicks (buy/burn choice)
   - Show appropriate modals based on game phase
   - Display action log

2. **Action log** (`src/components/ActionLog.tsx`)
   - Show recent actions
   - "Alice bought Crimson Agent for ♂♀"
   - "Bob burned Supply Cache"
   - Collapsible

3. **Game over screen** (`src/components/GameOverScreen.tsx`)
   - Show winner
   - Show VP breakdown for both players
   - Rematch button
   - New game button

4. **Manual testing**
   - Play a complete game
   - Test all game actions
   - Test counter-bid flow
   - Test game end

**Acceptance Criteria:**
- [ ] Can play a complete game
- [ ] All actions work in UI
- [ ] Game end screen shows correct winner
- [ ] VP calculations are correct

---

## Phase 11: Polish & Bug Fixes

**Goal:** Fix bugs, improve UX, add animations

### Steps:

1. **Animations** (Framer Motion)
   - Card flip animation
   - Card move to tableau animation
   - New card deal animation
   - Grid expansion animation

2. **UX improvements**
   - Loading states
   - Error handling
   - Better mobile support
   - Tooltips for face-down cards

3. **Visual polish**
   - Faction colors
   - Better grid visualization
   - Responsive layout

4. **Bug fixes**
   - Fix any issues found during testing
   - Edge case handling

**Acceptance Criteria:**
- [ ] Game feels polished
- [ ] No major bugs
- [ ] Works on mobile
- [ ] Animations smooth

---

## Phase 12: Deployment

**Goal:** Deploy to production

### Steps:

1. **Build for production**
   - `npm run build`
   - Test production build locally

2. **Deploy**
   - Deploy to Vercel/Netlify/GitHub Pages
   - Test deployed version

3. **Documentation**
   - Update README with game rules
   - Add link to deployed game

**Acceptance Criteria:**
- [ ] Game deployed and accessible
- [ ] All features work in production
- [ ] README updated

---

## Testing Strategy

### Unit Tests (Jest/Vitest)
- **Game logic** (`src/game/`)
  - Pure functions, no React dependencies
  - Test all edge cases
  - Aim for 100% coverage of game logic

### Component Tests (Testing Library)
- **UI components** (`src/components/`)
  - Test rendering
  - Test user interactions
  - Test props

### Integration Tests
- **Full game flows**
  - Test complete games
  - Test complex scenarios

### Manual Testing
- **Playtesting**
  - Play complete games
  - Test edge cases
  - Test on different devices

---

## Success Metrics

**Phase 1-2:** Green test suite, card data loads
**Phase 3-6:** All game logic tests pass (50+ tests)
**Phase 7-10:** Playable game in browser
**Phase 11-12:** Polished game deployed

---

## Next Steps

1. **Start with Phase 1:** Set up project and testing infrastructure
2. **TDD approach:** Write tests first, then implement
3. **Incremental:** Complete each phase before moving to next
4. **Test often:** Run `npm run test:watch` continuously during development
