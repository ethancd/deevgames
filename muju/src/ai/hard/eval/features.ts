/**
 * The 58 evaluation features (DESIGN §4.15, §5.12.1, §5.13).
 *
 * `extract` writes the SYMMETRIC DIFFERENCE `f(side) − f(other)` of one stage's
 * features into `out`; the score is `Σ_i w[i] · out[i]` in integer
 * centi-crystals (`eval/weights.ts`'s header derives that scale from DESIGN's
 * own `w` column and its `boundStage2` formula). Two conventions follow from
 * it and are used everywhere below:
 *
 *   - CRYSTALS, NOT CENTI-CRYSTALS, for every feature whose natural definition
 *     is a sum of material or of another cc quantity (`Material`, `PstMine`,
 *     `Exposure`, `EconDelta`, `RelocationDebt`, `Hanging`, `HangingBuy`,
 *     `ApproachRetreat`, `ApproachStrand`, `StrandPunish`, `KillAvailable`,
 *     `CleaveExposure`). The cc difference is formed FIRST and divided by 100
 *     once, truncating towards zero, so the rounding is exactly antisymmetric
 *     (`trunc(−x) === −trunc(x)`) and the mirror-symmetry gate holds to the cc.
 *   - `f(side) − f(other)` for every feature, INCLUDING the penalties: a
 *     penalty the other side commits is a plus for `side`.
 *
 * `extract` writes ONLY the features of the requested stage and leaves the rest
 * of `out` untouched, so `full()` composes the three calls into one vector.
 *
 * WEIGHT-FREE (DESIGN §4.15 gives `extract` no `Weights`). Feature `Material`
 * is `Σ material[def]`, and `material` is the tunable 18-parameter half of
 * `Weights` — which this function cannot see. It therefore writes the
 * CATALOGUE PRIOR version, `p.materialCc` (`cost × 100`, maintained
 * incrementally by `core/state.ts`), which is what `DEFAULT_WEIGHTS.material`
 * holds (DESIGN F9). `Evaluator.stage0` scores the material term from
 * `w.material` directly and overwrites `out[F.Material]` with the weighted
 * value in `full()`, so `score === Σ w·f` stays exact under tuning. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M12.
 */
import {
  CC,
  DEAD,
  MAX_SLOTS,
  NO_SLOT,
  type Centi,
  type PackedState,
  type Side,
} from '../types';
import { bbHas, type Scratch } from '../core/bits';
import { ADJ_COUNT, ADJ_LIST, CORNER, CORNER_NEIGHBOURS, CORRIDOR } from '../core/tables';
import { NDEF, activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN } from '../core/state';
import type { NodeTables } from '../tables/context';
import { KILL_IMPOSSIBLE } from '../tables/kill';
import { Approach } from '../tables/approach';
import { ACTION_VALUE_CC, ECON_HORIZON, RELOCATION_MAX_ACTIONS } from '../tables/economy';
import type { Weights } from '../config';
import { INVARIANT_COUNT, invariantBits, leadCc } from './invariants';

export const FEATURE_COUNT = 58;

export const F = {
  // stage 0 (incremental, no tables)
  Material: 0,
  Rent: 1,
  BankLiquid: 2,
  BankExcess: 3,
  HomeInvaded: 4,
  // stage 1 (level-1 tables)
  PstMine: 5,
  BankConvertible: 6,
  SpawnArea: 7,
  SpawnReserve: 8,
  SpawnZero: 9,
  AnchorDepth: 10,
  Infiltration: 11,
  CornerSeal: 12,
  HomeThreat: 13,
  HomeCountdown: 14,
  HomePlug: 15,
  HomeRescuers: 16,
  Exposure: 17,
  DrawPressure: 18,
  ActionsLeft: 19,
  Corridor: 20,
  TierClimb: 21,
  ElementCoverage: 22,
  // stage 2 (level-2 tables)
  EconDelta: 23,
  DepletionWaste: 24,
  RunwayCliff: 25,
  Insolvency: 26,
  RelocationDebt: 27,
  Hanging: 28,
  HangingBuy: 29,
  ApproachRetreat: 30,
  ApproachStrand: 31,
  StrandPunish: 32,
  KillAvailable: 33,
  CleaveExposure: 34,
  AnchorFragility: 35,
  BlockingDeficit: 36,
  CornerInfiltration: 37,
  // stage 2: the twenty SU §7 invariants, one feature each
  Inv1SpawnZero: 38,
  Inv2CornerSeal: 39,
  Inv3RetreatSquare: 40,
  Inv4StrandUnpunished: 41,
  Inv5PoorMinerSquare: 42,
  Inv6FragileAnchor: 43,
  Inv7PromoteNoRunway: 44,
  Inv8NoPreAdjacency: 45,
  Inv9ChipAcrossTurn: 46,
  Inv10HomeReachable: 47,
  Inv11HomeBare: 48,
  Inv12CleaveLine: 49,
  Inv13Turtle: 50,
  Inv14LiquidityFloor: 51,
  Inv15UnknownAsSafe: 52,
  Inv16ClockDiscipline: 53,
  Inv17SelfBlock: 54,
  Inv18WastedEndPlace: 55,
  Inv19SoftMinerExposed: 56,
  Inv20StrandNoRetreat: 57,
} as const;

/** `F.Inv1SpawnZero`; invariant `i` (1-based) is feature `INV_BASE + i - 1`. */
export const INV_BASE = F.Inv1SpawnZero;

export const FEATURE_NAMES: readonly string[] = (() => {
  const names = new Array<string>(FEATURE_COUNT).fill('');
  for (const [name, index] of Object.entries(F)) names[index] = name;
  for (let i = 0; i < FEATURE_COUNT; i++) {
    if (names[i] === '') throw new Error(`features: no name for index ${i}`);
  }
  return names;
})();

/** `STAGE_OF[i]` ∈ {0, 1, 2} (DESIGN §4.15). */
export const STAGE_OF: Uint8Array = (() => {
  const s = new Uint8Array(FEATURE_COUNT);
  for (let i = F.PstMine; i <= F.ElementCoverage; i++) s[i] = 1;
  for (let i = F.EconDelta; i < FEATURE_COUNT; i++) s[i] = 2;
  return s;
})();

/** `Scratch` dimensions `extract(stage 2)` needs (it forwards them to `invariantBits`). */
export { INVARIANT_SCRATCH_BB as FEATURE_SCRATCH_BB, INVARIANT_SCRATCH_I8 as FEATURE_SCRATCH_I8 } from './invariants';

/** Truncation towards zero, so `div100(−x) === −div100(x)` (mirror symmetry). */
function div100(cc: number): number {
  return (cc / CC) | 0;
}

/** The dearest catalogue body's cost, in crystals (plant_3/metal_3 at 17). */
const MAX_COST = 17;

/** The catalogue material prior of a definition, `cost × 100` (DESIGN F9). */
function priorCc(cat: Catalog, def: number): Centi {
  return cat.cost[def] * CC;
}

// --- stage 0 ---------------------------------------------------------------

function rentCrystals(p: PackedState, side: Side, cat: Catalog): number {
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    sum += cat.upkeep[p.defId[slot]];
  }
  return sum;
}

/** `[an enemy unit stands on side's own corner]` (turn.ts:23-27). */
function homeInvaded(p: PackedState, side: Side): number {
  const slot = p.pieceAt[CORNER[side]];
  return slot !== NO_SLOT && p.owner[slot] !== side ? 1 : 0;
}

function extractStage0(p: PackedState, me: Side, them: Side, out: Int32Array, cat: Catalog): void {
  out[F.Material] = div100(p.materialCc[me] - p.materialCc[them]);
  out[F.Rent] = rentCrystals(p, me, cat) - rentCrystals(p, them, cat);
  out[F.BankLiquid] = Math.min(p.bank[me], 8) - Math.min(p.bank[them], 8);
  out[F.BankExcess] = Math.max(0, p.bank[me] - 8) - Math.max(0, p.bank[them] - 8);
  out[F.HomeInvaded] = homeInvaded(p, me) - homeInvaded(p, them);
}

// --- stage 1 ---------------------------------------------------------------

/** Σ catalogue prior of `side`'s units standing inside `t.exposure[side]`. */
function exposedPriorCc(p: PackedState, side: Side, t: NodeTables, cat: Catalog): Centi {
  const mask = t.exposure[side];
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (bbHas(mask, s)) sum += priorCc(cat, p.defId[slot]);
  }
  return sum;
}

function corridorUnits(p: PackedState, side: Side, cat: Catalog): number {
  let n = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (cat.element[p.defId[slot]] !== 1) continue;
    if (bbHas(CORRIDOR, s)) n++;
  }
  return n;
}

const ELEMENTS = 6;
const TIER_SCRATCH = new Int8Array(ELEMENTS);

/** `Σ over elements (max tier − 1)`, counting only elements the side owns. */
function tierClimb(p: PackedState, side: Side, cat: Catalog): number {
  TIER_SCRATCH.fill(0);
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const def = p.defId[slot];
    const el = cat.element[def];
    const tier = cat.tier[def];
    if (tier > TIER_SCRATCH[el]) TIER_SCRATCH[el] = tier;
  }
  let sum = 0;
  for (let e = 0; e < ELEMENTS; e++) if (TIER_SCRATCH[e] > 0) sum += TIER_SCRATCH[e] - 1;
  return sum;
}

const TIER_SCRATCH_DEF = new Int32Array(NDEF);

/** The enemy's most common body with printed DEF ≥ 3; ties keep the lowest defId. */
function commonHardBody(p: PackedState, enemy: Side, cat: Catalog): number {
  const counts = TIER_SCRATCH_DEF;
  counts.fill(0);
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== enemy) continue;
    const def = p.defId[slot];
    if (cat.def[def] >= 3) counts[def]++;
  }
  let best = -1;
  let bestCount = 0;
  for (let d = 0; d < NDEF; d++) {
    if (counts[d] > bestCount) {
      bestCount = counts[d];
      best = d;
    }
  }
  return best;
}

/**
 * `[own or purchasable unit one-shots the enemy's most common DEF-3/4 body]`
 * (DESIGN §5.12.1 #22, SU §3.4.2). "Purchasable" is an affordable tier-1
 * definition; `killsInOne` is the catalogue's `power >= def` plane.
 */
function elementCoverage(p: PackedState, side: Side, cat: Catalog): number {
  const target = commonHardBody(p, (1 - side) as Side, cat);
  if (target < 0) return 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (cat.killsInOne[powerIndex(side, p.defId[slot], target)] === 1) return 1;
  }
  const bank = p.bank[side];
  for (let i = 0; i < cat.tier1.length; i++) {
    const def = cat.tier1[i];
    if (cat.cost[def] > bank) continue;
    if (cat.killsInOne[powerIndex(side, def, target)] === 1) return 1;
  }
  return 0;
}

function extractStage1(p: PackedState, t: NodeTables, me: Side, them: Side, out: Int32Array, cat: Catalog): void {
  const sMe = t.spawn[me];
  const sThem = t.spawn[them];
  const gMe = t.geom[me];
  const gThem = t.geom[them];
  const hMe = t.home[me];
  const hThem = t.home[them];

  out[F.PstMine] = div100(p.pstSumCc[me] - p.pstSumCc[them]);
  out[F.BankConvertible] = Math.min(p.bank[me], 5 * sMe.area) - Math.min(p.bank[them], 5 * sThem.area);
  out[F.SpawnArea] = sMe.area - sThem.area;
  out[F.SpawnReserve] = ((sMe.reserveSum / 4) | 0) - ((sThem.reserveSum / 4) | 0);
  out[F.SpawnZero] = gMe.zeroCliff - gThem.zeroCliff;
  out[F.AnchorDepth] = gMe.anchorDepth - gThem.anchorDepth;
  out[F.Infiltration] = gMe.infiltrationAnchors - gThem.infiltrationAnchors;
  out[F.CornerSeal] = gMe.cornerNeighboursHeld - gThem.cornerNeighboursHeld;
  out[F.HomeThreat] = (hMe.actionsToCorner <= 4 ? 1 : 0) - (hThem.actionsToCorner <= 4 ? 1 : 0);
  out[F.HomeCountdown] = Math.max(0, 4 - hMe.turnsToCorner) - Math.max(0, 4 - hThem.turnsToCorner);
  out[F.HomePlug] = hMe.plug - hThem.plug;
  out[F.HomeRescuers] = hMe.rescuers - hThem.rescuers;
  out[F.Exposure] = div100(exposedPriorCc(p, me, t, cat) - exposedPriorCc(p, them, t, cat));

  const clock = p.drawRuleOn === 1 ? p.clock : 0;
  const lead = leadCc(p, me);
  out[F.DrawPressure] = (lead > 0 ? 1 : lead < 0 ? -1 : 0) * clock * clock;

  out[F.ActionsLeft] = p.phase === 1 ? (p.side === me ? p.actions : -p.actions) : 0;
  out[F.Corridor] = corridorUnits(p, me, cat) - corridorUnits(p, them, cat);
  out[F.TierClimb] = tierClimb(p, me, cat) - tierClimb(p, them, cat);
  out[F.ElementCoverage] = elementCoverage(p, me, cat) - elementCoverage(p, them, cat);
}

// --- stage 2 ---------------------------------------------------------------

/** Σ catalogue prior of `side`'s units the enemy can kill next turn, split by "needs a purchase". */
function hangingCc(p: PackedState, side: Side, t: NodeTables, needsBuy: 0 | 1, cat: Catalog): Centi {
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const actions = t.killActions[slot];
    if (actions < 0 || actions > ACTIONS_PER_TURN) continue;
    if (t.killNeedsBuy[slot] !== needsBuy) continue;
    sum += priorCc(cat, p.defId[slot]);
  }
  return sum;
}

function approachCc(p: PackedState, side: Side, t: NodeTables, cls: number, cat: Catalog): Centi {
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    if (t.approach[slot] !== cls) continue;
    sum += priorCc(cat, p.defId[slot]);
  }
  return sum;
}

/**
 * `StrandPunish` (SU addendum 20a): Σ catalogue prior over ENEMY attackers
 * that stranded themselves next to one of `side`'s units and that `side` can
 * kill from `killNow[side]`. `NodeTables.approach` records only the CLASS of
 * the cheapest attacker per defended slot, not which slot it is (DESIGN §4.8),
 * so the attacker is recovered by looking at the enemy units orthogonally
 * adjacent to a stranded defender; each such attacker counts once.
 */
function strandPunishCc(p: PackedState, side: Side, t: NodeTables, cat: Catalog, seen: Uint8Array): Centi {
  const enemy = (1 - side) as Side;
  const table = t.killNow[side];
  seen.fill(0);
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (t.approach[slot] !== Approach.STRAND) continue;
    const base = s * 4;
    const n = ADJ_COUNT[s];
    for (let i = 0; i < n; i++) {
      const q = ADJ_LIST[base + i];
      const a = p.pieceAt[q];
      if (a === NO_SLOT || p.owner[a] !== enemy || seen[a] === 1) continue;
      const entry = table.entry[a];
      if (entry.minActions >= KILL_IMPOSSIBLE) continue;
      seen[a] = 1;
      sum += priorCc(cat, p.defId[a]);
    }
  }
  return sum;
}

/** `Σ valueCc[target] / minActions` over the targets `side` can kill this turn (DESIGN §5.12.1 #33). */
function killAvailableCc(p: PackedState, side: Side, t: NodeTables): Centi {
  const table = t.killNow[side];
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] === side) continue;
    const entry = table.entry[slot];
    if (entry.minActions >= KILL_IMPOSSIBLE || entry.minActions <= 0) continue;
    sum += (entry.valueCc / entry.minActions) | 0;
  }
  return sum;
}

/** Σ `chain[v]` over the ENEMY's tier-2-and-up units — what they can harvest from `side`. */
function cleaveExposureCc(p: PackedState, side: Side, t: NodeTables, cat: Catalog): Centi {
  const enemy = (1 - side) as Side;
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    if (cat.tier[p.defId[slot]] < 2) continue;
    sum += t.chain[slot];
  }
  return sum;
}

/** `[own unit on the enemy corner or both enemy corner neighbours held by me]`. */
function cornerInfiltration(p: PackedState, side: Side): number {
  const enemy = (1 - side) as Side;
  const occupant = p.pieceAt[CORNER[enemy]];
  if (occupant !== NO_SLOT && p.owner[occupant] === side) return 1;
  const nb = CORNER_NEIGHBOURS[enemy];
  for (let i = 0; i < nb.length; i++) {
    const slot = p.pieceAt[nb[i]];
    if (slot === NO_SLOT || p.owner[slot] !== side) return 0;
  }
  return 1;
}

const SEEN_ME = new Uint8Array(MAX_SLOTS);
const SEEN_THEM = new Uint8Array(MAX_SLOTS);

function extractStage2(
  p: PackedState,
  t: NodeTables,
  me: Side,
  them: Side,
  sc: Scratch,
  ply: number,
  out: Int32Array,
  cat: Catalog,
): void {
  const eMe = t.econ[me];
  const eThem = t.econ[them];
  const gMe = t.geom[me];
  const gThem = t.geom[them];

  out[F.EconDelta] = div100(eMe.stream - p.pstSumCc[me] - (eThem.stream - p.pstSumCc[them]));
  out[F.DepletionWaste] = eMe.waste - eThem.waste;
  out[F.RunwayCliff] =
    (p.bank[me] + eMe.income[0] < eMe.upkeep[0] ? 1 : 0) - (p.bank[them] + eThem.income[0] < eThem.upkeep[0] ? 1 : 0);
  out[F.Insolvency] =
    Math.max(0, ECON_HORIZON - eMe.turnsToInsolvency) - Math.max(0, ECON_HORIZON - eThem.turnsToInsolvency);
  out[F.RelocationDebt] = div100(eMe.relocationDebt - eThem.relocationDebt);

  out[F.Hanging] = div100(hangingCc(p, me, t, 0, cat) - hangingCc(p, them, t, 0, cat));
  out[F.HangingBuy] = div100(hangingCc(p, me, t, 1, cat) - hangingCc(p, them, t, 1, cat));
  out[F.ApproachRetreat] = div100(
    approachCc(p, me, t, Approach.RETREAT, cat) - approachCc(p, them, t, Approach.RETREAT, cat),
  );
  out[F.ApproachStrand] = div100(
    approachCc(p, me, t, Approach.STRAND, cat) - approachCc(p, them, t, Approach.STRAND, cat),
  );
  out[F.StrandPunish] = div100(
    strandPunishCc(p, me, t, cat, SEEN_ME) - strandPunishCc(p, them, t, cat, SEEN_THEM),
  );
  out[F.KillAvailable] = div100(killAvailableCc(p, me, t) - killAvailableCc(p, them, t));
  out[F.CleaveExposure] = div100(cleaveExposureCc(p, me, t, cat) - cleaveExposureCc(p, them, t, cat));
  out[F.AnchorFragility] = gMe.fragility - gThem.fragility;
  out[F.BlockingDeficit] = Math.max(0, 2 - gMe.blocking) - Math.max(0, 2 - gThem.blocking);
  out[F.CornerInfiltration] = cornerInfiltration(p, me) - cornerInfiltration(p, them);

  const bitsMe = invariantBits(p, t, me, sc, ply);
  const bitsThem = invariantBits(p, t, them, sc, ply);
  for (let i = 0; i < INVARIANT_COUNT; i++) {
    out[INV_BASE + i] = ((bitsMe >>> i) & 1) - ((bitsThem >>> i) & 1);
  }
}

/**
 * Writes the features of `stage` into `out` as `f(side) − f(other)` (DESIGN
 * §4.15). `t` may be `null` only at stage 0; stage 1 needs a level-1
 * `NodeTables`, stage 2 a level-2 one.
 */
export function extract(
  p: PackedState,
  t: NodeTables | null,
  side: Side,
  stage: 0 | 1 | 2,
  sc: Scratch,
  ply: number,
  out: Int32Array,
): void {
  const me = side;
  const them = (1 - side) as Side;
  const cat = activeCatalog();
  switch (stage) {
    case 0:
      extractStage0(p, me, them, out, cat);
      return;
    case 1:
      if (t === null) throw new Error('extract: stage 1 needs level-1 NodeTables');
      extractStage1(p, t, me, them, out, cat);
      return;
    case 2:
      if (t === null) throw new Error('extract: stage 2 needs level-2 NodeTables');
      extractStage2(p, t, me, them, sc, ply, out, cat);
      return;
    default: {
      const never: never = stage;
      throw new Error(`extract: bad stage ${String(never)}`);
    }
  }
}

// --- the lazy-evaluation bound (DESIGN §5.12.4) -----------------------------

/**
 * A CERTIFIED upper bound on `|Σ stage-2 terms|` for this position, computed
 * from stage-1 quantities (DESIGN §5.12.4, F15). Every stage-2 feature is
 * bounded here by a quantity that provably dominates it for any legal
 * continuation, so `evaluate`'s two early exits can never land on the wrong
 * side of the window.
 *
 * Two departures from DESIGN §5.12.4's sketch, both STRICTLY LOOSER (a looser
 * certified bound is always sound; a tighter uncertified one is not):
 *
 *   1. The hanging/approach/kill/chain block is bounded by the TOTAL
 *      catalogue material on the board rather than by the material inside the
 *      exposure masks. DESIGN argues the containment "a unit outside
 *      `strike ∪ strikeIfBought` cannot be attacked next turn", but the strike
 *      maps are built from the CURRENT speeds of existing units
 *      (`tables/threat.ts`, `STRIKE_MOVE_ACTIONS = 3`) while `killActions`
 *      admits PROMOTED forms, and promotion can raise speed (lightning_1 → _2
 *      is 3 → 4, fire_1 → _2 keeps 2 but fire_2 → _3 is 2 → 3). A kill plan
 *      through a promoted, faster attacker can therefore reach a unit outside
 *      `exposure`, and the containment does not hold in general.
 *   2. `CleaveExposure` is bounded by the same total, since `cleaveChain`
 *      returns a sum of victim priors and a side can lose at most all of its
 *      material.
 *
 * `KillAvailable`'s `valueCc / minActions` is at most `valueCc`, so the total
 * prior bounds it too.
 */
export function boundStage2(p: PackedState, t: NodeTables, w: Weights): Centi {
  const cat = activeCatalog();
  const aw = (i: number): number => Math.abs(w.w[i]);

  let priorCcSum = 0;
  let mineSum = 0;
  let rentSum = 0;
  let units = 0;
  let tier2 = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const def = p.defId[slot];
    priorCcSum += priorCc(cat, def);
    mineSum += cat.mine[def];
    rentSum += cat.upkeep[def];
    units++;
    if (cat.tier[def] >= 2) tier2++;
  }
  /** Both sides' catalogue priors in CRYSTALS (+1 for `div100`'s truncation). */
  const material = div100(priorCcSum) + 1;

  // Economy. `stream = Σ_t (γ_{t+1} · (income_t − upkeep_t) · 100) >> 16` over
  // `ECON_HORIZON` turns, so `|stream| ≤ (Σ_t γ_t) · max(income, upkeep) · 100`
  // with `income_t ≤ Σ mine` and `upkeep_t = upkeepDue(side) ≤ Σ upkeep`.
  // `Σ_{t=2..7} GAMMA_Q16[t] / 65536 = 4.22`, bounded by `GAMMA_SUM` below; the
  // feature is a difference of two sides, hence the factor 2. `pstSum` is read
  // off the state exactly rather than bounded.
  const GAMMA_SUM = 5;
  const streamBound = 2 * GAMMA_SUM * (mineSum + rentSum);
  const pstBound = div100(p.pstSumCc[0] + p.pstSumCc[1]) + 1;

  // `waste = Σ (mine − take)` over `ECON_HORIZON` miner-turns per side.
  const wasteBound = 2 * ECON_HORIZON * mineSum + 1;

  // `relocationDebt = Σ actionCost · ACTION_VALUE_CC` over the relocations the
  // DP triggers: at most one per miner per turn, each at most
  // `RELOCATION_MAX_ACTIONS` actions.
  const debtBound = div100(2 * ECON_HORIZON * RELOCATION_MAX_ACTIONS * ACTION_VALUE_CC * units) + 2;

  // `chain[v]` takes at most `tier[v] ≤ 3` victims, each worth at most the
  // dearest catalogue body; summed over the tier-2-and-up bodies of both sides.
  const cleaveBound = 3 * MAX_COST * tier2 + 1;

  let bound = 0;
  bound += aw(F.EconDelta) * (streamBound + pstBound);
  bound += aw(F.DepletionWaste) * wasteBound;
  bound += aw(F.RunwayCliff);
  bound += aw(F.Insolvency) * ECON_HORIZON;
  bound += aw(F.RelocationDebt) * debtBound;
  bound += (aw(F.Hanging) + aw(F.HangingBuy) + aw(F.ApproachRetreat) + aw(F.ApproachStrand)) * material;
  bound += aw(F.StrandPunish) * material;
  bound += aw(F.KillAvailable) * material;
  bound += aw(F.CleaveExposure) * cleaveBound;
  bound += aw(F.AnchorFragility) * 3;
  bound += aw(F.BlockingDeficit) * 2;
  bound += aw(F.CornerInfiltration);
  for (let i = 0; i < INVARIANT_COUNT; i++) bound += aw(INV_BASE + i);

  // `t` carries no term of its own: the exposure masks DESIGN §5.12.4 uses are
  // deliberately unread (departure 1 above), and every other quantity comes
  // straight off `p` and the catalogue.
  void t;
  return bound;
}

