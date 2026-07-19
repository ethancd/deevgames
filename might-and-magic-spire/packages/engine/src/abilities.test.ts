// Tests for the new Castle/Stronghold creature-ability levers (COMBAT.md
// §20–§21): extraStrikes (double attack/shot), extra/unlimited retaliation,
// jousting, Behemoth defense-shred, and the hasAbility substring-landmine guard.
import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";
import {
  resolveAttack,
  hasAbility,
  hasAbilityPhrase,
  extraStrikes,
  retaliationBudget,
  applyDefenseShred,
  defenseShredAmount,
  JOUSTING_BONUS,
  DEFENSE_SHRED,
  DEFENSE_SHRED_ANCIENT,
  TWO_RETALIATIONS,
} from "./battle";
import { adaptStack } from "./adapter";
import { creatureById } from "./content";
import type { Hero, Stack } from "./types";

const HERO0: Hero = {
  id: "h", name: "H", heroClass: "", specialty: "",
  attack: 0, defense: 0, power: 0, knowledge: 0, mana: 0, maxMana: 0,
  equipment: {}, spellbook: [], skills: {}, imageRef: "",
  level: 1, xp: 0,
  baseAttack: 0, baseDefense: 0, basePower: 0, baseKnowledge: 0, baseSpellbook: [],
};

function stackOf(id: string, count: number, side: Stack["side"] = "player"): Stack {
  return adaptStack(creatureById(id)!, count, { side });
}

/** A fixed-damage attacker (min==max) so each strike deals a deterministic,
 *  stream-independent amount — lets us assert exact multiples across strikes. */
function fixedAttacker(over: Partial<Stack> = {}): Stack {
  return {
    ...stackOf("necropolis_skeleton", 10),
    attack: 10,
    defense: 10,
    damageMin: 3,
    damageMax: 3, // fixed roll
    ...over,
  };
}

/** A fat defender that survives multiple strikes (so we can measure totals). */
function fatDefender(over: Partial<Stack> = {}): Stack {
  return {
    ...stackOf("necropolis_bone_dragon", 1, "enemy"), // hp 150
    attack: 10,
    defense: 10,
    ...over,
  };
}

describe("extraStrikes (double attack / double shot)", () => {
  it("detects the exact ability phrases, not loose substrings", () => {
    expect(extraStrikes(fixedAttacker({ abilities: ["Attacks twice"] }))).toBe(1);
    expect(extraStrikes(fixedAttacker({ abilities: ["Shoots twice"] }))).toBe(1);
    expect(extraStrikes(fixedAttacker({ abilities: ["Strikes twice"] }))).toBe(1);
    expect(extraStrikes(fixedAttacker({ abilities: [] }))).toBe(0);
    // a partial / unrelated string must NOT trip it
    expect(extraStrikes(fixedAttacker({ abilities: ["twice as nice"] }))).toBe(0);
  });

  it("a double-striker deals ~2x damage and the defender retaliates ONCE", () => {
    const single = fixedAttacker({ abilities: [] });
    const double = fixedAttacker({ abilities: ["Attacks twice"] });
    const defender = fatDefender();

    const r1 = resolveAttack(single, defender, HERO0, HERO0, makeRng("dbl").fork("a"));
    const r2 = resolveAttack(double, defender, HERO0, HERO0, makeRng("dbl").fork("a"));

    // Fixed-roll damage → the double-striker deals exactly twice the single's.
    expect(r2.dealt).toBe(r1.dealt * 2);
    // Two "hits" log lines for the double-striker, one for the single.
    expect(r2.log.filter((l) => l.includes("hits")).length).toBe(2);
    expect(r1.log.filter((l) => l.includes("hits")).length).toBe(1);
    // Retaliation still happens AT MOST ONCE against a double-attacker (HoMM3).
    expect(r2.log.filter((l) => l.includes("retaliates")).length).toBe(1);
    expect(r2.retaliation).not.toBeNull();
  });

  it("a double-SHOT (shooter) deals 2x and takes NO retaliation", () => {
    const shooter = fixedAttacker({ abilities: ["Ranged", "Shoots twice"] });
    const single = fixedAttacker({ abilities: ["Ranged"] });
    const defender = fatDefender();

    const r1 = resolveAttack(single, defender, HERO0, HERO0, makeRng("sht").fork("a"));
    const r2 = resolveAttack(shooter, defender, HERO0, HERO0, makeRng("sht").fork("a"));
    expect(r2.dealt).toBe(r1.dealt * 2);
    expect(r2.retaliation).toBeNull(); // shooting suppresses retaliation
  });

  it("the second strike stops if the first wipes the defender", () => {
    const double = fixedAttacker({ abilities: ["Attacks twice"], count: 100, damageMin: 50, damageMax: 50 });
    const frail = { ...fatDefender(), count: 1, hpTop: 5, maxHpPer: 5 }; // pool 5
    const res = resolveAttack(double, frail, HERO0, HERO0, makeRng("wipe").fork("a"));
    expect(res.defender.count).toBe(0);
    // Only one "hits" line — the loop breaks once the stack is dead.
    expect(res.log.filter((l) => l.includes("hits")).length).toBe(1);
  });

  it("uses the real Marksman / Crusader data and double-strikes", () => {
    const marksman = stackOf("castle_marksman", 5);
    const crusader = stackOf("castle_crusader", 5);
    expect(extraStrikes(marksman)).toBe(1);
    expect(extraStrikes(crusader)).toBe(1);
  });
});

describe("extra / unlimited retaliation", () => {
  it("retaliationBudget reads the exact phrases", () => {
    expect(retaliationBudget(fatDefender({ abilities: [] }))).toBe(1);
    expect(retaliationBudget(fatDefender({ abilities: ["Two retaliations"] }))).toBe(TWO_RETALIATIONS);
    expect(retaliationBudget(fatDefender({ abilities: ["Unlimited retaliation"] }))).toBe(Infinity);
  });

  it("an unlimited-retaliation defender retaliates against TWO different attackers in a round", () => {
    const griffin = { ...fatDefender({ abilities: ["Flying", "Unlimited retaliation"] }), retaliationsUsed: 0 };
    const atkA = fixedAttacker({ id: "stack_a" });
    const atkB = fixedAttacker({ id: "stack_b" });

    // First attacker: griffin retaliates and its budget tracker increments.
    const r1 = resolveAttack(atkA, griffin, HERO0, HERO0, makeRng("u1").fork("a"));
    expect(r1.retaliation).not.toBeNull();
    expect(r1.defender.retaliationsUsed).toBe(1);

    // Second attacker hits the SAME (now once-retaliated) griffin: still counters.
    const r2 = resolveAttack(atkB, r1.defender, HERO0, HERO0, makeRng("u2").fork("a"));
    expect(r2.retaliation).not.toBeNull();
    expect(r2.defender.retaliationsUsed).toBe(2);
  });

  it("'Two retaliations' counters twice then stops on the third attacker", () => {
    const griffin = { ...fatDefender({ abilities: ["Flying", "Two retaliations"] }), retaliationsUsed: 0 };
    const atk = fixedAttacker();
    const r1 = resolveAttack(atk, griffin, HERO0, HERO0, makeRng("t1").fork("a"));
    const r2 = resolveAttack(atk, r1.defender, HERO0, HERO0, makeRng("t2").fork("a"));
    const r3 = resolveAttack(atk, r2.defender, HERO0, HERO0, makeRng("t3").fork("a"));
    expect(r1.retaliation).not.toBeNull();
    expect(r2.retaliation).not.toBeNull();
    expect(r3.retaliation).toBeNull(); // budget of 2 spent
    expect(r3.defender.retaliationsUsed).toBe(2);
  });

  it("a normal defender (budget 1) retaliates once then stops", () => {
    const def = { ...fatDefender({ abilities: [] }), retaliationsUsed: 0 };
    const atk = fixedAttacker();
    const r1 = resolveAttack(atk, def, HERO0, HERO0, makeRng("n1").fork("a"));
    const r2 = resolveAttack(atk, r1.defender, HERO0, HERO0, makeRng("n2").fork("a"));
    expect(r1.retaliation).not.toBeNull();
    expect(r2.retaliation).toBeNull();
  });
});

describe("substring-landmine guard (Royal Griffin)", () => {
  it("'Unlimited retaliation' does NOT read as 'no enemy retaliation'", () => {
    const royal = stackOf("castle_royal_griffin", 3);
    expect(hasAbilityPhrase(royal, "no enemy retaliation")).toBe(false);
    expect(retaliationBudget(royal)).toBe(Infinity);
  });

  it("a Royal Griffin attacker does NOT suppress its victim's retaliation", () => {
    const royal = { ...stackOf("castle_royal_griffin", 3), damageMin: 1, damageMax: 1 };
    const defender = { ...fatDefender({ abilities: [] }), retaliationsUsed: 0 };
    const res = resolveAttack(royal, defender, HERO0, HERO0, makeRng("guard").fork("a"));
    // Royal Griffin is a flyer (melee) with NO "no enemy retaliation" — the
    // defender MUST be allowed to counter. Substring trap would wrongly skip it.
    expect(res.retaliation).not.toBeNull();
  });

  it("a real 'No enemy retaliation' attacker still suppresses (phrase match)", () => {
    const vamp = stackOf("necropolis_vampire", 5);
    expect(hasAbility(vamp, "no enemy retaliation")).toBe(true);
    expect(hasAbilityPhrase(vamp, "no enemy retaliation")).toBe(true);
    const defender = stackOf("necropolis_skeleton", 20, "enemy");
    const res = resolveAttack(vamp, defender, HERO0, HERO0, makeRng("v").fork("a"));
    expect(res.retaliation).toBeNull();
  });
});

describe("jousting (Cavalier / Champion)", () => {
  it("a jousting attacker adds the JOUSTING_BONUS premium to its hit", () => {
    const plain = fixedAttacker({ abilities: [] });
    const joust = fixedAttacker({ abilities: ["Jousting"] });
    const defender = fatDefender();
    const r1 = resolveAttack(plain, defender, HERO0, HERO0, makeRng("j").fork("a"));
    const r2 = resolveAttack(joust, defender, HERO0, HERO0, makeRng("j").fork("a"));
    // Fixed roll → r2 = floor(r1 * (1 + bonus)).
    expect(r2.dealt).toBe(Math.floor(r1.dealt * (1 + JOUSTING_BONUS)));
    expect(r2.dealt).toBeGreaterThan(r1.dealt);
  });

  it("the real Champion has Jousting", () => {
    const champ = stackOf("castle_champion", 4);
    expect(hasAbilityPhrase(champ, "jousting")).toBe(true);
  });
});

describe("Behemoth / Ancient Behemoth defense-shred", () => {
  it("applyDefenseShred lowers defense once, floored at 0", () => {
    const def = fatDefender({ defense: 10 });
    const r1 = applyDefenseShred(def, DEFENSE_SHRED);
    expect(r1.defender.defense).toBe(10 - DEFENSE_SHRED);
    expect(r1.defender.defenseShred).toBe(true);
    // second application is a no-op (once per defender)
    const r2 = applyDefenseShred(r1.defender, DEFENSE_SHRED);
    expect(r2.defender.defense).toBe(10 - DEFENSE_SHRED);
    expect(r2.log).toBeNull();
    // floor at 0
    expect(applyDefenseShred(fatDefender({ defense: 2 }), DEFENSE_SHRED).defender.defense).toBe(0);
  });

  it("Ancient Behemoth shreds MORE than a Behemoth", () => {
    const behemoth = stackOf("stronghold_behemoth", 1);
    const ancient = stackOf("stronghold_ancient_behemoth", 1);
    expect(defenseShredAmount(behemoth)).toBe(DEFENSE_SHRED);
    expect(defenseShredAmount(ancient)).toBe(DEFENSE_SHRED_ANCIENT);
    expect(DEFENSE_SHRED_ANCIENT).toBeGreaterThan(DEFENSE_SHRED);
  });

  it("a Behemoth lowers the defender's defense on hit (via resolveAttack)", () => {
    const behemoth = { ...stackOf("stronghold_behemoth", 5), damageMin: 1, damageMax: 1 };
    expect(hasAbilityPhrase(behemoth, "reduces enemy defense")).toBe(true);
    const defender = fatDefender({ defense: 12, abilities: [] });
    const res = resolveAttack(behemoth, defender, HERO0, HERO0, makeRng("beh").fork("a"));
    expect(res.defender.defense).toBe(12 - DEFENSE_SHRED);
    expect(res.defender.defenseShred).toBe(true);
  });

  it("an Ancient Behemoth lowers defense by the larger amount on hit", () => {
    const ancient = { ...stackOf("stronghold_ancient_behemoth", 5), damageMin: 1, damageMax: 1 };
    const defender = fatDefender({ defense: 20, abilities: [] });
    const res = resolveAttack(ancient, defender, HERO0, HERO0, makeRng("anc").fork("a"));
    expect(res.defender.defense).toBe(20 - DEFENSE_SHRED_ANCIENT);
  });
});
