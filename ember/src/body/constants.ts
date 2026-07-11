/**
 * EMBER — body kernel tunable constants (src/body/constants.ts).
 *
 * All numbers here are chosen to hit the rough dynamics targets pinned as a
 * comment on VIABLE_BANDS in src/core/types.ts. Nothing here is imported by
 * other modules; it's private tuning surface for src/body/.
 */

export const EPS = 1e-6;

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ---------------------------------------------------------------- fuel
// idle (effort=0), warm: full -> empty in ~400 ticks => 1/400
export const FUEL_BASE_DRAIN = 1 / 400;
// at effort=1 sustained, full -> empty in ~200 ticks => 1/200 total, so the
// effort-scaled component is (1/200 - 1/400)
export const FUEL_EFFORT_DRAIN = 1 / 200 - 1 / 400;
// cold (night/rain, unsheltered) burns fuel faster
export const FUEL_COLD_MULT = 1.4;

// ---------------------------------------------------------------- heat
// night/rain, unsheltered: comfortable heat leaves the viable band
// (lower edge 0.35) within ~120 ticks from a comfortable default (~0.7)
export const HEAT_COLD_DRAIN = 0.003;
// mild recovery drift on a clear day when not actively warming
export const HEAT_DAY_RECOVER = 0.002;
// extra recovery while sheltered (den)
export const HEAT_SHELTER_RECOVER = 0.01;
// activity/fuel-burn generates a little body heat
export const HEAT_ACTIVITY_GAIN = 0.002;

// ---------------------------------------------------------------- fatigue
// baseline "time awake" accrual even at zero effort
export const FATIGUE_BASE = 0.0004;
// effort-scaled accrual: at effort=1, base+effort ~= 0.8 over ~300 ticks
export const FATIGUE_EFFORT_RATE = 0.0023;
// resting recovers "most" of a ~0.8 fatigue load in ~60 ticks
export const FATIGUE_REST_RATE = 0.012;
// debt accrues once fatigue pushes past this (well above the viable band)
export const FATIGUE_DEBT_THRESHOLD = 0.85;
export const FATIGUE_DEBT_ACCRUAL = 0.004;
// debt recovers this many times slower than ordinary fatigue during rest,
// AND acts as a floor below which a single rest cannot push fatigue.
export const FATIGUE_DEBT_RECOVERY_DIVISOR = 5;

// ---------------------------------------------------------------- damage
// repairs only while resting, and slowly
export const DAMAGE_REPAIR_RATE = 0.002;

// ------------------------------------------------------------ activation
// threat (STALK/ATTACK) spikes activation toward ~0.9 within a few ticks
export const ACTIVATION_SPIKE = 0.35;
// decay factor per tick when no threat this tick: activation *= exp(-1/H)
export const ACTIVATION_HALF_LIFE = 80;

// ------------------------------------------------------------------ mode
// hysteresis thresholds: *_ENTER is the (harder to reach) threshold that
// switches INTO a mode; *_EXIT is the (easier to satisfy) threshold that
// must be crossed the other way before the kernel leaves that mode.
export const DEFEND_ENTER = 0.65;
export const DEFEND_EXIT = 0.35;

export const RECOVER_DAMAGE_ENTER = 0.35;
export const RECOVER_DAMAGE_EXIT = 0.2;
export const RECOVER_FATIGUE_ENTER = 0.65;
export const RECOVER_FATIGUE_EXIT = 0.45;

export const CONSERVE_FUEL_ENTER = 0.3;
export const CONSERVE_FUEL_EXIT = 0.4;
export const CONSERVE_HEAT_ENTER = 0.42;
export const CONSERVE_HEAT_EXIT = 0.5;

// ------------------------------------------------------------ interoception
export const SIGMA_BASE = 0.02;
export const SIGMA_SCALE = 0.3;

// ---------------------------------------------------------------- defaults
export const DEFAULT_BODY = {
  fuel: 0.9,
  heat: 0.7,
  damage: 0,
  fatigue: 0.1,
  activation: 0.1,
} as const;

// ---------------------------------------------------------------- glow
// glowRadius(fuel) = GLOW_MAX * fuel^GLOW_EXPONENT; chosen so glow(0.05) ~= 0.5
export const GLOW_EXPONENT = 0.83;
