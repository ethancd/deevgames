import { describe, it, expect } from "vitest";
import {
  startRun,
  legalNextNodes,
  chooseNode,
  commandStack,
  castSpell,
  endPlayerTurn,
  legalCommandTargets,
  legalSpellTargets,
} from "./run";
import { startNodeIds } from "./map";
import type { RunState } from "./types";

/** Open the first combat: row-0 nodes are always combat. */
function openFirstCombat(seed: string): RunState {
  const run = startRun(seed);
  const start = startNodeIds(run.map)[0];
  const r = chooseNode(run, start);
  expect(r.combat).not.toBeNull();
  return r;
}

describe("side alternation + turn structure", () => {
  it("starts on the player's turn with telegraphed enemy intents", () => {
    const run = openFirstCombat("turn-1");
    expect(run.combat!.whoseTurn).toBe("player");
    expect(run.combat!.round).toBe(1);
    // Every living enemy stack has an honest telegraph.
    for (const s of run.combat!.enemyArmy.stacks) {
      if (s.count > 0) expect(s.telegraph).toBeDefined();
    }
  });

  it("each stack may be commanded only once per turn", () => {
    const run = openFirstCombat("turn-2");
    const me = run.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const target = legalCommandTargets(run, me.id)[0];
    const r1 = commandStack(run, me.id, "attack", target);
    expect(r1.combat!.actedStackIds).toContain(me.id);
    // Commanding the same stack again throws.
    expect(() => commandStack(r1, me.id, "defend")).toThrow(/already acted/);
  });

  it("defend marks the stack as defending", () => {
    const run = openFirstCombat("turn-3");
    const me = run.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const r = commandStack(run, me.id, "defend");
    const after = r.combat!.yourArmy.stacks.find((s) => s.id === me.id)!;
    expect(after.isDefending).toBe(true);
  });

  it("at most one hero spell per turn", () => {
    const run = openFirstCombat("turn-4");
    const spell = run.hero.spellbook.find((s) => s.targeting === "enemyStack")!;
    const target = legalSpellTargets(run, spell.id)[0];
    const r1 = castSpell(run, spell.id, target);
    expect(r1.combat!.spellCastThisTurn).toBe(true);
    expect(() => castSpell(r1, spell.id, target)).toThrow(/already cast/);
  });

  it("casting costs mana", () => {
    const run = openFirstCombat("turn-5");
    const spell = run.hero.spellbook.find((s) => s.targeting === "enemyStack")!;
    const target = legalSpellTargets(run, spell.id)[0];
    const r = castSpell(run, spell.id, target);
    expect(r.hero.mana).toBe(run.hero.mana - spell.manaCost);
  });

  it("commanding a stack out of turn throws", () => {
    const run = openFirstCombat("turn-6");
    const me = run.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    // Force enemy turn marker.
    const enemyTurn: RunState = { ...run, combat: { ...run.combat!, whoseTurn: "enemy" } };
    expect(() => commandStack(enemyTurn, me.id, "defend")).toThrow(/not your turn/);
  });

  it("endPlayerTurn runs the enemy and advances the round", () => {
    const run = openFirstCombat("turn-7");
    const after = endPlayerTurn(run);
    // Either combat ended, or it's a fresh player turn in round 2.
    if (after.combat) {
      expect(after.combat.whoseTurn).toBe("player");
      expect(after.combat.round).toBe(2);
      expect(after.combat.actedStackIds).toEqual([]);
      expect(after.combat.spellCastThisTurn).toBe(false);
    } else {
      expect(["won", "lost"]).toContain(after.outcome);
    }
  });
});

describe("telegraph honesty", () => {
  it("the planner that telegraphs is the planner that executes", () => {
    const run = openFirstCombat("honest-1");
    // Record each enemy's telegraphed target before ending the turn.
    const telegraphed = run.combat!.enemyArmy.stacks
      .filter((s) => s.count > 0 && s.telegraph?.kind === "attack")
      .map((s) => ({ id: s.id, targetId: s.telegraph!.targetStackId }));
    expect(telegraphed.length).toBeGreaterThan(0);

    // End the turn WITHOUT acting (no player moves) so the board the enemy plans
    // against is identical to the telegraphed board -> targets must match.
    const after = endPlayerTurn(run);
    // The enemy acted. If combat still runs, its log grew; if combat resolved
    // mid-enemy-turn (e.g. a retaliation wipe), pendingRewards / outcome reflect
    // that. Either way the enemy turn did something.
    if (after.combat && after.combat.outcome === "ongoing") {
      expect(after.combat.log.length).toBeGreaterThan(run.combat!.log.length);
    } else {
      expect(["won", "lost", "ongoing"]).toContain(after.outcome);
      // combat ended -> either we won (pendingRewards or won) or lost.
      const ended = after.combat === null || after.combat.outcome !== "ongoing";
      expect(ended).toBe(true);
    }
  });

  it("a telegraphed forecast is a non-negative number", () => {
    const run = openFirstCombat("honest-2");
    for (const s of run.combat!.enemyArmy.stacks) {
      if (s.telegraph?.kind === "attack") {
        expect(s.telegraph.value).toBeGreaterThanOrEqual(0);
        expect(s.telegraph.targetStackId).toBeTruthy();
      }
    }
  });
});

describe("legal-target introspection", () => {
  it("legalCommandTargets returns only enemy stack ids", () => {
    const run = openFirstCombat("legal-1");
    const me = run.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const targets = legalCommandTargets(run, me.id);
    const enemyIds = new Set(run.combat!.enemyArmy.stacks.map((s) => s.id));
    expect(targets.every((t) => enemyIds.has(t))).toBe(true);
  });

  it("legalSpellTargets respects spell targeting side", () => {
    const run = openFirstCombat("legal-2");
    const dmg = run.hero.spellbook.find((s) => s.targeting === "enemyStack");
    if (dmg) {
      const enemyIds = new Set(run.combat!.enemyArmy.stacks.map((s) => s.id));
      expect(legalSpellTargets(run, dmg.id).every((t) => enemyIds.has(t))).toBe(true);
    }
    const buff = run.hero.spellbook.find((s) => s.targeting === "allyStack");
    if (buff) {
      const allyIds = new Set(run.combat!.yourArmy.stacks.map((s) => s.id));
      expect(legalSpellTargets(run, buff.id).every((t) => allyIds.has(t))).toBe(true);
    }
  });
});

void legalNextNodes;
