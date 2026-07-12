/**
 * EMBER — shared formatting/color helpers for the panels (src/ui/panels/).
 *
 * Not part of the pinned contract; internal to this directory. Pure
 * functions only — no DOM, no store access — kept separate from the three
 * panel components so PilotPanel / GroundTruthPanel / EventTicker stay
 * small and so the "renders identically for equal props" purity test has a
 * narrow surface to reason about.
 */

import type { Bucket, BodyVar, Intent, Mode, SkillName, Vec } from '../../core/types';

// ------------------------------------------------------------------ color

export const PALETTE = {
  red: '#f87171',
  orange: '#fb923c',
  amber: '#fbbf24',
  amberDeep: '#f59e0b',
  green: '#4ade80',
  blue: '#60a5fa',
  violet: '#a78bfa',
  teal: '#2dd4bf',
  cyan: '#22d3ee',
  gray: '#9ca3af',
  /** "wolf" red-orange — distinct from both the pure resource-orange and
   *  the pure mode-red so the three ticker categories stay visually apart. */
  wolfRedOrange: '#fb5607',
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear interpolation between two hex colors, t clamped to [0,1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const tt = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * tt, ag + (bg - ag) * tt, ab + (bb - ab) * tt);
}

// -------------------------------------------------------------- body vars

export type GroundTruthVar = Exclude<BodyVar, 'stability'> | 'stability';

const VAR_METER_BASE: Record<GroundTruthVar, string> = {
  fuel: PALETTE.orange,
  heat: PALETTE.blue, // low end; meterColorFor() blends toward warm at high values
  damage: PALETTE.gray,
  fatigue: PALETTE.violet,
  activation: PALETTE.green, // low end; blends toward red at high values
  stability: PALETTE.green,
};

/** Meter/sparkline stroke color for a ground-truth row. `heat` blends
 *  blue-to-warm and `activation` blends green-to-red by value; the rest are
 *  fixed per-var colors (per VISUAL_TARGET.md's adopted meter palette). */
export function meterColorFor(v: GroundTruthVar, value: number): string {
  if (v === 'heat') return lerpColor(PALETTE.blue, PALETTE.amberDeep, value);
  if (v === 'activation') return lerpColor(PALETTE.green, PALETTE.red, value);
  return VAR_METER_BASE[v];
}

export const GROUND_TRUTH_ROWS: GroundTruthVar[] = [
  'fuel',
  'heat',
  'damage',
  'fatigue',
  'activation',
  'stability',
];

// ------------------------------------------------------------------ mode

export const MODE_COLOR: Record<Mode, { text: string; border: string }> = {
  EXPLORE: { text: 'text-green-400', border: 'border-green-400' },
  CONSERVE: { text: 'text-amber-400', border: 'border-amber-400' },
  DEFEND: { text: 'text-red-400', border: 'border-red-400' },
  RECOVER: { text: 'text-violet-400', border: 'border-violet-400' },
};

// ---------------------------------------------------------- pilot buckets

export type GlobalRowKey = 'capacity' | 'activation' | 'stability' | 'temperature';

export const GLOBAL_ROWS: GlobalRowKey[] = ['capacity', 'activation', 'stability', 'temperature'];

/** Qualitative label shown for a bucket in a given interoception row.
 *  `temperature` gets the reference's COOL/MILD/WARM vocabulary; the rest
 *  print the Bucket value itself (VERY LOW / LOW / MID / HIGH / VERY HIGH). */
export function bucketLabel(row: GlobalRowKey, bucket: Bucket): string {
  if (row === 'temperature') {
    if (bucket === 'very_low' || bucket === 'low') return 'COOL';
    if (bucket === 'mid') return 'MILD';
    return 'WARM';
  }
  return bucket.replace('_', ' ').toUpperCase();
}

/** Tailwind text color class for a bucket reading in a given row. Deviant
 *  direction differs per row: activation is bad-when-high (red), capacity
 *  and stability are bad-when-low (red), temperature is its own cold/warm
 *  axis (blue/amber) rather than a good/bad axis. */
export function bucketColorClass(row: GlobalRowKey, bucket: Bucket): string {
  if (row === 'temperature') {
    if (bucket === 'very_low' || bucket === 'low') return 'text-blue-400';
    if (bucket === 'mid') return 'text-slate-300';
    return 'text-amber-400';
  }
  const badWhenHigh = row === 'activation';
  const deviant =
    badWhenHigh ? bucket === 'high' || bucket === 'very_high' : bucket === 'very_low' || bucket === 'low';
  if (deviant) return 'text-red-400';
  if (bucket === 'mid') return 'text-slate-300';
  return 'text-green-400';
}

/** Maps interoception.global.trend's "<label> rising|falling" grammar
 *  (src/body/interoception.ts's TREND_LABEL) onto which pilot-panel row (if
 *  any) should show a trend arrow. `damage` has no home among the four
 *  global rows (capacity/activation/stability/temperature), so it — and any
 *  unrecognized label — yields no arrow. */
const TREND_LABEL_TO_ROW: Partial<Record<string, GlobalRowKey>> = {
  activation: 'activation',
  warmth: 'temperature',
  fuel: 'capacity',
  fatigue: 'capacity',
};

export function parseTrend(trend: string): { row: GlobalRowKey; rising: boolean } | null {
  const m = /^(\w+)\s+(rising|falling)$/.exec(trend.trim());
  if (!m) return null;
  const row = TREND_LABEL_TO_ROW[m[1]];
  if (!row) return null;
  return { row, rising: m[2] === 'rising' };
}

// ----------------------------------------------------------- intent tint

export type IntentTint = 'amber' | 'violet' | 'teal' | 'gray';

/** amber for danger-ish (flee/shelter), violet for recuperative
 *  (rest/consume), teal for purposeful movement (move_to/gather), gray
 *  otherwise (wait/focus/unrecognized). */
export function tintForSkill(skill: SkillName): IntentTint {
  if (skill === 'flee' || skill === 'shelter') return 'amber';
  if (skill === 'rest' || skill === 'consume') return 'violet';
  if (skill === 'move_to' || skill === 'gather') return 'teal';
  return 'gray';
}

export const INTENT_TINT_CLASSES: Record<
  IntentTint,
  { bg: string; border: string; text: string; icon: string }
> = {
  amber: { bg: 'bg-amber-950/60', border: 'border-amber-700/70', text: 'text-amber-200', icon: 'text-amber-400' },
  violet: {
    bg: 'bg-violet-950/60',
    border: 'border-violet-700/70',
    text: 'text-violet-200',
    icon: 'text-violet-400',
  },
  teal: { bg: 'bg-teal-950/60', border: 'border-teal-700/70', text: 'text-teal-200', icon: 'text-teal-400' },
  gray: { bg: 'bg-slate-800/60', border: 'border-slate-700/70', text: 'text-slate-300', icon: 'text-slate-400' },
};

function isVec(v: unknown): v is Vec {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).x === 'number' &&
    typeof (v as Record<string, unknown>).y === 'number'
  );
}

function formatParamValue(v: unknown): string {
  if (isVec(v)) return `(${v.x},${v.y})`;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return 'none';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Preferred keys, in priority order, for the single most informative param
 *  to show in the intent banner's "-> <summary>" tail. Falls back to every
 *  remaining param (comma-joined) so no skill's banner is ever blank when it
 *  has params, and to '(no params)' when it truly has none. */
const SUMMARY_KEY_PRIORITY = ['dest', 'target', 'item', 'region', 'from', 'duration'];

export function summarizeParams(intent: Intent): string {
  const params = (intent.params ?? {}) as Record<string, unknown>;
  for (const key of SUMMARY_KEY_PRIORITY) {
    if (key in params) return `${key}: ${formatParamValue(params[key])}`;
  }
  const rest = Object.keys(params).filter((k) => k !== '_exploreDir');
  if (rest.length === 0) return '(no params)';
  return rest.map((k) => `${k}: ${formatParamValue(params[k])}`).join(', ');
}

// -------------------------------------------------------------- sparkline

export interface SparklineGeometry {
  width: number;
  height: number;
  points: string;
}

/** Builds an SVG <polyline> `points` string for up to 24 trailing values
 *  (each expected 0..1), oldest-left/newest-right, flipped so the locally
 *  highest value sits at the top of the viewBox.
 *
 *  Auto-scaled to the window's own min/max rather than the fixed 0..1
 *  domain: most body vars spend most of their time inside a narrow band
 *  (e.g. heat drifting 0.75->0.83), so a fixed-domain sparkline reads as a
 *  flat line even while genuinely varying tick to tick — illegible exactly
 *  when the "belief vs. body over time" story most needs to be readable at
 *  a glance. A degenerate window (every sampled value identical) falls back
 *  to a flat mid-height line rather than dividing by zero. */
export function sparklinePoints(values: readonly number[], width = 56, height = 18): SparklineGeometry {
  const trimmed = values.slice(-24);
  if (trimmed.length === 0) return { width, height, points: '' };
  const min = Math.min(...trimmed);
  const max = Math.max(...trimmed);
  const range = max - min;
  const norm = (v: number) => (range > 1e-9 ? (v - min) / range : 0.5);
  if (trimmed.length === 1) {
    const y = height - norm(trimmed[0]) * height;
    return { width, height, points: `0,${y.toFixed(1)} ${width},${y.toFixed(1)}` };
  }
  const step = width / (trimmed.length - 1);
  const points = trimmed
    .map((v, i) => `${(i * step).toFixed(1)},${(height - norm(v) * height).toFixed(1)}`)
    .join(' ');
  return { width, height, points };
}

// -------------------------------------------------------------- ticker

export type EventCategory = 'mode' | 'resource' | 'path' | 'wolf' | 'pilot' | 'default';

export function categoryForTopic(topic: string): EventCategory {
  if (topic.startsWith('body.mode.')) return 'mode';
  if (/wolf/.test(topic)) return 'wolf';
  if (/resource|gather/.test(topic)) return 'resource';
  // Body-var threshold crossings (body.var.crossed, body.limit.*) are
  // resource telemetry — the reference renders show them in orange.
  if (topic.startsWith('body.var.') || topic.startsWith('body.limit.')) return 'resource';
  if (/path|move/.test(topic)) return 'path';
  if (topic.startsWith('pilot')) return 'pilot';
  return 'default';
}

export const EVENT_CATEGORY_CLASS: Record<EventCategory, string> = {
  mode: 'text-red-400',
  resource: 'text-orange-400',
  path: 'text-green-400',
  wolf: 'text-[#fb5607]',
  pilot: 'text-cyan-400',
  default: 'text-slate-300',
};

const HEADLINE_KEYS = ['mode', 'state', 'wolfState', 'what', 'var', 'skill', 'item', 'target', 'drive'];

/** Best-effort short, human string pulled off an event payload for the
 *  ticker line's trailing value word (e.g. "DEFEND", "wolf") — purely
 *  cosmetic, never used for branching logic. */
export function extractHeadline(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  for (const key of HEADLINE_KEYS) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}
