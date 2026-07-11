/**
 * EMBER — energy-body kernel (src/body/index.ts). PLAN.md §2.
 *
 * Required exports (pinned in src/core/types.ts):
 *   createBody, stepBody, computeInteroception, glowRadius, perceptionRadius
 *
 * stepBody is the ONLY place BodyState is mutated. It is authoritative: the
 * pilot never sees or touches BodyState directly, and skills express their
 * effect on the body only via Exertion (see src/skills/).
 */

import {
  DAY_TICKS,
  GLOW_MAX,
  VIABLE_BANDS,
  type BodyState,
  type BodyVar,
  type EventLog,
  type Exertion,
  type Rng,
  type WorldState,
} from '../core/types';
import {
  ACTIVATION_HALF_LIFE,
  ACTIVATION_SPIKE,
  DAMAGE_REPAIR_RATE,
  DEFAULT_BODY,
  FATIGUE_BASE,
  FATIGUE_DEBT_ACCRUAL,
  FATIGUE_DEBT_RECOVERY_DIVISOR,
  FATIGUE_DEBT_THRESHOLD,
  FATIGUE_EFFORT_RATE,
  FATIGUE_REST_RATE,
  FUEL_BASE_DRAIN,
  FUEL_COLD_MULT,
  FUEL_EFFORT_DRAIN,
  GLOW_EXPONENT,
  HEAT_ACTIVITY_GAIN,
  HEAT_COLD_DRAIN,
  HEAT_DAY_RECOVER,
  HEAT_SHELTER_RECOVER,
  clamp01,
} from './constants';
import { inBand, normalizedDeviation } from './deviation';
import { pushHistory } from './history';
import { computeMode } from './mode';

export { computeInteroception } from './interoception';

// ------------------------------------------------------------- createBody

const NON_DERIVED_VARS: Exclude<BodyVar, 'stability'>[] = [
  'fuel',
  'heat',
  'damage',
  'fatigue',
  'activation',
];

function deriveStability(b: Record<Exclude<BodyVar, 'stability'>, number>): number {
  const mean =
    NON_DERIVED_VARS.reduce((sum, v) => sum + normalizedDeviation(v, b[v]), 0) /
    NON_DERIVED_VARS.length;
  return clamp01(1 - mean);
}

export function createBody(overrides?: Partial<BodyState>): BodyState {
  const base = {
    fuel: DEFAULT_BODY.fuel,
    heat: DEFAULT_BODY.heat,
    damage: DEFAULT_BODY.damage,
    fatigue: DEFAULT_BODY.fatigue,
    activation: DEFAULT_BODY.activation,
    ...overrides,
  };
  const debts = { fatigue: 0, ...(overrides?.debts ?? {}) };
  const body: BodyState = {
    fuel: clamp01(base.fuel),
    heat: clamp01(base.heat),
    damage: clamp01(base.damage),
    fatigue: clamp01(base.fatigue),
    activation: clamp01(base.activation),
    stability: 1, // placeholder, recomputed below
    mode: overrides?.mode ?? 'EXPLORE',
    debts: { fatigue: clamp01(debts.fatigue) },
  };
  body.stability = deriveStability(body);
  return body;
}

// -------------------------------------------------------------- day/night

/** Ticks [0, DAY_TICKS/2) are day, the rest is night — mirrors the sim
 *  module's isDay() contract (kept local so body/ has no runtime
 *  dependency on sim/, per the module-ownership rules). */
function isNight(tick: number): boolean {
  const phase = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  return phase >= DAY_TICKS / 2;
}

// ---------------------------------------------------------- threat signal

/** Did a world.wolf.* STALK/ATTACK event occur this tick? Read via the log
 *  (as specced), with a same-tick FSM-state fallback so this stays correct
 *  regardless of the exact topic strings sim/ chooses to emit. */
function threatEventThisTick(world: WorldState, log: EventLog): boolean {
  const wolfEvents = log.byTopic('world.wolf');
  for (const e of wolfEvents) {
    if (e.tick !== world.tick) continue;
    const topic = e.topic.toLowerCase();
    if (topic.includes('stalk') || topic.includes('attack')) return true;
    const payload = e.payload as Record<string, unknown> | null | undefined;
    if (payload && typeof payload === 'object') {
      const state = (payload.state ?? payload.wolfState ?? payload.to) as
        | string
        | undefined;
      if (state === 'STALK' || state === 'ATTACK') return true;
    }
  }
  return world.wolf.state === 'STALK' || world.wolf.state === 'ATTACK';
}

// -------------------------------------------------------------- stepBody

export function stepBody(
  body: BodyState,
  world: WorldState,
  exertion: Exertion,
  _rng: Rng,
  log: EventLog,
): void {
  const prevMode = body.mode;
  const prevVals: Record<BodyVar, number> = {
    fuel: body.fuel,
    heat: body.heat,
    damage: body.damage,
    fatigue: body.fatigue,
    activation: body.activation,
    stability: body.stability,
  };

  const cold = (isNight(world.tick) || world.weather === 'rain') && !exertion.sheltered;

  // ---- fuel ----
  let fuelDrain = FUEL_BASE_DRAIN + exertion.effort * FUEL_EFFORT_DRAIN;
  if (cold) fuelDrain *= FUEL_COLD_MULT;
  body.fuel = clamp01(body.fuel - fuelDrain + (exertion.fuelDelta ?? 0));

  // ---- heat ----
  let heatDelta = cold ? -HEAT_COLD_DRAIN : HEAT_DAY_RECOVER;
  if (exertion.sheltered) heatDelta += HEAT_SHELTER_RECOVER;
  heatDelta += exertion.effort * HEAT_ACTIVITY_GAIN;
  heatDelta += exertion.heatDelta ?? 0;
  body.heat = clamp01(body.heat + heatDelta);

  // ---- fatigue (+ overexertion debt) ----
  if (exertion.resting) {
    const floor = body.debts.fatigue;
    body.fatigue = clamp01(Math.max(body.fatigue - FATIGUE_REST_RATE, floor));
    body.debts.fatigue = clamp01(
      body.debts.fatigue - FATIGUE_REST_RATE / FATIGUE_DEBT_RECOVERY_DIVISOR,
    );
  } else {
    const gain = FATIGUE_BASE + exertion.effort * FATIGUE_EFFORT_RATE;
    body.fatigue = clamp01(body.fatigue + gain);
  }
  // Debt accrues from overexertion (staying active well past the fatigue
  // band) — gated to non-resting ticks so a debt-imposed fatigue floor
  // during rest can never re-trigger its own accrual and get stuck.
  if (!exertion.resting && body.fatigue > FATIGUE_DEBT_THRESHOLD) {
    const before = body.debts.fatigue;
    body.debts.fatigue = clamp01(body.debts.fatigue + FATIGUE_DEBT_ACCRUAL);
    if (body.debts.fatigue > before) {
      log.append({
        tick: world.tick,
        topic: 'body.debt.accrued',
        payload: { debt: body.debts.fatigue, delta: body.debts.fatigue - before },
      });
    }
  }

  // ---- damage ----
  let damageDelta = exertion.damageDelta ?? 0;
  if (exertion.resting) damageDelta -= DAMAGE_REPAIR_RATE;
  body.damage = clamp01(body.damage + damageDelta);

  // ---- activation (hysteretic threat response) ----
  if (threatEventThisTick(world, log)) {
    body.activation = clamp01(body.activation + ACTIVATION_SPIKE);
  } else {
    body.activation = clamp01(body.activation * Math.exp(-1 / ACTIVATION_HALF_LIFE));
  }

  // ---- stability (derived) ----
  body.stability = deriveStability(body);

  // ---- mode (hysteretic) ----
  const nextMode = computeMode(prevMode, body);
  body.mode = nextMode;
  if (nextMode !== prevMode) {
    log.append({
      tick: world.tick,
      topic: 'body.mode.entered',
      payload: { mode: nextMode, from: prevMode },
    });
  }

  // ---- viable-band crossing events ----
  (Object.keys(VIABLE_BANDS) as BodyVar[]).forEach((v) => {
    const wasIn = inBand(v, prevVals[v]);
    const nowIn = inBand(v, body[v]);
    if (wasIn !== nowIn) {
      log.append({
        tick: world.tick,
        topic: 'body.var.crossed',
        payload: {
          var: v,
          from: prevVals[v],
          to: body[v],
          direction: nowIn ? 'entered' : 'exited',
        },
      });
    }
  });

  pushHistory(body, world);
}

// ---------------------------------------------------------------- glow

/** Smooth, monotone in fuel: GLOW_MAX at fuel=1, ~0.5 tiles at fuel=0.05,
 *  0 at fuel=0 (matches the collapse reflex firing near empty). */
export function glowRadius(fuel: number): number {
  const f = clamp01(fuel);
  if (f <= 0) return 0;
  return GLOW_MAX * Math.pow(f, GLOW_EXPONENT);
}

// ---------------------------------------------------------- perception

/** Base ~10 tiles; DEFEND narrows toward ~5; CONSERVE narrows toward ~8. */
export function perceptionRadius(body: BodyState): number {
  if (body.mode === 'DEFEND') return 5;
  if (body.mode === 'CONSERVE') return 8;
  return 10;
}
