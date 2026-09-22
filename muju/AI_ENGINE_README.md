# Muju AI Engine Guide

## Overview

Muju has **one rule set**, rules revision `muju-phasing-2`, and every engine
searches it: a turn is Act → `END_ACTION_PHASE` (mine once, then pay upkeep) →
Prepare (promotions and public pending summons) → `END_PLACE_PHASE`. A purchase
commits a summon that arrives at the buyer's next turn start, or refunds in full
if the square is taken or unsupported, so the search must value a commitment the
opponent gets a whole turn to answer. Standard was retired on 2026-09-21
(`SPEC.md` v3.1, `JUDGMENT_LOG.md` J-022).

Two engines ship in the browser, both searching the real public game state:

- **`src/ai/` — `AIEngineV2`**: beam planning, MCTS and a WebAssembly tactical
  solver. It plays easy and medium, and it is what `?hardAi=0` falls back to.
  Its evaluation weights are `DEFAULT_WEIGHTS` in `src/ai/types.ts` (the section
  below).
- **`src/ai/hard/` — the hard engine**: a packed replica with its own search,
  tables and tuned evaluation. It plays the hard difficulty. **Its weights are
  `src/ai/hard/eval/weights.ts`, not `types.ts`**; see
  `docs/hard-ai/` for its design, and
  `docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md` for the pending-summon
  scorer credit and the `phasing-hand-priors-v1` vector it currently ships.

Every game uses four shared actions per player
turn. Movement and attack combinations must fit that budget; enemy reach is
three movement actions plus one attack. Only an enemy kill by attack resets
the twenty-ply draw clock (raised from ten on 2026-09-19, rules revision
`muju-phasing-2`). Summoning, arrival and refunds are not progress. Income still
matters economically, but cannot prevent a draw. The canonical transition
supplies these rules to human and AI play.
See [the current rules](SPEC.md) and [implementation status](docs/AI_IMPLEMENTATION_STATUS.md).


## Tuning evaluation weights

This section is about `AIEngineV2` only. Its evaluation weights live in `muju/src/ai/types.ts` under `DEFAULT_WEIGHTS`, and you can adjust these values to emphasize different strategic priorities. The hard engine ignores them entirely: its vector is `muju/src/ai/hard/eval/weights.ts`, tuned and pinned by identity hashes, and it is not edited by hand.

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
- `stepEfficiency`: ability to use remaining action points
- `techTreeProgress`: tier unlock progression

## Difficulty presets (`AIEngineV2`)

Difficulty inside `AIEngineV2` is driven by the configuration in `muju/src/ai/engine-v2.ts`. Each preset changes the size of the search budget and tactical depth:

- **Easy**: lower MCTS iterations, smaller beam width, no tactical sharpening.
- **Medium**: moderate MCTS iterations, wider beam, 1-ply tactical sharpening.
- **Hard**: larger MCTS iterations/time, wider beam, deeper tactical sharpening.

You can update these presets in the `DIFFICULTY_PRESETS` constant. **Hard in the browser does not read them**: the hard difficulty routes to the `src/ai/hard` engine, whose search shape is the profiles in `muju/src/ai/hard/config.ts`. `DIFFICULTY_PRESETS` governs easy, medium, and a hard seat that opted out with `?hardAi=0`.

## AI Console

The game screen includes an AI console panel that lists the top candidate plans and search parameters. It reads debug information returned by `AIEngineV2.findBestAction` and is rendered via `muju/src/components/AIConsole.tsx`. You can expand the debug payload in `AIEngineV2` if you want additional diagnostics.

## September 7, 2026 correctness update

Human, AI and simulated actions now share `game/legality.ts` and the immutable transition in `ai/simulate.ts`. Illegal actions cost nothing; plans are filtered against the real state, and place/action/queue transitions are explicit. Deterministic entity IDs keep the UI reducer and AI shadow synchronized. Opponent committed spending is masked by public manifested spending. MCTS widens root alternatives and models adversarial choices; tactical search respects multiple actions within one turn. Purchase scoring and resignation now account for recoverable own assets. The UI no longer truncates turns at 20 dispatches.

See [repair details and tests](docs/AI_CORRECTNESS-2026-09-07.md) and [balance recommendations](docs/BALANCE_REVIEW-2026-09-07.md). The production catalogue is unchanged. Correctness is not a claim of optimal play or recalibrated difficulty.

## Static value model and v1.3 catalogue

`npm run balance:static` analyzes the catalogue before playtests; it is intentionally separate from AI evaluation and does not change search weights. v1.3 improves Lightning attack and Plant mining/relocation. Read [implementation and limits](docs/BALANCE_IMPLEMENTATION-2026-09-07.md) and [the model](lab/solver/README.md) before interpreting its local mission witnesses or conditional prices as strategic strength.
