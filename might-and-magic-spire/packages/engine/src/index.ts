// @mms/engine public API — the runtime contract.
//
// The headless game engine: seeded RNG, run-state + act-map graph, combat
// resolution, the card/relic/intent systems, and the Source → Card adapter.
// A PURE library — no React, no DOM. The frontend imports RunState, Enemy,
// Intent, CombatState (and the operations below) from here, NOT from
// @mms/schema. We re-export the schema types the frontend still needs (CardDef,
// Rarity, …) for convenience.

// --- Schema re-exports (content contract the frontend renders) ---
export * from "@mms/schema";

// --- The pinned runtime contract + engine extensions ---
export type {
  NodeType,
  Intent,
  Enemy,
  Relic,
  RelicEffect,
  CombatState,
  MapNode,
  RunState,
  RewardChoice,
} from "./types";

// --- Seeded RNG (the determinism backbone) ---
export { makeRng } from "./rng";
export type { Rng } from "./rng";

// --- The Source → Card / Artifact / Hero adapter (design surface) ---
export {
  adapt,
  adaptCreature,
  adaptArtifact,
  signatureRelicForHero,
  costForTier,
  magnitudeForCreature,
  rarityForCreature,
  rarityForArtifactClass,
  effectForArtifactBonuses,
  signatureEffectForSpecialty,
} from "./adapter";

// --- Map graph generator ---
export { generateMap, startNodeIds, bossNode } from "./map";
export type { MapGenConfig } from "./map";

// --- Combat primitives (also usable headless / for tests) ---
export {
  startCombat,
  makeEnemy,
  buildIntentScript,
  BASE_ENERGY,
  HAND_SIZE,
} from "./combat";

// --- Run operations: the top-level state machine the frontend drives ---
export {
  startRun,
  chooseNode,
  legalNextNodes,
  playCard,
  endTurn,
  pickReward,
  instanceCard,
  defendCard,
  STARTING_HP,
  STARTING_GOLD,
} from "./run";

// --- Built-in content (engine stands alone; data package supersedes later) ---
export { CREATURES, ARTIFACTS, HEROES, DEFAULT_HERO, creatureById } from "./content";
