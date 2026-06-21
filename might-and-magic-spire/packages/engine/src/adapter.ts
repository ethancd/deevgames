// Source -> runtime adapters (v2, ARMY model). The seam where HoMM3 stat-blocks
// become engine objects. THIS IS DESIGN, NOT ENGINEERING — the balance choices
// live here and are documented in ADAPTER.md.
//
// RETIRED: the old card adapter `adapt(creature) -> CardDef` and its
// `adapt(fixtureCreature) === fixtureCard` invariant. Creatures no longer become
// cards; they become STACKS. The fixtureCard contract is gone.

import type {
  SourceArtifact,
  SourceCreature,
  SourceHero,
  SourceSpell,
} from "@mms/schema";
import type { ArtifactClass, Rarity } from "./schema-types";
import type {
  CombatSpell,
  Equipment,
  EquipmentEffect,
  Hero,
  PrimaryStat,
  Rank,
  SpellEffect,
  SpellTargeting,
  Stack,
} from "./types";

// ===========================================================================
// CREATURE -> STACK
// ===========================================================================

/** Back-rank creatures: anything that shoots or casts. Else front (melee). */
export function rankForCreature(c: SourceCreature): Rank {
  const a = c.abilities.map((x) => x.toLowerCase());
  const isBack = a.some(
    (x) => x.includes("shooter") || x.includes("ranged") || x.includes("caster"),
  );
  return isBack ? "back" : "front";
}

/**
 * Adapt a SourceCreature into a Stack of `count` of it. We carry the REAL HoMM3
 * stats verbatim — attack/defense/hp/damageMin/damageMax/speed/abilities — so
 * the battle math reads off the source numbers directly. The stack starts at
 * full strength: every creature at full hp (`hpTop = maxHpPer = hp`).
 */
export function adaptStack(
  c: SourceCreature,
  count: number,
  opts: { side?: Stack["side"]; idSuffix?: string } = {},
): Stack {
  const side = opts.side ?? "player";
  const suffix = opts.idSuffix ?? "";
  return {
    id: `stack_${tail(c.id)}${suffix}`,
    sourceId: c.id,
    creatureId: c.id, // app-facing alias of sourceId (art lookup)
    name: c.name,
    tier: c.tier,
    upgraded: c.upgraded,
    upgradeOf: c.upgradeOf,
    count,
    hpTop: c.hp,
    maxHpPer: c.hp,
    attack: c.attack,
    defense: c.defense,
    damageMin: c.damageMin,
    damageMax: c.damageMax,
    speed: c.speed,
    rank: rankForCreature(c),
    abilities: c.abilities.slice(),
    side,
    hasActed: false,
    isDefending: false,
    hasRetaliated: false,
    imageRef: c.imageRef,
    startCount: count,
  };
}

// ===========================================================================
// ARTIFACT -> EQUIPMENT
// ===========================================================================

/** ArtifactClass -> Rarity ladder (Relic shares 'rare' display rarity). */
export function rarityForArtifactClass(cls: ArtifactClass): Rarity {
  switch (cls) {
    case "Treasure":
      return "common";
    case "Minor":
      return "uncommon";
    case "Major":
      return "rare";
    case "Relic":
      return "rare";
  }
}

const STAT_WORD: Record<string, PrimaryStat> = {
  attack: "attack",
  defense: "defense",
  power: "power",
  knowledge: "knowledge",
};

/**
 * Parse a `bonuses` string into primary-stat deltas + special effects.
 * Examples handled:
 *   "+2 Attack"                     -> { attack: 2 }
 *   "+1 Attack, +1 Defense"         -> { attack: 1, defense: 1 }
 *   "+3 to all primary skills"      -> { attack/defense/power/knowledge: 3 }
 *   "+12 Attack, +12 Defense, +500 spell points" -> deltas + manaMax 500
 *   "+1 Health point per creature"  -> effect hpPerCreature 1
 *   "+1 Speed to all creatures..."  -> effect speedAll 1
 *   "Greatly improves Necromancy"   -> effect necromancyBonus (Cloak)
 */
export function parseBonuses(bonuses: string): {
  primaryDeltas: Partial<Record<PrimaryStat, number>>;
  effects: EquipmentEffect[];
} {
  const text = bonuses.toLowerCase();
  const primaryDeltas: Partial<Record<PrimaryStat, number>> = {};
  const effects: EquipmentEffect[] = [];

  // "+N to all primary skills" -> +N to each.
  const allPrimary = /([+-]?\d+)\s*to all primary/.exec(text);
  if (allPrimary) {
    const n = parseInt(allPrimary[1], 10);
    primaryDeltas.attack = (primaryDeltas.attack ?? 0) + n;
    primaryDeltas.defense = (primaryDeltas.defense ?? 0) + n;
    primaryDeltas.power = (primaryDeltas.power ?? 0) + n;
    primaryDeltas.knowledge = (primaryDeltas.knowledge ?? 0) + n;
  }

  // Each "+N <stat>" clause where <stat> is a primary stat word.
  const re = /([+-]?\d+)\s+([a-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const word = m[2];
    const stat = STAT_WORD[word];
    if (stat) primaryDeltas[stat] = (primaryDeltas[stat] ?? 0) + n;
  }

  // Special, machine-readable effects.
  const hpPer = /([+-]?\d+)\s*health point per creature/.exec(text);
  if (hpPer) effects.push({ kind: "hpPerCreature", amount: parseInt(hpPer[1], 10) });

  const spd = /([+-]?\d+)\s*speed to all creatures/.exec(text);
  if (spd) effects.push({ kind: "speedAll", amount: parseInt(spd[1], 10) });

  const spellPts = /([+-]?\d+)\s*spell points/.exec(text);
  if (spellPts) effects.push({ kind: "manaMax", amount: parseInt(spellPts[1], 10) });

  if (text.includes("necromancy")) {
    // Cloak of the Undead King: "Greatly improves Necromancy".
    effects.push({ kind: "necromancyBonus", amount: 0.15 });
  }

  return { primaryDeltas, effects };
}

export function adaptEquipment(a: SourceArtifact): Equipment {
  const { primaryDeltas, effects } = parseBonuses(a.bonuses);
  return {
    id: `equip_${tail(a.id)}`,
    sourceId: a.id,
    name: a.name,
    slot: a.slot,
    rarity: rarityForArtifactClass(a.class),
    description: a.bonuses,
    imageRef: a.imageRef,
    primaryDeltas,
    effects: effects.length ? effects : [{ kind: "none" }],
  };
}

// ===========================================================================
// SPELL -> COMBAT SPELL
// ===========================================================================

/**
 * powerScale table — GREENFIELD. The schema only gives effectTags + description;
 * the per-point Power scaling is pure design and the single biggest tuning lever.
 * Magnitude resolves at cast time as `base + powerScale * hero.power`.
 *
 * Damage spells scale by spell level (a level-5 nuke hits far harder than a
 * level-1 Magic Arrow); heals/buffs/debuffs use flat-ish curves.
 */
const DAMAGE_BASE_BY_LEVEL = [0, 10, 18, 28, 45, 70]; // index by level 1..5
const DAMAGE_SCALE_BY_LEVEL = [0, 10, 12, 15, 18, 22];

function targetingFromTags(tags: string[], kind: SpellEffect["kind"]): SpellTargeting {
  const t = tags.map((x) => x.toLowerCase());
  if (t.includes("all-units")) return "allEnemies"; // battlefield-wide damage hits enemies primarily
  if (t.includes("area") || t.includes("multi-target") || t.includes("chain"))
    return "enemyStack"; // engine v1 resolves area as single-stack (lever)
  const isFriendly =
    kind === "heal" || kind === "buff" || t.includes("undead-synergy");
  if (kind === "damage" || kind === "debuff") return "enemyStack";
  if (kind === "disable") return "enemyStack";
  return isFriendly ? "allyStack" : "enemyStack";
}

/** Classify a spell's mechanical kind from its effectTags. */
function kindFromTags(tags: string[]): SpellEffect["kind"] {
  const t = tags.map((x) => x.toLowerCase());
  if (t.includes("damage")) return "damage";
  if (t.includes("heal") || t.includes("resurrect")) return "heal";
  if (t.includes("disable")) return "disable";
  if (t.includes("buff")) return "buff";
  if (t.includes("debuff")) return "debuff";
  return "buff"; // dispel/terrain-only -> treated as a benign self/ally effect
}

export function adaptSpell(s: SourceSpell): CombatSpell {
  const tags = s.effectTags;
  const t = tags.map((x) => x.toLowerCase());
  const kind = kindFromTags(tags);
  const lvl = Math.max(1, Math.min(5, s.level));

  let effect: SpellEffect;
  let targeting: SpellTargeting;

  if (kind === "damage") {
    targeting = targetingFromTags(tags, kind);
    effect = {
      kind: "damage",
      target: targeting,
      base: DAMAGE_BASE_BY_LEVEL[lvl],
      powerScale: DAMAGE_SCALE_BY_LEVEL[lvl],
    };
  } else if (kind === "heal") {
    targeting = "allyStack";
    effect = { kind: "heal", target: targeting, base: 10 * lvl, powerScale: 10 };
  } else if (kind === "disable") {
    targeting = "enemyStack";
    effect = { kind: "disable", target: targeting, base: 1, powerScale: 0 };
  } else if (kind === "buff") {
    targeting = "allyStack";
    const stat = t.includes("speed")
      ? "speed"
      : t.includes("defense")
        ? "defense"
        : t.includes("damage-increase") || t.includes("attack")
          ? "attack"
          : t.includes("ranged")
            ? "damage"
            : "attack";
    effect = { kind: "buff", target: targeting, stat, base: 2 + lvl, powerScale: 1 };
  } else {
    targeting = "enemyStack";
    const stat = t.includes("speed")
      ? "speed"
      : t.includes("defense") || t.includes("damage-reduction")
        ? "defense"
        : "attack";
    effect = { kind: "debuff", target: targeting, stat, base: 2 + lvl, powerScale: 1 };
  }

  return {
    id: `spell_${tail(s.id)}`,
    name: s.name,
    school: s.school,
    level: s.level,
    manaCost: s.manaCost,
    description: s.description,
    targeting,
    imageRef: s.imageRef,
    effect,
  };
}

// ===========================================================================
// HERO -> DERIVED HERO
// ===========================================================================

export const MANA_PER_KNOWLEDGE = 10;

/** Class base primary stats (HoMM3-flavored). Death Knight is a might/necro
 *  bruiser; Necromancer leans magic. +1 to the stat their specialty implies. */
function classBaseStats(heroClass: string): {
  attack: number;
  defense: number;
  power: number;
  knowledge: number;
} {
  switch (heroClass) {
    case "Death Knight":
      return { attack: 2, defense: 2, power: 1, knowledge: 1 };
    case "Necromancer":
      return { attack: 1, defense: 1, power: 2, knowledge: 2 };
    default:
      return { attack: 1, defense: 1, power: 1, knowledge: 1 };
  }
}

/** Which primary a specialty/skill nudges (+1). */
function specialtyBonus(specialty: string): Partial<
  Record<PrimaryStat, number>
> {
  const s = specialty.toLowerCase();
  if (s.includes("wisdom") || s.includes("intelligence")) return { knowledge: 1 };
  if (s.includes("sorcery") || s.includes("meteor") || s.includes("ripple"))
    return { power: 1 };
  if (s.includes("offense") || s.includes("knight")) return { attack: 1 };
  if (s.includes("armor")) return { defense: 1 };
  // Creature specialties (Skeletons, Vampires, ...) nudge attack — a martial
  // commander who leads that creature into battle.
  return { attack: 1 };
}

/** Which creature a hero's specialty implies, for the sensible starting army. */
function specialtyCreatureId(specialty: string): string | null {
  const s = specialty.toLowerCase();
  if (s.includes("skeleton")) return "necropolis_skeleton";
  if (s.includes("walking dead") || s.includes("zombie")) return "necropolis_walking_dead";
  if (s.includes("wight")) return "necropolis_wight";
  if (s.includes("vampire")) return "necropolis_vampire";
  if (s.includes("lich")) return "necropolis_lich";
  if (s.includes("black knight")) return "necropolis_black_knight";
  return null;
}

/**
 * Derive a runtime Hero from a SourceHero. Primary stats from class + specialty,
 * maxMana from knowledge, a sensible starting army, a starter spellbook, and the
 * hero's skills (Necromancy seeded to rank 1 for necro heroes).
 *
 * `allCreatures` / `allSpells` are passed so the engine layer can supply the
 * @mms/data corpus without the adapter importing content directly.
 */
export function deriveHero(
  h: SourceHero,
  deps: {
    creatures: SourceCreature[];
    spells: SourceSpell[];
  },
): { hero: Hero; startingArmy: Stack[] } {
  const base = classBaseStats(h.heroClass);
  const bonus = specialtyBonus(h.specialty);
  const attack = base.attack + (bonus.attack ?? 0);
  const defense = base.defense + (bonus.defense ?? 0);
  const power = base.power + (bonus.power ?? 0);
  const knowledge = base.knowledge + (bonus.knowledge ?? 0);

  // Skills: seed from startingSkills (rank 1 each).
  const skills: Record<string, number> = {};
  for (const s of h.startingSkills) skills[s] = 1;

  // Starter spellbook: Magic Arrow always; plus Curse if available (cheap debuff).
  const spellbook: CombatSpell[] = [];
  const byId = (id: string) => h && deps.spells.find((s) => s.id === id);
  const starterSpellIds = ["spell_magic_arrow", "spell_bless", "spell_haste"];
  for (const id of starterSpellIds) {
    const s = byId(id);
    if (s) spellbook.push(adaptSpell(s));
  }

  const maxMana = knowledge * MANA_PER_KNOWLEDGE;

  const hero: Hero = {
    id: h.id,
    name: h.name,
    heroClass: h.heroClass,
    specialty: h.specialty,
    attack,
    defense,
    power,
    knowledge,
    mana: maxMana,
    maxMana,
    equipment: {},
    spellbook,
    skills,
    imageRef: h.imageRef,
    baseAttack: attack,
    baseDefense: defense,
    basePower: power,
    baseKnowledge: knowledge,
  };

  // Starting army: a big stack of Skeletons (the bread-and-butter) plus a stack
  // of the hero's specialty creature if it differs.
  const find = (id: string) => deps.creatures.find((c) => c.id === id);
  const startingArmy: Stack[] = [];
  const skeleton = find("necropolis_skeleton");
  if (skeleton) startingArmy.push(adaptStack(skeleton, 20, { idSuffix: "_start" }));

  const specId = specialtyCreatureId(h.specialty);
  if (specId && specId !== "necropolis_skeleton") {
    const spec = find(specId);
    if (spec) {
      // Fewer of the stronger specialty creature.
      const n = spec.tier <= 2 ? 10 : spec.tier <= 4 ? 5 : 2;
      startingArmy.push(adaptStack(spec, n, { idSuffix: "_start2" }));
    }
  } else {
    // No distinct specialty creature -> add a stack of Walking Dead for a body.
    const wd = find("necropolis_walking_dead");
    if (wd) startingArmy.push(adaptStack(wd, 10, { idSuffix: "_start2" }));
  }

  return { hero, startingArmy };
}

// ---------------------------------------------------------------------------
function tail(id: string): string {
  return id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
}
