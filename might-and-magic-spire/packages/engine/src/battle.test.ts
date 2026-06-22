import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";
import {
  adMultiplier,
  applyDamage,
  applyHeal,
  computeDamage,
  effDefense,
  legalTargets,
  resolveAttack,
  isShooter,
  isFlying,
  hasAbility,
  AD_ATTACK_CAP,
  AD_DEFENSE_CAP,
} from "./battle";
import { adaptStack, deriveHero } from "./adapter";
import { CREATURES, SPELLS, creatureById, heroById } from "./content";
import type { Army, Hero, Stack } from "./types";

const HERO0: Hero = {
  id: "h", name: "H", heroClass: "", specialty: "",
  attack: 0, defense: 0, power: 0, knowledge: 0, mana: 0, maxMana: 0,
  equipment: {}, spellbook: [], skills: {}, imageRef: "",
  baseAttack: 0, baseDefense: 0, basePower: 0, baseKnowledge: 0,
};

function stackOf(id: string, count: number, side: Stack["side"] = "player"): Stack {
  return adaptStack(creatureById(id)!, count, { side });
}

describe("A/D curve", () => {
  it("equal attack/defense = neutral multiplier (x1)", () => {
    expect(adMultiplier(10, 10)).toBe(1);
  });
  it("attack > defense adds +5% per point", () => {
    expect(adMultiplier(15, 10)).toBeCloseTo(1.25, 5); // +5*0.05
    expect(adMultiplier(11, 10)).toBeCloseTo(1.05, 5);
  });
  it("attack advantage caps at +300%", () => {
    expect(adMultiplier(1000, 0)).toBeCloseTo(1 + AD_ATTACK_CAP, 5);
  });
  it("defense > attack subtracts 2.5% per point", () => {
    expect(adMultiplier(10, 14)).toBeCloseTo(1 - 4 * 0.025, 5);
  });
  it("defense advantage caps at -70%", () => {
    expect(adMultiplier(0, 1000)).toBeCloseTo(1 - AD_DEFENSE_CAP, 5);
  });
});

describe("kill/chip application", () => {
  it("10 Skeletons (maxHp6, hpTop6) taking 15 -> count 8, hpTop 3", () => {
    const skel = { ...stackOf("necropolis_skeleton", 10) };
    expect(skel.maxHpPer).toBe(6);
    const res = applyDamage(skel, 15);
    expect(res.defender.count).toBe(8);
    expect(res.defender.hpTop).toBe(3);
    expect(res.killed).toBe(2);
    expect(res.dealt).toBe(15);
  });

  it("chips the top creature without a kill", () => {
    const skel = stackOf("necropolis_skeleton", 10); // pool 60
    const res = applyDamage(skel, 4);
    expect(res.defender.count).toBe(10);
    expect(res.defender.hpTop).toBe(2);
    expect(res.killed).toBe(0);
  });

  it("overkill destroys the stack with no carry", () => {
    const skel = stackOf("necropolis_skeleton", 10); // pool 60
    const res = applyDamage(skel, 999);
    expect(res.defender.count).toBe(0);
    expect(res.defender.hpTop).toBe(0);
    expect(res.killed).toBe(10);
    expect(res.dealt).toBe(60); // clamped to the pool
  });

  it("exact pool damage wipes the stack", () => {
    const skel = stackOf("necropolis_skeleton", 10); // pool 60
    const res = applyDamage(skel, 60);
    expect(res.defender.count).toBe(0);
    expect(res.killed).toBe(10);
  });
});

describe("effective defense + defend bonus", () => {
  it("defending adds round(defense*0.2)", () => {
    const skel = stackOf("necropolis_skeleton", 10); // defense 4
    const before = effDefense(skel, HERO0);
    const defending = { ...skel, isDefending: true };
    expect(effDefense(defending, HERO0)).toBe(before + Math.round(4 * 0.2));
  });
});

describe("two-rank reach", () => {
  function enemyArmy(): Army {
    return {
      side: "enemy",
      stacks: [
        stackOf("necropolis_skeleton", 5, "enemy"), // front
        stackOf("necropolis_lich", 3, "enemy"), // back (Ranged)
      ],
    };
  }
  it("melee may only hit the enemy front while it lives", () => {
    const melee = stackOf("necropolis_skeleton", 5);
    const targets = legalTargets(melee, enemyArmy());
    expect(targets.every((t) => t.rank === "front")).toBe(true);
  });
  it("melee reaches the back once the front is empty", () => {
    const army = enemyArmy();
    army.stacks[0] = { ...army.stacks[0], count: 0, hpTop: 0 };
    const melee = stackOf("necropolis_skeleton", 5);
    const targets = legalTargets(melee, army);
    expect(targets.map((t) => t.rank)).toContain("back");
  });
  it("shooters hit any rank", () => {
    const lich = stackOf("necropolis_lich", 3); // Ranged
    expect(isShooter(lich)).toBe(true);
    const targets = legalTargets(lich, enemyArmy());
    expect(targets.length).toBe(2);
  });
  it("flyers reach the back rank while the front still lives", () => {
    const vampire = stackOf("necropolis_vampire", 4); // Flying, ground melee
    expect(isFlying(vampire)).toBe(true);
    expect(isShooter(vampire)).toBe(false);
    const targets = legalTargets(vampire, enemyArmy());
    expect(targets.length).toBe(2); // front AND back, despite the front living
    expect(targets.map((t) => t.rank)).toContain("back");
  });
  it("a flyer still TAKES retaliation (it is melee, not a shooter)", () => {
    const flyer = stackOf("necropolis_wight", 6); // Flying, NOT no-retaliation
    const defender = stackOf("necropolis_skeleton", 10, "enemy");
    const res = resolveAttack(flyer, defender, HERO0, HERO0, makeRng("retal"));
    expect(res.retaliation).not.toBeNull();
  });
});

describe("retaliation rules", () => {
  it("a melee defender retaliates once", () => {
    const attacker = stackOf("necropolis_skeleton", 10);
    const defender = stackOf("necropolis_walking_dead", 10, "enemy");
    const rng = makeRng("retal").fork("a");
    const res = resolveAttack(attacker, defender, HERO0, HERO0, rng);
    expect(res.defender.hasRetaliated).toBe(true);
    expect(res.log.some((l) => l.includes("retaliates"))).toBe(true);
  });

  it("shooting suppresses retaliation", () => {
    const shooter = stackOf("necropolis_lich", 5); // Ranged
    const defender = stackOf("necropolis_walking_dead", 10, "enemy");
    const rng = makeRng("shoot").fork("a");
    const res = resolveAttack(shooter, defender, HERO0, HERO0, rng);
    expect(res.defender.hasRetaliated).toBe(false);
    expect(res.log.some((l) => l.includes("retaliates"))).toBe(false);
  });

  it("'No enemy retaliation' (Vampire) suppresses retaliation", () => {
    const vamp = stackOf("necropolis_vampire", 5);
    expect(hasAbility(vamp, "no enemy retaliation")).toBe(true);
    const defender = stackOf("necropolis_skeleton", 20, "enemy");
    const rng = makeRng("vamp").fork("a");
    const res = resolveAttack(vamp, defender, HERO0, HERO0, rng);
    expect(res.defender.hasRetaliated).toBe(false);
  });

  it("an already-retaliated defender does not retaliate again", () => {
    const attacker = stackOf("necropolis_skeleton", 10);
    const defender = { ...stackOf("necropolis_walking_dead", 10, "enemy"), hasRetaliated: true };
    const rng = makeRng("again").fork("a");
    const res = resolveAttack(attacker, defender, HERO0, HERO0, rng);
    expect(res.log.some((l) => l.includes("retaliates"))).toBe(false);
  });
});

describe("life drain (Vampire Lord)", () => {
  it("heals the attacker but never above battle-start count", () => {
    const vl = creatureById("necropolis_vampire_lord")!;
    // Start with 1 of 5 — wounded, lots of headroom; big drain target.
    const drainer: Stack = { ...adaptStack(vl, 1), startCount: 5 };
    const fat = stackOf("necropolis_bone_dragon", 10, "enemy"); // huge pool
    const rng = makeRng("drain").fork("a");
    const res = resolveAttack(drainer, fat, HERO0, HERO0, rng);
    expect(res.attacker.count).toBeLessThanOrEqual(5); // capped at start count
    expect(res.attacker.count).toBeGreaterThanOrEqual(1);
  });

  it("cannot resurrect beyond startCount even with massive drain", () => {
    const vl = creatureById("necropolis_vampire_lord")!;
    const drainer: Stack = { ...adaptStack(vl, 2), count: 1, hpTop: 1, startCount: 2 };
    const fat = stackOf("necropolis_bone_dragon", 50, "enemy");
    const rng = makeRng("drain2").fork("a");
    const res = resolveAttack(drainer, fat, HERO0, HERO0, rng);
    expect(res.attacker.count).toBeLessThanOrEqual(2);
  });
});

describe("computeDamage + hero buffs the army", () => {
  it("hero attack raises the whole army's effective attack", () => {
    const { hero } = deriveHero(heroById("hero_galthran")!, { creatures: CREATURES, spells: SPELLS });
    const attacker = stackOf("necropolis_skeleton", 10);
    const defender = stackOf("necropolis_skeleton", 10, "enemy");
    const withHero = computeDamage(attacker, defender, hero, HERO0, makeRng("d").fork("x"));
    const without = computeDamage(attacker, defender, HERO0, HERO0, makeRng("d").fork("x"));
    expect(withHero).toBeGreaterThanOrEqual(without);
  });
});

describe("regeneration + heal", () => {
  it("applyHeal restores the pool up to the count cap", () => {
    const skel: Stack = { ...stackOf("necropolis_skeleton", 10), count: 5, hpTop: 2 };
    const healed = applyHeal(skel, 100, 10);
    expect(healed.count).toBe(10);
    expect(healed.hpTop).toBe(6);
  });
});

void SPELLS;
