// The runtime contract — pinned by the orchestrator. The frontend imports these
// shapes from @mms/engine (re-exported via index.ts), NOT from @mms/schema.
//
// You MAY add fields, but must not rename/remove the pinned ones.

import type { CardDef } from "@mms/schema";
import type { Rarity } from "./schema-types";

export type NodeType = "combat" | "elite" | "event" | "shop" | "rest" | "boss";

export interface Intent {
  kind: "attack" | "block" | "buff" | "debuff" | "unknown";
  value?: number; // telegraphed magnitude, e.g. incoming damage
  label: string; // display text, e.g. "Attacks for 6"
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  intent: Intent; // next telegraphed action
  imageRef: string;

  // --- engine-internal extensions (additive; UI may ignore) ---
  /** Flat bonus added to this enemy's attack damage (from "buff" intents). */
  strength: number;
  /** The id of the SourceCreature this enemy was adapted from. */
  sourceId: string;
  /** Deterministic, repeating intent script; index cycles each enemy turn. */
  intentScript: Intent[];
  /** Position in `intentScript` for the *current* telegraphed intent. */
  intentIndex: number;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity; // derived from ArtifactClass
  description: string;
  imageRef: string;

  // --- engine-internal extensions ---
  /** Machine-readable hook so combat can apply the relic without parsing text. */
  effect: RelicEffect;
}

/** What a relic *does*, mechanically. Kept tiny and declarative. */
export type RelicEffect =
  | { kind: "startBlock"; amount: number } // gain block at start of each combat
  | { kind: "startStrength"; amount: number } // +damage to all your attacks
  | { kind: "maxHp"; amount: number } // raise max HP (applied at acquisition)
  | { kind: "startEnergy"; amount: number } // +energy each turn
  | { kind: "drawBonus"; amount: number } // +cards drawn each turn
  | { kind: "none" }; // flavor only

export interface CombatState {
  turn: number;
  energy: number;
  maxEnergy: number;
  playerHp: number;
  playerMaxHp: number;
  playerBlock: number;
  hand: CardDef[];
  drawCount: number; // pile sizes; identities hidden from UI
  discardCount: number;
  enemies: Enemy[];
  outcome: "ongoing" | "won" | "lost";

  // --- engine-internal extensions ---
  /** Player's accumulated Strength (flat bonus to attack damage). */
  playerStrength: number;
  /** Hidden draw pile (ordered; top = index 0). */
  drawPile: CardDef[];
  /** Hidden discard pile. */
  discardPile: CardDef[];
  /** Per-combat log of resolved events, for tests / replays / UI ticker. */
  log: string[];
}

export interface MapNode {
  id: string;
  type: NodeType;
  row: number;
  col: number;
  next: string[]; // ids of reachable nodes in the next row
}

export interface RunState {
  seed: string;
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardDef[];
  relics: Relic[];
  map: MapNode[];
  currentNodeId: string | null;
  act: number;
  combat: CombatState | null;
  outcome: "ongoing" | "won" | "lost";

  // --- engine-internal extensions ---
  /** Node ids already visited/cleared this act. */
  clearedNodeIds: string[];
  /** Pending reward choices after clearing a node (cards/relics/gold). */
  pendingRewards: RewardChoice[] | null;
}

/** A single offered reward; `pickReward(run, index)` selects one. */
export type RewardChoice =
  | { kind: "card"; card: CardDef }
  | { kind: "relic"; relic: Relic }
  | { kind: "gold"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "skip" };
