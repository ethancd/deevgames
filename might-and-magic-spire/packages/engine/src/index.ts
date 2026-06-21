// @mms/engine public API — the ARMY-model runtime contract.
//
// The headless game engine: seeded RNG, run-state + act-map graph, HoMM3-style
// army battle resolution, hero/spell/equipment systems, and the Source ->
// runtime adapters. A PURE library — no React, no DOM. The frontend imports the
// runtime types and operations from HERE, not from @mms/schema. We re-export the
// schema content types the frontend still renders (SourceCreature, ArtifactSlot,
// …) for convenience.
//
// The Slay-the-Spire combat model (cards/energy/hand/Enemy.intent, the card
// adapter, and the adapt(creature)===card invariant) has been RETIRED.

// --- Schema re-exports (content contract the frontend renders) ---
export * from "@mms/schema";

// --- Runtime contract (army model) ---
export type {
  NodeType,
  MapNode,
  Hero,
  PrimaryStat,
  Stack,
  Rank,
  Side,
  Army,
  Telegraph,
  CombatSpell,
  SpellEffect,
  SpellTargeting,
  Equipment,
  EquipmentEffect,
  CombatState,
  RunState,
  RewardChoice,
  ArtifactSlot,
} from "./types";

// --- Seeded RNG (the determinism backbone) ---
export { makeRng } from "./rng";
export type { Rng } from "./rng";

// --- Source -> runtime adapters (the design surface; see ADAPTER.md) ---
export {
  adaptStack,
  adaptEquipment,
  adaptSpell,
  deriveHero,
  parseBonuses,
  rankForCreature,
  rarityForArtifactClass,
  MANA_PER_KNOWLEDGE,
} from "./adapter";

// --- Map graph generator ---
export { generateMap, startNodeIds, bossNode } from "./map";
export type { MapGenConfig } from "./map";

// --- Battle primitives (usable headless / for tests) ---
export {
  effAttack,
  effDefense,
  adMultiplier,
  computeDamage,
  applyDamage,
  applyHeal,
  resolveAttack,
  legalTargets,
  chooseEnemyIntent,
  isShooter,
  hasAbility,
  armyAlive,
  livingStacks,
  spellMagnitude,
  AD_ATTACK_STEP,
  AD_ATTACK_CAP,
  AD_DEFENSE_STEP,
  AD_DEFENSE_CAP,
  DEFEND_DEFENSE_FRACTION,
  LIFE_DRAIN_FRACTION,
} from "./battle";

// --- Run operations: the top-level state machine the frontend drives ---
export {
  startRun,
  legalNextNodes,
  chooseNode,
  pickReward,
  // combat
  commandStack,
  castSpell,
  endPlayerTurn,
  legalCommandTargets,
  legalSpellTargets,
  // node interactions
  recruitAt,
  upgradeAt,
  learnAt,
  buyAt,
  equipArtifact,
  unequipArtifact,
  pendingRewards,
  // hero/necro helpers
  recomputeHero,
  applyNecromancy,
  // levers
  STARTING_GOLD,
  ARMY_CAP,
  NECRO_BASE_PCT,
  NECRO_CAP,
} from "./run";

// --- Content arrays + lookups for the Codex / app to reuse ---
export {
  CREATURES,
  ALL_CREATURES,
  BASE_CREATURES,
  ARTIFACTS,
  HEROES,
  SPELLS,
  DEFAULT_HERO,
  creatureById,
  spellById,
  artifactById,
  heroById,
  upgradeFormOf,
} from "./content";
