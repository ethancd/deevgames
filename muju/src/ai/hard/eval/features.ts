/**
 * The 62 evaluation features (DESIGN §4.15, §5.12.1, §5.13).
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
 *     (`trunc(−x) === −trunc(x)`) for the two views of one fixed position.
 *     The named upkeep policy does not promise rotation/seat equivariance.
 *   - `f(side) − f(other)` for every feature, INCLUDING the penalties: a
 *     penalty the other side commits is a plus for `side`.
 *
 * `extract` writes ONLY the features of the requested stage and leaves the rest
 * of `out` untouched, so `full()` composes the three calls into one vector.
 *
 * PHASING EXCEPTIONS: PendingValue58, ArrivalThreat59 and DisruptPressure60
 * are integer cc; RentShortfall61 is crystals. EconDelta23 now carries only
 * the chronological root-live net forecast. Zero bootstrap weights retain
 * other indicators as diagnostics, without importing their old utility claims.
 *
 * WEIGHT-FREE (DESIGN §4.15 gives `extract` no `Weights`). Feature `Material`
 * is `Σ material[def]`, and `material` is the tunable 18-parameter half of
 * `Weights` — which this function cannot see. It therefore writes the
 * CATALOGUE PRIOR version, `p.materialCc` (`cost × 100`, maintained
 * incrementally by `core/state.ts`), which is what `DEFAULT_WEIGHTS.material`
 * holds (DESIGN F9). `Evaluator.stage0` scores the material term ITSELF, from
 * `w.material` (`evaluate.ts:122-126`), and nothing writes that weighted value
 * back: `full()` copies the vector as `extract` left it (`evaluate.ts:165-169`),
 * so `out[F.Material]` is the catalogue prior and `score === Σ w·f` holds only
 * while `material[d]` is still that prior (`evaluate.ts:17-24`). A caller
 * reading `out` — Texel, `eval-audit.ts` — must score material from
 * `w.material`, never as `w[Material] · out[F.Material]`. See
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
import { ADJ_COUNT, ADJ_LIST, CORNER, CORNER_NEIGHBOURS, CORRIDOR, RECT } from '../core/tables';
import { NDEF, activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN, INACTIVITY_LIMIT } from '../core/state';
import { projectedIncome } from '../core/income';
import type { NodeTables } from '../tables/context';
import { KILL_IMPOSSIBLE } from '../tables/kill';
import { Approach } from '../tables/approach';
import { ECON_HORIZON } from '../tables/economy';
import type { Weights } from '../config';
import { INVARIANT_COUNT, invariantBits } from './invariants';
import { newPendingDiagnostics, pendingDiagnostics } from './pending';

export const FEATURE_COUNT = 62;

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
  /** Legacy public name retained at29: hanging specifically dependent on paid arrivals. */
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
  // Phasing accounting and explicit, zero-weight tactical diagnostics.
  PendingValue: 58,
  ArrivalThreat: 59,
  DisruptPressure: 60,
  RentShortfall: 61,
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

/**
 * `DrawPressure`'s full scale: the value the feature takes when the kill clock
 * stands ON its terminal ply. It is a fixed 100 because that is what `clock²`
 * reached at the TEN-ply limit the feature and its weight column were authored
 * against; `muju-phasing-2` (amendment A4) doubled the limit to 20 and this
 * scale absorbed it, and `muju-phasing-3` (owner decision 2026-09-22, the KILL
 * CLOCK) brings the limit back to 10 — the scale still absorbs it, unchanged
 * code, because it is defined in terms of `INACTIVITY_LIMIT` rather than a
 * literal. NO coefficient changes here — `DEFAULT_WEIGHTS.w[F.DrawPressure]`
 * is still 0 and every other weight is untouched; only the feature's own scale
 * is pinned to the limit.
 */
const DRAW_PRESSURE_FULL_SCALE = 100;
/** `INACTIVITY_LIMIT²`, so `clock²·FULL_SCALE/DENOM` is `FULL_SCALE` at the clock's end. */
const DRAW_PRESSURE_DENOM = INACTIVITY_LIMIT * INACTIVITY_LIMIT;

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

/**
 * E3.2 B3 (`config.ts EvalFix.infiltrationPerAnchor`, OFF by default): how many
 * of `victim`'s anchors `me`'s bodies VOID, counted per anchor.
 *
 * The shipped `tables/geometry.ts infiltrationAnchors` counts ordered PAIRS
 * (own unit at `s`, enemy unit at `a`) with `s` inside `RECT[enemy][a]`. With
 * the corners at squares 0 and 99, `s ∈ RECT[BLACK][a] ⟺ a ∈ RECT[WHITE][s]`,
 * so that relation is SYMMETRIC: the two sides' pair counts are equal pair for
 * pair and the symmetric difference `f(me) − f(them)` is 0 on every legal
 * position — proved on all 10,000 square pairs, and measured 0 on 2,151
 * positions across seven corpora with the raw count non-zero on 1,064 of 2,000
 * side-positions (`E3.1-FEATURE-AUDIT` §(b) / L1-F8, `E3.1-CONTRIBUTIONS`
 * L4-F1). A weight of +90 on a named strategic concept buys exactly nothing.
 *
 * What DESIGN §5.8 asks for is the ANCHORS VOIDED, and `core/spawn.ts
 * anchorsVoidedBy(p, victimSide, s)` is the engine's own statement of that
 * quantity: an anchor is voided when an enemy body stands inside its
 * rectangle, and an anchor already carrying one is not voided twice (it
 * `continue`s on `bbIntersects(box, enemy)`). Summed over `me`'s bodies with
 * that exclusion honoured, the total is simply the number of DISTINCT
 * `victim` anchors whose rectangle holds at least one of `me`'s units, which is
 * what this function counts. It is not symmetric — one body deep in the enemy
 * half can void ten anchors while the enemy's ten bodies void one of ours — so
 * the difference is a real quantity: non-zero on 294 of 1,000 fuzz positions,
 * typically 180 cc, up to 720 cc.
 *
 * `anchorsVoidedBy` itself is NOT called: it answers the hypothetical "if an
 * intruder stood on the EMPTY square `s`", and passing it one of `me`'s own,
 * already-placed unit squares makes that square part of the occupancy it skips
 * on — the bug DEVIATIONS M9 records and "fixed" into the current pair count.
 * `RECT` is the only table needed and `core/tables.ts` is already imported
 * here, so the fix borrows the semantics, not the call.
 */
function voidedAnchors(p: PackedState, me: Side, victim: Side): number {
  const rect = RECT[victim];
  let voided = 0;
  for (let a = 0; a < MAX_SLOTS; a++) {
    const anchor = p.sq[a];
    if (anchor === DEAD || p.owner[a] !== victim) continue;
    const box = rect[anchor];
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== me) continue;
      if (bbHas(box, s)) {
        voided++;
        break;
      }
    }
  }
  return voided;
}

/**
 * STRATEGOS W1.6 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.6), `EvalFix.clockLedger` only — `strategy/ledger.ts
 * pliesRemaining`'s own `r` formula (RULE `core/state.ts:1370-1373`
 * `makeEndPlace`), DUPLICATED here rather than imported: DESIGN §2's layering
 * (`lab/hard-ai/deps.ts`) lets only `search`/`engine` import `strategy`, and
 * `eval` is neither, so the two copies must be kept in sync by hand (the same
 * arrangement `invariants.ts leadCc` already uses for a different cycle —
 * see that function's own doc). `tests/ai/hard/strategos-eval.test.ts` pins
 * this copy against `strategy/ledger.ts`'s directly.
 */
function nodeR(p: PackedState): number {
  return p.progress === 1 ? INACTIVITY_LIMIT + 1 : INACTIVITY_LIMIT - p.clock;
}

/**
 * `strategy/ledger.ts futureMiningEvents`'s parity rule, duplicated for the
 * same layering reason `nodeR` states. How many of `side`'s own future mining
 * events (future `END_ACTION`s) fall inside the next `r` `END_PLACE`s.
 */
function nodeFutureMiningEvents(p: PackedState, side: Side, r: number): number {
  const isMoverSide = side === p.side;
  const total = isMoverSide ? Math.ceil(r / 2) : Math.floor(r / 2);
  const alreadyMined = isMoverSide && p.phase === 0 && r >= 1 ? 1 : 0;
  return Math.max(0, total - alreadyMined);
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
  out[F.Infiltration] =
    t.evalFix !== null && t.evalFix.infiltrationPerAnchor === true
      ? voidedAnchors(p, me, them) - voidedAnchors(p, them, me)
      : gMe.infiltrationAnchors - gThem.infiltrationAnchors;
  out[F.CornerSeal] = gMe.cornerNeighboursHeld - gThem.cornerNeighboursHeld;
  out[F.HomeThreat] = (hMe.actionsToCorner <= 4 ? 1 : 0) - (hThem.actionsToCorner <= 4 ? 1 : 0);
  out[F.HomeCountdown] = Math.max(0, 4 - hMe.turnsToCorner) - Math.max(0, 4 - hThem.turnsToCorner);
  out[F.HomePlug] = hMe.plug - hThem.plug;
  out[F.HomeRescuers] = hMe.rescuers - hThem.rescuers;
  out[F.Exposure] = div100(exposedPriorCc(p, me, t, cat) - exposedPriorCc(p, them, t, cat));

  const clock = p.drawRuleOn === 1 ? p.clock : 0;
  if (t.evalFix !== null && t.evalFix.clockLedger === true) {
    // STRATEGOS W1.6: a CHEAP per-node PROJECTION of the mined-total margin at
    // the clock's end, replacing the sign-only `lead` below. "Cheap" means one
    // pass over each side's living units for `projectedIncome` (already the
    // eval's own per-node income read, `core/income.ts`) times how many of the
    // side's OWN future mining events fall inside the window
    // (`nodeFutureMiningEvents`, the parity rule above) — a SINGLE-event
    // stay-put rate held constant across the window, not `ledger.ts`'s own
    // per-turn reserve-depletion/rent-release simulation, which is exactly
    // the accounting this feature cannot afford at every node (module doc,
    // "the accounting the eval tables already compute"). Never the bank or
    // `U`: `strategy/types.ts ClockReadingCore.marginL`'s own doc is why —
    // rewarding cash would reward hoarding, the 2026-09-20 repair handoff's
    // documented failure.
    const r = nodeR(p);
    const projMe = p.gained[me] + nodeFutureMiningEvents(p, me, r) * projectedIncome(p, me);
    const projThem = p.gained[them] + nodeFutureMiningEvents(p, them, r) * projectedIncome(p, them);
    const margin = projMe - projThem;
    // Quadratic in the clock, same as the legacy formula below, but in
    // crystals: `margin` is already a crystal quantity, not a 0..100-normalised
    // one, so the clamp below — not this division — is what keeps the feature
    // inside its documented range. CHOICE (the W1.6 brief's formula,
    // `margin · clock² / 100`: one crystal of projected margin at clock 9 is
    // worth ~0.8 feature units, ~6.5 cc at the frozen weight; falsifier: the
    // paired exam cases of plan W1.13, where a projected clock loser must
    // prefer contact to a quiet turn).
    const scaled = (margin * clock * clock) / 100;
    // Symmetric ("round half away from zero"), not `Math.round` (which
    // rounds every half toward +infinity — `Math.round(-0.5)` is `-0`,
    // `Math.round(-1.5)` is `-1` — breaking EXACT antisymmetry at a tie;
    // `tests/ai/hard/strategos-eval.test.ts` checks this at a constructed
    // half-integer margin, not just typical corpus values where a tie is
    // rare).
    const rounded = scaled === 0 ? 0 : Math.sign(scaled) * Math.round(Math.abs(scaled));
    // DERIVED (plan B.1b: "the DrawPressure replacement must be clamped to
    // the feature's ±100 range", the range the legacy branch's
    // `DRAW_PRESSURE_FULL_SCALE` spans): at the frozen weight −8 this term
    // never exceeds 800 cc.
    const clamped = rounded > 100 ? 100 : rounded < -100 ? -100 : rounded;
    // POLARITY (derive, do not assume — the 2026-09-22 kill-clock postmortem:
    // this feature's polarity was inverted once already). `DEFAULT_WEIGHTS`
    // is frozen at `w[F.DrawPressure] = -8`; the score contribution from
    // `me`'s point of view is `w · out[F.DrawPressure]`. For a side PROJECTED
    // TO WIN the clock (`margin > 0`) to score BETTER as the clock advances,
    // `w · out` must be POSITIVE and growing with `clock²` — since `w` is
    // negative, `out` must therefore be NEGATIVE when `margin > 0`: the sign
    // of `clamped` (which already carries `margin`'s sign) must be FLIPPED.
    out[F.DrawPressure] = -clamped;
  } else {
    // `muju-phasing-3` (owner decision 2026-09-22): the kill clock's verdict is
    // the higher MINED TOTAL (`gained[]`, which already carries Black's
    // handicap folded in — `pack` above), not a material/bank lead. Sign the
    // feature by that quantity so it reads "am I the side the clock is about to
    // declare the winner", which is the thing that is now actually true when it
    // runs out — under `muju-phasing-1`/`-2` the clock only ever drew, so no
    // lead of any kind was "correct" to sit on; here one specific lead is.
    const lead = p.gained[me] - p.gained[them];
    // Quadratic in HOW FAR ALONG the clock is, not in its raw ply count, so the
    // feature keeps the 0..100 range its (zero) bootstrap weight was authored
    // against as the limit moved 10 -> 20 (A4) -> 10 (this change). The
    // magnitude is truncated before the sign is applied, so `f(side) = -f(other)`
    // still holds exactly.
    const pressure = ((clock * clock * DRAW_PRESSURE_FULL_SCALE) / DRAW_PRESSURE_DENOM) | 0;
    // POLARITY (2026-09-22, kill-clock lane 5 + coordinator): `DEFAULT_WEIGHTS`
    // is frozen and its `DrawPressure` weight is NEGATIVE, fitted under the draw
    // clock where the running clock HURT the side that was ahead. Under the kill
    // clock the side ahead on mined total is the side the clock is about to
    // declare the winner, so the same magnitude must act with the opposite
    // polarity. That is expressed here, in the feature, so the weight vector
    // stays byte-identical: `w · f = (−|w|) · (−sign(lead) · pressure)` rewards
    // the leader and presses the trailer to kill. With the other polarity the
    // DESKTOP profile handed the turn back instead of taking a free capture on
    // turn 1 (`e2e/ai-worker.spec.ts`), rewarded for letting the clock run while
    // behind. Retuning the sign into the weight itself is the next campaign's job.
    out[F.DrawPressure] = -(lead > 0 ? 1 : lead < 0 ? -1 : 0) * pressure;
  }

  out[F.ActionsLeft] = p.phase === 1 ? (p.side === me ? p.actions : -p.actions) : 0;
  out[F.Corridor] = corridorUnits(p, me, cat) - corridorUnits(p, them, cat);
  out[F.TierClimb] = tierClimb(p, me, cat) - tierClimb(p, them, cat);
  out[F.ElementCoverage] = elementCoverage(p, me, cat) - elementCoverage(p, them, cat);
}

// --- stage 2 ---------------------------------------------------------------

/** Legacy table helper: all paid arrivals have needsBuy=0. The caller partitions arrival dependence explicitly. */
function hangingCc(p: PackedState, side: Side, t: NodeTables, needsBuy: 0 | 1, cat: Catalog, excluded: Uint8Array): Centi {
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    if (excluded[slot]) continue;
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

/** Σ `chain[v]` over ALL the enemy's units — what they can harvest from `side`.
 * Tier I counts since `muju-phasing-4` (Cleave has no tier cap). */
function cleaveExposureCc(p: PackedState, side: Side, t: NodeTables): Centi {
  const enemy = (1 - side) as Side;
  let sum = 0;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
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

const PENDING_DIAGNOSTICS = newPendingDiagnostics();
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

  // One live-origin net ledger, with pending production attributed separately.
  out[F.EconDelta] = Math.trunc((eMe.livePVcc - eThem.livePVcc) / CC);
  const pending = pendingDiagnostics(p, t, sc, ply, PENDING_DIAGNOSTICS);
  out[F.PendingValue] = Math.trunc(pending.valueCc[me] - pending.valueCc[them]);
  out[F.ArrivalThreat] = pending.arrivalThreatCc[me] - pending.arrivalThreatCc[them];
  out[F.DisruptPressure] = Math.trunc(pending.disruptPressureCc[me] - pending.disruptPressureCc[them]);
  out[F.RentShortfall] = eMe.rentShortfall - eThem.rentShortfall;
  out[F.DepletionWaste] = eMe.waste - eThem.waste;
  out[F.RunwayCliff] =
    (p.bank[me] + eMe.income[0] < eMe.upkeep[0] ? 1 : 0) - (p.bank[them] + eThem.income[0] < eThem.upkeep[0] ? 1 : 0);
  out[F.Insolvency] =
    Math.max(0, ECON_HORIZON - eMe.turnsToInsolvency) - Math.max(0, ECON_HORIZON - eThem.turnsToInsolvency);
  out[F.RelocationDebt] = div100(eMe.relocationDebt - eThem.relocationDebt);

  // The legacy static hanging table and actual incoming-Act arrival comparison
  // have different horizons. Remove named arrival-dependent root victims from
  // the former, never subtract unmatched totals or double-count a target.
  const arrivalVictimDifference = pending.arrivalThreatCc[them] - pending.arrivalThreatCc[me];
  out[F.Hanging] = div100(hangingCc(p, me, t, 0, cat, pending.arrivalDependentVictims) - hangingCc(p, them, t, 0, cat, pending.arrivalDependentVictims));
  out[F.HangingBuy] = div100(arrivalVictimDifference);
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
  out[F.CleaveExposure] = div100(cleaveExposureCc(p, me, t) - cleaveExposureCc(p, them, t));
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

/** No finite lazy certificate is claimed for the Phasing accounting bootstrap.
 * Callers outside Evaluator also receive an explicitly conservative sentinel. */
export function boundStage2(_p: PackedState, _t: NodeTables, _w: Weights): Centi {
  return Number.POSITIVE_INFINITY;
}
