// The runtime contract for the ARMY combat model (HoMM3-with-one-hero).
//
// The frontend imports these shapes from @mms/engine (re-exported via index.ts),
// NOT from @mms/schema. The app may treat our RunState/CombatState as a
// structural SUPERSET — extra engine-internal fields are additive and the app
// seam casts. The pinned public fields (documented in the task contract) must
// keep their exact names.
//
// This file REPLACES the old Slay-the-Spire deckbuilder contract
// (CombatState.hand/energy/enemies[], Enemy.intent, Relic, RewardChoice card/…).

import type { ArtifactSlot, Rarity } from "./schema-types";

export type { ArtifactSlot };

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export type NodeType =
  | "combat"
  | "elite"
  | "boss"
  | "dwelling"
  | "altar"
  | "shrine"
  | "merchant"
  | "rest";

export interface MapNode {
  id: string;
  type: NodeType;
  row: number;
  col: number;
  next: string[]; // ids of reachable nodes in the next row
}

// ---------------------------------------------------------------------------
// Hero (NO hp — a commander of primary stats, artifacts and a spellbook)
// ---------------------------------------------------------------------------

export type PrimaryStat = "attack" | "defense" | "power" | "knowledge";

export interface Hero {
  id: string;
  name: string;
  heroClass: string;
  specialty: string;

  // Primary stats. Attack/Defense buff the whole army; Power scales spells;
  // Knowledge sets max mana.
  attack: number;
  defense: number;
  power: number;
  knowledge: number;

  mana: number;
  maxMana: number;

  /** Paper-doll of equipped artifacts, keyed by slot. */
  equipment: Partial<Record<ArtifactSlot, Equipment>>;
  /** Combat spells the hero may cast (one per turn). */
  spellbook: CombatSpell[];
  /** Skill name -> rank, e.g. { Necromancy: 1, Offense: 1 }. */
  skills: Record<string, number>;
  imageRef: string;

  // --- engine-internal: the hero's base (un-equipped) primaries, so equipping
  // and unequipping recomputes deterministically rather than accumulating. ---
  baseAttack: number;
  baseDefense: number;
  basePower: number;
  baseKnowledge: number;
}

// ---------------------------------------------------------------------------
// Creature stacks (the army — these DO have hp; the army is your life total)
// ---------------------------------------------------------------------------

export type Rank = "front" | "back";
export type Side = "player" | "enemy";

/** A telegraphed enemy action — the SAME pure planner drives shown + executed. */
export interface Telegraph {
  kind: "attack" | "defend";
  value?: number; // forecast damage for "attack"
  targetStackId?: string; // who it intends to hit
  label: string; // display text, e.g. "Attacks Skeletons for ~24"
}

export interface Stack {
  id: string;
  sourceId: string; // back-ref to the SourceCreature
  name: string;
  tier: number;
  upgraded: boolean;
  upgradeOf: string | null;

  count: number; // living creatures in the stack
  hpTop: number; // hp of the top (wounded) creature, 1..maxHpPer
  maxHpPer: number; // max hp per creature

  attack: number;
  defense: number;
  damageMin: number;
  damageMax: number;
  speed: number;

  rank: Rank; // front (melee) / back (ranged + casters)
  abilities: string[];
  side: Side;

  // Per-round/per-turn combat flags.
  hasActed: boolean; // commanded this turn (player) / acted this round (enemy)
  isDefending: boolean; // chose Defend -> +defense bonus, resets next turn
  hasRetaliated: boolean; // already struck back this round

  /** Honest telegraph for enemy stacks (undefined for the player's). */
  telegraph?: Telegraph;
  imageRef: string;

  // --- engine-internal: battle-start count, the cap for life-drain resurrect. ---
  startCount: number;
}

export interface Army {
  stacks: Stack[];
  side: Side;
}

// ---------------------------------------------------------------------------
// Spells & equipment
// ---------------------------------------------------------------------------

export type SpellTargeting =
  | "enemyStack"
  | "allyStack"
  | "allEnemies"
  | "allAllies"
  | "self"
  | "none";

/** What a spell does, mechanically. magnitude = base + powerScale * hero.power. */
export type SpellEffect =
  | { kind: "damage"; target: SpellTargeting; base: number; powerScale: number }
  | { kind: "heal"; target: SpellTargeting; base: number; powerScale: number }
  | {
      kind: "buff";
      target: SpellTargeting;
      stat: "attack" | "defense" | "speed" | "damage";
      base: number;
      powerScale: number;
    }
  | {
      kind: "debuff";
      target: SpellTargeting;
      stat: "attack" | "defense" | "speed";
      base: number;
      powerScale: number;
    }
  | { kind: "disable"; target: SpellTargeting; base: number; powerScale: number };

export interface CombatSpell {
  id: string;
  name: string;
  school: string;
  level: number;
  manaCost: number;
  description: string;
  /** App-facing targeting category (mirrors effect.target). */
  targeting: SpellTargeting;
  imageRef: string;

  // --- engine-internal: the resolved mechanical effect. ---
  effect: SpellEffect;
}

/** What an artifact does when equipped. Primary deltas + special effects. */
export type EquipmentEffect =
  | { kind: "hpPerCreature"; amount: number }
  | { kind: "speedAll"; amount: number }
  | { kind: "manaMax"; amount: number }
  | { kind: "necromancyBonus"; amount: number } // e.g. Cloak of the Undead King
  | { kind: "none" };

export interface Equipment {
  id: string;
  sourceId: string;
  name: string;
  slot: ArtifactSlot;
  rarity: Rarity;
  description: string;
  imageRef: string;

  // --- engine-internal: parsed mechanics. ---
  primaryDeltas: Partial<Record<PrimaryStat, number>>;
  effects: EquipmentEffect[];
}

// ---------------------------------------------------------------------------
// Combat state
// ---------------------------------------------------------------------------

export interface CombatState {
  round: number;
  whoseTurn: "player" | "enemy";
  yourArmy: Army;
  enemyArmy: Army;
  spellCastThisTurn: boolean;
  log: string[];
  outcome: "ongoing" | "won" | "lost";

  // --- engine-internal extensions (the app may ignore) ---
  /** Stack ids commanded this turn (one command per stack). */
  actedStackIds: string[];
  /** Slain-enemy ledger for post-battle necromancy: sourceId -> creatures slain. */
  slainEnemies: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

export interface RunState {
  seed: string;
  hero: Hero;
  army: Stack[]; // the carried "rolling army ball"; empty => you lose
  gold: number;
  map: MapNode[];
  currentNodeId: string | null;
  act: number;
  combat: CombatState | null;
  outcome: "ongoing" | "won" | "lost";

  // --- engine-internal extensions ---
  clearedNodeIds: string[];
  pendingRewards: RewardChoice[] | null;
}

/** A single offered reward; `pickReward(run, index)` selects one. */
export type RewardChoice =
  | { kind: "recruit"; creatureId: string; count: number; cost: number }
  | { kind: "upgrade"; stackId: string; toCreatureId: string; cost: number }
  | { kind: "learn"; spellId: string; cost: number }
  | { kind: "buy"; artifactId: string; slot: ArtifactSlot; cost: number }
  | { kind: "raise"; creatureId: string; count: number }
  | { kind: "gold"; amount: number }
  | { kind: "skip" };
