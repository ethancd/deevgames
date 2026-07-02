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
import { generateMap, startNodeIds, ACT_WEEKS, isMusterDay, weeksForAct } from "./map";
import {
  ALL_BASE_CREATURES,
  ALL_CREATURES,
  ARTIFACTS,
  BASE_CREATURES,
  CREATURES,
  DEFAULT_FACTION,
  DEFAULT_HERO,
  SPELLS,
  artifactById,
  basePool,
  creatureById,
  heroById,
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
  moraleChance,
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
 * Encounter scaling — PURELY DEPTH-BASED. No rubber-banding, no floor/ceiling.
 * Enemy power is a fixed function of how far up the Spire you are (depth 0 at the
 * opener → 1 at the boss); it does NOT track your army. Your growth (Necromancy /
 * Dwellings) is yours to leverage: out-grow the curve and you win (then play
 * again); fall behind and you lose. That is the roguelite covenant.
 *
 *   budget = basePower * (1 + (bossGrowth-1)*depth) * nodeTypeMult
 *
 * armyValue(stack) = count * (hp + avgDamage*2) — a rough "how scary". These are
 * the central difficulty levers (see COMBAT.md); tuned via the run.test sweep.
 */
export const ENCOUNTER = {
  /** Enemy budget at the opener (depth 0, combat node) — a gentle first fight. */
  basePower: 90,
  /** Enemy budget multiplies from 1x (opener) to this at the boss row (depth 1).
   *  Tuned so a competent player's Necromancy/Dwelling growth can out-pace it. */
  bossGrowth: 4.0,
  /** Node-type multipliers layered on the depth curve. */
  eliteMult: 1.4,
  bossMult: 1.3,
  /** Per-act power multiplier (COMBAT.md §25): Act 1 baseline, later acts harder
   *  even though depth re-normalizes to [0,1] each act. Index by act-1.
   *  NOTE: balanced against Necromancy's snowball; non-Necropolis factions need
   *  the weekly muster (planned) to sustain the longer climbs — see §25. */
  actPower: [1, 1.3, 1.7],
  /** Max Bone Dragons in the boss fight (the rest of the budget is Lich guard). */
  bossMaxDragons: 2,
  /** Max enemy stacks. */
  maxStacks: 4,
};

/** The pure depth curve: enemy budget multiplier from opener (0) to boss (1). */
function depthGrowth(depth: number): number {
  return 1 + (ENCOUNTER.bossGrowth - 1) * Math.max(0, Math.min(1, depth));
}

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

/**
 * COMBAT.md §24: army-wide luck & morale, sourced once at battle open.
 *  - luck: summed `luckAll` artifact effects (no creature source today).
 *  - morale: summed `moraleAll` artifact effects + creature "+N morale to all
 *    allies" auras, minus 1 per OPPOSING stack with "Reduces enemy morale".
 *  - Undead neutral-lock: any "No morale penalty" stack pins this army's morale
 *    to 0 (the franchise's undead morale model — neither bonus nor penalty).
 */
export function armyLuckMorale(
  stacks: Stack[],
  hero: Hero | null,
  opposingStacks: Stack[],
): { luck: number; morale: number } {
  let luck = 0;
  let morale = 0;
  if (hero) {
    for (const eq of Object.values(hero.equipment)) {
      if (!eq) continue;
      for (const e of eq.effects) {
        if (e.kind === "luckAll") luck += e.amount;
        else if (e.kind === "moraleAll") morale += e.amount;
      }
    }
  }
  for (const s of stacks) {
    for (const a of s.abilities) {
      const m = /([+-]?\d+)\s*morale to all allies/i.exec(a);
      if (m) morale += parseInt(m[1], 10);
    }
  }
  for (const s of opposingStacks) {
    if (s.abilities.some((a) => /reduces enemy morale/i.test(a))) morale -= 1;
  }
  const undeadLock = stacks.some((s) =>
    s.abilities.some((a) => /no morale penalty/i.test(a)),
  );
  if (undeadLock) morale = 0;
  return { luck, morale };
}

// ===========================================================================
// START
// ===========================================================================

export function startRun(seed: string, heroId?: string): RunState {
  // Default to Galthran (preserves v0 behavior + the keystone determinism test).
  // An unknown heroId falls back to the default rather than throwing.
  const sourceHero = (heroId && heroById(heroId)) || DEFAULT_HERO;
  // deriveHero filters by the hero's faction itself, so we hand it the WHOLE
  // corpus — the chosen faction's starting army resolves regardless of hero.
  const { hero, startingArmy } = deriveHero(sourceHero, {
    creatures: ALL_CREATURES,
    spells: SPELLS,
  });
  const map = buildMap(seed, /*act*/ 1);

  return {
    seed,
    faction: hero.faction,
    hero,
    army: startingArmy,
    gold: STARTING_GOLD,
    map,
    currentNodeId: null,
    act: 1,
    unlockedTier: STARTING_UNLOCKED_TIER,
    combat: null,
    outcome: "ongoing",
    clearedNodeIds: [],
    pendingRewards: null,
  };
}

// ===========================================================================
// CREATURE-TIER UNLOCKS (COMBAT.md §28)
// ===========================================================================

/** Tiers 1–2 are available from the start. */
export const STARTING_UNLOCKED_TIER = 2;
/** Max recruitable tier per act: Act 1 → 4, Act 2 → 6, Act 3 → 7. */
export const ACT_TIER_CAP = [4, 6, 7];
export const tierCapForAct = (act: number) =>
  ACT_TIER_CAP[act - 1] ?? ACT_TIER_CAP[ACT_TIER_CAP.length - 1];

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
    lastClaim: null, // and stale tile-claim toasts
  };

  // Tier-unlock guarantee (§28): in the act's FINAL week, floor the unlocked tier
  // to the act cap — so 4/6/7 are available before the boss + pre-boss muster,
  // even if you skipped the tough combats that would have unlocked them earlier.
  if (node.week >= weeksForAct(run.act)) {
    next.unlockedTier = Math.max(next.unlockedTier, tierCapForAct(run.act));
  }

  // Weekly muster (§25): at the start of each week AFTER the opener (day > 1), on
  // a Monday, reinforce your existing stacks BEFORE the node resolves — so the
  // last muster lands right before each boss. Deferred to `pickReward` ("march
  // on"). Skipped on the act opener (day 1) and when you have nothing to buy.
  if (node.day > 1 && isMusterDay(node.day) && musterableStacks(next).length > 0) {
    next.pendingMusterNodeId = nodeId;
    next.pendingRewards = rollMuster(next);
    return next;
  }
  return resolveNodeEffects(next, node, rng);
}

/** Enter a node (§27): a GUARDED tile opens its combat (the tile is claimed on
 *  the win, in `settleCombat`); an UNGUARDED tile is claimed immediately. Split
 *  out of `chooseNode` so the muster can defer it to "march on". */
function resolveNodeEffects(next: RunState, node: MapNode, rng: Rng): RunState {
  if (node.guarded) {
    next.combat = openCombat(next, node, rng);
    return next;
  }
  return claimTile(next, node, rng);
}

// --- Tile economy levers (COMBAT.md §27) ---
export const STAT_TILE_BONUS = 1; // +1 hero primary from a stat tile
export const XP_TILE_AMOUNT = 120; // Learning Stone
export const GOLD_TILE_AMOUNT = 40; // Campfire/Treasure (× PLAYTEST.goldMult)

/** Claim a tile's bonus (§27). Stat/xp/gold/mana/rest apply immediately and clear
 *  the node; shop tiles open their offer screen via `pendingRewards`. Called for
 *  an unguarded tile on entry, or for a guarded tile after the win (`settleCombat`). */
function claimTile(run: RunState, node: MapNode, rng: Rng): RunState {
  // Mark cleared + record the claim (for the UI toast) on instant tiles.
  const done = (r: RunState, amount: number): RunState => ({
    ...r,
    clearedNodeIds: r.clearedNodeIds.includes(node.id)
      ? r.clearedNodeIds
      : [...r.clearedNodeIds, node.id],
    lastClaim: { tile: node.type, amount },
  });
  switch (node.type) {
    case "attack":
    case "defense":
    case "power":
    case "knowledge":
      return done({ ...run, hero: bumpPrimary(run.hero, node.type, STAT_TILE_BONUS) }, STAT_TILE_BONUS);
    case "xp":
      return done({ ...run, hero: awardXp(run.hero, XP_TILE_AMOUNT) }, XP_TILE_AMOUNT);
    case "gold": {
      const amount = GOLD_TILE_AMOUNT * PLAYTEST.goldMult;
      return done({ ...run, gold: run.gold + amount }, amount);
    }
    case "mana":
      return done({ ...run, hero: { ...run.hero, mana: run.hero.maxMana } }, 0);
    case "rest": {
      const r = { ...run };
      applyRest(r);
      return done(r, 0);
    }
    case "dwelling":
      return { ...run, pendingRewards: rollDwelling(run, rng) };
    case "altar":
      return { ...run, pendingRewards: rollAltar(run, rng) };
    case "shrine":
      return { ...run, pendingRewards: rollShrine(run, rng) };
    case "merchant":
      return { ...run, pendingRewards: rollMerchant(rng) };
    case "boss":
      return run; // boss is always guarded — handled by settleCombat's act advance
  }
}

/** +`amount` to a hero BASE primary, then refresh live stats (§27 stat tiles). */
function bumpPrimary(hero: Hero, stat: PrimaryStat, amount: number): Hero {
  const base = {
    attack: hero.baseAttack,
    defense: hero.baseDefense,
    power: hero.basePower,
    knowledge: hero.baseKnowledge,
  };
  base[stat] += amount;
  return recomputeHero({
    ...hero,
    baseAttack: base.attack,
    baseDefense: base.defense,
    basePower: base.power,
    baseKnowledge: base.knowledge,
  });
}

// ===========================================================================
// WEEKLY MUSTER (COMBAT.md §25) — reinforce existing stacks each Monday
// ===========================================================================

/** Muster economy levers (mutable so balance sweeps can tune them).
 *  `costPerTier` = gold per (count × tier); `growthMult` scales reinforcement size. */
export const MUSTER = { costPerTier: 3, growthMult: 2 };

/** Weekly reinforcement size for a stack of `tier` (low tiers grow faster). */
function musterGrowth(tier: number): number {
  return Math.max(1, Math.round((8 - tier) * MUSTER.growthMult));
}

/** The living stacks a muster can reinforce. */
function musterableStacks(run: RunState): Stack[] {
  return run.army.filter((s) => s.count > 0);
}

/** A fresh set of muster offers: reinforce each living stack, recruit any
 *  newly-unlocked stack you don't yet field (§28), then "march on". */
function rollMuster(run: RunState): RewardChoice[] {
  const offers: RewardChoice[] = [];
  // Reinforce existing stacks.
  for (const s of musterableStacks(run)) {
    const count = musterGrowth(s.tier);
    const cost = count * s.tier * MUSTER.costPerTier;
    offers.push({ kind: "muster", stackId: s.id, creatureId: s.sourceId, count, cost });
  }
  // Recruit a NEW stack of any unlocked tier you don't already field (army not
  // full). This is where freshly-unlocked tiers (3/4, 5/6, 7) show up to buy.
  if (run.army.length < ARMY_CAP) {
    const faction = run.faction ?? run.hero.faction ?? DEFAULT_FACTION;
    const have = new Set(run.army.filter((s) => s.count > 0).map((s) => s.sourceId));
    for (const c of basePool(faction)) {
      if (c.tier > run.unlockedTier || have.has(c.id)) continue;
      const count = musterGrowth(c.tier);
      const cost = count * c.tier * RECRUIT_COST_PER_TIER;
      offers.push({ kind: "recruit", creatureId: c.id, count, cost });
    }
  }
  offers.push({ kind: "skip" }); // "march on" — close the muster, resolve the node
  return offers;
}

/** Reinforce a stack at the muster: add `count` creatures, deduct `cost` gold. */
function applyMuster(
  run: RunState,
  choice: Extract<RewardChoice, { kind: "muster" }>,
): RunState {
  if (run.gold < choice.cost) throw new Error("muster: not enough gold");
  const army = run.army.map((s) =>
    s.id === choice.stackId
      ? { ...s, count: s.count + choice.count, startCount: s.count + choice.count }
      : s,
  );
  return { ...run, army, gold: run.gold - choice.cost };
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
  const enemyArmy = rollEncounter(node, depth, run.act, rng.fork("encounter"));
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
  // COMBAT.md §24: army-wide luck & morale, computed once both rosters exist.
  const playerLM = armyLuckMorale(yourStacks, run.hero, enemyArmy.stacks);
  const enemyLM = armyLuckMorale(enemyArmy.stacks, null, yourStacks);
  const state: CombatState = {
    round: 1,
    whoseTurn: "player",
    yourArmy: { stacks: yourStacks, side: "player", luck: playerLM.luck, morale: playerLM.morale },
    enemyArmy: { ...enemyArmy, luck: enemyLM.luck, morale: enemyLM.morale },
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

/** Generate an act's map and ANNOTATE each guarded node with its most-dangerous
 *  guard creature (§27) — pre-rolling the SAME encounter `openCombat` will roll,
 *  so the map image matches the actual fight. */
function buildMap(seed: string, act: number): MapNode[] {
  const map = generateMap(makeRng(seed), act);
  const maxRow = Math.max(...map.map((n) => n.row));
  for (const node of map) {
    if (!node.guarded) continue;
    const depth = maxRow > 0 ? node.row / maxRow : 0;
    const rng = makeRng(seed).fork(`node:${node.id}`).fork("encounter");
    const army = rollEncounter(node, depth, act, rng);
    node.guardCreatureId = mostDangerousCreatureId(army.stacks);
  }
  return map;
}

/** The sourceId of the highest-threat (most dangerous) stack in an army (§27). */
function mostDangerousCreatureId(stacks: Stack[]): string {
  let best: Stack | undefined;
  let bestScore = -Infinity;
  for (const s of stacks) {
    const score = s.count * ((s.damageMin + s.damageMax) / 2) + s.attack;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best?.sourceId ?? "";
}

/**
 * Build an enemy army to roughly `budget` total armyValue, drawn from a tier
 * band that widens with depth. Greedily fills up to maxStacks, dividing the
 * budget across stacks. Always returns at least one non-empty stack.
 */
function rollEncounter(node: MapNode, depth: number, act: number, rng: Rng): Army {
  // Pure depth budget — no player-army term, no floor. (Roguelite covenant.)
  // Scaled by the per-act power multiplier so later (shorter) acts bite harder.
  const actMult = ENCOUNTER.actPower[act - 1] ?? ENCOUNTER.actPower[ENCOUNTER.actPower.length - 1];
  const curve = ENCOUNTER.basePower * depthGrowth(depth) * actMult;

  let budget: number;
  let tierMin: number;
  let tierMax: number;
  if (node.type === "boss") {
    budget = curve * ENCOUNTER.bossMult;
    tierMin = 1;
    tierMax = 7;
  } else if (node.tough) {
    budget = curve * ENCOUNTER.eliteMult;
    tierMin = Math.max(2, Math.floor(lerp(2, 4, depth)));
    tierMax = Math.min(7, Math.ceil(lerp(4, 6, depth)));
  } else {
    budget = curve;
    tierMin = 1;
    tierMax = Math.min(7, Math.max(2, Math.ceil(lerp(2, 5, depth))));
  }
  // Foes are drawn from a BROAD cross-faction pool (every faction's base
  // creatures), not the player's own roster — no civil war, and varied enemies.
  // Budget-matched scaling keeps difficulty intact regardless of which creatures
  // fill the band. (The boss below stays a fixed Necropolis antagonist theme —
  // the Spire's Lich King — for every run.)
  const pool = ALL_BASE_CREATURES.filter((c) => c.tier >= tierMin && c.tier <= tierMax);
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
  id: "enemy", name: "Enemy", heroClass: "", specialty: "", faction: "",
  attack: 0, defense: 0, power: 0, knowledge: 0, mana: 0, maxMana: 0,
  level: 1, xp: 0,
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
    let ns = { ...s, hasActed: false, isDefending: false, moraleBonusUsed: false };
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

  // MORALE (§24): one roll per command, skipped once this stack has spent its
  // good-morale bonus this turn (so a re-command can't loop). Drawn off an
  // independent sub-stream, only when morale ≠ 0, so the attack rng — and every
  // existing test — is unchanged. Negative morale can freeze the stack (lost
  // action, returned now); positive morale grants a bonus action (applied after).
  const morale = combat.yourArmy.morale ?? 0;
  let bonusAction = false;
  if (morale !== 0 && !actor.moraleBonusUsed) {
    const moraleHit = rng.fork("morale").next() < moraleChance(morale);
    if (moraleHit && morale < 0) {
      const frozenCombat: CombatState = {
        ...combat,
        yourArmy: withStack(yourArmy, { ...actor, moraleBonusUsed: true }),
        log: [...log, `${actor.name} is unnerved and loses its action.`],
        actedStackIds: [...combat.actedStackIds, stackId],
      };
      return checkCombatEnd({ ...run, combat: frozenCombat, lastEvents: [] });
    }
    if (moraleHit && morale > 0) bonusAction = true;
  }

  if (action === "defend") {
    yourArmy = withStack(yourArmy, { ...actor, isDefending: true });
    log.push(`${actor.name} defends.`);
  } else {
    if (!targetId) throw new Error("commandStack: attack needs a targetId");
    const legal = battleLegalTargets(actor, enemyArmy).map((s) => s.id);
    if (!legal.includes(targetId))
      throw new Error(`commandStack: ${targetId} is not a legal target`);
    const target = enemyArmy.stacks.find((s) => s.id === targetId)!;
    const res = resolveAttack(actor, target, run.hero, NULL_HERO, rng, combat.yourArmy.luck ?? 0);
    yourArmy = withStack(yourArmy, res.attacker);
    enemyArmy = withStack(enemyArmy, res.defender);
    for (const line of res.log) log.push(line);
    if (res.defenderKilled > 0) {
      slain[target.sourceId] = (slain[target.sourceId] ?? 0) + res.defenderKilled;
    }
    events = attackEvents("player", actor, target, res);
  }

  // MORALE bonus: leave the stack OFF actedStackIds so it may act again, and
  // flag it so the re-command won't re-roll. Only if it survived its action.
  let actedStackIds = [...combat.actedStackIds, stackId];
  if (bonusAction) {
    const acted = yourArmy.stacks.find((s) => s.id === stackId);
    if (acted && acted.count > 0) {
      yourArmy = withStack(yourArmy, { ...acted, moraleBonusUsed: true });
      log.push(`${actor.name}'s morale grants a bonus action!`);
      actedStackIds = [...combat.actedStackIds];
    }
  }
  const nextCombat: CombatState = {
    ...combat,
    yourArmy,
    enemyArmy,
    log,
    slainEnemies: slain,
    actedStackIds,
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

  // Enemy stacks act in board order (as listed in the army). Speed does NOT
  // decide who acts first — speed feeds dodge, not initiative (COMBAT.md §23).
  // The SAME chooseEnemyIntent that produced each telegraph picks the action ->
  // the telegraph is honest.
  const order = livingStacks(next.combat!.enemyArmy).slice();

  for (const planned of order) {
    // MORALE (§24): a per-action roll, drawn only when the enemy army's morale
    // is non-zero. Negative → the stack freezes (lost action); positive → it
    // acts, then has a chance at one immediate extra action.
    const morale = next.combat!.enemyArmy.morale ?? 0;
    const mrng = combatRng(next).fork(`morale:enemy:${next.combat!.round}:${planned.id}`);
    if (morale < 0 && mrng.next() < moraleChance(morale)) {
      const c = next.combat!;
      next = { ...next, combat: { ...c, log: [...c.log, `${planned.name} is unnerved and holds.`] } };
      continue;
    }
    next = enemyAct(next, planned.id);
    // settleCombat nulls `combat` on a win; a loss leaves combat with outcome.
    if (!next.combat || next.combat.outcome !== "ongoing") break;
    if (morale > 0 && mrng.next() < moraleChance(morale)) {
      const c = next.combat!;
      next = { ...next, combat: { ...c, log: [...c.log, `${planned.name}'s morale grants a bonus action!`] } };
      next = enemyAct(next, planned.id);
      if (!next.combat || next.combat.outcome !== "ongoing") break;
    }
  }

  // Combat resolved (won -> combat null & outcome set; lost -> outcome 'lost').
  // The accumulated lastEvents survive on `next` for the UI to play out.
  if (!next.combat || next.combat.outcome !== "ongoing") return next;

  const turnEvents = next.lastEvents ?? [];

  // New round: increment, reset retaliation, refresh telegraphs, hand back.
  const combat2 = next.combat;
  const enemyArmy = {
    ...combat2.enemyArmy,
    stacks: combat2.enemyArmy.stacks.map((s) => ({
      ...s,
      hasRetaliated: false,
      retaliationsUsed: 0,
      isDefending: false,
    })),
  };
  const yourArmy = {
    ...combat2.yourArmy,
    stacks: combat2.yourArmy.stacks.map((s) => ({
      ...s,
      hasRetaliated: false,
      retaliationsUsed: 0,
    })),
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
  const res = resolveAttack(actor, target, NULL_HERO, run.hero, rng, combat.enemyArmy.luck ?? 0);
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

/**
 * PLAYTEST: instantly win the current combat. Zeroes every enemy stack and
 * credits the slain ledger as if you'd killed them, so necromancy, XP, and
 * rewards all fire normally — then runs the standard settle path (which also
 * advances the act on a boss). No-op outside an ongoing combat.
 */
export function winCombatNow(run: RunState): RunState {
  const combat = run.combat;
  if (!combat || combat.outcome !== "ongoing") return run;
  const slain = { ...combat.slainEnemies };
  for (const s of combat.enemyArmy.stacks) {
    if (s.count > 0) slain[s.sourceId] = (slain[s.sourceId] ?? 0) + s.count;
  }
  const enemyArmy = {
    ...combat.enemyArmy,
    stacks: combat.enemyArmy.stacks.map((s) => ({ ...s, count: 0, hpTop: 0 })),
  };
  return checkCombatEnd({ ...run, combat: { ...combat, enemyArmy, slainEnemies: slain } });
}

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

// ===========================================================================
// HERO XP & LEVELING (COMBAT.md §26)
// ===========================================================================

/** XP to advance FROM level L to L+1 = `L * LEVEL_XP_BASE` (a gentle ramp). */
export const LEVEL_XP_BASE = 100;
/** XP earned per point of slain-enemy maxHp in a won battle. */
export const XP_PER_SLAIN_HP = 1;

/** Total maxHp of the creatures slain this battle (shared with necromancy). */
function slainHp(combat: CombatState): number {
  let hp = 0;
  for (const [sourceId, n] of Object.entries(combat.slainEnemies)) {
    const c = creatureById(sourceId);
    if (c) hp += c.hp * n;
  }
  return hp;
}

/** Stat-gain priority on level-up: casters grow Power/Knowledge first, might
 *  heroes Attack/Defense, inferred from the hero's starting primaries. */
function levelPriority(hero: Hero): PrimaryStat[] {
  const martial = hero.baseAttack + hero.baseDefense;
  const arcane = hero.basePower + hero.baseKnowledge;
  return arcane > martial
    ? ["power", "knowledge", "attack", "defense"]
    : ["attack", "defense", "power", "knowledge"];
}

/** Add XP and apply any level-ups: each level grants +1 to a primary (class-
 *  weighted, deterministic). Bumps BASE stats, then `recomputeHero` refreshes
 *  live primaries + maxMana. */
export function awardXp(hero: Hero, amount: number): Hero {
  if (amount <= 0) return hero;
  let level = hero.level;
  let xp = hero.xp + amount;
  const priority = levelPriority(hero);
  const base: Record<PrimaryStat, number> = {
    attack: hero.baseAttack,
    defense: hero.baseDefense,
    power: hero.basePower,
    knowledge: hero.baseKnowledge,
  };
  let leveled = false;
  while (xp >= level * LEVEL_XP_BASE) {
    xp -= level * LEVEL_XP_BASE;
    level += 1;
    base[priority[(level - 2) % priority.length]] += 1; // level 2 -> priority[0]
    leveled = true;
  }
  if (!leveled) return { ...hero, xp };
  return recomputeHero({
    ...hero,
    level,
    xp,
    baseAttack: base.attack,
    baseDefense: base.defense,
    basePower: base.power,
    baseKnowledge: base.knowledge,
  });
}

/** The final act (run is won by beating its boss). */
const MAX_ACT = ACT_WEEKS.length;

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
    .map((s) => ({ ...s, isDefending: false, hasRetaliated: false, retaliationsUsed: 0, hasActed: false }));

  // Hero XP for the win (every battle, scaled by what fell).
  const hero = awardXp(run.hero, slainHp(combat) * XP_PER_SLAIN_HP);

  // Tier-unlock (§28): beating a TOUGH guard (silver+ ring) or a boss unlocks the
  // next creature tier, capped by the act.
  const tough = node.tough || node.type === "boss";
  const unlockedTier = tough
    ? Math.min(run.unlockedTier + 1, tierCapForAct(run.act))
    : run.unlockedTier;

  let next: RunState = {
    ...run,
    hero,
    unlockedTier,
    army: survivors,
    clearedNodeIds: [...run.clearedNodeIds, node.id],
    combat: null,
  };

  if (node.type === "boss") {
    // Beating the final act's boss wins the run; otherwise climb into the next,
    // shorter + denser act with a fresh map (army/hero/gold/XP carry over).
    if (run.act >= MAX_ACT) {
      next.outcome = "won";
      return next;
    }
    const nextAct = run.act + 1;
    return {
      ...next,
      act: nextAct,
      map: buildMap(run.seed, nextAct),
      currentNodeId: null,
      clearedNodeIds: [],
      pendingRewards: null,
    };
  }

  // Necromancy raise, then CLAIM THE TILE this guard was protecting (§27): stat/
  // xp/gold/mana/rest apply now; a shop tile opens its offer screen.
  next = applyNecromancy(next, combat);
  next = claimTile(next, node, makeRng(run.seed).fork(`tile:${node.id}`));
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

/** PLAYTEST cheats (mutable so balance tests can measure true difficulty at 1×).
 *  `goldMult` multiplies tile gold (§27 gold tiles). Reset to 1 to ship. */
export const PLAYTEST = { goldMult: 10 };

// --- node reward rolls ---

function rollDwelling(run: RunState, rng: Rng): RewardChoice[] {
  // Dwellings recruit the PLAYER'S OWN faction (you grow your army). Falls back
  // to the default faction's pool for legacy runs with no faction set.
  const faction = run.faction ?? run.hero.faction ?? DEFAULT_FACTION;
  // Only UNLOCKED tiers are recruitable (§28).
  const cap = run.unlockedTier;
  const factionPool = basePool(faction).filter((c) => c.tier <= cap);
  const pool = factionPool.length ? factionPool : BASE_CREATURES.filter((c) => c.tier <= cap);
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

  // --- Weekly muster (§25): a multi-buy shop. Buying re-offers the muster;
  //     "march on" (skip) closes it and resolves the deferred Monday node. ---
  if (run.pendingMusterNodeId) {
    if (choice.kind === "muster") {
      const reinforced = applyMuster(run, choice);
      return { ...reinforced, pendingRewards: rollMuster(reinforced) };
    }
    if (choice.kind === "recruit") {
      // Recruit a new stack at the muster, then re-offer (stay mustering).
      const recruited = recruit(run, choice.creatureId, choice.count, choice.cost);
      return { ...recruited, pendingRewards: rollMuster(recruited) };
    }
    // March on: resolve the stashed node now (same rng fork chooseNode would use).
    const nodeId = run.pendingMusterNodeId;
    const node = run.map.find((n) => n.id === nodeId)!;
    const rng = makeRng(run.seed).fork(`node:${nodeId}`);
    const entered: RunState = { ...run, pendingRewards: null, pendingMusterNodeId: null };
    return resolveNodeEffects(entered, node, rng);
  }

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
    case "muster":
      // Musters are handled in `pickReward` (multi-buy re-offer), never here.
      return applyMuster(run, choice);
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

// Re-export content arrays + lookups for the app/Codex + hero selection.
export {
  ALL_CREATURES,
  ALL_BASE_CREATURES,
  ARTIFACTS,
  CREATURES,
  SPELLS,
  creatureById,
  spellById,
  artifactById,
  heroById,
  basePool,
};
// Faction/hero selection surface for the TitleScreen (re-exported from content).
export {
  FACTIONS,
  DEFAULT_FACTION,
  PLAYABLE_HEROES,
  HEROES,
  DEFAULT_HERO,
  heroesOfFaction,
  creaturesOfFaction,
} from "./content";
