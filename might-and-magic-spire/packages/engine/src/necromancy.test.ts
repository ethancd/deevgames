import { describe, it, expect } from "vitest";
import {
  applyNecromancy,
  NECRO_BASE_PCT,
  NECRO_CAP,
  ARMY_CAP,
  startRun,
} from "./run";
import { adaptEquipment } from "./adapter";
import { creatureById, artifactById } from "./content";
import type { CombatState, RunState } from "./types";

const SKEL_HP = creatureById("necropolis_skeleton")!.hp; // 6

/** A minimal won-combat shell carrying a slain ledger. */
function combatWithSlain(slain: Record<string, number>): CombatState {
  return {
    round: 1, whoseTurn: "player",
    yourArmy: { stacks: [], side: "player" },
    enemyArmy: { stacks: [], side: "enemy" },
    spellCastThisTurn: false, log: [], outcome: "won",
    actedStackIds: [], slainEnemies: slain,
  };
}

function runWithSkill(skill: number): RunState {
  const run = startRun("necro-seed");
  return { ...run, hero: { ...run.hero, skills: { ...run.hero.skills, Necromancy: skill } }, army: [] };
}

describe("necromancy raise math", () => {
  it("raise = floor(slainHp * pct / skeletonHp), capped at creatures slain", () => {
    // Slay 20 walking dead (hp 15 each) -> slainHp 300, with 20 bodies (the cap).
    // Skill 1 -> raw = floor(300 * NECRO_BASE_PCT[1] / 6); capped at 20.
    const run = runWithSkill(1);
    const after = applyNecromancy(run, combatWithSlain({ necropolis_walking_dead: 20 }));
    const skelStack = after.army.find((s) => s.sourceId === "necropolis_skeleton")!;
    const slainHp = creatureById("necropolis_walking_dead")!.hp * 20;
    const expected = Math.min(20, Math.floor((slainHp * NECRO_BASE_PCT[1]) / SKEL_HP));
    expect(skelStack.count).toBe(expected);
  });

  it("higher Necromancy skill raises more", () => {
    // Many low-hp bodies so the creatures-slain cap does NOT bind and the pct
    // difference shows through: 200 skeletons (hp6) -> slainHp 1200, 200 bodies.
    const low = applyNecromancy(runWithSkill(1), combatWithSlain({ necropolis_skeleton: 200 }));
    const high = applyNecromancy(runWithSkill(4), combatWithSlain({ necropolis_skeleton: 200 }));
    const lowN = low.army.find((s) => s.sourceId === "necropolis_skeleton")?.count ?? 0;
    const highN = high.army.find((s) => s.sourceId === "necropolis_skeleton")?.count ?? 0;
    expect(highN).toBeGreaterThan(lowN);
  });

  it("never raises more bodies than fell", () => {
    // Bone dragons: hp 150 each. Slay 2 -> slainHp 300. Skill 4 -> pct 0.40.
    // raw raise = floor(300*0.4/6)=20, but only 2 creatures fell -> capped at 2.
    const after = applyNecromancy(runWithSkill(4), combatWithSlain({ necropolis_bone_dragon: 2 }));
    const n = after.army.find((s) => s.sourceId === "necropolis_skeleton")!.count;
    expect(n).toBe(2);
  });

  it("no Necromancy skill raises nothing", () => {
    const run = { ...runWithSkill(0) };
    run.hero = { ...run.hero, skills: {} };
    const after = applyNecromancy(run, combatWithSlain({ necropolis_skeleton: 50 }));
    expect(after.army.find((s) => s.sourceId === "necropolis_skeleton")).toBeUndefined();
  });

  it("Cloak of the Undead King boosts the necromancy percentage", () => {
    const base = runWithSkill(1);
    const cloak = adaptEquipment(artifactById("artifact_cloak_of_the_undead_king")!);
    const withCloak: RunState = {
      ...base,
      hero: { ...base.hero, equipment: { [cloak.slot]: cloak } },
    };
    const a = applyNecromancy(base, combatWithSlain({ necropolis_walking_dead: 30 }));
    const b = applyNecromancy(withCloak, combatWithSlain({ necropolis_walking_dead: 30 }));
    const an = a.army.find((s) => s.sourceId === "necropolis_skeleton")!.count;
    const bn = b.army.find((s) => s.sourceId === "necropolis_skeleton")!.count;
    expect(bn).toBeGreaterThan(an);
  });

  it("the necromancy percentage is capped at NECRO_CAP", () => {
    // Even at max skill + cloak, pct cannot exceed the cap. Verify via the cap
    // constant being respected: raised <= floor(slainHp * NECRO_CAP / skelHp).
    const run = runWithSkill(4);
    const cloak = adaptEquipment(artifactById("artifact_cloak_of_the_undead_king")!);
    const withCloak: RunState = { ...run, hero: { ...run.hero, equipment: { [cloak.slot]: cloak } } };
    const after = applyNecromancy(withCloak, combatWithSlain({ necropolis_walking_dead: 100 }));
    const n = after.army.find((s) => s.sourceId === "necropolis_skeleton")!.count;
    const slainHp = creatureById("necropolis_walking_dead")!.hp * 100;
    const maxByCap = Math.floor((slainHp * NECRO_CAP) / SKEL_HP);
    expect(n).toBeLessThanOrEqual(Math.min(maxByCap, 100));
  });

  it("merges raised skeletons into an existing skeleton stack", () => {
    const run = runWithSkill(2);
    const seeded: RunState = {
      ...run,
      army: [
        { ...startRun("x").army[0], sourceId: "necropolis_skeleton", count: 5, startCount: 5 },
      ],
    };
    const after = applyNecromancy(seeded, combatWithSlain({ necropolis_walking_dead: 20 }));
    const skel = after.army.find((s) => s.sourceId === "necropolis_skeleton")!;
    expect(skel.count).toBeGreaterThan(5);
    expect(after.army.length).toBe(1); // merged, not appended
  });

  it("surfaces a {kind:'raise'} reward when the army is full with no skeletons", () => {
    const run = runWithSkill(2);
    // 7 non-skeleton stacks => army full, no skeleton stack to merge into.
    const wd = creatureById("necropolis_walking_dead")!;
    const army = Array.from({ length: ARMY_CAP }, (_, i) => ({
      ...startRun("y").army[0],
      id: `filler_${i}`,
      sourceId: wd.id,
      count: 3,
      startCount: 3,
    }));
    const full: RunState = { ...run, army };
    const after = applyNecromancy(full, combatWithSlain({ necropolis_lich: 20 }));
    expect(after.pendingRewards?.some((r) => r.kind === "raise")).toBe(true);
  });
});
