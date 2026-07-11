/**
 * EMBER — pinned type contracts (WF1). Authored by the supervisor.
 *
 * Module builders implement AGAINST these types and MUST NOT edit this file.
 * The integrate agent may make minimal additive changes only, and must
 * document each one in its report.
 *
 * Module ownership (an agent writes ONLY inside its own directory):
 *   src/core/       this file (pinned) + rng.ts, eventLog.ts (scaffold agent)
 *   src/sim/        world gen, world step, wolf FSM, weather        (agent A)
 *   src/body/       kernel: dynamics, modes, interoception, glow    (agent B)
 *   src/skills/     skill defs, runtime, arbiter, reflexes          (agent C)
 *   src/pilot/      ScriptedPilot                                   (agent D)
 *   src/scenarios/  scenario harness + 4 demo scenarios             (agent D)
 *   src/engine/     createSim tick-loop wiring                      (integrate)
 *
 * DETERMINISM RULES (non-negotiable):
 *   - No Date.now(), no Math.random(), no unseeded randomness anywhere in
 *     src/{sim,body,skills,pilot,scenarios,engine}. All randomness flows from
 *     the Rng passed down by the engine.
 *   - A run is fully determined by (seed, initial overrides, intent sequence).
 *
 * AUTHORITY RULES:
 *   - The pilot's ONLY input is ContextPacket; its ONLY output is Intent.
 *   - ContextPacket must be built from copies — never leak live references to
 *     WorldState or BodyState to a pilot.
 *   - Skills express effects as Exertion; only the body kernel (stepBody)
 *     mutates BodyState, and only the engine applies movement to the world.
 */

// ---------------------------------------------------------------- scalars

export type Vec = { x: number; y: number };

export type Mode = 'EXPLORE' | 'CONSERVE' | 'DEFEND' | 'RECOVER';

export type Bucket = 'very_low' | 'low' | 'mid' | 'high' | 'very_high';

export type TileType = 'grass' | 'forest' | 'rock' | 'water' | 'den';

export type WolfState = 'PATROL' | 'STALK' | 'ATTACK' | 'FLEE';

export type Weather = 'clear' | 'rain';

export type SkillName =
  | 'move_to'
  | 'gather'
  | 'consume'
  | 'rest'
  | 'shelter'
  | 'flee'
  | 'focus'
  | 'wait';

// -------------------------------------------------------------- constants

export const GRID_W = 48;
export const GRID_H = 32;

/** Ticks per full day cycle. Ticks [0, DAY_TICKS/2) are day, rest is night. */
export const DAY_TICKS = 480;

/** Pilot is consulted every PILOT_PERIOD ticks, or earlier on interrupts. */
export const PILOT_PERIOD = 8;

/** Glow radius in tiles at fuel = 1. glowRadius(fuel) scales toward 0. */
export const GLOW_MAX = 6;

/** Wolf will only enter STALK when the ember's glow radius is below this. */
export const WOLF_STALK_GLOW = 2.5;

/** Bucket edges for qualitative interoception: [vl|l, l|m, m|h, h|vh]. */
export const BUCKET_EDGES = [0.15, 0.35, 0.65, 0.85] as const;

/**
 * Rough dynamics targets (agent B tunes exact constants around these):
 *   - fuel:  full -> empty in ~400 ticks idle, ~200 ticks moving constantly.
 *   - heat:  comfortable band by day; at night in the open, leaves the viable
 *            band within ~120 ticks; den or high fuel burn restores it.
 *   - fatigue: sustained activity reaches high (~0.8) in ~300 ticks; rest
 *            clears most of it in ~60 ticks, EXCEPT accumulated debt.
 *   - activation: threat spikes to ~0.9 within a few ticks; decays with a
 *            half-life of ~80 ticks (hysteresis — this is deliberate).
 */
export const VIABLE_BANDS: Record<BodyVar, [number, number]> = {
  fuel: [0.25, 1.0],
  heat: [0.35, 0.9],
  damage: [0.0, 0.3],
  fatigue: [0.0, 0.6],
  activation: [0.0, 0.7],
  stability: [0.4, 1.0],
};

// ------------------------------------------------------------------- core

/** Seeded PRNG (mulberry32 or similar). fork() derives an independent,
 *  label-stable stream so subsystems can't perturb each other's draws. */
export interface Rng {
  next(): number; // [0, 1)
  int(n: number): number; // [0, n)
  fork(label: string): Rng;
}

export interface SimEvent {
  tick: number;
  topic: string; // dot-namespaced: world.* | body.* | skill.* | pilot.* | reflex.*
  payload: unknown;
}

export interface EventLog {
  append(e: SimEvent): void;
  all(): readonly SimEvent[];
  byTopic(prefix: string): readonly SimEvent[];
  /** Stable serialization used for byte-exact replay comparison. */
  serialize(): string;
}

// ------------------------------------------------------------------ world

export interface DeadwoodEntity {
  id: string;
  pos: Vec;
  fuel: number; // remaining harvestable fuel, 0..1
}

export interface SunpatchEntity {
  id: string;
  pos: Vec;
  active: boolean; // only during day
}

export interface WolfEntity {
  pos: Vec;
  state: WolfState;
  /** ticks remaining in a committed behavior (e.g. flee duration) */
  stateTicks: number;
}

export interface WorldState {
  seed: number;
  tick: number;
  width: number; // GRID_W
  height: number; // GRID_H
  tiles: TileType[]; // row-major, length width*height
  denPos: Vec;
  deadwood: DeadwoodEntity[];
  sunpatches: SunpatchEntity[];
  wolf: WolfEntity;
  weather: Weather;
  ember: { pos: Vec };
}

/** Required exports from src/sim/index.ts:
 *    generateWorld(seed: number, rng: Rng): WorldState
 *    stepWorld(world: WorldState, rng: Rng, log: EventLog, emberGlow: number): void
 *    isPassable(world: WorldState, pos: Vec): boolean   // rock/water block
 *    isDay(tick: number): boolean
 *    observe(world: WorldState, from: Vec, radius: number): Observation[]
 *    findPath(world: WorldState, from: Vec, to: Vec, cautious: boolean): Vec[]
 *  Wolf FSM: PATROL until glow < WOLF_STALK_GLOW and ember within scent
 *  range -> STALK (approach slowly); adjacent -> ATTACK (emits
 *  world.wolf.attack event with damage payload); bright flare or glow
 *  recovering above threshold -> FLEE for a while, then PATROL. */

// ------------------------------------------------------------------- body

export type BodyVar =
  | 'fuel'
  | 'heat'
  | 'damage'
  | 'fatigue'
  | 'activation'
  | 'stability';

export interface BodyState {
  fuel: number; // 0..1
  heat: number; // 0..1
  damage: number; // 0..1 (0 = intact)
  fatigue: number; // 0..1
  activation: number; // 0..1
  stability: number; // 0..1, DERIVED each step from the others' deviations
  mode: Mode; // kernel-computed with hysteresis; never set by a pilot
  debts: { fatigue: number }; // overexertion debt a single rest cannot clear
}

/** How a skill's activity this tick reaches the kernel. Skills never mutate
 *  BodyState directly; the engine passes Exertion into stepBody. */
export interface Exertion {
  effort: number; // 0..1 activity level (movement ~0.5, fleeing ~0.9)
  fuelDelta?: number; // direct intake, e.g. consuming deadwood (+)
  heatDelta?: number;
  damageDelta?: number; // e.g. wolf attack applied via engine
  resting?: boolean;
  sheltered?: boolean; // in den
}

export interface Interoception {
  global: {
    activation: Bucket;
    capacity: Bucket; // felt overall energy (derived from fuel+fatigue)
    stability: Bucket;
    temperature: Bucket;
    trend: string; // e.g. "activation rising"
    confidence: number; // 0..1, degraded by fatigue + damage
  };
  salient: { region: string; qualities: string[]; confidence: number }[];
  drives: { drive: string; urgency: number; predictedTicksToLimit?: number }[];
  availableRegulation: SkillName[];
}

/** Required exports from src/body/index.ts:
 *    createBody(overrides?: Partial<BodyState>): BodyState
 *    stepBody(body: BodyState, world: WorldState, exertion: Exertion,
 *             rng: Rng, log: EventLog): void          // includes mode update
 *    computeInteroception(body: BodyState, world: WorldState,
 *             attention: string | null, rng: Rng): Interoception
 *    glowRadius(fuel: number): number                 // 0..GLOW_MAX
 *    perceptionRadius(body: BodyState): number        // narrowed by DEFEND
 *  Interoception noise scales with fatigue + damage; attention (from a focus
 *  skill) raises confidence for the attended region WITHOUT changing state. */

// ------------------------------------------------------------------ pilot

export interface Observation {
  kind: 'entity' | 'terrain';
  what: string; // 'wolf' | 'deadwood' | 'sunpatch' | 'den' | 'water' | ...
  pos: Vec;
  distance: number;
  detail?: Record<string, unknown>;
}

export interface Intent {
  goal: string; // narration, non-causal
  skill: SkillName;
  params: Record<string, unknown>;
  /** Grammar: "<var>_above_<num>" | "<var>_below_<num>" where <var> is a
   *  BodyVar or "threat" (0..1 wolf proximity signal when visible). The
   *  engine ALSO always interrupts on: reflex fired, skill done/failed,
   *  newly observed entity kind. */
  interruptConditions: string[];
  thought?: string; // speech bubble, non-causal; stripped when narration off
}

export interface SkillFeasibility {
  name: SkillName;
  feasible: boolean;
  estCost: Partial<Record<BodyVar, number>>;
  whyNot?: string;
}

export interface ContextPacket {
  tick: number;
  observations: Observation[]; // FOV- and mode-filtered, copies
  interoception: Interoception;
  activeIntent: { intent: Intent; status: string } | null;
  recentEvents: SimEvent[]; // salience-filtered, last K
  skills: SkillFeasibility[];
}

export interface Pilot {
  decide(ctx: ContextPacket): Promise<Intent> | Intent;
}

/** Required export from src/pilot/scripted.ts:
 *    createScriptedPilot(): Pilot
 *  Rule-based; reads ONLY the ContextPacket. Priorities roughly:
 *  threat -> flee/shelter; low capacity -> refuel/rest; cold + night
 *  approaching -> return to den; otherwise explore/gather. */

// ----------------------------------------------------------------- skills

export interface SkillCtx {
  world: WorldState; // read-only by convention (audited)
  body: BodyState; // read-only by convention (audited)
  rng: Rng;
  log: EventLog;
  tick: number;
}

export interface SkillTickResult {
  status: 'running' | 'done' | 'failed';
  failReason?: string;
  exertion: Exertion;
  moveTo?: Vec; // engine validates passability + adjacency before applying
}

export interface SkillExec {
  tick(ctx: SkillCtx): SkillTickResult;
}

export interface SkillDef {
  name: SkillName;
  /** Human-readable parameter description surfaced to the pilot. */
  paramsHelp: string;
  precondition(params: Record<string, unknown>, ctx: SkillCtx): true | string;
  estCost(
    params: Record<string, unknown>,
    ctx: SkillCtx,
  ): Partial<Record<BodyVar, number>>;
  start(params: Record<string, unknown>, ctx: SkillCtx): SkillExec;
}

/** Required exports from src/skills/index.ts:
 *    SKILLS: Record<SkillName, SkillDef>
 *    validateIntent(intent: Intent, ctx: SkillCtx):
 *        { ok: true; def: SkillDef } | { ok: false; reason: string }
 *    checkReflex(ctx: SkillCtx): Intent | null
 *      - collapse: fuel <= 0.02 -> forced rest-in-place
 *      - flinch: adjacent wolf in ATTACK -> step away one tile
 *      - flare: attacked while activation > 0.7 -> bright burst (big fuel
 *        cost, wolf flees). Reflexes preempt any active intent.
 *    interruptTriggered(conds: string[], ctx: SkillCtx,
 *                       threat: number): string | null
 *  validateIntent must reject unknown skills, malformed params, and any
 *  intent whose precondition fails — the pilot cannot act by description. */

// ----------------------------------------------------------------- engine

export interface SimConfig {
  seed: number;
  pilot: Pilot;
  bodyOverrides?: Partial<BodyState>;
  /** Applied after generateWorld — scenarios use this to stage setups. */
  worldPatch?: (world: WorldState) => void;
  /** Replay mode: consume these instead of consulting the pilot. */
  recordedIntents?: Intent[];
  /** Anti-role-play toggle: when false, goal/thought are stripped from
   *  intents before logging and the pilot receives no narration echo. */
  narrationEnabled?: boolean;
}

export interface Sim {
  world: WorldState;
  body: BodyState;
  log: EventLog;
  /** Every pilot output in order — replaying these must reproduce the log. */
  intents: Intent[];
  step(): Promise<void>;
  run(ticks: number): Promise<void>;
}

/** Required export from src/engine/index.ts:
 *    createSim(cfg: SimConfig): Sim
 *  Tick order (PLAN §3): stepWorld -> skill runtime tick -> stepBody ->
 *  reflex/interrupt check -> (pilot if due) -> events appended. */

// -------------------------------------------------------------- scenarios

export interface ScenarioResult {
  id: string;
  pass: boolean;
  details: string;
}

export interface Scenario {
  id: string;
  description: string;
  /** Self-contained: creates its own sim(s) via createSim, runs them, and
   *  asserts over the event logs (PLAN §5). */
  run(): Promise<ScenarioResult>;
}

/** Required export from src/scenarios/index.ts:
 *    SCENARIOS: Scenario[]   // exactly the 4 from PLAN §5, ids:
 *    'rested-vs-depleted' | 'anticipatory-shelter' | 'dim-ember-wolf'
 *    | 'miscalibrated-interoception' */
