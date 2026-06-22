import { describe, it, expect } from "vitest";
import {
  startRun,
  legalNextNodes,
  chooseNode,
  pickReward,
  commandStack,
  castSpell,
  endPlayerTurn,
  legalCommandTargets,
  legalSpellTargets,
  forecastAttack,
  recruitAt,
  upgradeAt,
  learnAt,
  buyAt,
  equipArtifact,
  unequipArtifact,
  pendingRewards,
  ARMY_CAP,
} from "./run";
import { artifactById } from "./content";
import type { RunState, Stack } from "./types";

// ===========================================================================
// A headless greedy auto-player. Drives the public API end-to-end. Doubles as
// the balance-tuning harness (sweep seeds, report win-rate).
// ===========================================================================

const threat = (s: Stack) => s.count * ((s.damageMin + s.damageMax) / 2);

function pickRewardSafely(r: RunState): RunState {
  const rs = r.pendingRewards!;
  const find = (p: (c: typeof rs[number]) => boolean) => rs.findIndex(p);
  let i = find((c) => c.kind === "raise");
  if (i < 0) i = find((c) => c.kind === "recruit" && r.gold >= c.cost);
  if (i < 0) i = find((c) => c.kind === "upgrade" && r.gold >= c.cost);
  if (i < 0) i = find((c) => c.kind === "buy" && r.gold >= c.cost);
  if (i < 0) i = find((c) => c.kind === "learn" && r.gold >= c.cost);
  if (i < 0) i = find((c) => c.kind === "gold");
  if (i < 0) i = find((c) => c.kind === "skip");
  if (i < 0) i = 0;
  return pickReward(r, i);
}

function autoCombat(run: RunState): RunState {
  let r = run;
  let guard = 0;
  while (r.combat && r.combat.outcome === "ongoing" && guard++ < 400) {
    const dmg = r.hero.spellbook.find(
      (s) => s.targeting === "enemyStack" && r.hero.mana >= s.manaCost,
    );
    if (dmg && !r.combat.spellCastThisTurn) {
      const ids = legalSpellTargets(r, dmg.id);
      if (ids.length) r = castSpell(r, dmg.id, ids[0]);
    }
    if (!r.combat || r.combat.outcome !== "ongoing") break;
    const order = r.combat.yourArmy.stacks
      .filter((s) => s.count > 0 && !r.combat!.actedStackIds.includes(s.id))
      .sort((a, b) => threat(b) - threat(a));
    for (const s of order) {
      if (r.combat!.actedStackIds.includes(s.id)) continue;
      const ids = legalCommandTargets(r, s.id);
      if (!ids.length) {
        r = commandStack(r, s.id, "defend");
        continue;
      }
      const tgt = ids
        .map((id) => r.combat!.enemyArmy.stacks.find((x) => x.id === id)!)
        .sort((a, b) => threat(b) - threat(a))[0];
      r = commandStack(r, s.id, "attack", tgt.id);
      if (!r.combat || r.combat.outcome !== "ongoing") break;
    }
    if (!r.combat || r.combat.outcome !== "ongoing") break;
    r = endPlayerTurn(r);
  }
  return r;
}

function autoRun(seed: string, avoidElites = true): RunState {
  let r = startRun(seed);
  let guard = 0;
  while (r.outcome === "ongoing" && guard++ < 120) {
    if (r.pendingRewards) {
      r = pickRewardSafely(r);
      continue;
    }
    if (r.combat && r.combat.outcome === "ongoing") {
      r = autoCombat(r);
      continue;
    }
    const legal = legalNextNodes(r);
    if (!legal.length) break;
    const nodes = legal.map((id) => r.map.find((n) => n.id === id)!);
    const safe = avoidElites
      ? (nodes.find((n) => n.type !== "elite") ?? nodes[0])
      : nodes[0];
    r = chooseNode(r, safe.id);
    if (r.combat && r.combat.outcome === "ongoing") r = autoCombat(r);
  }
  return r;
}

// ===========================================================================
// KEYSTONE
// ===========================================================================

describe("forecastAttack", () => {
  it("predicts a damage range + kills for a legal attack, null otherwise", () => {
    let r = startRun("forecast-seed");
    r = chooseNode(r, legalNextNodes(r)[0]); // row 0 is always a combat node
    expect(r.combat?.outcome).toBe("ongoing");
    const attacker = r.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const targetId = legalCommandTargets(r, attacker.id)[0];
    const f = forecastAttack(r, attacker.id, targetId)!;
    expect(f).toBeTruthy();
    expect(f.damageMin).toBeLessThanOrEqual(f.damageMax);
    expect(f.killsMin).toBeLessThanOrEqual(f.killsMax);
    expect(f.damageMin).toBeGreaterThanOrEqual(0);
    // unknown / illegal target → null
    expect(forecastAttack(r, attacker.id, "no_such_stack")).toBeNull();
  });

  it("is deterministic (same run → same forecast)", () => {
    let r = startRun("forecast-seed-2");
    r = chooseNode(r, legalNextNodes(r)[0]);
    const a = r.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const t = legalCommandTargets(r, a.id)[0];
    expect(forecastAttack(r, a.id, t)).toEqual(forecastAttack(r, a.id, t));
  });
});

describe("combat events (damage popups)", () => {
  it("a player attack emits an attack event with damage", () => {
    let r = startRun("events-seed");
    r = chooseNode(r, legalNextNodes(r)[0]);
    const attacker = r.combat!.yourArmy.stacks.find((s) => s.count > 0)!;
    const targetId = legalCommandTargets(r, attacker.id)[0];
    r = commandStack(r, attacker.id, "attack", targetId);
    const evts = r.lastEvents ?? [];
    expect(evts.length).toBeGreaterThan(0);
    const atk = evts.find((e) => e.kind === "attack")!;
    expect(atk.side).toBe("player");
    expect(atk.attackerId).toBe(attacker.id);
    expect(atk.targetId).toBe(targetId);
    expect(atk.damage).toBeGreaterThanOrEqual(0);
  });

  it("the enemy turn emits enemy strike events", () => {
    let r = startRun("events-seed-2");
    r = chooseNode(r, legalNextNodes(r)[0]);
    r = endPlayerTurn(r); // enemies act
    // If the battle is still going, the enemy turn produced strike events.
    if (r.combat && r.combat.outcome === "ongoing") {
      const evts = r.lastEvents ?? [];
      expect(evts.some((e) => e.side === "enemy")).toBe(true);
    } else {
      expect(["won", "lost"]).toContain(r.outcome === "ongoing" ? r.combat?.outcome : r.outcome);
    }
  });
});

describe("full run (the keystone)", () => {
  it("resolves headless from a seed to won/lost (no hangs)", () => {
    for (let i = 0; i < 25; i++) {
      const r = autoRun(`resolve-${i}`);
      expect(["won", "lost"]).toContain(r.outcome);
      expect(r.combat).toBeNull();
    }
  });

  it("is byte-identical for the same seed (determinism)", () => {
    const a = autoRun("determinism-A");
    const b = autoRun("determinism-A");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different seeds diverge", () => {
    const a = autoRun("seed-alpha");
    const b = autoRun("seed-beta");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("the game is winnable (a winnable seed exists in a small search)", () => {
    let found: string | null = null;
    for (let i = 0; i < 60 && !found; i++) {
      if (autoRun(`win-${i}`).outcome === "won") found = `win-${i}`;
    }
    expect(found).not.toBeNull();
  });

  it("win-rate sweep stays in a sane band (not 0%, not 100%)", () => {
    let wins = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      if (autoRun(`band-${i}`).outcome === "won") wins++;
    }
    // The greedy bot should win sometimes but not always — a skill-expressive
    // difficulty. Wide band so the assertion is robust, not a snapshot.
    expect(wins).toBeGreaterThan(N * 0.15);
    expect(wins).toBeLessThan(N * 0.95);
  });
});

// ===========================================================================
// Node interactions through the public API
// ===========================================================================

describe("startRun shape", () => {
  it("starts with a hero, an army, gold, a map, ongoing", () => {
    const r = startRun("shape");
    expect(r.hero).toBeTruthy();
    expect(r.hero.mana).toBe(r.hero.maxMana);
    expect(r.army.length).toBeGreaterThan(0);
    expect(r.army.length).toBeLessThanOrEqual(ARMY_CAP);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.map.length).toBeGreaterThan(0);
    expect(r.combat).toBeNull();
    expect(r.outcome).toBe("ongoing");
  });
});

/** Walk a run forward until it reaches a pending offer of a given reward kind. */
function advanceToOffer(seed: string, kind: string): RunState | null {
  let r = startRun(seed);
  let guard = 0;
  while (r.outcome === "ongoing" && guard++ < 60) {
    if (r.pendingRewards) {
      if (r.pendingRewards.some((c) => c.kind === kind)) return r;
      r = pickRewardSafely(r);
      continue;
    }
    if (r.combat && r.combat.outcome === "ongoing") {
      r = autoCombat(r);
      continue;
    }
    const legal = legalNextNodes(r);
    if (!legal.length) break;
    const nodes = legal.map((id) => r.map.find((n) => n.id === id)!);
    const safe = nodes.find((n) => n.type !== "elite") ?? nodes[0];
    r = chooseNode(r, safe.id);
    if (r.combat && r.combat.outcome === "ongoing") r = autoCombat(r);
  }
  return null;
}

describe("node interactions", () => {
  it("recruitAt adds (or merges) a stack and spends gold", () => {
    for (const seed of ["rec-1", "rec-2", "rec-3", "rec-4", "rec-5"]) {
      const r = advanceToOffer(seed, "recruit");
      if (!r) continue;
      const offer = r.pendingRewards!.find((c) => c.kind === "recruit");
      if (!offer || offer.kind !== "recruit" || r.gold < offer.cost) continue;
      const goldBefore = r.gold;
      const after = recruitAt(r, r.currentNodeId!, offer.creatureId);
      expect(after.gold).toBe(goldBefore - offer.cost);
      expect(after.pendingRewards).toBeNull();
      return;
    }
  });

  it("learnAt adds a spell to the spellbook", () => {
    for (const seed of ["learn-1", "learn-2", "learn-3", "learn-4"]) {
      const r = advanceToOffer(seed, "learn");
      if (!r) continue;
      const offer = r.pendingRewards!.find((c) => c.kind === "learn");
      if (!offer || offer.kind !== "learn" || r.gold < offer.cost) continue;
      const before = r.hero.spellbook.length;
      const after = learnAt(r, r.currentNodeId!, offer.spellId);
      expect(after.hero.spellbook.length).toBe(before + 1);
      return;
    }
  });

  it("buyAt equips an artifact and recomputes hero stats", () => {
    for (const seed of ["buy-1", "buy-2", "buy-3", "buy-4", "buy-5", "buy-6"]) {
      const r = advanceToOffer(seed, "buy");
      if (!r) continue;
      const offer = r.pendingRewards!.find((c) => c.kind === "buy");
      if (!offer || offer.kind !== "buy" || r.gold < offer.cost) continue;
      const after = buyAt(r, r.currentNodeId!, offer.artifactId);
      expect(after.hero.equipment[offer.slot]).toBeTruthy();
      return;
    }
  });

  it("upgradeAt replaces a stack with its upgraded form", () => {
    for (const seed of ["up-1", "up-2", "up-3", "up-4", "up-5", "up-6", "up-7"]) {
      const r = advanceToOffer(seed, "upgrade");
      if (!r) continue;
      const offer = r.pendingRewards!.find((c) => c.kind === "upgrade");
      if (!offer || offer.kind !== "upgrade" || r.gold < offer.cost) continue;
      const after = upgradeAt(r, r.currentNodeId!, offer.stackId);
      const up = after.army.find((s) => s.id === offer.stackId)!;
      expect(up.sourceId).toBe(offer.toCreatureId);
      expect(up.upgraded).toBe(true);
      return;
    }
  });
});

describe("equipment paper-doll", () => {
  it("equipArtifact applies primary deltas; unequip reverts them", () => {
    const r = startRun("equip");
    const axe = artifactById("artifact_centaurs_axe")!; // +2 Attack, RightHand
    const baseAtk = r.hero.attack;
    const equipped = equipArtifact(r, axe.id, "RightHand");
    expect(equipped.hero.attack).toBe(baseAtk + 2);
    const reverted = unequipArtifact(equipped, "RightHand");
    expect(reverted.hero.attack).toBe(baseAtk);
  });

  it("equipping a +knowledge artifact raises maxMana and clamps mana", () => {
    const r = startRun("equip-mana");
    const helm = artifactById("artifact_helm_of_the_alabaster_unicorn")!; // +1 Knowledge
    const before = r.hero.maxMana;
    const after = equipArtifact(r, helm.id, "Head");
    expect(after.hero.maxMana).toBeGreaterThan(before);
    expect(after.hero.mana).toBeLessThanOrEqual(after.hero.maxMana);
  });
});

describe("pendingRewards accessor", () => {
  it("returns null with no pending offers", () => {
    expect(pendingRewards(startRun("pr"))).toBeNull();
  });
});
