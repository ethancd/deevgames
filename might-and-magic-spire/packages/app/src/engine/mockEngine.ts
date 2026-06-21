// Fixture-backed mock engine implementing the pinned runtime contract.
//
// This lets the app be developed and tested NOW, before @mms/engine ships its
// real build. It is intentionally a faithful-enough Slay-the-Spire loop — a
// branching act map, seeded deterministic combat with intents, card play that
// mutates HP/block/energy, rewards, and an act boss — so the whole run is
// touch-playable end to end. At integration this file is dropped in favour of
// the real engine; see ./index.ts for the swap seam.
import type { CardDef } from '@mms/schema';
import { fixtureCard } from '@mms/schema';
import type {
  CombatState,
  Enemy,
  EngineApi,
  EngineRewardSource,
  Intent,
  MapNode,
  NodeType,
  Relic,
  RewardChoice,
  RunState,
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

// ---------------------------------------------------------------------------
// Necropolis card pool — derived from the schema fixture card so we never
// drift from the content contract. Mechanics owns the real adapter; this is a
// stand-in deck that exercises every effect kind the UI must render.
// ---------------------------------------------------------------------------
function mkCard(over: Partial<CardDef> & { id: string }): CardDef {
  return { ...fixtureCard, ...over };
}

const CARD_POOL: CardDef[] = [
  mkCard({
    id: 'card_skeleton',
    name: 'Skeleton',
    type: 'strike',
    cost: 1,
    rarity: 'common',
    effects: [{ kind: 'damage', amount: 5, target: 'enemy' }],
    text: 'Deal 5 damage.',
    imageRef: 'necropolis_skeleton',
  }),
  mkCard({
    id: 'card_bone_wall',
    name: 'Bone Wall',
    type: 'skill',
    cost: 1,
    rarity: 'common',
    effects: [{ kind: 'block', amount: 5, target: 'self' }],
    text: 'Gain 5 Block.',
    imageRef: 'necropolis_wraith',
  }),
  mkCard({
    id: 'card_walking_dead',
    name: 'Walking Dead',
    type: 'strike',
    cost: 1,
    rarity: 'common',
    effects: [{ kind: 'damage', amount: 7, target: 'enemy' }],
    text: 'Deal 7 damage.',
    imageRef: 'necropolis_zombie',
  }),
  mkCard({
    id: 'card_vampiric_touch',
    name: 'Vampiric Touch',
    type: 'skill',
    cost: 2,
    rarity: 'uncommon',
    effects: [
      { kind: 'damage', amount: 6, target: 'enemy' },
      { kind: 'block', amount: 6, target: 'self' },
    ],
    text: 'Deal 6 damage. Gain 6 Block.',
    imageRef: 'necropolis_vampire',
  }),
  mkCard({
    id: 'card_raise_dead',
    name: 'Raise Dead',
    type: 'power',
    cost: 1,
    rarity: 'uncommon',
    effects: [{ kind: 'draw', amount: 2, target: 'self' }],
    text: 'Draw 2 cards.',
    imageRef: 'necropolis_lich',
  }),
  mkCard({
    id: 'card_death_cloud',
    name: 'Death Cloud',
    type: 'strike',
    cost: 2,
    rarity: 'rare',
    effects: [{ kind: 'damage', amount: 8, target: 'allEnemies' }],
    text: 'Deal 8 damage to ALL enemies.',
    imageRef: 'necropolis_lich',
  }),
];

const RELIC_POOL: Relic[] = [
  {
    id: 'relic_skull_of_galthran',
    name: 'Skull of Galthran',
    rarity: 'uncommon',
    description: 'At the start of combat, gain 4 Block.',
    imageRef: 'artifact_centaurs_axe',
  },
  {
    id: 'relic_vial_of_lifeblood',
    name: 'Vial of Lifeblood',
    rarity: 'common',
    description: 'Heal 2 HP after each combat.',
    imageRef: 'artifact_centaurs_axe',
  },
  {
    id: 'relic_necromancers_amulet',
    name: "Necromancer's Amulet",
    rarity: 'rare',
    description: 'The first card you play each turn costs 0.',
    imageRef: 'artifact_centaurs_axe',
  },
];

const STARTER_DECK: CardDef[] = [
  CARD_POOL[0], CARD_POOL[0], CARD_POOL[0], CARD_POOL[0],
  CARD_POOL[1], CARD_POOL[1], CARD_POOL[1],
  CARD_POOL[2], CARD_POOL[2],
  CARD_POOL[3],
];

// ---------------------------------------------------------------------------
// Map generation — a small branching act, ~7 rows, ending in a boss.
// ---------------------------------------------------------------------------
const ROW_TYPES: NodeType[][] = [
  ['combat', 'combat'],
  ['combat', 'event'],
  ['elite', 'combat'],
  ['rest', 'shop'],
  ['combat', 'event'],
  ['elite', 'shop'],
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
  const pick = <T,>(arr: T[]): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

  // Wire each node to 1-2 nodes in the next row.
  for (let row = 0; row < byRow.length - 1; row++) {
    const cur = byRow[row];
    const nxt = byRow[row + 1];
    cur.forEach((id) => {
      const target = pick(nxt);
      node(id).next = [target];
      // occasionally fan out to a second next node
      if (nxt.length > 1 && rng() > 0.5) {
        const alt = nxt.find((t) => t !== target);
        if (alt) node(id).next.push(alt);
      }
    });
    // guarantee every next-row node is reachable
    nxt.forEach((tid) => {
      if (!cur.some((id) => node(id).next.includes(tid))) {
        node(pick(cur)).next.push(tid);
      }
    });
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Enemy templates + intent telegraphing.
// ---------------------------------------------------------------------------
function makeIntent(rng: () => number, atk: number): Intent {
  const roll = rng();
  if (roll < 0.6) return { kind: 'attack', value: atk, label: `Attack ${atk}` };
  if (roll < 0.85) return { kind: 'block', value: 6, label: 'Defend' };
  return { kind: 'buff', label: 'Empower' };
}

function spawnEnemies(type: NodeType, rng: () => number): Enemy[] {
  const mk = (id: string, name: string, hp: number, atk: number, ref: string): Enemy => ({
    id,
    name,
    hp,
    maxHp: hp,
    block: 0,
    intent: makeIntent(rng, atk),
    imageRef: ref,
  });
  switch (type) {
    case 'boss':
      return [mk('e_boss', 'Lich King', 80, 14, 'necropolis_lich')];
    case 'elite':
      return [
        mk('e_vamp', 'Vampire Lord', 38, 9, 'necropolis_vampire'),
        mk('e_wraith', 'Wraith', 22, 6, 'necropolis_wraith'),
      ];
    default:
      return [
        mk('e_skel1', 'Skeleton', 16, 5, 'necropolis_skeleton'),
        mk('e_zomb', 'Zombie', 20, 4, 'necropolis_zombie'),
      ];
  }
}

// ---------------------------------------------------------------------------
// Combat helpers.
// ---------------------------------------------------------------------------
function startCombat(run: RunState, type: NodeType, rng: () => number): CombatState {
  // Apply "start of combat" relics (Skull of Galthran).
  let startBlock = 0;
  if (run.relics.some((r) => r.id === 'relic_skull_of_galthran')) startBlock = 4;
  const enemies = spawnEnemies(type, rng);
  const hand = drawHand(run.deck, rng, 5);
  return {
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    playerHp: run.hp,
    playerMaxHp: run.maxHp,
    playerBlock: startBlock,
    hand,
    drawCount: Math.max(0, run.deck.length - hand.length),
    discardCount: 0,
    enemies,
    outcome: 'ongoing',
  };
}

function drawHand(deck: CardDef[], rng: () => number, n: number): CardDef[] {
  const pool = [...deck];
  const out: CardDef[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// The engine implementation.
// ---------------------------------------------------------------------------
class MockEngine implements EngineApi, EngineRewardSource {
  startRun(seed: string): RunState {
    const rng = mulberry32(hashSeed(seed));
    const map = buildMap(rng);
    return {
      seed,
      hp: 50,
      maxHp: 50,
      gold: 99,
      deck: [...STARTER_DECK],
      relics: [],
      map,
      currentNodeId: null,
      act: 1,
      combat: null,
      outcome: 'ongoing',
    };
  }

  chooseNode(run: RunState, nodeId: string): RunState {
    const next = clone(run);
    const node = next.map.find((n) => n.id === nodeId);
    if (!node) return next;
    next.currentNodeId = nodeId;
    const rng = mulberry32(hashSeed(run.seed + nodeId));
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      next.combat = startCombat(next, node.type, rng);
    } else {
      // rest / shop / event resolve immediately into a reward step.
      next.combat = null;
    }
    return next;
  }

  playCard(run: RunState, cardId: string, targetId?: string): RunState {
    const next = clone(run);
    const c = next.combat;
    if (!c || c.outcome !== 'ongoing') return next;
    const idx = c.hand.findIndex((card) => card.id === cardId);
    if (idx === -1) return next;
    const card = c.hand[idx];

    // Necromancer's Amulet: first card each turn costs 0.
    const firstFree =
      next.relics.some((r) => r.id === 'relic_necromancers_amulet') &&
      c.discardCount === 0;
    const cost = firstFree ? 0 : card.cost;
    if (c.energy < cost) return next;
    c.energy -= cost;

    const targets = targetId
      ? c.enemies.filter((e) => e.id === targetId)
      : c.enemies.slice(0, 1);

    for (const effect of card.effects) {
      const amt = effect.amount ?? 0;
      switch (effect.kind) {
        case 'damage': {
          const hitList = effect.target === 'allEnemies' ? c.enemies : targets;
          for (const e of hitList) {
            const afterBlock = Math.max(0, amt - e.block);
            e.block = Math.max(0, e.block - amt);
            e.hp = Math.max(0, e.hp - afterBlock);
          }
          break;
        }
        case 'block':
          c.playerBlock += amt;
          break;
        case 'draw': {
          const drawn = drawHand(next.deck, mulberry32(hashSeed(run.seed + c.turn + cardId)), amt);
          c.hand.push(...drawn);
          break;
        }
        default:
          break; // summon/buff/debuff/mana — telegraphed but not modelled in the mock
      }
    }

    // Discard the played card.
    c.hand.splice(idx, 1);
    c.discardCount += 1;
    c.enemies = c.enemies.filter((e) => e.hp > 0);

    if (c.enemies.length === 0) {
      c.outcome = 'won';
      this.resolveCombatWin(next);
    }
    return next;
  }

  endTurn(run: RunState): RunState {
    const next = clone(run);
    const c = next.combat;
    if (!c || c.outcome !== 'ongoing') return next;

    // Enemies act on their telegraphed intents.
    const rng = mulberry32(hashSeed(run.seed + 'turn' + c.turn));
    for (const e of c.enemies) {
      if (e.intent.kind === 'attack' && e.intent.value) {
        const dmg = Math.max(0, e.intent.value - c.playerBlock);
        c.playerBlock = Math.max(0, c.playerBlock - e.intent.value);
        c.playerHp = Math.max(0, c.playerHp - dmg);
      } else if (e.intent.kind === 'block' && e.intent.value) {
        e.block += e.intent.value;
      } else if (e.intent.kind === 'buff') {
        e.intent = { kind: 'attack', value: 12, label: 'Attack 12' };
      }
    }

    if (c.playerHp <= 0) {
      c.outcome = 'lost';
      next.outcome = 'lost';
      next.hp = 0;
      return next;
    }

    // New turn: refresh energy, reset block, retelegraph, redraw.
    c.turn += 1;
    c.energy = c.maxEnergy;
    c.playerBlock = 0;
    for (const e of c.enemies) {
      e.intent = makeIntent(rng, e.name === 'Lich King' ? 14 : 5);
    }
    c.hand = drawHand(next.deck, rng, 5);
    c.discardCount = 0;
    next.hp = c.playerHp;
    return next;
  }

  pickReward(run: RunState, choice: RewardChoice): RunState {
    const next = clone(run);
    switch (choice.kind) {
      case 'card': {
        const card = CARD_POOL.find((c) => c.id === choice.cardId);
        if (card) next.deck.push(card);
        break;
      }
      case 'relic': {
        const relic = RELIC_POOL.find((r) => r.id === choice.relicId);
        if (relic && !next.relics.some((r) => r.id === relic.id)) next.relics.push(relic);
        break;
      }
      case 'heal':
        next.hp = Math.min(next.maxHp, next.hp + choice.amount);
        break;
      case 'skip':
        break;
    }
    // Clear the resolved node; the player returns to the map.
    const wasBoss = next.map.find((n) => n.id === next.currentNodeId)?.type === 'boss';
    next.currentNodeId = null;
    next.combat = null;
    if (wasBoss) next.outcome = 'won';
    return next;
  }

  pendingRewards(run: RunState): RewardChoice[] {
    const node = run.map.find((n) => n.id === run.currentNodeId);
    if (!node) return [];
    if (node.type === 'rest') {
      return [{ kind: 'heal', amount: 15 }, { kind: 'skip' }];
    }
    if (node.type === 'shop') {
      return [
        { kind: 'relic', relicId: 'relic_vial_of_lifeblood' },
        { kind: 'card', cardId: 'card_death_cloud' },
        { kind: 'skip' },
      ];
    }
    if (node.type === 'event') {
      return [{ kind: 'heal', amount: 8 }, { kind: 'card', cardId: 'card_raise_dead' }, { kind: 'skip' }];
    }
    // combat / elite / boss rewards are produced on win (see resolveCombatWin)
    return run.combat?.outcome === 'won' ? this.combatRewards(node.type) : [];
  }

  private combatRewards(type: NodeType): RewardChoice[] {
    const base: RewardChoice[] = [
      { kind: 'card', cardId: 'card_vampiric_touch' },
      { kind: 'card', cardId: 'card_walking_dead' },
    ];
    if (type === 'elite' || type === 'boss') {
      base.unshift({ kind: 'relic', relicId: 'relic_skull_of_galthran' });
    }
    return base;
  }

  private resolveCombatWin(run: RunState): void {
    // Vial of Lifeblood heals after combat.
    if (run.relics.some((r) => r.id === 'relic_vial_of_lifeblood')) {
      run.hp = Math.min(run.maxHp, run.hp + 2);
    } else if (run.combat) {
      run.hp = run.combat.playerHp;
    }
  }
}

export const mockEngine = new MockEngine();

// Read-only registries so the reward UI can render previews by id. At
// integration, prefer the real engine returning rich choices inline; until
// then these bridge an id -> renderable.
export const CARD_REGISTRY: Record<string, CardDef> = Object.fromEntries(
  CARD_POOL.map((c) => [c.id, c]),
);
export const RELIC_REGISTRY: Record<string, Relic> = Object.fromEntries(
  RELIC_POOL.map((r) => [r.id, r]),
);

export function lookupCard(id: string): CardDef | undefined {
  return CARD_REGISTRY[id];
}
export function lookupRelic(id: string): Relic | undefined {
  return RELIC_REGISTRY[id];
}
