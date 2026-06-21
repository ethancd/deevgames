import { describe, it, expect } from "vitest";
import type { CardDef } from "@mms/schema";
import { makeRng } from "./rng";
import { startCombat, makeEnemy, playCard, endTurn } from "./combat";
import { creatureById } from "./content";
import type { Relic } from "./types";

const skeleton = creatureById("necropolis_skeleton")!;

function strikeCard(id: string, amount: number, cost = 1): CardDef {
  return {
    id,
    sourceId: "test",
    name: "Test Strike",
    type: "strike",
    faction: "Neutral",
    cost,
    rarity: "common",
    effects: [{ kind: "damage", amount, target: "enemy" }],
    upgradeOf: null,
    text: `Deal ${amount} damage.`,
    imageRef: "test_strike",
  };
}

function blockCard(id: string, amount: number, cost = 1): CardDef {
  return {
    id,
    sourceId: "test",
    name: "Test Guard",
    type: "skill",
    faction: "Neutral",
    cost,
    rarity: "common",
    effects: [{ kind: "block", amount, target: "self" }],
    upgradeOf: null,
    text: `Gain ${amount} block.`,
    imageRef: "test_guard",
  };
}

function setup(deck: CardDef[], enemyHp = 100) {
  const rng = makeRng("combat-test");
  const enemy = { ...makeEnemy(skeleton, rng, "_t"), hp: enemyHp, maxHp: enemyHp };
  // Force a known intent (attack for 5) so combat math is predictable.
  enemy.intentScript = [{ kind: "attack", value: 5, label: "Attacks for 5" }];
  enemy.intentIndex = 0;
  enemy.intent = enemy.intentScript[0];
  enemy.strength = 0;
  const state = startCombat({
    deck,
    playerHp: 50,
    playerMaxHp: 50,
    enemies: [enemy],
    relics: [],
    rng: makeRng("combat-test").fork("c"),
  });
  return { state, enemyId: enemy.id, rng: makeRng("combat-test").fork("play") };
}

describe("combat math", () => {
  it("playing a strike damages the targeted enemy and spends energy", () => {
    const deck = [strikeCard("s0", 8), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const { state, enemyId, rng } = setup(deck, 100);
    const before = state.enemies[0].hp;
    const after = playCard(state, "s0", enemyId, rng);
    expect(after.enemies[0].hp).toBe(before - 8);
    expect(after.energy).toBe(state.energy - 1);
    // input not mutated
    expect(state.enemies[0].hp).toBe(before);
  });

  it("block absorbs incoming enemy damage on endTurn", () => {
    const deck = [blockCard("b0", 10), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const { state, rng } = setup(deck, 100);
    const blocked = playCard(state, "b0", undefined, rng);
    expect(blocked.playerBlock).toBe(10);
    const afterEnemyTurn = endTurn(blocked, rng);
    // enemy hits for 5, fully absorbed by 10 block → no HP loss, block reset next turn
    expect(afterEnemyTurn.playerHp).toBe(50);
    expect(afterEnemyTurn.playerBlock).toBe(0); // reset at new turn
  });

  it("unblocked enemy damage reduces player HP", () => {
    const deck = [strikeCard("s0", 8), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const { state, rng } = setup(deck, 100);
    const after = endTurn(state, rng);
    expect(after.playerHp).toBe(45); // 50 - 5
  });

  it("relic strength adds to every player attack", () => {
    const deck = [strikeCard("s0", 8), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const rng = makeRng("str-test");
    const enemy = { ...makeEnemy(skeleton, rng, "_s"), hp: 100, maxHp: 100 };
    const relic: Relic = {
      id: "r", name: "Axe", rarity: "uncommon", description: "+2 Attack",
      imageRef: "axe", effect: { kind: "startStrength", amount: 2 },
    };
    const state = startCombat({
      deck, playerHp: 50, playerMaxHp: 50, enemies: [enemy], relics: [relic],
      rng: makeRng("str-test").fork("c"),
    });
    expect(state.playerStrength).toBe(2);
    const after = playCard(state, "s0", enemy.id, makeRng("str-test").fork("p"));
    expect(after.enemies[0].hp).toBe(100 - (8 + 2)); // strike + strength
  });

  it("combat is won when all enemies die", () => {
    const deck = [strikeCard("s0", 100), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const { state, enemyId, rng } = setup(deck, 50);
    const after = playCard(state, "s0", enemyId, rng);
    expect(after.outcome).toBe("won");
    expect(after.enemies).toHaveLength(0);
  });

  it("combat is lost when player HP hits 0", () => {
    const deck = [strikeCard("s0", 1), strikeCard("s1", 1), strikeCard("s2", 1), strikeCard("s3", 1), strikeCard("s4", 1)];
    const rng = makeRng("lose-test");
    const enemy = { ...makeEnemy(skeleton, rng, "_l"), hp: 1000, maxHp: 1000 };
    enemy.intentScript = [{ kind: "attack", value: 1000, label: "Attacks for 1000" }];
    enemy.intentIndex = 0;
    enemy.intent = enemy.intentScript[0];
    const state = startCombat({
      deck, playerHp: 50, playerMaxHp: 50, enemies: [enemy], relics: [],
      rng: makeRng("lose-test").fork("c"),
    });
    const after = endTurn(state, makeRng("lose-test").fork("p"));
    expect(after.outcome).toBe("lost");
    expect(after.playerHp).toBe(0);
  });

  it("rejects illegal plays (not enough energy)", () => {
    const deck = [strikeCard("big", 8, 99), strikeCard("s1", 8), strikeCard("s2", 8), strikeCard("s3", 8), strikeCard("s4", 8)];
    const { state, enemyId, rng } = setup(deck, 100);
    expect(() => playCard(state, "big", enemyId, rng)).toThrow(/energy/);
  });

  it("intent script advances deterministically after each enemy turn", () => {
    const deck = [strikeCard("s0", 1), strikeCard("s1", 1), strikeCard("s2", 1), strikeCard("s3", 1), strikeCard("s4", 1)];
    const rng = makeRng("intent-test");
    const enemy = makeEnemy(skeleton, rng, "_i");
    enemy.intentScript = [
      { kind: "attack", value: 3, label: "Attacks for 3" },
      { kind: "block", value: 4, label: "Defends (4 block)" },
    ];
    enemy.intentIndex = 0;
    enemy.intent = enemy.intentScript[0];
    enemy.hp = 1000; enemy.maxHp = 1000;
    let state = startCombat({
      deck, playerHp: 50, playerMaxHp: 50, enemies: [enemy], relics: [],
      rng: makeRng("intent-test").fork("c"),
    });
    expect(state.enemies[0].intent.kind).toBe("attack");
    state = endTurn(state, makeRng("intent-test").fork("p"));
    expect(state.enemies[0].intent.kind).toBe("block");
    state = endTurn(state, makeRng("intent-test").fork("p2"));
    expect(state.enemies[0].intent.kind).toBe("attack"); // wrapped around
  });
});
