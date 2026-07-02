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
 * Derive a `@mms/data` spell id from a spell NAME, mirroring the data's id
 * convention `spell_<name lowercased, runs of non-alphanumerics → "_">`.
 * "Armageddon" → "spell_armageddon"; "Stone Skin" → "spell_stone_skin". This is
 * PURE string work so the adapter never has to import the content corpus —
 * resolution (skipping ids with no record, e.g. "Misfortune") happens later in
 * the run layer via `spellById`. (COMBAT.md §19.)
 */
export function deriveSpellId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `spell_${slug}`;
}

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

  // Army-wide luck / morale (Clover of Luck "+1 Luck", "+1 Morale" artifacts).
  const luck = /([+-]?\d+)\s*luck/.exec(text);
  if (luck) effects.push({ kind: "luckAll", amount: parseInt(luck[1], 10) });

  const morale = /([+-]?\d+)\s*morale/.exec(text);
  if (morale) effects.push({ kind: "moraleAll", amount: parseInt(morale[1], 10) });

  const spellPts = /([+-]?\d+)\s*spell points/.exec(text);
  if (spellPts) effects.push({ kind: "manaMax", amount: parseInt(spellPts[1], 10) });

  if (text.includes("necromancy")) {
    // Cloak of the Undead King: "Greatly improves Necromancy".
    effects.push({ kind: "necromancyBonus", amount: 0.15 });
  }

  // --- Relic prose directives (COMBAT.md §19) -----------------------------
  // These parse to engine-internal effect kinds; the run layer resolves the
  // derived spell ids against the corpus (unresolved ones are skipped).

  // "Casts A, B, C(, and D) on ... combat" -> castOnStart with all listed names.
  // Anchored on the trailing " on … combat" so the directive is unambiguous;
  // captures the comma/and-separated name list that precedes it.
  const castsList = /casts\s+(.+?)\s+on\b.*?\bcombat/.exec(text);
  if (castsList) {
    const spellIds = splitSpellNames(castsList[1]).map(deriveSpellId);
    if (spellIds.length) effects.push({ kind: "castOnStart", spellIds });
  }

  // "(allows )?casting <SpellName>( as …)" -> grantSpell with that one spell.
  // Stops the name at " as ", a comma, a semicolon, or end-of-clause so a
  // trailing rank/qualifier ("as an expert") isn't folded into the name.
  const grants = /(?:allows\s+)?casting\s+([a-z0-9' ]+?)(?:\s+as\b|[,;]|$)/.exec(text);
  if (grants) {
    const id = deriveSpellId(grants[1]);
    effects.push({ kind: "grantSpell", spellIds: [id] });
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
  // heal wins over dispel so Cure (heal+dispel) stays a heal (with a reset rider
  // added in adaptSpell); a pure-dispel spell (Dispel) becomes `reset`. (§3.3)
  if (t.includes("heal") || t.includes("resurrect")) return "heal";
  if (t.includes("dispel")) return "reset";
  if (t.includes("disable")) return "disable";
  if (t.includes("buff")) return "buff";
  if (t.includes("debuff")) return "debuff";
  return "buff"; // terrain-only -> treated as a benign self/ally effect
}

export function adaptSpell(s: SourceSpell): CombatSpell {
  const tags = s.effectTags;
  const t = tags.map((x) => x.toLowerCase());
  const kind = kindFromTags(tags);
  const lvl = Math.max(1, Math.min(5, s.level));
  // LIGHT remaps key off the canonical source id (stable across runs).
  const id = s.id;

  let effect: SpellEffect;
  let targeting: SpellTargeting;

  if (kind === "damage") {
    targeting = targetingFromTags(tags, kind);
    const dmg: Extract<SpellEffect, { kind: "damage" }> = {
      kind: "damage",
      target: targeting,
      base: DAMAGE_BASE_BY_LEVEL[lvl],
      powerScale: DAMAGE_SCALE_BY_LEVEL[lvl],
    };
    // LIGHT §3.4/§3.5: the two all-units nukes hit BOTH armies. Death Ripple
    // honors undead immunity (the roster is all-undead → safe nuke); Armageddon
    // does NOT (friend-and-foe downside returns).
    if (id === "spell_death_ripple") {
      dmg.bothArmies = true;
      dmg.skipUndead = true;
    } else if (id === "spell_armageddon") {
      dmg.bothArmies = true;
    }
    effect = dmg;
  } else if (kind === "heal") {
    targeting = "allyStack";
    // LIGHT §3.3: Cure's otherwise-dead `dispel` tag gets a job — a reset rider.
    const reset = t.includes("dispel");
    effect = { kind: "heal", target: targeting, base: 10 * lvl, powerScale: 10, reset };
  } else if (kind === "reset") {
    // LIGHT §3.3: Dispel — set the enemy target back to its base creature stats.
    targeting = "enemyStack";
    effect = { kind: "reset", target: targeting, base: 0, powerScale: 0 };
  } else if (kind === "disable") {
    targeting = "enemyStack";
    effect = { kind: "disable", target: targeting, base: 1, powerScale: 0 };
  } else if (kind === "buff") {
    targeting = "allyStack";
    // LIGHT §3.2: Bless → roll-mode (ally always rolls max damage).
    if (id === "spell_bless") {
      effect = { kind: "rollmode", target: "allyStack", mode: "max", base: 0, powerScale: 0 };
    } else if (id === "spell_prayer") {
      // LIGHT §3.6: Prayer → +mag to attack AND defense AND speed.
      effect = { kind: "buffAll", target: "allyStack", base: 2 + lvl, powerScale: 1 };
    } else {
      const stat = t.includes("speed")
        ? "speed"
        : t.includes("defense")
          ? "defense"
          : t.includes("damage-increase") || t.includes("attack")
            ? "attack"
            : t.includes("ranged")
              ? "damage"
              : "attack";
      // LIGHT §3.7: Precision only buffs a back-rank ally (else it whiffs).
      const backRankOnly = id === "spell_precision";
      effect = { kind: "buff", target: targeting, stat, base: 2 + lvl, powerScale: 1, backRankOnly };
    }
  } else {
    // debuff
    targeting = "enemyStack";
    // LIGHT §3.2: Curse → roll-mode (enemy always rolls min damage).
    if (id === "spell_curse") {
      effect = { kind: "rollmode", target: "enemyStack", mode: "min", base: 0, powerScale: 0 };
    } else if (id === "spell_forgetfulness") {
      // LIGHT §3.7: Forgetfulness forces a shooter to melee (noShoot), not a stat hit.
      effect = { kind: "debuff", target: "enemyStack", stat: "attack", base: 2 + lvl, powerScale: 1, noShoot: true };
    } else {
      const stat = t.includes("speed")
        ? "speed"
        : t.includes("defense") || t.includes("damage-reduction")
          ? "defense"
          : "attack";
      effect = { kind: "debuff", target: targeting, stat, base: 2 + lvl, powerScale: 1 };
    }
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

/** Class base primary stats (HoMM3-flavored). Might classes (Death Knight,
 *  Knight, Barbarian) are attack/defense bruisers; magic classes (Necromancer)
 *  lean power/knowledge. +1 to the stat their specialty implies. Stronghold's
 *  Barbarian is the most martial (high attack, low magic). */
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
    case "Knight":
      // Castle might hero: strong defense, modest magic (Wisdom heroes still get
      // their +knowledge specialty bump on top of this).
      return { attack: 2, defense: 3, power: 1, knowledge: 1 };
    case "Cleric":
      // Castle magic hero: balanced caster.
      return { attack: 1, defense: 1, power: 2, knowledge: 2 };
    case "Barbarian":
      // Stronghold might hero: heaviest attack, almost no magic.
      return { attack: 3, defense: 2, power: 1, knowledge: 1 };
    case "Battle Mage":
      return { attack: 2, defense: 1, power: 2, knowledge: 1 };
    default:
      return { attack: 1, defense: 1, power: 1, knowledge: 1 };
  }
}

/**
 * A faction's starter spellbook ids (resolved against the corpus; missing ids
 * skipped). Necropolis keeps its offensive opener; Castle (good/order) leans on
 * Bless + a heal; Stronghold (might) gets only Haste — it wins by swinging, not
 * by casting. All factions get Magic Arrow as a baseline ranged option.
 */
function starterSpellIds(faction: string): string[] {
  switch (faction) {
    case "Necropolis":
      return ["spell_magic_arrow", "spell_bless", "spell_haste"];
    case "Castle":
      return ["spell_magic_arrow", "spell_bless", "spell_cure"];
    case "Stronghold":
      return ["spell_magic_arrow", "spell_haste"];
    default:
      return ["spell_magic_arrow", "spell_bless", "spell_haste"];
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

/**
 * Which creature a hero's specialty names, for the sensible starting army.
 * Faction-general: we match the specialty word against the NAMES of that
 * faction's base creatures (e.g. "Skeletons" → necropolis_skeleton, "Swordsmen"
 * → castle_swordsman, "Orcs" → stronghold_orc). Specialties that aren't a
 * creature (Speed, Offense, Estates, Ballista, …) return null — the army builder
 * falls back to the faction's tier-1/2 bread-and-butter. PURE: matching only.
 */
function specialtyCreatureId(
  specialty: string,
  factionBase: SourceCreature[],
): string | null {
  const s = specialty.toLowerCase().replace(/s$/, ""); // singularize ("Skeletons"→"skeleton")
  for (const c of factionBase) {
    const name = c.name.toLowerCase();
    if (name.includes(s) || s.includes(name)) return c.id;
  }
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

  // Starter spellbook — faction-flavored (see `starterSpellIds`). Each id is
  // resolved against the corpus; missing ones are skipped.
  const spellbook: CombatSpell[] = [];
  const byId = (id: string) => h && deps.spells.find((s) => s.id === id);
  for (const id of starterSpellIds(h.faction)) {
    const s = byId(id);
    if (s) spellbook.push(adaptSpell(s));
  }

  const maxMana = knowledge * MANA_PER_KNOWLEDGE;

  const hero: Hero = {
    id: h.id,
    name: h.name,
    heroClass: h.heroClass,
    specialty: h.specialty,
    faction: h.faction,
    attack,
    defense,
    power,
    knowledge,
    mana: maxMana,
    maxMana,
    level: 1,
    xp: 0,
    equipment: {},
    // No artifacts equipped at derive time, so the effective spellbook equals
    // the learned base spellbook (COMBAT.md §19). `recomputeHero` re-derives the
    // union once equipment is in play.
    spellbook: spellbook.slice(),
    skills,
    imageRef: h.imageRef,
    baseAttack: attack,
    baseDefense: defense,
    basePower: power,
    baseKnowledge: knowledge,
    baseSpellbook: spellbook,
  };

  // Starting army (FACTION-GENERAL): a big tier-1 core stack (the
  // bread-and-butter) plus a second stack — the hero's specialty creature if it
  // names a distinct one, else the faction's tier-2 base creature for a body.
  // The Necropolis/Galthran path is byte-identical to v0: 20 Skeleton (`_start`)
  // + 10 Walking Dead (`_start2`).
  const find = (id: string) => deps.creatures.find((c) => c.id === id);
  const factionBase = deps.creatures
    .filter((c) => c.faction === h.faction && !c.upgraded)
    .sort((a, b) => a.tier - b.tier);
  const startingArmy: Stack[] = [];

  const core = factionBase[0];
  if (core) startingArmy.push(adaptStack(core, 20, { idSuffix: "_start" }));

  const specId = specialtyCreatureId(h.specialty, factionBase);
  if (specId && specId !== core?.id) {
    const spec = find(specId)!;
    // Fewer of the stronger specialty creature.
    const n = spec.tier <= 2 ? 10 : spec.tier <= 4 ? 5 : 2;
    startingArmy.push(adaptStack(spec, n, { idSuffix: "_start2" }));
  } else {
    // No distinct specialty creature -> add the faction's tier-2 base for a body.
    const second = factionBase.find((c) => c.id !== core?.id);
    if (second) startingArmy.push(adaptStack(second, 10, { idSuffix: "_start2" }));
  }

  return { hero, startingArmy };
}

// ---------------------------------------------------------------------------
function tail(id: string): string {
  return id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
}

/**
 * Split a comma/and-separated spell-name list ("slow, curse, weakness, and
 * misfortune") into trimmed, non-empty names. Tolerates the Oxford "and" with or
 * without a preceding comma. (COMBAT.md §19.)
 */
function splitSpellNames(list: string): string[] {
  return list
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
