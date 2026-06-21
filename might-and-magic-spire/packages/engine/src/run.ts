// Run orchestration — the top-level state machine the frontend drives.
//
// Public operations (all PURE — return new RunState, never mutate inputs):
//   startRun(seed)                  -> RunState
//   chooseNode(run, nodeId)         -> RunState   (enters a node; starts combat)
//   playCard(run, cardId, targetId) -> RunState   (delegates into combat)
//   endTurn(run)                    -> RunState   (delegates into combat)
//   pickReward(run, choiceIndex)    -> RunState   (resolves post-combat rewards)

import type { CardDef } from "@mms/schema";
import { makeRng, type Rng } from "./rng";
import type {
  CombatState,
  Enemy,
  MapNode,
  Relic,
  RewardChoice,
  RunState,
} from "./types";
import { generateMap, startNodeIds } from "./map";
import {
  CREATURES,
  ARTIFACTS,
  DEFAULT_HERO,
  creatureById,
} from "./content";
import {
  adaptArtifact,
  adaptCreature,
  signatureRelicForHero,
} from "./adapter";
import {
  endTurn as combatEndTurn,
  makeEnemy,
  playCard as combatPlayCard,
  startCombat,
} from "./combat";

export const STARTING_HP = 70;
export const STARTING_GOLD = 99;
export const DECK_SIZE = 10; // starter deck: copies of low-tier creatures

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * The basic "Defend" skill — a deckbuilder needs a block tool or it's
 * unwinnable. Not adapted from a creature; it's a neutral starter skill (the
 * hero's shield arm), mirroring Slay the Spire's starting Defends.
 */
export function defendCard(n: number): CardDef {
  return {
    id: `card_defend#${n}`,
    sourceId: "starter_defend",
    name: "Defend",
    type: "skill",
    faction: "Neutral",
    cost: 1,
    rarity: "starter",
    effects: [{ kind: "block", amount: 6, target: "self" }],
    upgradeOf: null,
    text: "Gain 6 block.",
    imageRef: "starter_defend",
  };
}

/** Build the starter deck: cheap strikes + Defends, Slay-the-Spire-style. */
function buildStarterDeck(): CardDef[] {
  const skeleton = creatureById("necropolis_skeleton")!;
  const deck: CardDef[] = [];
  // 6 Skeleton strikes + 4 Defends = a 10-card starter that can both hit and
  // survive. Distinct instance ids so copies coexist.
  for (let i = 0; i < 6; i++) deck.push(instanceCard(adaptCreature(skeleton), i));
  for (let i = 0; i < 4; i++) deck.push(defendCard(i));
  return deck;
}

/** Give a card a unique instance id so multiple copies coexist in a deck. */
export function instanceCard(card: CardDef, n: number): CardDef {
  return { ...card, id: `${card.id}#${n}` };
}

export function startRun(seed: string): RunState {
  const rng = makeRng(seed);
  const hero = DEFAULT_HERO;
  const signature = signatureRelicForHero(hero);

  // Signature relic may raise max HP at acquisition.
  let maxHp = STARTING_HP;
  const relics: Relic[] = [signature];
  for (const r of relics) {
    if (r.effect.kind === "maxHp") maxHp += r.effect.amount;
  }

  const map = generateMap(rng, /*act*/ 1);

  return {
    seed,
    hp: maxHp,
    maxHp,
    gold: STARTING_GOLD,
    deck: buildStarterDeck(),
    relics,
    map,
    currentNodeId: null,
    act: 1,
    combat: null,
    outcome: "ongoing",
    clearedNodeIds: [],
    pendingRewards: null,
  };
}

// ---------------------------------------------------------------------------
// Node navigation
// ---------------------------------------------------------------------------

/** Is `nodeId` a legal move right now? Either a start node (nothing chosen yet)
 *  or reachable from the current node. */
export function legalNextNodes(run: RunState): string[] {
  if (run.currentNodeId === null) return startNodeIds(run.map);
  const cur = run.map.find((n) => n.id === run.currentNodeId);
  return cur ? cur.next.slice() : [];
}

export function chooseNode(run: RunState, nodeId: string): RunState {
  if (run.outcome !== "ongoing") return run;
  if (run.combat && run.combat.outcome === "ongoing")
    throw new Error("chooseNode: resolve the current combat first");
  if (run.pendingRewards)
    throw new Error("chooseNode: pick a reward first");

  const legal = legalNextNodes(run);
  if (!legal.includes(nodeId))
    throw new Error(`chooseNode: ${nodeId} is not reachable`);

  const node = run.map.find((n) => n.id === nodeId)!;
  const rng = makeRng(run.seed).fork(`node:${nodeId}`);

  const next: RunState = {
    ...run,
    currentNodeId: nodeId,
    clearedNodeIds: run.clearedNodeIds.slice(),
  };

  switch (node.type) {
    case "combat":
    case "elite":
    case "boss":
      next.combat = openCombat(next, node, rng);
      break;
    case "rest":
      // Heal 30% of max HP and clear the node.
      next.hp = Math.min(next.maxHp, next.hp + Math.floor(next.maxHp * 0.3));
      next.clearedNodeIds.push(nodeId);
      break;
    case "shop":
      // Lightweight shop: offer a relic + a card to buy via rewards channel.
      next.pendingRewards = rollShop(next, rng);
      break;
    case "event":
      // Simple deterministic event: small gold or small heal.
      next.pendingRewards = rollEvent(rng);
      break;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Combat lifecycle within a run
// ---------------------------------------------------------------------------

function openCombat(run: RunState, node: MapNode, rng: Rng): CombatState {
  const enemies = rollEncounter(node, rng);
  return startCombat({
    deck: run.deck,
    playerHp: run.hp,
    playerMaxHp: run.maxHp,
    enemies,
    relics: run.relics,
    rng: rng.fork("combat"),
  });
}

/** Pick enemies for a node. Bosses/elites are tougher and more numerous. */
function rollEncounter(node: MapNode, rng: Rng): Enemy[] {
  const eRng = rng.fork("encounter");
  if (node.type === "boss") {
    const boss = creatureById("necropolis_bone_dragon")!;
    const enemy = makeEnemy(boss, eRng, "_boss");
    // Act-1 boss is tuned to be the hardest *winnable* fight against a starter
    // deck, not the raw HoMM stat-block. We cap HP and give it a telegraphed
    // attack/attack/wind-up rhythm so a player who blocks the big hit survives.
    // (Balance lever — documented in ADAPTER.md.)
    enemy.hp = 80;
    enemy.maxHp = 80;
    enemy.intentScript = [
      { kind: "attack", value: 10, label: "Attacks for 10" },
      { kind: "attack", value: 10, label: "Attacks for 10" },
      { kind: "buff", value: 3, label: "Wreathes in flame (+3)" },
      { kind: "attack", value: 16, label: "Attacks for 16" },
    ];
    enemy.intentIndex = 0;
    enemy.intent = enemy.intentScript[0];
    return [enemy];
  }
  if (node.type === "elite") {
    const pool = CREATURES.filter((c) => c.tier >= 4 && c.tier <= 5);
    const lead = eRng.pick(pool);
    const adds = CREATURES.filter((c) => c.tier <= 2);
    return [
      makeEnemy(lead, eRng, "_e0"),
      makeEnemy(eRng.pick(adds), eRng, "_e1"),
    ];
  }
  // Normal combat: 1–3 low/mid-tier creatures.
  const pool = CREATURES.filter((c) => c.tier <= 3);
  const count = eRng.int(1, 3);
  const out: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    out.push(makeEnemy(eRng.pick(pool), eRng, `_n${i}`));
  }
  return out;
}

/** Sync the player's run-level HP from combat, and roll rewards on a win. */
function settleCombat(run: RunState, rng: Rng): RunState {
  const combat = run.combat!;
  const next: RunState = { ...run, hp: combat.playerHp };

  if (combat.outcome === "lost") {
    next.outcome = "lost";
    next.combat = combat;
    return next;
  }

  // Won.
  const node = run.map.find((n) => n.id === run.currentNodeId)!;
  next.clearedNodeIds = [...run.clearedNodeIds, node.id];
  next.combat = null;

  if (node.type === "boss") {
    // Beating the act boss wins the run (single-act build; multi-act is a
    // straightforward extension: regen the map and bump `act`).
    next.outcome = "won";
    return next;
  }

  next.pendingRewards = rollCombatRewards(node, rng.fork("rewards"));
  return next;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

function rollCombatRewards(node: MapNode, rng: Rng): RewardChoice[] {
  const gold = node.type === "elite" ? rng.int(25, 40) : rng.int(10, 20);
  const rewards: RewardChoice[] = [{ kind: "gold", amount: gold }];

  // Offer 1–2 card choices from creatures (excluding the bone dragon boss).
  const pool = CREATURES.filter((c) => c.tier >= 1 && c.tier <= 5);
  const a = adaptCreature(rng.pick(pool));
  const b = adaptCreature(rng.pick(pool));
  rewards.push({ kind: "card", card: { ...a, id: `${a.id}#reward` } });
  if (a.id !== b.id) rewards.push({ kind: "card", card: { ...b, id: `${b.id}#reward2` } });

  // Elites also drop a relic.
  if (node.type === "elite") {
    rewards.push({ kind: "relic", relic: adaptArtifact(rng.pick(ARTIFACTS)) });
  }

  rewards.push({ kind: "skip" });
  return rewards;
}

function rollShop(run: RunState, rng: Rng): RewardChoice[] {
  const sRng = rng.fork("shop");
  const out: RewardChoice[] = [];
  out.push({ kind: "relic", relic: adaptArtifact(sRng.pick(ARTIFACTS)) });
  const card = adaptCreature(sRng.pick(CREATURES.filter((c) => c.tier <= 4)));
  out.push({ kind: "card", card: { ...card, id: `${card.id}#shop` } });
  out.push({ kind: "skip" });
  void run;
  return out;
}

function rollEvent(rng: Rng): RewardChoice[] {
  const eRng = rng.fork("event");
  if (eRng.chance(0.5)) return [{ kind: "gold", amount: eRng.int(15, 30) }, { kind: "skip" }];
  return [{ kind: "heal", amount: eRng.int(8, 16) }, { kind: "skip" }];
}

export function pickReward(run: RunState, choiceIndex: number): RunState {
  if (!run.pendingRewards) throw new Error("pickReward: no rewards pending");
  const choice = run.pendingRewards[choiceIndex];
  if (!choice) throw new Error(`pickReward: invalid choice ${choiceIndex}`);

  const next: RunState = {
    ...run,
    deck: run.deck.slice(),
    relics: run.relics.slice(),
    clearedNodeIds: run.clearedNodeIds.slice(),
    pendingRewards: null,
  };

  applyReward(next, choice);

  // Clear the node now that its reward is resolved (shops/events have no combat
  // so they were not cleared by settleCombat).
  if (run.currentNodeId && !next.clearedNodeIds.includes(run.currentNodeId)) {
    next.clearedNodeIds.push(run.currentNodeId);
  }
  return next;
}

function applyReward(run: RunState, choice: RewardChoice): void {
  switch (choice.kind) {
    case "card":
      run.deck.push(choice.card);
      break;
    case "relic":
      if (!run.relics.some((r) => r.id === choice.relic.id)) {
        run.relics.push(choice.relic);
        if (choice.relic.effect.kind === "maxHp") {
          run.maxHp += choice.relic.effect.amount;
          run.hp += choice.relic.effect.amount;
        }
      }
      break;
    case "gold":
      run.gold += choice.amount;
      break;
    case "heal":
      run.hp = Math.min(run.maxHp, run.hp + choice.amount);
      break;
    case "skip":
      break;
  }
}

// ---------------------------------------------------------------------------
// Combat delegation (keeps the public surface uniform on RunState)
// ---------------------------------------------------------------------------

function combatRng(run: RunState): Rng {
  // Stable per-node combat RNG so replays are deterministic.
  return makeRng(run.seed).fork(`combatplay:${run.currentNodeId}`);
}

export function playCard(
  run: RunState,
  cardId: string,
  targetId?: string,
): RunState {
  if (!run.combat) throw new Error("playCard: no active combat");
  const rng = combatRng(run);
  const combat = combatPlayCard(run.combat, cardId, targetId, rng);
  const next: RunState = { ...run, combat };
  if (combat.outcome !== "ongoing") return settleCombat(next, makeRng(run.seed).fork(`settle:${run.currentNodeId}`));
  return next;
}

export function endTurn(run: RunState): RunState {
  if (!run.combat) throw new Error("endTurn: no active combat");
  const rng = combatRng(run);
  const combat = combatEndTurn(run.combat, rng);
  const next: RunState = { ...run, combat };
  if (combat.outcome !== "ongoing") return settleCombat(next, makeRng(run.seed).fork(`settle:${run.currentNodeId}`));
  return next;
}
