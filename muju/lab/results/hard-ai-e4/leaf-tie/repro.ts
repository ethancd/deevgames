/**
 * E4.2 leaf tie — the reproduction (lane 3 of `docs/hard-ai/e4/E4-PLAN.md`).
 *
 *   node --import tsx lab/results/hard-ai-e4/leaf-tie/repro.ts \
 *     --out lab/results/hard-ai-e4/leaf-tie
 *
 * THE QUESTION. At `g2-s20_3_15-A-white` white turn 3 every root candidate the
 * champion searched came back with the SAME score and the champion played the
 * turn carrying the transposition-table move bonus (`search/order.ts ORDER_TT`,
 * +2,000,000). This script asks what actually decides between candidates whose
 * searched scores are equal, rung by rung.
 *
 * WHAT IT RUNS. One FRESH `HardEngine` per (rung, engine) search — a fixed-work
 * search is a function of position and work alone and a warm table would make
 * it a function of the run — through `analyze/engine.ts defaultEngineFactory`
 * over `bots/hard.ts hardEnginePatch`, the only path that substitutes
 * `DEFAULT_WEIGHTS` for `DESKTOP`'s version-0 placeholder (E0's I2 lesson).
 * `weights.version !== 0` is asserted before a single search runs.
 *
 * WHAT IT RECORDS per rung: the root's returned end key and depth, the
 * completed-iteration trace, and for the exposed candidate list the number of
 * candidates tied at the maximum searched score, the chosen candidate's rank in
 * that tied set, and whether the chosen candidate carried `ORDER_TT` (ordering
 * score >= 2,000,000). A rung whose tie group has more than one member and
 * whose winner is the ordering list's FIRST member is a first-found-wins tie.
 *
 * `--engine hard@<label>` swaps the searching engine (for the tie-policy arm);
 * the position and the rungs do not move.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '../../../../src/game/types';
import type { RootCandidate, RootResult } from '../../../../src/ai/hard/search/root';
import { ORDER_TT } from '../../../../src/ai/hard/search/order';
import {
  defaultEngineFactory,
  resolveHardConfig,
  type AdviserEngine,
} from '../../../hard-ai/analyze/engine';
import { hardEnginePatch } from '../../../hard-ai/bots/hard';
import { loadReplay, reconstruct, withMatchRules } from '../../../hard-ai/analyze/replay';

/** The position: file id, seat, turn number (DESIGN's position vocabulary). */
const FILE_ID = 'g2-s20_3_15-A-white';
const SEAT = 'white' as const;
const TURN_NUMBER = 3;

/** The E2 root-exposure artifact for this game, and the E1.1 replay it points at. */
const EXPOSED = 'lab/results/hard-ai-e2/analysis/e1.1-losses-exposed/g2-s20_3_15-A-white.json';
const REPLAY = 'lab/results/hard-ai-e1/e1.1-diag/replays/g2-s20_3_15-A-white.json';

/**
 * The rungs. `search/time.ts WORK_LADDER` from 12,500 up: the low rungs are
 * there because the question is which ITERATION latched the answer, and only a
 * rung that completes exactly one iteration can show the depth-1 verdict.
 */
const RUNGS: readonly number[] = [12_500, 25_000, 50_000, 100_000, 200_000, 400_000, 800_000];

interface CandidateRow {
  index: number;
  endKey: string;
  genRankCc: number;
  hasTtBonus: boolean;
  searched: boolean;
  scoreCc: number | null;
  chosen: boolean;
}

interface RungRow {
  work: number;
  depth: number;
  chosenEndKey: string;
  source: string;
  candidateSource: string | null;
  candidates: number;
  searched: number;
  /** Distinct searched scores, best first, with how many candidates carry each. */
  scoreHistogram: Array<{ scoreCc: number; candidates: number }>;
  bestScoreCc: number | null;
  /** Candidates whose searched score equals the best. */
  tiedAtBest: number;
  /** The chosen candidate's position in the ORDERING list among the tied set. */
  chosenRankInTie: number;
  /** The chosen candidate's ordering score and whether it carried ORDER_TT. */
  chosenGenRankCc: number | null;
  chosenHasTtBonus: boolean | null;
  /** The tied candidate the ordering listed first — what first-found-wins picks. */
  firstTiedEndKey: string | null;
  /** True when the chosen candidate IS the first tied candidate in ordering order. */
  firstFoundWins: boolean;
  /** Lowest end key among the tied set: what a canonical end-key tie policy picks. */
  lowestTiedEndKey: string | null;
  trace: Array<{ depth: number; n: number; searched: number; completed: boolean; cutoffAt: number; truncated: boolean; work: number | null }>;
  wallMs: number;
  candidatesDetail: CandidateRow[];
}

function argOf(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function rowsOf(result: RootResult): CandidateRow[] {
  const list: readonly RootCandidate[] = result.candidates ?? [];
  return list.map(c => ({
    index: c.index,
    endKey: c.endKey,
    genRankCc: c.genRankCc,
    hasTtBonus: c.genRankCc >= ORDER_TT,
    searched: c.searched,
    scoreCc: c.scoreCc,
    chosen: c.chosen,
  }));
}

function summarise(work: number, result: RootResult, wallMs: number): RungRow {
  const detail = rowsOf(result);
  const scored = detail.filter(c => c.searched && c.scoreCc !== null);
  const byScore = new Map<number, number>();
  for (const c of scored) byScore.set(c.scoreCc as number, (byScore.get(c.scoreCc as number) ?? 0) + 1);
  const histogram = [...byScore.entries()]
    .map(([scoreCc, candidates]) => ({ scoreCc, candidates }))
    .sort((a, b) => b.scoreCc - a.scoreCc);
  const bestScoreCc = histogram.length > 0 ? histogram[0].scoreCc : null;
  const tied = bestScoreCc === null ? [] : scored.filter(c => c.scoreCc === bestScoreCc);
  const chosen = detail.find(c => c.chosen) ?? null;
  const chosenRankInTie = chosen === null ? -1 : tied.findIndex(c => c.index === chosen.index);
  const lowest = tied.length === 0 ? null : [...tied].sort((a, b) => (a.endKey < b.endKey ? -1 : a.endKey > b.endKey ? 1 : 0))[0].endKey;
  return {
    work,
    depth: result.depth,
    chosenEndKey: result.endKey,
    source: result.source,
    candidateSource: result.candidateSource ?? null,
    candidates: detail.length,
    searched: scored.length,
    scoreHistogram: histogram,
    bestScoreCc,
    tiedAtBest: tied.length,
    chosenRankInTie,
    chosenGenRankCc: chosen === null ? null : chosen.genRankCc,
    chosenHasTtBonus: chosen === null ? null : chosen.hasTtBonus,
    firstTiedEndKey: tied.length === 0 ? null : tied[0].endKey,
    firstFoundWins: chosen !== null && tied.length > 0 && tied[0].index === chosen.index,
    lowestTiedEndKey: lowest,
    trace: (result.rootTrace ?? []).map(r => ({
      depth: r.depth,
      n: r.n,
      searched: r.searched,
      completed: r.completed,
      cutoffAt: r.cutoffAt,
      truncated: r.truncated,
      work: r.work ?? null,
    })),
    wallMs,
    candidatesDetail: detail,
  };
}

async function main(): Promise<void> {
  const outDir = argOf('--out', 'lab/results/hard-ai-e4/leaf-tie');
  const engineLabel = argOf('--engine', 'hard@desktop');
  const tag = argOf('--tag', engineLabel.replace(/[^a-z0-9]+/gi, '-'));
  const started = Date.now();

  const config = resolveHardConfig(engineLabel.startsWith('hard@') ? engineLabel.slice('hard@'.length) : engineLabel);
  if (config.weights === undefined || config.weights.version === 0) {
    throw new Error(`leaf-tie: ${engineLabel} resolved placeholder weights (version 0); refusing to run`);
  }
  // The patch the fresh engines are actually built from, so the assertion above
  // is an assertion about the engines and not only about `config`.
  const patch = hardEnginePatch(engineLabel.startsWith('hard@') ? engineLabel.slice('hard@'.length) : engineLabel);
  if (patch.weights === undefined || patch.weights.version === 0) {
    throw new Error('leaf-tie: hardEnginePatch handed back placeholder weights; refusing to run');
  }

  const saved = JSON.parse(fs.readFileSync(EXPOSED, 'utf8')) as {
    turns: Array<{ turnNumber: number; played: { endKey: string }; adviser: { endKey: string } }>;
  };
  const row = saved.turns.find(t => t.turnNumber === TURN_NUMBER);
  if (row === undefined) throw new Error(`leaf-tie: no turn ${TURN_NUMBER} in ${EXPOSED}`);

  const replay = loadReplay(REPLAY);
  const recon = reconstruct(replay);

  const rungs: RungRow[] = [];
  await withMatchRules(replay.options, async () => {
    const turn = recon.bySide[SEAT].find(t => t.turnNumber === TURN_NUMBER);
    if (turn === undefined) throw new Error(`leaf-tie: seat ${SEAT} has no turn ${TURN_NUMBER}`);
    const startState: GameState = turn.startState;
    for (const work of RUNGS) {
      // ONE FRESH ENGINE PER SEARCH: a fixed-work search must be a function of
      // position and work alone (`analyze/work-sweep.ts`, mode `fresh`).
      const engine: AdviserEngine = defaultEngineFactory({ ...patch }, 'production');
      const at = Date.now();
      const result = await engine.searchTurn(startState, { work, expose: true });
      rungs.push(summarise(work, result, Date.now() - at));
    }
  });

  const report = {
    schema: 'muju-hard-leaf-tie-v1',
    fileId: FILE_ID,
    side: SEAT,
    turnNumber: TURN_NUMBER,
    engine: engineLabel,
    weightsLabel: patch.weights.label,
    weightsVersion: patch.weights.version,
    searchFix: (patch as { searchFix?: unknown }).searchFix ?? null,
    orderTtBonus: ORDER_TT,
    playedEndKey: row.played.endKey,
    adviserEndKey: row.adviser.endKey,
    rungs,
    wallMs: Date.now() - started,
    at: new Date().toISOString(),
  };
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `rungs-${tag}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 1)}\n`);

  console.log(`${FILE_ID} ${SEAT} t${TURN_NUMBER}  engine ${engineLabel}  weights ${patch.weights.label} v${patch.weights.version}`);
  console.log(`played ${row.played.endKey}   adviser ${row.adviser.endKey}`);
  console.log('work      depth chosen           src   cand/srch  bestCc  tied  rankInTie  ttBonus  firstFound  lowestTied');
  for (const r of rungs) {
    console.log(
      `${String(r.work).padStart(8)}  ${String(r.depth).padStart(4)}  ${r.chosenEndKey}  ${(r.candidateSource ?? '-').slice(0, 5).padEnd(5)} ` +
        `${String(r.candidates).padStart(4)}/${String(r.searched).padEnd(4)} ${String(r.bestScoreCc ?? '-').padStart(6)} ` +
        `${String(r.tiedAtBest).padStart(5)} ${String(r.chosenRankInTie).padStart(10)} ${String(r.chosenHasTtBonus).padStart(8)} ` +
        `${String(r.firstFoundWins).padStart(11)}  ${r.lowestTiedEndKey ?? '-'}`,
    );
  }
  console.log(`wrote ${file}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
