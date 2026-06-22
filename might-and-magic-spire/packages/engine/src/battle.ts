// HoMM3-style army battle resolution. Pure functions over CombatState. All
// magic numbers are NAMED LEVERS, documented in COMBAT.md (Ethan's veto surface).
//
// Model: two ranks (front melee / back ranged+casters+hero), side-alternation
// turns, retaliation as the only auto-reaction. The army is the player's life:
// when every player stack is dead they lose; when every enemy stack is dead they
// win.

import type { Rng } from "./rng";
import type {
  Army,
  CombatSpell,
  CombatState,
  Hero,
  SpellEffect,
  Stack,
  Telegraph,
} from "./types";

// ===========================================================================
// LEVERS (see COMBAT.md)
// ===========================================================================

/** A/D curve: damage multiplier from the attack-minus-defense difference. */
export const AD_ATTACK_STEP = 0.05; // +5% damage per point of (attack - defense)
export const AD_ATTACK_CAP = 3.0; // capped at +300%
export const AD_DEFENSE_STEP = 0.025; // -2.5% per point of (defense - attack)
export const AD_DEFENSE_CAP = 0.7; // capped at -70%

/** Defending adds round(defense * this) to effective defense. */
export const DEFEND_DEFENSE_FRACTION = 0.2;

/** Life-drain: fraction of damage dealt converted back to hp (Vampire Lord). */
export const LIFE_DRAIN_FRACTION = 1.0;

/** Regeneration: top creature heals this fraction of maxHp at round start. */
export const REGEN_FRACTION = 1.0; // full heal of the wounded top creature

// ===========================================================================
// EFFECTIVE STATS
// ===========================================================================

export function heroAttackBonus(hero: Hero): number {
  const offense = hero.skills["Offense"] ?? 0;
  return hero.attack + offense;
}

export function heroDefenseBonus(hero: Hero): number {
  const armorer = hero.skills["Armorer"] ?? 0;
  return hero.defense + armorer;
}

export function effAttack(stack: Stack, hero: Hero): number {
  return stack.attack + heroAttackBonus(hero);
}

export function effDefense(stack: Stack, hero: Hero): number {
  let d = stack.defense + heroDefenseBonus(hero);
  if (stack.isDefending) d += Math.round(stack.defense * DEFEND_DEFENSE_FRACTION);
  return d;
}

/** The A/D multiplier from attacker/defender effective stats. */
export function adMultiplier(attackVal: number, defenseVal: number): number {
  const diff = attackVal - defenseVal;
  if (diff >= 0) return 1 + Math.min(diff * AD_ATTACK_STEP, AD_ATTACK_CAP);
  return 1 - Math.min(-diff * AD_DEFENSE_STEP, AD_DEFENSE_CAP);
}

// ===========================================================================
// DAMAGE & APPLICATION
// ===========================================================================

const lc = (s: string) => s.toLowerCase();
export function hasAbility(stack: Stack, name: string): boolean {
  const n = lc(name);
  return stack.abilities.some((a) => lc(a).includes(n));
}

export function isShooter(stack: Stack): boolean {
  // Forgetfulness (LIGHT §3.7): a `noShoot` stack is forced to melee for the
  // battle — it loses reach and eats retaliation.
  if (stack.noShoot) return false;
  return hasAbility(stack, "shooter") || hasAbility(stack, "ranged");
}

/** Flying: reaches ANY rank (ignores the front wall) but is still MELEE — it
 *  takes and deals retaliation, unlike a shooter. Necropolis is flyer-heavy
 *  (Wight/Wraith/Vampire(s)/Bone & Ghost Dragon), so this is core to the
 *  faction's tactics: flyers dive your back-rank casters, and yours dive theirs. */
export function isFlying(stack: Stack): boolean {
  return hasAbility(stack, "flying");
}

/**
 * Compute raw damage an attacker stack deals to a defender stack. One shared
 * per-creature damage roll (HoMM3-style), scaled by count and the A/D curve.
 */
export function computeDamage(
  attacker: Stack,
  defender: Stack,
  attackerHero: Hero,
  defenderHero: Hero,
  rng: Rng,
): number {
  const perCreature = rng.int(attacker.damageMin, attacker.damageMax);
  const base = attacker.count * perCreature;
  const mult = adMultiplier(
    effAttack(attacker, attackerHero),
    effDefense(defender, defenderHero),
  );
  return Math.max(0, Math.floor(base * mult));
}

export interface ApplyResult {
  /** New defender state (count/hpTop), possibly count 0 (dead). */
  defender: Stack;
  /** Creatures killed by this hit (for necromancy + life-drain). */
  killed: number;
  /** Total hp removed (clamped to the pool). */
  dealt: number;
}

/**
 * Kill/chip model. The stack's hp pool is `hpTop + (count-1)*maxHpPer`. Subtract
 * damage, then recompute count and the new top creature's hp. Overkill destroys
 * the stack with no carry.
 */
export function applyDamage(defender: Stack, damage: number): ApplyResult {
  const pool = defender.hpTop + (defender.count - 1) * defender.maxHpPer;
  const remaining = pool - damage;
  if (remaining <= 0) {
    return {
      defender: { ...defender, count: 0, hpTop: 0 },
      killed: defender.count,
      dealt: pool,
    };
  }
  const newCount = Math.ceil(remaining / defender.maxHpPer);
  const newTop = remaining - (newCount - 1) * defender.maxHpPer;
  return {
    defender: { ...defender, count: newCount, hpTop: newTop },
    killed: defender.count - newCount,
    dealt: damage,
  };
}

/** Heal a stack by `amount` hp, resurrecting up to a cap on living creatures. */
export function applyHeal(stack: Stack, amount: number, countCap: number): Stack {
  if (stack.count <= 0) {
    // Resurrect from nothing (e.g. Animate Dead on a wiped undead stack):
    // only if a cap allows it.
    const raisable = Math.min(Math.floor(amount / stack.maxHpPer), countCap);
    if (raisable <= 0) return stack;
    const usedHp = raisable * stack.maxHpPer;
    void usedHp;
    return { ...stack, count: raisable, hpTop: stack.maxHpPer };
  }
  const pool = stack.hpTop + (stack.count - 1) * stack.maxHpPer;
  const maxPool = countCap * stack.maxHpPer;
  const newPool = Math.min(maxPool, pool + amount);
  const newCount = Math.ceil(newPool / stack.maxHpPer);
  const newTop = newPool - (newCount - 1) * stack.maxHpPer;
  return { ...stack, count: newCount, hpTop: newTop };
}

// ===========================================================================
// REACH (two ranks)
// ===========================================================================

const living = (army: Army) => army.stacks.filter((s) => s.count > 0);
const frontLiving = (army: Army) =>
  army.stacks.filter((s) => s.count > 0 && s.rank === "front");

/**
 * Legal targets for an attacker against the opposing army.
 * - Shooters hit ANY living stack (no rank restriction, no retaliation taken).
 * - Flyers hit ANY living stack (ignore the front wall) but are MELEE, so they
 *   still take retaliation. (Flying reach-back is ON — see COMBAT.md §15.)
 * - Ground melee may hit the enemy FRONT only, until the front is empty.
 */
export function legalTargets(attacker: Stack, enemyArmy: Army): Stack[] {
  if (isShooter(attacker) || isFlying(attacker)) return living(enemyArmy);
  const front = frontLiving(enemyArmy);
  if (front.length > 0) return front;
  return living(enemyArmy); // front empty -> melee may reach the back
}

// ===========================================================================
// ATTACK RESOLUTION (attack + retaliation)
// ===========================================================================

export interface ResolvedAttack {
  attacker: Stack;
  defender: Stack;
  log: string[];
  /** Creatures of the defender killed (for the slain ledger). */
  defenderKilled: number;
  /** Damage the main hit dealt to the defender (for UI popups). */
  dealt: number;
  /** The defender's retaliation onto the attacker, if one occurred. */
  retaliation: { dealt: number; killed: number } | null;
}

/**
 * Resolve a melee/ranged attack from `attacker` onto `defender`, including the
 * defender's single retaliation (melee only, once per round, suppressed by
 * "No enemy retaliation" or by the attacker shooting). Life-drain heals the
 * attacker. Returns updated copies of both stacks.
 */
export function resolveAttack(
  attacker: Stack,
  defender: Stack,
  attackerHero: Hero,
  defenderHero: Hero,
  rng: Rng,
): ResolvedAttack {
  const log: string[] = [];
  const shooting = isShooter(attacker);

  // Main hit.
  const dmg = computeDamage(attacker, defender, attackerHero, defenderHero, rng);
  const res = applyDamage(defender, dmg);
  let newDefender = res.defender;
  let newAttacker = attacker;
  log.push(
    `${attacker.name} ${shooting ? "shoots" : "hits"} ${defender.name} for ${res.dealt}` +
      (res.killed > 0 ? ` (${res.killed} slain)` : ""),
  );

  // Life drain: heal the attacker by damage dealt, capped at battle-start count.
  if (hasAbility(attacker, "life drain") && res.dealt > 0) {
    const before = newAttacker.count;
    newAttacker = applyHeal(
      newAttacker,
      Math.floor(res.dealt * LIFE_DRAIN_FRACTION),
      newAttacker.startCount,
    );
    if (newAttacker.count !== before || newAttacker.hpTop !== attacker.hpTop) {
      log.push(`${attacker.name} drains life (now ${newAttacker.count})`);
    }
  }

  // Retaliation: defender strikes back once/round, melee only, if still alive
  // and the attacker didn't shoot and isn't No-retaliation.
  const retaliationSuppressed =
    shooting ||
    hasAbility(attacker, "no enemy retaliation") ||
    defender.hasRetaliated ||
    newDefender.count <= 0;
  let retaliation: { dealt: number; killed: number } | null = null;
  if (!retaliationSuppressed) {
    const back = computeDamage(
      newDefender,
      newAttacker,
      defenderHero,
      attackerHero,
      rng,
    );
    const r = applyDamage(newAttacker, back);
    newAttacker = r.defender;
    newDefender = { ...newDefender, hasRetaliated: true };
    retaliation = { dealt: r.dealt, killed: r.killed };
    log.push(
      `${defender.name} retaliates for ${r.dealt}` +
        (r.killed > 0 ? ` (${r.killed} slain)` : ""),
    );
  }

  return {
    attacker: newAttacker,
    defender: newDefender,
    log,
    defenderKilled: res.killed,
    dealt: res.dealt,
    retaliation,
  };
}

// ===========================================================================
// SPELLS
// ===========================================================================

export function spellMagnitude(effect: SpellEffect, hero: Hero): number {
  // disable/rollmode/reset have no scalar magnitude — they edit roll state /
  // restore base stats rather than apply a sized delta.
  if (effect.kind === "disable" || effect.kind === "rollmode" || effect.kind === "reset")
    return 0;
  return effect.base + effect.powerScale * hero.power;
}

// ===========================================================================
// ENEMY AI — deterministic lookup planner (NOT a search)
// ===========================================================================

/** A "threat" score for picking the highest-value target. */
function threatScore(stack: Stack): number {
  const avgDmg = (stack.damageMin + stack.damageMax) / 2;
  return stack.count * avgDmg + stack.attack;
}

/**
 * Pure planner: choose what an enemy stack intends to do this round. Used to
 * BOTH render the telegraph and execute the action, so the telegraph is honest.
 * Prefer a target it can wipe; else hit the highest-threat legal target.
 */
export function chooseEnemyIntent(
  actor: Stack,
  playerArmy: Army,
  enemyHero: Hero,
  playerHero: Hero,
): Telegraph {
  const targets = legalTargets(actor, playerArmy);
  if (targets.length === 0) return { kind: "defend", label: `${actor.name} defends` };

  // Estimate damage to each target using the *mean* per-creature roll (honest,
  // deterministic forecast — actual roll happens at resolution).
  const meanPer = (actor.damageMin + actor.damageMax) / 2;
  const estBase = actor.count * meanPer;

  let best: Stack | null = null;
  let bestScore = -Infinity;
  let bestForecast = 0;
  for (const t of targets) {
    const mult = adMultiplier(effAttack(actor, enemyHero), effDefense(t, playerHero));
    const forecast = Math.floor(estBase * mult);
    const pool = t.hpTop + (t.count - 1) * t.maxHpPer;
    const wipes = forecast >= pool;
    // Score: prefer a wipe (huge bonus), else maximize threat removed.
    const score = (wipes ? 100000 : 0) + Math.min(forecast, pool) + threatScore(t);
    if (score > bestScore) {
      bestScore = score;
      best = t;
      bestForecast = forecast;
    }
  }

  const target = best!;
  return {
    kind: "attack",
    value: bestForecast,
    targetStackId: target.id,
    label: `${actor.name} attacks ${target.name} for ~${bestForecast}`,
  };
}

// ===========================================================================
// HELPERS for the turn loop (used by run.ts)
// ===========================================================================

export const armyAlive = (army: Army): boolean =>
  army.stacks.some((s) => s.count > 0);

export const livingStacks = (army: Army): Stack[] =>
  army.stacks.filter((s) => s.count > 0);

/** Replace a stack in an army by id. */
export function withStack(army: Army, updated: Stack): Army {
  return {
    ...army,
    stacks: army.stacks.map((s) => (s.id === updated.id ? updated : s)),
  };
}

export function findStack(state: CombatState, id: string): Stack | undefined {
  return (
    state.yourArmy.stacks.find((s) => s.id === id) ??
    state.enemyArmy.stacks.find((s) => s.id === id)
  );
}

export { type CombatSpell };
