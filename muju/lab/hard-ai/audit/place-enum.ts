/**
 * Canonical enumeration of the PLACE PHASE (E2.1).
 *
 * The question this file answers is narrow and mechanical: starting from one
 * position, which place-phase prefixes are legal under the real rules, how many
 * of them promote two or more bodies, and which of the resulting families the
 * production generator's combo shortlist could express at all.
 *
 * IT DOES NOT CONCATENATE INDIVIDUALLY LEGAL PROMOTIONS. Every prefix is built
 * by applying real `AIAction`s through `src/ai/simulate.ts applyAction`, one
 * after another, so joint affordability, "once per unit per place phase"
 * (`promotion.ts:50`), "never on the turn the body was bought"
 * (`promotion.ts:46`) and the tier cap (`getNextTierDefinition` returning null)
 * are all enforced by the rules rather than by this file. `EPIC-PLAN §4 E2`
 * asks for exactly that: "simply concatenating individually legal promotions is
 * unsafe".
 *
 * TWO MODES, because the exact prefix set is astronomically large.
 *
 *   `squares: 'all'` — EXACT. Every `BUY_UNIT` is tried on every legal spawn
 *   square. This is the ground truth, and on any position with a real spawn
 *   rectangle it hits the cap: `getAllSpawnPositions` routinely returns 30-60
 *   squares and five affordable definitions, so a two-buy prefix alone has
 *   ~10^4 orderings before promotions are considered. Use it on hand-built
 *   positions and read `capped`.
 *
 *   `squares: 'first-legal'` — FAMILY MODE, the default and the mode every
 *   table in the report uses. Each `BUY_UNIT` definition is placed on the first
 *   legal spawn square in canonical order. The square a body is bought on does
 *   not change its price, its upkeep, its tier or its promotability, so the
 *   family set this mode produces is the same family set the exact mode would
 *   produce, EXCEPT where a placement blocks a spawn square another buy in the
 *   same prefix needed. `SpawnPressure` in the result records how close a
 *   position is to that condition, so the exception can be bounded rather than
 *   assumed away.
 *
 * CAPPING. `maxVisits` counts DFS node visits and `maxPrefixes` counts recorded
 * prefixes. When either runs out the walk stops and `capped` is true: the
 * counts are then LOWER BOUNDS on the legal prefix count and on each family
 * count, and "no prefix with two promotions was found" stops being evidence
 * that none exists. Nothing here repairs or estimates past a cap.
 */
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { applyAction } from '../../../src/ai/simulate';
import { generateAllActions } from '../../../src/ai/moves';
import { getAllSpawnPositions } from '../../../src/game/spawning';
import { getPromotionCost } from '../../../src/game/promotion';
import { getNextTierDefinition } from '../../../src/game/units';
import {
  classifyTurn,
  placeFamilyKey,
  placeShape,
  shapeIsGeneratorExpressible,
  type PlaceFamily,
  type PlaceShape,
} from './families';

export interface PlaceEnumOptions {
  /** DFS node visits before the walk gives up. */
  maxVisits?: number;
  /** Recorded prefixes before the walk gives up. */
  maxPrefixes?: number;
  /** Distinct `PAY_UPKEEP` keep-sets explored (canonical order). */
  maxUpkeepBranches?: number;
  /** Bodies one prefix may buy. The default matches `gen/purchase.ts`
   * `PURCHASE_MAX_BODIES` (4) so the comparison against the production
   * shortlist is like for like; the RULES allow more. */
  maxBuys?: number;
  /** `'first-legal'` (family mode, default) or `'all'` (exact). */
  squares?: 'first-legal' | 'all';
}

export const DEFAULT_PLACE_ENUM: Required<PlaceEnumOptions> = {
  maxVisits: 200_000,
  maxPrefixes: 20_000,
  maxUpkeepBranches: 24,
  maxBuys: 4,
  squares: 'first-legal',
};

export interface PlacePrefix {
  /** The place-phase actions, in the order they were applied. */
  actions: AIAction[];
  /** The position the place phase left (action phase, or the game over). */
  end: GameState;
  family: PlaceFamily;
  placeKey: string;
  /** Shorthand for `family.shape`. */
  shape: PlaceShape;
  /** The generator's combo record could hold this shape. */
  expressible: boolean;
}

export interface SpawnPressure {
  /** Legal spawn squares at the root. */
  squares: number;
  /** Most buys any enumerated prefix made. */
  maxBuys: number;
  /** True when a prefix could plausibly have exhausted the spawn area. */
  tight: boolean;
}

export interface PlaceEnumeration {
  mover: PlayerId;
  bank: number;
  /** Bodies `canPromote` accepts at the root bank, one at a time. */
  affordablePromotions: number;
  /** Bodies with a next tier and no blocking flag, price ignored. */
  promotablePromotionsIgnoringPrice: number;
  /** The cheapest two promotion prices at the root sum to at most the bank. */
  twoPromotionsJointlyAffordable: boolean;
  /** Cheapest sum of two distinct promotion prices, or null when fewer than two exist. */
  cheapestTwoPromotionCost: number | null;
  prefixes: PlacePrefix[];
  /** Distinct `placeKey` values seen, with how many prefixes carried each. */
  families: Map<string, number>;
  byShape: Record<PlaceShape, number>;
  /** Prefixes whose shape the generator's combo record cannot hold. */
  inexpressible: number;
  /** Prefixes with two or more promotions. */
  multiPromotion: number;
  spawn: SpawnPressure;
  capped: boolean;
  visits: number;
}

function emptyByShape(): Record<PlaceShape, number> {
  return { none: 0, 'buys-only': 0, 'promo-1': 0, 'promo-multi': 0, 'buy+promo-1': 0, 'buy+promo-multi': 0 };
}

/** A prefix's identity modulo action order: the upkeep keep-set, the bought
 * definitions with their squares, and the squares of the promoted bodies. Two
 * orderings of the same place phase reach the same position, so they are one
 * prefix. */
function prefixKey(actions: readonly AIAction[]): string {
  const parts: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'PAY_UPKEEP':
        parts.push(`U:${[...a.keepUnitIds].sort().join('/')}`);
        break;
      case 'BUY_UNIT':
        parts.push(`B:${a.definitionId}@${a.position.x},${a.position.y}`);
        break;
      case 'PROMOTE_UNIT':
        parts.push(`P:${a.unitId}`);
        break;
      default:
        break;
    }
  }
  return parts.sort().join('|');
}

function promotionPrices(state: GameState, mover: PlayerId): number[] {
  const out: number[] = [];
  for (const u of state.board.units) {
    if (u.owner !== mover) continue;
    if (u.placedThisTurn === true || u.promotedThisPlacement === true) continue;
    if (getNextTierDefinition(u.definitionId) === null) continue;
    const cost = getPromotionCost(u);
    if (cost === null) continue;
    out.push(cost);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Enumerate the place phase of `root`. The rules globals for the position must
 * already be installed by the caller (`withExamRules` / `withMatchRules`),
 * exactly as `exam/witness.ts` requires.
 */
export function enumeratePlacePhase(root: GameState, opts: PlaceEnumOptions = {}): PlaceEnumeration {
  const cfg = { ...DEFAULT_PLACE_ENUM, ...opts };
  const mover = root.turn.currentPlayer;
  const bank = root.players[mover].resources;

  const prices = promotionPrices(root, mover);
  const affordable = prices.filter(c => c <= bank).length;
  const cheapestTwo = prices.length >= 2 ? prices[0] + prices[1] : null;

  const prefixes: PlacePrefix[] = [];
  const families = new Map<string, number>();
  const byShape = emptyByShape();
  const seen = new Set<string>();
  let visits = 0;
  let capped = false;
  let inexpressible = 0;
  let multiPromotion = 0;
  let deepestBuys = 0;

  const record = (end: GameState, actions: AIAction[]): void => {
    const key = prefixKey(actions);
    if (seen.has(key)) return;
    seen.add(key);
    if (prefixes.length >= cfg.maxPrefixes) {
      capped = true;
      return;
    }
    // `classifyTurn` replays the prefix again from the root, which is how the
    // family numbers stay decided by the canonical rules and never by the walk's
    // bookkeeping.
    const family = classifyTurn(root, actions);
    const shape = placeShape(family.buys, family.promotions);
    const placeKey = placeFamilyKey(family);
    const expressible = shapeIsGeneratorExpressible(shape);
    if (!expressible) inexpressible++;
    if (family.promotions >= 2) multiPromotion++;
    if (family.buys > deepestBuys) deepestBuys = family.buys;
    byShape[shape]++;
    families.set(placeKey, (families.get(placeKey) ?? 0) + 1);
    prefixes.push({ actions: [...actions], end, family, placeKey, shape, expressible });
  };

  // BREADTH FIRST, by prefix length. A depth-first walk that expands
  // promotions before buys spends its whole budget inside the first promotion's
  // subtree, so a capped run reports "no buys-only prefix" for a position full
  // of them. Level order makes a cap truncate the DEEP prefixes, which are the
  // ones an audit of SHAPES cares least about.
  interface Node { state: GameState; trace: AIAction[]; buys: number }
  let frontier: Node[] = [];

  const expand = (node: Node): void => {
    if (capped) return;
    if (visits >= cfg.maxVisits) {
      capped = true;
      return;
    }
    visits++;
    const { state, trace } = node;

    if (state.phase !== 'playing' || state.turn.currentPlayer !== mover || state.turn.phase !== 'place') {
      // The place phase already ended: an upkeep payment that eliminated the
      // side, a buy whose home occupation the gate adjudicated, or
      // `finishPlacement` auto-advancing a player who can do nothing else.
      record(state, trace);
      return;
    }

    const legal = generateAllActions(state, mover);
    const end = legal.find(a => a.type === 'END_PLACE_PHASE');
    if (end !== undefined) {
      const next = applyAction(state, end);
      if (next !== state) record(next, trace);
    }
    if (capped) return;

    const promotes = legal.filter(a => a.type === 'PROMOTE_UNIT') as Extract<AIAction, { type: 'PROMOTE_UNIT' }>[];
    for (const a of promotes) {
      const next = applyAction(state, a);
      if (next === state) continue;
      frontier.push({ state: next, trace: [...trace, a], buys: node.buys });
    }

    if (node.buys >= cfg.maxBuys) return;
    const buys = legal.filter(a => a.type === 'BUY_UNIT') as Extract<AIAction, { type: 'BUY_UNIT' }>[];
    if (cfg.squares === 'all') {
      for (const a of buys) {
        const next = applyAction(state, a);
        if (next === state) continue;
        frontier.push({ state: next, trace: [...trace, a], buys: node.buys + 1 });
      }
      return;
    }
    // Family mode: one square per definition, the first the rules accept.
    const byDef = new Map<string, Extract<AIAction, { type: 'BUY_UNIT' }>[]>();
    for (const a of buys) {
      const list = byDef.get(a.definitionId);
      if (list === undefined) byDef.set(a.definitionId, [a]);
      else list.push(a);
    }
    for (const [, candidates] of byDef) {
      for (const a of candidates) {
        const next = applyAction(state, a);
        if (next === state) continue;
        frontier.push({ state: next, trace: [...trace, a], buys: node.buys + 1 });
        break;
      }
    }
  };

  const run = (seed: Node[]): void => {
    let level = seed;
    while (level.length > 0 && !capped) {
      frontier = [];
      for (const node of level) {
        expand(node);
        if (capped) break;
      }
      level = frontier;
    }
  };

  if (root.upkeepPending) {
    const choices = generateAllActions(root, mover).filter(a => a.type === 'PAY_UPKEEP');
    const limit = Math.min(choices.length, cfg.maxUpkeepBranches);
    if (choices.length > limit) capped = true;
    const seed: Node[] = [];
    for (let i = 0; i < limit; i++) {
      const next = applyAction(root, choices[i]);
      if (next === root) continue;
      seed.push({ state: next, trace: [choices[i]], buys: 0 });
    }
    run(seed);
  } else {
    run([{ state: root, trace: [], buys: 0 }]);
  }

  const spawnSquares = getAllSpawnPositions(mover, root.board).length;
  return {
    mover,
    bank,
    affordablePromotions: affordable,
    promotablePromotionsIgnoringPrice: prices.length,
    twoPromotionsJointlyAffordable: cheapestTwo !== null && cheapestTwo <= bank,
    cheapestTwoPromotionCost: cheapestTwo,
    prefixes,
    families,
    byShape,
    inexpressible,
    multiPromotion,
    spawn: { squares: spawnSquares, maxBuys: deepestBuys, tight: spawnSquares <= deepestBuys + 1 },
    capped,
    visits,
  };
}
