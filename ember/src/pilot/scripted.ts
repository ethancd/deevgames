/**
 * EMBER — ScriptedPilot (src/pilot/scripted.ts).
 *
 * Deterministic, rule-based Pilot. Reads ONLY the ContextPacket handed to
 * decide() — no world/body access, no Date.now(), no Math.random(). Any
 * "memory" it keeps (visited-direction counters, last-gather target, a
 * dead-reckoned belief about its own position) lives in the closure
 * returned by createScriptedPilot() and is derived solely from past
 * ContextPackets/Intents it produced itself, never from ground truth.
 *
 * Priority order (first matching, feasible branch wins — PLAN §5 / task
 * brief):
 *   1. visible wolf, or elevated "safety" drive urgency  -> flee / shelter
 *   2. very-low felt capacity, believed-low fuel, or an  -> gather nearest
 *      urgent "fuel" drive                                  deadwood/sunpatch,
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

// ------------------------------------------------------------------- pilot

export function createScriptedPilot(): Pilot {
  // --- closure memory (derived only from this pilot's own past outputs) ---
  const visitCounts = new Map<number, number>(); // dir index -> times chosen
  let believedPos: Vec = { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
  let dirCursor = 0;
  let lastGatherTarget: { id: string; what: string; pos: Vec } | null = null;

  function pickExploreDir(): number {
    let bestIdx = 0;
    let bestCount = Infinity;
    for (let i = 0; i < EXPLORE_DIRS.length; i++) {
      // round-robin starting point so ties don't always favor N
      const idx = (dirCursor + i) % EXPLORE_DIRS.length;
      const count = visitCounts.get(idx) ?? 0;
      if (count < bestCount) {
        bestCount = count;
        bestIdx = idx;
      }
    }
    dirCursor = (bestIdx + 1) % EXPLORE_DIRS.length;
    visitCounts.set(bestIdx, (visitCounts.get(bestIdx) ?? 0) + 1);
    return bestIdx;
  }

  function exploreIntent(reason: string): Intent {
    const dirIdx = pickExploreDir();
    const d = EXPLORE_DIRS[dirIdx];
    const dest: Vec = {
      x: clamp(believedPos.x + d.x * EXPLORE_STEP, 0, GRID_W - 1),
      y: clamp(believedPos.y + d.y * EXPLORE_STEP, 0, GRID_H - 1),
    };
    believedPos = dest; // optimistic dead reckoning; only this pilot's belief
    return intent(
      'move_to',
      { dest, style: 'direct' },
      `Explore ${reason}`,
      'Nothing urgent — time to look around.',
      interrupts('threat_above_0.5', 'fuel_below_0.2', 'activation_above_0.6'),
    );
  }

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
        believedPos = wolfObs.pos; // last known danger bearing
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

    // ---- 2. fuel: felt capacity very low, believed-low fuel, or urgent drive ----
    const capacityVeryLow = ctx.interoception.global.capacity === 'very_low';
    const fuelSalient = ctx.interoception.salient.find((s) => s.region === 'fuel');
    const believedLowFuel = fuelSalient
      ? fuelSalient.qualities.includes('dim') || fuelSalient.qualities.includes('hungry')
      : false;
    const fuelUrgentTrue = fuelDrive > DRIVE_URGENT;

    if (capacityVeryLow || believedLowFuel || fuelUrgentTrue) {
      // Finish a gather we just completed by consuming what we gathered.
      if (
        ctx.activeIntent?.intent.skill === 'gather' &&
        ctx.activeIntent.status === 'done' &&
        lastGatherTarget &&
        isFeasible(ctx, 'consume')
      ) {
        const target = lastGatherTarget;
        return intent(
          'consume',
          { item: target.id, kind: target.what },
          `Eat the ${target.what}`,
          'That will keep the ember burning.',
          interrupts('threat_above_0.5'),
        );
      }

      const source = nearestFuelSource(ctx);
      if (source) {
        // gather()/consume() require being adjacent to (or on) the source —
        // close the distance first, then gather once we're there.
        if (source.distance <= 1 && isFeasible(ctx, 'gather')) {
          lastGatherTarget = { id: fuelSourceId(source), what: source.what, pos: source.pos };
          return intent(
            'gather',
            { target: fuelSourceId(source) },
            `Gather fuel from the nearest ${source.what}`,
            'Getting dim. Need fuel.',
            interrupts('threat_above_0.5', 'fuel_above_0.9'),
          );
        }
        if (isFeasible(ctx, 'move_to')) {
          believedPos = source.pos;
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
        return exploreIntent('for fuel');
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
      return exploreIntent('the unknown');
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
