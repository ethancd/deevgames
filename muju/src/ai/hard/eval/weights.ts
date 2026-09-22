/** Phasing accounting bootstrap. See docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md.
 * Material is the separate catalogue-cost block. Cash is 100 cc/crystal;
 * feature23 is the single net live-origin forecast in crystals; PendingValue
 * is already cc. All overlapping/unsupported utility coefficients are zero.
 * This hand-derived source is not tuned strength evidence.
 */
import { NDEF, activeCatalog } from '../core/catalog';
import { CC } from '../types';
import { DEFAULT_MATERIAL_CC, PHASING_EVAL_SCHEMA, type Weights } from '../config';
import { F, FEATURE_COUNT, FEATURE_NAMES } from './features';

export type { Weights } from '../config';

/**
 * Bumped when the vector's SCHEMA changes (book/probe compatibility): the
 * feature count, their meaning, or the file shape `loadWeights` accepts.
 *
 * The NUMBERS changed on 2026-09-20 without a bump — `phasing-hand-priors-v1`
 * replaced the five-nonzero M6 bootstrap (see
 * `docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`). That was deliberate and
 * is the standing rule as of 2026-09-21: a bump invalidates every stored vector
 * (`loadWeights` rejects a version mismatch), including the 33 reviewed JSONs
 * under `repair-2026-09-20/weights/` and the book key, and the schema those
 * files are written against did not move. Read the vector's `label` and
 * `weightsHash` to tell two number sets apart; the version says only whether a
 * file can be loaded at all.
 */
export const WEIGHTS_VERSION = 2;
export const WEIGHTS_FILE_SCHEMA = 'muju-weights-phasing-v1';
export { PHASING_EVAL_SCHEMA } from '../config';

/** Frozen pre-outcome vector. Zero entries are deliberate, not missing features. */
const W: readonly number[] = (() => {
  const w = new Array<number>(FEATURE_COUNT).fill(0);
  w[F.Material] = 100; // informational; Evaluator uses material[] directly
  w[F.BankLiquid] = 100;
  w[F.BankExcess] = 100;
  w[F.EconDelta] = 100;
  w[F.PendingValue] = 1;
  // Hand priors, 2026-09-20 (docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md): the Standard-era
  // default-v1 values for the features whose meaning survives Phasing, plus a cash discount so
  // spending beats hoarding. Measured 53-0-11 vs AIEngineV2 hard on held-out openings. Rent,
  // PstMine, BankConvertible, ElementCoverage, features 24-27, HangingBuy, Inv5/11/15/17/18 stay 0.
  w[F.BankExcess] = 25;
  w[F.HomeInvaded] = -4000;
  w[F.SpawnArea] = 30; w[F.SpawnReserve] = 8; w[F.SpawnZero] = -800; w[F.AnchorDepth] = 25;
  w[F.Infiltration] = 90; w[F.CornerSeal] = -60;
  w[F.HomeThreat] = -400; w[F.HomeCountdown] = -180; w[F.HomePlug] = 220; w[F.HomeRescuers] = 90;
  w[F.Exposure] = -20; w[F.DrawPressure] = -8; w[F.ActionsLeft] = 40;
  w[F.Hanging] = -50; w[F.ApproachRetreat] = -25; w[F.ApproachStrand] = -10; w[F.StrandPunish] = 20;
  w[F.KillAvailable] = 35; w[F.CleaveExposure] = -40; w[F.AnchorFragility] = -120;
  w[F.BlockingDeficit] = -150; w[F.CornerInfiltration] = 300;
  w[F.Inv1SpawnZero] = -800; w[F.Inv2CornerSeal] = -300; w[F.Inv3RetreatSquare] = -250;
  w[F.Inv4StrandUnpunished] = -100; w[F.Inv6FragileAnchor] = -120; w[F.Inv7PromoteNoRunway] = -600;
  w[F.Inv8NoPreAdjacency] = -150; w[F.Inv9ChipAcrossTurn] = -150; w[F.Inv10HomeReachable] = -400;
  w[F.Inv12CleaveLine] = -40; w[F.Inv13Turtle] = -200; w[F.Inv14LiquidityFloor] = -200;
  w[F.Inv16ClockDiscipline] = -200; w[F.Inv19SoftMinerExposed] = -150; w[F.Inv20StrandNoRetreat] = -250;
  return w;
})();

function makeWeights(label: string): Weights {
  return {
    w: Int32Array.from(W),
    material: Int32Array.from(DEFAULT_MATERIAL_CC),
    version: WEIGHTS_VERSION,
    featureSchema: PHASING_EVAL_SCHEMA,
    label,
  };
}

/**
 * The approved accounting bootstrap. Clone before modifications; this exported
 * object is the source default, not a tuned/generated historical vector.
 */
export const DEFAULT_WEIGHTS: Weights = makeWeights('phasing-hand-priors-v1');

/** A deep copy; `Weights` owns two typed arrays. */
export function cloneWeights(w: Weights): Weights {
  return { w: Int32Array.from(w.w), material: Int32Array.from(w.material), version: w.version, label: w.label, featureSchema: w.featureSchema };
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
  schema?: unknown;
  featureSchema?: unknown;
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
    if (typeof v !== 'number' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647) {
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
  if (j.schema !== WEIGHTS_FILE_SCHEMA || j.featureSchema !== PHASING_EVAL_SCHEMA) throw new Error('loadWeights: Phasing feature/schema mismatch');
  if (j.version !== WEIGHTS_VERSION) throw new Error('loadWeights: unsupported Phasing weights version');
  const out: Weights = {
    w: readInts(j.w, FEATURE_COUNT, 'w'), material: readInts(j.material, NDEF, 'material'),
    version: WEIGHTS_VERSION, featureSchema: PHASING_EVAL_SCHEMA,
    label: typeof j.label === 'string' ? j.label : 'loaded-phasing',
  };
  assertCurrentWeights(out);
  return out;
}

/** Runtime boundary: historical generated vectors are never padded or silently reinterpreted. */
export function assertCurrentWeights(w: Weights): void {
  if (!w || w.featureSchema !== PHASING_EVAL_SCHEMA || w.version !== WEIGHTS_VERSION) throw new Error('Phasing weight schema/version mismatch');
  if (!(w.w instanceof Int32Array) || w.w.length !== FEATURE_COUNT || !(w.material instanceof Int32Array) || w.material.length !== NDEF) throw new Error('Phasing weight vector shape mismatch');
}

/** Stable, diffable JSON: feature names alongside the vector, keys in a fixed order. */
export function serializeWeights(w: Weights): string {
  assertCurrentWeights(w);
  const names: Record<string, number> = {};
  for (let i = 0; i < FEATURE_COUNT; i++) names[FEATURE_NAMES[i]] = w.w[i];
  return JSON.stringify(
    {
      schema: WEIGHTS_FILE_SCHEMA,
      featureSchema: w.featureSchema,
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
  for (const ch of w.featureSchema ?? '') mix(ch.charCodeAt(0));
  mix(w.version);
  mix(w.w.length);
  for (let i = 0; i < w.w.length; i++) mix(w.w[i]);
  mix(w.material.length);
  for (let i = 0; i < w.material.length; i++) mix(w.material[i]);
  return (h >>> 0).toString(16).padStart(8, '0');
}
