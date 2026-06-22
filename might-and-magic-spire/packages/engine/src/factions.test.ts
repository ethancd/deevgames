// FACTION PLAYABILITY keystone — proves a non-Necropolis run (Castle) is
// playable end-to-end and winnable across a seed sweep, exactly like the
// Necropolis keystone in run.test.ts. Also pins:
//   - startRun(seed) is unchanged (default Galthran, Necropolis) — determinism.
//   - startRun(seed, castleHeroId) yields a Castle hero + Castle starting army.
//   - dwellings recruit the PLAYER'S faction; encounters draw cross-faction foes.
import { describe, it, expect } from "vitest";
import {
  startRun, legalNextNodes, chooseNode, pickReward, commandStack, castSpell,
  endPlayerTurn, legalCommandTargets, legalSpellTargets, ARMY_CAP,
} from "./run";
import { FACTIONS, PLAYABLE_HEROES, heroesOfFaction, basePool } from "./content";
import type { RunState, Stack } from "./types";

// ── A headless greedy auto-player (mirrors run.test.ts), now hero-parametrized.
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
      if (!ids.length) { r = commandStack(r, s.id, "defend"); continue; }
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

function autoRun(seed: string, heroId?: string): RunState {
  let r = startRun(seed, heroId);
  let guard = 0;
  while (r.outcome === "ongoing" && guard++ < 120) {
    if (r.pendingRewards) { r = pickRewardSafely(r); continue; }
    if (r.combat && r.combat.outcome === "ongoing") { r = autoCombat(r); continue; }
    const legal = legalNextNodes(r);
    if (!legal.length) break;
    const nodes = legal.map((id) => r.map.find((n) => n.id === id)!);
    const safe = nodes.find((n) => n.type !== "elite") ?? nodes[0];
    r = chooseNode(r, safe.id);
    if (r.combat && r.combat.outcome === "ongoing") r = autoCombat(r);
  }
  return r;
}

// A Castle hero with a creature specialty (so its starting army has a 2nd stack).
const CASTLE_HERO = heroesOfFaction("Castle")[0];

// ===========================================================================
// startRun(seed) determinism — the default run is unchanged.
// ===========================================================================
describe("startRun default is unchanged (determinism)", () => {
  it("startRun(seed) === startRun(seed, undefined) === Galthran/Necropolis", () => {
    const a = startRun("det-A");
    const b = startRun("det-A", undefined);
    const c = startRun("det-A", "hero_galthran");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
    expect(a.faction).toBe("Necropolis");
    expect(a.hero.id).toBe("hero_galthran");
    // The classic starting army: 20 Skeletons + 10 Walking Dead.
    expect(a.army.map((s) => [s.sourceId, s.count])).toEqual([
      ["necropolis_skeleton", 20],
      ["necropolis_walking_dead", 10],
    ]);
  });

  it("an unknown heroId falls back to the default (no throw)", () => {
    const r = startRun("fallback", "hero_does_not_exist");
    expect(r.hero.id).toBe("hero_galthran");
    expect(r.faction).toBe("Necropolis");
  });
});

// ===========================================================================
// startRun(seed, castleHeroId) — Castle hero + Castle starting army.
// ===========================================================================
describe("startRun with a Castle hero", () => {
  it("yields a Castle hero, faction, and a Castle starting army", () => {
    const r = startRun("castle-shape", CASTLE_HERO.id);
    expect(r.faction).toBe("Castle");
    expect(r.hero.faction).toBe("Castle");
    expect(r.hero.id).toBe(CASTLE_HERO.id);
    expect(r.army.length).toBeGreaterThan(0);
    expect(r.army.length).toBeLessThanOrEqual(ARMY_CAP);
    // Every starting stack is a Castle creature (you fight as your faction).
    for (const s of r.army) expect(s.sourceId.startsWith("castle_")).toBe(true);
    // A non-Necromancer hero has no Necromancy skill (growth stays skill-gated).
    expect(r.hero.skills["Necromancy"] ?? 0).toBe(0);
    expect(r.hero.mana).toBe(r.hero.maxMana);
  });

  it("each faction derives a same-faction starting army", () => {
    for (const faction of FACTIONS) {
      const hero = heroesOfFaction(faction)[0];
      const r = startRun(`fac-${faction}`, hero.id);
      expect(r.faction).toBe(faction);
      const base = new Set(basePool(faction).map((c) => c.id));
      for (const s of r.army) expect(base.has(s.sourceId)).toBe(true);
    }
  });
});

// ===========================================================================
// Dwelling recruits the player's faction; encounters are cross-faction.
// ===========================================================================
describe("per-faction pools", () => {
  it("a Castle run's dwelling offers Castle creatures", () => {
    // Walk a Castle run until a dwelling offer appears; assert it's Castle stock.
    let r = startRun("castle-dwell", CASTLE_HERO.id);
    let guard = 0;
    let sawDwelling = false;
    while (r.outcome === "ongoing" && guard++ < 80) {
      if (r.pendingRewards) {
        const rec = r.pendingRewards.find((c) => c.kind === "recruit");
        if (rec && rec.kind === "recruit") {
          expect(rec.creatureId.startsWith("castle_")).toBe(true);
          sawDwelling = true;
          break;
        }
        r = pickRewardSafely(r);
        continue;
      }
      if (r.combat && r.combat.outcome === "ongoing") { r = autoCombat(r); continue; }
      const legal = legalNextNodes(r);
      if (!legal.length) break;
      const dwell = legal.map((id) => r.map.find((n) => n.id === id)!).find((n) => n.type === "dwelling");
      const pick = dwell ?? legal.map((id) => r.map.find((n) => n.id === id)!).find((n) => n.type !== "elite") ?? r.map.find((n) => n.id === legal[0])!;
      r = chooseNode(r, pick.id);
      if (r.combat && r.combat.outcome === "ongoing") r = autoCombat(r);
    }
    expect(sawDwelling).toBe(true);
  });

  it("encounters draw foes from across factions (not only the player's)", () => {
    // Collect enemy creature factions over several Castle combats; expect that
    // at least one non-Castle foe appears (cross-faction pool).
    const factionsSeen = new Set<string>();
    for (const seed of ["enc-1", "enc-2", "enc-3", "enc-4", "enc-5"]) {
      let r = startRun(seed, CASTLE_HERO.id);
      let guard = 0;
      while (r.outcome === "ongoing" && guard++ < 20) {
        if (r.pendingRewards) { r = pickRewardSafely(r); continue; }
        if (r.combat && r.combat.outcome === "ongoing") {
          for (const s of r.combat.enemyArmy.stacks) {
            const f = s.sourceId.split("_")[0];
            factionsSeen.add(f);
          }
          r = autoCombat(r);
          continue;
        }
        const legal = legalNextNodes(r);
        if (!legal.length) break;
        const nodes = legal.map((id) => r.map.find((n) => n.id === id)!);
        const cmb = nodes.find((n) => n.type === "combat") ?? nodes[0];
        r = chooseNode(r, cmb.id);
      }
    }
    // The broad pool spans necropolis/castle/stronghold; over many fights we
    // should see more than a single faction's creatures.
    expect(factionsSeen.size).toBeGreaterThan(1);
  });
});

// ===========================================================================
// THE CASTLE KEYSTONE — a Castle run resolves and is winnable across seeds.
// ===========================================================================
describe("Castle full run (the non-Necropolis keystone)", () => {
  it("resolves headless from a seed to won/lost (no hangs)", () => {
    for (let i = 0; i < 25; i++) {
      const r = autoRun(`castle-resolve-${i}`, CASTLE_HERO.id);
      expect(["won", "lost"]).toContain(r.outcome);
      expect(r.combat).toBeNull();
    }
  });

  it("is byte-identical for the same seed + hero (determinism)", () => {
    const a = autoRun("castle-det", CASTLE_HERO.id);
    const b = autoRun("castle-det", CASTLE_HERO.id);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is winnable (a winnable Castle seed exists in a small search)", () => {
    let found: string | null = null;
    for (let i = 0; i < 60 && !found; i++) {
      if (autoRun(`castle-win-${i}`, CASTLE_HERO.id).outcome === "won") found = `castle-win-${i}`;
    }
    expect(found).not.toBeNull();
  });

  it("win-rate sweep stays in a sane band (not 0%, not 100%)", () => {
    let wins = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      if (autoRun(`castle-band-${i}`, CASTLE_HERO.id).outcome === "won") wins++;
    }
    // Castle sustains via Dwellings/Rest/gold (no Necromancy) and the dumb bot
    // still wins a healthy share — non-Necropolis is genuinely playable.
    expect(wins).toBeGreaterThan(N * 0.15);
    expect(wins).toBeLessThan(N * 0.95);
  });
});

// ===========================================================================
// Hero selection surface (used by the TitleScreen).
// ===========================================================================
describe("hero selection surface", () => {
  it("exposes multiple playable factions, each with heroes", () => {
    expect(FACTIONS).toContain("Necropolis");
    expect(FACTIONS).toContain("Castle");
    expect(FACTIONS).toContain("Stronghold");
    for (const f of FACTIONS) expect(heroesOfFaction(f).length).toBeGreaterThan(0);
    expect(PLAYABLE_HEROES.length).toBe(
      FACTIONS.reduce((n, f) => n + heroesOfFaction(f).length, 0),
    );
  });
});
