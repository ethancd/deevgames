# FORGE

A competitive 2-player card drafting game with bidding mechanics.

## Development

### Setup

```bash
npm install
```

### Development Server

```bash
npm run dev
```

Opens on http://localhost:3000

### Testing

```bash
# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Build

```bash
npm run build
```

## Project Structure

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
├── cards.json          # Card data (82 cards)
├── SPEC.md            # Full game specification
└── IMPLEMENTATION_PLAN.md  # Development roadmap
```

## Implementation Status

- [x] Phase 1: Project setup & testing infrastructure
- [ ] Phase 2: Core data structures & card loading
- [ ] Phase 3: Grid logic (adjacency & availability)
- [ ] Phase 4: Symbol payment logic
- [ ] Phase 5: Game actions (buy, burn, bidding)
- [ ] Phase 6: Game end & victory
- [ ] Phase 7: Game state management
- [ ] Phase 8: Basic UI components
- [ ] Phase 9: Bidding UI & modals
- [ ] Phase 10: Game flow integration
- [ ] Phase 11: Polish & bug fixes
- [ ] Phase 12: Deployment

## Testing

The project uses:
- **Vitest** for unit/integration testing
- **Testing Library** for React component testing
- **TypeScript** for type safety

All game logic is tested independently of the UI for reliability.
