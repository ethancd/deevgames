/**
 * EMBER — display path line resolution (src/render/path.ts).
 *
 * Recomputes a DISPLAY-ONLY path for the dotted amber route line when the
 * active skill is move_to/flee/shelter, using the real `findPath` from
 * `../sim` — the skill runtime owns the actual path used for movement; this
 * is purely a visual recomputation from `lastIntent.params`, per
 * contracts.ts.
 */

import type { Intent, Vec, WorldState } from '../core/types';
import { findPath } from '../sim';

const PATH_SKILLS = new Set(['move_to', 'flee', 'shelter']);

function readVec(v: unknown): Vec | null {
  if (v === null || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  const x = obj.x;
  const y = obj.y;
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

const FLEE_DISPLAY_DIST = 8;

/** Best-effort display destination for the current intent; null if the
 *  active skill has no route to show or its params don't resolve to one. */
export function resolveDisplayDest(world: WorldState, intent: Intent | null): Vec | null {
  if (!intent || !PATH_SKILLS.has(intent.skill)) return null;

  if (intent.skill === 'shelter') {
    return { x: world.denPos.x, y: world.denPos.y };
  }

  if (intent.skill === 'move_to') {
    return readVec(intent.params?.dest);
  }

  // flee: params carries the point to move AWAY from, not a destination.
  // Project outward from it for a display-only approximation — the real
  // flee skill re-evaluates its own step every tick (see src/skills/skills.ts).
  const from = readVec(intent.params?.from);
  if (!from) return null;
  const ember = world.ember.pos;
  const dx = ember.x - from.x;
  const dy = ember.y - from.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const rawX = ember.x + (dx / len) * FLEE_DISPLAY_DIST;
  const rawY = ember.y + (dy / len) * FLEE_DISPLAY_DIST;
  return {
    x: Math.max(0, Math.min(world.width - 1, Math.round(rawX))),
    y: Math.max(0, Math.min(world.height - 1, Math.round(rawY))),
  };
}

/** Display path from the ember's current position to the resolved
 *  destination, or [] when there's nothing to show / no path exists. */
export function resolveDisplayPath(world: WorldState, intent: Intent | null): Vec[] {
  const dest = resolveDisplayDest(world, intent);
  if (!dest) return [];
  if (dest.x === world.ember.pos.x && dest.y === world.ember.pos.y) return [];
  return findPath(world, world.ember.pos, dest, false);
}
