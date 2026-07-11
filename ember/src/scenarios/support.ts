/**
 * EMBER — shared scenario helpers (src/scenarios/support.ts).
 *
 * Not part of the pinned contract; internal to this module. Each of the 4
 * scenario files (and the replay/narration tests) uses these to drive a
 * Sim tick-by-tick and take cheap, deep-copied snapshots without ever
 * mutating — or leaking a live reference to — Sim.world / Sim.body.
 *
 * IMPORTANT — event-topic conventions this file (and the scenarios) rely
 * on, confirmed against the sibling modules that exist at the time this
 * was written:
 *   world.wolf.stalk_start / .attack_start / .attack / .flee_start /
 *     .patrol_resume     (src/sim/wolf.ts)
 *   body.mode.entered { mode, from }         (src/body/index.ts)
 *   body.var.crossed { var, from, to, direction }   (src/body/index.ts)
 *   reflex.collapse { fuel } / reflex.flare { activation } /
 *     reflex.flinch { dest }                  (src/skills/reflexes.ts)
 *   skill.gather.complete { target, buffered } /
 *     skill.consume.complete { item, amount } (src/skills/skills.ts)
 * Anything NOT in that list (e.g. exactly when/whether the engine logs a
 * generic "pilot consulted" event) is NOT assumed here — instead, timing of
 * pilot decisions is derived by watching Sim.intents grow across step()
 * calls, which is guaranteed by the pinned Sim/Pilot contract regardless of
 * how src/engine/ chooses to log it.
 */

import type {
  BodyState,
  DeadwoodEntity,
  Intent,
  Sim,
  SimEvent,
  Vec,
  WorldState,
} from '../core/types';
import { isPassable } from '../sim';

export interface Frame {
  tick: number;
  emberPos: Vec;
  body: BodyState;
  /** Intents newly present in sim.intents as of this tick (usually 0 or 1). */
  newIntents: Intent[];
}

function cloneVec(v: Vec): Vec {
  return { x: v.x, y: v.y };
}

function cloneBody(b: BodyState): BodyState {
  return { ...b, debts: { ...b.debts } };
}

/** Steps `sim` forward `ticks` times, returning one Frame per tick — a deep
 *  copy of ember position + body state, plus any pilot Intents that first
 *  appeared on that tick (by watching sim.intents.length grow). Never reads
 *  back a live reference into Sim.world/Sim.body. */
export async function trackTicks(sim: Sim, ticks: number): Promise<Frame[]> {
  const frames: Frame[] = [];
  let seenIntents = sim.intents.length;
  for (let i = 0; i < ticks; i++) {
    await sim.step();
    const newIntents = sim.intents.slice(seenIntents);
    seenIntents = sim.intents.length;
    frames.push({
      tick: sim.world.tick,
      emberPos: cloneVec(sim.world.ember.pos),
      body: cloneBody(sim.body),
      newIntents,
    });
  }
  return frames;
}

export function vecEq(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

/** First tick (from a Frame list) at which `pred` holds, or undefined. */
export function firstTickWhere(frames: Frame[], pred: (f: Frame) => boolean): number | undefined {
  return frames.find(pred)?.tick;
}

/** All log events matching an exact topic across the run so far. */
export function eventsOfTopic(log: readonly SimEvent[], topic: string): SimEvent[] {
  return log.filter((e) => e.topic === topic);
}

/** First tick any frame's newIntents contains an intent with this skill. */
export function firstIntentTick(frames: Frame[], skill: string): number | undefined {
  for (const f of frames) {
    if (f.newIntents.some((it) => it.skill === skill)) return f.tick;
  }
  return undefined;
}

/** First tick any frame's newIntents contains an intent matching `pred`. */
export function firstIntentMatching(
  frames: Frame[],
  pred: (it: Intent) => boolean,
): number | undefined {
  for (const f of frames) {
    if (f.newIntents.some(pred)) return f.tick;
  }
  return undefined;
}

export function allIntents(frames: Frame[]): Intent[] {
  return frames.flatMap((f) => f.newIntents);
}

/** Deep-ish equality over the position trajectory of two frame lists —
 *  used for the "trajectories diverge" assertions. */
export function positionsEqual(a: Frame[], b: Frame[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!vecEq(a[i].emberPos, b[i].emberPos)) return false;
  }
  return true;
}

/** Builds a fresh, fully-fueled DeadwoodEntity offset from `near` — used by
 *  scenarios to guarantee a reachable fuel source close to the ember's
 *  start position regardless of what the procedural map placed nearby. */
export function deadwoodNear(near: Vec, offset: Vec, id: string): DeadwoodEntity {
  return { id, pos: { x: near.x + offset.x, y: near.y + offset.y }, fuel: 1 };
}

// Referenced only for its WorldState parameter type on worldPatch callbacks
// scenarios write inline; kept here so the type is imported once.
export type WorldPatch = (world: WorldState) => void;

/** Nearest passable tile to `from` (BFS ring search, deterministic tie-break
 *  by row-major order), used so scenarios can place a fuel source / stage a
 *  position without accidentally landing on rock/water. Returns `from`
 *  itself if already passable. */
export function findPassableNear(world: WorldState, from: Vec, maxRadius = 6): Vec {
  if (isPassable(world, from)) return from;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p: Vec = { x: from.x + dx, y: from.y + dy };
        if (p.x < 0 || p.x >= world.width || p.y < 0 || p.y >= world.height) continue;
        if (isPassable(world, p)) return p;
      }
    }
  }
  return from;
}
