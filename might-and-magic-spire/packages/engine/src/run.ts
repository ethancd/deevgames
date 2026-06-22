// Run orchestration — the top-level state machine the frontend drives.
//
// All operations are PURE: they return a new RunState and never mutate inputs.
// The army is the player's life: an empty army (every stack dead) loses the run;
// beating the act boss wins it.

import { makeRng, type Rng } from "./rng";
import type {
  Army,
  ArtifactSlot,
  CombatSpell,
  CombatState,
  Hero,
  MapNode,
  PrimaryStat,
  RewardChoice,
  RunState,
  Stack,
} from "./types";
import { generateMap, startNodeIds } from "./map";
import {
  ALL_CREATURES,
  ARTIFACTS,
  BASE_CREATURES,
  CREATURES,
  DEFAULT_HERO,
  SPELLS,
  artifactById,
  creatureById,
  spellById,
  upgradeFormOf,
} from "./content";
import {
  adaptEquipment,
  adaptSpell,
  adaptStack,
  deriveHero,
  MANA_PER_KNOWLEDGE,
} from "./adapter";
import {
  armyAlive,
  chooseEnemyIntent,
  legalTargets as battleLegalTargets,
  livingStacks,
  resolveAttack,
  spellMagnitude,
  applyDamage,
  applyHeal,
  hasAbility,
  withStack,
  adMultiplier,
  effAttack,
  effDefense,
} from "./battle";
import type { ResolvedAttack } from "./battle";
import type { CombatEvent, DamageForecast, Side } from "./types";

/** Build damage-popup events for a resolved attack (+ its retaliation). */
function attackEvents(
  side: Side,
  attacker: Stack,
  target: Stack,
  res: ResolvedAttack,
): CombatEvent[] {
  const evts: CombatEvent[] = [
    {
      kind: "attack",
      side,
      attackerId: attacker.id,
      attackerName: attacker.name,
      targetId: target.id,
      targetName: target.name,
      damage: res.dealt,
      killed: res.defenderKilled,
    },
  ];
  if (res.retaliation) {
    evts.push({
      kind: "retaliate",
      side: side === "player" ? "enemy" : "player",
      attackerId: target.id,
      attackerName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      damage: res.retaliation.dealt,
      killed: res.retaliation.killed,
    });
  }
  return evts;
}

// ===========================================================================
// LEVERS (see COMBAT.md)
// ===========================================================================

export const STARTING_GOLD = 200;
export const ARMY_CAP = 7;

/**
 * Necromancy raise % by Necromancy skill rank (index by rank; 0 = no skill).
 * This is the central GROWTH lever (plan lever #3): too low and the army ball
 * deflates under attrition (unrecoverable), too high and you snowball skeletons.
 * Tuned via the full-run sim so a Necromancy-1 hero net-recovers from a typical
 * fight. (See COMBAT.md / run.test.ts sweep.)
 */
export const NECRO_BASE_PCT = [0, 0.3, 0.4, 0.5, 0.6];
export const NECRO_CAP = 0.75;
export const SKELETON_ID = "necropolis_skeleton";

/** Rest node: mana regen + light army heal. */
export const REST_MANA_FRACTION = 1.0; // full mana refill
export const REST_HEAL_PER_STACK = 0.25; // heal 25% of each stack's missing pool

/** Per-turn mana regen at the start of each player turn. */
export const TURN_MANA_REGEN = 1;

/** Economy (gold). */
export const RECRUIT_COST_PER_TIER = 30;
export const UPGRADE_COST_PER_TIER = 50;
export const SHRINE_COST_PER_LEVEL = 40;
export const ARTIFACT_COST: Record<string, number> = {
  Treasure: 60,
  Minor: 100,
  Major: 180,
  Relic: 300,
};

/**
 * Encounter scaling. Enemies are built from a POWER BUDGET that tracks the
 * player's current army value (the snowball) so attrition stays survivable but
 * real. Budget = playerArmyValue * MULT, where MULT rises with map depth and
 * node type. armyValue(stack) = count * (hp + avgDamage*2) — a rough "how scary".
 *
 * These multipliers are the central difficulty levers (see COMBAT.md). Combat
 * fights are designed to be *winnable with attrition*; elites/bosses bite.
 */
export const ENCOUNTER = {
  /** combat fight budget vs player army value, by depth fraction (0..1). */
  combatMult: [0.22, 0.42] as [number, number], // start .22x -> .42x near boss
  eliteMult: [0.45, 0.65] as [number, number],
  bossMult: 0.7,
  /** Max Bone Dragons in the boss fight (the rest of the budget is Lich guard). */
  bossMaxDragons: 2,
  /** Max enemy stacks. */
  maxStacks: 4,
};

/** Rough "scariness" value of a stack for budget math. */
export function armyValue(s: { count: number; maxHpPer: number; damageMin: number; damageMax: number }): number {
  const avgDmg = (s.damageMin + s.damageMax) / 2;
  return s.count * (s.maxHpPer + avgDmg * 2);
}

// ===========================================================================
// HERO STAT DERIVATION (equipment-aware)
// ===========================================================================

/** Recompute a hero's primaries + maxMana from base + equipped artifacts. */
export function recomputeHero(hero: Hero): Hero {
  const deltas: Record<PrimaryStat, number> = {
    attack: 0,
    defense: 0,
    power: 0,
    knowledge: 0,
  };
  let manaMaxBonus = 0;
  for (const eq of Object.values(hero.equipment)) {
    if (!eq) continue;
    for (const k of Object.keys(eq.primaryDeltas) as PrimaryStat[]) {
      deltas[k] += eq.primaryDeltas[k] ?? 0;
    }
    for (const e of eq.effects) {
      if (e.kind === "manaMax") manaMaxBonus += e.amount;
    }
  }
  // Tolerate stale saves predating the base* fields: fall back to the live
  // primary, and BACKFILL the base fields on the returned hero so it self-heals.
  const baseAttack = hero.baseAttack ?? hero.attack;
  const baseDefense = hero.baseDefense ?? hero.defense;
  const basePower = hero.basePower ?? hero.power;
  const baseKnowledge = hero.baseKnowledge ?? hero.knowledge;
  const knowledge = baseKnowledge + deltas.knowledge;
  const maxMana = knowledge * MANA_PER_KNOWLEDGE + manaMaxBonus;
  const next: Hero = {
    ...hero,
    baseAttack,
    baseDefense,
    basePower,
    baseKnowledge,
    baseSpellbook: hero.baseSpellbook ?? hero.spellbook ?? [],
    attack: baseAttack + deltas.attack,
    defense: baseDefense + deltas.defense,
    power: basePower + deltas.power,
    knowledge,
    maxMana,
    mana: Math.min(hero.mana, maxMana),
    // Rebuild the effective spellbook: the LEARNED base set plus any spells
    // granted by equipped artifacts, deduped by id (COMBAT.md §19). Granted ids
    // that don't resolve in the corpus are skipped. Equipping a `grantSpell`
    // Relic (e.g. Armageddon's Blade) makes its spell castable; unequipping
    // removes it UNLESS it was also learned (still in baseSpellbook).
    spellbook: effectiveSpellbook(hero),
  };
  return next;
}

/**
 * The effective spellbook = `baseSpellbook` (learned) ∪ artifact-granted spells,
 * deduped by spell id (the learned form wins ties). Granted ids are resolved via
 * `spellById` over the raw corpus and adapted; unresolved ids (e.g.
 * `spell_misfortune`, which has no data record) are skipped. (COMBAT.md §19.)
 */
function effectiveSpellbook(hero: Hero): CombatSpell[] {
  // Tolerate stale saves from before `baseSpellbook` existed: fall back to the
  // current spellbook (the learned set), else empty. Prevents a crash on equip
  // when an old localStorage run is restored.
  const out: CombatSpell[] = (hero.baseSpellbook ?? hero.spellbook ?? []).slice();
  const seen = new Set(out.map((s) => s.id));
  for (const eq of Object.values(hero.equipment)) {
    if (!eq) continue;
    for (const e of eq.effects) {
      if (e.kind !== "grantSpell") continue;
      for (const id of e.spellIds) {
        const src = spellById(id);
        if (!src) continue; // unresolved (e.g. spell_misfortune) — skip gracefully
        const adapted = adaptSpell(src);
        if (seen.has(adapted.id)) continue; // already known (learned or another Relic)
        seen.add(adapted.id);
        out.push(adapted);
      }
    }
  }
  return out;
}

/** Total necromancy bonus from equipped artifacts (e.g. Cloak of the Undead King). */
function equipmentNecroBonus(hero: Hero): number {
  let bonus = 0;
  for (const eq of Object.values(hero.equipment)) {
    if (!eq) continue;
    for (const e of eq.effects) if (e.kind === "necromancyBonus") bonus += e.amount;
  }
  return bonus;
}

/**
 * LIGHT §3.1: sum the hero's equipped COMBAT effects that the army carries into
 * battle. `hpPerCreature` (Ring of Vitality) and `speedAll` (Necklace of
 * Swiftness) were parsed but never applied; we apply them to every player stack
 * at battle open. `manaMax`/`necromancyBonus` are hero-level (handled elsewhere).
 */
function equipmentCombatBonuses(hero: Hero): { hpPerCreature: number; speedAll: number } {
  let hpPerCreature = 0;
  let speedAll = 0;
  for (const eq of Object.values(hero.equipment)) {
    if (!eq) continue;
    for (const e of eq.effects) {
      if (e.kind === "hpPerCreature") hpPerCreature += e.amount;
      else if (e.kind === "speedAll") speedAll += e.amount;
    }
  }
  return { hpPerCreature, speedAll };
}

// ===========================================================================
// START
// ===========================================================================

export function startRun(seed: string): RunState {
  const rng = makeRng(seed);
  const { hero, startingArmy } = deriveHero(DEFAULT_HERO, {
    creatures: CREATURES,
    spells: SPELLS,
  });
  const map = generateMap(rng, /*act*/ 1);

  return {
    seed,
    hero,
    army: startingArmy,
    gold: STARTING_GOLD,
    map,
    currentNodeId: null,
    act: 1,
    combat: null,
    outcome: "ongoing",
    clearedNodeIds: [],
    pendingRewards: null,
  };
}

// ===========================================================================
// NODE NAVIGATION
// ===========================================================================

export function legalNextNodes(run: RunState): string[] {
  if (run.currentNodeId === null) return startNodeIds(run.map);
  const cur = run.map.find((n) => n.id === run.currentNodeId);
  return cur ? cur.next.slice() : [];
}

export function chooseNode(run: RunState, nodeId: string): RunState {
  if (run.outcome !== "ongoing") return run;
  if (run.combat && run.combat.outcome === "ongoing")
    throw new Error("chooseNode: resolve the current combat first");
  if (run.pendingRewards) throw new Error("chooseNode: pick a reward first");

  const legal = legalNextNodes(run);
  if (!legal.includes(nodeId))
    throw new Error(`chooseNode: ${nodeId} is not reachable`);

  const node = run.map.find((n) => n.id === nodeId)!;
  const rng = makeRng(run.seed).fork(`node:${nodeId}`);

  const next: RunState = {
    ...run,
    currentNodeId: nodeId,
    clearedNodeIds: run.clearedNodeIds.slice(),
    lastEvents: undefined, // entering a node clears stale combat popups
  };

  switch (node.type) {
    case "combat":
    case "elite":
    case "boss":
      next.combat = openCombat(next, node, rng);
      break;
    case "rest":
      applyRest(next);
      next.clearedNodeIds.push(nodeId);
      break;
    case "dwelling":
      next.pendingRewards = rollDwelling(rng);
      break;
    case "altar":
      next.pendingRewards = rollAltar(next, rng);
      break;
    case "shrine":
      next.pendingRewards = rollShrine(next, rng);
      break;
    case "merchant":
      next.pendingRewards = rollMerchant(rng);
      break;
  }
  return next;
}

function applyRest(run: RunState): void {
  run.hero = { ...run.hero, mana: run.hero.maxMana };
  run.army = run.army.map((s) => {
    if (s.count <= 0) return s;
    const pool = s.hpTop + (s.count - 1) * s.maxHpPer;
    const maxPool = s.count * s.maxHpPer;
    const missing = maxPool - pool;
    const heal = Math.floor(missing * REST_HEAL_PER_STACK);
    return applyHeal(s, heal, s.count);
  });
}

// ===========================================================================
// COMBAT — open / encounter generation
// ===========================================================================

function openCombat(run: RunState, node: MapNode, rng: Rng): CombatState {
  const bossRow = Math.max(...run.map.map((n) => n.row));
  const depth = bossRow > 0 ? node.row / bossRow : 0;
  const playerValue = run.army.reduce((sum, s) => sum + armyValue(s), 0);
  const enemyArmy = rollEncounter(node, depth, playerValue, rng.fork("encounter"));
  // LIGHT §3.1: sum equipped combat effects once, apply to every player stack.
  const { hpPerCreature, speedAll } = equipmentCombatBonuses(run.hero);
  // Fresh copies of the player's army for battle (carried back on win).
  const yourStacks = run.army.map((s) => {
    const maxHpPer = s.maxHpPer + hpPerCreature;
    return {
      ...s,
      maxHpPer,
      // hpTop tracks the (full) top creature; bump it by the same amount so the
      // pool grows by hpPerCreature on every living creature.
      hpTop: s.hpTop + hpPerCreature,
      speed: s.speed + speedAll,
      hasActed: false,
      isDefending: false,
      hasRetaliated: false,
      startCount: s.count,
    };
  });
  const state: CombatState = {
    round: 1,
    whoseTurn: "player",
    yourArmy: { stacks: yourStacks, side: "player" },
    enemyArmy,
    spellCastThisTurn: false,
    log: [`Battle begins (${node.type}).`],
    outcome: "ongoing",
    actedStackIds: [],
    slainEnemies: {},
  };
  // Relic plumbing (COMBAT.md §19): script-cast each equipped `castOnStart` spell
  // onto every enemy stack now that the enemy army is built (e.g. Armor of the
  // Damned opens with Slow + Curse + Weakness). Deterministic: pure stat edits.
  applyCastOnStart(state, run.hero);
  // Telegraph the enemy's opening intents (after the opening casts land).
  refreshTelegraphs(state, run.hero);
  return state;
}

/**
 * Relic plumbing (COMBAT.md §19): for every equipped artifact `castOnStart` spell
 * id, resolve it via the corpus (`spellById` → `adaptSpell`; unresolved ids like
 * `spell_misfortune` are skipped) and apply its effect to EVERY living enemy
 * stack at combat open, reusing the same per-stack core as a normal cast. Mutates
 * `state.enemyArmy` and appends a log line per cast. The wielder's `power` scales
 * the magnitude. No RNG — fully deterministic.
 */
function applyCastOnStart(state: CombatState, hero: Hero): void {
  for (const eq of Object.values(hero.equipment)) {
    if (!eq) continue;
    for (const e of eq.effects) {
      if (e.kind !== "castOnStart") continue;
      for (const id of e.spellIds) {
        const src = spellById(id);
        if (!src) continue; // unresolved (e.g. spell_misfortune) — skip gracefully
        const spell = adaptSpell(src);
        for (const target of livingStacks(state.enemyArmy)) {
          const r = applySpellEffectToStack(spell, hero, target);
          state.enemyArmy = withStack(state.enemyArmy, r.stack);
          state.log.push(r.log);
        }
      }
    }
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Build an enemy army to roughly `budget` total armyValue, drawn from a tier
 * band that widens with depth. Greedily fills up to maxStacks, dividing the
 * budget across stacks. Always returns at least one non-empty stack.
 */
function rollEncounter(
  node: MapNode,
  depth: number,
  playerValue: number,
  rng: Rng,
): Army {
  // Minimum floor so an empty/whittled player army still faces a token foe.
  const baseValue = Math.max(playerValue, 300);

  let mult: number;
  let tierMin: number;
  let tierMax: number;
  if (node.type === "boss") {
    mult = ENCOUNTER.bossMult;
    tierMin = 1;
    tierMax = 7;
  } else if (node.type === "elite") {
    mult = lerp(ENCOUNTER.eliteMult[0], ENCOUNTER.eliteMult[1], depth);
    tierMin = Math.max(2, Math.floor(lerp(2, 4, depth)));
    tierMax = Math.min(7, Math.ceil(lerp(4, 6, depth)));
  } else {
    mult = lerp(ENCOUNTER.combatMult[0], ENCOUNTER.combatMult[1], depth);
    tierMin = 1;
    tierMax = Math.min(7, Math.max(2, Math.ceil(lerp(2, 5, depth))));
  }

  const budget = baseValue * mult;
  const pool = BASE_CREATURES.filter((c) => c.tier >= tierMin && c.tier <= tierMax);
  const stacks: Stack[] = [];

  if (node.type === "boss") {
    // The boss is a Bone Dragon stack + a Lich guard. The dragon count is held
    // LOW (1..ENCOUNTER.bossMaxDragons): a few hp-150 dragons one-rounding the
    // front is the trap; the fight should reward a high-tier army + spells, not
    // be an unkillable wall. Excess budget goes to the Lich guard.
    const boss = creatureById("necropolis_bone_dragon")!;
    const bossPer = armyValue({ count: 1, maxHpPer: boss.hp, damageMin: boss.damageMin, damageMax: boss.damageMax });
    const bossCount = Math.max(
      1,
      Math.min(ENCOUNTER.bossMaxDragons, Math.round((budget * 0.5) / bossPer)),
    );
    stacks.push(adaptStack(boss, bossCount, { side: "enemy", idSuffix: "_boss" }));
    const lich = creatureById("necropolis_lich")!;
    const lichPer = armyValue({ count: 1, maxHpPer: lich.hp, damageMin: lich.damageMin, damageMax: lich.damageMax });
    const usedByDragons = bossCount * bossPer;
    const lichCount = Math.max(2, Math.round(Math.max(0, budget - usedByDragons) / lichPer));
    stacks.push(adaptStack(lich, lichCount, { side: "enemy", idSuffix: "_bossguard" }));
    return { stacks, side: "enemy" };
  }

  const nStacks = Math.max(1, Math.min(ENCOUNTER.maxStacks, rng.int(1, ENCOUNTER.maxStacks)));
  const perStackBudget = budget / nStacks;
  for (let i = 0; i < nStacks; i++) {
    const c = rng.pick(pool);
    const per = armyValue({ count: 1, maxHpPer: c.hp, damageMin: c.damageMin, damageMax: c.damageMax });
    const count = Math.max(1, Math.round(perStackBudget / per));
    stacks.push(adaptStack(c, count, { side: "enemy", idSuffix: `_n${i}` }));
  }
  return { stacks, side: "enemy" };
}

// The enemy has no hero of its own; it fights with a null commander (zeros).
const NULL_HERO: Hero = {
  id: "enemy", name: "Enemy", heroClass: "", specialty: "",
  attack: 0, defense: 0, power: 0, knowledge: 0, mana: 0, maxMana: 0,
  equipment: {}, spellbook: [], skills: {}, imageRef: "",
  baseAttack: 0, baseDefense: 0, basePower: 0, baseKnowledge: 0, baseSpellbook: [],
};

// ===========================================================================
// COMBAT — telegraphs (honest: the same planner drives shown + executed)
// ===========================================================================

function refreshTelegraphs(state: CombatState, playerHero: Hero): void {
  for (const s of state.enemyArmy.stacks) {
    if (s.count <= 0) {
      s.telegraph = undefined;
      continue;
    }
    s.telegraph = chooseEnemyIntent(s, state.yourArmy, NULL_HERO, playerHero);
  }
}

// ===========================================================================
// COMBAT — player turn
// ===========================================================================

/** Reset per-turn flags and apply regen at the start of the player's turn. */
function startPlayerTurn(run: RunState): RunState {
  const combat = run.combat!;
  const hero = {
    ...run.hero,
    mana: Math.min(run.hero.maxMana, run.hero.mana + TURN_MANA_REGEN),
  };
  // Regeneration ability heals the top creature of each player stack.
  const yourStacks = combat.yourArmy.stacks.map((s) => {
    let ns = { ...s, hasActed: false, isDefending: false };
    if (hasAbility(s, "regeneration") && s.count > 0 && s.hpTop < s.maxHpPer) {
      ns = { ...ns, hpTop: s.maxHpPer };
    }
    return ns;
  });
  const next: RunState = {
    ...run,
    hero,
    combat: {
      ...combat,
      whoseTurn: "player",
      spellCastThisTurn: false,
      actedStackIds: [],
      yourArmy: { ...combat.yourArmy, stacks: yourStacks },
    },
  };
  refreshTelegraphs(next.combat!, hero);
  return next;
}

export function legalCommandTargets(run: RunState, stackId: string): string[] {
  const combat = run.combat;
  if (!combat || combat.outcome !== "ongoing") return [];
  const actor = combat.yourArmy.stacks.find((s) => s.id === stackId);
  if (!actor || actor.count <= 0) return [];
  return battleLegalTargets(actor, combat.enemyArmy).map((s) => s.id);
}

/**
 * Predict the damage one of your stacks would deal to an enemy stack, as a
 * range (the per-creature damage roll spans [damageMin, damageMax]) plus the
 * creatures it would slay at each end. Mirrors `computeDamage` exactly — same
 * A/D curve, same hero bonuses (player hero attacks into a null enemy hero) —
 * so the forecast can't drift from resolution. Returns null if the pairing
 * isn't a live, legal attack.
 */
export function forecastAttack(
  run: RunState,
  attackerStackId: string,
  targetStackId: string,
): DamageForecast | null {
  const combat = run.combat;
  if (!combat || combat.outcome !== "ongoing") return null;
  const attacker = combat.yourArmy.stacks.find((s) => s.id === attackerStackId);
  const target = combat.enemyArmy.stacks.find((s) => s.id === targetStackId);
  if (!attacker || !target || attacker.count <= 0 || target.count <= 0) return null;

  const mult = adMultiplier(effAttack(attacker, run.hero), effDefense(target, NULL_HERO));
  const damageMin = Math.max(0, Math.floor(attacker.count * attacker.damageMin * mult));
  const damageMax = Math.max(0, Math.floor(attacker.count * attacker.damageMax * mult));
  return {
    damageMin,
    damageMax,
    killsMin: applyDamage(target, damageMin).killed,
    killsMax: applyDamage(target, damageMax).killed,
  };
}

export function commandStack(
  run: RunState,
  stackId: string,
  action: "attack" | "defend",
  targetId?: string,
): RunState {
  const combat = run.combat;
  if (!combat) throw new Error("commandStack: no active combat");
  if (combat.outcome !== "ongoing") throw new Error("commandStack: combat is over");
  if (combat.whoseTurn !== "player") throw new Error("commandStack: not your turn");

  const actor = combat.yourArmy.stacks.find((s) => s.id === stackId);
  if (!actor) throw new Error(`commandStack: no such stack ${stackId}`);
  if (actor.count <= 0) throw new Error("commandStack: stack is dead");
  if (combat.actedStackIds.includes(stackId))
    throw new Error("commandStack: stack already acted this turn");

  const rng = combatRng(run).fork(`cmd:${combat.round}:${stackId}`);
  let yourArmy = combat.yourArmy;
  let enemyArmy = combat.enemyArmy;
  const log = combat.log.slice();
  const slain = { ...combat.slainEnemies };
  let events: CombatEvent[] = [];

  if (action === "defend") {
    yourArmy = withStack(yourArmy, { ...actor, isDefending: true });
    log.push(`${actor.name} defends.`);
  } else {
    if (!targetId) throw new Error("commandStack: attack needs a targetId");
    const legal = battleLegalTargets(actor, enemyArmy).map((s) => s.id);
    if (!legal.includes(targetId))
      throw new Error(`commandStack: ${targetId} is not a legal target`);
    const target = enemyArmy.stacks.find((s) => s.id === targetId)!;
    const res = resolveAttack(actor, target, run.hero, NULL_HERO, rng);
    yourArmy = withStack(yourArmy, res.attacker);
    enemyArmy = withStack(enemyArmy, res.defender);
    for (const line of res.log) log.push(line);
    if (res.defenderKilled > 0) {
      slain[target.sourceId] = (slain[target.sourceId] ?? 0) + res.defenderKilled;
    }
    events = attackEvents("player", actor, target, res);
  }

  const nextCombat: CombatState = {
    ...combat,
    yourArmy,
    enemyArmy,
    log,
    slainEnemies: slain,
    actedStackIds: [...combat.actedStackIds, stackId],
  };
  let next: RunState = { ...run, combat: nextCombat, lastEvents: events };
  // LIGHT §3.8: a blinded player stack that just acted has its roll restored
  // (Blind costs one action). (Enemies have no spellbook today, so this is the
  // symmetric path; it keeps the rule general if enemy casting is ever added.)
  next = restoreBlindAfterAction(next, stackId);
  next = checkCombatEnd(next);
  return next;
}

export function legalSpellTargets(run: RunState, spellId: string): string[] {
  const combat = run.combat;
  if (!combat || combat.outcome !== "ongoing") return [];
  const spell = run.hero.spellbook.find((s) => s.id === spellId);
  if (!spell) return [];
  switch (spell.targeting) {
    case "enemyStack":
      return livingStacks(combat.enemyArmy).map((s) => s.id);
    case "allyStack":
      return livingStacks(combat.yourArmy).map((s) => s.id);
    default:
      return [];
  }
}

export function castSpell(
  run: RunState,
  spellId: string,
  targetId?: string,
): RunState {
  const combat = run.combat;
  if (!combat) throw new Error("castSpell: no active combat");
  if (combat.outcome !== "ongoing") throw new Error("castSpell: combat is over");
  if (combat.whoseTurn !== "player") throw new Error("castSpell: not your turn");
  if (combat.spellCastThisTurn) throw new Error("castSpell: already cast this turn");

  const spell = run.hero.spellbook.find((s) => s.id === spellId);
  if (!spell) throw new Error(`castSpell: hero does not know ${spellId}`);
  if (run.hero.mana < spell.manaCost) throw new Error("castSpell: not enough mana");

  const rng = combatRng(run).fork(`cast:${combat.round}:${spellId}`);
  const hero = { ...run.hero, mana: run.hero.mana - spell.manaCost };
  let yourArmy = combat.yourArmy;
  let enemyArmy = combat.enemyArmy;
  const log = combat.log.slice();
  const slain = { ...combat.slainEnemies };

  const result = applySpell(spell, run.hero, yourArmy, enemyArmy, targetId, rng);
  yourArmy = result.yourArmy;
  enemyArmy = result.enemyArmy;
  for (const line of result.log) log.push(line);
  for (const [sourceId, n] of Object.entries(result.slain)) {
    slain[sourceId] = (slain[sourceId] ?? 0) + n;
  }

  const nextCombat: CombatState = {
    ...combat,
    yourArmy,
    enemyArmy,
    spellCastThisTurn: true,
    log,
    slainEnemies: slain,
  };
  // Spells surface via the log for now (no per-target popup yet).
  let next: RunState = { ...run, hero, combat: nextCombat, lastEvents: [] };
  next = checkCombatEnd(next);
  return next;
}

/**
 * Apply ONE spell's effect to a SINGLE enemy stack and return the transformed
 * stack plus a log line and any creatures slain. The per-enemy-stack core of a
 * cast, shared by `applySpell` (the player's turn cast) and `openCombat`'s
 * `castOnStart` Relic scripting (COMBAT.md §19) so the two never drift.
 *
 * Honors the no-re-stack `spellMarks` rule (COMBAT.md §16): a stat-mod spell
 * (debuff/rollmode-min) already applied to the stack is a NO-OP on recast. The
 * magnitude scales off the wielder's `power` exactly like a normal cast. Returns
 * `slain` so a damaging cast feeds the necromancy ledger.
 */
function applySpellEffectToStack(
  spell: CombatSpell,
  hero: Hero,
  stack: Stack,
): { stack: Stack; log: string; slain: number } {
  const eff = spell.effect;
  const mag = spellMagnitude(eff, hero);
  const alreadyMarked = (stack.spellMarks ?? []).includes(spell.id);
  const mark = (s: Stack): Stack => ({
    ...s,
    spellMarks: [...(s.spellMarks ?? []), spell.id],
  });

  if (eff.kind === "damage") {
    const res = applyDamage(stack, mag);
    return {
      stack: res.defender,
      log: `${spell.name} hits ${stack.name} for ${res.dealt}` + (res.killed > 0 ? ` (${res.killed} slain)` : ""),
      slain: res.killed,
    };
  }
  if (eff.kind === "reset") {
    return { stack: resetStackToBase(stack), log: `${spell.name} dispels ${stack.name} (stats reset).`, slain: 0 };
  }
  if (eff.kind === "rollmode") {
    // Enemy roll-mode is always min (Curse). (Ally "max" is handled in applySpell.)
    if (alreadyMarked) return { stack, log: `${stack.name} is already affected by ${spell.name}.`, slain: 0 };
    return { stack: mark({ ...stack, damageMax: stack.damageMin }), log: `${spell.name} curses ${stack.name} (always min damage).`, slain: 0 };
  }
  if (eff.kind === "debuff") {
    if (alreadyMarked) return { stack, log: `${stack.name} is already affected by ${spell.name}.`, slain: 0 };
    if (eff.noShoot) {
      return { stack: mark({ ...stack, noShoot: true }), log: `${spell.name} makes ${stack.name} forget how to shoot.`, slain: 0 };
    }
    return { stack: mark(applyStatMod(stack, eff.stat, -mag)), log: `${spell.name} weakens ${stack.name} (-${mag} ${eff.stat}).`, slain: 0 };
  }
  // disable (Blind): zero the roll, snapshotting the pre-zero values once.
  const blindedFrom = stack.blindedFrom ?? { damageMin: stack.damageMin, damageMax: stack.damageMax };
  return { stack: { ...stack, damageMin: 0, damageMax: 0, blindedFrom }, log: `${spell.name} disables ${stack.name}.`, slain: 0 };
}

function applySpell(
  spell: CombatSpell,
  hero: Hero,
  yourArmy: Army,
  enemyArmy: Army,
  targetId: string | undefined,
  rng: Rng,
): { yourArmy: Army; enemyArmy: Army; log: string[]; slain: Record<string, number> } {
  const log: string[] = [];
  const slain: Record<string, number> = {};
  const mag = spellMagnitude(spell.effect, hero);
  const eff = spell.effect;

  // ITEM A (open-Q #2): no re-stack of the SAME spell. For stat-mod kinds
  // (buff/buffAll/debuff/rollmode — NOT damage/heal/reset), a spell already
  // applied to a stack is a NO-OP on recast. `alreadyMarked` reports it; `mark`
  // appends the spell id to the stack so a future recast is a no-op. DIFFERENT
  // spells still stack. (See COMBAT.md §16.)
  const alreadyMarked = (s: Stack): boolean =>
    (s.spellMarks ?? []).includes(spell.id);
  const mark = (s: Stack): Stack => ({
    ...s,
    spellMarks: [...(s.spellMarks ?? []), spell.id],
  });

  const damageEnemy = (target: Stack) => {
    const res = applyDamage(target, mag);
    enemyArmy = withStack(enemyArmy, res.defender);
    if (res.killed > 0) slain[target.sourceId] = (slain[target.sourceId] ?? 0) + res.killed;
    log.push(`${spell.name} hits ${target.name} for ${res.dealt}` + (res.killed > 0 ? ` (${res.killed} slain)` : ""));
  };
  // Damage a stack of YOUR army (Armageddon friend-and-foe). Does not feed the
  // slain-enemy ledger (those are your own creatures).
  const damageAlly = (target: Stack) => {
    const res = applyDamage(target, mag);
    yourArmy = withStack(yourArmy, res.defender);
    log.push(`${spell.name} hits ${target.name} for ${res.dealt}` + (res.killed > 0 ? ` (${res.killed} slain)` : ""));
  };

  if (eff.kind === "damage") {
    if (eff.bothArmies) {
      // LIGHT §3.4/§3.5: hit BOTH armies. Death Ripple skips undead; Armageddon
      // does not. Snapshot the living lists first so newly-zeroed stacks aren't
      // re-hit and `withStack` updates stay consistent.
      const skip = (s: Stack) => (eff.skipUndead ? hasAbility(s, "undead") : false);
      for (const tgt of livingStacks(enemyArmy)) if (!skip(tgt)) damageEnemy(tgt);
      for (const tgt of livingStacks(yourArmy)) if (!skip(tgt)) damageAlly(tgt);
    } else if (eff.target === "allEnemies") {
      for (const t of livingStacks(enemyArmy)) damageEnemy(t);
    } else {
      const t = targetId
        ? enemyArmy.stacks.find((s) => s.id === targetId && s.count > 0)
        : livingStacks(enemyArmy)[0];
      if (!t) throw new Error("castSpell: no valid enemy target");
      const r = applySpellEffectToStack(spell, hero, t);
      enemyArmy = withStack(enemyArmy, r.stack);
      if (r.slain > 0) slain[t.sourceId] = (slain[t.sourceId] ?? 0) + r.slain;
      log.push(r.log);
    }
  } else if (eff.kind === "heal") {
    const t = targetId
      ? yourArmy.stacks.find((s) => s.id === targetId)
      : livingStacks(yourArmy)[0];
    if (!t) throw new Error("castSpell: no valid ally target");
    let healed = applyHeal(t, mag, t.startCount > 0 ? t.startCount : t.count);
    // LIGHT §3.3: Cure's `dispel` rider — also reset the ally to base stats.
    if (eff.reset) healed = resetStackToBase(healed);
    yourArmy = withStack(yourArmy, healed);
    log.push(`${spell.name} restores ${t.name} (now ${healed.count}).`);
  } else if (eff.kind === "reset") {
    // LIGHT §3.3: Dispel — restore the enemy target to its base creature stats.
    const t = targetId
      ? enemyArmy.stacks.find((s) => s.id === targetId && s.count > 0)
      : livingStacks(enemyArmy)[0];
    if (!t) throw new Error("castSpell: no valid enemy target");
    const r = applySpellEffectToStack(spell, hero, t);
    enemyArmy = withStack(enemyArmy, r.stack);
    log.push(r.log);
  } else if (eff.kind === "buff") {
    const t = targetId
      ? yourArmy.stacks.find((s) => s.id === targetId && s.count > 0)
      : livingStacks(yourArmy)[0];
    if (!t) throw new Error("castSpell: no valid ally target");
    // LIGHT §3.7: Precision only buffs a back-rank ally (else it whiffs).
    if (eff.backRankOnly && t.rank !== "back") {
      log.push(`${spell.name} has no effect on ${t.name} (not back rank).`);
    } else if (alreadyMarked(t)) {
      log.push(`${t.name} is already affected by ${spell.name}.`); // ITEM A
    } else {
      yourArmy = withStack(yourArmy, mark(applyStatMod(t, eff.stat, mag)));
      log.push(`${spell.name} buffs ${t.name} (+${mag} ${eff.stat}).`);
    }
  } else if (eff.kind === "buffAll") {
    // LIGHT §3.6: Prayer — +mag to attack AND defense AND speed on the ally.
    const t = targetId
      ? yourArmy.stacks.find((s) => s.id === targetId && s.count > 0)
      : livingStacks(yourArmy)[0];
    if (!t) throw new Error("castSpell: no valid ally target");
    if (alreadyMarked(t)) {
      log.push(`${t.name} is already affected by ${spell.name}.`); // ITEM A
    } else {
      let buffed = applyStatMod(t, "attack", mag);
      buffed = applyStatMod(buffed, "defense", mag);
      buffed = applyStatMod(buffed, "speed", mag);
      yourArmy = withStack(yourArmy, mark(buffed));
      log.push(`${spell.name} blesses ${t.name} (+${mag} attack/defense/speed).`);
    }
  } else if (eff.kind === "rollmode") {
    // LIGHT §3.2: Bless (ally → always max roll) / Curse (enemy → always min).
    if (eff.target === "allyStack") {
      const t = targetId
        ? yourArmy.stacks.find((s) => s.id === targetId && s.count > 0)
        : livingStacks(yourArmy)[0];
      if (!t) throw new Error("castSpell: no valid ally target");
      if (alreadyMarked(t)) {
        log.push(`${t.name} is already affected by ${spell.name}.`); // ITEM A
      } else {
        yourArmy = withStack(yourArmy, mark({ ...t, damageMin: t.damageMax }));
        log.push(`${spell.name} blesses ${t.name} (always max damage).`);
      }
    } else {
      const t = targetId
        ? enemyArmy.stacks.find((s) => s.id === targetId && s.count > 0)
        : livingStacks(enemyArmy)[0];
      if (!t) throw new Error("castSpell: no valid enemy target");
      const r = applySpellEffectToStack(spell, hero, t);
      enemyArmy = withStack(enemyArmy, r.stack);
      log.push(r.log);
    }
  } else if (eff.kind === "debuff") {
    const t = targetId
      ? enemyArmy.stacks.find((s) => s.id === targetId && s.count > 0)
      : livingStacks(enemyArmy)[0];
    if (!t) throw new Error("castSpell: no valid enemy target");
    const r = applySpellEffectToStack(spell, hero, t);
    enemyArmy = withStack(enemyArmy, r.stack);
    log.push(r.log);
  } else {
    // disable (Blind): zero the target's damage roll. LIGHT §3.8: store the
    // pre-zero roll on the stack so its NEXT action restores it (Blind wears off
    // after costing the target one action). Don't overwrite an existing snapshot.
    const t = targetId
      ? enemyArmy.stacks.find((s) => s.id === targetId && s.count > 0)
      : livingStacks(enemyArmy)[0];
    if (!t) throw new Error("castSpell: no valid enemy target");
    const r = applySpellEffectToStack(spell, hero, t);
    enemyArmy = withStack(enemyArmy, r.stack);
    log.push(r.log);
  }
  void rng;
  return { yourArmy, enemyArmy, log, slain };
}

/**
 * LIGHT §3.3: restore a stack's combat stats to its BASE creature stats (undoes
 * any buff or debuff), via a pure content lookup — no per-effect tracking. Count
 * and hp are NOT touched (those are battle state, not buffs). Also clears the
 * Blind snapshot, since damageMin/Max are now back to base.
 */
function resetStackToBase(stack: Stack): Stack {
  const base = creatureById(stack.sourceId);
  if (!base) return stack;
  return {
    ...stack,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    damageMin: base.damageMin,
    damageMax: base.damageMax,
    blindedFrom: undefined,
  };
}

function applyStatMod(
  stack: Stack,
  stat: "attack" | "defense" | "speed" | "damage",
  delta: number,
): Stack {
  switch (stat) {
    case "attack":
      return { ...stack, attack: Math.max(0, stack.attack + delta) };
    case "defense":
      return { ...stack, defense: Math.max(0, stack.defense + delta) };
    case "speed":
      return { ...stack, speed: Math.max(1, stack.speed + delta) };
    case "damage":
      return {
        ...stack,
        damageMin: Math.max(0, stack.damageMin + delta),
        damageMax: Math.max(0, stack.damageMax + delta),
      };
  }
}

// ===========================================================================
// COMBAT — enemy turn (end of player turn)
// ===========================================================================

export function endPlayerTurn(run: RunState): RunState {
  const combat = run.combat;
  if (!combat) throw new Error("endPlayerTurn: no active combat");
  if (combat.outcome !== "ongoing") throw new Error("endPlayerTurn: combat is over");
  if (combat.whoseTurn !== "player") throw new Error("endPlayerTurn: not your turn");

  // Fresh event batch for this enemy turn (enemyAttack appends to it).
  let next: RunState = { ...run, combat: { ...combat, whoseTurn: "enemy" }, lastEvents: [] };

  // Enemy acts in speed order, highest first. The SAME chooseEnemyIntent that
  // produced each telegraph picks the action -> the telegraph is honest.
  const order = livingStacks(next.combat!.enemyArmy)
    .slice()
    .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id));

  for (const planned of order) {
    next = enemyAct(next, planned.id);
    // settleCombat nulls `combat` on a win; a loss leaves combat with outcome.
    if (!next.combat || next.combat.outcome !== "ongoing") break;
  }

  // Combat resolved (won -> combat null & outcome set; lost -> outcome 'lost').
  // The accumulated lastEvents survive on `next` for the UI to play out.
  if (!next.combat || next.combat.outcome !== "ongoing") return next;

  const turnEvents = next.lastEvents ?? [];

  // New round: increment, reset retaliation, refresh telegraphs, hand back.
  const combat2 = next.combat;
  const enemyArmy = {
    ...combat2.enemyArmy,
    stacks: combat2.enemyArmy.stacks.map((s) => ({ ...s, hasRetaliated: false, isDefending: false })),
  };
  const yourArmy = {
    ...combat2.yourArmy,
    stacks: combat2.yourArmy.stacks.map((s) => ({ ...s, hasRetaliated: false })),
  };
  next = {
    ...next,
    combat: { ...combat2, enemyArmy, yourArmy, round: combat2.round + 1 },
  };
  // Preserve the enemy turn's events through startPlayerTurn so the UI can play them.
  return { ...startPlayerTurn(next), lastEvents: turnEvents };
}

/** Resolve one enemy stack's telegraphed action against the player army. */
function enemyAct(run: RunState, stackId: string): RunState {
  const combat = run.combat!;
  const actor = combat.enemyArmy.stacks.find((s) => s.id === stackId);
  if (!actor || actor.count <= 0) return run;

  // Re-plan from current board state (honest: same pure planner as the telegraph;
  // the telegraph shown to the player was computed from the pre-turn board, and
  // here we re-derive against the now-current board for correct resolution).
  const intent = chooseEnemyIntent(actor, combat.yourArmy, NULL_HERO, run.hero);
  let next: RunState;
  if (intent.kind === "defend" || !intent.targetStackId) {
    const log = [...combat.log, `${actor.name} holds.`];
    next = { ...run, combat: { ...combat, log } };
  } else {
    const target = combat.yourArmy.stacks.find(
      (s) => s.id === intent.targetStackId && s.count > 0,
    );
    if (!target) {
      // Telegraphed target died; fall back to any legal target.
      const legal = battleLegalTargets(actor, combat.yourArmy);
      if (legal.length === 0) next = run;
      else next = enemyAttack(run, actor, legal[0]);
    } else {
      next = enemyAttack(run, actor, target);
    }
  }
  // LIGHT §3.8: Blind wears off after the blinded stack acts. The action above
  // resolved with the zeroed roll (it cost the stack this turn); now restore.
  return restoreBlindAfterAction(next, stackId);
}

/**
 * LIGHT §3.8: if a blinded stack just took its action, restore its pre-Blind
 * damage roll and clear the flag — Blind costs exactly one action. Looks the
 * stack up in whichever army holds it (works for both sides).
 */
function restoreBlindAfterAction(run: RunState, stackId: string): RunState {
  const combat = run.combat;
  if (!combat) return run; // combat may have settled to a win (null)
  const inEnemy = combat.enemyArmy.stacks.find((s) => s.id === stackId);
  const inYour = combat.yourArmy.stacks.find((s) => s.id === stackId);
  const actor = inEnemy ?? inYour;
  if (!actor || !actor.blindedFrom) return run;
  const restored: Stack = {
    ...actor,
    damageMin: actor.blindedFrom.damageMin,
    damageMax: actor.blindedFrom.damageMax,
    blindedFrom: undefined,
  };
  const enemyArmy = inEnemy ? withStack(combat.enemyArmy, restored) : combat.enemyArmy;
  const yourArmy = inYour ? withStack(combat.yourArmy, restored) : combat.yourArmy;
  return { ...run, combat: { ...combat, enemyArmy, yourArmy } };
}

function enemyAttack(run: RunState, actor: Stack, target: Stack): RunState {
  const combat = run.combat!;
  const rng = combatRng(run).fork(`enemy:${combat.round}:${actor.id}`);
  const res = resolveAttack(actor, target, NULL_HERO, run.hero, rng);
  const enemyArmy = withStack(combat.enemyArmy, res.attacker);
  const yourArmy = withStack(combat.yourArmy, res.defender);
  const log = [...combat.log, ...res.log];
  // ITEM D.2: Wraith "Drains enemy mana" — subtract drained mana from the hero
  // (clamped ≥ 0). resolveAttack only reports a drain on an enemy→player hit.
  const hero =
    res.manaDrain > 0
      ? { ...run.hero, mana: Math.max(0, run.hero.mana - res.manaDrain) }
      : run.hero;
  let next: RunState = {
    ...run,
    hero,
    combat: { ...combat, enemyArmy, yourArmy, log },
    lastEvents: [...(run.lastEvents ?? []), ...attackEvents("enemy", actor, target, res)],
  };
  next = checkCombatEnd(next);
  return next;
}

// ===========================================================================
// COMBAT — end detection + settlement
// ===========================================================================

function checkCombatEnd(run: RunState): RunState {
  const combat = run.combat!;
  if (combat.outcome !== "ongoing") return run;
  const enemyAliveNow = armyAlive(combat.enemyArmy);
  const youAlive = armyAlive(combat.yourArmy);
  if (enemyAliveNow && youAlive) return run;

  const outcome: CombatState["outcome"] = !youAlive ? "lost" : "won";
  const settled: CombatState = { ...combat, outcome };
  return settleCombat({ ...run, combat: settled });
}

function settleCombat(run: RunState): RunState {
  const combat = run.combat!;
  const node = run.map.find((n) => n.id === run.currentNodeId)!;

  if (combat.outcome === "lost") {
    // Terminal state: the army (life) is gone. Keep a uniform shape with wins —
    // combat is cleared, the run outcome carries the result.
    return { ...run, outcome: "lost", army: [], combat: null };
  }

  // Won. Carry the surviving army back (drop dead stacks).
  const survivors: Stack[] = combat.yourArmy.stacks
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, isDefending: false, hasRetaliated: false, hasActed: false }));

  let next: RunState = {
    ...run,
    army: survivors,
    clearedNodeIds: [...run.clearedNodeIds, node.id],
    combat: null,
  };

  if (node.type === "boss") {
    next.outcome = "won";
    return next;
  }

  // Necromancy + combat rewards.
  next = applyNecromancy(next, combat);
  next.pendingRewards = rollCombatRewards(node, makeRng(run.seed).fork(`rewards:${node.id}`));
  return next;
}

// ===========================================================================
// NECROMANCY
// ===========================================================================

/** Compute the raise from a battle's slain ledger; mutate army or queue a raise. */
export function applyNecromancy(run: RunState, combat: CombatState): RunState {
  const skill = run.hero.skills["Necromancy"] ?? 0;
  const basePct = NECRO_BASE_PCT[Math.min(skill, NECRO_BASE_PCT.length - 1)] ?? 0;
  const pct = Math.min(NECRO_CAP, basePct + equipmentNecroBonus(run.hero));
  if (pct <= 0) return run;

  // Slain hp = sum over slain enemy creatures of their per-creature maxHp.
  let slainHp = 0;
  let slainCreatures = 0;
  for (const [sourceId, n] of Object.entries(combat.slainEnemies)) {
    const c = creatureById(sourceId);
    if (!c) continue;
    slainHp += c.hp * n;
    slainCreatures += n;
  }
  if (slainCreatures <= 0) return run;

  const skeleton = creatureById(SKELETON_ID)!;
  let raised = Math.floor((slainHp * pct) / skeleton.hp);
  raised = Math.min(raised, slainCreatures); // never raise more bodies than fell
  if (raised <= 0) return run;

  // Add to an existing Skeleton stack, else create one, else queue a raise reward.
  const existing = run.army.find((s) => s.sourceId === SKELETON_ID && s.count > 0);
  if (existing) {
    const army = run.army.map((s) =>
      s.id === existing.id
        ? { ...s, count: s.count + raised, startCount: s.count + raised }
        : s,
    );
    return { ...run, army };
  }
  if (run.army.length < ARMY_CAP) {
    const newStack = adaptStack(skeleton, raised, { idSuffix: `_raised_${run.clearedNodeIds.length}` });
    return { ...run, army: [...run.army, newStack] };
  }
  // Army full and no skeleton stack: surface as a pending raise reward.
  const raiseChoice: RewardChoice = { kind: "raise", creatureId: SKELETON_ID, count: raised };
  return { ...run, pendingRewards: [raiseChoice, { kind: "skip" }] };
}

// ===========================================================================
// REWARDS
// ===========================================================================

function rollCombatRewards(node: MapNode, rng: Rng): RewardChoice[] {
  const gold = node.type === "elite" ? rng.int(40, 70) : rng.int(20, 40);
  const rewards: RewardChoice[] = [{ kind: "gold", amount: gold }];
  rewards.push({ kind: "skip" });
  return rewards;
}

// --- node reward rolls ---

function rollDwelling(rng: Rng): RewardChoice[] {
  const pool = BASE_CREATURES.filter((c) => c.tier <= 5);
  const c = rng.pick(pool);
  const count = rng.int(3, 8);
  const cost = c.tier * RECRUIT_COST_PER_TIER;
  return [{ kind: "recruit", creatureId: c.id, count, cost }, { kind: "skip" }];
}

function rollAltar(run: RunState, _rng: Rng): RewardChoice[] {
  // Offer to upgrade each stack that has an upgrade form (cost by tier).
  const out: RewardChoice[] = [];
  for (const s of run.army) {
    const up = upgradeFormOf(s.sourceId);
    if (up) out.push({ kind: "upgrade", stackId: s.id, toCreatureId: up.id, cost: s.tier * UPGRADE_COST_PER_TIER });
  }
  out.push({ kind: "skip" });
  return out;
}

function rollShrine(run: RunState, rng: Rng): RewardChoice[] {
  const known = new Set(run.hero.spellbook.map((s) => s.id));
  const pool = SPELLS.filter((s) => !known.has(`spell_${tail(s.id)}`));
  if (pool.length === 0) return [{ kind: "skip" }];
  const s = rng.pick(pool);
  const cost = s.level * SHRINE_COST_PER_LEVEL;
  return [{ kind: "learn", spellId: s.id, cost }, { kind: "skip" }];
}

function rollMerchant(rng: Rng): RewardChoice[] {
  const a = rng.pick(ARTIFACTS);
  const b = rng.pick(ARTIFACTS);
  const out: RewardChoice[] = [];
  out.push({ kind: "buy", artifactId: a.id, slot: a.slot, cost: ARTIFACT_COST[a.class] ?? 100 });
  if (b.id !== a.id) out.push({ kind: "buy", artifactId: b.id, slot: b.slot, cost: ARTIFACT_COST[b.class] ?? 100 });
  out.push({ kind: "skip" });
  return out;
}

export function pickReward(run: RunState, choiceIndex: number): RunState {
  if (!run.pendingRewards) throw new Error("pickReward: no rewards pending");
  const choice = run.pendingRewards[choiceIndex];
  if (!choice) throw new Error(`pickReward: invalid choice ${choiceIndex}`);

  let next: RunState = {
    ...run,
    army: run.army.slice(),
    clearedNodeIds: run.clearedNodeIds.slice(),
    pendingRewards: null,
  };
  next = applyReward(next, choice);

  if (run.currentNodeId && !next.clearedNodeIds.includes(run.currentNodeId)) {
    next.clearedNodeIds = [...next.clearedNodeIds, run.currentNodeId];
  }
  return next;
}

function applyReward(run: RunState, choice: RewardChoice): RunState {
  switch (choice.kind) {
    case "gold":
      return { ...run, gold: run.gold + choice.amount };
    case "raise": {
      const skeleton = creatureById(choice.creatureId)!;
      if (run.army.length >= ARMY_CAP) {
        // Replace the weakest stack with the raised one.
        const weakest = [...run.army].sort((a, b) => a.tier - b.tier || a.count - b.count)[0];
        const army = run.army.map((s) =>
          s.id === weakest.id
            ? adaptStack(skeleton, choice.count, { idSuffix: `_raised_${run.clearedNodeIds.length}` })
            : s,
        );
        return { ...run, army };
      }
      const newStack = adaptStack(skeleton, choice.count, { idSuffix: `_raised_${run.clearedNodeIds.length}` });
      return { ...run, army: [...run.army, newStack] };
    }
    case "recruit":
      return recruit(run, choice.creatureId, choice.count, choice.cost);
    case "upgrade":
      return upgrade(run, choice.stackId, choice.toCreatureId, choice.cost);
    case "learn":
      return learn(run, choice.spellId, choice.cost);
    case "buy":
      return buy(run, choice.artifactId, choice.cost);
    case "skip":
      return run;
  }
}

// ===========================================================================
// NODE INTERACTIONS (also callable directly by the app)
// ===========================================================================

function recruit(run: RunState, creatureId: string, count: number, cost: number): RunState {
  if (run.gold < cost) throw new Error("recruit: not enough gold");
  const c = creatureById(creatureId);
  if (!c) throw new Error(`recruit: no creature ${creatureId}`);
  // Merge into an existing same-type stack, else add (respecting cap).
  const existing = run.army.find((s) => s.sourceId === creatureId && s.count > 0);
  let army: Stack[];
  if (existing) {
    army = run.army.map((s) =>
      s.id === existing.id ? { ...s, count: s.count + count, startCount: s.count + count } : s,
    );
  } else {
    if (run.army.length >= ARMY_CAP) throw new Error("recruit: army is full");
    army = [...run.army, adaptStack(c, count, { idSuffix: `_rec_${run.clearedNodeIds.length}_${run.army.length}` })];
  }
  return { ...run, army, gold: run.gold - cost };
}

function upgrade(run: RunState, stackId: string, toCreatureId: string, cost: number): RunState {
  if (run.gold < cost) throw new Error("upgrade: not enough gold");
  const stack = run.army.find((s) => s.id === stackId);
  if (!stack) throw new Error(`upgrade: no stack ${stackId}`);
  const up = creatureById(toCreatureId);
  if (!up) throw new Error(`upgrade: no creature ${toCreatureId}`);
  if (up.upgradeOf !== stack.sourceId) throw new Error("upgrade: not a valid upgrade form");
  // New stack of upgraded creatures, preserving count (capped at new maxHp).
  const upgraded: Stack = {
    ...adaptStack(up, stack.count, { idSuffix: "" }),
    id: stack.id,
  };
  const army = run.army.map((s) => (s.id === stackId ? upgraded : s));
  return { ...run, army, gold: run.gold - cost };
}

function learn(run: RunState, spellId: string, cost: number): RunState {
  if (run.gold < cost) throw new Error("learn: not enough gold");
  const s = spellById(spellId);
  if (!s) throw new Error(`learn: no spell ${spellId}`);
  const adapted = adaptSpell(s);
  // Learn into the BASE (learned) spellbook, not the effective one — so an
  // artifact-granted spell is never confused for a learned one (COMBAT.md §19).
  if (run.hero.baseSpellbook.some((sp) => sp.id === adapted.id)) return run;
  // recomputeHero rebuilds the effective `spellbook` (base ∪ granted), so a
  // shrine-learned spell survives any later equip/unequip cycle.
  const hero = recomputeHero({
    ...run.hero,
    baseSpellbook: [...run.hero.baseSpellbook, adapted],
  });
  return { ...run, hero, gold: run.gold - cost };
}

function buy(run: RunState, artifactId: string, cost: number): RunState {
  if (run.gold < cost) throw new Error("buy: not enough gold");
  const a = artifactById(artifactId);
  if (!a) throw new Error(`buy: no artifact ${artifactId}`);
  const eq = adaptEquipment(a);
  // Auto-equip into its slot, recompute hero.
  const equipment = { ...run.hero.equipment, [eq.slot]: eq };
  let hero = { ...run.hero, equipment };
  hero = recomputeHero(hero);
  return { ...run, hero, gold: run.gold - cost };
}

// --- public node-interaction wrappers (find the offer at the node) ---

export function recruitAt(run: RunState, nodeId: string, offerId: string): RunState {
  return resolveOffer(run, nodeId, offerId, "recruit");
}
export function upgradeAt(run: RunState, nodeId: string, stackId: string): RunState {
  if (!run.pendingRewards) throw new Error("upgradeAt: no pending offers");
  const idx = run.pendingRewards.findIndex(
    (r) => r.kind === "upgrade" && r.stackId === stackId,
  );
  if (idx < 0) throw new Error(`upgradeAt: no upgrade offer for ${stackId}`);
  void nodeId;
  return pickReward(run, idx);
}
export function learnAt(run: RunState, nodeId: string, spellId: string): RunState {
  if (!run.pendingRewards) throw new Error("learnAt: no pending offers");
  const idx = run.pendingRewards.findIndex(
    (r) => r.kind === "learn" && r.spellId === spellId,
  );
  if (idx < 0) throw new Error(`learnAt: no learn offer for ${spellId}`);
  void nodeId;
  return pickReward(run, idx);
}
export function buyAt(run: RunState, nodeId: string, offerId: string): RunState {
  return resolveOffer(run, nodeId, offerId, "buy");
}

function resolveOffer(
  run: RunState,
  nodeId: string,
  offerId: string,
  kind: "recruit" | "buy",
): RunState {
  if (!run.pendingRewards) throw new Error(`${kind}: no pending offers`);
  const idx = run.pendingRewards.findIndex((r) => {
    if (kind === "recruit") return r.kind === "recruit" && r.creatureId === offerId;
    return r.kind === "buy" && r.artifactId === offerId;
  });
  if (idx < 0) throw new Error(`${kind}: no offer ${offerId}`);
  void nodeId;
  return pickReward(run, idx);
}

// ===========================================================================
// EQUIPMENT (paper-doll on the map)
// ===========================================================================

export function equipArtifact(
  run: RunState,
  equipmentId: string,
  slot: ArtifactSlot,
): RunState {
  // equipmentId may be an artifact id OR an equipment id; resolve via content.
  const a = ARTIFACTS.find((x) => x.id === equipmentId || `equip_${tail(x.id)}` === equipmentId);
  if (!a) throw new Error(`equipArtifact: unknown ${equipmentId}`);
  const eq = adaptEquipment(a);
  const equipment = { ...run.hero.equipment, [slot]: eq };
  const hero = recomputeHero({ ...run.hero, equipment });
  return { ...run, hero };
}

export function unequipArtifact(run: RunState, slot: ArtifactSlot): RunState {
  const equipment = { ...run.hero.equipment };
  delete equipment[slot];
  const hero = recomputeHero({ ...run.hero, equipment });
  return { ...run, hero };
}

export function pendingRewards(run: RunState): RewardChoice[] | null {
  return run.pendingRewards;
}

// ===========================================================================
// internals
// ===========================================================================

function combatRng(run: RunState): Rng {
  return makeRng(run.seed).fork(`combat:${run.currentNodeId}`);
}

function tail(id: string): string {
  return id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
}

// Re-export content arrays + lookups for the app/Codex.
export {
  ALL_CREATURES,
  ARTIFACTS,
  CREATURES,
  SPELLS,
  creatureById,
  spellById,
  artifactById,
};
