/**
 * EMBER — noisy, attention-dependent interoception (src/body/interoception.ts)
 *
 * Reads the true BodyState through a gaussian noise model (sigma scales with
 * fatigue + damage) and buckets the noisy readings qualitatively. The pilot
 * never sees this module's inputs directly, only its output.
 */

import {
  BUCKET_EDGES,
  VIABLE_BANDS,
  type BodyState,
  type BodyVar,
  type Bucket,
  type Interoception,
  type Mode,
  type Rng,
  type SkillName,
  type WorldState,
} from '../core/types';
import { DEFEND_EXIT, SIGMA_BASE, SIGMA_SCALE, clamp01 } from './constants';
import { normalizedDeviation } from './deviation';
import { recentSlope } from './history';

// --------------------------------------------------------------- noise

/** Standard normal draw via Box-Muller, fed entirely by `rng.next()` so it
 *  stays deterministic for a given seed. */
function gaussian(rng: Rng): number {
  const u1 = Math.max(rng.next(), Number.EPSILON);
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Noise stddev grows with fatigue + damage: at high fatigue/damage a
 *  reading can land a full bucket away from truth. */
function sigmaFor(body: BodyState): number {
  return SIGMA_BASE + SIGMA_SCALE * clamp01(body.fatigue + body.damage);
}

function noisyReading(value: number, sigma: number, rng: Rng): number {
  return clamp01(value + gaussian(rng) * sigma);
}

function bucketOf(value: number): Bucket {
  const [e0, e1, e2, e3] = BUCKET_EDGES;
  if (value < e0) return 'very_low';
  if (value < e1) return 'low';
  if (value < e2) return 'mid';
  if (value < e3) return 'high';
  return 'very_high';
}

// -------------------------------------------------------------- salience

const REGION_VARS: Exclude<BodyVar, 'stability'>[] = [
  'fuel',
  'heat',
  'damage',
  'fatigue',
  'activation',
];

const SALIENCE_ORDER: Partial<Record<Mode, BodyVar[]>> = {
  DEFEND: ['activation', 'damage', 'fuel', 'heat', 'fatigue'],
  RECOVER: ['damage', 'fatigue', 'fuel', 'heat', 'activation'],
  CONSERVE: ['fuel', 'heat', 'activation', 'damage', 'fatigue'],
};

function salienceOrderFor(body: BodyState, mode: Mode): BodyVar[] {
  const fixed = SALIENCE_ORDER[mode];
  if (fixed) return fixed;
  // EXPLORE: rank by how deviant each var currently is.
  return [...REGION_VARS].sort(
    (a, b) => normalizedDeviation(b, body[b]) - normalizedDeviation(a, body[a]),
  );
}

const QUALITIES: Record<BodyVar, [string[], string[], string[]]> = {
  // [low-tier, mid-tier, high-tier] qualities; damage/fatigue/activation are
  // "bad when high", fuel/heat are "bad when low" — tier labels reflect that.
  fuel: [['dim', 'hungry'], ['steady'], ['bright', 'well-fed']],
  heat: [['cold', 'shivering'], ['comfortable'], ['warm', 'flushed']],
  damage: [['unhurt'], ['bruised'], ['wounded', 'bleeding']],
  fatigue: [['fresh'], ['tired'], ['exhausted', 'heavy']],
  activation: [['calm'], ['alert'], ['tense', 'on edge']],
  stability: [['shaky'], ['steadying'], ['grounded']],
};

function qualitiesFor(v: BodyVar, bucket: Bucket): string[] {
  const tiers = QUALITIES[v];
  if (bucket === 'very_low' || bucket === 'low') return tiers[0];
  if (bucket === 'mid') return tiers[1];
  return tiers[2];
}

// ---------------------------------------------------------------- drives

interface DriveDef {
  drive: string;
  kind: 'depletion' | 'accumulation';
  varKey: Exclude<BodyVar, 'stability'>;
}

const DRIVES: DriveDef[] = [
  { drive: 'safety', kind: 'accumulation', varKey: 'activation' },
  { drive: 'fuel', kind: 'depletion', varKey: 'fuel' },
  { drive: 'warmth', kind: 'depletion', varKey: 'heat' },
  { drive: 'rest', kind: 'accumulation', varKey: 'fatigue' },
];

function driveUrgencyAndForecast(
  body: BodyState,
  def: DriveDef,
): { urgency: number; predictedTicksToLimit?: number } {
  const [lo, hi] = VIABLE_BANDS[def.varKey];
  const value = body[def.varKey];
  const slope = recentSlope(body, def.varKey);

  if (def.kind === 'depletion') {
    const margin = lo * 1.3;
    const urgency = value < margin ? clamp01((margin - value) / Math.max(margin, 1e-6)) : 0;
    const predictedTicksToLimit =
      slope < 0 ? Math.max(0, Math.round((value - lo) / -slope)) : undefined;
    return { urgency, predictedTicksToLimit };
  }
  const margin = hi * 0.85;
  const urgency = value > margin ? clamp01((value - margin) / Math.max(1 - margin, 1e-6)) : 0;
  const predictedTicksToLimit =
    slope > 0 ? Math.max(0, Math.round((hi - value) / slope)) : undefined;
  return { urgency, predictedTicksToLimit };
}

// ----------------------------------------------------------------- trend

const TREND_LABEL: Record<Exclude<BodyVar, 'stability'>, string> = {
  fuel: 'fuel',
  heat: 'warmth',
  damage: 'damage',
  fatigue: 'fatigue',
  activation: 'activation',
};

const TREND_EPS = 0.0006;

function computeTrend(body: BodyState): string {
  let bestVar: Exclude<BodyVar, 'stability'> | null = null;
  let bestAbs = TREND_EPS;
  let bestSlope = 0;
  for (const v of REGION_VARS) {
    const s = recentSlope(body, v);
    if (Math.abs(s) > bestAbs) {
      bestAbs = Math.abs(s);
      bestSlope = s;
      bestVar = v;
    }
  }
  if (!bestVar) return 'stable';
  return `${TREND_LABEL[bestVar]} ${bestSlope > 0 ? 'rising' : 'falling'}`;
}

// --------------------------------------------------------- regulation list

function availableRegulation(body: BodyState, mode: Mode): SkillName[] {
  const regs = new Set<SkillName>(['wait', 'focus']);
  const [fuelLo] = VIABLE_BANDS.fuel;
  const [heatLo] = VIABLE_BANDS.heat;
  const [, fatigueHi] = VIABLE_BANDS.fatigue;
  const [, damageHi] = VIABLE_BANDS.damage;

  if (body.fatigue > fatigueHi * 0.7 || body.damage > damageHi * 0.7) regs.add('rest');
  if (body.fuel < fuelLo * 1.5) {
    regs.add('gather');
    regs.add('consume');
  }
  if (body.heat < heatLo * 1.3) {
    regs.add('shelter');
    regs.add('move_to');
  }
  if (mode === 'DEFEND' || body.activation > DEFEND_EXIT) regs.add('flee');
  return [...regs];
}

// -------------------------------------------------------------- exported

export function computeInteroception(
  body: BodyState,
  _world: WorldState,
  attention: string | null,
  rng: Rng,
): Interoception {
  const introRng = rng.fork('intero');
  const sigma = sigmaFor(body);

  const activationBucket = bucketOf(noisyReading(body.activation, sigma, introRng));
  const capacityTrue = clamp01(body.fuel * 0.7 + (1 - body.fatigue) * 0.3);
  const capacityBucket = bucketOf(noisyReading(capacityTrue, sigma, introRng));
  const stabilityBucket = bucketOf(noisyReading(body.stability, sigma, introRng));
  const temperatureBucket = bucketOf(noisyReading(body.heat, sigma, introRng));
  const globalConfidence = clamp01(1 - sigma * 1.5);

  const order = salienceOrderFor(body, body.mode);
  const salient = order.map((v) => {
    const attended = attention === v;
    const regionSigma = attended ? sigma * 0.35 : sigma;
    const reading = noisyReading(body[v], regionSigma, introRng);
    const bucket = bucketOf(reading);
    let confidence = clamp01(1 - regionSigma * 2);
    if (attended) confidence = clamp01(confidence * 1.5);
    return { region: v, qualities: qualitiesFor(v, bucket), confidence };
  });

  const drives = DRIVES.map((def) => {
    const { urgency, predictedTicksToLimit } = driveUrgencyAndForecast(body, def);
    return { drive: def.drive, urgency, predictedTicksToLimit };
  }).sort((a, b) => b.urgency - a.urgency);

  return {
    global: {
      activation: activationBucket,
      capacity: capacityBucket,
      stability: stabilityBucket,
      temperature: temperatureBucket,
      trend: computeTrend(body),
      confidence: globalConfidence,
    },
    salient,
    drives,
    availableRegulation: availableRegulation(body, body.mode),
  };
}
