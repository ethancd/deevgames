/**
 * EMBER — tick-loop wiring (src/engine/index.ts). PLAN.md §3 / the pinned
 * `createSim` doc comment in src/core/types.ts.
 *
 * This module is the ONLY place that:
 *   - threads the seeded Rng across sim/body/skills/pilot,
 *   - applies a skill's `moveTo` to WorldState (after validating passability
 *     + adjacency — skills themselves never touch WorldState),
 *   - folds a same-tick `world.wolf.attack` event into the Exertion passed
 *     to stepBody (skills never touch BodyState either),
 *   - decides when the pilot is consulted and adopts/validates its Intent.
 *
 * Tick order (per task spec):
 *   1. stepWorld(world, rng, log, glowRadius(body.fuel))         → world.*
 *   2. advance the active skill 1 tick; apply moveTo; fold wolf attack
 *      damage into Exertion.damageDelta                          → skill.*
 *   3. stepBody(body, world, exertion, rng, log)                 → body.*
 *   4. checkReflex — a firing reflex REPLACES the active intent immediately
 *      and is recorded in sim.intents like a pilot intent (tagged via its
 *      `goal: 'reflex:<name>'` prefix — see reflexes.ts)          → reflex.*
 *   5. interrupt check on the (possibly just-replaced) active intent's
 *      conditions; threat = wolf visible ? 1 - distance/perceptionRadius : 0
 *   6. if pilot due: build ContextPacket from COPIES (structuredClone),
 *      consult the pilot (or shift recordedIntents in replay mode),
 *      validateIntent — reject → pilot.intent.rejected + fallback to wait.
 *
 * ---------------------------------------------------------------------
 * DESIGN DECISION — "reflex fired" as a pilot-due trigger (documented per
 * task instructions; see notes returned to the orchestrator for the full
 * rationale):
 *
 * The task's tick-order sketch lists "reflex fired" alongside "every
 * PILOT_PERIOD ticks" / "intent finished/failed/interrupted" as one of the
 * conditions that makes the pilot due. Read maximally literally (consult
 * the pilot on the SAME tick a reflex just fired, before its freshly
 * adopted skill exec has ever run a single `tick()`), this would let the
 * pilot's fresh decision silently clobber the reflex's exec before it ever
 * executes even once — since skill execs only run via step 2 of a LATER
 * tick. For a durable reflex (e.g. the 40-tick forced collapse-rest) or a
 * one-shot reflex whose EFFECT lives in its Exertion (e.g. flare's fuel
 * cost), that would make the reflex's dynamical effect a no-op in practice
 * even though its `reflex.*` log event still fires — quietly contradicting
 * PLAN.md's "reflexes can interrupt deliberative plans" (i.e. reflexes are
 * meant to WIN, at least for the tick(s) they're active).
 *
 * This engine instead treats "reflex fired" as: on the SAME tick a reflex
 * first fires (or keeps firing), a fresh reflex adoption is never
 * *immediately* clobbered by a same-tick pilot consult — that would let the
 * pilot's decision silently pre-empt the reflex's own exec before it ever
 * runs even once (see below). The pilot IS still re-engaged promptly the
 * moment the reflex episode ends (the first tick checkReflex returns null
 * after having fired the tick before) — sooner than the normal 8-tick
 * cadence — AND, importantly, the ordinary `dueByPeriod` cadence is left
 * running even THROUGH a sustained reflex (e.g. collapse, which keeps
 * re-firing every tick fuel stays <= its threshold): without this, a
 * collapse triggered with no fuel source in reach would NEVER expire —
 * nothing restores fuel except a pilot-directed gather/consume, and this
 * engine had, in an earlier version, blocked the pilot for as long as the
 * reflex condition held, which is exactly forever for an ember stuck
 * fuel-less far from any deadwood/sunpatch (confirmed empirically: a
 * 2000-tick free-run reliably wedged into perpetual `reflex.collapse` with
 * zero chance of recovery). Letting `dueByPeriod` through means the pilot
 * gets a genuine, if infrequent (~1-in-8-tick), chance to direct movement
 * toward food even while "forced rest" dominates most ticks — reflexes
 * still win almost every tick (matching PLAN.md's "reflexes can interrupt
 * deliberative plans"), but the lockout is no longer absolute.
 * ---------------------------------------------------------------------
 */

import {
  PILOT_PERIOD,
  type BodyState,
  type ContextPacket,
  type EventLog,
  type Exertion,
  type Intent,
  type Observation,
  type Sim,
  type SimConfig,
  type SimEvent,
  type SkillCtx,
  type SkillExec,
  type SkillFeasibility,
  type SkillName,
  type Vec,
  type WorldState,
} from '../core/types';
import { createEventLog } from '../core/eventLog';
import { createRng } from '../core/rng';
import { createBody, computeInteroception, glowRadius, perceptionRadius, stepBody } from '../body';
import { generateWorld, isPassable, observe, stepWorld } from '../sim';
import { SKILLS, checkReflex, interruptTriggered, validateIntent } from '../skills';

/** How many recent log events to surface in ContextPacket.recentEvents. */
const RECENT_EVENTS_K = 24;

// ------------------------------------------------------------- local utils
// (trivial pure math duplicated locally rather than reaching into a sibling
// module's private files — same convention src/skills/vecUtils.ts documents.)

function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Reflex intents are tagged via the `reflex:<name>` goal prefix that
 *  src/skills/reflexes.ts always assigns (and that this engine never
 *  narration-strips — see stripNarration()'s comment below). Used to keep
 *  replay's recordedIntents queue (built from a flat sim.intents mix of
 *  pilot- and reflex-authored entries) pilot-only: reflexes are always
 *  recomputed live from the deterministic body/world trajectory, never
 *  replayed from the queue. */
function isReflexIntent(intent: Intent): boolean {
  return typeof intent.goal === 'string' && intent.goal.startsWith('reflex:');
}

// ------------------------------------------------------- intent sanitizing
//
// Fixed audit findings (mutation-attack / "can the pilot cheat?" audit):
// pilot output previously flowed into validateIntent/logging/
// buildContextPacket's structuredClone() essentially as-is. A hostile or
// buggy Pilot implementation could:
//   - hand back a non-array (or non-string-element) interruptConditions,
//     later crashing src/skills/reflexes.ts's interruptTriggered() uncaught
//     on the NEXT tick's interrupt check (engine/index.ts's step());
//   - define interruptConditions/params/etc. via a throwing getter, crashing
//     the very next read of that property anywhere downstream;
//   - include a non-cloneable value (e.g. a function) in params/thought,
//     crashing buildContextPacket's structuredClone(packet) the moment that
//     intent (accepted OR merely logged as rejected) scrolls into
//     ContextPacket.recentEvents or .activeIntent.
//
// sanitizeIntent() is the single choke point ALL pilot/replay-queue output
// passes through before anything else ever touches it: it defensively reads
// every field (never letting a thrown getter escape), and — critically —
// returns a brand-new, already-structuredClone-proven-safe plain Intent
// (params is deep-cloned via structuredClone itself, so a clone failure is
// caught HERE, turned into a clean rejection, and never reaches
// buildContextPacket later). Everything stored in `sim.intents`,
// `activeIntent`, and logged event payloads from this point on is this
// sanitized, plain-data form — never the caller's original object — so a
// getter that behaves adversarially on a LATER read (after having passed
// validation once) can no longer matter either.
type SanitizeResult =
  | { ok: true; intent: Intent }
  | { ok: false; reason: string; safePayload: Record<string, unknown> };

function safeRead<T>(fn: () => T): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: fn() };
  } catch {
    return { ok: false };
  }
}

function sanitizeIntent(raw: unknown): SanitizeResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, reason: 'pilot output must be an object', safePayload: {} };
  }
  const obj = raw as Record<string, unknown>;

  const skillRead = safeRead(() => obj.skill);
  if (!skillRead.ok || typeof skillRead.value !== 'string') {
    return { ok: false, reason: 'intent.skill must be a string', safePayload: {} };
  }
  const skill = skillRead.value;

  const paramsRead = safeRead(() => obj.params);
  if (
    !paramsRead.ok ||
    paramsRead.value === null ||
    typeof paramsRead.value !== 'object' ||
    Array.isArray(paramsRead.value)
  ) {
    return { ok: false, reason: 'intent.params must be an object', safePayload: { skill } };
  }
  let clonedParams: Record<string, unknown>;
  try {
    clonedParams = structuredClone(paramsRead.value) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      reason: 'intent.params could not be safely read (non-cloneable or throwing value)',
      safePayload: { skill },
    };
  }

  const condsRead = safeRead(() => obj.interruptConditions);
  if (!condsRead.ok || !Array.isArray(condsRead.value)) {
    return {
      ok: false,
      reason: 'intent.interruptConditions must be an array of strings',
      safePayload: { skill },
    };
  }
  const interruptConditions: string[] = [];
  for (const el of condsRead.value) {
    const elRead = safeRead(() => el);
    if (!elRead.ok || typeof elRead.value !== 'string') {
      return {
        ok: false,
        reason: 'intent.interruptConditions must be an array of strings',
        safePayload: { skill },
      };
    }
    interruptConditions.push(elRead.value);
  }

  const goalRead = safeRead(() => obj.goal);
  const goal = goalRead.ok && typeof goalRead.value === 'string' ? goalRead.value : '';

  const thoughtRead = safeRead(() => obj.thought);
  const thought =
    thoughtRead.ok && typeof thoughtRead.value === 'string' ? thoughtRead.value : undefined;

  return {
    ok: true,
    intent: { goal, skill: skill as SkillName, params: clonedParams, interruptConditions, thought },
  };
}

/** Strips the two non-causal narration fields. Applied ONLY to
 *  pilot-authored intents when narrationEnabled=false — reflex intents'
 *  `goal` ('reflex:collapse' etc.) is a structural source tag, not pilot
 *  prose, and is deliberately left intact (see isReflexIntent()). */
function stripNarration(intent: Intent): Intent {
  return { ...intent, goal: '', thought: undefined };
}

function fallbackWaitIntent(narrationEnabled: boolean): Intent {
  return {
    goal: narrationEnabled ? 'fallback: wait (intent rejected or unavailable)' : '',
    skill: 'wait',
    params: {},
    interruptConditions: [],
  };
}

/** Sum of all `world.wolf.attack` damage payloads logged THIS tick — the
 *  engine (not sim/, not skills/) is the only thing allowed to apply this
 *  into BodyState, via Exertion.damageDelta. */
function sumAttackDamageThisTick(log: EventLog, tick: number): number {
  let total = 0;
  for (const e of log.byTopic('world.wolf.attack')) {
    if (e.tick !== tick) continue;
    const payload = e.payload as { damage?: number } | null | undefined;
    if (payload && typeof payload.damage === 'number') total += payload.damage;
  }
  return total;
}

function nearestFuelId(world: WorldState): string | null {
  const ember = world.ember.pos;
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const dw of world.deadwood) {
    const d = chebyshev(ember, dw.pos);
    if (d < bestD) {
      bestD = d;
      bestId = dw.id;
    }
  }
  for (const sp of world.sunpatches) {
    const d = chebyshev(ember, sp.pos);
    if (d < bestD) {
      bestD = d;
      bestId = sp.id;
    }
  }
  return bestId;
}

/** Representative default params used ONLY to probe each skill's
 *  precondition/estCost for ContextPacket.skills — the pilot doesn't
 *  supply params until it actually commits to an intent, but
 *  SkillFeasibility is per-skill-name (not per-parameterization), so the
 *  engine picks a reasonable generic probe (see src/core/types.ts's
 *  SkillFeasibility shape). Chosen probes never trigger errors in any
 *  SkillDef and, where the skill's real semantics require e.g. adjacency,
 *  correctly surface infeasibility (e.g. gather when nothing is adjacent). */
function probeParamsFor(name: SkillName, ctx: SkillCtx): Record<string, unknown> {
  switch (name) {
    case 'move_to':
      return { dest: { x: ctx.world.ember.pos.x, y: ctx.world.ember.pos.y }, style: 'direct' };
    case 'gather':
      return { target: nearestFuelId(ctx.world) ?? 'none' };
    case 'consume':
      return { item: nearestFuelId(ctx.world) ?? 'none' };
    case 'rest':
      return { duration: 20 };
    case 'shelter':
      return {};
    case 'flee':
      return { from: { x: ctx.world.wolf.pos.x, y: ctx.world.wolf.pos.y } };
    case 'focus':
      return { region: 'fuel' };
    case 'wait':
      return {};
    default:
      return {};
  }
}

function buildSkillsFeasibility(ctx: SkillCtx): SkillFeasibility[] {
  return (Object.keys(SKILLS) as SkillName[]).map((name) => {
    const def = SKILLS[name];
    const params = probeParamsFor(name, ctx);
    const result = def.precondition(params, ctx);
    const feasible = result === true;
    return {
      name,
      feasible,
      estCost: def.estCost(params, ctx),
      whyNot: feasible ? undefined : (result as string),
    };
  });
}

// ------------------------------------------------------------- createSim

export function createSim(cfg: SimConfig): Sim {
  const narrationEnabled = cfg.narrationEnabled ?? true;

  // A single top-level Rng; every subsystem only ever gets a `.fork(label)`
  // of it (or of one of its own named children) — never `.next()`/`.int()`
  // directly on a shared instance — so ordering across ticks/subsystems
  // never perturbs anyone else's stream (see src/core/rng.ts's header).
  const masterRng = createRng(cfg.seed);
  const worldGenRng = masterRng.fork('worldgen');
  const worldRng = masterRng.fork('world');
  const skillRngBase = masterRng.fork('skill');
  const bodyRngBase = masterRng.fork('body');
  const pilotRngBase = masterRng.fork('pilotctx');

  const world: WorldState = generateWorld(cfg.seed, worldGenRng);
  cfg.worldPatch?.(world);

  const body: BodyState = createBody(cfg.bodyOverrides);
  const log: EventLog = createEventLog();
  const intents: Intent[] = [];

  // Replay mode: consume recordedIntents instead of consulting cfg.pilot,
  // but ONLY the pilot-authored subset — reflex-authored entries are always
  // recomputed live (see isReflexIntent()'s header comment).
  const pilotQueue: Intent[] | null = cfg.recordedIntents
    ? cfg.recordedIntents.filter((it) => !isReflexIntent(it))
    : null;
  let queueIdx = 0;

  let activeExec: SkillExec | null = null;
  let activeIntent: { intent: Intent; status: string } | null = null;
  let lastConsultTick = 0;
  // WF2 additive field (src/ui/contracts.ts header): the most recent
  // ContextPacket built for a pilot consultation. Exposed on the returned
  // Sim via a getter (see the return statement) so callers reading
  // `sim.lastPacket` always see the current value rather than a snapshot
  // captured at construction time.
  let lastPacket: ContextPacket | null = null;
  let reflexActiveLastTick = false;
  const seenEntityKinds = new Set<string>();

  function makeSkillCtx(tick: number, label: string): SkillCtx {
    return {
      world,
      body,
      rng: skillRngBase.fork(`${label}:${tick}`),
      log,
      tick,
    };
  }

  function adoptExecFor(intent: Intent, ctx: SkillCtx, onReject: () => void): void {
    const validated = validateIntent(intent, ctx);
    if (validated.ok) {
      activeExec = validated.def.start(intent.params, ctx);
      activeIntent = { intent, status: 'running' };
    } else {
      onReject();
      log.append({
        tick: ctx.tick,
        topic: 'pilot.intent.rejected',
        payload: { reason: validated.reason, intent },
      });
      const fallback = fallbackWaitIntent(narrationEnabled);
      activeExec = SKILLS.wait.start({}, ctx);
      activeIntent = { intent: fallback, status: 'running' };
    }
  }

  function adoptReflexIntent(reflexIntent: Intent, ctx: SkillCtx): void {
    intents.push(reflexIntent);
    adoptExecFor(reflexIntent, ctx, () => {});
  }

  /** Adopts whatever the pilot (or the replay queue) handed back.
   *  `rawIntent` is deliberately typed `unknown` here — see sanitizeIntent's
   *  header: a hostile/buggy Pilot is not trusted to actually return a
   *  well-formed Intent just because the Pilot interface says so. */
  function adoptPilotIntent(rawIntent: unknown, ctx: SkillCtx): void {
    const sanitizeResult = sanitizeIntent(rawIntent);
    if (!sanitizeResult.ok) {
      // Record a safe, replayable witness in sim.intents rather than the
      // raw (possibly poisoned / non-Intent-shaped) value — see
      // sanitizeIntent's header comment.
      const witness: Intent = {
        goal: narrationEnabled ? `pilot output rejected before validation: ${sanitizeResult.reason}` : '',
        skill: 'wait',
        params: {},
        interruptConditions: [],
      };
      intents.push(witness);
      log.append({
        tick: ctx.tick,
        topic: 'pilot.intent.rejected',
        payload: { reason: sanitizeResult.reason, intent: sanitizeResult.safePayload },
      });
      const fallback = fallbackWaitIntent(narrationEnabled);
      activeExec = SKILLS.wait.start({}, ctx);
      activeIntent = { intent: fallback, status: 'running' };
      return;
    }

    const sanitized = narrationEnabled ? sanitizeResult.intent : stripNarration(sanitizeResult.intent);
    intents.push(sanitized);
    const validated = validateIntent(sanitized, ctx);
    if (validated.ok) {
      log.append({ tick: ctx.tick, topic: 'pilot.intent.accepted', payload: { intent: sanitized } });
      activeExec = validated.def.start(sanitized.params, ctx);
      activeIntent = { intent: sanitized, status: 'running' };
    } else {
      log.append({
        tick: ctx.tick,
        topic: 'pilot.intent.rejected',
        payload: { reason: validated.reason, intent: sanitized },
      });
      const fallback = fallbackWaitIntent(narrationEnabled);
      activeExec = SKILLS.wait.start({}, ctx);
      activeIntent = { intent: fallback, status: 'running' };
    }
  }

  function buildContextPacket(tick: number, obs: Observation[]): ContextPacket {
    const attention =
      activeIntent && activeIntent.intent.skill === 'focus'
        ? ((activeIntent.intent.params as Record<string, unknown>)['region'] as string | undefined) ??
          null
        : null;
    const introRng = pilotRngBase.fork(`t:${tick}`);
    const interoception = computeInteroception(body, world, attention, introRng);
    const skills = buildSkillsFeasibility(makeSkillCtx(tick, 'probe'));
    const recentEvents = log.all().slice(-RECENT_EVENTS_K) as SimEvent[];

    const packet: ContextPacket = {
      tick,
      observations: obs,
      interoception,
      activeIntent: activeIntent ? { intent: activeIntent.intent, status: activeIntent.status } : null,
      recentEvents,
      skills,
    };
    // "ContextPacket must be built from copies — never leak live references
    // to WorldState or BodyState to a pilot." (src/core/types.ts header)
    return structuredClone(packet);
  }

  async function stepUnguarded(): Promise<void> {
    // ---- 1. world step ----
    const preGlow = glowRadius(body.fuel);
    stepWorld(world, worldRng, log, preGlow);
    const tick = world.tick;

    // ---- 2. skill runtime tick ----
    let exertion: Exertion = { effort: 0 };
    if (activeExec) {
      const ctx = makeSkillCtx(tick, 'skill');
      const result = activeExec.tick(ctx);
      exertion = result.exertion;
      if (activeIntent) activeIntent = { intent: activeIntent.intent, status: result.status };
      if (result.moveTo) {
        const dest = result.moveTo;
        // Engine validates passability + adjacency before applying — skills
        // only ever PROPOSE a move via SkillTickResult.moveTo.
        if (isPassable(world, dest) && chebyshev(world.ember.pos, dest) <= 1) {
          world.ember.pos = { x: dest.x, y: dest.y };
        }
      }
      if (result.status === 'done' || result.status === 'failed') {
        activeExec = null;
      }
    }

    const attackDamage = sumAttackDamageThisTick(log, tick);
    if (attackDamage !== 0) {
      exertion = { ...exertion, damageDelta: (exertion.damageDelta ?? 0) + attackDamage };
    }

    // ---- 3. body kernel ----
    stepBody(body, world, exertion, bodyRngBase.fork(`t:${tick}`), log);

    // ---- 4. reflex check (always evaluated; can preempt any active intent) ----
    const reflexCtx = makeSkillCtx(tick, 'reflex');
    const reflexIntent = checkReflex(reflexCtx);
    if (reflexIntent) {
      adoptReflexIntent(reflexIntent, reflexCtx);
    }
    const reflexFiredThisTick = reflexIntent !== null;

    // ---- observation + threat signal (shared by interrupt check + due-check) ----
    const radius = perceptionRadius(body);
    const obs = observe(world, world.ember.pos, radius);
    const wolfObs = obs.find((o) => o.what === 'wolf');
    const threat = wolfObs ? clamp01(1 - wolfObs.distance / Math.max(radius, 1e-6)) : 0;

    let newKind = false;
    for (const o of obs) {
      if (o.kind === 'entity' && !seenEntityKinds.has(o.what)) newKind = true;
    }
    for (const o of obs) {
      if (o.kind === 'entity') seenEntityKinds.add(o.what);
    }

    // ---- 5. interrupt check on the (possibly reflex-replaced) active intent ----
    let interrupted = false;
    if (activeIntent) {
      const fired = interruptTriggered(activeIntent.intent.interruptConditions, reflexCtx, threat);
      interrupted = fired !== null;
    }

    // See the file-header "DESIGN DECISION" note: a reflex firing THIS tick
    // can't be immediately clobbered by dueByStatus/interrupted/newKind (it
    // was JUST adopted and deserves at least one tick to run), but the
    // periodic cadence keeps ticking through a sustained reflex so a
    // reflex condition that never clears on its own (collapse with no fuel
    // in reach) can't permanently lock the pilot out; and the pilot is
    // promptly re-engaged the tick a reflex EPISODE ends.
    const reflexJustEnded = reflexActiveLastTick && !reflexFiredThisTick;
    reflexActiveLastTick = reflexFiredThisTick;

    const dueByPeriod = tick - lastConsultTick >= PILOT_PERIOD;
    const dueByStatus =
      !activeIntent || activeIntent.status === 'done' || activeIntent.status === 'failed';
    const due =
      dueByPeriod ||
      reflexJustEnded ||
      (!reflexFiredThisTick && (dueByStatus || interrupted || newKind));

    // ---- 6. pilot consult, if due ----
    if (due) {
      lastConsultTick = tick;
      const ctxPacket = buildContextPacket(tick, obs);
      lastPacket = ctxPacket;
      let rawIntent: unknown;
      if (pilotQueue) {
        rawIntent =
          queueIdx < pilotQueue.length ? pilotQueue[queueIdx++] : fallbackWaitIntent(narrationEnabled);
      } else {
        rawIntent = await cfg.pilot.decide(ctxPacket);
      }
      adoptPilotIntent(rawIntent, makeSkillCtx(tick, 'adopt'));
    }
  }

  // Fixed audit finding (latent reentrancy): step()/run() had no reentrancy
  // guard. ContextPacket exposes no sim/log/world/body handle through the
  // documented Pilot channel, so a pilot can't reach `sim` that way — but a
  // caller-side wiring choice (a Pilot implementation independently
  // closure-capturing the `sim` it was handed and calling `sim.step()`
  // re-entrantly from inside its own decide()) previously desynced the
  // event log's tick ordering silently, with no error. `stepInFlight` turns
  // that into a clear, immediate throw instead of silent corruption.
  let stepInFlight = false;

  async function step(): Promise<void> {
    if (stepInFlight) {
      throw new Error(
        'createSim: step() called re-entrantly (a Pilot must not call sim.step() from within decide())',
      );
    }
    stepInFlight = true;
    try {
      await stepUnguarded();
    } finally {
      stepInFlight = false;
    }
  }

  async function run(ticks: number): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      await step();
    }
  }

  return {
    world,
    body,
    log,
    intents,
    get lastPacket(): ContextPacket | null {
      return lastPacket;
    },
    step,
    run,
  };
}
