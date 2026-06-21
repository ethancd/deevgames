// THE ENGINE SEAM.
//
// The UI imports its engine exclusively from here. Today it resolves to the
// fixture-backed mock; at integration, flip the one boolean below (or wire the
// real import) and the entire app runs on @mms/engine with zero UI changes,
// because both sides implement the pinned `EngineApi` from ./contract.
//
// How to swap at integration:
//   1. Have @mms/engine export `startRun, chooseNode, playCard, endTurn,
//      pickReward` (and optionally `pendingRewards`) per ./contract.
//   2. Uncomment the real-import block and set USE_REAL_ENGINE = true.
//   3. Delete ./mockEngine.ts (or keep it for tests).
import { mockEngine } from './mockEngine';
import type { EngineApi, EngineRewardSource } from './contract';

const USE_REAL_ENGINE = false;

// --- Real engine wiring (kept commented until @mms/engine ships its ops) ----
// import * as realEngine from '@mms/engine';
// const realApi: EngineApi & EngineRewardSource = {
//   startRun: realEngine.startRun,
//   chooseNode: realEngine.chooseNode,
//   playCard: realEngine.playCard,
//   endTurn: realEngine.endTurn,
//   pickReward: realEngine.pickReward,
//   pendingRewards: (realEngine as Partial<EngineRewardSource>).pendingRewards,
// };

export const engine: EngineApi & EngineRewardSource = USE_REAL_ENGINE
  ? // ? realApi
    mockEngine
  : mockEngine;

export * from './contract';

// Preview lookups for the reward UI (bridge until the engine returns rich
// choices). These resolve against whichever engine is active.
export { lookupCard, lookupRelic } from './mockEngine';
