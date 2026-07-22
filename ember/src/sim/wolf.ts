/**
 * EMBER — wolf FSM (src/sim/wolf.ts).
 *
 * PATROL -> STALK -> ATTACK -> FLEE -> PATROL, exactly per the contract in
 * src/core/types.ts:
 *   PATROL: waypoint wander. Enters STALK once emberGlow < WOLF_STALK_GLOW
 *     and the ember is within scent range (~12 tiles, Chebyshev).
 *   STALK: approaches 1 tile per 2 ticks. Becomes ATTACK once adjacent.
 *     Flees if emberGlow recovers >= WOLF_STALK_GLOW, or a flare event
 *     shows up in the log.
 *   ATTACK: emits world.wolf.attack {damage} every tick it stays adjacent
 *     (damage applied by the engine, not here — this module never touches
 *     BodyState). Drops back to STALK if the ember steps out of range;
 *     flees on the same glow/flare conditions as STALK.
 *   FLEE: moves away from the ember for `stateTicks` ticks (rolled on
 *     entry), then returns to PATROL.
 *
 * Movement is a bounded greedy step (not a full A* re-plan) toward/away
 * from a target, restricted to passable, corner-safe neighbors — cheap
 * enough to run every tick for thousands of ticks. Patrol waypoints and
 * per-event randomness (attack damage jitter, flee duration) are drawn from
 * label-stable forks of `rng` keyed by 'wolf' + tick/leg, so the same
 * (seed, tick) always yields the same wolf behavior.
 */

import type { EventLog, Rng, Vec, WorldState } from '../core/types';
import { WOLF_STALK_GLOW } from '../core/types';
import { DIRS8, chebyshev, idx, inBounds, isPassable } from './grid';

const SCENT_RANGE = 12;
const PATROL_LEG_TICKS = 50;
const STALK_MOVE_EVERY = 2;
const FLEE_MIN_TICKS = 40;
const FLEE_MAX_TICKS = 90; // exclusive upper bound of the roll range
const ATTACK_DAMAGE_BASE = 0.12;
const ATTACK_DAMAGE_JITTER = 0.02;
/** How many ticks back to look for a flare reflex event in the log. Flares
 *  fire later in the SAME tick they're triggered (reflex step runs after
 *  world step in the tick order), so the earliest a wolf can react to one
 *  is the following tick — this window covers that plus one tick of slack. */
const FLARE_LOOKBACK_TICKS = 2;

function candidateSteps(world: WorldState, from: Vec): Vec[] {
  const out: Vec[] = [];
  for (const d of DIRS8) {
    const p: Vec = { x: from.x + d.x, y: from.y + d.y };
    if (!inBounds(p, world.width, world.height)) continue;
    if (!isPassable(world, p)) continue;
    // Corner-safe: disallow cutting a diagonal between two blocked flanks.
    if (d.x !== 0 && d.y !== 0) {
      const flankA: Vec = { x: from.x + d.x, y: from.y };
      const flankB: Vec = { x: from.x, y: from.y + d.y };
      if (!isPassable(world, flankA) || !isPassable(world, flankB)) continue;
    }
    out.push(p);
  }
  return out;
}

function rowMajorKey(world: WorldState, p: Vec): number {
  return idx(p, world.width);
}

/** Greedy single step from `from` toward `target`; returns `from` unchanged
 *  if no passable neighbor improves distance (or none exist). */
function stepToward(world: WorldState, from: Vec, target: Vec): Vec {
  const cands = candidateSteps(world, from);
  if (cands.length === 0) return from;
  cands.sort(
    (a, b) =>
      chebyshev(a, target) - chebyshev(b, target) ||
      rowMajorKey(world, a) - rowMajorKey(world, b),
  );
  const best = cands[0];
  return chebyshev(best, target) < chebyshev(from, target) ? best : from;
}

/** Greedy single step from `from` away from `threat`; returns `from`
 *  unchanged if no passable neighbor increases distance. */
function stepAway(world: WorldState, from: Vec, threat: Vec): Vec {
  const cands = candidateSteps(world, from);
  if (cands.length === 0) return from;
  cands.sort(
    (a, b) =>
      chebyshev(b, threat) - chebyshev(a, threat) ||
      rowMajorKey(world, a) - rowMajorKey(world, b),
  );
  const best = cands[0];
  return chebyshev(best, threat) > chebyshev(from, threat) ? best : from;
}

function randomPassableWaypoint(world: WorldState, rng: Rng): Vec {
  for (let i = 0; i < 60; i++) {
    const p: Vec = { x: rng.int(world.width), y: rng.int(world.height) };
    if (isPassable(world, p)) return p;
  }
  // Deterministic fallback: first passable tile in row-major order.
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (isPassable(world, { x, y })) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function hasRecentFlare(log: EventLog, tick: number): boolean {
  const events = log.byTopic('reflex.flare');
  for (const e of events) {
    if (e.tick <= tick && e.tick >= tick - FLARE_LOOKBACK_TICKS) return true;
  }
  return false;
}

function enterFlee(world: WorldState, rng: Rng, log: EventLog): void {
  const durRng = rng.fork('wolf').fork(`flee:${world.tick}`);
  const duration = FLEE_MIN_TICKS + durRng.int(FLEE_MAX_TICKS - FLEE_MIN_TICKS);
  world.wolf.state = 'FLEE';
  world.wolf.stateTicks = duration;
  log.append({
    tick: world.tick,
    topic: 'world.wolf.flee_start',
    payload: { duration },
  });
}

export function stepWolf(world: WorldState, rng: Rng, log: EventLog, emberGlow: number): void {
  const wolf = world.wolf;
  const distToEmber = chebyshev(wolf.pos, world.ember.pos);
  const recentFlare = hasRecentFlare(log, world.tick);

  switch (wolf.state) {
    case 'PATROL': {
      const leg = Math.floor(world.tick / PATROL_LEG_TICKS);
      const waypoint = randomPassableWaypoint(world, rng.fork('wolf').fork(`patrol-leg:${leg}`));
      wolf.pos = stepToward(world, wolf.pos, waypoint);
      if (emberGlow < WOLF_STALK_GLOW && distToEmber <= SCENT_RANGE) {
        wolf.state = 'STALK';
        wolf.stateTicks = 0;
        log.append({
          tick: world.tick,
          topic: 'world.wolf.stalk_start',
          payload: { pos: { x: wolf.pos.x, y: wolf.pos.y } },
        });
      }
      break;
    }

    case 'STALK': {
      if (emberGlow >= WOLF_STALK_GLOW || recentFlare) {
        enterFlee(world, rng, log);
        break;
      }
      wolf.stateTicks += 1;
      if (distToEmber <= 1) {
        wolf.state = 'ATTACK';
        wolf.stateTicks = 0;
        log.append({
          tick: world.tick,
          topic: 'world.wolf.attack_start',
          payload: { pos: { x: wolf.pos.x, y: wolf.pos.y } },
        });
      } else if (wolf.stateTicks % STALK_MOVE_EVERY === 0) {
        wolf.pos = stepToward(world, wolf.pos, world.ember.pos);
      }
      break;
    }

    case 'ATTACK': {
      if (emberGlow >= WOLF_STALK_GLOW || recentFlare) {
        enterFlee(world, rng, log);
        break;
      }
      if (distToEmber <= 1) {
        const jitterRng = rng.fork('wolf').fork(`attack:${world.tick}`);
        const damage = ATTACK_DAMAGE_BASE + (jitterRng.next() * 2 - 1) * ATTACK_DAMAGE_JITTER;
        log.append({
          tick: world.tick,
          topic: 'world.wolf.attack',
          payload: { damage },
        });
      } else {
        wolf.state = 'STALK';
        wolf.stateTicks = 0;
        log.append({
          tick: world.tick,
          topic: 'world.wolf.stalk_start',
          payload: { pos: { x: wolf.pos.x, y: wolf.pos.y } },
        });
      }
      break;
    }

    case 'FLEE': {
      wolf.pos = stepAway(world, wolf.pos, world.ember.pos);
      wolf.stateTicks -= 1;
      if (wolf.stateTicks <= 0) {
        wolf.state = 'PATROL';
        wolf.stateTicks = 0;
        log.append({
          tick: world.tick,
          topic: 'world.wolf.patrol_resume',
          payload: { pos: { x: wolf.pos.x, y: wolf.pos.y } },
        });
      }
      break;
    }
  }
}
