// @vitest-environment node
/**
 * The work sweep's decision logic and its CLI. The searches themselves are
 * stubbed: what is worth pinning is which turns get swept, what counts as a
 * flip, and that a rung which picks a THIRD turn — neither the played one nor
 * the adviser's best — costs exactly one adviser search and is cached.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RootResult } from '../../src/ai/hard/search/root';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import type { AnalysisResult } from '../../lab/hard-ai/analyze/analyze';
import {
  DEFAULT_WARM_WORK,
  FLIP_TOLERANCE_CC,
  SWEEP_WORKS,
  flipWorkOf,
  parseArgs,
  renderSweepMarkdown,
  sweepAnalysis,
  sweepTargets,
  resolveEngineLabel,
  type SweepReport,
  type SweepRung,
} from '../../lab/hard-ai/analyze/work-sweep';
import type { AdviserEngine, EngineFactory } from '../../lab/hard-ai/analyze/engine';
import { resolveHardConfig } from '../../lab/hard-ai/analyze/engine';
import { HardEngine } from '../../src/ai/hard/engine';
import { loadReplay, reconstruct, withMatchRules } from '../../lab/hard-ai/analyze/replay';

const ADVISER_KEY = 'aaaaaaaaaaaaaaaa';
const PLAYED_KEY = 'bbbbbbbbbbbbbbbb';
const THIRD_KEY = 'cccccccccccccccc';

function rung(over: Partial<SweepRung> & { work: number }): SweepRung {
  return {
    chosenEndKey: PLAYED_KEY,
    chosenIsAdviserBest: false,
    chosenIsPlayed: true,
    chosenDeepCc: 0,
    withinTolerance: false,
    candidateSource: 'completed-depth',
    candidates: 20,
    searched: 20,
    depth: 3,
    wallMs: 1,
    warmSearches: 0,
    ...over,
  };
}

describe('flipWorkOf', () => {
  it('takes the lowest rung that chose the adviser’s best turn', () => {
    expect(flipWorkOf([rung({ work: 400_000, chosenIsAdviserBest: true }), rung({ work: 200_000 })])).toBe(400_000);
  });

  it('counts a turn within tolerance as a flip, and takes the lowest such rung', () => {
    expect(
      flipWorkOf([
        rung({ work: 800_000, chosenIsAdviserBest: true }),
        rung({ work: 283_000, withinTolerance: true }),
        rung({ work: 100_000 }),
      ]),
    ).toBe(283_000);
  });

  it('is null when no rung flipped', () => {
    expect(flipWorkOf([rung({ work: 100_000 }), rung({ work: 800_000 })])).toBeNull();
    expect(flipWorkOf([])).toBeNull();
  });
});

describe('sweepTargets', () => {
  const saved = { firstConsequential: { turn: 3 }, largestSwing: { turn: 7 } } as AnalysisResult;

  it('sweeps the first consequential turn by default', () => {
    expect(sweepTargets(saved, false)).toEqual([{ turn: 3, role: 'first' }]);
  });

  it('adds the largest-swing turn only when it is a different turn', () => {
    expect(sweepTargets(saved, true)).toEqual([
      { turn: 3, role: 'first' },
      { turn: 7, role: 'largest' },
    ]);
    const same = { firstConsequential: { turn: 3 }, largestSwing: { turn: 3 } } as AnalysisResult;
    expect(sweepTargets(same, true)).toEqual([{ turn: 3, role: 'first' }]);
  });
});

describe('sweepAnalysis: scoring the chosen turn', () => {
  const SOURCE = path.resolve(__dirname, '../../lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json');
  const localReplay = path.resolve(__dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json');
  const base = JSON.parse(fs.readFileSync(SOURCE, 'utf8')) as AnalysisResult;

  /** The artifact, re-pointed at the committed replay and given known keys on its first consequential turn. */
  function saved(): AnalysisResult {
    const copy = JSON.parse(JSON.stringify({ ...base, replay: localReplay })) as AnalysisResult;
    const turn = copy.turns.find(t => t.turnNumber === copy.firstConsequential.turn)!;
    turn.adviser.endKey = ADVISER_KEY;
    turn.played.endKey = PLAYED_KEY;
    turn.adviserBestDeepCc = 1000;
    turn.playedDeepCc = 0;
    return copy;
  }

  /** Answers each rung with a scripted end key; the adviser scores any third turn at `thirdCc`. */
  function factoryFor(keys: readonly string[], thirdCc: number): { factory: EngineFactory; counts: { production: number; adviser: number } } {
    const counts = { production: 0, adviser: 0 };
    const factory: EngineFactory = (_patch, role): AdviserEngine => ({
      searchTurn: async (_state, opts) => {
        if (role === 'production') {
          const key = keys[Math.min(counts.production, keys.length - 1)];
          counts.production++;
          expect(opts?.expose).toBe(true);
          return { actions: [], scoreCc: 0, depth: 3, work: opts?.work ?? 0, stats: newSearchStats(), source: 'search', endKey: key } satisfies RootResult;
        }
        counts.adviser++;
        return { actions: [], scoreCc: thirdCc, depth: 5, work: opts?.work ?? 0, stats: newSearchStats(), source: 'search', endKey: THIRD_KEY } satisfies RootResult;
      },
    });
    return { factory, counts };
  }

  it('pays no adviser search when every rung picks the played turn or the adviser’s best', async () => {
    const keys = [PLAYED_KEY, PLAYED_KEY, PLAYED_KEY, ADVISER_KEY, ADVISER_KEY, ADVISER_KEY];
    const { factory } = factoryFor(keys, 0);
    const out = await sweepAnalysis(saved(), { engineFactory: factory });
    expect(out.productionSearches).toBe(SWEEP_WORKS.length);
    expect(out.adviserSearches).toBe(0);
    expect(out.turns[0].flipWork).toBe(400_000);
    expect(out.turns[0].reproducedAtAnyRung).toBe(true);
    expect(out.turns[0].rungs.map(r => r.chosenIsAdviserBest)).toEqual([false, false, false, true, true, true]);
  });

  it('scores a third turn once and caches it by end key', async () => {
    const keys = [THIRD_KEY, THIRD_KEY, THIRD_KEY, THIRD_KEY, THIRD_KEY, THIRD_KEY];
    // The adviser's best is 1000 cc; a third turn at 900 is inside the 300 cc tolerance.
    const { factory, counts } = factoryFor(keys, 900);
    const out = await sweepAnalysis(saved(), { engineFactory: factory });
    expect(counts.adviser).toBe(1);
    expect(out.turns[0].flipWork).toBe(SWEEP_WORKS[0]);
    expect(out.turns[0].rungs[0].withinTolerance).toBe(true);
    expect(out.turns[0].reproducedAtAnyRung).toBe(false);
  });

  it('does not count a third turn outside the tolerance as a flip', async () => {
    const { factory } = factoryFor([THIRD_KEY], 1000 - FLIP_TOLERANCE_CC - 1);
    const out = await sweepAnalysis(saved(), { engineFactory: factory });
    expect(out.turns[0].flipWork).toBeNull();
  });

  it('converts the seat’s own wall time into implied work at both rates', async () => {
    const { factory } = factoryFor([PLAYED_KEY], 0);
    const out = await sweepAnalysis(saved(), { engineFactory: factory });
    const t = out.turns[0];
    if (t.seatTurnMs === null) expect(t.impliedWork).toBeNull();
    else {
      expect(t.impliedWork).toBe(t.seatTurnMs * 100);
      expect(t.impliedWorkFresh).toBe(t.seatTurnMs * 200);
    }
  });
});

describe('work-sweep CLI and rendering', () => {
  it('needs a source directory and an --out', () => {
    expect(() => parseArgs([])).toThrow(/analysis directory/);
    expect(() => parseArgs(['dir'])).toThrow(/--out/);
    expect(parseArgs(['dir', '--out', 'o'])).toEqual({
      source: 'dir',
      out: 'o',
      works: [...SWEEP_WORKS],
      includeLargest: false,
      mode: 'fresh',
      warmWork: DEFAULT_WARM_WORK,
      engine: null,
    });
    expect(parseArgs(['dir', '--out', 'o', '--works', '100,200', '--include-largest']).works).toEqual([100, 200]);
    expect(() => parseArgs(['dir', '--out', 'o', '--works', 'x'])).toThrow(/positive numbers/);
  });

  it('renders the never-flipped row as "never" rather than dropping it', () => {
    const report: SweepReport = {
      schema: 'muju-hard-work-sweep-v1',
      source: '/tmp/x',
      mode: 'fresh',
      warmWork: null,
      works: SWEEP_WORKS,
      toleranceCc: FLIP_TOLERANCE_CC,
      unitsPerMs: 100,
      engine: null,
      engineWeightsLabel: null,
      turns: [],
      flipHistogram: [
        { work: 283_000, turns: 2 },
        { work: null, turns: 5 },
      ],
      flippedAtOrBelow400k: 2,
      neverFlipped: 5,
      adviserSearches: 0,
      productionSearches: 0,
      wallMs: 1000,
      at: '2026-09-17T00:00:00.000Z',
    };
    const md = renderSweepMarkdown(report);
    expect(md).toContain('| 283k | 2 |');
    expect(md).toContain('| never | 5 |');
    expect(md).toContain('Flipped at or below 400k: 2 of 0');
  });

  it('writes nowhere on its own', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-sweep-'));
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('work-sweep: a fixed-work search does not depend on the engine instance', () => {
  /**
   * THE BUG THIS PINS. The first cut of the sweep built one production engine
   * and reused it for every work level and every turn, ascending, so the
   * transposition table was warm from the previous rungs when the next one ran
   * and a "flip at 283k" was really a flip at a cumulative several hundred
   * thousand. A fixed-work search is supposed to be a function of position and
   * work alone. This runs the REAL engine at a small rung and requires that two
   * sweeps from different instances agree with each other and with a single
   * fresh search of the same position.
   */
  const SOURCE = path.resolve(__dirname, '../../lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json');
  const localReplay = path.resolve(__dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json');
  const WORK = 25_000;

  function saved(): AnalysisResult {
    const base = JSON.parse(fs.readFileSync(SOURCE, 'utf8')) as AnalysisResult;
    return JSON.parse(JSON.stringify({ ...base, replay: localReplay })) as AnalysisResult;
  }

  /**
   * The PRODUCTION engine is the real one — that is what is being pinned. The
   * adviser is stubbed: a deep score at 1,600,000 units costs more than the
   * rest of this file put together and has nothing to do with determinism.
   */
  const realProductionStubAdviser: EngineFactory = (patch, role): AdviserEngine =>
    role === 'production'
      ? new HardEngine(patch)
      : {
          searchTurn: async () => ({
            actions: [],
            scoreCc: 0,
            depth: 1,
            work: 0,
            stats: newSearchStats(),
            source: 'search',
            endKey: THIRD_KEY,
          }),
        };

  it('agrees with a single fresh search, twice over', async () => {
    const artifact = saved();
    const opts = { works: [WORK], engineFactory: realProductionStubAdviser };
    const first = await sweepAnalysis(artifact, opts);
    const second = await sweepAnalysis(artifact, opts);
    expect(first.turns).toHaveLength(1);
    expect(first.turns[0].rungs[0].chosenEndKey).toBe(second.turns[0].rungs[0].chosenEndKey);
    expect(first.turns[0].rungs[0].warmSearches).toBe(0);

    // The same position and the same work through a brand-new engine.
    const replay = loadReplay(localReplay);
    const recon = reconstruct(replay);
    const turn = recon.bySide[artifact.side].find(t => t.turnNumber === artifact.firstConsequential.turn)!;
    const direct = await withMatchRules(replay.options, async () => {
      const engine = new HardEngine({ ...resolveHardConfig('desktop') });
      return engine.searchTurn(turn.startState, { work: WORK });
    });
    expect(first.turns[0].rungs[0].chosenEndKey).toBe(direct.endKey);
  }, 120_000);

  it('game-warm searches the seat’s earlier turns first and says how many', async () => {
    const artifact = saved();
    const out = await sweepAnalysis(artifact, { works: [WORK], mode: 'game-warm', warmWork: WORK, engineFactory: realProductionStubAdviser });
    const turnNumber = out.turns[0].turnNumber;
    // One warming search per earlier seat turn of the same game.
    expect(out.turns[0].rungs[0].warmSearches).toBe(turnNumber - 1);
    expect(out.productionSearches).toBe(1 + (turnNumber - 1));
  }, 120_000);
});

describe('work-sweep: mode on the CLI', () => {
  it('defaults to fresh and accepts game-warm', () => {
    expect(parseArgs(['d', '--out', 'o']).mode).toBe('fresh');
    expect(parseArgs(['d', '--out', 'o', '--mode', 'game-warm']).mode).toBe('game-warm');
    expect(() => parseArgs(['d', '--out', 'o', '--mode', 'hot'])).toThrow(/--mode must be/);
    expect(parseArgs(['d', '--out', 'o', '--warm-work', '50000']).warmWork).toBe(50_000);
    expect(() => parseArgs(['d', '--out', 'o', '--warm-work', '0'])).toThrow(/positive/);
  });
});

describe('work-sweep: --engine swaps the production engine only', () => {
  /**
   * E3.2 lane 10. The reproduction record for row #1 needs the arm's rungs at
   * the same root as the champion's, and the two are only comparable if
   * exactly one thing moved: the engine that SEARCHES. The adviser that scores
   * whatever that search chose stays the artifact's own, because
   * `adviserBestDeepCc` — the yardstick a flip is measured against — was
   * produced by it.
   */
  const SOURCE = path.resolve(__dirname, '../../lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json');
  const localReplay = path.resolve(__dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json');

  function saved(): AnalysisResult {
    const base = JSON.parse(fs.readFileSync(SOURCE, 'utf8')) as AnalysisResult;
    const copy = JSON.parse(JSON.stringify({ ...base, replay: localReplay })) as AnalysisResult;
    const turn = copy.turns.find(t => t.turnNumber === copy.firstConsequential.turn)!;
    turn.adviser.endKey = ADVISER_KEY;
    turn.played.endKey = PLAYED_KEY;
    turn.adviserBestDeepCc = 1000;
    turn.playedDeepCc = 0;
    return copy;
  }

  it('takes hard@<label> on the CLI and defaults to null', () => {
    expect(parseArgs(['d', '--out', 'o']).engine).toBeNull();
    expect(parseArgs(['d', '--out', 'o', '--engine', 'hard@ablate:eval-no-safety']).engine).toBe('hard@ablate:eval-no-safety');
  });

  it('resolves an arm label through hardEnginePatch, with real (non-placeholder) weights', () => {
    // E0's I2 lesson: `armHardConfig()` alone hands back DESKTOP's version-0
    // placeholder. The sweep must never search with those.
    const champion = resolveEngineLabel('hard@desktop');
    expect(champion.weights.version).not.toBe(0);
    expect(champion.weights.label).toBe('default-v1');
    const arm = resolveEngineLabel('hard@ablate:eval-no-safety');
    expect(arm.weights.version).not.toBe(0);
    expect(arm.weights.label).toBe('default-v1-no-safety');
    // The safety block is what the arm zeroes, and nothing else moved.
    for (const i of [17, 28, 29, 30, 31, 32, 33, 34, 35, 36, 40, 41, 43, 45, 46, 49, 54, 56, 57]) {
      expect(arm.weights.w[i]).toBe(0);
    }
    // Feature 0 is `Material`: the arm is a SAFETY arm and must not have moved it.
    expect(arm.weights.w[0]).toBe(champion.weights.w[0]);
    expect(arm.weights.material).toEqual(champion.weights.material);
    expect(resolveEngineLabel('ablate:eval-no-safety').weights.label).toBe('default-v1-no-safety');
  });

  it('hands the arm’s config to the production factory and the artifact’s to the adviser', async () => {
    const seen: Array<{ role: string; label: string }> = [];
    const factory: EngineFactory = (patch, role): AdviserEngine => {
      seen.push({ role, label: (patch as { weights?: { label: string } }).weights?.label ?? 'none' });
      return {
        searchTurn: async (_state, opts) => ({
          actions: [],
          scoreCc: 0,
          depth: 3,
          work: opts?.work ?? 0,
          stats: newSearchStats(),
          source: 'search',
          endKey: role === 'production' ? THIRD_KEY : THIRD_KEY,
        }),
      };
    };
    const out = await sweepAnalysis(saved(), { works: [25_000], engineFactory: factory, engine: 'hard@ablate:eval-no-safety' });
    expect(out.engineWeightsLabel).toBe('default-v1-no-safety');
    expect(seen.filter(x => x.role === 'production').every(x => x.label === 'default-v1-no-safety')).toBe(true);
    expect(seen.filter(x => x.role === 'adviser').every(x => x.label === 'default-v1')).toBe(true);
  });

  it('leaves the default path alone: no engine, no arm weights, null in the report', async () => {
    const seen: string[] = [];
    const factory: EngineFactory = (patch, role): AdviserEngine => {
      seen.push(`${role}:${(patch as { weights?: { label: string } }).weights?.label ?? 'none'}`);
      return {
        searchTurn: async (_state, opts) => ({
          actions: [],
          scoreCc: 0,
          depth: 3,
          work: opts?.work ?? 0,
          stats: newSearchStats(),
          source: 'search',
          endKey: PLAYED_KEY,
        }),
      };
    };
    const out = await sweepAnalysis(saved(), { works: [25_000], engineFactory: factory });
    expect(out.engineWeightsLabel).toBeNull();
    expect(seen).toEqual(['production:default-v1']);
  });

  it('refuses an unknown label rather than falling back to the champion', () => {
    expect(() => resolveEngineLabel('hard@not-an-engine')).toThrow(/unknown label/);
    expect(() => resolveEngineLabel('hard@ablate:not-an-arm')).toThrow(/unknown arm/);
  });
});
