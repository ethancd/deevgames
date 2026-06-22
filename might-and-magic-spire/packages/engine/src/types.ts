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
  /** The hero's faction — "Necropolis" | "Castle" | "Stronghold". Drives the
   *  run's growth (Necromancy is skill-gated) and dwelling recruit pool. Set by
   *  `deriveHero`; optional so test/enemy hero literals needn't carry it (the
   *  canonical run faction lives on `RunState.faction`). */
  faction?: string;

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
  /**
   * Combat spells the hero may cast (one per turn). EFFECTIVE spellbook: the
   * union of `baseSpellbook` (learned) and any spells GRANTED by equipped
   * artifacts (COMBAT.md §19). The app reads THIS field. Rebuilt by
   * `recomputeHero` on every equip/unequip.
   */
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

  /**
   * engine-internal: the LEARNED spellbook (starting spells + shrine-learned),
   * WITHOUT artifact-granted spells. `recomputeHero` rebuilds the effective
   * `spellbook` as `baseSpellbook` ∪ {granted spells} so equipping/unequipping
   * an artifact adds/removes its granted spells without ever dropping a learned
   * one. The app never reads this — it reads the effective `spellbook`.
   * (COMBAT.md §19.)
   */
  baseSpellbook: CombatSpell[];
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
  /**
   * App-facing alias of `sourceId` (the pinned app contract names this
   * `creatureId` and uses it for art lookup). Kept in lockstep with `sourceId`
   * in every Stack constructor so the seam needs no per-field translation.
   */
  creatureId: string;
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
  /**
   * Extra-retaliation budget tracking (COMBAT.md §20 / Item F). How many times
   * this stack has retaliated so far THIS round. Default 0; reset at round start
   * alongside `hasRetaliated`. A stack may retaliate while
   * `retaliationsUsed < retaliationBudget(stack)` (1 normally, 2 for "Two
   * retaliations", ∞ for "Unlimited retaliation"). `hasRetaliated` is kept in
   * lockstep for back-compat (true once a stack has retaliated ≥1 time).
   */
  retaliationsUsed?: number;

  /** Honest telegraph for enemy stacks (undefined for the player's). */
  telegraph?: Telegraph;
  imageRef: string;

  // --- engine-internal: battle-start count, the cap for life-drain resurrect. ---
  startCount: number;

  // --- engine-internal LIGHT-balance fields (additive; the app never reads
  //     these — they only steer combat math) ---
  /**
   * Forgetfulness: when set, `isShooter` returns false, forcing a back-rank
   * shooter to melee (it eats retaliation and loses reach). Permanent for the
   * battle, like every other LIGHT debuff. (BALANCE_PROPOSALS §3 item 7.)
   */
  noShoot?: boolean;
  /**
   * Blind (`disable`): the stack's pre-zero damage roll, stored when Blind
   * zeroes it so the NEXT action by this stack can restore it — Blind costs the
   * target one action, then wears off. (BALANCE_PROPOSALS §3 item 8.)
   */
  blindedFrom?: { damageMin: number; damageMax: number };

  // --- engine-internal BATCH-balance fields (additive; the app never reads
  //     these). See COMBAT.md §16/§17. ---
  /**
   * No-re-stack (open-Q #2): the ids of stat-mod spells already applied to this
   * stack. A buff/buffAll/debuff/rollmode spell whose id is already present is a
   * NO-OP on recast — the SAME spell can't re-stack, but DIFFERENT spells still
   * stack (Curse + Weakness both apply). (COMBAT.md §16 / item A.)
   */
  spellMarks?: string[];
  /**
   * Ghost Dragon "Aging" on-hit: once per defender, the stack's `maxHpPer` is
   * halved (floored at 1) and its pool re-clamped — flagged so it fires once.
   * (COMBAT.md §17 / item D.3.)
   */
  aged?: boolean;
  /**
   * Zombie "Disease" on-hit: once per defender, `-DISEASE_ATK` attack and
   * `-DISEASE_DEF` defense (floored at 0). Flagged so it fires once.
   * (COMBAT.md §17 / item D.4.)
   */
  diseased?: boolean;
  /**
   * Black/Dread Knight "Curse" on-hit (distinct from the Curse SPELL): once per
   * defender, set to min-roll (`damageMax = damageMin`). Flagged so it fires
   * once. (COMBAT.md §17 / item D.5.)
   */
  cursed?: boolean;
  /**
   * Behemoth / Ancient Behemoth "Reduces enemy defense" on-hit: once per
   * defender, `-DEFENSE_SHRED_*` defense (floored at 0). Ancient shreds more.
   * Flagged so it fires once. (COMBAT.md §21 / Item G.)
   */
  defenseShred?: boolean;
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
  | {
      kind: "damage";
      target: SpellTargeting;
      base: number;
      powerScale: number;
      /**
       * LIGHT: when true the all-units loop hits BOTH armies (friend and foe),
       * not just enemies — Armageddon (no skip) and Death Ripple (with
       * `skipUndead`). (BALANCE_PROPOSALS §3 items 4 & 5.)
       */
      bothArmies?: boolean;
      /** LIGHT: skip any stack with the `undead` ability — Death Ripple's
       *  signature "safe nuke" on an all-undead roster. (§3 item 4.) */
      skipUndead?: boolean;
    }
  | { kind: "heal"; target: SpellTargeting; base: number; powerScale: number; /** LIGHT: Cure rider — also reset the healed ally to base stats. (§3 item 3.) */ reset?: boolean }
  | {
      kind: "buff";
      target: SpellTargeting;
      stat: "attack" | "defense" | "speed" | "damage";
      base: number;
      powerScale: number;
      /**
       * LIGHT: Precision only buffs a back-rank ally (else it whiffs).
       * (BALANCE_PROPOSALS §3 item 7.)
       */
      backRankOnly?: boolean;
    }
  // LIGHT: Prayer — apply +mag to attack AND defense AND speed on one ally.
  // (BALANCE_PROPOSALS §3 item 6.)
  | { kind: "buffAll"; target: SpellTargeting; base: number; powerScale: number }
  | {
      kind: "debuff";
      target: SpellTargeting;
      stat: "attack" | "defense" | "speed";
      base: number;
      powerScale: number;
      /** LIGHT: Forgetfulness sets the enemy target's `noShoot` flag instead of
       *  a stat delta — a shooter forced to melee. (§3 item 7.) */
      noShoot?: boolean;
    }
  // LIGHT: roll-mode — Bless (ally → always max roll) / Curse (enemy → always
  // min roll). Reuses the damage-roll edit the disable path uses. (§3 item 2.)
  | { kind: "rollmode"; target: SpellTargeting; mode: "max" | "min"; base: number; powerScale: number }
  // LIGHT: reset — Dispel sets the target back to its BASE creature stats,
  // undoing any buff or debuff. Pure base-stat lookup. (§3 item 3.)
  | { kind: "reset"; target: SpellTargeting; base: number; powerScale: number }
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
  /**
   * Relic plumbing (COMBAT.md §19): an artifact that GRANTS castable spells to
   * the wielder's spellbook while equipped. `recomputeHero` unions these (resolved
   * via `spellById`) into `hero.spellbook` on top of `baseSpellbook`, and they
   * fall away on unequip. e.g. Armageddon's Blade → ["spell_armageddon"].
   */
  | { kind: "grantSpell"; spellIds: string[] }
  /**
   * Relic plumbing (COMBAT.md §19): an artifact that SCRIPT-CASTS spells on every
   * enemy stack at the start of combat (`openCombat`), magnitude scaling off the
   * wielder's power like a normal cast. Unresolved ids (e.g. `spell_misfortune`,
   * which has no data record) are skipped. e.g. Armor of the Damned →
   * ["spell_slow","spell_curse","spell_weakness","spell_misfortune"].
   */
  | { kind: "castOnStart"; spellIds: string[] }
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
  /** The run's faction (the chosen hero's faction). Drives the dwelling recruit
   *  pool (you grow your OWN faction) and growth gating. Optional on the app
   *  side; the engine always sets it in startRun. */
  faction?: string;
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
  /** Structured strikes from the MOST RECENT op, for the UI to animate as
   *  damage popups. Replaced on each op; survives combat settlement. */
  lastEvents?: CombatEvent[];
}

/** A single resolved strike, for damage popups. `side` is who threw it. */
export interface CombatEvent {
  kind: "attack" | "retaliate" | "spell";
  side: Side;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  damage: number;
  killed: number;
}

/** A predicted attack outcome — damage range and creatures slain at each end. */
export interface DamageForecast {
  damageMin: number;
  damageMax: number;
  killsMin: number;
  killsMax: number;
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
