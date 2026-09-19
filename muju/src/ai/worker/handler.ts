import { AIEngineV2 } from '../engine-v2';
import type { SearchRequest, SearchResponse, TurnResult } from './protocol';
import type { TacticalSolver } from '../wasm/kernel';
import { isLegalAction } from '../../game/legality';
import { applyAction } from '../simulate';
import type { AIAction } from '../types';
import type { GameState } from '../../game/types';
import type { HardConfig } from '../hard/config';

/**
 * Truncates a whole-turn plan to its longest prefix that replays legally from
 * `state` (DESIGN §6.1: "`turnActions` = the plan's legal prefix"). The v2
 * planner should already emit fully legal turns — this is a defensive
 * backstop for the worker boundary, not a replica-grade verifier (that's
 * `verify/replay.ts`'s `verifyTurn`, M14+, for the hard engine).
 */
export function legalPrefix(state: GameState, actions: readonly AIAction[]): AIAction[] {
  const prefix: AIAction[] = [];
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) break;
    prefix.push(action);
    current = applyAction(current, action);
  }
  return prefix;
}

/**
 * The slice of `HardEngine` this handler drives (E5.1). Declared structurally
 * so the class is only ever named inside the lazy import below, and so a unit
 * test can hand `createSearchHandler` a recording stub without paying for a
 * real search — exactly what `lab/hard-ai/bots/hard.ts` does with its own
 * `HardEngineLike`.
 */
export interface HardEngineLike {
  searchTurn(state: GameState, opts?: { work?: number; targetMs?: number; deadlineMs?: number }): Promise<TurnResult>;
  setSeed(seed: number): void;
}

export type HardEngineFactory = (patch?: Partial<HardConfig>) => HardEngineLike | Promise<HardEngineLike>;

/**
 * LAZY, deliberately. `src/ai/hard/**` is the whole packed replica, the
 * generators, the tables and the evaluator — ~143 kB that nothing but an
 * `engine: 'hard'` request ever reaches. Importing it dynamically keeps it in
 * its own chunk, so the worker every AI game downloads stays the size it was
 * before E5.1, and an easy/medium game or an opted-out player (`?hardAi=0`)
 * never fetches a byte of the hard engine.
 *
 * This needs `worker: { format: 'es' }` in `vite.config.ts`: a dynamic import
 * inside a worker makes the worker a code-splitting build, and the default
 * `iife` format cannot code-split. That is a recorded E5.3 decision (module
 * workers, so Safari 15+) rather than an accident — see
 * `docs/hard-ai/e5/E5.1-OPT-IN-ROUTE.md`.
 *
 * The chunk is fetched once per worker and cached by the module loader
 * afterwards, so only the FIRST hard request of a worker's life pays for it.
 */
const constructHardEngine: HardEngineFactory = async patch => {
  const { HardEngine } = await import('../hard/engine');
  return new HardEngine(patch);
};

/**
 * `request.hard` with a PLACEHOLDER weight vector stripped.
 *
 * `HardEngine`'s constructor substitutes `DEFAULT_WEIGHTS` only when the
 * caller passes no `weights` field at all, so handing it a whole `HardConfig`
 * whose `weights` is M4's `placeholder-m4` vector (58 zeros) silently buys a
 * material-only evaluation. That mistake cost the lab every `hard@*` ladder
 * row recorded before it was found (`lab/hard-ai/bots/hard.ts`'s
 * `hardEnginePatch`); this is the same correction at the worker boundary, for
 * a caller that posts a profile object straight down the wire. An explicit
 * non-placeholder vector is always honoured.
 */
function hardPatch(patch: Partial<HardConfig> | undefined): Partial<HardConfig> | undefined {
  if (patch?.weights === undefined || patch.weights.version !== 0) return patch;
  const { weights: _placeholder, ...rest } = patch;
  return rest;
}

/** Browser-free message handler, also exercised with real WASM by Node tests. */
export function createSearchHandler(solver?: TacticalSolver, warning?: string, createHardEngine: HardEngineFactory = constructHardEngine) {
  const contexts = new Map<string, AIEngineV2>();
  /**
   * ONE `HardEngine` PER GAME (DESIGN §7.7's "a fresh engine per game", which
   * `lab/hard-ai/bots/hard.ts` already follows): keyed by `gameId` alone, not
   * by `gameId:player`, so a watch-mode AI-vs-AI game shares one engine
   * between the two seats. That is safe because `searchTurn` clears the
   * transposition table, the proof cache and the ordering tables at the start
   * of EVERY search — the engine's own determinism rule — so a search depends
   * only on its position, its weights and its rung, never on what the same
   * object searched before it. Sharing costs one set of tables instead of two
   * on a phone, which is the scarcer resource.
   *
   * Protocol 3 has no `newGame`/reset message, so the game key IS the reset:
   * `AIWorkerClient.restart()` mints a fresh `gameId` on every restart, and
   * `useAI`'s `cancel` terminates the worker outright, which drops the map
   * with it. The size bound below is the same belt-and-braces the v2 map
   * carries for a caller that forgets both.
   */
  const hardContexts = new Map<string, HardEngineLike>();
  return async (request: SearchRequest): Promise<SearchResponse> => {
    const { version, gameId, requestId, revision, player } = request;
    const identity = { version, gameId, requestId, revision, player };
    try {
      if (request.state.ruleset === 'phasing') throw new Error('AI supports Standard rules only. Phasing is available for human play.');
      // Protocol 2 stays accepted (M3): a `version: 2` request with no `mode`
      // is byte-compatible and gets the unchanged per-action reply. Master's
      // line here is still the pre-M3 `version !== AI_PROTOCOL`; the merge of
      // its Phasing guard must not take that half with it.
      if ((version !== 2 && version !== 3) || request.state.turn.currentPlayer !== player) throw new Error('Invalid AI request identity');
      const key = `${gameId}:${player}`;
      let engine = contexts.get(key);
      if (!engine) {
        // Bound contexts even if a caller forgets to recreate the worker on restart.
        if (contexts.size >= 2) contexts.clear();
        engine = new AIEngineV2(request.difficulty); engine.setSeed(request.seed);
        if (solver) engine.setTacticalSolver(solver); contexts.set(key, engine);
      }
      engine.setDifficulty(request.difficulty);
      if (request.fixedWork) engine.setConfig({ fixedWork: request.fixedWork });

      if (request.mode === 'turn') {
        // `engine` absent resolves to 'v2' (protocol.ts): only a request that
        // explicitly asks for the hard engine gets it.
        const engineKind = request.engine ?? 'v2';
        if (engineKind === 'hard') {
          let hard = hardContexts.get(gameId);
          if (!hard) {
            if (hardContexts.size >= 2) hardContexts.clear();
            hard = await createHardEngine(hardPatch(request.hard));
            hard.setSeed(request.seed); // no-op by contract; kept for the EngineBot shape
            hardContexts.set(gameId, hard);
          }
          // THE TURN'S REMAINING ALLOWANCE, not a fresh budget: `decisionMs`
          // is whatever `useAI` has left of the pace's whole-turn allowance
          // (`aiTurnBudgetMs(difficulty, pace)`, `src/ai/turnTime.ts` — Hard's
          // three paces are 10/30/60 s) after every earlier search of this
          // same turn (E0.2). `work` overrides it entirely for CI/lab callers,
          // which read no clock.
          //
          // `deadlineMs` (A11) is the SAME number, and that is the point. The
          // default watchdog fires at `abortFactor × targetMs` — E0.5 measured
          // turns running 1.15×-1.67× their allowance because of it — while
          // the client's own watchdog gives up at `decisionMs + 2000`
          // (`client.ts`). A cold-profile first search would therefore be
          // killed by the CLIENT, reported as a worker error, and replayed by
          // v2; passing the deadline makes the engine return a legal turn on
          // time instead. The rung stays `chooseWork(profile, targetMs)`, so
          // this moves when the turn must be over, not how much work it is
          // worth.
          const result = await hard.searchTurn(request.state, request.work !== undefined
            ? { work: request.work }
            : { targetMs: request.decisionMs, deadlineMs: request.decisionMs });
          // Deliberately NOT run through `legalPrefix`: the canonical replay
          // for the hard path lives in `useAI.ts`, and silently truncating an
          // invalid suffix here would hide exactly the divergence E5.1 is
          // required to count and make diagnosable.
          return { ...identity, type: 'turn', result, engineUsed: 'hard', warning };
        }
        // A TURN request's `decisionMs` IS the turn's remaining wall allowance
        // (`useAI.ts` funds one per turn and debits it), so the v2 search may
        // size its own work to it — that is what makes the paced clocks of
        // `src/ai/turnTime.ts` mean anything. An `action` request carries a
        // per-decision SHARE of that allowance instead, so it keeps the preset
        // and stays byte-for-byte the protocol-2 search it always was.
        engine.setConfig({ scaleToBudget: !request.fixedWork });
        const result = await engine.findBestAction(request.state, request.decisionMs);
        const turnActions = legalPrefix(request.state, result.plan.actions);
        return { ...identity, type: 'result', result: { ...result, turnActions }, engineUsed: 'v2', warning };
      }

      return { ...identity, type: 'result', result: await engine.findBestAction(request.state, request.decisionMs), engineUsed: 'v2', warning };
    } catch (error) { return { ...identity, type: 'error', message: error instanceof Error ? error.message : String(error) }; }
  };
}
