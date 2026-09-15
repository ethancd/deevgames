/**
 * The ladder's engine registry (DESIGN §7.7): resolves a `--a`/`--b` name to a
 * fresh `Bot` for one game, driven by a `WorkSpec`. Names registered here at
 * M2: `aiv2-hard`, `aiv2-medium`, `aiv2-easy`, and their `-fast` throughput
 * variants, plus every scripted bot from `lab/harness/bots/index.ts`.
 * `aiv2-hard-turn`/`aiv2-medium-turn`/`aiv2-easy-turn` (M3's whole-turn path,
 * below) are registered here, and M14 adds `hard@<label>` — the replica search,
 * adapted through `lab/hard-ai/bots/hard.ts`. `hard@*` is a WHOLE-TURN shape
 * like `aiv2-*-turn`, so `wall:<ms>` funds one search per turn and `fixed:<n>`
 * is its work rung (the only mode §7.7's axis rule allows between `hard@*`
 * entries, and the one `hard:determinism` relies on).
 *
 * WorkSpec → engine budget (aiv2-*): `fixed:<units>` sets `AIEngineConfig.fixedWork`
 * to `units`, which forces `SearchBudget`'s deadline to `Infinity` and its
 * `maxWork` to `units` (`src/ai/engine-v2.ts:58`) — a pure work-unit counter,
 * untouched by wall-clock timing, so it is the mode `hard:determinism` (§7.4)
 * relies on for bit-identical replay across processes (`src/ai/runtime.ts`:
 * "Search work is deterministic when maxWork is used without a deadline").
 * `wall:<ms>` instead sets `mctsTimeLimit: ms` and `fixedWork: 0`, so the
 * engine gets a real wall-clock decision budget — the mode used for strength
 * SPRTs against scripted bots/other aiv2 engines, where a node-count budget
 * would not be comparable across engine shapes (§7.7's axis rule).
 *
 * **`wall:<ms>` is a per-TURN budget, not a per-decision one** (§7.7's axis
 * rule, spelled out at DESIGN F3: "wall-clock (`wall:<ms>` per turn)").
 * Comparability across engine SHAPES is the entire reason the axis rule picks
 * wall-clock over fixed work, and the shapes differ in how many searches a
 * turn costs: `hard@*` (§7.7's bot adapter) and the `-turn` names below search
 * ONCE per turn, the per-action names below once per action. Funding both at
 * `ms` per *call* would hand the per-action shape ~`ACTIONS + 1`× the thinking
 * time of the whole-turn shape and make every cross-shape row meaningless (it
 * measured the M3 calibration row at −190 Elo where EG G12 predicts +30…60).
 * So `createAiv2Bot` splits `ms` across the turn's remaining decisions exactly
 * the way the shipped UI does (`useAI.ts`: `remainingCPU / decisionsRemaining`,
 * debited by what each search actually spent), and `createAiv2TurnBot` spends
 * the whole `ms` on its one search. `fixed:<units>` is untouched and stays a
 * per-decision work-unit count: it is deterministic by construction (§7.4,
 * `hard:determinism`), and the axis rule confines it to `hard@*`-vs-`hard@*`
 * pairings, which have the same shape on both seats.
 */
import { readFileSync } from 'node:fs';
import { instantiateTactics, type TacticalSolver } from '../../../src/ai/wasm/kernel';
import { referenceTactics } from '../../../src/ai/tactics/home';
import { AIEngineV2 } from '../../../src/ai/engine-v2';
import { shouldResign } from '../../../src/ai/evaluation';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction, AIDifficulty, AIResult } from '../../../src/ai/types';
import type { Bot, EngineBot } from '../../harness/types';
import { createBot as createScriptedRegistryBot, botNames } from '../../harness/bots/index';
import { createHardBot, hardConfigFor, hardConfigHash } from '../bots/hard';

export type WorkSpec = { mode: 'fixed'; units: number } | { mode: 'wall'; ms: number };

export function parseWorkSpec(spec: string): WorkSpec {
  const m = /^(fixed|wall):(\d+(?:\.\d+)?)$/.exec(spec);
  if (!m) throw new Error(`invalid --work "${spec}": expected fixed:<units> or wall:<ms>`);
  const n = Number(m[2]);
  return m[1] === 'fixed' ? { mode: 'fixed', units: n } : { mode: 'wall', ms: n };
}

export function workKey(work: WorkSpec): string {
  return work.mode === 'fixed' ? `fixed:${work.units}` : `wall:${work.ms}`;
}

export interface LadderEngine {
  name: string;
  createBot(work: WorkSpec): Bot;
  /** Stable identifier for this engine's exact config at this work spec (`GameRecord.engineConfigHash`). */
  configHash(work: WorkSpec): string;
}

// Lazily instantiated once per process and shared across every aiv2 bot this
// worker creates (avoids re-reading/re-compiling the wasm module per game).
let kernelPromise: Promise<TacticalSolver> | null = null;
function getKernel(): Promise<TacticalSolver> {
  if (!kernelPromise) {
    const wasmPath = new URL('../../../src/ai/wasm/tactics.wasm', import.meta.url);
    kernelPromise = instantiateTactics(readFileSync(wasmPath)).catch(() => referenceTactics);
  }
  return kernelPromise;
}

/** Throughput preset for `-fast` names: cheaper per-decision tactical/beam search, independent of `WorkSpec`. */
const FAST_THROUGHPUT = { tacticalNodes: 20000, beamWidth: 12, outputPlans: 10 };

/**
 * Configures and runs one `AIEngineV2` decision (DESIGN §7.7/§7.4). Shared by
 * the ladder bot adapter below and `verify/determinism.ts`, which needs the
 * full `AIResult` (not just the chosen action) to compare `score`/`depth`/
 * `stats` across runs.
 */
export async function aiv2Decision(difficulty: AIDifficulty, fast: boolean, work: WorkSpec, state: GameState, seed: number): Promise<AIResult> {
  const engine = new AIEngineV2(difficulty);
  engine.setSeed(seed);
  if (fast) engine.setConfig(FAST_THROUGHPUT);
  if (work.mode === 'fixed') engine.setConfig({ fixedWork: work.units });
  else engine.setConfig({ fixedWork: 0, mctsTimeLimit: work.ms });
  engine.setTacticalSolver(await getKernel());
  return engine.findBestAction(state, work.mode === 'wall' ? work.ms : undefined);
}

export function parseAiv2Name(name: string): { difficulty: AIDifficulty; fast: boolean } | null {
  const m = AIV2_NAME_RE.exec(name);
  return m ? { difficulty: m[1] as AIDifficulty, fast: m[2] === '-fast' } : null;
}

/** Decisions this player still expects to make before the turn ends — the
 * divisor `useAI.ts`'s per-action loop uses to split the whole-turn budget
 * (place phase: the four action-phase decisions still to come; action phase:
 * whatever is left of `actionsRemaining`). */
function decisionsRemaining(state: GameState): number {
  return state.turn.phase === 'action' ? Math.max(1, state.turn.actionsRemaining) : 4;
}

function createAiv2Bot(difficulty: AIDifficulty, fast: boolean, work: WorkSpec): EngineBot {
  const name = `aiv2-${difficulty}${fast ? '-fast' : ''}`;
  let seed = 1;
  // Wall mode only (see the module doc): `work.ms` funds a whole TURN, so the
  // per-action shape carries the turn's unspent remainder across its own
  // decisions instead of restarting the clock at every call.
  let remainingMs = 0;
  let turnKey = '';
  return {
    kind: 'engine',
    name,
    onGameStart(_player: PlayerId, gameSeed: number) {
      seed = gameSeed;
      remainingMs = 0;
      turnKey = '';
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (shouldResign(state, player)) return { type: 'RESIGN' };
      let budget = work;
      if (work.mode === 'wall') {
        const key = `${state.turn.turnNumber}:${player}`;
        if (key !== turnKey) { turnKey = key; remainingMs = work.ms; }
        budget = { mode: 'wall', ms: Math.max(1, remainingMs / decisionsRemaining(state)) };
      }
      const startedAt = Date.now();
      const result = await aiv2Decision(difficulty, fast, budget, state, seed);
      if (work.mode === 'wall') remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
      if (result.plan.actions.length === 0) return null;
      return result.plan.actions[0];
    },
  };
}

/** Gameplay-relevant digest (mirrors `useAI.ts`'s), used only to detect
 * whether the live state still matches what the cached plan predicted —
 * reference equality never holds here since `applyAction` returns a fresh
 * object on every call. */
function gameplayDigest(s: GameState): string {
  return JSON.stringify({ board: s.board, players: s.players, turn: s.turn, phase: s.phase, winner: s.winner, upkeepPending: s.upkeepPending });
}

/**
 * The whole-turn path (DESIGN §6.1/§6.2, M3): the same `AIEngineV2` driven
 * with one search per turn instead of one per action, via a cached plan.
 * `nextAction` re-searches only when the cache is empty or the live state has
 * stopped matching what continuing the cached plan predicted (a fresh game,
 * an opponent interleaving unexpectedly, or the plan running out mid-turn).
 */
function createAiv2TurnBot(difficulty: AIDifficulty, work: WorkSpec): EngineBot {
  const name = `aiv2-${difficulty}-turn`;
  let seed = 1;
  let engine: AIEngineV2 | null = null;
  let plan: AIAction[] = [];
  let planIndex = 0;
  let expectedDigest: string | null = null;
  // Wall mode: `work.ms` funds a whole TURN (module doc). The common case is
  // one search per turn spending all of it, but a plan that runs out mid-turn
  // re-searches — and must then draw on the turn's remainder, not a fresh `ms`.
  let remainingMs = 0;
  let turnKey = '';
  return {
    kind: 'engine',
    name,
    onGameStart(_player: PlayerId, gameSeed: number) {
      seed = gameSeed; engine = null; plan = []; planIndex = 0; expectedDigest = null;
      remainingMs = 0; turnKey = '';
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (shouldResign(state, player)) return { type: 'RESIGN' };
      if (work.mode === 'wall') {
        const key = `${state.turn.turnNumber}:${player}`;
        if (key !== turnKey) { turnKey = key; remainingMs = work.ms; }
      }
      const stale = planIndex >= plan.length || expectedDigest === null || gameplayDigest(state) !== expectedDigest;
      if (stale) {
        const decisionMs = Math.max(1, remainingMs);
        engine ??= new AIEngineV2(difficulty);
        engine.setSeed(seed);
        if (work.mode === 'fixed') engine.setConfig({ fixedWork: work.units });
        else engine.setConfig({ fixedWork: 0, mctsTimeLimit: decisionMs });
        engine.setTacticalSolver(await getKernel());
        const startedAt = Date.now();
        const result: AIResult = await engine.findBestAction(state, work.mode === 'wall' ? decisionMs : undefined);
        if (work.mode === 'wall') remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
        plan = result.plan.actions;
        planIndex = 0;
      }
      if (planIndex >= plan.length) return null;
      const action = plan[planIndex++];
      expectedDigest = gameplayDigest(applyAction(state, action));
      return action;
    },
  };
}

const AIV2_NAME_RE = /^aiv2-(easy|medium|hard)(-fast)?$/;
const AIV2_TURN_NAME_RE = /^aiv2-(easy|medium|hard)-turn$/;
const HARD_NAME_RE = /^hard@/;

function scriptedEngine(name: string): LadderEngine {
  return {
    name,
    createBot(): Bot {
      return createScriptedRegistryBot(name);
    },
    // Scripted bots have no tunable "work"; their identity is the bot itself.
    configHash(): string {
      return `scripted:${name}`;
    },
  };
}

function aiv2Engine(difficulty: AIDifficulty, fast: boolean): LadderEngine {
  const name = `aiv2-${difficulty}${fast ? '-fast' : ''}`;
  return {
    name,
    createBot(work: WorkSpec): Bot {
      return createAiv2Bot(difficulty, fast, work);
    },
    configHash(work: WorkSpec): string {
      return `aiv2:${difficulty}:${fast ? 'fast' : 'full'}:${workKey(work)}`;
    },
  };
}

function aiv2TurnEngine(difficulty: AIDifficulty): LadderEngine {
  const name = `aiv2-${difficulty}-turn`;
  return {
    name,
    createBot(work: WorkSpec): Bot {
      return createAiv2TurnBot(difficulty, work);
    },
    configHash(work: WorkSpec): string {
      return `aiv2-turn:${difficulty}:${workKey(work)}`;
    },
  };
}

/** `hard@<label>` (DESIGN §7.7). The label resolves to a `HardConfig` patch
 * through `lab/hard-ai/bots/hard.ts`, which also owns the whole-turn plan cache
 * and the `isLegalAction` revalidation. */
function hardEngine(label: string): LadderEngine {
  hardConfigFor(label); // fail fast on an unknown label, with the list of known ones
  return {
    name: `hard@${label}`,
    createBot(work: WorkSpec): Bot {
      return createHardBot({ work, profile: label, name: `hard@${label}` });
    },
    configHash(work: WorkSpec): string {
      return hardConfigHash(label, work);
    },
  };
}

const AIV2_REGISTRY: LadderEngine[] = (['easy', 'medium', 'hard'] as AIDifficulty[]).flatMap(d => [
  aiv2Engine(d, false),
  aiv2Engine(d, true),
]);

const AIV2_TURN_REGISTRY: LadderEngine[] = (['easy', 'medium', 'hard'] as AIDifficulty[]).map(aiv2TurnEngine);

/** Every scripted bot name from the harness registry, wrapped as a `LadderEngine`. */
function scriptedRegistry(): LadderEngine[] {
  return botNames()
    .filter(n => !n.startsWith('AIv2-')) // the harness's own AIv2 wrappers are superseded by the aiv2-* names above
    .map(scriptedEngine);
}

export function resolveEngine(name: string): LadderEngine {
  const aiv2TurnMatch = AIV2_TURN_NAME_RE.exec(name);
  if (aiv2TurnMatch) {
    return aiv2TurnEngine(aiv2TurnMatch[1] as AIDifficulty);
  }
  if (HARD_NAME_RE.test(name)) {
    return hardEngine(name.slice('hard@'.length));
  }
  const aiv2Match = AIV2_NAME_RE.exec(name);
  if (aiv2Match) {
    return aiv2Engine(aiv2Match[1] as AIDifficulty, aiv2Match[2] === '-fast');
  }
  if (botNames().includes(name)) {
    return scriptedEngine(name);
  }
  const available = [...AIV2_REGISTRY.map(e => e.name), ...AIV2_TURN_REGISTRY.map(e => e.name), ...scriptedRegistry().map(e => e.name)].join(', ');
  throw new Error(`hard:ladder: unknown engine "${name}". Available: ${available}`);
}

export function engineNames(): string[] {
  return [...AIV2_REGISTRY.map(e => e.name), ...AIV2_TURN_REGISTRY.map(e => e.name), ...scriptedRegistry().map(e => e.name)];
}

/** True for engine names whose real strength depends on how they consume `--work` (aiv2-* or hard@*); false for scripted bots, which ignore it (DESIGN §7.7 axis rule). */
export function engineHasWork(name: string): boolean {
  return AIV2_NAME_RE.test(name) || HARD_NAME_RE.test(name) || AIV2_TURN_NAME_RE.test(name);
}
