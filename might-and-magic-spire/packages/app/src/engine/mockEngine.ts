// Fixture-backed ARMY engine implementing the pinned runtime contract.
//
// This lets the app be developed and tested NOW, before the rebuilt army
// @mms/engine ships. It is a faithful-enough HoMM3-with-one-hero loop: a
// branching act map with dwelling/altar/shrine/merchant/rest rows, a Galthran-
// like hero (Attack/Defense/Power/Knowledge + mana + one equipped artifact + a
// small spellbook), a starting army of creature STACKS across two ranks, and
// side-alternation combat — you command each living stack once (attack/defend),
// cast <=1 hero spell, then watch the enemy army act on its honest telegraph.
// Simple but real damage (count × avg damage × A/D factor) with kill/chip on
// count+hpTop, one retaliation per melee defender per round, and the no-town
// growth economy (recruit/upgrade/learn/buy/raise/equip).
//
// It pulls REAL @mms/data content (stats + art refs) so portraits resolve and
// the Codex stays consistent. At integration this file is dropped in favour of
// the real engine; see ./index.ts for the swap seam. Determinism via mulberry32.
import {
  creatures as srcCreatures,
  artifacts as srcArtifacts,
  spells as srcSpells,
  heroes as srcHeroes,
} from '@mms/data';
import type {
  DamageForecast,
  ArtifactSlot,
  CombatSpell,
  CommandOrder,
  Equipment,
  Hero,
  EngineApi,
  EngineRewardSource,
  MapNode,
  NodeType,
  RewardChoice,
  RunState,
  SpellSchool,
  SpellTargeting,
  Stack,
  Telegraph,
} from './contract';

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so a seed yields a reproducible run.
// ---------------------------------------------------------------------------
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// The mock stores rolled node offers on `run.pendingRewards` — the SAME field
// the real engine uses (an additive field; the pinned app-contract RunState is a
// subset, so this is harmless). Storing them here means the live seam's
// pendingRewards() resolves them identically whether the run was built by the
// mock or the real engine. The node screens render and dispatch against them.
type RunWithPending = RunState & { pendingRewards?: RewardChoice[] | null };
function setPending(run: RunState, rewards: RewardChoice[] | null): void {
  (run as RunWithPending).pendingRewards = rewards;
}
function getPending(run: RunState): RewardChoice[] | null {
  return (run as RunWithPending).pendingRewards ?? null;
}

// ---------------------------------------------------------------------------
// Content adapters — turn @mms/data records into army-contract objects.
// ---------------------------------------------------------------------------
type SrcCreature = (typeof srcCreatures)[number];

const creatureById = new Map(srcCreatures.map((c) => [c.id, c]));

function rankFor(c: SrcCreature): 'front' | 'back' {
  return c.abilities.some((a) => /Ranged|Shooter/i.test(a)) ? 'back' : 'front';
}

let stackSeq = 0;
function adaptStack(c: SrcCreature, count: number, side: 'player' | 'enemy'): Stack {
  return {
    id: `stk_${side}_${c.id}_${stackSeq++}`,
    creatureId: c.id,
    name: c.name,
    tier: c.tier,
    count,
    hpTop: c.hp,
    maxHpPer: c.hp,
    attack: c.attack,
    defense: c.defense,
    damageMin: c.damageMin,
    damageMax: c.damageMax,
    speed: c.speed,
    rank: rankFor(c),
    abilities: [...c.abilities],
    side,
    hasActed: false,
    isDefending: false,
    hasRetaliated: false,
    imageRef: c.imageRef,
  };
}

function artifactRarity(klass: string): Equipment['rarity'] {
  switch (klass) {
    case 'Treasure':
      return 'common';
    case 'Minor':
      return 'uncommon';
    case 'Major':
      return 'rare';
    default:
      return 'relic';
  }
}

type SrcArtifact = (typeof srcArtifacts)[number];
function adaptEquipment(a: SrcArtifact): Equipment {
  return {
    id: a.id,
    name: a.name,
    slot: a.slot as ArtifactSlot,
    rarity: artifactRarity((a as { class?: string }).class ?? 'Treasure'),
    bonuses: a.bonuses,
    imageRef: a.imageRef,
  };
}

type SrcSpell = (typeof srcSpells)[number];
function spellTargeting(s: SrcSpell): SpellTargeting {
  const tags = s.effectTags;
  const heals = tags.some((t) => /heal|resurrect/.test(t));
  if (tags.some((t) => /all-units/.test(t))) return 'allEnemies';
  if (tags.some((t) => /area|multi-target|chain/.test(t))) return 'allEnemies';
  if (heals || tags.some((t) => /buff/.test(t))) return 'allyStack';
  if (tags.some((t) => /damage|debuff|disable/.test(t))) return 'enemyStack';
  return 'none';
}

function adaptSpell(s: SrcSpell): CombatSpell {
  return {
    id: s.id,
    name: s.name,
    school: s.school as SpellSchool,
    level: s.level,
    manaCost: s.manaCost,
    description: s.description,
    targeting: spellTargeting(s),
    imageRef: s.imageRef,
  };
}

// ---------------------------------------------------------------------------
// Hero — a Galthran-like Death Knight: A/D/P/K, mana 10, a few spells, one
// equipped artifact. Derived from the real hero record + content.
// ---------------------------------------------------------------------------
function makeHero(heroId?: string): Hero {
  const src =
    (heroId ? srcHeroes.find((h) => h.id === heroId) : undefined) ??
    srcHeroes.find((h) => h.id === 'hero_galthran') ??
    srcHeroes[0];
  const isNecro = src.faction === 'Necropolis';
  // Necromancy is skill-gated; only Necropolis (necromancer) heroes carry it.
  const starterSpellIds = isNecro
    ? ['spell_magic_arrow', 'spell_death_ripple', 'spell_slow']
    : ['spell_magic_arrow', 'spell_bless', 'spell_haste'];
  const spellbook = starterSpellIds
    .map((id) => srcSpells.find((s) => s.id === id))
    .filter((s): s is SrcSpell => !!s)
    .map(adaptSpell);
  const axe = srcArtifacts.find((a) => a.id === 'artifact_sword_of_hellfire');
  const equipment: Hero['equipment'] = {};
  if (axe) equipment[axe.slot as ArtifactSlot] = adaptEquipment(axe);
  const skills: Record<string, number> = {};
  for (const s of (src as { startingSkills?: string[] }).startingSkills ?? []) skills[s] = 1;
  return {
    id: src.id,
    name: src.name,
    heroClass: src.heroClass,
    specialty: src.specialty,
    faction: src.faction,
    attack: 2,
    defense: 2,
    power: 1,
    knowledge: 2,
    mana: 10,
    maxMana: 10,
    equipment,
    spellbook,
    skills: Object.keys(skills).length ? skills : { Necromancy: 1, Offense: 1 },
    imageRef: src.imageRef,
  };
}

/** A faction-appropriate starting army from the faction's base creatures
 *  (lowest three tiers), so a non-Necropolis hero starts with its own roster. */
function startingArmy(heroId?: string): Stack[] {
  stackSeq = 0;
  const src =
    (heroId ? srcHeroes.find((h) => h.id === heroId) : undefined) ??
    srcHeroes.find((h) => h.id === 'hero_galthran') ??
    srcHeroes[0];
  const faction = src.faction;
  if (faction === 'Necropolis') {
    // Preserve the legacy Necropolis starting army (back-compat for app tests).
    const skel = creatureById.get('necropolis_skeleton')!;
    const lich = creatureById.get('necropolis_lich')!;
    const walking = creatureById.get('necropolis_walking_dead')!;
    return [
      adaptStack(skel, 40, 'player'),
      adaptStack(walking, 12, 'player'),
      adaptStack(lich, 4, 'player'),
    ];
  }
  const base = srcCreatures
    .filter((c) => c.faction === faction && !c.upgraded)
    .sort((a, b) => a.tier - b.tier);
  const counts = [40, 12, 4];
  return base.slice(0, 3).map((c, i) => adaptStack(c, counts[i] ?? 4, 'player'));
}

// ---------------------------------------------------------------------------
// Map generation — a small branching act with the new node rows, ending boss.
// ---------------------------------------------------------------------------
const ROW_TYPES: NodeType[][] = [
  ['combat', 'combat'],
  ['dwelling', 'combat'],
  ['altar', 'shrine'],
  ['combat', 'merchant'],
  ['elite', 'rest'],
  ['shrine', 'dwelling'],
  ['boss'],
];

function buildMap(rng: () => number): MapNode[] {
  const nodes: MapNode[] = [];
  const byRow: string[][] = [];
  ROW_TYPES.forEach((types, row) => {
    const ids: string[] = [];
    types.forEach((type, col) => {
      const id = `n${row}_${col}`;
      ids.push(id);
      nodes.push({ id, type, row, col, next: [] });
    });
    byRow.push(ids);
  });
  const node = (id: string) => nodes.find((n) => n.id === id)!;
  const pick = <T,>(arr: T[]): T =>
    arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

  for (let row = 0; row < byRow.length - 1; row++) {
    const cur = byRow[row];
    const nxt = byRow[row + 1];
    cur.forEach((id) => {
      const target = pick(nxt);
      node(id).next = [target];
      if (nxt.length > 1 && rng() > 0.5) {
        const alt = nxt.find((t) => t !== target);
        if (alt) node(id).next.push(alt);
      }
    });
    nxt.forEach((tid) => {
      if (!cur.some((id) => node(id).next.includes(tid))) {
        node(pick(cur)).next.push(tid);
      }
    });
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Enemy army composition per node type.
// ---------------------------------------------------------------------------
function spawnEnemyArmy(type: NodeType, rng: () => number): Stack[] {
  stackSeq = 1000;
  const mk = (id: string, count: number) =>
    adaptStack(creatureById.get(id)!, count, 'enemy');
  switch (type) {
    case 'boss':
      return [
        mk('necropolis_black_knight', 3),
        mk('necropolis_power_lich', 6),
        mk('necropolis_bone_dragon', 1),
      ];
    case 'elite':
      return [
        mk('necropolis_vampire', rngInt(rng, 4, 6)),
        mk('necropolis_wight', rngInt(rng, 6, 9)),
      ];
    default:
      return [
        mk('necropolis_skeleton', rngInt(rng, 20, 30)),
        mk('necropolis_zombie', rngInt(rng, 8, 12)),
      ];
  }
}

// ---------------------------------------------------------------------------
// Combat math.
// ---------------------------------------------------------------------------
function effAttack(stack: Stack, hero: Hero): number {
  return stack.attack + hero.attack;
}
function effDefense(stack: Stack, hero: Hero): number {
  const base = stack.defense + hero.defense;
  return stack.isDefending ? base + Math.round(stack.defense * 0.2) + 1 : base;
}

// total hp pool of a stack = top creature's remaining + full creatures behind.
function poolHp(stack: Stack): number {
  return stack.hpTop + (stack.count - 1) * stack.maxHpPer;
}

// Apply `dmg` to a stack, recomputing count + hpTop. Returns creatures killed.
function applyDamage(stack: Stack, dmg: number): number {
  const before = stack.count;
  const remaining = poolHp(stack) - dmg;
  if (remaining <= 0) {
    stack.count = 0;
    stack.hpTop = 0;
    return before;
  }
  const count = Math.ceil(remaining / stack.maxHpPer);
  const hpTop = remaining - (count - 1) * stack.maxHpPer;
  stack.count = count;
  stack.hpTop = hpTop;
  return before - count;
}

function damageOf(
  attacker: Stack,
  defender: Stack,
  attackerHero: Hero,
  defenderHero: Hero,
  rng: () => number,
): number {
  const perCreature = rngInt(rng, attacker.damageMin, attacker.damageMax);
  const base = attacker.count * perCreature;
  const diff = effAttack(attacker, attackerHero) - effDefense(defender, defenderHero);
  const factor =
    diff >= 0 ? 1 + Math.min(diff * 0.05, 3.0) : 1 - Math.min(-diff * 0.025, 0.7);
  return Math.max(1, Math.round(base * factor));
}

function isShooter(s: Stack): boolean {
  return s.abilities.some((a) => /Ranged|Shooter/i.test(a));
}
function noRetaliation(s: Stack): boolean {
  return s.abilities.some((a) => /No enemy retaliation/i.test(a));
}

function aliveStacks(army: Stack[]): Stack[] {
  return army.filter((s) => s.count > 0);
}

// Two-rank reach: melee may hit the front rank until it's empty, then back.
// Shooters (and the hero spells) may hit any rank.
function legalMeleeTargets(enemyAlive: Stack[]): Stack[] {
  const front = enemyAlive.filter((s) => s.rank === 'front');
  return front.length > 0 ? front : enemyAlive;
}

// ---------------------------------------------------------------------------
// Enemy AI telegraph — honest: the same plan is shown and executed.
// ---------------------------------------------------------------------------
function planTelegraph(
  attacker: Stack,
  playerAlive: Stack[],
): Telegraph {
  if (playerAlive.length === 0) return { kind: 'wait', label: 'Wait' };
  const shooter = isShooter(attacker);
  const reachable = shooter ? playerAlive : legalMeleeTargets(playerAlive);
  // target the player stack with the lowest remaining pool (a clean kill).
  const target = [...reachable].sort((a, b) => poolHp(a) - poolHp(b))[0];
  const avg = Math.round((attacker.damageMin + attacker.damageMax) / 2) * attacker.count;
  return {
    kind: shooter ? 'shoot' : 'attack',
    value: avg,
    targetStackId: target.id,
    label: `${shooter ? 'Shoot' : 'Attack'} ${target.name}`,
  };
}

function refreshTelegraphs(combat: RunState['combat'], hero: Hero): void {
  if (!combat) return;
  const playerAlive = aliveStacks(combat.yourArmy.stacks);
  for (const e of aliveStacks(combat.enemyArmy.stacks)) {
    e.telegraph = planTelegraph(e, playerAlive);
  }
  void hero;
}

// ---------------------------------------------------------------------------
// Spell resolution (mock): a couple of representative effects.
// ---------------------------------------------------------------------------
function resolveSpell(
  combat: NonNullable<RunState['combat']>,
  hero: Hero,
  spell: CombatSpell,
  targetId: string | undefined,
  rng: () => number,
): void {
  const power = hero.power;
  const enemyAlive = aliveStacks(combat.enemyArmy.stacks);
  const dmgBase = (spell.level + 1) * 6 + power * 4;
  const apply = (s: Stack, amount: number) => {
    const killed = applyDamage(s, amount);
    combat.log.push(
      `${hero.name} casts ${spell.name} on ${s.name} (${amount} dmg${killed ? `, ${killed} slain` : ''}).`,
    );
  };
  switch (spell.targeting) {
    case 'allEnemies':
      for (const s of enemyAlive) apply(s, Math.round(dmgBase * 0.6));
      break;
    case 'enemyStack': {
      const t = enemyAlive.find((s) => s.id === targetId) ?? enemyAlive[0];
      if (t) apply(t, dmgBase);
      break;
    }
    case 'allyStack': {
      const t = aliveStacks(combat.yourArmy.stacks).find((s) => s.id === targetId);
      // mock "buff/heal": top up the lead creature a little.
      if (t) {
        t.hpTop = Math.min(t.maxHpPer, t.hpTop + Math.round(dmgBase * 0.5));
        combat.log.push(`${hero.name} casts ${spell.name} on ${t.name}.`);
      }
      break;
    }
    default:
      combat.log.push(`${hero.name} casts ${spell.name}.`);
  }
  void rng;
}

// ---------------------------------------------------------------------------
// Combat lifecycle.
// ---------------------------------------------------------------------------
function startCombat(
  army: Stack[],
  type: NodeType,
  rng: () => number,
  hero: Hero,
): NonNullable<RunState['combat']> {
  const yourStacks = clone(army).map((s) => ({
    ...s,
    hasActed: false,
    isDefending: false,
    hasRetaliated: false,
  }));
  const enemyStacks = spawnEnemyArmy(type, rng);
  const combat: NonNullable<RunState['combat']> = {
    round: 1,
    whoseTurn: 'player',
    yourArmy: { stacks: yourStacks, side: 'player' },
    enemyArmy: { stacks: enemyStacks, side: 'enemy' },
    spellCastThisTurn: false,
    log: ['The dead rise. Battle is joined.'],
    outcome: 'ongoing',
  };
  refreshTelegraphs(combat, hero);
  return combat;
}

function checkOutcome(
  combat: NonNullable<RunState['combat']>,
): 'ongoing' | 'won' | 'lost' {
  const youAlive = aliveStacks(combat.yourArmy.stacks).length > 0;
  const enemyAlive = aliveStacks(combat.enemyArmy.stacks).length > 0;
  if (!enemyAlive) combat.outcome = 'won';
  else if (!youAlive) combat.outcome = 'lost';
  return combat.outcome;
}

// Sync the persistent army roster from the surviving combat stacks (attrition).
function syncArmyFromCombat(run: RunState): void {
  if (!run.combat) return;
  run.army = aliveStacks(run.combat.yourArmy.stacks).map((s) => ({
    ...s,
    hasActed: false,
    isDefending: false,
    hasRetaliated: false,
    telegraph: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Node offer rolls (deterministic) — mirror the real engine's pendingRewards
// shapes so the screens render the same kinds of offers under either engine.
// ---------------------------------------------------------------------------
const BASE_CREATURES = srcCreatures.filter(
  (c) => c.faction === 'Necropolis' && !c.upgraded,
);

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function rollDwelling(run: RunState, rng: () => number): RewardChoice[] {
  // Recruit offers from the PLAYER'S faction roster (you grow your own army).
  const faction = run.faction ?? run.hero.faction ?? 'Necropolis';
  const factionBase = srcCreatures.filter((c) => c.faction === faction && !c.upgraded);
  const pool = (factionBase.length ? factionBase : BASE_CREATURES).filter((c) => c.tier <= 5);
  const out: RewardChoice[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const c = pick(pool, rng);
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const count = rngInt(rng, 3, 8);
    out.push({ kind: 'recruit', creatureId: c.id, count, cost: dwellingCost(c.tier) * count });
  }
  out.push({ kind: 'skip' });
  return out;
}

function rollAltar(run: RunState, _rng: () => number): RewardChoice[] {
  const out: RewardChoice[] = [];
  for (const s of run.army) {
    const up = srcCreatures.find((c) => c.upgradeOf === s.creatureId);
    if (up) out.push({ kind: 'upgrade', stackId: s.id, toCreatureId: up.id, cost: upgradeCost(run, s.id) });
  }
  out.push({ kind: 'skip' });
  return out;
}

function rollShrine(run: RunState, rng: () => number): RewardChoice[] {
  const known = new Set(run.hero.spellbook.map((s) => s.id));
  const pool = srcSpells.filter((s) => s.isCombat && !known.has(s.id));
  if (pool.length === 0) return [{ kind: 'skip' }];
  const out: RewardChoice[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const s = pick(pool, rng);
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ kind: 'learn', spellId: s.id, cost: s.manaCost * 8 });
  }
  out.push({ kind: 'skip' });
  return out;
}

function rollMerchant(rng: () => number): RewardChoice[] {
  const out: RewardChoice[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3 && srcArtifacts.length > 0; i++) {
    const a = pick(srcArtifacts as SrcArtifact[], rng);
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ kind: 'buy', artifactId: a.id, slot: a.slot as ArtifactSlot, cost: artifactCost(a.id) });
  }
  out.push({ kind: 'skip' });
  return out;
}

// ---------------------------------------------------------------------------
// The engine implementation.
// ---------------------------------------------------------------------------
class MockEngine implements EngineApi, EngineRewardSource {
  startRun(seed: string, heroId?: string): RunState {
    const rng = mulberry32(hashSeed(seed));
    const map = buildMap(rng);
    const hero = makeHero(heroId);
    return {
      seed,
      faction: hero.faction,
      hero,
      army: startingArmy(heroId),
      gold: 200,
      map,
      currentNodeId: null,
      act: 1,
      combat: null,
      outcome: 'ongoing',
    };
  }

  legalNextNodes(run: RunState): string[] {
    if (run.currentNodeId == null) {
      const minRow = Math.min(...run.map.map((n) => n.row));
      return run.map.filter((n) => n.row === minRow).map((n) => n.id);
    }
    const cur = run.map.find((n) => n.id === run.currentNodeId);
    return cur?.next ?? [];
  }

  chooseNode(run: RunState, nodeId: string): RunState {
    const next = clone(run);
    const node = next.map.find((n) => n.id === nodeId);
    if (!node) return next;
    next.currentNodeId = nodeId;
    setPending(next, null);
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      const rng = mulberry32(hashSeed(run.seed + nodeId));
      next.combat = startCombat(next.army, node.type, rng, next.hero);
    } else {
      // dwelling/altar/shrine/merchant roll their offers into pendingRewards,
      // exactly like the real engine — the node screens render those offers and
      // dispatch the matching op. (rest carries no offers.)
      next.combat = null;
      const rng = mulberry32(hashSeed(run.seed + nodeId + 'offers'));
      if (node.type === 'dwelling') setPending(next, rollDwelling(next, rng));
      else if (node.type === 'altar') setPending(next, rollAltar(next, rng));
      else if (node.type === 'shrine') setPending(next, rollShrine(next, rng));
      else if (node.type === 'merchant') setPending(next, rollMerchant(rng));
    }
    return next;
  }

  // --- combat ---------------------------------------------------------------
  legalTargets(run: RunState, stackId: string): string[] {
    const c = run.combat;
    if (!c || c.outcome !== 'ongoing' || c.whoseTurn !== 'player') return [];
    const stack = c.yourArmy.stacks.find((s) => s.id === stackId);
    if (!stack || stack.count <= 0 || stack.hasActed) return [];
    const enemyAlive = aliveStacks(c.enemyArmy.stacks);
    const reachable = isShooter(stack) ? enemyAlive : legalMeleeTargets(enemyAlive);
    return reachable.map((s) => s.id);
  }

  forecastAttack(run: RunState, attackerStackId: string, targetStackId: string): DamageForecast | null {
    const c = run.combat;
    if (!c || c.outcome !== 'ongoing') return null;
    const a = c.yourArmy.stacks.find((s) => s.id === attackerStackId);
    const t = c.enemyArmy.stacks.find((s) => s.id === targetStackId);
    if (!a || !t || a.count <= 0 || t.count <= 0) return null;
    const diff = effAttack(a, run.hero) - effDefense(t, run.hero);
    const factor = diff >= 0 ? 1 + Math.min(diff * 0.05, 3.0) : 1 - Math.min(-diff * 0.025, 0.7);
    const dMin = Math.max(1, Math.round(a.count * a.damageMin * factor));
    const dMax = Math.max(1, Math.round(a.count * a.damageMax * factor));
    const pool = poolHp(t);
    const killsFor = (d: number) => (d >= pool ? t.count : t.count - Math.ceil((pool - d) / t.maxHpPer));
    return { damageMin: dMin, damageMax: dMax, killsMin: killsFor(dMin), killsMax: killsFor(dMax) };
  }

  commandStack(run: RunState, stackId: string, order: CommandOrder): RunState {
    const next = clone(run);
    const c = next.combat;
    if (!c || c.outcome !== 'ongoing' || c.whoseTurn !== 'player') return next;
    const stack = c.yourArmy.stacks.find((s) => s.id === stackId);
    if (!stack || stack.count <= 0 || stack.hasActed) return next;

    if (order.kind === 'defend') {
      stack.isDefending = true;
      stack.hasActed = true;
      c.log.push(`${stack.name} braces in defense.`);
      return next;
    }

    // attack
    const legal = this.legalTargets(next, stackId);
    const targetId = order.targetId && legal.includes(order.targetId) ? order.targetId : legal[0];
    const target = c.enemyArmy.stacks.find((s) => s.id === targetId);
    if (!target || target.count <= 0) return next;

    const rng = mulberry32(hashSeed(run.seed + 'atk' + c.round + stackId));
    const dmg = damageOf(stack, target, next.hero, next.hero, rng);
    const killed = applyDamage(target, dmg);
    c.log.push(
      `${stack.name} strikes ${target.name} for ${dmg}${killed ? ` (${killed} slain)` : ''}.`,
    );

    // Retaliation: one melee defender hits back once per round, unless suppressed.
    if (
      target.count > 0 &&
      !target.hasRetaliated &&
      !isShooter(stack) &&
      !noRetaliation(stack) &&
      !isShooter(target)
    ) {
      const rdmg = damageOf(target, stack, next.hero, next.hero, mulberry32(hashSeed(run.seed + 'ret' + c.round + targetId)));
      const rkilled = applyDamage(stack, rdmg);
      target.hasRetaliated = true;
      c.log.push(
        `${target.name} retaliates for ${rdmg}${rkilled ? ` (${rkilled} slain)` : ''}.`,
      );
    }

    stack.hasActed = true;
    const result = checkOutcome(c);
    if (result === 'won') {
      this.onCombatWon(next);
    } else if (result === 'lost') {
      next.outcome = 'lost';
    }
    return next;
  }

  castSpell(run: RunState, spellId: string, targetId?: string): RunState {
    const next = clone(run);
    const c = next.combat;
    if (!c || c.outcome !== 'ongoing' || c.whoseTurn !== 'player') return next;
    if (c.spellCastThisTurn) return next;
    const spell = next.hero.spellbook.find((s) => s.id === spellId);
    if (!spell || next.hero.mana < spell.manaCost) return next;

    next.hero.mana -= spell.manaCost;
    c.spellCastThisTurn = true;
    const rng = mulberry32(hashSeed(run.seed + 'spell' + c.round + spellId));
    resolveSpell(c, next.hero, spell, targetId, rng);

    if (checkOutcome(c) === 'won') this.onCombatWon(next);
    return next;
  }

  endPlayerTurn(run: RunState): RunState {
    const next = clone(run);
    const c = next.combat;
    if (!c || c.outcome !== 'ongoing') return next;

    // Enemy army acts in speed order against its honest telegraph.
    c.whoseTurn = 'enemy';
    const actors = aliveStacks(c.enemyArmy.stacks).sort((a, b) => b.speed - a.speed);
    for (const e of actors) {
      if (e.count <= 0) continue;
      const playerAlive = aliveStacks(c.yourArmy.stacks);
      if (playerAlive.length === 0) break;
      // Re-plan against the live board so the executed action stays legal/honest.
      const plan = planTelegraph(e, playerAlive);
      e.telegraph = plan;
      if (plan.kind !== 'attack' && plan.kind !== 'shoot') continue;
      const target =
        playerAlive.find((s) => s.id === plan.targetStackId) ?? playerAlive[0];
      const rng = mulberry32(hashSeed(run.seed + 'enemy' + c.round + e.id));
      const dmg = damageOf(e, target, next.hero, next.hero, rng);
      const killed = applyDamage(target, dmg);
      c.log.push(
        `${e.name} ${plan.kind === 'shoot' ? 'shoots' : 'hits'} ${target.name} for ${dmg}${killed ? ` (${killed} slain)` : ''}.`,
      );
      // Retaliation from the player's struck melee stack.
      if (
        target.count > 0 &&
        !target.hasRetaliated &&
        plan.kind === 'attack' &&
        !noRetaliation(e) &&
        !isShooter(target)
      ) {
        const rdmg = damageOf(target, e, next.hero, next.hero, mulberry32(hashSeed(run.seed + 'pret' + c.round + e.id)));
        const rkilled = applyDamage(e, rdmg);
        target.hasRetaliated = true;
        c.log.push(
          `${target.name} retaliates for ${rdmg}${rkilled ? ` (${rkilled} slain)` : ''}.`,
        );
      }
      if (checkOutcome(c) !== 'ongoing') break;
    }

    const result = checkOutcome(c);
    if (result === 'lost') {
      next.outcome = 'lost';
      return next;
    }
    if (result === 'won') {
      this.onCombatWon(next);
      return next;
    }

    // New round: reset acted/defend/retaliation/spell, refresh telegraphs.
    c.round += 1;
    c.whoseTurn = 'player';
    c.spellCastThisTurn = false;
    next.hero.mana = Math.min(next.hero.maxMana, next.hero.mana + 1);
    for (const s of c.yourArmy.stacks) {
      s.hasActed = false;
      s.isDefending = false;
      s.hasRetaliated = false;
    }
    for (const e of c.enemyArmy.stacks) e.hasRetaliated = false;
    refreshTelegraphs(c, next.hero);
    return next;
  }

  // --- node interactions ----------------------------------------------------
  pickReward(run: RunState, choice: RewardChoice): RunState {
    switch (choice.kind) {
      case 'recruit':
        return this.finishNode(this.applyRecruit(run, choice.creatureId, choice.count, choice.cost));
      case 'upgrade':
        return this.finishNode(this.applyUpgrade(run, choice.stackId, choice.cost));
      case 'learn':
        return this.finishNode(this.applyLearn(run, choice.spellId, choice.cost));
      case 'buy':
        return this.finishNode(this.applyBuy(run, choice.artifactId, choice.cost));
      case 'raise': {
        const next = this.applyRaise(run, choice.creatureId, choice.count);
        return this.finishNode(next);
      }
      case 'gold': {
        const next = clone(run);
        next.gold += choice.amount;
        return this.finishNode(next);
      }
      case 'skip':
        return this.finishNode(clone(run));
    }
  }

  recruit(run: RunState, creatureId: string, count: number): RunState {
    const c = creatureById.get(creatureId);
    if (!c) return run;
    return this.finishNode(this.applyRecruit(run, creatureId, count, dwellingCost(c.tier) * count));
  }

  upgrade(run: RunState, stackId: string): RunState {
    return this.finishNode(this.applyUpgrade(run, stackId, upgradeCost(run, stackId)));
  }

  learn(run: RunState, spellId: string): RunState {
    const s = srcSpells.find((x) => x.id === spellId);
    return this.finishNode(this.applyLearn(run, spellId, s ? s.manaCost * 8 : 60));
  }

  buy(run: RunState, artifactId: string): RunState {
    return this.finishNode(this.applyBuy(run, artifactId, artifactCost(artifactId)));
  }

  equipArtifact(run: RunState, artifactId: string, slot: ArtifactSlot): RunState {
    const next = clone(run);
    const owned = ownedArtifacts(next).find((a) => a.id === artifactId);
    if (!owned) return next;
    next.hero.equipment[slot] = owned;
    return next;
  }

  // --- reward introspection -------------------------------------------------
  pendingRewards(run: RunState): RewardChoice[] | null {
    const node = run.map.find((n) => n.id === run.currentNodeId);
    if (!node) return null;
    if (run.combat && run.combat.outcome === 'won') {
      // Necromancy raise after a battle won + standard gold spoils.
      const raised = necromancyRaise(run);
      const choices: RewardChoice[] = [];
      if (raised > 0) choices.push({ kind: 'raise', creatureId: 'necropolis_skeleton', count: raised });
      choices.push({ kind: 'gold', amount: node.type === 'boss' ? 300 : node.type === 'elite' ? 120 : 60 });
      choices.push({ kind: 'skip' });
      return choices;
    }
    if (node.type === 'rest') {
      return [{ kind: 'gold', amount: 40 }, { kind: 'skip' }];
    }
    // dwelling/altar/shrine/merchant surface their rolled offers (set by
    // chooseNode); the node screens render and dispatch against these.
    return getPending(run);
  }

  legalSpellTargets(run: RunState, spellId: string): string[] {
    const c = run.combat;
    if (!c || c.outcome !== 'ongoing') return [];
    const spell = run.hero.spellbook.find((s) => s.id === spellId);
    if (!spell) return [];
    if (spell.targeting === 'enemyStack') return aliveStacks(c.enemyArmy.stacks).map((s) => s.id);
    if (spell.targeting === 'allyStack') return aliveStacks(c.yourArmy.stacks).map((s) => s.id);
    return [];
  }

  // --- internals ------------------------------------------------------------
  private finishNode(run: RunState): RunState {
    const wasBoss = run.map.find((n) => n.id === run.currentNodeId)?.type === 'boss';
    if (run.combat) syncArmyFromCombat(run);
    run.currentNodeId = null;
    run.combat = null;
    setPending(run, null);
    if (wasBoss) run.outcome = 'won';
    return run;
  }

  private onCombatWon(run: RunState): void {
    // Attrition carries forward: persist surviving stacks to the roster.
    syncArmyFromCombat(run);
  }

  private applyRecruit(run: RunState, creatureId: string, count: number, cost: number): RunState {
    const next = clone(run);
    if (next.gold < cost) return next;
    const c = creatureById.get(creatureId);
    if (!c) return next;
    next.gold -= cost;
    const existing = next.army.find((s) => s.creatureId === creatureId);
    if (existing) {
      existing.count += count;
    } else {
      next.army.push(adaptStack(c, count, 'player'));
    }
    return next;
  }

  private applyUpgrade(run: RunState, stackId: string, cost: number): RunState {
    const next = clone(run);
    if (next.gold < cost) return next;
    const stack = next.army.find((s) => s.id === stackId);
    if (!stack) return next;
    const up = srcCreatures.find((c) => c.upgradeOf === stack.creatureId);
    if (!up) return next;
    next.gold -= cost;
    const upgraded = adaptStack(up, stack.count, 'player');
    upgraded.id = stack.id; // preserve identity
    // carry partial top-hp proportionally
    upgraded.hpTop = Math.min(upgraded.maxHpPer, stack.hpTop);
    const idx = next.army.findIndex((s) => s.id === stackId);
    next.army[idx] = upgraded;
    return next;
  }

  private applyLearn(run: RunState, spellId: string, cost: number): RunState {
    const next = clone(run);
    if (next.gold < cost) return next;
    if (next.hero.spellbook.some((s) => s.id === spellId)) return next;
    const s = srcSpells.find((x) => x.id === spellId);
    if (!s) return next;
    next.gold -= cost;
    next.hero.spellbook.push(adaptSpell(s));
    return next;
  }

  private applyBuy(run: RunState, artifactId: string, cost: number): RunState {
    const next = clone(run);
    if (next.gold < cost) return next;
    const a = srcArtifacts.find((x) => x.id === artifactId);
    if (!a) return next;
    if (ownedArtifacts(next).some((e) => e.id === artifactId)) return next;
    next.gold -= cost;
    const eq = adaptEquipment(a);
    // auto-equip into its slot if empty, else stash in Misc-style overflow via
    // equipment under its own slot (mock keeps it simple: occupy the slot).
    if (!next.hero.equipment[eq.slot]) {
      next.hero.equipment[eq.slot] = eq;
    } else {
      // overflow: keep it in a side bag the UI can offer to equip later.
      (next as RunState & { _bag?: Equipment[] })._bag =
        ((next as RunState & { _bag?: Equipment[] })._bag ?? []).concat(eq);
    }
    return next;
  }

  private applyRaise(run: RunState, creatureId: string, count: number): RunState {
    const next = clone(run);
    const c = creatureById.get(creatureId);
    if (!c || count <= 0) return next;
    const existing = next.army.find((s) => s.creatureId === creatureId);
    if (existing) existing.count += count;
    else next.army.push(adaptStack(c, count, 'player'));
    return next;
  }
}

// ---------------------------------------------------------------------------
// Economy helpers + content registries surfaced for node screens.
// ---------------------------------------------------------------------------
export function dwellingCost(tier: number): number {
  return [0, 8, 14, 25, 40, 70, 120, 200][tier] ?? 50;
}
export function upgradeCost(run: RunState, stackId: string): number {
  const stack = run.army.find((s) => s.id === stackId);
  if (!stack) return 0;
  const up = srcCreatures.find((c) => c.upgradeOf === stack.creatureId);
  if (!up) return 0;
  return Math.round(dwellingCost(stack.tier) * 0.6 * stack.count);
}
export function artifactCost(artifactId: string): number {
  const a = srcArtifacts.find((x) => x.id === artifactId);
  if (!a) return 100;
  const klass = (a as { class?: string }).class ?? 'Treasure';
  return { Treasure: 60, Minor: 110, Major: 180, Relic: 300 }[klass] ?? 100;
}

export function ownedArtifacts(run: RunState): Equipment[] {
  const equipped = Object.values(run.hero.equipment).filter((e): e is Equipment => !!e);
  const bag = (run as RunState & { _bag?: Equipment[] })._bag ?? [];
  return [...equipped, ...bag];
}

// Necromancy: a fraction of the battle's slain return as skeletons. The mock
// estimates the haul deterministically from the enemy army's total hp pool and
// the hero's Necromancy level (the real engine tracks exact slain hp).
function necromancyRaise(run: RunState): number {
  const c = run.combat;
  if (!c) return 0;
  const necroLvl = run.hero.skills.Necromancy ?? 0;
  const pct = Math.min(0.6, 0.1 * (necroLvl + 1));
  const skel = creatureById.get('necropolis_skeleton')!;
  // Original enemy pool ≈ max hp of every enemy stack at its surviving/known
  // count; on a win all enemies are dead, so this is the full battle strength.
  const enemyHp = c.enemyArmy.stacks.reduce(
    (sum, s) => sum + s.maxHpPer * Math.max(s.count, 1),
    0,
  );
  return Math.max(2, Math.round((enemyHp * pct) / skel.hp));
}

export const mockEngine = new MockEngine();

// Content registries so node screens can render previews + offers by id.
export const CREATURES = srcCreatures;
export const ARTIFACTS = srcArtifacts;
export const SPELLS = srcSpells;

export function creatureLookup(id: string): SrcCreature | undefined {
  return creatureById.get(id);
}
export function artifactLookup(id: string): SrcArtifact | undefined {
  return srcArtifacts.find((a) => a.id === id);
}
export function spellLookup(id: string): SrcSpell | undefined {
  return srcSpells.find((s) => s.id === id);
}
export { adaptStack, adaptEquipment, adaptSpell };
