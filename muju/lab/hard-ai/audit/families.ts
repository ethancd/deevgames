/**
 * Turn-family taxonomy for the E2.1 representation audit
 * (EPIC-PLAN §4 E2.1: "Enumerate which legal turn families the generator can
 * express; address multi-promotion combinations").
 *
 * A FAMILY is a description of the SHAPE of a whole macro turn, not of the
 * exact line. Two turns that buy the same definitions, promote the same number
 * of units, release the same upkeep bodies and strike with the same kind of
 * body belong to the same family even when the squares differ. The audit needs
 * shapes, not lines, because the question it answers is "can the production
 * generator express this KIND of turn at all", and the generator's place-phase
 * product `(purchase plan) × (at most one promotion)` removes shapes, not
 * individual squares (`gen/generate.ts buildCombos`).
 *
 * Everything here is decided by the CANONICAL rules. `classifyTurn` replays the
 * action list through `src/ai/simulate.ts applyAction`, exactly as
 * `exam/witness.ts` does, and reads the resulting positions. Nothing consults
 * the engine under test.
 *
 * THE PLACE-PHASE SHAPES, with the names the report uses:
 *
 *   `none`             no buy and no promotion (a pure action turn, or a
 *                      mine-only turn)
 *   `buys-only`        one or more BUY_UNIT, no PROMOTE_UNIT
 *   `promo-1`          exactly one PROMOTE_UNIT, no buy
 *   `promo-multi`      two or more PROMOTE_UNIT, no buy
 *   `buy+promo-1`      at least one buy and exactly one promotion
 *   `buy+promo-multi`  at least one buy and two or more promotions
 *
 * `promo-multi` and `buy+promo-multi` are exactly the shapes `buildCombos`
 * cannot produce: its combo record holds a single `promo` index.
 *
 * THE TAGS, which cut across the shapes:
 *
 *   `upkeep-release`   the turn paid upkeep and released at least one body
 *   `summon-strike`    a body bought THIS TURN moved or attacked in the same
 *                      turn. This is legal in Muju: `building.ts:13` mints a
 *                      bought unit with `canActThisTurn: true` and
 *                      `src/game/types.ts:77` states the rule in as many words
 *                      ("placement and promotion do not impose summoning
 *                      sickness"). `placedThisTurn` blocks PROMOTION of the new
 *                      body only (`promotion.ts:46`), not its actions. So
 *                      summon-and-strike is a real family and needs no
 *                      substitute definition.
 *   `summon-attack`    the narrower case: the body bought this turn ATTACKED.
 *   `home-entry`       a body of the mover ends the turn on the opponent's
 *                      start corner
 *   `kill`             the end position holds fewer enemy bodies than the root
 *   `win`              the end position is a victory for the mover
 *
 * A `home-race` entry in EPIC-PLAN's sense — buy into the enemy corner and hold
 * it — shows up here as `buys-only`/`buy+promo-*` carrying `home-entry`, with
 * `homeEntryByNewUnit` true.
 */
import type { GameState, PlayerId, Position } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { applyAction } from '../../../src/ai/simulate';

export type PlaceShape =
  | 'none'
  | 'buys-only'
  | 'promo-1'
  | 'promo-multi'
  | 'buy+promo-1'
  | 'buy+promo-multi';

export const PLACE_SHAPES: readonly PlaceShape[] = [
  'none',
  'buys-only',
  'promo-1',
  'promo-multi',
  'buy+promo-1',
  'buy+promo-multi',
];

/** The shapes `gen/generate.ts buildCombos` can put in a combo record. Its
 * `PlaceCombo` holds one purchase-plan index and ONE `promo` index (-1 for
 * none), so two or more promotions have no representation at all. */
export const GENERATOR_EXPRESSIBLE_SHAPES: readonly PlaceShape[] = [
  'none',
  'buys-only',
  'promo-1',
  'buy+promo-1',
];

export function shapeIsGeneratorExpressible(shape: PlaceShape): boolean {
  return GENERATOR_EXPRESSIBLE_SHAPES.includes(shape);
}

export function placeShape(buys: number, promotions: number): PlaceShape {
  if (buys === 0 && promotions === 0) return 'none';
  if (buys === 0) return promotions === 1 ? 'promo-1' : 'promo-multi';
  if (promotions === 0) return 'buys-only';
  return promotions === 1 ? 'buy+promo-1' : 'buy+promo-multi';
}

export type TurnTag =
  | 'upkeep-release'
  | 'summon-strike'
  | 'summon-attack'
  | 'home-entry'
  | 'kill'
  | 'win';

/** The place-phase half of a family: what the turn did before `END_PLACE`. */
export interface PlaceFamily {
  shape: PlaceShape;
  buys: number;
  promotions: number;
  /** Definition ids bought, sorted; squares are deliberately not part of it. */
  boughtDefs: string[];
  /** Definition ids promoted FROM, sorted. */
  promotedFromDefs: string[];
  /** `true` when the turn began with a `PAY_UPKEEP`. */
  paidUpkeep: boolean;
  /** Definition ids of bodies the upkeep payment released, sorted. */
  releasedDefs: string[];
  /** Crystals the place phase spent (root bank minus bank at `END_PLACE`). */
  spend: number;
}

/** The whole turn: its place-phase family plus what the action phase did. */
export interface TurnFamily extends PlaceFamily {
  tags: TurnTag[];
  /** A body bought this turn acted (moved or attacked). */
  summonAndStrike: boolean;
  /** A body bought this turn attacked. */
  summonAndAttack: boolean;
  /** A body that ends on the enemy corner was bought this turn. */
  homeEntryByNewUnit: boolean;
  /** Canonical family key; see `familyKey`. */
  key: string;
  /** The place-phase-only key; see `placeFamilyKey`. */
  placeKey: string;
  /** The turn replayed cleanly through the canonical rules. */
  legal: boolean;
  /** Why not, when `legal` is false. */
  reason: string | null;
}

function sorted(xs: readonly string[]): string[] {
  return [...xs].sort();
}

/**
 * The place-phase family key. Bought definitions and released definitions are
 * part of it (an "upkeep release variant" is named by WHICH bodies went), the
 * squares are not, and the promoted bodies enter by their pre-promotion
 * definition so `fire_1 → fire_2` and `water_1 → water_2` are different
 * families while two `fire_1` promotions on different squares are one.
 */
export function placeFamilyKey(f: PlaceFamily): string {
  const upkeep = !f.paidUpkeep ? 'upk:none' : f.releasedDefs.length === 0 ? 'upk:kept-all' : `upk:release[${f.releasedDefs.join(',')}]`;
  return `${upkeep}|${f.shape}|buy[${f.boughtDefs.join(',')}]|promo[${f.promotedFromDefs.join(',')}]`;
}

/** The whole-turn family key: the place key plus the sorted tag list. */
export function familyKey(f: Omit<TurnFamily, 'key' | 'placeKey'>): string {
  const place = placeFamilyKey(f);
  return `${place}|tags[${sorted(f.tags).join(',')}]`;
}

function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function enemyCount(state: GameState, mover: PlayerId): number {
  let n = 0;
  for (const u of state.board.units) if (u.owner !== mover) n++;
  return n;
}

function defIdOf(state: GameState, unitId: string): string | null {
  const u = state.board.units.find(x => x.id === unitId);
  return u === undefined ? null : u.definitionId;
}

/**
 * Classify a whole macro turn given the position it starts from and the actions
 * it dispatches. The rules globals for the position must already be installed
 * (`withExamRules` / `withMatchRules`), the same requirement `replayLine` has.
 *
 * The action list is replayed through `applyAction`; a refusal or an illegal
 * action makes the result `legal: false` and the family is whatever was
 * classified up to that point.
 */
export function classifyTurn(root: GameState, actions: readonly AIAction[]): TurnFamily {
  const mover = root.turn.currentPlayer;
  const enemyCorner = root.players[mover === 'white' ? 'black' : 'white'].startCorner;
  const rootEnemies = enemyCount(root, mover);
  const rootBank = root.players[mover].resources;

  const boughtDefs: string[] = [];
  const promotedFromDefs: string[] = [];
  const releasedDefs: string[] = [];
  const newUnitIds = new Set<string>();
  let paidUpkeep = false;
  let buys = 0;
  let promotions = 0;
  let summonAndStrike = false;
  let summonAndAttack = false;
  let bankAtEndPlace: number | null = null;
  let legal = true;
  let reason: string | null = null;

  let state = root;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const before = state;
    if (action.type === 'PAY_UPKEEP') {
      paidUpkeep = true;
      const keep = new Set(action.keepUnitIds);
      for (const u of before.board.units) {
        if (u.owner === mover && !keep.has(u.id)) releasedDefs.push(u.definitionId);
      }
    } else if (action.type === 'PROMOTE_UNIT') {
      const from = defIdOf(before, action.unitId);
      if (from !== null) promotedFromDefs.push(from);
    }

    const next = applyAction(before, action);
    if (next === before) {
      legal = false;
      reason = `action ${i} (${action.type}) was refused by the canonical simulator`;
      break;
    }

    switch (action.type) {
      case 'BUY_UNIT': {
        buys++;
        boughtDefs.push(action.definitionId);
        const fresh = next.board.units.find(
          u => u.owner === mover && samePos(u.position, action.position) && !before.board.units.some(b => b.id === u.id),
        );
        if (fresh !== undefined) newUnitIds.add(fresh.id);
        break;
      }
      case 'PROMOTE_UNIT':
        promotions++;
        break;
      case 'MOVE':
        if (newUnitIds.has(action.unitId)) summonAndStrike = true;
        break;
      case 'ATTACK':
        if (newUnitIds.has(action.unitId)) {
          summonAndStrike = true;
          summonAndAttack = true;
        }
        break;
      default:
        break;
    }

    // The place phase ends on an explicit END_PLACE_PHASE, or implicitly when
    // `finishPlacement` auto-advances a player who can do nothing else.
    if (bankAtEndPlace === null && before.turn.phase === 'place' && next.turn.phase === 'action') {
      bankAtEndPlace = next.players[mover].resources;
    }
    state = next;
  }

  if (bankAtEndPlace === null) bankAtEndPlace = state.players[mover].resources;

  const tags: TurnTag[] = [];
  if (paidUpkeep && releasedDefs.length > 0) tags.push('upkeep-release');
  if (summonAndStrike) tags.push('summon-strike');
  if (summonAndAttack) tags.push('summon-attack');
  const occupiers = state.board.units.filter(u => u.owner === mover && samePos(u.position, enemyCorner));
  if (occupiers.length > 0) tags.push('home-entry');
  const homeEntryByNewUnit = occupiers.some(u => newUnitIds.has(u.id));
  if (enemyCount(state, mover) < rootEnemies) tags.push('kill');
  if (state.phase === 'victory' && state.winner === mover) tags.push('win');

  const place: PlaceFamily = {
    shape: placeShape(buys, promotions),
    buys,
    promotions,
    boughtDefs: sorted(boughtDefs),
    promotedFromDefs: sorted(promotedFromDefs),
    paidUpkeep,
    releasedDefs: sorted(releasedDefs),
    spend: rootBank - bankAtEndPlace,
  };

  const body = { ...place, tags: sorted(tags) as TurnTag[], summonAndStrike, summonAndAttack, homeEntryByNewUnit, legal, reason };
  return { ...body, placeKey: placeFamilyKey(place), key: familyKey(body) };
}

/** Can the production generator's combo shortlist express this family AT ALL —
 * ignoring width, ordering and scoring, asking only about the SHAPE? */
export function generatorCanExpress(f: Pick<TurnFamily, 'shape'>): boolean {
  return shapeIsGeneratorExpressible(f.shape);
}
