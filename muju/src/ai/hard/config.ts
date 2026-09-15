/**
 * `HardConfig` and the four device profiles (DESIGN §4.17, §6.3, §8).
 *
 * DESIGN §4 exports the component config shapes from the modules that consume
 * them (`SearchConfig`/`QuiesceConfig`/`TimeConfig`/`DeviceProfile` from
 * `search/*`, `GenConfig`/`ActionSearchConfig`/`PurchaseConfig` from `gen/*`,
 * `DfpnConfig` from `tactics/dfpn.ts`, `Weights` from `eval/weights.ts`,
 * `Book` from `book/format.ts`). `HardConfig extends SearchConfig` and embeds
 * all of them, but DESIGN §2's layering lets `config.ts` import `types.ts` and
 * nothing else — importing `search`/`gen`/`eval`/`book` from here would be a
 * layering violation (and a cycle: those layers import `config`). The shapes
 * are therefore DECLARED here, once, and the modules DESIGN names MUST
 * re-export them (`export type { SearchConfig } from '../config'`) so §4's
 * stated export sites stay exact. See DEVIATIONS.md under M4.
 *
 * Numbers are DESIGN §8's table and §6.3's profile table. Two groups are
 * provisional and owned by a later milestone, marked PROVISIONAL below:
 * `PurchaseWeights` (M13 `gen/purchase.ts`; DESIGN §5.5 names the terms but
 * gives no coefficients) and `weights` (M12 `eval/weights.ts` supplies
 * `DEFAULT_WEIGHTS`; until then every feature weight is 0 and only the
 * `cost × 100` material priors of F9 are populated).
 */
// --- gen/actionsearch.ts ---
export interface ActionSearchConfig {
  /** per-action-index beam widths, ET §3.5. */
  widths: Int32Array;
  keep: number;
  ttBits: number;
}

// --- gen/purchase.ts ---
export interface PurchaseWeights {
  mineCc: number;
  safeCc: number;
  blockCc: number;
  strikeCc: number;
  anchorCc: number;
  zeroSpawnCc: number;
  liquidityCc: number;
  homeRaceCc: number;
}

export interface PurchaseConfig {
  maxBodies: number;
  maxMultisets: number;
  maxPlans: number;
  /** top-S squares of `spawn.legal` considered per multiset. */
  squares: number;
  keepPerMultiset: number;
  weights: PurchaseWeights;
}

// --- gen/generate.ts ---
export interface GenConfig {
  K: number;
  maxPlacePlans: number;
  action: ActionSearchConfig;
  purchase: PurchaseConfig;
  maxPromotions: number;
  reference: boolean;
}

// --- tactics/dfpn.ts ---
export interface DfpnConfig {
  maxTurns: number;
  /** Absolute cap; `search/root.ts` further clamps it to `meter.limit / 16` (DESIGN §8). */
  nodeBudget: number;
  /** ε in Q2 fixed point: 5 = 1.25. */
  epsilonQ2: number;
  ttBits: number;
}

// --- search/quiesce.ts ---
export interface QuiesceConfig {
  maxPly: number;
  deltaMarginCc: number;
  maxCandidates: number;
}

// --- search/time.ts ---
export interface DeviceProfile {
  unitsPerMs: number;
  samples: number;
}

export interface TimeConfig {
  minMs: number;
  maxMs: number;
  baseMs: number;
  abortFactor: number;
}

// --- eval/weights.ts ---
export interface Weights {
  /** [FEATURE_COUNT] cc. */
  w: Int32Array;
  /** [NDEF] cc material priors — `cost × 100`, no rent term (DESIGN F9). */
  material: Int32Array;
  version: number;
  label: string;
}

// --- book/format.ts ---
export interface BookEntry {
  keyLo: number;
  keyHi: number;
  turnLo: number;
  turnHi: number;
  /** bit0 negated, bit1 exact. */
  flags: number;
  score: number;
  count: number;
}

export interface Book {
  lookup(lo: number, hi: number): BookEntry | null;
  size: number;
  handicap: number;
  mapHash: number;
  weightsVersion: number;
}

// --- search/pvs.ts ---
export interface SearchConfig {
  maxDepth: number;
  aspirationCc: number;
  lmrRank1: number;
  lmrRank2: number;
  futilityMarginCc: number;
  useLmr: boolean;
  useAspiration: boolean;
  useFutility: boolean;
  useExtensions: boolean;
  quiesce: QuiesceConfig;
  gen: GenConfig;
  genInterior: GenConfig;
  ttBits: number;
  dfpn: DfpnConfig;
  useDfpn: boolean;
}

export interface HardConfig extends SearchConfig {
  time: TimeConfig;
  profile: DeviceProfile;
  ttBitsMacro: number;
  ttBitsTurn: number;
  K: number;
  kInterior: number;
  weights: Weights;
  book: Book | null;
}

/** DESIGN §4.15 `FEATURE_COUNT`; `eval/features.ts` (M12) is the authority and
 * `tests/ai/hard/interfaces.test.ts` cross-checks it once that module lands. */
const FEATURE_COUNT = 58;

/**
 * `cost × 100` in catalogue order (units.ts:8-222) — the material priors of
 * DESIGN F9, with no rent term (`Rent` is its own feature, `RENT_PV = 422`).
 * `tests/ai/hard/catalog.test.ts` pins these against `catalog.cost`.
 */
export const DEFAULT_MATERIAL_CC: readonly number[] = [
  300, 700, 1500, // fire 1/2/3
  300, 700, 1500, // lightning 1/2/3
  400, 800, 1600, // water 1/2/3
  400, 800, 1600, // shadow 1/2/3
  500, 900, 1700, // plant 1/2/3
  500, 900, 1700, // metal 1/2/3
];

/** PROVISIONAL (M13 owns the shipped values; DESIGN §5.5 names the terms only). */
function purchaseWeights(): PurchaseWeights {
  return {
    mineCc: 1,
    safeCc: 100,
    blockCc: 200,
    strikeCc: 300,
    anchorCc: 20,
    zeroSpawnCc: 400,
    liquidityCc: 50,
    homeRaceCc: 5000,
  };
}

/** PROVISIONAL (M12 `eval/weights.ts` replaces this with `DEFAULT_WEIGHTS`). */
export function placeholderWeights(): Weights {
  return {
    w: new Int32Array(FEATURE_COUNT),
    material: Int32Array.from(DEFAULT_MATERIAL_CC),
    version: 0,
    label: 'placeholder-m4',
  };
}

function purchaseConfig(): PurchaseConfig {
  // `maxBodies` 4, S = 8 squares, keep 3 per multiset (DESIGN §8, §5.5);
  // ≤ 35 multisets and ≤ 12 purchase plans are §5.5's own bounds.
  return { maxBodies: 4, maxMultisets: 35, maxPlans: 12, squares: 8, keepPerMultiset: 3, weights: purchaseWeights() };
}

function genConfig(K: number, maxPlacePlans: number, widths: readonly number[], ttBits: number): GenConfig {
  return {
    K,
    maxPlacePlans,
    action: { widths: Int32Array.from(widths), keep: 4, ttBits },
    purchase: purchaseConfig(),
    maxPromotions: 8,
    reference: false,
  };
}

interface ProfileShape {
  K: number;
  kInterior: number;
  widths: readonly number[];
  placePlansRoot: number;
  placePlansInterior: number;
  quiesceMaxPly: number;
  ttBitsMacro: number;
  ttBitsTurn: number;
  minMs: number;
  maxMs: number;
  baseMs: number;
  unitsPerMs: number;
}

/** DESIGN §6.3's profile table, verbatim. */
const DESKTOP_SHAPE: ProfileShape = {
  K: 24, kInterior: 16, widths: [6, 4, 3, 2], placePlansRoot: 16, placePlansInterior: 8,
  quiesceMaxPly: 4, ttBitsMacro: 19, ttBitsTurn: 18, minMs: 2000, maxMs: 6000, baseMs: 3000, unitsPerMs: 600,
};
const MIDRANGE_SHAPE: ProfileShape = {
  K: 16, kInterior: 12, widths: [5, 3, 2, 2], placePlansRoot: 12, placePlansInterior: 6,
  quiesceMaxPly: 3, ttBitsMacro: 18, ttBitsTurn: 17, minMs: 1500, maxMs: 4000, baseMs: 2500, unitsPerMs: 400,
};
const PHONE_SHAPE: ProfileShape = {
  K: 12, kInterior: 8, widths: [4, 3, 2, 1], placePlansRoot: 8, placePlansInterior: 4,
  quiesceMaxPly: 2, ttBitsMacro: 15, ttBitsTurn: 16, minMs: 1200, maxMs: 2500, baseMs: 1800, unitsPerMs: 200,
};

/** Pessimistic first-turn throughput until `calibrate()`/`updateProfile` measures one (DESIGN §8). */
export const INITIAL_UNITS_PER_MS = 200;

function makeConfig(shape: ProfileShape, book: Book | null): HardConfig {
  return {
    maxDepth: 12,
    aspirationCc: 200,
    lmrRank1: 6,
    lmrRank2: 12,
    futilityMarginCc: 200,
    // DESIGN §5.11.5: every refinement ships behind its own flag and is
    // SPRT-gated separately at M20. M17 builds them; they stay off until then.
    useLmr: false,
    useAspiration: false,
    useFutility: false,
    useExtensions: false,
    quiesce: { maxPly: shape.quiesceMaxPly, deltaMarginCc: 300, maxCandidates: 8 },
    gen: genConfig(shape.K, shape.placePlansRoot, shape.widths, shape.ttBitsTurn),
    genInterior: genConfig(shape.kInterior, shape.placePlansInterior, shape.widths, shape.ttBitsTurn),
    ttBits: shape.ttBitsMacro,
    dfpn: { maxTurns: 3, nodeBudget: 4000, epsilonQ2: 5, ttBits: 17 },
    // M16 builds `tactics/dfpn.ts`; the flag turns on when its gate is green.
    useDfpn: false,
    time: { minMs: shape.minMs, maxMs: shape.maxMs, baseMs: shape.baseMs, abortFactor: 3 },
    profile: { unitsPerMs: INITIAL_UNITS_PER_MS, samples: 0 },
    ttBitsMacro: shape.ttBitsMacro,
    ttBitsTurn: shape.ttBitsTurn,
    K: shape.K,
    kInterior: shape.kInterior,
    weights: placeholderWeights(),
    book,
  };
}

export const DESKTOP: HardConfig = makeConfig(DESKTOP_SHAPE, null);
export const MIDRANGE: HardConfig = makeConfig(MIDRANGE_SHAPE, null);
export const PHONE: HardConfig = makeConfig(PHONE_SHAPE, null);
/** Fixed work; identical search shape to DESKTOP, book supplied per run. */
export const LAB: HardConfig = makeConfig(DESKTOP_SHAPE, null);

/**
 * DESIGN §6.3's trigger column: PHONE below 250 units/ms or with ≤ 2 GB of
 * device memory, MIDRANGE from 250 to below 600, DESKTOP at 600 and above.
 * A fresh config object is returned each call, so callers may mutate it.
 */
export function profileFor(unitsPerMs: number, deviceMemoryGb: number | undefined): HardConfig {
  const shape =
    unitsPerMs < 250 || (deviceMemoryGb !== undefined && deviceMemoryGb <= 2)
      ? PHONE_SHAPE
      : unitsPerMs < 600
        ? MIDRANGE_SHAPE
        : DESKTOP_SHAPE;
  const cfg = makeConfig(shape, null);
  cfg.profile = { unitsPerMs, samples: 0 };
  return cfg;
}
