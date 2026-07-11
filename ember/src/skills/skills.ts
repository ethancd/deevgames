/**
 * EMBER — skill library (src/skills/skills.ts).
 *
 * The 8 SkillDefs that make up `SKILLS`. Every skill reads ctx.world/ctx.body
 * but never writes them — effects flow ONLY through SkillTickResult.exertion
 * and SkillTickResult.moveTo (audited; see PLAN.md and types.ts comments).
 * The engine is the only thing that applies moveTo to WorldState, and
 * stepBody (src/body/) is the only thing that applies Exertion to BodyState.
 */

import { findPath, isPassable } from '../sim';
import type {
  DeadwoodEntity,
  SkillCtx,
  SkillDef,
  SkillExec,
  SkillName,
  SunpatchEntity,
  Vec,
} from '../core/types';
import {
  CONSUME_EFFORT,
  CONSUME_FATIGUE_PER_TICK,
  CONSUME_RATE,
  CONSUME_TICKS,
  FLARE_FUEL_COST,
  FLEE_DISTANCE,
  FLEE_DURATION,
  FLEE_EFFORT,
  FLEE_FATIGUE_PER_TICK,
  FLEE_FUEL_PER_TICK,
  FOCUS_DURATION,
  FOCUS_EFFORT,
  GATHER_CAP,
  GATHER_EFFORT,
  GATHER_FATIGUE_PER_TICK,
  GATHER_MIN_STABILITY,
  GATHER_RATE,
  GATHER_TICKS,
  MODE_COST_MULT,
  MOVE_EFFORT_CAUTIOUS,
  MOVE_EFFORT_DIRECT,
  MOVE_FATIGUE_PER_STEP,
  MOVE_FUEL_PER_STEP,
  REST_MAX_DURATION,
  SHELTER_TRAVEL_EFFORT,
  WAIT_DURATION,
} from './constants';
import { optionalEnum, requireFiniteNumber, requireString, requireVec } from './params';
import { chebyshev, clamp, sign, vecEq } from './vecUtils';

/** PLAN §2/§3's per-mode "action cost multiplier" — every SkillDef.estCost()
 *  below scales its forecast by this so estimated costs genuinely differ
 *  between modes (not just perceptionRadius/salience — see
 *  src/skills/constants.ts's MODE_COST_MULT doc and skills.test.ts). */
function modeMult(ctx: SkillCtx): number {
  return MODE_COST_MULT[ctx.body.mode];
}

// -------------------------------------------------------------- move_to

const MOVE_STYLES = ['direct', 'cautious'] as const;
type MoveStyle = (typeof MOVE_STYLES)[number];

function moveDest(params: Record<string, unknown>, ctx: SkillCtx): Vec {
  const r = requireVec(params, 'dest');
  if (!r.ok) return ctx.world.ember.pos;
  return { x: Math.round(r.value.x), y: Math.round(r.value.y) };
}

function moveStyle(params: Record<string, unknown>): MoveStyle {
  const r = optionalEnum(params, 'style', MOVE_STYLES, 'direct');
  return r.ok ? r.value : 'direct';
}

const moveTo: SkillDef = {
  name: 'move_to',
  paramsHelp:
    'dest: {x, y} tile to walk to. style?: "direct" (effort 0.6) | "cautious" (routes around the wolf/water, effort 0.4). Default "direct".',
  precondition(params, ctx) {
    const destR = requireVec(params, 'dest', {
      boundsWidth: ctx.world.width,
      boundsHeight: ctx.world.height,
    });
    if (!destR.ok) return destR.reason;
    const styleR = optionalEnum(params, 'style', MOVE_STYLES, 'direct');
    if (!styleR.ok) return styleR.reason;
    const dest = { x: Math.round(destR.value.x), y: Math.round(destR.value.y) };
    if (!isPassable(ctx.world, dest)) {
      return `destination (${dest.x},${dest.y}) is not passable`;
    }
    if (vecEq(dest, ctx.world.ember.pos)) return true;
    const path = findPath(ctx.world, ctx.world.ember.pos, dest, styleR.value === 'cautious');
    if (path.length === 0) return `no path to (${dest.x},${dest.y})`;
    return true;
  },
  estCost(params, ctx) {
    const dest = moveDest(params, ctx);
    const style = moveStyle(params);
    const path = findPath(ctx.world, ctx.world.ember.pos, dest, style === 'cautious');
    const steps = path.length;
    const mult = modeMult(ctx);
    return { fatigue: steps * MOVE_FATIGUE_PER_STEP * mult, fuel: -steps * MOVE_FUEL_PER_STEP * mult };
  },
  start(params, ctx): SkillExec {
    const dest = moveDest(params, ctx);
    const cautious = moveStyle(params) === 'cautious';
    const effort = cautious ? MOVE_EFFORT_CAUTIOUS : MOVE_EFFORT_DIRECT;
    return {
      tick(tctx) {
        if (vecEq(tctx.world.ember.pos, dest)) {
          return { status: 'done', exertion: { effort: 0 } };
        }
        const path = findPath(tctx.world, tctx.world.ember.pos, dest, cautious);
        if (path.length === 0) {
          return {
            status: 'failed',
            failReason: `no path to (${dest.x},${dest.y})`,
            exertion: { effort: 0 },
          };
        }
        return { status: 'running', exertion: { effort }, moveTo: path[0] };
      },
    };
  },
};

// ---------------------------------------------------------- fuel sources

type SourceKind = 'deadwood' | 'sunpatch';

function locateFuelSource(
  ctx: SkillCtx,
  id: string,
): { ok: true; kind: SourceKind; pos: Vec } | { ok: false; reason: string } {
  const dw: DeadwoodEntity | undefined = ctx.world.deadwood.find((d) => d.id === id);
  if (dw) {
    if (chebyshev(ctx.world.ember.pos, dw.pos) > 1) {
      return { ok: false, reason: `deadwood "${id}" is not adjacent` };
    }
    if (dw.fuel <= 0) {
      return { ok: false, reason: `deadwood "${id}" has no fuel left` };
    }
    return { ok: true, kind: 'deadwood', pos: dw.pos };
  }
  const sp: SunpatchEntity | undefined = ctx.world.sunpatches.find((s) => s.id === id);
  if (sp) {
    if (chebyshev(ctx.world.ember.pos, sp.pos) > 1) {
      return { ok: false, reason: `sunpatch "${id}" is not adjacent` };
    }
    if (!sp.active) {
      return { ok: false, reason: `sunpatch "${id}" is inactive (night)` };
    }
    return { ok: true, kind: 'sunpatch', pos: sp.pos };
  }
  return { ok: false, reason: `no such fuel source "${id}"` };
}

// ------------------------------------------------------------------ gather

/**
 * gather() harvests toward a small INTERNAL buffer that lives only inside
 * this SkillExec's closure — it never writes world.deadwood/sunpatches (that
 * would violate the "skills never mutate world" audit rule) and it never
 * applies a fuelDelta to the body (that's consume()'s job). This is a
 * deliberate simplification of the "carried-or-adjacent source" design noted
 * in the task brief: gather and consume both operate directly on an adjacent
 * source; there is no persistent carried-fuel inventory in this milestone.
 */
const gather: SkillDef = {
  name: 'gather',
  paramsHelp: 'target: id of an adjacent deadwood (fuel > 0) or active sunpatch to harvest.',
  precondition(params, ctx) {
    const targetR = requireString(params, 'target');
    if (!targetR.ok) return targetR.reason;
    if (ctx.body.stability < GATHER_MIN_STABILITY) {
      return `stability too low to gather (${ctx.body.stability.toFixed(2)} < ${GATHER_MIN_STABILITY})`;
    }
    const src = locateFuelSource(ctx, targetR.value);
    if (!src.ok) return src.reason;
    return true;
  },
  estCost(_params, ctx) {
    return { fatigue: GATHER_TICKS * GATHER_FATIGUE_PER_TICK * modeMult(ctx) };
  },
  start(params): SkillExec {
    const targetR = requireString(params, 'target');
    const target = targetR.ok ? targetR.value : '';
    let ticks = 0;
    let buffered = 0;
    return {
      tick(tctx) {
        ticks += 1;
        buffered = Math.min(GATHER_CAP, buffered + GATHER_RATE);
        const done = ticks >= GATHER_TICKS;
        if (done) {
          tctx.log.append({
            tick: tctx.tick,
            topic: 'skill.gather.complete',
            payload: { target, buffered },
          });
        }
        return { status: done ? 'done' : 'running', exertion: { effort: GATHER_EFFORT } };
      },
    };
  },
};

// ----------------------------------------------------------------- consume

const consume: SkillDef = {
  name: 'consume',
  paramsHelp: 'item: id of an adjacent deadwood (fuel > 0) or active sunpatch to eat from.',
  precondition(params, ctx) {
    const itemR = requireString(params, 'item');
    if (!itemR.ok) return itemR.reason;
    const src = locateFuelSource(ctx, itemR.value);
    if (!src.ok) return src.reason;
    return true;
  },
  estCost(_params, ctx) {
    const mult = modeMult(ctx);
    return {
      // benefit (fuel intake) shrinks under a costlier mode; the fatigue
      // cost of the act itself grows.
      fuel: (CONSUME_RATE * CONSUME_TICKS) / mult,
      fatigue: CONSUME_TICKS * CONSUME_FATIGUE_PER_TICK * mult,
    };
  },
  start(params): SkillExec {
    const itemR = requireString(params, 'item');
    const item = itemR.ok ? itemR.value : '';
    let ticks = 0;
    return {
      tick(tctx) {
        ticks += 1;
        const done = ticks >= CONSUME_TICKS;
        if (done) {
          tctx.log.append({
            tick: tctx.tick,
            topic: 'skill.consume.complete',
            payload: { item, amount: CONSUME_RATE * CONSUME_TICKS },
          });
        }
        return {
          status: done ? 'done' : 'running',
          exertion: { effort: CONSUME_EFFORT, fuelDelta: CONSUME_RATE },
        };
      },
    };
  },
};

// -------------------------------------------------------------------- rest

const rest: SkillDef = {
  name: 'rest',
  paramsHelp: 'duration: number of ticks to rest (resting=true, effort 0).',
  precondition(params) {
    const durR = requireFiniteNumber(params, 'duration', { min: 1, max: REST_MAX_DURATION });
    if (!durR.ok) return durR.reason;
    return true;
  },
  estCost(params, ctx) {
    const durR = requireFiniteNumber(params, 'duration', { min: 1, max: REST_MAX_DURATION });
    const duration = durR.ok ? durR.value : 0;
    const capped = Math.min(duration, 200);
    // Recovery is a benefit — it shrinks (rest is less restorative) under a
    // costlier mode like DEFEND, rather than growing.
    const mult = modeMult(ctx);
    return { fatigue: (-capped * 0.01) / mult, damage: (-capped * 0.002) / mult };
  },
  start(params): SkillExec {
    const durR = requireFiniteNumber(params, 'duration', { min: 1, max: REST_MAX_DURATION });
    const duration = durR.ok ? durR.value : 1;
    let ticks = 0;
    return {
      tick() {
        ticks += 1;
        const done = ticks >= duration;
        return { status: done ? 'done' : 'running', exertion: { effort: 0, resting: true } };
      },
    };
  },
};

// ----------------------------------------------------------------- shelter

const shelter: SkillDef = {
  name: 'shelter',
  paramsHelp: 'no params — pathfinds to the den, then rests sheltered until interrupted.',
  precondition(_params, ctx) {
    if (vecEq(ctx.world.ember.pos, ctx.world.denPos)) return true;
    const path = findPath(ctx.world, ctx.world.ember.pos, ctx.world.denPos, false);
    if (path.length === 0) return 'no path to the den';
    return true;
  },
  estCost(_params, ctx) {
    const path = findPath(ctx.world, ctx.world.ember.pos, ctx.world.denPos, false);
    const mult = modeMult(ctx);
    return { heat: 0.05 * mult, fatigue: path.length * MOVE_FATIGUE_PER_STEP * mult };
  },
  start(): SkillExec {
    return {
      tick(tctx) {
        if (vecEq(tctx.world.ember.pos, tctx.world.denPos)) {
          return {
            status: 'running',
            exertion: { effort: 0, resting: true, sheltered: true },
          };
        }
        const path = findPath(tctx.world, tctx.world.ember.pos, tctx.world.denPos, false);
        if (path.length === 0) {
          return { status: 'failed', failReason: 'no path to the den', exertion: { effort: 0 } };
        }
        return {
          status: 'running',
          exertion: { effort: SHELTER_TRAVEL_EFFORT },
          moveTo: path[0],
        };
      },
    };
  },
};

// -------------------------------------------------------------------- flee

const flee: SkillDef = {
  name: 'flee',
  paramsHelp: 'from: {x, y} point to flee away from (e.g. last known wolf position).',
  precondition(params) {
    const fromR = requireVec(params, 'from');
    if (!fromR.ok) return fromR.reason;
    return true;
  },
  estCost(_params, ctx) {
    const mult = modeMult(ctx);
    return {
      fatigue: FLEE_DURATION * FLEE_FATIGUE_PER_TICK * mult,
      fuel: -FLEE_DURATION * FLEE_FUEL_PER_TICK * mult,
    };
  },
  start(params, ctx): SkillExec {
    const fromR = requireVec(params, 'from');
    const from = fromR.ok ? fromR.value : ctx.world.ember.pos;
    let ticksElapsed = 0;
    return {
      tick(tctx) {
        if (ticksElapsed >= FLEE_DURATION) {
          return { status: 'done', exertion: { effort: 0 } };
        }
        const pos = tctx.world.ember.pos;
        let dx = sign(pos.x - from.x);
        let dy = sign(pos.y - from.y);
        if (dx === 0 && dy === 0) dx = 1;
        const target: Vec = {
          x: clamp(pos.x + dx * FLEE_DISTANCE, 0, tctx.world.width - 1),
          y: clamp(pos.y + dy * FLEE_DISTANCE, 0, tctx.world.height - 1),
        };
        const path = findPath(tctx.world, pos, target, true);
        if (path.length === 0) {
          if (ticksElapsed === 0) {
            return { status: 'failed', failReason: 'nowhere to flee', exertion: { effort: 0 } };
          }
          return { status: 'done', exertion: { effort: 0 } };
        }
        ticksElapsed += 1;
        return { status: 'running', exertion: { effort: FLEE_EFFORT }, moveTo: path[0] };
      },
    };
  },
};

// ------------------------------------------------------------------- focus

export const FOCUSABLE_REGIONS = ['fuel', 'heat', 'damage', 'fatigue', 'activation'] as const;

const focus: SkillDef = {
  name: 'focus',
  paramsHelp: `region: one of ${FOCUSABLE_REGIONS.join('|')} — raises interoceptive confidence for that region, never changes state.`,
  precondition(params) {
    const region = params['region'];
    if (typeof region !== 'string' || !(FOCUSABLE_REGIONS as readonly string[]).includes(region)) {
      return `param "region" must be one of ${FOCUSABLE_REGIONS.join('|')}`;
    }
    return true;
  },
  estCost(_params, ctx) {
    return { fatigue: FOCUS_DURATION * 0.0004 * modeMult(ctx) };
  },
  start(): SkillExec {
    let ticks = 0;
    return {
      tick() {
        ticks += 1;
        const done = ticks >= FOCUS_DURATION;
        return { status: done ? 'done' : 'running', exertion: { effort: FOCUS_EFFORT } };
      },
    };
  },
};

// -------------------------------------------------------------------- wait

const wait: SkillDef = {
  name: 'wait',
  paramsHelp: 'no params — idles for a few ticks (effort 0).',
  precondition(params) {
    const flare = params['flare'];
    if (flare !== undefined && typeof flare !== 'boolean') {
      return 'param "flare" must be boolean';
    }
    return true;
  },
  estCost(params, ctx) {
    const mult = modeMult(ctx);
    if (params['flare'] === true) return { fuel: FLARE_FUEL_COST * mult };
    return { fatigue: WAIT_DURATION * 0.0004 * mult };
  },
  start(params): SkillExec {
    const isFlare = params['flare'] === true;
    if (isFlare) {
      let fired = false;
      return {
        tick() {
          if (fired) return { status: 'done', exertion: { effort: 0 } };
          fired = true;
          return { status: 'done', exertion: { effort: 1, fuelDelta: -FLARE_FUEL_COST } };
        },
      };
    }
    let ticks = 0;
    return {
      tick() {
        ticks += 1;
        const done = ticks >= WAIT_DURATION;
        return { status: done ? 'done' : 'running', exertion: { effort: 0 } };
      },
    };
  },
};

// ------------------------------------------------------------------- SKILLS

export const SKILLS: Record<SkillName, SkillDef> = {
  move_to: moveTo,
  gather,
  consume,
  rest,
  shelter,
  flee,
  focus,
  wait,
};
