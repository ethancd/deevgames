/**
 * EMBER — reflexes + interrupt grammar (src/skills/reflexes.ts).
 *
 * checkReflex() is arbiter-owned and can preempt ANY active intent — it is
 * called every tick regardless of whether the pilot is due, and its output
 * (when non-null) replaces the currently running intent. Reflex intents get
 * goal `reflex:<name>` and log a `reflex.<name>` event at the moment they're
 * built (so, e.g., src/sim/wolf.ts's flare-flee check — which reads the log
 * for `reflex.flare` — sees it the same tick).
 *
 * Priority: collapse > flare > flinch. `attackedThisTick` (flare's trigger)
 * is a strict subset of `adjacentAttackingWolf` (flinch's trigger) — a
 * `world.wolf.attack` event can only be emitted by src/sim/wolf.ts while
 * wolf.state === 'ATTACK' and the wolf is adjacent — so checking flare
 * before flinch is safe: whenever flare's condition holds, flinch's does
 * too, and we want the bigger response to win.
 */

import { isPassable } from '../sim';
import type { BodyVar, Intent, SkillCtx, Vec } from '../core/types';
import {
  COLLAPSE_FUEL_THRESHOLD,
  COLLAPSE_REST_DURATION,
  FLARE_ACTIVATION_THRESHOLD,
} from './constants';
import { chebyshev, DIRS8 } from './vecUtils';

function attackedThisTick(ctx: SkillCtx): boolean {
  return ctx.log.byTopic('world.wolf.attack').some((e) => e.tick === ctx.tick);
}

function adjacentAttackingWolf(ctx: SkillCtx): boolean {
  return (
    ctx.world.wolf.state === 'ATTACK' &&
    chebyshev(ctx.world.ember.pos, ctx.world.wolf.pos) <= 1
  );
}

/** One passable tile, adjacent to the ember, that maximizes distance from
 *  the wolf. Recomputed locally (see vecUtils.ts header) rather than reusing
 *  sim/wolf.ts's private stepAway, since only sim's public API is ours to
 *  import. Falls back to standing still if nothing improves distance. */
function stepAwayFromWolf(ctx: SkillCtx): Vec {
  const ember = ctx.world.ember.pos;
  const wolf = ctx.world.wolf.pos;
  let best: Vec = ember;
  let bestDist = chebyshev(ember, wolf);
  for (const d of DIRS8) {
    const p: Vec = { x: ember.x + d.x, y: ember.y + d.y };
    if (!isPassable(ctx.world, p)) continue;
    const dist = chebyshev(p, wolf);
    if (dist > bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

export function checkReflex(ctx: SkillCtx): Intent | null {
  if (ctx.body.fuel <= COLLAPSE_FUEL_THRESHOLD) {
    ctx.log.append({
      tick: ctx.tick,
      topic: 'reflex.collapse',
      payload: { fuel: ctx.body.fuel },
    });
    return {
      goal: 'reflex:collapse',
      skill: 'rest',
      params: { duration: COLLAPSE_REST_DURATION },
      interruptConditions: [],
    };
  }

  if (attackedThisTick(ctx) && ctx.body.activation > FLARE_ACTIVATION_THRESHOLD) {
    ctx.log.append({
      tick: ctx.tick,
      topic: 'reflex.flare',
      payload: { activation: ctx.body.activation },
    });
    return {
      goal: 'reflex:flare',
      skill: 'wait',
      params: { flare: true },
      interruptConditions: [],
    };
  }

  if (adjacentAttackingWolf(ctx)) {
    const dest = stepAwayFromWolf(ctx);
    ctx.log.append({
      tick: ctx.tick,
      topic: 'reflex.flinch',
      payload: { dest },
    });
    return {
      goal: 'reflex:flinch',
      skill: 'move_to',
      params: { dest, style: 'direct' },
      interruptConditions: [],
    };
  }

  return null;
}

// ------------------------------------------------------- interrupt grammar

const INTERRUPT_VARS = ['fuel', 'heat', 'damage', 'fatigue', 'activation', 'stability', 'threat'] as const;
type InterruptVar = (typeof INTERRUPT_VARS)[number];

const CONDITION_RE = /^(fuel|heat|damage|fatigue|activation|stability|threat)_(above|below)_(-?\d+(?:\.\d+)?)$/;

/** Parses the pinned grammar "<var>_(above|below)_<num>" (var in BodyVar |
 *  'threat'). Malformed strings are ignored but reported together in a
 *  single `skill.interrupt.invalid` event (emitted once per call, not once
 *  per bad string). Returns the first condition (in array order) whose
 *  comparison currently holds, or null if none do.
 *
 *  Defensive against a fixed audit finding: `conds` is typed `string[]`,
 *  but a hostile/malformed caller could hand it a non-string element (e.g.
 *  one with a throwing toString()/Symbol.toPrimitive) — RegExp#exec would
 *  ToString-coerce it and crash uncaught. Non-string elements are now
 *  treated as malformed (same as a regex-mismatching string) rather than
 *  handed to the regex at all. In normal operation this never fires:
 *  src/skills/arbiter.ts's validateIntent() already rejects any intent
 *  whose interruptConditions isn't a string[] before it can become the
 *  active intent. */
export function interruptTriggered(
  conds: string[],
  ctx: SkillCtx,
  threat: number,
): string | null {
  let sawInvalid = false;
  let firstMatch: string | null = null;

  for (const cond of conds) {
    if (typeof cond !== 'string') {
      sawInvalid = true;
      continue;
    }
    const m = CONDITION_RE.exec(cond);
    if (!m) {
      sawInvalid = true;
      continue;
    }
    const varName = m[1] as InterruptVar;
    const dir = m[2] as 'above' | 'below';
    const num = Number(m[3]);
    const current = varName === 'threat' ? threat : ctx.body[varName as BodyVar];
    const fired = dir === 'above' ? current > num : current < num;
    if (fired && firstMatch === null) firstMatch = cond;
  }

  if (sawInvalid) {
    ctx.log.append({
      tick: ctx.tick,
      topic: 'skill.interrupt.invalid',
      payload: { conditions: conds },
    });
  }

  return firstMatch;
}
