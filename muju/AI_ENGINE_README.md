# Muju AI Engine Guide

## Overview

The AI searches the real public game state with beam planning, MCTS and a
WebAssembly tactical solver. Every game uses four shared actions per player
turn. Movement and attack combinations must fit that budget; enemy reach is
three movement actions plus one attack. Only an enemy kill by attack resets
the ten-turn draw clock. Income still matters economically, but cannot prevent
a draw. The canonical transition supplies these rules to human and AI play.
See [the current rules](SPEC.md) and [implementation status](docs/AI_IMPLEMENTATION_STATUS.md).


## Tuning evaluation weights

The evaluation weights live in `muju/src/ai/types.ts` under `DEFAULT_WEIGHTS`. You can adjust these values to emphasize different strategic priorities.

Example: favor resource advantage and mining over direct combat.

```ts
import { DEFAULT_WEIGHTS } from './types';

const customWeights = {
  ...DEFAULT_WEIGHTS,
  resourceAdvantage: 0.8,
  miningPotential: 0.5,
  threatLevel: 0.2,
};
```

To use custom weights in the engine:

```ts
const ai = new AIEngine('medium', customWeights);
```

Key weights to adjust:

- `unitValue`: material advantage
- `resourceAdvantage`: current stockpile lead
- `territoryControl`: open spawn zones
- `miningPotential`: accessible mining options
- `threatLevel`: immediate kill threats
- `mobility`: number of options next turn
- `centerControl`: board centralization
- `unitHealth`: defensive durability
- `killThreatsReceived`: penalties for enemy kill threats
- `combinedAttackPotential`: combined kill setups
- `spawnDenialPressure`: enemy units in your spawn zone
- `spawnInfiltration`: your units in enemy spawn zone
- `queueValue`: discounted value of queued units
- `stepEfficiency`: ability to use remaining action points
- `techTreeProgress`: tier unlock progression

## Difficulty presets

Difficulty is driven by the configuration in `muju/src/ai/engine-v2.ts`. Each preset changes the size of the search budget and tactical depth:

- **Easy**: lower MCTS iterations, smaller beam width, fewer belief particles, no tactical sharpening.
- **Medium**: moderate MCTS iterations, wider beam, more particles, 1-ply tactical sharpening.
- **Hard**: larger MCTS iterations/time, wider beam, more particles, deeper tactical sharpening.

You can update these presets in the `DIFFICULTY_PRESETS` constant.

## AI Console

The game screen includes an AI console panel that lists the top candidate plans and search parameters. It reads debug information returned by `AIEngineV2.findBestAction` and is rendered via `muju/src/components/AIConsole.tsx`. You can expand the debug payload in `AIEngineV2` if you want additional diagnostics.

## September 7, 2026 correctness update

Human, AI and simulated actions now share `game/legality.ts` and the immutable transition in `ai/simulate.ts`. Illegal actions cost nothing; plans are filtered against the real state, and place/action/queue transitions are explicit. Deterministic entity IDs keep the UI reducer and AI shadow synchronized. Opponent committed spending is masked by public manifested spending. MCTS widens root alternatives and models adversarial choices; tactical search respects multiple actions within one turn. Purchase scoring and resignation now account for recoverable own assets. The UI no longer truncates turns at 20 dispatches.

See [repair details and tests](docs/AI_CORRECTNESS-2026-09-07.md) and [balance recommendations](docs/BALANCE_REVIEW-2026-09-07.md). The production catalogue is unchanged. Correctness is not a claim of optimal play or recalibrated difficulty.

## Static value model and v1.3 catalogue

`npm run balance:static` analyzes the catalogue before playtests; it is intentionally separate from AI evaluation and does not change search weights. v1.3 improves Lightning attack and Plant mining/relocation. Read [implementation and limits](docs/BALANCE_IMPLEMENTATION-2026-09-07.md) and [the model](lab/solver/README.md) before interpreting its local mission witnesses or conditional prices as strategic strength.
