/**
 * EMBER — skill/arbiter/reflex tunable constants (src/skills/constants.ts).
 *
 * Skills own their own (approximate) cost model — these numbers feed
 * `estCost` and per-tick `Exertion` shapes. They are deliberately NOT
 * imported from src/body/constants.ts: the body kernel is the authoritative
 * dynamics; these are just this module's best-effort forecasts (the pilot's
 * belief is allowed to be imprecise — see PLAN.md §4 rule 3).
 */

// ------------------------------------------------------------- move_to
export const MOVE_EFFORT_DIRECT = 0.6;
export const MOVE_EFFORT_CAUTIOUS = 0.4;
export const MOVE_FATIGUE_PER_STEP = 0.01;
export const MOVE_FUEL_PER_STEP = 0.006;

// --------------------------------------------------------------- gather
export const GATHER_TICKS = 4;
export const GATHER_EFFORT = 0.3;
export const GATHER_RATE = 0.075; // internal buffer units per tick
export const GATHER_CAP = 0.3; // internal buffer cap
export const GATHER_FATIGUE_PER_TICK = 0.004;
/** stability gate: gather refused below this (PLAN §4: stability gates skills) */
export const GATHER_MIN_STABILITY = 0.15;

// -------------------------------------------------------------- consume
export const CONSUME_TICKS = 2;
export const CONSUME_EFFORT = 0.2;
export const CONSUME_RATE = 0.06; // fuel delta applied to the body per tick
export const CONSUME_FATIGUE_PER_TICK = 0.002;

// ----------------------------------------------------------------- rest
export const REST_MAX_DURATION = 2000;
export const COLLAPSE_REST_DURATION = 40;

// -------------------------------------------------------------- shelter
export const SHELTER_TRAVEL_EFFORT = 0.5;

// ----------------------------------------------------------------- flee
export const FLEE_EFFORT = 0.9;
export const FLEE_DURATION = 6;
export const FLEE_DISTANCE = 6;
export const FLEE_FATIGUE_PER_TICK = 0.015;
export const FLEE_FUEL_PER_TICK = 0.009;

// ---------------------------------------------------------------- focus
export const FOCUS_EFFORT = 0.1;
export const FOCUS_DURATION = 5;

// ----------------------------------------------------------------- wait
export const WAIT_DURATION = 3;

// -------------------------------------------------------------- reflexes
export const COLLAPSE_FUEL_THRESHOLD = 0.02;
export const FLARE_ACTIVATION_THRESHOLD = 0.7;
export const FLARE_FUEL_COST = 0.15;
