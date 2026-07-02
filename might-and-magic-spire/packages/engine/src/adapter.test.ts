import { describe, it, expect } from "vitest";
import {
  adaptStack,
  adaptEquipment,
  adaptSpell,
  deriveHero,
  parseBonuses,
  rankForCreature,
  MANA_PER_KNOWLEDGE,
} from "./adapter";
import {
  CREATURES,
  SPELLS,
  ARTIFACTS,
  creatureById,
  spellById,
  artifactById,
  heroById,
} from "./content";

// The old `adapt(fixtureCreature) === fixtureCard` invariant is RETIRED:
// creatures no longer become cards, they become STACKS. There is no card adapter.

describe("adaptStack (creature -> stack)", () => {
  it("carries the REAL HoMM3 stats verbatim and full hp", () => {
    const skel = creatureById("necropolis_skeleton")!;
    const s = adaptStack(skel, 10);
    expect(s.attack).toBe(skel.attack);
    expect(s.defense).toBe(skel.defense);
    expect(s.damageMin).toBe(skel.damageMin);
    expect(s.damageMax).toBe(skel.damageMax);
    expect(s.speed).toBe(skel.speed);
    expect(s.count).toBe(10);
    expect(s.hpTop).toBe(skel.hp);
    expect(s.maxHpPer).toBe(skel.hp);
    expect(s.startCount).toBe(10);
    expect(s.abilities).toEqual(skel.abilities);
  });

  it("places shooters/ranged in the back rank, melee in the front", () => {
    const lich = creatureById("necropolis_lich")!; // Ranged
    const skel = creatureById("necropolis_skeleton")!; // melee
    expect(rankForCreature(lich)).toBe("back");
    expect(rankForCreature(skel)).toBe("front");
    expect(adaptStack(lich, 1).rank).toBe("back");
    expect(adaptStack(skel, 1).rank).toBe("front");
  });
});

describe("adaptEquipment (artifact -> equipment)", () => {
  it("parses Centaur's Axe +2 Attack into primaryDeltas {attack:2}", () => {
    const axe = artifactById("artifact_centaurs_axe")!;
    const eq = adaptEquipment(axe);
    expect(eq.primaryDeltas).toEqual({ attack: 2 });
    expect(eq.slot).toBe("RightHand");
    expect(eq.name).toBe("Centaur's Axe");
  });

  it("parses multi-stat bonuses (+1 Attack, +1 Defense)", () => {
    const eye = artifactById("artifact_quiet_eye_of_the_dragon")!;
    const eq = adaptEquipment(eye);
    expect(eq.primaryDeltas).toEqual({ attack: 1, defense: 1 });
  });

  it("parses '+3 to all primary skills'", () => {
    const { primaryDeltas } = parseBonuses("+3 to all primary skills");
    expect(primaryDeltas).toEqual({ attack: 3, defense: 3, power: 3, knowledge: 3 });
  });

  it("parses spell points into a manaMax effect", () => {
    const sword = artifactById("artifact_sword_of_judgement")!;
    const eq = adaptEquipment(sword);
    expect(eq.primaryDeltas.attack).toBe(12);
    expect(eq.primaryDeltas.defense).toBe(12);
    expect(eq.effects).toContainEqual({ kind: "manaMax", amount: 500 });
  });

  it("detects the Cloak of the Undead King necromancy bonus", () => {
    const cloak = artifactById("artifact_cloak_of_the_undead_king")!;
    const eq = adaptEquipment(cloak);
    expect(eq.effects.some((e) => e.kind === "necromancyBonus")).toBe(true);
  });

  it("parses per-creature hp and army speed effects", () => {
    const ring = artifactById("artifact_ring_of_vitality")!;
    expect(adaptEquipment(ring).effects).toContainEqual({ kind: "hpPerCreature", amount: 1 });
    const neck = artifactById("artifact_necklace_of_swiftness")!;
    expect(adaptEquipment(neck).effects).toContainEqual({ kind: "speedAll", amount: 1 });
  });

  it("parses army-wide luck and morale from bonus text (§24)", () => {
    expect(parseBonuses("+1 Luck").effects).toContainEqual({ kind: "luckAll", amount: 1 });
    expect(parseBonuses("+1 Morale, increased movement on land").effects).toContainEqual({
      kind: "moraleAll",
      amount: 1,
    });
  });
});

describe("adaptSpell (spell -> combat spell)", () => {
  it("turns Magic Arrow into a single-target damage spell", () => {
    const arrow = spellById("spell_magic_arrow")!;
    const s = adaptSpell(arrow);
    expect(s.effect.kind).toBe("damage");
    expect(s.targeting).toBe("enemyStack");
    expect(s.manaCost).toBe(arrow.manaCost);
    if (s.effect.kind === "damage") {
      expect(s.effect.base).toBeGreaterThan(0);
      expect(s.effect.powerScale).toBeGreaterThan(0);
    }
  });

  it("classifies heal/resurrect spells as heal onto allies", () => {
    const res = adaptSpell(spellById("spell_resurrection")!);
    expect(res.effect.kind).toBe("heal");
    expect(res.targeting).toBe("allyStack");
  });

  it("classifies buffs onto allies and debuffs onto enemies", () => {
    expect(adaptSpell(spellById("spell_haste")!).effect.kind).toBe("buff");
    expect(adaptSpell(spellById("spell_haste")!).targeting).toBe("allyStack");
    expect(adaptSpell(spellById("spell_slow")!).effect.kind).toBe("debuff");
    expect(adaptSpell(spellById("spell_slow")!).targeting).toBe("enemyStack");
  });

  it("adapts every combat spell without throwing", () => {
    for (const s of SPELLS) expect(() => adaptSpell(s)).not.toThrow();
  });
});

describe("deriveHero (source hero -> runtime hero)", () => {
  it("derives Galthran (Death Knight, Skeletons) with A2 D2 P1 K1 +specialty", () => {
    const galthran = heroById("hero_galthran")!;
    const { hero, startingArmy } = deriveHero(galthran, { creatures: CREATURES, spells: SPELLS });
    // Death Knight base {A2,D2,P1,K1}; Skeletons specialty nudges attack +1.
    expect(hero.attack).toBe(3);
    expect(hero.defense).toBe(2);
    expect(hero.power).toBe(1);
    expect(hero.knowledge).toBe(1);
    expect(hero.maxMana).toBe(hero.knowledge * MANA_PER_KNOWLEDGE);
    expect(hero.mana).toBe(hero.maxMana);
    expect(hero.skills["Necromancy"]).toBe(1);
    expect(hero.spellbook.some((s) => s.name === "Magic Arrow")).toBe(true);
    // Sensible starting army: at least a skeleton stack.
    expect(startingArmy.length).toBeGreaterThan(0);
    expect(startingArmy.some((s) => s.sourceId === "necropolis_skeleton")).toBe(true);
  });

  it("Necromancer class leans magic (A1 D1 P2 K2)", () => {
    const thant = heroById("hero_thant")!; // Necromancer, Animate Dead
    const { hero } = deriveHero(thant, { creatures: CREATURES, spells: SPELLS });
    expect(hero.power).toBeGreaterThanOrEqual(2);
    expect(hero.knowledge).toBeGreaterThanOrEqual(2);
  });

  it("derives every Necropolis hero without throwing", () => {
    for (const a of ARTIFACTS) expect(() => adaptEquipment(a)).not.toThrow();
  });
});
