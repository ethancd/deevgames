// @vitest-environment node
/**
 * The E2 split: `strong-candidate-discarded` against
 * `strong-candidate-misjudged`, decided by E2 lane 1's root exposure
 * (`RootResult.candidates`, `searched`, `scoreCc`).
 *
 * Three levels, cheapest first:
 *
 *  1 `splitByExposure` on synthetic rows — every outcome, including the four
 *    `exposure-inconsistent` ones, which exist so that a disagreement between
 *    the exposure and the rest of the analysis is REPORTED rather than
 *    relabelled.
 *  2 `buildExposure`, the mapping from a `RootResult` to what the artifact
 *    stores, including the null case (instrument off).
 *  3 `reclassifyDirectoryWithRoot` end to end over a real saved artifact and
 *    its real replay, with the production engine stubbed so no search runs:
 *    the retrofit path that turns 14 pre-E2 artifacts into a split.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RootResult } from '../../src/ai/hard/search/root';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import {
  buildExposure,
  classifyFirst,
  CLASS_RULES,
  splitByExposure,
  type ExposedCandidate,
  type TurnExposure,
  type TurnRow,
} from '../../lab/hard-ai/analyze/analyze';
import { flaggedTurns, reclassifyDirectoryWithRoot } from '../../lab/hard-ai/analyze/reclassify';
import type { AdviserEngine, EngineFactory } from '../../lab/hard-ai/analyze/engine';

const ADVISER_KEY = 'aaaaaaaaaaaaaaaa';
const PLAYED_KEY = 'bbbbbbbbbbbbbbbb';

function candidate(over: Partial<ExposedCandidate> & { endKey: string }): ExposedCandidate {
  return { index: 0, genRankCc: 0, flags: 0, sig: 0, searched: false, scoreCc: null, chosen: false, ...over };
}

function exposure(over: Partial<TurnExposure> = {}): TurnExposure {
  const candidates = over.candidates ?? [];
  return {
    source: 'completed-depth',
    count: candidates.length,
    searchedCount: candidates.filter(c => c.searched).length,
    completedDepth: 3,
    lastCutoffAt: -1,
    adviserBest: candidates.find(c => c.endKey === ADVISER_KEY) ?? null,
    played: candidates.find(c => c.endKey === PLAYED_KEY) ?? null,
    candidates,
    rootTrace: [{ depth: 3, n: candidates.length, searched: candidates.filter(c => c.searched).length, completed: true, cutoffAt: -1, truncated: false }],
    ...over,
  };
}

/** A row that reaches the final branch of `classifyRow`: no overrun, adviser best in the K list, adviser agrees on the reply. */
function row(exposureValue: TurnExposure | null): TurnRow {
  return {
    seatTurnIndex: 2,
    turnNumber: 3,
    side: 'white',
    played: { actions: ['x'], endKey: PLAYED_KEY, inCheapList: true, endsGame: false },
    cheap: { count: 24, containsPlayed: true, containsAdviserBest: true },
    adviser: {
      endKey: ADVISER_KEY,
      actions: ['y'],
      scoreCc: 100,
      depth: 4,
      work: 1_600_000,
      source: 'search',
      fallback: null,
      agreesWithPlayed: false,
    },
    playedDeepCc: -500,
    adviserBestDeepCc: 400,
    swingCc: 900,
    swingRootCc: 600,
    engine: { scoreCc: -100, endKey: PLAYED_KEY, reproducedPlayed: true },
    exposure: exposureValue,
    reply: { refutationKey: 'cccccccccccccccc', inRootGenList: true, rootGenCount: 24, inInteriorGenList: true, interiorGenCount: 16 },
    timing: { turnMs: 2000, budgetMs: 3000, overran: false, emptyPlan: false },
    notes: [],
  };
}

describe('splitByExposure: the two real classes', () => {
  it('calls it discarded when the root never searched the adviser’s best turn', () => {
    const e = exposure({
      candidates: [
        candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: -100, chosen: true }),
        candidate({ endKey: ADVISER_KEY, index: 17, searched: false, scoreCc: null, genRankCc: 42 }),
      ],
    });
    const split = splitByExposure(row(e));
    expect(split?.klass).toBe('strong-candidate-discarded');
    expect(split?.evidence).toContain('candidate #17');
    expect(split?.evidence).toContain('never searched it');
  });

  it('calls it misjudged when the root searched it and scored it below the played turn', () => {
    const e = exposure({
      candidates: [
        candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: -100, chosen: true }),
        candidate({ endKey: ADVISER_KEY, index: 5, searched: true, scoreCc: -350 }),
      ],
    });
    const split = splitByExposure(row(e));
    expect(split?.klass).toBe('strong-candidate-misjudged');
    expect(split?.evidence).toContain('-350 cc, below the played candidate #0 at -100 cc');
  });

  it('calls it misjudged when every candidate carries the incumbent’s fail-low bound', () => {
    // The measured shape on the E1.1 losses: all candidates searched, all
    // scored identically, the played one chosen.
    const e = exposure({
      candidates: [
        candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: 1870, chosen: true }),
        candidate({ endKey: ADVISER_KEY, index: 3, searched: true, scoreCc: 1870 }),
      ],
    });
    const split = splitByExposure(row(e));
    expect(split?.klass).toBe('strong-candidate-misjudged');
    expect(split?.evidence).toContain('fail-low bound');
    expect(split?.evidence).toContain('did not prefer it');
  });

  it('reaches the class through classifyFirst, with the rule text attached', () => {
    const e = exposure({
      candidates: [
        candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: 10, chosen: true }),
        candidate({ endKey: ADVISER_KEY, index: 9, searched: false }),
      ],
    });
    const c = classifyFirst([row(e)], 300);
    expect(c.klass).toBe('strong-candidate-discarded');
    expect(c.turn).toBe(3);
    expect(c.rule).toBe(CLASS_RULES['strong-candidate-discarded']);
  });
});

describe('splitByExposure: the inconsistent outcomes are reported, not relabelled', () => {
  const cases: Array<{ name: string; e: TurnExposure; contains: string }> = [
    {
      name: 'the adviser’s best turn is not in the published candidate list',
      e: exposure({ candidates: [candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: 5, chosen: true })] }),
      contains: 'NOT in the root',
    },
    {
      name: 'the root searched it and scored it strictly above the played turn',
      e: exposure({
        candidates: [
          candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: -100, chosen: true }),
          candidate({ endKey: ADVISER_KEY, index: 2, searched: true, scoreCc: 50 }),
        ],
      }),
      contains: 'ABOVE the played candidate',
    },
    {
      name: 'it ties the played candidate and the played candidate is not the chosen one',
      e: exposure({
        candidates: [
          candidate({ endKey: PLAYED_KEY, index: 0, searched: true, scoreCc: -100, chosen: false }),
          candidate({ endKey: ADVISER_KEY, index: 2, searched: true, scoreCc: -100 }),
          candidate({ endKey: 'dddddddddddddddd', index: 1, searched: true, scoreCc: -100, chosen: true }),
        ],
      }),
      contains: 'cannot be read off the exposure',
    },
    {
      name: 'the played turn is not in the candidate list',
      e: exposure({ candidates: [candidate({ endKey: ADVISER_KEY, index: 1, searched: true, scoreCc: -20 })] }),
      contains: 'is not in the candidate list',
    },
    {
      name: 'the root published its pre-deepening generator list',
      e: exposure({
        source: 'generator-list',
        candidates: [candidate({ endKey: ADVISER_KEY, index: 3 }), candidate({ endKey: PLAYED_KEY, index: 0 })],
        completedDepth: null,
        rootTrace: [],
      }),
      contains: 'unsearched by construction',
    },
  ];
  for (const c of cases) {
    it(`reports exposure-inconsistent when ${c.name}`, () => {
      const split = splitByExposure(row(c.e));
      expect(split?.klass).toBe('exposure-inconsistent');
      expect(split?.evidence).toContain(c.contains);
    });
  }

  it('falls back to the pre-E2 class when the row carries no exposure', () => {
    expect(splitByExposure(row(null))).toBeNull();
    const c = classifyFirst([row(null)], 300);
    expect(c.klass).toBe('strong-candidate-misjudged');
    expect(c.evidence).toContain('No root exposure on this row');
  });
});

describe('buildExposure: RootResult to artifact', () => {
  const base: RootResult = {
    actions: [],
    scoreCc: 0,
    depth: 3,
    work: 400_000,
    stats: newSearchStats(),
    source: 'search',
    endKey: PLAYED_KEY,
  };

  it('returns null when the instrument was off', () => {
    expect(buildExposure(base, ADVISER_KEY, PLAYED_KEY)).toBeNull();
  });

  it('finds the two compared candidates and summarises the trace', () => {
    const e = buildExposure(
      {
        ...base,
        candidateSource: 'completed-depth',
        candidates: [
          { index: 0, endKey: PLAYED_KEY, genRankCc: 90, flags: 1, sig: 7, searched: true, scoreCc: -100, chosen: true },
          { index: 4, endKey: ADVISER_KEY, genRankCc: 30, flags: 0, sig: 9, searched: false, scoreCc: null, chosen: false },
        ],
        rootTrace: [
          { depth: 2, n: 18, searched: 18, completed: true, cutoffAt: -1, truncated: false },
          { depth: 3, n: 18, searched: 11, completed: false, cutoffAt: 11, truncated: true },
        ],
      },
      ADVISER_KEY,
      PLAYED_KEY,
    );
    expect(e).not.toBeNull();
    expect(e!.count).toBe(2);
    expect(e!.searchedCount).toBe(1);
    expect(e!.completedDepth).toBe(2);
    expect(e!.lastCutoffAt).toBe(11);
    expect(e!.adviserBest?.index).toBe(4);
    expect(e!.played?.chosen).toBe(true);
  });

  it('reports a played end key it cannot look up as null rather than guessing', () => {
    const e = buildExposure(
      { ...base, candidateSource: 'completed-depth', candidates: [], rootTrace: [] },
      ADVISER_KEY,
      null,
    );
    expect(e!.played).toBeNull();
    expect(e!.adviserBest).toBeNull();
  });
});

describe('reclassifyDirectoryWithRoot: the retrofit path', () => {
  const SOURCE = path.resolve(__dirname, '../../lab/results/hard-ai-e1/analyze');
  const saved = JSON.parse(fs.readFileSync(path.join(SOURCE, 'g3-s1_0_1-B-white.json'), 'utf8')) as {
    replay: string;
    firstConsequential: { turn: number | null };
    largestSwing: { turn: number | null };
    turns: Array<{ turnNumber: number; played: { endKey: string | null }; adviser: { endKey: string } }>;
  };
  // The committed artifact points at the worktree it was produced in. The same
  // replay is committed here, so the test re-points it and leaves the original
  // file alone.
  const localReplay = path.resolve(__dirname, '../../lab/results/hard-ai-e0/pilot2-h0/replays/g3-s1_0_1-B-white.json');

  function stage(): { src: string; out: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-rerun-root-'));
    const src = path.join(root, 'analysis');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'g3-s1_0_1-B-white.json'), JSON.stringify({ ...saved, replay: localReplay }, null, 2));
    return { src, out: path.join(root, 'analysis-v3') };
  }

  /** A production engine that answers every search with an exposed candidate list. */
  const stubFactory: EngineFactory = (): AdviserEngine => ({
    searchTurn: async (_state, opts) => {
      expect(opts?.expose).toBe(true);
      expect(opts?.work).toBe(400_000);
      const turn = saved.turns.find(t => t.turnNumber === saved.firstConsequential.turn) ?? saved.turns[0];
      const playedKey = turn.played.endKey ?? PLAYED_KEY;
      return {
        actions: [],
        scoreCc: 0,
        depth: 3,
        work: 400_000,
        stats: newSearchStats(),
        source: 'search',
        endKey: playedKey,
        candidateSource: 'completed-depth',
        candidates: [
          { index: 0, endKey: playedKey, genRankCc: 80, flags: 0, sig: 1, searched: true, scoreCc: -50, chosen: true },
          { index: 12, endKey: turn.adviser.endKey, genRankCc: 10, flags: 0, sig: 2, searched: false, scoreCc: null, chosen: false },
        ],
        rootTrace: [{ depth: 3, n: 2, searched: 1, completed: true, cutoffAt: -1, truncated: false }],
      } satisfies RootResult;
    },
  });

  it('re-runs only the flagged turns and writes the split into the output artifact', async () => {
    const { src, out } = stage();
    const summary = await reclassifyDirectoryWithRoot(src, { out, rerunRoot: true, engineFactory: stubFactory });
    expect(summary.reclassified).toBe(1);
    expect(summary.failed).toEqual([]);
    // One or two flagged turns per game, never a whole-game pass.
    const flagged = flaggedTurns(saved as never);
    expect(summary.rootSearches).toBe(flagged.size);
    expect(flagged.size).toBeLessThanOrEqual(2);

    const written = JSON.parse(fs.readFileSync(path.join(out, 'g3-s1_0_1-B-white.json'), 'utf8')) as {
      turns: Array<{ turnNumber: number; exposure: TurnExposure | null }>;
      firstConsequential: { klass: string };
      classRules: Record<string, string>;
    };
    const exposed = written.turns.filter(t => t.exposure !== null);
    expect(exposed.map(t => t.turnNumber).sort((a, b) => a - b)).toEqual([...flagged].sort((a, b) => a - b));
    expect(written.classRules['strong-candidate-discarded']).toContain('never searched');
  });

  it('refuses to write into its own input directory', async () => {
    const { src } = stage();
    await expect(reclassifyDirectoryWithRoot(src, { out: src, rerunRoot: true, engineFactory: stubFactory })).rejects.toThrow(
      /refuses to write into its own input directory/,
    );
  });
});
