// Relic plumbing (COMBAT.md §19): the two HoMM3 Relics whose PROSE directives
// now deliver — Armageddon's Blade GRANTS Armageddon to the spellbook, and Armor
// of the Damned SCRIPT-CASTS Slow/Curse/Weakness on every enemy stack at combat
// start. Additive, engine-internal, deterministic.

import { describe, it, expect } from "vitest";
import { adaptEquipment, adaptSpell, deriveSpellId } from "./adapter";
import { artifactById, creatureById, spellById } from "./content";
import {
  startRun,
  chooseNode,
  legalNextNodes,
  equipArtifact,
  unequipArtifact,
  learnAt,
  recomputeHero,
} from "./run";
import type { EquipmentEffect } from "./types";

const ARMAGEDDONS_BLADE = "artifact_armageddons_blade";
const ARMOR_OF_THE_DAMNED = "artifact_armor_of_the_damned";

function effectsOf(artifactId: string): EquipmentEffect[] {
  return adaptEquipment(artifactById(artifactId)!).effects;
}

// ===========================================================================
// deriveSpellId — the pure name → data-id convention
// ===========================================================================

describe("deriveSpellId mirrors the @mms/data id convention", () => {
  it("lowercases and slugifies non-alphanumerics to underscores", () => {
    expect(deriveSpellId("Armageddon")).toBe("spell_armageddon");
    expect(deriveSpellId("Slow")).toBe("spell_slow");
    expect(deriveSpellId("Stone Skin")).toBe("spell_stone_skin");
    expect(deriveSpellId("Misfortune")).toBe("spell_misfortune");
  });
});

// ===========================================================================
// PARSING — adaptEquipment yields the new effect kinds (and keeps stat deltas)
// ===========================================================================

describe("adaptEquipment parses Relic prose directives", () => {
  it("Armageddon's Blade → grantSpell [spell_armageddon] AND +3 to all primaries", () => {
    const eq = adaptEquipment(artifactById(ARMAGEDDONS_BLADE)!);
    expect(eq.primaryDeltas).toEqual({ attack: 3, defense: 3, power: 3, knowledge: 3 });
    expect(eq.effects).toContainEqual({ kind: "grantSpell", spellIds: ["spell_armageddon"] });
  });

  it("Armageddon's Blade does NOT parse 'immunity to Armageddon' into any effect", () => {
    const kinds = effectsOf(ARMAGEDDONS_BLADE).map((e) => e.kind);
    // No immunity subsystem; the directive is ignored (only grantSpell present).
    expect(kinds).not.toContain("castOnStart");
    expect(kinds.filter((k) => k === "grantSpell")).toHaveLength(1);
  });

  it("Armor of the Damned → castOnStart incl. slow/curse/weakness AND +4 Defense", () => {
    const eq = adaptEquipment(artifactById(ARMOR_OF_THE_DAMNED)!);
    // §16 Item C stat stick survives.
    expect(eq.primaryDeltas.defense).toBe(4);
    const cast = eq.effects.find((e) => e.kind === "castOnStart");
    expect(cast).toBeDefined();
    const ids = (cast as Extract<EquipmentEffect, { kind: "castOnStart" }>).spellIds;
    expect(ids).toContain("spell_slow");
    expect(ids).toContain("spell_curse");
    expect(ids).toContain("spell_weakness");
    // Misfortune is listed in the prose; it derives but has no data record.
    expect(ids).toContain("spell_misfortune");
  });
});

// ===========================================================================
// GRANT-SPELL → effective spellbook (engine-internal baseSpellbook union)
// ===========================================================================

describe("grantSpell unions into hero.spellbook on equip, drops on unequip", () => {
  it("equipping Armageddon's Blade makes Armageddon castable; unequipping removes it", () => {
    let r = startRun("relic-grant");
    expect(r.hero.spellbook.some((s) => s.id === "spell_armageddon")).toBe(false);

    r = equipArtifact(r, ARMAGEDDONS_BLADE, "RightHand");
    expect(r.hero.spellbook.some((s) => s.id === "spell_armageddon")).toBe(true);
    // baseSpellbook (learned) is untouched by the grant.
    expect(r.hero.baseSpellbook.some((s) => s.id === "spell_armageddon")).toBe(false);

    r = unequipArtifact(r, "RightHand");
    expect(r.hero.spellbook.some((s) => s.id === "spell_armageddon")).toBe(false);
  });

  it("a shrine-LEARNED spell survives an equip/unequip cycle of a grant Relic", () => {
    let r = startRun("relic-learn-survive");
    // Learn Armageddon at a shrine (forced offer) so it's in baseSpellbook.
    r = { ...r, gold: 9999, currentNodeId: "shrine_test", pendingRewards: [{ kind: "learn", spellId: "spell_armageddon", cost: 0 }] };
    r = learnAt(r, "shrine_test", "spell_armageddon");
    expect(r.hero.baseSpellbook.some((s) => s.id === "spell_armageddon")).toBe(true);
    expect(r.hero.spellbook.some((s) => s.id === "spell_armageddon")).toBe(true);

    // Equip then unequip the grant Relic. The learned spell must remain (no dup).
    r = equipArtifact(r, ARMAGEDDONS_BLADE, "RightHand");
    const granted = r.hero.spellbook.filter((s) => s.id === "spell_armageddon");
    expect(granted).toHaveLength(1); // deduped: learned + granted don't double up

    r = unequipArtifact(r, "RightHand");
    expect(r.hero.spellbook.some((s) => s.id === "spell_armageddon")).toBe(true); // still learned
  });

  it("a grantSpell id that does not resolve is skipped (no crash, no phantom spell)", () => {
    let r = startRun("relic-grant-unresolved");
    // Forge an artifact whose grant points at the non-existent Misfortune spell.
    const eq = adaptEquipment(artifactById(ARMAGEDDONS_BLADE)!);
    const before = r.hero.spellbook.length;
    r = {
      ...r,
      hero: {
        ...r.hero,
        equipment: { ...r.hero.equipment, RightHand: { ...eq, effects: [{ kind: "grantSpell", spellIds: ["spell_misfortune"] }] } },
      },
    };
    // recomputeHero runs via equipArtifact normally; here exercise it directly.
    r = { ...r, hero: recomputeHero(r.hero) };
    expect(r.hero.spellbook).toHaveLength(before); // misfortune skipped, nothing added
  });
});

// ===========================================================================
// CAST-ON-START → every enemy stack at combat open (Armor of the Damned)
// ===========================================================================

describe("castOnStart script-casts onto every enemy stack at combat open", () => {
  it("Armor of the Damned opens combat with Slow + Curse + Weakness on all enemies", () => {
    let r = startRun("relic-castonstart");
    r = equipArtifact(r, ARMOR_OF_THE_DAMNED, "Torso");
    // Enter the first combat node — openCombat runs the opening casts.
    r = chooseNode(r, legalNextNodes(r)[0]);
    const combat = r.combat!;
    expect(combat.enemyArmy.stacks.length).toBeGreaterThan(0);

    for (const s of combat.enemyArmy.stacks) {
      if (s.count <= 0) continue;
      const base = creatureById(s.sourceId)!;
      // Curse (rollmode min): the whole damage band collapses to the min roll.
      expect(s.damageMax).toBe(s.damageMin);
      // Weakness (attack debuff): attack dropped below the base creature's attack.
      expect(s.attack).toBeLessThan(base.attack);
      // Slow (speed debuff): speed dropped below base (floored at 1).
      expect(s.speed).toBeLessThanOrEqual(base.speed);
      // No-restack marks recorded for the three resolved spells.
      expect(s.spellMarks).toContain("spell_slow");
      expect(s.spellMarks).toContain("spell_curse");
      expect(s.spellMarks).toContain("spell_weakness");
      // Misfortune never resolved → never marked (skipped gracefully).
      expect(s.spellMarks ?? []).not.toContain("spell_misfortune");
    }

    // The log carries a line per resolved cast per enemy stack (3 spells).
    const liveEnemies = combat.enemyArmy.stacks.filter((s) => s.count > 0).length;
    const curseLines = combat.log.filter((l) => l.includes("always min damage")).length;
    expect(curseLines).toBe(liveEnemies);
  });

  it("spell_misfortune is skipped without error when only it is castOnStart", () => {
    let r = startRun("relic-misfortune-only");
    const eq = adaptEquipment(artifactById(ARMOR_OF_THE_DAMNED)!);
    r = {
      ...r,
      hero: {
        ...r.hero,
        equipment: { ...r.hero.equipment, Torso: { ...eq, effects: [{ kind: "castOnStart", spellIds: ["spell_misfortune"] }] } },
      },
    };
    // Opening combat must not throw and must leave enemy stacks unmarked.
    expect(() => {
      r = chooseNode(r, legalNextNodes(r)[0]);
    }).not.toThrow();
    for (const s of r.combat!.enemyArmy.stacks) {
      expect(s.spellMarks ?? []).not.toContain("spell_misfortune");
    }
  });
});

// Sanity: the resolved spells exist so the test isn't vacuous; Misfortune doesn't.
describe("data assumptions", () => {
  it("slow/curse/weakness/armageddon resolve; misfortune does not", () => {
    expect(spellById("spell_slow")).toBeDefined();
    expect(spellById("spell_curse")).toBeDefined();
    expect(spellById("spell_weakness")).toBeDefined();
    expect(spellById("spell_armageddon")).toBeDefined();
    expect(spellById("spell_misfortune")).toBeUndefined();
    // adaptSpell(spell_curse) is a min roll-mode (what castOnStart applies).
    expect(adaptSpell(spellById("spell_curse")!).effect.kind).toBe("rollmode");
  });
});
