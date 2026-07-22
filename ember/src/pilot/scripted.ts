/**
 * EMBER — ScriptedPilot (src/pilot/scripted.ts).
 *
 * Deterministic, rule-based Pilot. Reads ONLY the ContextPacket handed to
 * decide() — no world/body access, no Date.now(), no Math.random(), and
 * (per a fixed audit finding) NO mutable closure state that persists across
 * decide() calls either. Every decision is a pure function of the single
 * ContextPacket argument: whatever "memory" the pilot needs (which
 * direction it explored last, a dead-reckoned belief about its own
 * position, what it just finished gathering) is reconstructed each call
 * from `ctx.activeIntent` and `ctx.recentEvents` — i.e. from this sim's own
 * event log, not from anything shared across Pilot instances or Sims.
 * createScriptedPilot() instances hold zero mutable fields, so the exact
 * same Pilot object can safely be handed to any number of concurrently
 * stepped Sims without cross-contaminating their trajectories (see
 * src/engine/determinism.test.ts).
 *
 * A second fixed audit finding: earlier versions of this pilot partly keyed
 * its fuel-seeking branch on the noisy interoception's freeform prose
 * (`salient[].qualities` strings like 'dim'/'hungry'). That made a purely
 * cosmetic relabeling of those strings change the pilot's plan — a
 * prose-grounding violation. This pilot now reacts ONLY to typed, numeric
 * interoception fields (`global.capacity` Bucket, `drives[].urgency`,
 * `drives[].predictedTicksToLimit`) which src/body/interoception.ts computes
 * as genuinely noisy, attention-sensitive readings (see its driveUrgencyAndForecast).
 * `qualities` strings are still read only for constructing this pilot's own
 * non-causal `thought`/`goal` narration — never for branching.
 *
 * Priority order (first matching, feasible branch wins — PLAN §5 / task
 * brief):
 *   1. visible wolf, or elevated "safety" drive urgency  -> flee / shelter
 *   2. very-low felt capacity, or an urgent "fuel" drive -> gather nearest
 *      (noisy but typed — not prose)                        deadwood/sunpatch,
 *                                                            then consume it
 *   3. urgent "warmth" drive, or a small predicted-ticks- -> shelter (den)
 *      to-limit on warmth while dusk is approaching
 *   4. high "rest" drive urgency while safe               -> rest
 *   5. otherwise                                          -> explore toward
 *                                                            the least-visited
 *                                                            direction
 *
 * Every returned Intent carries sensible interruptConditions (grammar:
 * "<BodyVar|threat>_above_<n>" / "..._below_<n>", per src/core/types.ts) and
 * short, non-causal goal/thought narration.
 */

import {
  DAY_TICKS,
  GRID_H,
  GRID_W,
  type ContextPacket,
  type Intent,
  type Observation,
  type Pilot,
  type SkillName,
  type Vec,
} from '../core/types';

// -------------------------------------------------------------- thresholds

/** "Urgent" cut for a drives[].urgency reading (0..1 scale). */
const DRIVE_URGENT = 0.3;
/** Higher bar used for the safety drive specifically — a lingering elevated
 *  activation should keep the ember cautious well after the wolf is gone
 *  (hysteresis), but shouldn't fire on every mild flicker. */
const SAFETY_URGENT = 0.5;
/** predictedTicksToLimit at/under this is "coming soon". */
const SOON_TICKS = 40;
/** Dusk window: the back end of the day phase, before night starts at
 *  DAY_TICKS/2. Mirrors src/body/index.ts's private isNight() boundary
 *  without importing it (module ownership boundary). */
const DUSK_LEAD_TICKS = 80;
/** Rest duration requested per rest intent (ticks). */
const REST_DURATION = 40;
/** Step size (tiles) for one dead-reckoned exploration leg. */
const EXPLORE_STEP = 6;

const EXPLORE_DIRS: Vec[] = [
  { x: 0, y: -1 }, // N
  { x: 1, y: -1 }, // NE
  { x: 1, y: 0 }, // E
  { x: 1, y: 1 }, // SE
  { x: 0, y: 1 }, // S
  { x: -1, y: 1 }, // SW
  { x: -1, y: 0 }, // W
  { x: -1, y: -1 }, // NW
];

function isDuskApproaching(tick: number): boolean {
  const phase = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  const nightStart = DAY_TICKS / 2;
  return phase >= nightStart - DUSK_LEAD_TICKS && phase < nightStart;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ------------------------------------------------------------- interrupts

function interrupts(...conds: string[]): string[] {
  return conds;
}

// ------------------------------------------------------------------ intent

function intent(
  skill: SkillName,
  params: Record<string, unknown>,
  goal: string,
  thought: string,
  interruptConditions: string[],
): Intent {
  return { goal, skill, params, interruptConditions, thought };
}

// -------------------------------------------------------------- feasibility

function isFeasible(ctx: ContextPacket, skill: SkillName): boolean {
  const f = ctx.skills.find((s) => s.name === skill);
  // Defensive default: if the skill isn't listed at all, don't let that
  // alone block a decision — validateIntent() downstream is the real gate.
  return f ? f.feasible : true;
}

// ----------------------------------------------------------------- drives

function driveUrgency(ctx: ContextPacket, drive: string): number {
  return ctx.interoception.drives.find((d) => d.drive === drive)?.urgency ?? 0;
}

function driveForecast(ctx: ContextPacket, drive: string): number | undefined {
  return ctx.interoception.drives.find((d) => d.drive === drive)?.predictedTicksToLimit;
}

// --------------------------------------------------------------- fuel find

function nearestFuelSource(ctx: ContextPacket): Observation | null {
  let best: Observation | null = null;
  for (const o of ctx.observations) {
    if (o.what !== 'deadwood' && o.what !== 'sunpatch') continue;
    if (o.what === 'sunpatch' && o.detail?.active === false) continue;
    if (!best || o.distance < best.distance) best = o;
  }
  return best;
}

function fuelSourceId(o: Observation): string {
  const id = o.detail?.id;
  return typeof id === 'string' ? id : `${o.what}@${o.pos.x},${o.pos.y}`;
}

// -------------------------------------------------- stateless self-memory
//
// This pilot keeps no closure state (see file header). Instead, whatever it
// needs to "remember" between calls is reconstructed each decide() purely
// from ctx.activeIntent / ctx.recentEvents — both of which are built by the
// engine from THIS sim's own event log, so two Sims sharing the same Pilot
// object can never see each other's history here.

function vecParam(it: Intent | undefined, key: string): Vec | undefined {
  if (!it) return undefined;
  const v = (it.params as Record<string, unknown> | undefined)?.[key];
  if (
    v &&
    typeof v === 'object' &&
    typeof (v as Vec).x === 'number' &&
    typeof (v as Vec).y === 'number'
  ) {
    return v as Vec;
  }
  return undefined;
}

function acceptedIntentFromEvent(payload: unknown): Intent | undefined {
  const p = payload as { intent?: Intent } | null | undefined;
  return p?.intent;
}

/** Best-effort dead-reckoned belief about the ember's own position, derived
 *  solely from the intents this pilot has itself issued (via ctx), never
 *  from ground truth. Falls back to the map center on a cold start. */
function estimateSelfPos(ctx: ContextPacket): Vec {
  const active = ctx.activeIntent?.intent;
  if (active) {
    if (active.skill === 'move_to') {
      const dest = vecParam(active, 'dest');
      if (dest) return dest;
    }
    if (active.skill === 'flee') {
      const from = vecParam(active, 'from');
      if (from) return from; // last known danger bearing
    }
  }
  for (let i = ctx.recentEvents.length - 1; i >= 0; i--) {
    const e = ctx.recentEvents[i];
    if (e.topic !== 'pilot.intent.accepted') continue;
    const it = acceptedIntentFromEvent(e.payload);
    if (!it) continue;
    if (it.skill === 'move_to') {
      const dest = vecParam(it, 'dest');
      if (dest) return dest;
    } else if (it.skill === 'flee') {
      const from = vecParam(it, 'from');
      if (from) return from;
    }
  }
  return { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
}

/** Explore legs stamp a `_exploreDir` marker into their own (non-narration)
 *  params so a later call can recover which directions were already tried,
 *  purely by scanning ctx.recentEvents — no closure counters needed. */
function pastExploreDirs(ctx: ContextPacket): number[] {
  const dirs: number[] = [];
  for (const e of ctx.recentEvents) {
    if (e.topic !== 'pilot.intent.accepted') continue;
    const it = acceptedIntentFromEvent(e.payload);
    if (!it || it.skill !== 'move_to') continue;
    const raw = (it.params as Record<string, unknown> | undefined)?.['_exploreDir'];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < EXPLORE_DIRS.length) {
      dirs.push(raw);
    }
  }
  return dirs;
}

function pickExploreDir(ctx: ContextPacket): number {
  const past = pastExploreDirs(ctx);
  const counts = new Array(EXPLORE_DIRS.length).fill(0) as number[];
  for (const d of past) counts[d] += 1;
  const cursor = past.length > 0 ? (past[past.length - 1] + 1) % EXPLORE_DIRS.length : 0;
  let bestIdx = 0;
  let bestCount = Infinity;
  for (let i = 0; i < EXPLORE_DIRS.length; i++) {
    const idx = (cursor + i) % EXPLORE_DIRS.length;
    if (counts[idx] < bestCount) {
      bestCount = counts[idx];
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function exploreIntent(ctx: ContextPacket, reason: string): Intent {
  const dirIdx = pickExploreDir(ctx);
  const d = EXPLORE_DIRS[dirIdx];
  const origin = estimateSelfPos(ctx);
  const dest: Vec = {
    x: clamp(origin.x + d.x * EXPLORE_STEP, 0, GRID_W - 1),
    y: clamp(origin.y + d.y * EXPLORE_STEP, 0, GRID_H - 1),
  };
  return intent(
    'move_to',
    { dest, style: 'direct', _exploreDir: dirIdx },
    `Explore ${reason}`,
    'Nothing urgent — time to look around.',
    interrupts('threat_above_0.5', 'fuel_below_0.2', 'activation_above_0.6'),
  );
}

// ------------------------------------------------------------------- pilot

export function createScriptedPilot(): Pilot {
  function decide(ctx: ContextPacket): Intent {
    const wolfObs = ctx.observations.find((o) => o.what === 'wolf');
    const safetyUrgency = driveUrgency(ctx, 'safety');
    const fuelDrive = driveUrgency(ctx, 'fuel');
    const warmthDrive = driveUrgency(ctx, 'warmth');
    const warmthForecast = driveForecast(ctx, 'warmth');
    const restDrive = driveUrgency(ctx, 'rest');

    // ---- 1. safety: visible wolf or elevated safety urgency ----
    if (wolfObs || safetyUrgency > SAFETY_URGENT) {
      if (wolfObs && isFeasible(ctx, 'flee')) {
        return intent(
          'flee',
          { from: wolfObs.pos },
          'Flee the wolf',
          'It sees me. Run.',
          interrupts('threat_below_0.15', 'activation_below_0.2'),
        );
      }
      if (isFeasible(ctx, 'shelter')) {
        return intent(
          'shelter',
          {},
          'Get to the den until this passes',
          'Still on edge — better safe in the den.',
          interrupts('threat_above_0.6', 'heat_above_0.85'),
        );
      }
      // neither feasible (e.g. gated by low stability) — fall through.
    }

    // ---- 2. fuel: felt capacity very low, or an urgent (noisy, typed,
    //      attention-sensitive) fuel drive. Deliberately does NOT read
    //      interoception.salient[].qualities prose — see file header. ----
    const capacityVeryLow = ctx.interoception.global.capacity === 'very_low';
    const fuelUrgent = fuelDrive > DRIVE_URGENT;

    if (capacityVeryLow || fuelUrgent) {
      // Finish a gather we just completed by consuming what we gathered.
      // The target id is read straight off the just-completed intent's own
      // params — no separate "what we last gathered" memory needed.
      if (
        ctx.activeIntent?.intent.skill === 'gather' &&
        ctx.activeIntent.status === 'done' &&
        isFeasible(ctx, 'consume')
      ) {
        const targetId = (ctx.activeIntent.intent.params as Record<string, unknown>)?.['target'];
        if (typeof targetId === 'string') {
          return intent(
            'consume',
            { item: targetId },
            'Eat the gathered fuel',
            'That will keep the ember burning.',
            interrupts('threat_above_0.5'),
          );
        }
      }

      const source = nearestFuelSource(ctx);
      if (source) {
        // gather()/consume() require being adjacent to (or on) the source —
        // close the distance first, then gather once we're there.
        if (source.distance <= 1 && isFeasible(ctx, 'gather')) {
          return intent(
            'gather',
            { target: fuelSourceId(source) },
            `Gather fuel from the nearest ${source.what}`,
            'Getting dim. Need fuel.',
            interrupts('threat_above_0.5', 'fuel_above_0.9'),
          );
        }
        if (isFeasible(ctx, 'move_to')) {
          return intent(
            'move_to',
            { dest: source.pos, style: 'direct' },
            `Head to the nearest ${source.what} for fuel`,
            'Getting dim. Heading to fuel.',
            interrupts('threat_above_0.5', 'fuel_below_0.05'),
          );
        }
      }
      // Nothing in sight to refuel from — fold into exploration so the
      // pilot keeps looking, but be honest about why in the narration.
      if (isFeasible(ctx, 'move_to')) {
        return exploreIntent(ctx, 'for fuel');
      }
    }

    // ---- 3. warmth: urgent drive, or a small forecast while dusk nears ----
    const warmthUrgent = warmthDrive > DRIVE_URGENT;
    const warmthComingSoon =
      warmthForecast !== undefined && warmthForecast <= SOON_TICKS && isDuskApproaching(ctx.tick);
    if ((warmthUrgent || warmthComingSoon) && isFeasible(ctx, 'shelter')) {
      return intent(
        'shelter',
        {},
        'Head back before the cold sets in',
        'Dusk is coming — better get warm now than shiver later.',
        interrupts('heat_above_0.85', 'threat_above_0.5'),
      );
    }

    // ---- 4. fatigue: high rest urgency while safe ----
    const safe =
      !wolfObs &&
      safetyUrgency < DRIVE_URGENT &&
      (ctx.interoception.global.activation === 'very_low' ||
        ctx.interoception.global.activation === 'low' ||
        ctx.interoception.global.activation === 'mid');
    if (restDrive > DRIVE_URGENT && safe && isFeasible(ctx, 'rest')) {
      return intent(
        'rest',
        { duration: REST_DURATION },
        'Rest while it is quiet',
        'Heavy. A short rest will help.',
        interrupts('threat_above_0.4', 'fatigue_below_0.15'),
      );
    }

    // ---- 5. otherwise: explore ----
    if (isFeasible(ctx, 'move_to')) {
      return exploreIntent(ctx, 'the unknown');
    }

    // Every movement/action skill was infeasible — hold position.
    return intent(
      'wait',
      {},
      'Wait',
      'Nothing to do right now.',
      interrupts('threat_above_0.3', 'fuel_below_0.2'),
    );
  }

  return { decide };
}
