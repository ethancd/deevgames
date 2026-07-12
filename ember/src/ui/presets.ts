/**
 * EMBER — session presets (src/ui/presets.ts). Required export per the
 * pinned src/ui/contracts.ts: `PRESETS: Record<PresetId, Preset>`.
 *
 * These mirror the staging technique WF1's demo scenarios use (PLAN.md §5)
 * without importing scenario internals (module ownership: src/scenarios/ is
 * not this agent's directory, and its support.ts helpers aren't part of the
 * pinned public API) — the tiny `findPassableNear` BFS-ring helper below is
 * deliberately duplicated locally rather than reaching into
 * src/scenarios/support.ts, same convention src/engine/index.ts's header
 * documents for its own local vecUtils-style duplication.
 *
 * 'night-defend' staging is byte-for-byte the same technique
 * src/scenarios/dimEmberWolf.ts uses (corner the ember, plant the wolf just
 * inside scent range, drop fuel below WOLF_STALK_GLOW's glow threshold) —
 * that scenario is a proven, CI-asserted case that the wolf reliably stalks
 * and the kernel reliably enters DEFEND. Empirically re-verified for this
 * preset (scratch script driving createSim + ScriptedPilot for 40 ticks
 * across six seeds — see the orchestrator report): every seed tried reaches
 * `world.wolf.stalk_start` at tick+1 and `body.mode.entered{DEFEND}` at
 * tick+2 from the staged tick, so `warmupTicks: 0` already lands well
 * inside the "~40 ticks of play" bar with a wide margin — no seed search
 * was actually needed beyond confirming the reused staging holds.
 *
 * 'day-explore' staging is a simple healthy daytime body with no threats
 * planted; re-verified the same way (60 played ticks, six seeds): mode
 * stays EXPLORE throughout, wolf stays far off in PATROL.
 */

import type { BodyState, Vec, WorldState } from '../core/types';
import { isPassable } from '../sim';
import type { Preset, PresetId } from './contracts';

// ------------------------------------------------------------- local utils

/** Nearest passable tile to `from` (BFS ring search, deterministic tie-break
 *  by row-major order). Returns `from` itself if already passable. Mirrors
 *  src/scenarios/support.ts's helper of the same name/behavior — duplicated
 *  here rather than imported (see file header). */
function findPassableNear(world: WorldState, from: Vec, maxRadius = 8): Vec {
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

// -------------------------------------------------------------- free-run

const FREE_RUN_SEED = 1;

// ----------------------------------------------------------- night-defend

const NIGHT_DEFEND_SEED = 1717;

function nightDefendWorldPatch(world: WorldState): void {
  world.tick = 250; // night — glowRadius(0.3) < WOLF_STALK_GLOW already
  world.weather = 'clear';
  // Corner the ember: bounds how far a single flee leg can carry it, so the
  // wolf's approach (and the wolf's own scent-range detection) resolves
  // quickly and deterministically instead of the ember having open room to
  // wander indefinitely before the wolf ever gets in range.
  world.ember.pos = findPassableNear(world, { x: 2, y: 2 }, 8);
  // Wolf starts just inside the corner pocket, well within the 12-tile
  // scent range, so PATROL -> STALK triggers almost immediately once glow
  // is low. Offset 5 (rather than the minimum-viable 3) keeps STALK ->
  // ATTACK/FLEE from resolving for ~60 ticks (re-verified with a scratch
  // driver across the staged seed) instead of ~10 — DEFEND is still
  // entered within 2 ticks of play either way, but the wider berth gives
  // the ground-truth sparklines (sampled every 2 ticks) room to show real
  // variation instead of being captured 1-2 samples into the encounter.
  const target: Vec = {
    x: Math.min(world.width - 1, world.ember.pos.x + 5),
    y: Math.min(world.height - 1, world.ember.pos.y + 5),
  };
  world.wolf.pos = findPassableNear(world, target, 8);
  world.wolf.state = 'PATROL';
  world.wolf.stateTicks = 0;
}

const NIGHT_DEFEND_BODY: Partial<BodyState> = {
  fuel: 0.3, // glowRadius(0.3) ~= 2.2, comfortably under WOLF_STALK_GLOW (2.5)
  heat: 0.6,
  damage: 0,
  fatigue: 0.1,
  activation: 0.05,
};

// ------------------------------------------------------------- day-explore

const DAY_EXPLORE_SEED = 55;

function dayExploreWorldPatch(world: WorldState): void {
  world.tick = 100; // well into day, far from dusk
  world.weather = 'clear';
}

const DAY_EXPLORE_BODY: Partial<BodyState> = {
  fuel: 0.95,
  heat: 0.75,
  damage: 0,
  fatigue: 0.05,
  activation: 0.05,
};

// ------------------------------------------------------------------- table

export const PRESETS: Record<PresetId, Preset> = {
  'free-run': {
    id: 'free-run',
    label: 'Free Run',
    description: 'Default freshly generated wilderness, healthy ember, no staging.',
    seed: FREE_RUN_SEED,
    warmupTicks: 0,
  },
  'day-explore': {
    id: 'day-explore',
    label: 'Day · Explore',
    description: 'Healthy, well-fed ember ranging in daylight — the calm contrast frame.',
    seed: DAY_EXPLORE_SEED,
    bodyOverrides: DAY_EXPLORE_BODY,
    worldPatch: dayExploreWorldPatch,
    warmupTicks: 0,
  },
  'night-defend': {
    id: 'night-defend',
    label: 'Night · Defend',
    description: 'Dim ember at night, wolf stalking nearby — reaches DEFEND within moments of play.',
    seed: NIGHT_DEFEND_SEED,
    bodyOverrides: NIGHT_DEFEND_BODY,
    worldPatch: nightDefendWorldPatch,
    warmupTicks: 0,
  },
};
