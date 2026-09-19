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
 *
 * ENGINE LIFECYCLE (E0.1). The aiv2 adapters below reproduce the RELEASED
 * worker's lifecycle (`src/ai/worker/handler.ts` at production master 0f1d5f1):
 * ONE `AIEngineV2` per game per seat, `setSeed` once when that engine is
 * created, `setDifficulty` once per decision followed by the per-decision
 * overrides, and no resignation - the shipped game never calls `shouldResign`
 * anywhere in `src/`, so `Aiv2AdapterOptions.resign` defaults to
 * `AIV2_RESIGN_DEFAULT` (false). The remaining differences from the browser
 * (the ladder's `wall:` rung replacing the preset `mctsTimeLimit`, and its
 * smaller turn budget) are listed in
 * `docs/hard-ai/e0/E0.1-BASELINE-IDENTITY.md`.
 *
 * IDENTITY (E0.1). `configHash` carries the sha256 of the RESOLVED
 * configuration (`./identity.ts`), not just the engine's label, so two rows
 * with the same name but a different applied configuration cannot be confused
 * for each other; `resolvedConfig` exposes that configuration for a manifest.
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
import { AIV2_RESIGN_DEFAULT, FAST_THROUGHPUT, resolvedConfig as resolveConfigFor, resolvedConfigHash } from './identity';
import { noteLadderFallback } from './fallbacks';

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
  /**
   * Stable identifier for this engine's exact config at this work spec
   * (`GameRecord.engineConfigHash`): the readable engine label followed by
   * `#<sha256 of the resolved configuration>` (E0.1). The label alone did not
   * distinguish two runs whose applied configuration differed.
   */
  configHash(work: WorkSpec): string;
  /** The configuration this engine actually applies at this work spec, for a run manifest (E0.1). */
  resolvedConfig?(work: WorkSpec): unknown;
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

/**
 * Configures and runs one `AIEngineV2` decision on a FRESH engine (DESIGN
 * §7.7/§7.4). `verify/determinism.ts` drives it, needing the full `AIResult`
 * (not just the chosen action) to compare `score`/`depth`/`stats` across runs,
 * and a per-decision engine is what makes those runs comparable. The ladder bot
 * below no longer shares it: since E0.1 that adapter keeps ONE engine per game
 * per seat, as the released worker does.
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

export interface Aiv2AdapterOptions {
  /**
   * Consult `shouldResign` before every decision. Default
   * `AIV2_RESIGN_DEFAULT` = false, because the released game never resigns for
   * the AI: `shouldResign` has no caller in production master 0f1d5f1's `src/`
   * (`useAI.ts` substitutes `phaseEndAction` for an empty plan and treats an
   * illegal proposal as an engine error, "not a hidden pass/resignation").
   * `lab/hard-ai/bots/hard.ts` never resigned either, so the old unconditional
   * call also biased every aiv2-vs-hard row.
   */
  resign?: boolean;
}

export function createAiv2Bot(difficulty: AIDifficulty, fast: boolean, work: WorkSpec, options: Aiv2AdapterOptions = {}): EngineBot {
  const name = `aiv2-${difficulty}${fast ? '-fast' : ''}`;
  const resign = options.resign ?? AIV2_RESIGN_DEFAULT;
  let seed = 1;
  // One engine per game per seat, as the released worker keeps one per
  // `<gameId>:<player>` (E0.1). Its RNG and `lastIntent` therefore carry across
  // the game's decisions, exactly as they do in the browser.
  let engine: AIEngineV2 | null = null;
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
      engine = null;
      remainingMs = 0;
      turnKey = '';
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (resign && shouldResign(state, player)) return { type: 'RESIGN' };
      let budget = work;
      if (work.mode === 'wall') {
        const key = `${state.turn.turnNumber}:${player}`;
        if (key !== turnKey) { turnKey = key; remainingMs = work.ms; }
        budget = { mode: 'wall', ms: Math.max(1, remainingMs / decisionsRemaining(state)) };
      }
      let current = engine;
      if (current === null) {
        current = new AIEngineV2(difficulty);
        current.setSeed(seed);
        current.setTacticalSolver(await getKernel());
        engine = current;
      }
      // The worker's per-request sequence: `setDifficulty` (which resets the
      // config to DEFAULT + preset, discarding the previous decision's
      // overrides) and then this request's overrides.
      current.setDifficulty(difficulty);
      if (fast) current.setConfig(FAST_THROUGHPUT);
      if (budget.mode === 'fixed') current.setConfig({ fixedWork: budget.units });
      else current.setConfig({ fixedWork: 0, mctsTimeLimit: budget.ms });
      const startedAt = Date.now();
      const result = await current.findBestAction(state, budget.mode === 'wall' ? budget.ms : undefined);
      if (work.mode === 'wall') remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
      if (result.plan.actions.length === 0) {
        // Gate 0 item 6's `emptyPlan`: the search produced nothing and the
        // runner substitutes `phaseEndAction`. Counted, not changed — the
        // behaviour is what it always was (`ladder/fallbacks.ts`).
        noteLadderFallback('emptyPlan');
        return null;
      }
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
export function createAiv2TurnBot(difficulty: AIDifficulty, work: WorkSpec, options: Aiv2AdapterOptions = {}): EngineBot {
  const name = `aiv2-${difficulty}-turn`;
  const resign = options.resign ?? AIV2_RESIGN_DEFAULT;
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
      if (resign && shouldResign(state, player)) return { type: 'RESIGN' };
      if (work.mode === 'wall') {
        const key = `${state.turn.turnNumber}:${player}`;
        if (key !== turnKey) { turnKey = key; remainingMs = work.ms; }
      }
      const stale = planIndex >= plan.length || expectedDigest === null || gameplayDigest(state) !== expectedDigest;
      if (stale) {
        const decisionMs = Math.max(1, remainingMs);
        // Seeded ONCE per game, like the released worker and like
        // `createAiv2Bot` above (E0.1). Re-seeding before every search reset
        // the engine's RNG and `lastIntent` mid-game, which no shipped path
        // does and which made this arm differ from the per-action arm in more
        // than the one thing it exists to measure.
        let current = engine;
        if (current === null) {
          current = new AIEngineV2(difficulty);
          current.setSeed(seed);
          current.setTacticalSolver(await getKernel());
          engine = current;
        }
        if (work.mode === 'fixed') current.setConfig({ fixedWork: work.units });
        else current.setConfig({ fixedWork: 0, mctsTimeLimit: decisionMs });
        const startedAt = Date.now();
        const result: AIResult = await current.findBestAction(state, work.mode === 'wall' ? decisionMs : undefined);
        if (work.mode === 'wall') remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
        plan = result.plan.actions;
        planIndex = 0;
        // Gate 0 item 6's `emptyPlan`, noted only for a SEARCH that came back
        // with nothing — not for a plan that was handed out to its last action.
        if (plan.length === 0) noteLadderFallback('emptyPlan');
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
    resolvedConfig(): unknown {
      return resolveConfigFor(name, { mode: 'fixed', units: 0 });
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
      return `aiv2:${difficulty}:${fast ? 'fast' : 'full'}:${workKey(work)}#${resolvedConfigHash(name, work)}`;
    },
    resolvedConfig(work: WorkSpec): unknown {
      return resolveConfigFor(name, work);
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
      return `aiv2-turn:${difficulty}:${workKey(work)}#${resolvedConfigHash(name, work)}`;
    },
    resolvedConfig(work: WorkSpec): unknown {
      return resolveConfigFor(name, work);
    },
  };
}

/** `hard@<label>` (DESIGN §7.7). The label resolves to a `HardConfig` patch
 * through `lab/hard-ai/bots/hard.ts`, which also owns the whole-turn plan cache
 * and the `isLegalAction` revalidation. */
function hardEngine(label: string): LadderEngine {
  hardConfigFor(label); // fail fast on an unknown label, with the list of known ones
  const name = `hard@${label}`;
  return {
    name,
    createBot(work: WorkSpec): Bot {
      return createHardBot({ work, profile: label, name });
    },
    configHash(work: WorkSpec): string {
      return `${hardConfigHash(label, work)}#${resolvedConfigHash(name, work)}`;
    },
    resolvedConfig(work: WorkSpec): unknown {
      return resolveConfigFor(name, work);
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
