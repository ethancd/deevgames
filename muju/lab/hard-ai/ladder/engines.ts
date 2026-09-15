/**
 * The ladder's engine registry (DESIGN §7.7): resolves a `--a`/`--b` name to a
 * fresh `Bot` for one game, driven by a `WorkSpec`. Names registered here at
 * M2: `aiv2-hard`, `aiv2-medium`, `aiv2-easy`, and their `-fast` throughput
 * variants, plus every scripted bot from `lab/harness/bots/index.ts`.
 * `aiv2-hard-turn`/`aiv2-medium-turn` (M3's whole-turn path) and `hard@<label>`
 * (M14's replica search) are reserved names that throw a clear
 * "not registered until M<n>" error rather than an opaque lookup failure —
 * those milestones extend `resolveEngine` additively.
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
 */
import { readFileSync } from 'node:fs';
import { instantiateTactics, type TacticalSolver } from '../../../src/ai/wasm/kernel';
import { referenceTactics } from '../../../src/ai/tactics/home';
import { AIEngineV2 } from '../../../src/ai/engine-v2';
import { shouldResign } from '../../../src/ai/evaluation';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIDifficulty, AIResult } from '../../../src/ai/types';
import type { Bot, EngineBot } from '../../harness/types';
import { createBot as createScriptedRegistryBot, botNames } from '../../harness/bots/index';

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

function createAiv2Bot(difficulty: AIDifficulty, fast: boolean, work: WorkSpec): EngineBot {
  const name = `aiv2-${difficulty}${fast ? '-fast' : ''}`;
  let seed = 1;
  return {
    kind: 'engine',
    name,
    onGameStart(_player: PlayerId, gameSeed: number) {
      seed = gameSeed;
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (shouldResign(state, player)) return { type: 'RESIGN' };
      const result = await aiv2Decision(difficulty, fast, work, state, seed);
      if (result.plan.actions.length === 0) return null;
      return result.plan.actions[0];
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

const AIV2_REGISTRY: LadderEngine[] = (['easy', 'medium', 'hard'] as AIDifficulty[]).flatMap(d => [
  aiv2Engine(d, false),
  aiv2Engine(d, true),
]);

/** Every scripted bot name from the harness registry, wrapped as a `LadderEngine`. */
function scriptedRegistry(): LadderEngine[] {
  return botNames()
    .filter(n => !n.startsWith('AIv2-')) // the harness's own AIv2 wrappers are superseded by the aiv2-* names above
    .map(scriptedEngine);
}

export function resolveEngine(name: string): LadderEngine {
  if (AIV2_TURN_NAME_RE.test(name)) {
    throw new Error(`hard:ladder: engine "${name}" is not registered until M3 (src/ai/worker — whole-turn AIEngineV2 path)`);
  }
  if (HARD_NAME_RE.test(name)) {
    throw new Error(`hard:ladder: engine "${name}" is not registered until M14 (src/ai/hard/engine.ts — replica search)`);
  }
  const aiv2Match = AIV2_NAME_RE.exec(name);
  if (aiv2Match) {
    return aiv2Engine(aiv2Match[1] as AIDifficulty, aiv2Match[2] === '-fast');
  }
  if (botNames().includes(name)) {
    return scriptedEngine(name);
  }
  const available = [...AIV2_REGISTRY.map(e => e.name), ...scriptedRegistry().map(e => e.name)].join(', ');
  throw new Error(`hard:ladder: unknown engine "${name}". Available: ${available}`);
}

export function engineNames(): string[] {
  return [...AIV2_REGISTRY.map(e => e.name), ...scriptedRegistry().map(e => e.name)];
}

/** True for engine names whose real strength depends on how they consume `--work` (aiv2-* or hard@*); false for scripted bots, which ignore it (DESIGN §7.7 axis rule). */
export function engineHasWork(name: string): boolean {
  return AIV2_NAME_RE.test(name) || HARD_NAME_RE.test(name) || AIV2_TURN_NAME_RE.test(name);
}
