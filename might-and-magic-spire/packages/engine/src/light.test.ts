// LIGHT balance set (BALANCE_PROPOSALS.md §3) — one block per item. Each asserts
// the additive rule end-to-end through the public run API where possible, and
// through adaptSpell for the pure remaps.
//
// Determinism note: these tests pin behavior, not RNG; the keystone full-run +
// determinism tests in run.test.ts guard seeded reproducibility.

import { describe, it, expect } from "vitest";
import { adaptSpell, adaptStack, adaptEquipment } from "./adapter";
import { isShooter } from "./battle";
import { creatureById, spellById, artifactById } from "./content";
import {
  startRun,
  chooseNode,
  legalNextNodes,
  castSpell,
  endPlayerTurn,
} from "./run";
import type {
  Army,
  CombatSpell,
  CombatState,
  Hero,
  RunState,
  Stack,
} from "./types";

// ---------------------------------------------------------------------------
// Harness: build a RunState with a fully controlled active combat so spell
// effects can be asserted deterministically. We borrow a real run's hero/map
// (so node lookups work) and overwrite the combat with hand-built armies.
// ---------------------------------------------------------------------------

function stack(id: string, count: number, side: Stack["side"], suffix = ""): Stack {
  return adaptStack(creatureById(id)!, count, { side, idSuffix: suffix });
}

/** A run whose current node is a combat node, with armies we control. */
function combatRun(
  yourStacks: Stack[],
  enemyStacks: Stack[],
  spells: CombatSpell[],
  opts: { power?: number; mana?: number } = {},
): RunState {
  let r = startRun("light-harness");
  // Enter the row-0 combat node so currentNodeId is a real combat node and the
  // combat-rng fork resolves.
  r = chooseNode(r, legalNextNodes(r)[0]);
  const baseCombat = r.combat!;
  const hero: Hero = {
    ...r.hero,
    power: opts.power ?? 0,
    mana: opts.mana ?? 999,
    maxMana: Math.max(opts.mana ?? 999, r.hero.maxMana),
    spellbook: spells,
  };
  const combat: CombatState = {
    ...baseCombat,
    round: 1,
    whoseTurn: "player",
    yourArmy: { stacks: yourStacks, side: "player" },
    enemyArmy: { stacks: enemyStacks, side: "enemy" },
    spellCastThisTurn: false,
    outcome: "ongoing",
    actedStackIds: [],
    slainEnemies: {},
    log: [],
  };
  return { ...r, hero, combat };
}

const findIn = (army: Army, id: string) => army.stacks.find((s) => s.id === id)!;

// ===========================================================================
// Item 1 — equipment combat effects applied at battle open
// ===========================================================================

describe("LIGHT 1: equipment hpPerCreature/speedAll applied at battle open", () => {
  it("Ring of Vitality (+1 hp/creature) and Necklace of Swiftness (+1 speed) hit every player stack", () => {
    let r = startRun("equip-seed");
    // Equip both inert artifacts directly onto the hero (paper-doll), as the
    // map layer would.
    r = {
      ...r,
      hero: {
        ...r.hero,
        equipment: {
          ...r.hero.equipment,
          Ring: adaptEquipment(artifactById("artifact_ring_of_vitality")!),
          Neck: adaptEquipment(artifactById("artifact_necklace_of_swiftness")!),
        },
      },
    };
    const before = r.army.map((s) => ({ id: s.id, maxHpPer: s.maxHpPer, speed: s.speed }));
    r = chooseNode(r, legalNextNodes(r)[0]); // opens combat
    expect(r.combat?.outcome).toBe("ongoing");
    for (const b of before) {
      const inBattle = r.combat!.yourArmy.stacks.find((s) => s.id === b.id)!;
      expect(inBattle.maxHpPer).toBe(b.maxHpPer + 1); // hpPerCreature
      expect(inBattle.hpTop).toBe(inBattle.maxHpPer); // full top creature
      expect(inBattle.speed).toBe(b.speed + 1); // speedAll
    }
  });

  it("no equipment => no change (additive only)", () => {
    let r = startRun("equip-seed-2");
    const before = r.army.map((s) => ({ id: s.id, maxHpPer: s.maxHpPer, speed: s.speed }));
    r = chooseNode(r, legalNextNodes(r)[0]);
    for (const b of before) {
      const inBattle = r.combat!.yourArmy.stacks.find((s) => s.id === b.id)!;
      expect(inBattle.maxHpPer).toBe(b.maxHpPer);
      expect(inBattle.speed).toBe(b.speed);
    }
  });
});

// ===========================================================================
// Item 2 — Bless (ally max-roll) / Curse (enemy min-roll)
// ===========================================================================

describe("LIGHT 2: Bless = always-max, Curse = always-min roll-mode", () => {
  it("adaptSpell remaps Bless -> rollmode max (ally), Curse -> rollmode min (enemy)", () => {
    const bless = adaptSpell(spellById("spell_bless")!);
    expect(bless.effect.kind).toBe("rollmode");
    expect(bless.targeting).toBe("allyStack");
    if (bless.effect.kind === "rollmode") expect(bless.effect.mode).toBe("max");

    const curse = adaptSpell(spellById("spell_curse")!);
    expect(curse.effect.kind).toBe("rollmode");
    expect(curse.targeting).toBe("enemyStack");
    if (curse.effect.kind === "rollmode") expect(curse.effect.mode).toBe("min");
  });

  it("Bless sets the ally's damageMin up to damageMax", () => {
    const me = stack("necropolis_vampire", 5, "player");
    expect(me.damageMin).toBeLessThan(me.damageMax);
    const r = combatRun([me], [stack("necropolis_skeleton", 5, "enemy")], [adaptSpell(spellById("spell_bless")!)]);
    const after = castSpell(r, "spell_bless", me.id);
    const buffed = findIn(after.combat!.yourArmy, me.id);
    expect(buffed.damageMin).toBe(buffed.damageMax);
    expect(buffed.damageMax).toBe(me.damageMax);
  });

  it("Curse drops the enemy's damageMax down to damageMin", () => {
    const foe = stack("necropolis_vampire", 5, "enemy");
    expect(foe.damageMin).toBeLessThan(foe.damageMax);
    const r = combatRun([stack("necropolis_skeleton", 5, "player")], [foe], [adaptSpell(spellById("spell_curse")!)]);
    const after = castSpell(r, "spell_curse", foe.id);
    const cursed = findIn(after.combat!.enemyArmy, foe.id);
    expect(cursed.damageMax).toBe(cursed.damageMin);
    expect(cursed.damageMin).toBe(foe.damageMin);
  });
});

// ===========================================================================
// Item 3 — Dispel / Cure reset to base creature stats
// ===========================================================================

describe("LIGHT 3: Dispel resets to base; Cure carries a reset rider", () => {
  it("adaptSpell remaps Dispel -> reset (enemy) and Cure -> heal+reset (ally)", () => {
    const dispel = adaptSpell(spellById("spell_dispel")!);
    expect(dispel.effect.kind).toBe("reset");
    expect(dispel.targeting).toBe("enemyStack");

    const cure = adaptSpell(spellById("spell_cure")!);
    expect(cure.effect.kind).toBe("heal");
    if (cure.effect.kind === "heal") expect(cure.effect.reset).toBe(true);
  });

  it("Dispel restores a debuffed enemy's attack/defense/damage to its base stats", () => {
    const base = creatureById("necropolis_vampire")!;
    const foe = stack("necropolis_vampire", 5, "enemy");
    // Apply a debuff first (Weakness -> -attack), then Dispel undoes it.
    const r = combatRun(
      [stack("necropolis_skeleton", 5, "player")],
      [foe],
      [adaptSpell(spellById("spell_weakness")!), adaptSpell(spellById("spell_dispel")!)],
    );
    let after = castSpell(r, "spell_weakness", foe.id);
    const weakened = findIn(after.combat!.enemyArmy, foe.id);
    expect(weakened.attack).toBeLessThan(base.attack); // debuff landed
    // New turn so we can cast again.
    after = { ...after, combat: { ...after.combat!, spellCastThisTurn: false } };
    after = castSpell(after, "spell_dispel", foe.id);
    const reset = findIn(after.combat!.enemyArmy, foe.id);
    expect(reset.attack).toBe(base.attack);
    expect(reset.defense).toBe(base.defense);
    expect(reset.damageMin).toBe(base.damageMin);
    expect(reset.damageMax).toBe(base.damageMax);
    expect(reset.speed).toBe(base.speed);
  });
});

// ===========================================================================
// Item 4 — Death Ripple: both armies, skip undead
// ===========================================================================

describe("LIGHT 4: Death Ripple hits enemies and NOT your undead", () => {
  it("adaptSpell flags Death Ripple bothArmies + skipUndead", () => {
    const dr = adaptSpell(spellById("spell_death_ripple")!);
    expect(dr.effect.kind).toBe("damage");
    if (dr.effect.kind === "damage") {
      expect(dr.effect.bothArmies).toBe(true);
      expect(dr.effect.skipUndead).toBe(true);
    }
  });

  it("damages the enemy stack but leaves the all-undead player army untouched", () => {
    const myUndead = stack("necropolis_skeleton", 20, "player"); // 'Undead'
    // A NON-undead, high-hp enemy (strip the undead ability) that survives the
    // chip so combat stays ongoing and we can inspect state.
    const foe = stack("necropolis_bone_dragon", 10, "enemy"); // hp150 each
    const foeMortal: Stack = { ...foe, abilities: foe.abilities.filter((a) => a.toLowerCase() !== "undead") };
    const r = combatRun([myUndead], [foeMortal], [adaptSpell(spellById("spell_death_ripple")!)], { power: 5 });
    const after = castSpell(r, "spell_death_ripple", foeMortal.id);
    expect(after.combat).not.toBeNull();
    const myAfter = findIn(after.combat!.yourArmy, myUndead.id);
    const foeAfter = findIn(after.combat!.enemyArmy, foeMortal.id);
    // My undead skeletons took zero damage.
    expect(myAfter.count).toBe(myUndead.count);
    expect(myAfter.hpTop).toBe(myUndead.hpTop);
    // The non-undead enemy took damage.
    const before = foeMortal.count * foeMortal.maxHpPer;
    const afterPool = foeAfter.hpTop + (foeAfter.count - 1) * foeAfter.maxHpPer;
    expect(afterPool).toBeLessThan(before);
  });

  it("an undead enemy is ALSO immune (the tag, not the side, gates it)", () => {
    const myUndead = stack("necropolis_skeleton", 20, "player");
    const foeUndead = stack("necropolis_skeleton", 20, "enemy"); // keeps 'Undead'
    const r = combatRun([myUndead], [foeUndead], [adaptSpell(spellById("spell_death_ripple")!)], { power: 10 });
    const after = castSpell(r, "spell_death_ripple", foeUndead.id);
    const foeAfter = findIn(after.combat!.enemyArmy, foeUndead.id);
    expect(foeAfter.count).toBe(foeUndead.count); // undead skip => untouched
  });
});

// ===========================================================================
// Item 5 — Armageddon: both armies, no undead skip
// ===========================================================================

describe("LIGHT 5: Armageddon hits BOTH armies (friend and foe)", () => {
  it("adaptSpell flags Armageddon bothArmies (no skipUndead)", () => {
    const arm = adaptSpell(spellById("spell_armageddon")!);
    expect(arm.effect.kind).toBe("damage");
    if (arm.effect.kind === "damage") {
      expect(arm.effect.bothArmies).toBe(true);
      expect(arm.effect.skipUndead).toBeFalsy();
    }
  });

  it("damages your own undead army too", () => {
    // Big high-hp stacks on both sides so a single Armageddon chips without
    // wiping either (combat stays ongoing for inspection).
    const mine = stack("necropolis_bone_dragon", 10, "player");
    const foe = stack("necropolis_bone_dragon", 10, "enemy");
    const r = combatRun([mine], [foe], [adaptSpell(spellById("spell_armageddon")!)], { power: 5 });
    const after = castSpell(r, "spell_armageddon", foe.id);
    expect(after.combat).not.toBeNull();
    const myAfter = findIn(after.combat!.yourArmy, mine.id);
    const foeAfter = findIn(after.combat!.enemyArmy, foe.id);
    const minePool = myAfter.hpTop + (myAfter.count - 1) * myAfter.maxHpPer;
    const foePool = foeAfter.hpTop + (foeAfter.count - 1) * foeAfter.maxHpPer;
    expect(minePool).toBeLessThan(mine.count * mine.maxHpPer); // friend hit
    expect(foePool).toBeLessThan(foe.count * foe.maxHpPer); // foe hit
  });
});

// ===========================================================================
// Item 6 — Prayer routes to all three stats
// ===========================================================================

describe("LIGHT 6: Prayer raises attack AND defense AND speed", () => {
  it("adaptSpell remaps Prayer -> buffAll", () => {
    const p = adaptSpell(spellById("spell_prayer")!);
    expect(p.effect.kind).toBe("buffAll");
    expect(p.targeting).toBe("allyStack");
  });

  it("casting Prayer bumps all three ally stats by the same magnitude", () => {
    const me = stack("necropolis_vampire", 5, "player");
    const prayer = adaptSpell(spellById("spell_prayer")!);
    const r = combatRun([me], [stack("necropolis_skeleton", 5, "enemy")], [prayer], { power: 0 });
    const after = castSpell(r, "spell_prayer", me.id);
    const buffed = findIn(after.combat!.yourArmy, me.id);
    const mag = prayer.effect.kind === "buffAll" ? prayer.effect.base : 0;
    expect(mag).toBeGreaterThan(0);
    expect(buffed.attack).toBe(me.attack + mag);
    expect(buffed.defense).toBe(me.defense + mag);
    expect(buffed.speed).toBe(me.speed + mag);
  });
});

// ===========================================================================
// Item 7 — Precision back-rank gate; Forgetfulness noShoot
// ===========================================================================

describe("LIGHT 7: Precision gates to back rank; Forgetfulness forces melee", () => {
  it("adaptSpell flags Precision backRankOnly and Forgetfulness noShoot", () => {
    const prec = adaptSpell(spellById("spell_precision")!);
    expect(prec.effect.kind).toBe("buff");
    if (prec.effect.kind === "buff") expect(prec.effect.backRankOnly).toBe(true);

    const forget = adaptSpell(spellById("spell_forgetfulness")!);
    expect(forget.effect.kind).toBe("debuff");
    if (forget.effect.kind === "debuff") expect(forget.effect.noShoot).toBe(true);
  });

  it("Precision whiffs on a FRONT stack and lands on a BACK stack", () => {
    const front = stack("necropolis_skeleton", 10, "player"); // front (melee)
    expect(front.rank).toBe("front");
    const back = stack("necropolis_lich", 10, "player", "_b"); // back (Ranged)
    expect(back.rank).toBe("back");
    const prec = adaptSpell(spellById("spell_precision")!);

    // Front: no change.
    const r1 = combatRun([front], [stack("necropolis_skeleton", 5, "enemy")], [prec]);
    const a1 = castSpell(r1, "spell_precision", front.id);
    const f1 = findIn(a1.combat!.yourArmy, front.id);
    expect(f1.damageMin).toBe(front.damageMin);
    expect(f1.damageMax).toBe(front.damageMax);

    // Back: buff lands (Precision routes to a +damage buff).
    const r2 = combatRun([back], [stack("necropolis_skeleton", 5, "enemy")], [prec], { power: 0 });
    const a2 = castSpell(r2, "spell_precision", back.id);
    const b2 = findIn(a2.combat!.yourArmy, back.id);
    expect(b2.damageMax).toBeGreaterThan(back.damageMax);
  });

  it("Forgetfulness sets noShoot so a Lich (shooter) is no longer a shooter", () => {
    const lich = stack("necropolis_lich", 10, "enemy");
    expect(isShooter(lich)).toBe(true);
    const forget = adaptSpell(spellById("spell_forgetfulness")!);
    const r = combatRun([stack("necropolis_skeleton", 10, "player")], [lich], [forget]);
    const after = castSpell(r, "spell_forgetfulness", lich.id);
    const muted = findIn(after.combat!.enemyArmy, lich.id);
    expect(muted.noShoot).toBe(true);
    expect(isShooter(muted)).toBe(false);
  });
});

// ===========================================================================
// Item 8 — Blind wears off after the blinded stack acts
// ===========================================================================

describe("LIGHT 8: Blind zeroes the roll then wears off at the stack's next action", () => {
  it("stores the pre-zero roll on the stack and zeroes damage", () => {
    const foe = stack("necropolis_vampire", 5, "enemy");
    const blind = adaptSpell(spellById("spell_blind")!);
    const r = combatRun([stack("necropolis_skeleton", 5, "player")], [foe], [blind]);
    const after = castSpell(r, "spell_blind", foe.id);
    const blinded = findIn(after.combat!.enemyArmy, foe.id);
    expect(blinded.damageMin).toBe(0);
    expect(blinded.damageMax).toBe(0);
    expect(blinded.blindedFrom).toEqual({ damageMin: foe.damageMin, damageMax: foe.damageMax });
  });

  it("the blinded enemy's roll is restored after it takes its (wasted) action", () => {
    const foe = stack("necropolis_vampire", 8, "enemy");
    // A sturdy ally so the enemy attack doesn't end combat before we can inspect.
    const wall = stack("necropolis_bone_dragon", 5, "player");
    const blind = adaptSpell(spellById("spell_blind")!);
    let r = combatRun([wall], [foe], [blind]);
    r = castSpell(r, "spell_blind", foe.id);
    expect(findIn(r.combat!.enemyArmy, foe.id).damageMax).toBe(0);
    // End the player turn → the enemy acts (blinded, dealing 0) → roll restored.
    r = endPlayerTurn(r);
    if (!r.combat) return; // settled; nothing to assert (shouldn't happen with a dragon wall)
    const restored = findIn(r.combat.enemyArmy, foe.id);
    expect(restored.blindedFrom).toBeUndefined();
    expect(restored.damageMin).toBe(foe.damageMin);
    expect(restored.damageMax).toBe(foe.damageMax);
  });
});
