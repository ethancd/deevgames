// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createInitialGameState } from '../../src/game/board';
import { HardEngine } from '../../src/ai/hard/engine';
import { hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import { baselineIdentity, canonicalJson, configHashOf, resolvedConfig, resolvedConfigHash, type ResolvedAiv2Config, type ResolvedHardConfig } from '../../lab/hard-ai/ladder/identity';
import { resolveEngine, parseWorkSpec, type WorkSpec } from '../../lab/hard-ai/ladder/engines';
import { LADDER_RULES_VERSION } from '../../lab/hard-ai/ladder/ruleset';
import { RULES_VERSION } from '../../lab/hard-ai/ladder/openings/phasing';
import { HARNESS_RULES_VERSION } from '../../lab/harness/types';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';
import type { GameState } from '../../src/game/types';
import type { AIDifficulty, AIAction } from '../../src/ai/types';

/**
 * E0.1 "Baseline identity" (EPIC-PLAN §4, E0). Two things are pinned here:
 *
 * 1. The RESOLVED-CONFIGURATION identity (`lab/hard-ai/ladder/identity.ts`):
 *    hashes that are stable across calls, move when any field of the applied
 *    configuration moves, and separate the shipped arm from the changed-turn
 *    arm — while `hard@lab` and `hard@lab-400k`, whose suffix is documentary,
 *    stay the same engine.
 * 2. The aiv2 ladder adapter's LIFECYCLE against the released worker
 *    (`src/ai/worker/handler.ts` at production master 0f1d5f1): ONE
 *    `AIEngineV2` per game per seat, `setSeed` once when that engine is
 *    created, `setDifficulty` once per decision, and no resignation (the
 *    shipped game never calls `shouldResign`).
 *
 * The lifecycle half needs a stub `AIEngineV2` to count constructions; the
 * identity half needs the REAL one, since `identity.ts` reads the difficulty
 * presets off a freshly constructed engine. So the stub is installed with
 * `vi.doMock` inside the lifecycle block and reaches only the copy of
 * `engines.ts` imported after it — the statically imported modules above keep
 * the real engine.
 */

const MUJU_ROOT = resolve(import.meta.dirname, '..', '..');
const WALL: WorkSpec = { mode: 'wall', ms: 3000 };

function sha256File(relPath: string): string {
  return createHash('sha256').update(readFileSync(resolve(MUJU_ROOT, relPath))).digest('hex');
}

/**
 * Independent re-derivation of `identity.ts`'s tree hash (not imported from it,
 * so this checks the module's algorithm rather than comparing it to itself):
 * every file under the directory, sorted by path, each contributing its
 * repo-relative path, its byte length and its bytes.
 */
function sha256Tree(relDir: string): string {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const abs = join(dir, entry.name);
      return entry.isDirectory() ? walk(abs) : entry.isFile() ? [abs] : [];
    });
  const hash = createHash('sha256');
  for (const abs of walk(resolve(MUJU_ROOT, relDir)).sort()) {
    const bytes = readFileSync(abs);
    hash.update(`${relative(MUJU_ROOT, abs).split(sep).join('/')} ${bytes.length} `);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

describe('baselineIdentity (E0.1 clause 1: the tree is frozen by content, not by label)', () => {
  it('returns the same git rev and the same four source hashes on two calls', () => {
    expect(baselineIdentity()).toEqual(baselineIdentity());
  });

  it('hashes src/ai, src/game, the tactical WASM and the dependency lock as 64-hex digests', () => {
    const { sources } = baselineIdentity();
    for (const hash of [sources.ai, sources.game, sources.wasm, sources.deps]) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set([sources.ai, sources.game, sources.wasm, sources.deps]).size).toBe(4);
  });

  it('records the WASM and dependency hashes as plain sha256 of those files', () => {
    const { sources } = baselineIdentity();
    expect(sources.wasm).toBe(sha256File('src/ai/wasm/tactics.wasm'));
    expect(sources.deps).toBe(sha256File('package-lock.json'));
  });

  it('hashes each source tree over its sorted relative paths, lengths and bytes', () => {
    const { sources } = baselineIdentity();
    expect(sources.ai).toBe(sha256Tree('src/ai'));
    expect(sources.game).toBe(sha256Tree('src/game'));
  });

  it('reports a 40-hex git revision', () => {
    expect(baselineIdentity().git.rev).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('resolvedConfig / resolvedConfigHash (E0.1 clauses 1, 3, 4)', () => {
  it('is stable across two calls for the same name and work spec', () => {
    expect(resolvedConfigHash('aiv2-hard', WALL)).toBe(resolvedConfigHash('aiv2-hard', WALL));
    expect(resolvedConfigHash('hard@lab', { mode: 'fixed', units: 400000 })).toBe(resolvedConfigHash('hard@lab', { mode: 'fixed', units: 400000 }));
  });

  it('changes when a single field of the resolved configuration changes', () => {
    const config = resolvedConfig('aiv2-hard', WALL) as ResolvedAiv2Config;
    const before = configHashOf(config);
    const mutated: ResolvedAiv2Config = { ...config, search: { ...config.search, beamWidth: config.search.beamWidth + 1 } };
    expect(configHashOf(mutated)).not.toBe(before);
    expect(before).toBe(resolvedConfigHash('aiv2-hard', WALL));
  });

  it('changes when a single field of a hard profile changes', () => {
    const config = resolvedConfig('hard@lab', WALL) as ResolvedHardConfig;
    const before = configHashOf(config);
    const mutated: ResolvedHardConfig = { ...config, config: { ...config.config, maxDepth: config.config.maxDepth + 1 } };
    expect(configHashOf(mutated)).not.toBe(before);
  });

  it('changes when the work spec changes', () => {
    expect(resolvedConfigHash('aiv2-hard', WALL)).not.toBe(resolvedConfigHash('aiv2-hard', { mode: 'wall', ms: 6000 }));
    expect(resolvedConfigHash('aiv2-hard', WALL)).not.toBe(resolvedConfigHash('aiv2-hard', { mode: 'fixed', units: 3000 }));
  });

  it('gives the changed-turn arm an identity distinct from the shipped arm', () => {
    expect(resolvedConfigHash('aiv2-hard-turn', WALL)).not.toBe(resolvedConfigHash('aiv2-hard', WALL));
    expect(resolvedConfigHash('aiv2-medium-turn', WALL)).not.toBe(resolvedConfigHash('aiv2-medium', WALL));
  });

  it('separates difficulties and the -fast throughput preset', () => {
    expect(resolvedConfigHash('aiv2-medium', WALL)).not.toBe(resolvedConfigHash('aiv2-hard', WALL));
    expect(resolvedConfigHash('aiv2-hard-fast', WALL)).not.toBe(resolvedConfigHash('aiv2-hard', WALL));
  });

  it('separates hard@lab from hard@phone', () => {
    expect(resolvedConfigHash('hard@lab', WALL)).not.toBe(resolvedConfigHash('hard@phone', WALL));
  });

  it('treats the documentary -400k suffix as the same engine: hard@lab === hard@lab-400k', () => {
    expect(resolvedConfigHash('hard@lab-400k', WALL)).toBe(resolvedConfigHash('hard@lab', WALL));
    expect(resolvedConfig('hard@lab-400k', WALL)).toEqual(resolvedConfig('hard@lab', WALL));
  });

  it('resolves the aiv2 difficulty preset to the values the engine actually installs', () => {
    const hard = resolvedConfig('aiv2-hard', WALL) as ResolvedAiv2Config;
    expect(hard.search).toMatchObject({ mctsIterations: 1200, beamWidth: 50, tacticalDepth: 2, mctsTimeLimit: 3000, tacticalNodes: 600000, fixedWork: 0 });
    expect(hard.budget).toMatchObject({ mode: 'wall', turnMs: 3000, allocation: 'split-across-remaining-decisions', shippedTurnBudgetMs: 8000 });
    expect(hard.lifecycle).toMatchObject({ engine: 'one-per-game-seat', seed: 'once-at-construction', setDifficultyPerDecision: true });
    expect(hard.resign).toBe(false);

    const fast = resolvedConfig('aiv2-hard-fast', { mode: 'fixed', units: 4000 }) as ResolvedAiv2Config;
    expect(fast.search).toMatchObject({ tacticalNodes: 20000, beamWidth: 12, outputPlans: 10, fixedWork: 4000 });
  });

  it('resolves hard@<label> to exactly the HardConfig HardEngine ends up with', () => {
    // `hardEnginePatch` is what `createHardBot` hands the constructor: the
    // profile with its evaluation weights already resolved. Constructing from
    // `hardConfigFor` instead would describe an engine the ladder never runs.
    const resolved = resolvedConfig('hard@lab', WALL) as ResolvedHardConfig;
    const engine = new HardEngine(hardEnginePatch('lab'));
    expect(canonicalJson(resolved.config)).toBe(canonicalJson(engine.config));
  });

  it('resolves hard@* with the trained evaluation weights, not M4’s placeholder', () => {
    // Every `hard@*` ladder row recorded before this fix — M14's included —
    // ran `placeholder-m4`, 58 zero weights: a material-only evaluation.
    for (const name of ['hard@lab', 'hard@phone', 'hard@desktop']) {
      const resolved = resolvedConfig(name, WALL) as ResolvedHardConfig;
      expect(resolved.config.weights.label).toBe(DEFAULT_WEIGHTS.label);
      expect(resolved.config.weights.version).toBe(DEFAULT_WEIGHTS.version);
    }
  });

  it('describes a scripted bot by its bot name', () => {
    expect(resolvedConfig('Greedy', WALL)).toEqual({ rulesVersion: LADDER_RULES_VERSION, engine: 'scripted', bot: 'Greedy' });
  });

  /**
   * CLAUSE 3 (added with Phasing). `hard@desktop` at `wall:8000` is not one
   * engine: under Standard and under Phasing it plays a different game, from a
   * different opening book, for a different result — and every field of its
   * `HardConfig` is identical in both. So the RULES REVISION is part of the
   * resolved configuration, and therefore of the hash, and therefore of
   * `LadderEngine.configHash` and every `GameRecord.engineHash`. Nothing that
   * pools rows by configuration hash can merge two rule sets by accident.
   */
  it('carries the rules revision in every resolved configuration, so no hash can be shared across rule sets', () => {
    // `muju-phasing-2` since preregistration amendment A4 (2026-09-19): the
    // inactivity draw clock moved from 10 plies to 20. Every resolved-
    // configuration hash moved with it, which is how phasing-1 evidence stays
    // out of a phasing-2 pool — the two revisions share their engines, their
    // budgets and their opening book down to the byte, so the revision string
    // is the only thing that separates them.
    expect(LADDER_RULES_VERSION).toBe('muju-phasing-3');
    // One source of truth: the ladder's constant IS the P1 replayer's, and both
    // are the harness constant the runner stamps on every game record.
    expect(LADDER_RULES_VERSION).toBe(RULES_VERSION);
    expect(LADDER_RULES_VERSION).toBe(HARNESS_RULES_VERSION);
    for (const name of ['aiv2-hard', 'aiv2-hard-turn', 'hard@lab', 'hard@desktop', 'Greedy', 'Rush']) {
      const resolved = resolvedConfig(name, WALL) as { rulesVersion: string };
      expect(resolved.rulesVersion, name).toBe(LADDER_RULES_VERSION);
      // It is INSIDE the hash, not beside it: flipping only that field moves it.
      expect(configHashOf({ ...resolved, rulesVersion: 'muju-standard' }), name).not.toBe(resolvedConfigHash(name, WALL));
    }
    // ...and it reaches the engine-level hash the manifest and every game row
    // carry, for the engines whose identity is a configuration at all (a
    // scripted bot's `configHash` is `scripted:<name>`; its identity is the bot).
    for (const name of ['aiv2-hard', 'aiv2-hard-turn', 'hard@lab', 'hard@desktop']) {
      expect(resolveEngine(name).configHash(WALL), name).toContain(resolvedConfigHash(name, WALL));
    }
    expect(baselineIdentity().rulesVersion).toBe(LADDER_RULES_VERSION);
  });

  it('canonicalises typed arrays and sorts keys, so field order never moves a hash', () => {
    expect(canonicalJson({ b: 1, a: Int32Array.from([3, 2]) })).toBe('{"a":[3,2],"b":1}');
    expect(configHashOf({ a: 1, b: 2 })).toBe(configHashOf({ b: 2, a: 1 }));
  });
});

describe('LadderEngine.configHash (E0.1 clause 4: the label alone is not an identity)', () => {
  it('carries the resolved-configuration hash for every engine kind, keeping its (work) signature', () => {
    for (const name of ['aiv2-hard', 'aiv2-hard-fast', 'aiv2-hard-turn', 'hard@lab', 'hard@phone']) {
      const engine = resolveEngine(name);
      expect(engine.configHash(WALL)).toContain(resolvedConfigHash(name, WALL));
    }
  });

  it('keeps the readable label in front of the hash', () => {
    expect(resolveEngine('aiv2-hard').configHash(parseWorkSpec('wall:3000'))).toBe(`aiv2:hard:full:wall:3000#${resolvedConfigHash('aiv2-hard', WALL)}`);
    expect(resolveEngine('hard@lab').configHash(parseWorkSpec('wall:3000'))).toBe(`hard:lab:wall:3000#${resolvedConfigHash('hard@lab', WALL)}`);
  });

  it('separates the shipped arm from the changed-turn arm at the same work spec', () => {
    expect(resolveEngine('aiv2-hard').configHash(WALL)).not.toBe(resolveEngine('aiv2-hard-turn').configHash(WALL));
  });

  it('exposes resolvedConfig() on every engine kind for the run manifest', () => {
    for (const name of ['aiv2-hard', 'aiv2-hard-turn', 'hard@lab', 'Greedy']) {
      const engine = resolveEngine(name);
      expect(typeof engine.resolvedConfig).toBe('function');
      expect(engine.resolvedConfig?.(WALL)).toEqual(resolvedConfig(name, name.startsWith('hard@') || name.startsWith('aiv2') ? WALL : { mode: 'fixed', units: 0 }));
    }
  });
});

const spy = vi.hoisted(() => ({
  constructed: [] as string[],
  seeds: [] as number[],
  setDifficulty: [] as string[],
  decisionMs: [] as (number | undefined)[],
}));

const resignSpy = vi.hoisted(() => ({ verdict: false, calls: 0 }));

describe('aiv2 ladder adapter lifecycle (E0.1 clause 2: it matches the released worker)', () => {
  let createAiv2Bot: (difficulty: AIDifficulty, fast: boolean, work: WorkSpec, options?: { resign?: boolean }) => { onGameStart(player: 'white' | 'black', seed: number): void; nextAction(state: GameState, player: 'white' | 'black'): Promise<AIAction | null> };
  let createAiv2TurnBot: (difficulty: AIDifficulty, work: WorkSpec, options?: { resign?: boolean }) => { onGameStart(player: 'white' | 'black', seed: number): void; nextAction(state: GameState, player: 'white' | 'black'): Promise<AIAction | null> };

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../../src/ai/engine-v2', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/ai/engine-v2')>();
      class StubEngine {
        constructor(difficulty: AIDifficulty = 'medium') {
          spy.constructed.push(difficulty);
        }
        setSeed(seed: number): void {
          spy.seeds.push(seed);
        }
        setDifficulty(difficulty: AIDifficulty): void {
          spy.setDifficulty.push(difficulty);
        }
        setConfig(): void {}
        setTacticalSolver(): void {}
        async findBestAction(_state: GameState, decisionMs?: number) {
          spy.decisionMs.push(decisionMs);
          return { plan: { actions: [{ type: 'END_PLACE_PHASE' as const }], score: 0 }, nodesSearched: 1, timeMs: 1, depth: 0 };
        }
      }
      return { ...actual, AIEngineV2: StubEngine };
    });
    vi.doMock('../../src/ai/evaluation', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/ai/evaluation')>();
      return {
        ...actual,
        shouldResign: () => {
          resignSpy.calls++;
          return resignSpy.verdict;
        },
      };
    });
    const mocked = await import('../../lab/hard-ai/ladder/engines');
    createAiv2Bot = mocked.createAiv2Bot;
    createAiv2TurnBot = mocked.createAiv2TurnBot;
  });

  beforeEach(() => {
    spy.constructed.length = 0;
    spy.seeds.length = 0;
    spy.setDifficulty.length = 0;
    spy.decisionMs.length = 0;
    resignSpy.verdict = false;
    resignSpy.calls = 0;
  });

  function nextTurn(state: GameState, turnNumber: number): GameState {
    return { ...state, turn: { ...state.turn, turnNumber } };
  }

  it('constructs ONE engine and seeds it ONCE per game, across turns and decisions', async () => {
    const bot = createAiv2Bot('hard', false, { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);
    await bot.nextAction(state, 'white');
    await bot.nextAction(state, 'white');
    await bot.nextAction(nextTurn(state, 2), 'white');

    expect(spy.constructed).toEqual(['hard']);
    expect(spy.seeds).toEqual([42]);
  });

  it('calls setDifficulty once per decision, exactly as the worker does per request', async () => {
    const bot = createAiv2Bot('medium', false, { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('black', 7);
    await bot.nextAction(state, 'black');
    await bot.nextAction(state, 'black');

    expect(spy.setDifficulty).toEqual(['medium', 'medium']);
  });

  it('splits a wall-clock turn budget across the turn s remaining decisions, as useAI.ts does', async () => {
    const bot = createAiv2Bot('hard', false, { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);
    await bot.nextAction(state, 'white');

    // Place phase: four action-phase decisions still to come.
    expect(spy.decisionMs[0]).toBeGreaterThan(0);
    expect(spy.decisionMs[0]).toBeLessThanOrEqual(250);
  });

  it('starts a fresh engine and a fresh seed for the next game', async () => {
    const bot = createAiv2Bot('hard', false, { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);
    await bot.nextAction(state, 'white');
    bot.onGameStart('white', 43);
    await bot.nextAction(state, 'white');

    expect(spy.constructed).toEqual(['hard', 'hard']);
    expect(spy.seeds).toEqual([42, 43]);
  });

  it('does not resign by default: the shipped game never consults shouldResign', async () => {
    resignSpy.verdict = true;
    const bot = createAiv2Bot('hard', false, { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);

    expect(await bot.nextAction(state, 'white')).toEqual({ type: 'END_PLACE_PHASE' });
    expect(resignSpy.calls).toBe(0);
  });

  it('resigns only when the adapter flag is set explicitly', async () => {
    resignSpy.verdict = true;
    const bot = createAiv2Bot('hard', false, { mode: 'wall', ms: 1000 }, { resign: true });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);

    expect(await bot.nextAction(state, 'white')).toEqual({ type: 'RESIGN' });
    expect(resignSpy.calls).toBe(1);
  });

  it('seeds the changed-turn arm once per game too, so it differs from the shipped arm only in turn shape', async () => {
    const bot = createAiv2TurnBot('hard', { mode: 'wall', ms: 1000 });
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    bot.onGameStart('white', 42);
    await bot.nextAction(state, 'white');
    await bot.nextAction(nextTurn(state, 2), 'white');

    expect(spy.constructed).toEqual(['hard']);
    expect(spy.seeds).toEqual([42]);
  });
});
