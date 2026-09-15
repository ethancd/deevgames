/**
 * `Weights` — the evaluation's tunable vector (DESIGN §4.15, §5.12).
 *
 * `Weights` itself is DECLARED in `src/ai/hard/config.ts` (see that module's
 * header: `HardConfig` embeds it and DESIGN §2's layering forbids `config`
 * from importing `eval`), so this module re-exports it verbatim and DESIGN
 * §4.15's stated export site stays exact.
 *
 * SCALE (the one rule every weight in DESIGN §5.12.1 obeys). A score is
 * `Σ_i w[i] · f[i]` in integer centi-crystals, where `f[i]` is the SYMMETRIC
 * DIFFERENCE `f(me) − f(them)` of DESIGN §5.12.1's definition column. Features
 * whose natural definition is a sum of MATERIAL (a cc quantity — `Material`,
 * `PstMine`, `Exposure`, `EconDelta`, `Hanging`, `KillAvailable`,
 * `CleaveExposure`, `RelocationDebt`, ...) carry their value in CRYSTALS, i.e.
 * the cc sum divided by 100, which is exactly the convention DESIGN §5.12.4's
 * `boundStage2` formula writes out for the hanging/approach/kill/chain block
 * (`... · (E_me + E_them) / 100`) and DESIGN §5.12.1 writes out for
 * `RelocationDebt` (`econ.relocationDebt / 100`). Under that rule every number
 * in §5.12.1's `w` column reads as its own sentence: `Material` at 100 is
 * "one crystal of catalogue cost is worth 100 cc" (= DESIGN F9's `cost × 100`
 * priors), `Rent` at −422 is `RENT_PV` per crystal of upkeep per turn,
 * `PstMine` at 60 is "0.6 × the rent-free mining PV", `Hanging` at −50 is
 * "half a crystal per crystal of cost left hanging".
 *
 * `material` (18 params) is the per-definition half of feature `Material`;
 * `Evaluator.stage0` scores it directly as `Σ_d material[d] · (n_me[d] −
 * n_them[d])`, which equals `w[Material] · f[Material]` whenever
 * `w[Material] === 100` and `material[d]` is in cc. DESIGN §5.12 pins
 * `material[fire_1] = 300` during Texel to fix the scale.
 */
import { NDEF, activeCatalog } from '../core/catalog';
import { CC } from '../types';
import { DEFAULT_MATERIAL_CC, type Weights } from '../config';
import { F, FEATURE_COUNT, FEATURE_NAMES } from './features';

export type { Weights } from '../config';

/** Bumped whenever `DEFAULT_WEIGHTS`' numbers change (book/probe compatibility). */
export const WEIGHTS_VERSION = 1;

/**
 * DESIGN §5.12.1's `w` column (features 0–37) and §5.13's penalty column
 * (features 38–57, `Inv1..Inv20`), verbatim.
 *
 * Three rows in §5.13 carry no number: invariant 15 ("structural: any UNKNOWN
 * prover verdict is scored as the bad case", whose `w` cell is an em dash) and
 * invariant 18 ("protocol rule only ... not a feature (bit always 0)"), which
 * are 0 here; invariant 12's cell reads "−40 per chain unit" and is 0/1 here
 * with `w = −40`, because DESIGN §4.15 defines every invariant feature as
 * "value = 1 when violated for the side, else 0" and `invariantBits` returns a
 * 20-BIT MASK with no room for a count (see `eval/invariants.ts`).
 */
const W: readonly number[] = (() => {
  const w = new Array<number>(FEATURE_COUNT).fill(0);
  // stage 0
  w[F.Material] = 100;
  w[F.Rent] = -422;
  w[F.BankLiquid] = 90;
  w[F.BankExcess] = 25;
  w[F.HomeInvaded] = -4000;
  // stage 1
  w[F.PstMine] = 60;
  w[F.BankConvertible] = 20;
  w[F.SpawnArea] = 30;
  w[F.SpawnReserve] = 8;
  w[F.SpawnZero] = -800;
  w[F.AnchorDepth] = 25;
  w[F.Infiltration] = 90;
  w[F.CornerSeal] = -60;
  w[F.HomeThreat] = -400;
  w[F.HomeCountdown] = -180;
  w[F.HomePlug] = 220;
  w[F.HomeRescuers] = 90;
  w[F.Exposure] = -20;
  w[F.DrawPressure] = -8;
  w[F.ActionsLeft] = 40;
  w[F.Corridor] = 0;
  w[F.TierClimb] = 0;
  w[F.ElementCoverage] = 150;
  // stage 2
  w[F.EconDelta] = 80;
  w[F.DepletionWaste] = -30;
  w[F.RunwayCliff] = -600;
  w[F.Insolvency] = -150;
  w[F.RelocationDebt] = -60;
  w[F.Hanging] = -50;
  w[F.HangingBuy] = -30;
  w[F.ApproachRetreat] = -25;
  w[F.ApproachStrand] = -10;
  w[F.StrandPunish] = 20;
  w[F.KillAvailable] = 35;
  w[F.CleaveExposure] = -40;
  w[F.AnchorFragility] = -120;
  w[F.BlockingDeficit] = -150;
  w[F.CornerInfiltration] = 300;
  // stage 2: the twenty invariants (DESIGN §5.13)
  w[F.Inv1SpawnZero] = -800;
  w[F.Inv2CornerSeal] = -300;
  w[F.Inv3RetreatSquare] = -250;
  w[F.Inv4StrandUnpunished] = -100;
  w[F.Inv5PoorMinerSquare] = -400;
  w[F.Inv6FragileAnchor] = -120;
  w[F.Inv7PromoteNoRunway] = -600;
  w[F.Inv8NoPreAdjacency] = -150;
  w[F.Inv9ChipAcrossTurn] = -150;
  w[F.Inv10HomeReachable] = -400;
  w[F.Inv11HomeBare] = -250;
  w[F.Inv12CleaveLine] = -40;
  w[F.Inv13Turtle] = -200;
  w[F.Inv14LiquidityFloor] = -200;
  w[F.Inv15UnknownAsSafe] = 0;
  w[F.Inv16ClockDiscipline] = -200;
  w[F.Inv17SelfBlock] = -60;
  w[F.Inv18WastedEndPlace] = 0;
  w[F.Inv19SoftMinerExposed] = -150;
  w[F.Inv20StrandNoRetreat] = -250;
  return w;
})();

function makeWeights(label: string): Weights {
  return {
    w: Int32Array.from(W),
    material: Int32Array.from(DEFAULT_MATERIAL_CC),
    version: WEIGHTS_VERSION,
    label,
  };
}

/**
 * DESIGN §5.12.1 + §5.13's initial vector. A fresh object every read, so a
 * caller that mutates its copy (Texel, SPSA) cannot corrupt anyone else's —
 * the same discipline `config.ts`'s profiles use.
 */
export const DEFAULT_WEIGHTS: Weights = makeWeights('default-v1');

/** A deep copy; `Weights` owns two typed arrays. */
export function cloneWeights(w: Weights): Weights {
  return { w: Int32Array.from(w.w), material: Int32Array.from(w.material), version: w.version, label: w.label };
}

/**
 * `DEFAULT_WEIGHTS.material` is the catalogue prior `cost × 100` (DESIGN F9);
 * `core/state.ts` maintains exactly that sum incrementally in
 * `p.materialCc`. True whenever the active catalogue is the shipped one, so
 * `eval/features.ts` can use the incremental sum for the weight-free
 * `Material` feature it writes into `out`.
 */
export function materialIsCataloguePrior(w: Weights): boolean {
  const cat = activeCatalog();
  for (let d = 0; d < NDEF; d++) if (w.material[d] !== cat.cost[d] * CC) return false;
  return true;
}

interface WeightsJson {
  version?: number;
  label?: string;
  w?: unknown;
  material?: unknown;
}

function readInts(value: unknown, length: number, what: string): Int32Array {
  if (!Array.isArray(value)) throw new TypeError(`loadWeights: ${what} must be an array of ${length} integers`);
  if (value.length !== length) throw new RangeError(`loadWeights: ${what} has ${value.length} entries, expected ${length}`);
  const out = new Int32Array(length);
  for (let i = 0; i < length; i++) {
    const v: unknown = value[i];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new TypeError(`loadWeights: ${what}[${i}] is not an integer (${String(v)})`);
    }
    out[i] = v;
  }
  return out;
}

/** Parses `serializeWeights`' output (or any equivalent object). Throws on any shape error. */
export function loadWeights(json: unknown): Weights {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new TypeError('loadWeights: expected an object');
  }
  const j = json as WeightsJson;
  const version = typeof j.version === 'number' && Number.isInteger(j.version) ? j.version : WEIGHTS_VERSION;
  const label = typeof j.label === 'string' ? j.label : 'loaded';
  return {
    w: readInts(j.w, FEATURE_COUNT, 'w'),
    material: readInts(j.material, NDEF, 'material'),
    version,
    label,
  };
}

/** Stable, diffable JSON: feature names alongside the vector, keys in a fixed order. */
export function serializeWeights(w: Weights): string {
  const names: Record<string, number> = {};
  for (let i = 0; i < FEATURE_COUNT; i++) names[FEATURE_NAMES[i]] = w.w[i];
  return JSON.stringify(
    {
      version: w.version,
      label: w.label,
      hash: weightsHash(w),
      w: Array.from(w.w),
      material: Array.from(w.material),
      byName: names,
    },
    null,
    2,
  );
}

/**
 * A 32-bit FNV-1a over `version`, `w` and `material`, as eight lowercase hex
 * digits. Deterministic and dependency-free: DESIGN §2's nondeterminism lint
 * bans the node hashing module under `src/ai/hard/**`, and `label` is
 * deliberately NOT hashed, so two
 * differently-named copies of the same vector hash alike (the book header
 * stores `weightsVersion`, not the label).
 */
export function weightsHash(w: Weights): string {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    let x = v | 0;
    for (let b = 0; b < 4; b++) {
      h = Math.imul(h ^ (x & 0xff), 0x01000193) >>> 0;
      x >>= 8;
    }
  };
  mix(w.version);
  mix(w.w.length);
  for (let i = 0; i < w.w.length; i++) mix(w.w[i]);
  mix(w.material.length);
  for (let i = 0; i < w.material.length; i++) mix(w.material[i]);
  return (h >>> 0).toString(16).padStart(8, '0');
}
