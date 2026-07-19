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

/**
 * SPEED → dodge (the ONLY thing speed does now — it no longer decides turn
 * order; see COMBAT.md §23). A defender FASTER than its attacker may "dodge":
 * the whole attack action deals reduced damage. Rolled ONCE per attack action
 * (covers every strike of a double-attacker), off the attack rng, and ONLY when
 * the defender is faster (no rng is drawn otherwise, so equal/slower matchups
 * are bit-for-bit unchanged). Capped low so speed is a real but bounded
 * mitigation, never a hard counter.
 */
export const DODGE_STEP = 0.05; // +5% dodge chance per point of (defender.speed - attacker.speed)
export const DODGE_CHANCE_CAP = 0.25; // capped at 25% (reached at a 5-point speed lead)
export const DODGE_DAMAGE_MULT = 0.5; // a dodged attack deals half damage

/**
 * LUCK → crit (COMBAT.md §24). The attacker's army-wide luck gives a chance for
 * the whole attack action to deal +50%. Rolled ONCE per action (like dodge),
 * off the attack rng, and only when luck > 0 (no rng drawn otherwise).
 */
export const CRIT_STEP = 0.05; // +5% crit chance per point of army luck
export const CRIT_CHANCE_CAP = 0.25; // capped at 25% (reached at luck 5)
export const CRIT_DAMAGE_MULT = 1.5; // a crit deals +50% damage

/**
 * MORALE → action economy (COMBAT.md §24). Per-action chance, `MORALE_STEP` per
 * point of |army morale|, capped at `MORALE_CHANCE_CAP`: positive morale → an
 * immediate extra action, negative morale → a lost action. Consumed by the turn
 * loop in run.ts (not by resolveAttack).
 */
export const MORALE_STEP = 0.05; // +5% morale-event chance per point of |morale|
export const MORALE_CHANCE_CAP = 0.25; // capped at 25% (reached at |morale| 5)

/** Defending adds round(defense * this) to effective defense. */
export const DEFEND_DEFENSE_FRACTION = 0.2;

/** Life-drain: fraction of damage dealt converted back to hp (Vampire Lord). */
export const LIFE_DRAIN_FRACTION = 1.0;

/** Regeneration: top creature heals this fraction of maxHp at round start. */
export const REGEN_FRACTION = 1.0; // full heal of the wounded top creature

// --- ITEM D: creature on-hit ability levers (COMBAT.md §17). All fire off the
//     MAIN hit only (not retaliation), are deterministic via the attack rng, and
//     each debuff applies ONCE per stack via a flag so it can't infinitely
//     re-stack. ---

/** Dread Knight "Death blow": chance the main hit deals DOUBLE damage. */
export const DEATH_BLOW_CHANCE = 0.2;
export const DEATH_BLOW_MULT = 2; // damage multiplier when it triggers

/** Wraith "Drains enemy mana": mana stolen from the hero on an enemy→player hit. */
export const MANA_DRAIN_AMOUNT = 2;

/** Ghost Dragon "Aging": fraction the defender's maxHpPer shrinks to (0.5 = halve). */
export const AGING_FRACTION = 0.5;

/** Zombie "Disease": attack/defense the defender loses (floored at 0). */
export const DISEASE_ATK = 1;
export const DISEASE_DEF = 1;

// --- ITEM F: extra strikes (double attack / double shot) (COMBAT.md §20). ---

/**
 * Generic double-attack/double-shot. A creature whose ability list contains one
 * of these precise phrases deals its MAIN hit `EXTRA_STRIKES + 1` times in one
 * action. Matched by exact (case-insensitive) phrase via `hasAbilityPhrase` —
 * NOT a loose substring — so a creature can't trip it by accident.
 */
export const DOUBLE_ATTACK_PHRASES = ["attacks twice", "strikes twice", "shoots twice"];
/** Extra strikes a double-attacker gets (1 → it hits a total of 2 times). */
export const EXTRA_STRIKES = 1;

// --- ITEM F: extra / unlimited retaliation (COMBAT.md §20 / Item F). ---

/** "Two retaliations" → this many counters per round. */
export const TWO_RETALIATIONS = 2;
/** Default retaliation budget for any stack (HoMM3: once per round). */
export const DEFAULT_RETALIATIONS = 1;

// --- ITEM G: Jousting (Cavalier/Champion) (COMBAT.md §21). ---

/**
 * Jousting is a positional charge bonus in HoMM3 (+dmg per hex traveled). With
 * NO positions/movement in this engine we reskin it as a FLAT damage premium on
 * the attacker's main hit when it has the "Jousting" ability. Simplification
 * noted in COMBAT.md §21.
 */
export const JOUSTING_BONUS = 0.25; // +25% main-hit damage

// --- ITEM G: Behemoth / Ancient Behemoth "Reduces enemy defense" (COMBAT.md §21). ---

/** Defense the Behemoth strips from the defender on-hit (once per defender). */
export const DEFENSE_SHRED = 4;
/** Ancient Behemoth strips more. */
export const DEFENSE_SHRED_ANCIENT = 8;

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

/**
 * Dodge chance for a defender being attacked: `DODGE_STEP` per point the
 * defender's speed exceeds the attacker's, capped at `DODGE_CHANCE_CAP`. Zero
 * when the defender is equal or slower (so no rng is drawn for it). Speed here
 * is the live `stack.speed`, so Haste/Slow/Prayer/Necklace all feed it.
 */
export function dodgeChance(defender: Stack, attacker: Stack): number {
  const lead = defender.speed - attacker.speed;
  if (lead <= 0) return 0;
  return Math.min(lead * DODGE_STEP, DODGE_CHANCE_CAP);
}

/** Crit chance from the attacking army's luck (0 at luck ≤ 0). */
export function critChance(luck: number): number {
  if (luck <= 0) return 0;
  return Math.min(luck * CRIT_STEP, CRIT_CHANCE_CAP);
}

/** Morale-event chance from |army morale| (0 at morale 0). The SIGN of morale
 *  (extra vs lost action) is decided by the caller; this is just the magnitude. */
export function moraleChance(morale: number): number {
  return Math.min(Math.abs(morale) * MORALE_STEP, MORALE_CHANCE_CAP);
}

// ===========================================================================
// DAMAGE & APPLICATION
// ===========================================================================

const lc = (s: string) => s.toLowerCase();
export function hasAbility(stack: Stack, name: string): boolean {
  const n = lc(name);
  return stack.abilities.some((a) => lc(a).includes(n));
}

/**
 * Precise (whole-string, case-insensitive) ability match. Unlike `hasAbility`
 * (a substring match), this requires an ability entry to EQUAL the phrase. Used
 * for the new ability checks so the §1/§4 "substring landmine" can't misfire —
 * e.g. a Royal Griffin tagged "Unlimited retaliation" must NOT be read as having
 * "no enemy retaliation", and double-attack detection can't trip on a partial.
 */
export function hasAbilityPhrase(stack: Stack, phrase: string): boolean {
  const p = lc(phrase);
  return stack.abilities.some((a) => lc(a) === p);
}

/** Extra MAIN-hit strikes this attacker gets (0 = a single normal hit). */
export function extraStrikes(stack: Stack): number {
  return DOUBLE_ATTACK_PHRASES.some((ph) => hasAbilityPhrase(stack, ph))
    ? EXTRA_STRIKES
    : 0;
}

/**
 * How many times this stack may retaliate per round. "Unlimited retaliation" →
 * ∞; "Two retaliations" → 2; everything else → 1. Precise-phrase matched so
 * "unlimited"/"two retaliations" can't be mistaken for "no enemy retaliation".
 */
export function retaliationBudget(stack: Stack): number {
  if (hasAbilityPhrase(stack, "unlimited retaliation")) return Infinity;
  if (hasAbilityPhrase(stack, "two retaliations")) return TWO_RETALIATIONS;
  return DEFAULT_RETALIATIONS;
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
// ITEM D — on-hit creature ability effects (once per defender via a flag)
// ===========================================================================

/**
 * Ghost Dragon "Aging" (D.3): once per defender, halve `maxHpPer` (floored at 1)
 * and re-clamp the pool to the shrunk ceiling. The pool can't exceed
 * `count*maxHpPer`, so creatures over the new ceiling die (the HoMM3 effect).
 */
export function applyAging(defender: Stack): { defender: Stack; log: string | null } {
  if (defender.aged || defender.count <= 0) return { defender, log: null };
  const newMax = Math.max(1, Math.floor(defender.maxHpPer * AGING_FRACTION));
  // Re-clamp: current pool capped at the new ceiling; hpTop can't exceed newMax.
  const oldPool = defender.hpTop + (defender.count - 1) * defender.maxHpPer;
  const newCap = defender.count * newMax;
  const pool = Math.min(oldPool, newCap);
  const newCount = Math.max(0, Math.ceil(pool / newMax));
  const newTop = newCount > 0 ? pool - (newCount - 1) * newMax : 0;
  return {
    defender: { ...defender, aged: true, maxHpPer: newMax, count: newCount, hpTop: Math.min(newTop, newMax) },
    log: `${defender.name} ages (max hp halved)`,
  };
}

/**
 * Zombie "Disease" (D.4): once per defender, `-DISEASE_ATK` attack and
 * `-DISEASE_DEF` defense (each floored at 0).
 */
export function applyDisease(defender: Stack): { defender: Stack; log: string | null } {
  if (defender.diseased || defender.count <= 0) return { defender, log: null };
  return {
    defender: {
      ...defender,
      diseased: true,
      attack: Math.max(0, defender.attack - DISEASE_ATK),
      defense: Math.max(0, defender.defense - DISEASE_DEF),
    },
    log: `${defender.name} is diseased`,
  };
}

/**
 * Black/Dread Knight "Curse" on-hit (D.5, distinct from the Curse SPELL): once
 * per defender, set to min-roll (`damageMax = damageMin`), like the Curse spell.
 */
export function applyCurseOnHit(defender: Stack): { defender: Stack; log: string | null } {
  if (defender.cursed || defender.count <= 0) return { defender, log: null };
  return {
    defender: { ...defender, cursed: true, damageMax: defender.damageMin },
    log: `${defender.name} is cursed (min damage)`,
  };
}

/**
 * Behemoth / Ancient Behemoth "Reduces enemy defense" (Item G): once per
 * defender, subtract `amount` defense (floored at 0). Lower defense feeds the
 * A/D multiplier — every subsequent attacker hits the defender harder. Ancient
 * Behemoth passes the larger `DEFENSE_SHRED_ANCIENT`.
 */
export function applyDefenseShred(
  defender: Stack,
  amount: number,
): { defender: Stack; log: string | null } {
  if (defender.defenseShred || defender.count <= 0) return { defender, log: null };
  return {
    defender: {
      ...defender,
      defenseShred: true,
      defense: Math.max(0, defender.defense - amount),
    },
    log: `${defender.name}'s defense is reduced (-${amount})`,
  };
}

/**
 * Defense-shred magnitude for an attacker with "Reduces enemy defense". Both
 * Behemoth and Ancient Behemoth carry the same ability string, so the Ancient
 * (larger shred) is distinguished by its stable id/name containing "ancient".
 */
export function defenseShredAmount(attacker: Stack): number {
  const isAncient =
    lc(attacker.sourceId).includes("ancient") || lc(attacker.name).includes("ancient");
  return isAncient ? DEFENSE_SHRED_ANCIENT : DEFENSE_SHRED;
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
  /**
   * ITEM D.2 (Wraith "Drains enemy mana"): mana the attacker drained on the main
   * hit. The caller (run.ts enemy-attack path) subtracts it from the player hero;
   * enemies have no mana so a player→enemy drain is inert. 0 when no drain.
   */
  manaDrain: number;
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
  attackerLuck = 0,
): ResolvedAttack {
  const log: string[] = [];
  const shooting = isShooter(attacker);
  const hasJousting = hasAbilityPhrase(attacker, "jousting");

  // Main hit, applied `1 + extraStrikes` times (ITEM F: double attack / double
  // shot — Marksman/Crusader/Wolf Raider). Each strike rolls its own damage off
  // the SAME attack rng (deterministic), applies the jousting premium and the
  // death-blow chance, and chips the defender; we stop early once it dies.
  let newDefender = defender;
  let newAttacker = attacker;
  const strikes = 1 + extraStrikes(attacker);
  let totalDealt = 0;
  let totalKilled = 0;
  // LUCK → crit and SPEED → dodge: one roll each for the whole attack action
  // (all strikes), each drawn only when it can matter (luck > 0 / defender
  // faster). A crit adds +50%; a dodge halves. Both can land (×1.5 then ×0.5).
  const critRoll = critChance(attackerLuck);
  const crited = critRoll > 0 && rng.next() < critRoll;
  if (crited) log.push(`${attacker.name} strikes with luck (+50%)`);
  const mainDodgeChance = dodgeChance(defender, attacker);
  const mainDodged = mainDodgeChance > 0 && rng.next() < mainDodgeChance;
  if (mainDodged) log.push(`${defender.name} dodges (half damage)`);
  for (let i = 0; i < strikes; i++) {
    if (newDefender.count <= 0) break;
    // ITEM D.1: Dread Knight "Death blow" — roll the death-blow chance off the
    // SAME attack rng (deterministic) BEFORE applying, and double on a hit.
    let dmg = computeDamage(newAttacker, newDefender, attackerHero, defenderHero, rng);
    if (hasJousting) dmg = Math.floor(dmg * (1 + JOUSTING_BONUS)); // ITEM G: jousting premium
    if (hasAbility(attacker, "death blow") && rng.next() < DEATH_BLOW_CHANCE) {
      dmg *= DEATH_BLOW_MULT;
      log.push("Death blow!");
    }
    if (crited) dmg = Math.floor(dmg * CRIT_DAMAGE_MULT);
    if (mainDodged) dmg = Math.floor(dmg * DODGE_DAMAGE_MULT);
    const hit = applyDamage(newDefender, dmg);
    newDefender = hit.defender;
    totalDealt += hit.dealt;
    totalKilled += hit.killed;
    log.push(
      `${attacker.name} ${shooting ? "shoots" : "hits"} ${defender.name} for ${hit.dealt}` +
        (hit.killed > 0 ? ` (${hit.killed} slain)` : ""),
    );
  }
  // `res` keeps the aggregate so the rest of the function (life-drain, ledger,
  // events) reads totals across all strikes.
  const res = { dealt: totalDealt, killed: totalKilled };

  // ITEM D.3/4/5: on-hit debuffs — applied to the SURVIVING defender, once per
  // stack via a flag so they can't infinitely re-stack. Off the MAIN hit only.
  let manaDrain = 0;
  if (newDefender.count > 0) {
    if (hasAbility(attacker, "aging")) {
      const r = applyAging(newDefender);
      newDefender = r.defender;
      if (r.log) log.push(r.log);
    }
    if (hasAbility(attacker, "disease")) {
      const r = applyDisease(newDefender);
      newDefender = r.defender;
      if (r.log) log.push(r.log);
    }
    // "Curse" on-hit (Black/Dread Knight). hasAbility is a substring match, so a
    // stack whose ability list contains "Curse" qualifies.
    if (hasAbility(attacker, "curse")) {
      const r = applyCurseOnHit(newDefender);
      newDefender = r.defender;
      if (r.log) log.push(r.log);
    }
    // ITEM G: Behemoth / Ancient Behemoth "Reduces enemy defense". Precise-phrase
    // matched so only the exact ability fires; Ancient shreds more.
    if (hasAbilityPhrase(attacker, "reduces enemy defense")) {
      const r = applyDefenseShred(newDefender, defenseShredAmount(attacker));
      newDefender = r.defender;
      if (r.log) log.push(r.log);
    }
  }
  // ITEM D.2: Wraith "Drains enemy mana" — fires when an enemy stack with this
  // ability hits a PLAYER stack. Only enemy→player matters (enemies use
  // NULL_HERO with no mana). The caller subtracts `manaDrain` from the hero.
  if (
    hasAbility(attacker, "drains enemy mana") &&
    attacker.side === "enemy" &&
    defender.side === "player"
  ) {
    manaDrain = MANA_DRAIN_AMOUNT;
    log.push(`${attacker.name} drains ${manaDrain} mana`);
  }

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

  // Retaliation: a melee defender strikes back ONCE per attacking action if it
  // still has retaliations left this round. ITEM F: most stacks have a budget of
  // 1 (HoMM3); Royal Griffin "Unlimited retaliation" = ∞, Griffin "Two
  // retaliations" = 2 — so they can counter MULTIPLE different attackers in a
  // round. Even vs a double-attacker the defender retaliates at most once per
  // action (HoMM3 rule), which falls out naturally since we resolve one counter
  // per `resolveAttack`. Suppressed by shooting or "No enemy retaliation"
  // (precise phrase — "unlimited/two retaliations" do NOT match it).
  // `retaliationsUsed` is authoritative when present; fall back to the legacy
  // `hasRetaliated` boolean (1 if set) so callers that only flip the boolean
  // still get the once-per-round behavior.
  const used = defender.retaliationsUsed ?? (defender.hasRetaliated ? 1 : 0);
  const budget = retaliationBudget(defender);
  const retaliationSuppressed =
    shooting ||
    hasAbilityPhrase(attacker, "no enemy retaliation") ||
    used >= budget ||
    newDefender.count <= 0;
  let retaliation: { dealt: number; killed: number } | null = null;
  if (!retaliationSuppressed) {
    let back = computeDamage(
      newDefender,
      newAttacker,
      defenderHero,
      attackerHero,
      rng,
    );
    // SPEED → dodge on the counter: the original attacker (now the defender of
    // the retaliation) dodges if it is the faster stack. Same conditional draw.
    const retalDodgeChance = dodgeChance(newAttacker, newDefender);
    if (retalDodgeChance > 0 && rng.next() < retalDodgeChance) {
      back = Math.floor(back * DODGE_DAMAGE_MULT);
      log.push(`${newAttacker.name} dodges the retaliation (half damage)`);
    }
    const r = applyDamage(newAttacker, back);
    newAttacker = r.defender;
    newDefender = {
      ...newDefender,
      hasRetaliated: true,
      retaliationsUsed: used + 1,
    };
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
    manaDrain,
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
