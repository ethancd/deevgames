// Combat resolution — turn structure, energy, block, the effect system driven by
// CardDef.effects, enemy intents (a lookup table, not a planner), and relics.
//
// All functions are PURE: they take state + inputs and return NEW state. No
// mutation of inputs. We deep-clone the combat slice up front and mutate the
// clone freely, which keeps the resolution code readable.

import type { CardDef, SourceCreature } from "@mms/schema";
import type { Effect } from "./schema-types";
import type { Rng } from "./rng";
import type {
  CombatState,
  Enemy,
  Intent,
  Relic,
} from "./types";
import { adaptCreature } from "./adapter";
import { creatureById } from "./content";

export const BASE_ENERGY = 3;
export const HAND_SIZE = 5;

// ---------------------------------------------------------------------------
// Intent / enemy construction
// ---------------------------------------------------------------------------

/**
 * Build a deterministic, repeating intent script for an enemy from its source
 * creature. The "AI" is this table — telegraphed and predictable. Most enemies
 * loop attack→attack→defend; a few buff. We derive the attack value from the
 * creature's attack stat so the telegraph is honest about incoming damage.
 */
export function buildIntentScript(c: SourceCreature, rng: Rng): Intent[] {
  const atk = Math.max(1, c.attack);
  const attack: Intent = {
    kind: "attack",
    value: atk,
    label: `Attacks for ${atk}`,
  };
  const bigAttack: Intent = {
    kind: "attack",
    value: atk + Math.ceil(atk / 2),
    label: `Attacks for ${atk + Math.ceil(atk / 2)}`,
  };
  const block: Intent = { kind: "block", value: atk, label: `Defends (${atk} block)` };
  const buff: Intent = { kind: "buff", value: 2, label: "Strengthens (+2)" };

  // Pick one of a few canned patterns deterministically.
  const patterns: Intent[][] = [
    [attack, attack, block],
    [attack, block, bigAttack],
    [buff, attack, attack],
    [attack, attack],
  ];
  return rng.pick(patterns);
}

/** Adapt a source creature into a combat Enemy with a live intent. */
export function makeEnemy(c: SourceCreature, rng: Rng, indexSuffix = ""): Enemy {
  const script = buildIntentScript(c, rng);
  return {
    id: `enemy_${c.id}${indexSuffix}`,
    name: c.name,
    hp: c.hp,
    maxHp: c.hp,
    block: 0,
    intent: script[0],
    imageRef: c.imageRef,
    strength: 0,
    sourceId: c.id,
    intentScript: script,
    intentIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Combat setup
// ---------------------------------------------------------------------------

export interface StartCombatArgs {
  deck: CardDef[];
  playerHp: number;
  playerMaxHp: number;
  enemies: Enemy[];
  relics: Relic[];
  rng: Rng;
}

/** Initialize a CombatState: shuffle deck into draw pile, apply combat-start
 *  relics, draw the opening hand. */
export function startCombat(args: StartCombatArgs): CombatState {
  const { deck, playerHp, playerMaxHp, enemies, relics, rng } = args;

  let startBlock = 0;
  let startStrength = 0;
  let bonusEnergy = 0;
  let bonusDraw = 0;
  for (const r of relics) {
    switch (r.effect.kind) {
      case "startBlock":
        startBlock += r.effect.amount;
        break;
      case "startStrength":
        startStrength += r.effect.amount;
        break;
      case "startEnergy":
        bonusEnergy += r.effect.amount;
        break;
      case "drawBonus":
        bonusDraw += r.effect.amount;
        break;
      default:
        break;
    }
  }

  const drawPile = rng.shuffle(deck);
  const maxEnergy = BASE_ENERGY + bonusEnergy;

  const state: CombatState = {
    turn: 1,
    energy: maxEnergy,
    maxEnergy,
    playerHp,
    playerMaxHp,
    playerBlock: startBlock,
    hand: [],
    drawCount: drawPile.length,
    discardCount: 0,
    enemies: enemies.map((e) => ({ ...e, strength: e.strength })),
    outcome: "ongoing",
    playerStrength: startStrength,
    drawPile,
    discardPile: [],
    log: [],
  };

  drawCards(state, HAND_SIZE + bonusDraw, rng);
  refreshCounts(state);
  if (startBlock) state.log.push(`Gain ${startBlock} block (relic).`);
  if (startStrength) state.log.push(`Gain ${startStrength} strength (relic).`);
  return state;
}

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

/**
 * Play a card from hand against an optional target enemy. Pure: returns a new
 * CombatState. Throws on illegal plays (card not in hand, not enough energy) so
 * the caller can surface a clear error rather than silently no-op.
 */
export function playCard(
  state: CombatState,
  cardId: string,
  targetId: string | undefined,
  rng: Rng,
): CombatState {
  if (state.outcome !== "ongoing") return state;
  const next = cloneCombat(state);

  const idx = next.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`playCard: ${cardId} not in hand`);
  const card = next.hand[idx];
  if (card.cost > next.energy)
    throw new Error(`playCard: not enough energy for ${cardId}`);

  next.energy -= card.cost;
  next.hand.splice(idx, 1);
  next.discardPile.push(card);

  for (const eff of card.effects) {
    applyEffect(next, eff, targetId, rng, /*fromPlayer*/ true);
  }

  cullDeadEnemies(next);
  checkCombatEnd(next);
  refreshCounts(next);
  next.log.push(`Play ${card.name}.`);
  return next;
}

/**
 * Apply a single effect. `fromPlayer` distinguishes the player's cards from
 * enemy actions so targeting/strength resolve from the right side.
 */
function applyEffect(
  state: CombatState,
  eff: Effect,
  targetId: string | undefined,
  rng: Rng,
  fromPlayer: boolean,
): void {
  const amount = eff.amount ?? 0;
  switch (eff.kind) {
    case "damage": {
      const total = fromPlayer ? amount + state.playerStrength : amount;
      const targets = resolveDamageTargets(state, eff.target, targetId, rng);
      for (const e of targets) dealDamageToEnemy(e, total);
      break;
    }
    case "block":
      state.playerBlock += amount;
      break;
    case "buff":
      // Player self-buff: strength.
      state.playerStrength += amount;
      break;
    case "debuff": {
      // Reduce target enemy's strength (min 0).
      const targets = resolveDamageTargets(state, eff.target, targetId, rng);
      for (const e of targets) e.strength = Math.max(0, e.strength - amount);
      break;
    }
    case "draw":
      drawCards(state, Math.max(1, amount), rng);
      break;
    case "mana":
      state.energy += amount;
      break;
    case "summon": {
      // Summon an allied creature as bonus damage this turn (lightweight: it
      // immediately strikes the first enemy). Keeps the kind meaningful without
      // a full minion subsystem.
      const src = eff.summonId ? creatureById(eff.summonId) : undefined;
      const dmg = src ? adaptCreature(src).effects.find((e) => e.kind === "damage")?.amount ?? 0 : amount;
      const count = eff.count ?? 1;
      const live = state.enemies.filter((e) => e.hp > 0);
      if (live.length) {
        for (let i = 0; i < count; i++) dealDamageToEnemy(live[0], dmg);
      }
      break;
    }
  }
}

function resolveDamageTargets(
  state: CombatState,
  target: Effect["target"],
  targetId: string | undefined,
  rng: Rng,
): Enemy[] {
  const live = state.enemies.filter((e) => e.hp > 0);
  switch (target) {
    case "allEnemies":
      return live;
    case "random":
      return live.length ? [rng.pick(live)] : [];
    case "self":
      return []; // handled by non-damage effects; damage-to-self unsupported
    case "enemy":
    default: {
      if (targetId) {
        const found = live.find((e) => e.id === targetId);
        if (found) return [found];
      }
      // Default to first live enemy when no/invalid target given.
      return live.length ? [live[0]] : [];
    }
  }
}

/** Apply damage to an enemy, chewing through its block first. */
function dealDamageToEnemy(enemy: Enemy, amount: number): void {
  if (amount <= 0) return;
  let remaining = amount;
  if (enemy.block > 0) {
    const absorbed = Math.min(enemy.block, remaining);
    enemy.block -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) enemy.hp = Math.max(0, enemy.hp - remaining);
}

// ---------------------------------------------------------------------------
// End turn — enemies act, then new turn begins
// ---------------------------------------------------------------------------

/**
 * End the player's turn. Resolves every living enemy's telegraphed intent,
 * advances each enemy's intent script, then starts a fresh player turn (block
 * wipes, energy refills, draw to hand size).
 */
export function endTurn(state: CombatState, rng: Rng): CombatState {
  if (state.outcome !== "ongoing") return state;
  const next = cloneCombat(state);

  // 1) Enemies act on their current intent.
  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    resolveEnemyIntent(next, enemy);
    if (next.playerHp <= 0) break;
  }

  cullDeadEnemies(next);
  checkCombatEnd(next);
  if (next.outcome !== "ongoing") {
    refreshCounts(next);
    return next;
  }

  // 2) Advance surviving enemies to their next telegraphed intent.
  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.intentIndex = (enemy.intentIndex + 1) % enemy.intentScript.length;
    enemy.intent = enemy.intentScript[enemy.intentIndex];
  }

  // 3) New player turn: block resets, energy refills, hand redraws.
  next.turn += 1;
  next.playerBlock = 0;
  next.energy = next.maxEnergy;
  // Discard the remaining hand, then draw a fresh hand.
  next.discardPile.push(...next.hand);
  next.hand = [];
  drawCards(next, HAND_SIZE, rng);

  refreshCounts(next);
  return next;
}

function resolveEnemyIntent(state: CombatState, enemy: Enemy): void {
  const intent = enemy.intent;
  switch (intent.kind) {
    case "attack": {
      const raw = (intent.value ?? 0) + enemy.strength;
      let dmg = raw;
      if (state.playerBlock > 0) {
        const absorbed = Math.min(state.playerBlock, dmg);
        state.playerBlock -= absorbed;
        dmg -= absorbed;
      }
      if (dmg > 0) state.playerHp = Math.max(0, state.playerHp - dmg);
      state.log.push(`${enemy.name} attacks for ${raw}.`);
      break;
    }
    case "block":
      enemy.block += intent.value ?? 0;
      state.log.push(`${enemy.name} gains ${intent.value ?? 0} block.`);
      break;
    case "buff":
      enemy.strength += intent.value ?? 0;
      state.log.push(`${enemy.name} gains ${intent.value ?? 0} strength.`);
      break;
    case "debuff":
    case "unknown":
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawCards(state: CombatState, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break; // truly out of cards
      // Reshuffle discard into draw.
      state.drawPile = rng.shuffle(state.discardPile);
      state.discardPile = [];
    }
    const card = state.drawPile.shift();
    if (card) state.hand.push(card);
  }
}

function cullDeadEnemies(state: CombatState): void {
  // Keep dead enemies out of `enemies` so the UI/targeting only sees the living.
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

function checkCombatEnd(state: CombatState): void {
  if (state.playerHp <= 0) {
    state.outcome = "lost";
  } else if (state.enemies.every((e) => e.hp <= 0)) {
    state.outcome = "won";
  }
}

function refreshCounts(state: CombatState): void {
  state.drawCount = state.drawPile.length;
  state.discardCount = state.discardPile.length;
}

/** Deep clone the combat slice so callers' input is never mutated. */
export function cloneCombat(state: CombatState): CombatState {
  return {
    ...state,
    hand: state.hand.map((c) => c),
    drawPile: state.drawPile.map((c) => c),
    discardPile: state.discardPile.map((c) => c),
    enemies: state.enemies.map((e) => ({ ...e, intentScript: e.intentScript.map((i) => ({ ...i })) })),
    log: state.log.slice(),
  };
}
