/**
 * `node --import tsx lab/results/hard-ai-e4/iter-fit/probe.ts [--out <dir>]
 *   [--positions <n>] [--warmup <k>] [--fixtures <dir>]`
 *
 * E4.3 candidate B's COMPLETION evidence (E4 plan, usefulness rule 1):
 * `hard@desktop` against `hard@ablate:search-iter-fit` at wall:3000 on twenty
 * `e1-dev` turn-6 positions, reporting completed iterations, root replies
 * searched, the abort share and whether the principal turn changed.
 *
 * THE POSITIONS. The E2 lane 1 probe's own set is twenty positions: fourteen
 * sweep turns (twelve distinct) plus six loss-derived exam cases, and
 * `lab/results/hard-ai-e2/probe/` keeps only the twelve-position `work-fit-12`
 * artifact — the six exam cases are not reconstructible from it. So this uses
 * the E4 plan's stated alternative: twenty turn-6 positions on `e1-dev`
 * openings, reconstructed from the E1 BASELINE ladder's own replays
 * (`lab/results/hard-ai-e1/baseline/replays`, `hard@desktop` vs `aiv2-hard` at
 * wall:3000), which is where an `e1-dev` opening was actually played. One
 * position per opening id, the `hard@desktop` seat's sixth turn, in filename
 * order, and the position comes from `reconstruct(replay).bySide[side]` inside
 * the replay's own `withMatchRules` — the resolution `analyze/work-sweep.ts`
 * and `bench/arm-probe.ts` use, so a disagreement with either is a real one.
 *
 * WARMED, AND WHY NOT COLD. Each (arm × position) gets its OWN engine, and
 * that engine runs `--warmup` searches of the position before the measured
 * one. A literally fresh engine per MEASURED search would have
 * `profile.samples === 0`, pick its rung from `INITIAL_UNITS_PER_MS` = 200
 * rather than from this box's ~100 units/ms, and spend the measurement on
 * E1.5's cold-start pathology instead of on the estimator. This is E2 lane 1's
 * protocol unchanged, so the columns are comparable with its table.
 *
 * ONE PROCESS. The whole probe is sequential — no shards, no workers — because
 * a wall measurement timed against another engine is not a measurement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HardEngine } from '../../../../src/ai/hard/engine';
import { resolveHardConfig } from '../../../hard-ai/analyze/engine';
import { hardProfileOf, hardSeat, loadReplay, reconstruct, withMatchRules } from '../../../hard-ai/analyze/replay';
import type { HardConfig } from '../../../../src/ai/hard/config';
import type { GameState } from '../../../../src/game/types';
import type { MatchOptions } from '../../../harness/types';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const BASELINE = path.join(REPO, 'lab/results/hard-ai-e1/baseline/replays');
const OPENINGS = path.join(REPO, 'lab/hard-ai/ladder/openings/e1-dev.jsonl');

const ALLOWANCE_MS = 3000;
const TURN_NUMBER = 6;

interface Target {
  id: string;
  openingId: string;
  side: 'white' | 'black';
  state: GameState;
  options: MatchOptions;
  engineLabel: string;
}

function devOpeningIds(): Set<string> {
  const ids = new Set<string>();
  for (const line of fs.readFileSync(OPENINGS, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.length === 0) continue;
    ids.add((JSON.parse(t) as { id: string }).id);
  }
  return ids;
}

/**
 * Twenty turn-6 positions, one per distinct `e1-dev` opening, from the seat
 * whose bot is a `hard@…` engine (`analyze/replay.ts hardSeat`), in filename order.
 */
export function devTurn6Targets(limit: number): Target[] {
  const dev = devOpeningIds();
  const out: Target[] = [];
  const usedOpenings = new Set<string>();
  for (const file of fs.readdirSync(BASELINE).sort()) {
    if (!file.endsWith('.json')) continue;
    if (out.length >= limit) break;
    const replay = loadReplay(path.join(BASELINE, file));
    const openingId = replay.opening.id;
    if (!dev.has(openingId) || usedOpenings.has(openingId)) continue;
    const side = hardSeat(replay.meta);
    if (side === null) continue;
    const engineLabel = replay.meta.players[side].bot ?? '';
    if (hardProfileOf(engineLabel) === null) continue;
    const turn = reconstruct(replay).bySide[side].find(x => x.turnNumber === TURN_NUMBER);
    if (turn === undefined) continue;
    usedOpenings.add(openingId);
    out.push({
      id: `${replay.fileId}:t${TURN_NUMBER}`,
      openingId,
      side,
      state: turn.startState,
      options: replay.options,
      engineLabel,
    });
  }
  return out;
}

/** The seat's own resolved configuration, and the arm as a PATCH over it —
 * never `armHardConfig`, which would revert the resolved weight vector and
 * make the comparison two-factor (`bench/arm-probe.ts`'s `configFor`). */
function configFor(arm: string, engineLabel: string): HardConfig {
  const profile = hardProfileOf(engineLabel);
  if (profile === null) throw new Error(`cannot resolve a hard profile from ${engineLabel}`);
  const base = resolveHardConfig(profile);
  return arm === 'hard@desktop' ? base : { ...base, searchFix: { iterFit: true } };
}

export interface Row {
  arm: string;
  positionId: string;
  openingId: string;
  side: string;
  rung: number;
  work: number;
  usedFrac: number;
  elapsedMs: number;
  /** Completed iterations: `result.depth`, the last COMPLETED depth, which is
   * also how many iterations completed (depths run 1, 2, 3, …). */
  completedIters: number;
  /** Cross-check from the root instrument: rows with `completed === true`. */
  traceCompleted: number;
  /** Root replies applied and searched, summed over every iteration run. */
  rootRepliesSearched: number;
  /** Root replies searched by the LAST iteration run. */
  lastIterSearched: number;
  stopReason: string;
  aborted: boolean;
  unitsPerMsAfter: number;
  iterFitRemainders: number;
  iterFitPublished: number;
  endKey: string;
  source: string;
}

async function measure(arm: string, t: Target, warmup: number): Promise<Row> {
  const engine = new HardEngine(configFor(arm, t.engineLabel));
  for (let i = 0; i < warmup; i++) {
    await engine.searchTurn(t.state, { targetMs: ALLOWANCE_MS, deadlineMs: ALLOWANCE_MS });
  }
  const r = await engine.searchTurn(t.state, {
    targetMs: ALLOWANCE_MS,
    deadlineMs: ALLOWANCE_MS,
    expose: true,
  });
  const trace = r.rootTrace ?? [];
  return {
    arm,
    positionId: t.id,
    openingId: t.openingId,
    side: t.side,
    rung: r.stats.rung,
    work: r.work,
    usedFrac: +(r.work / (r.stats.rung || 1)).toFixed(3),
    elapsedMs: r.stats.elapsedMs,
    completedIters: r.depth,
    traceCompleted: trace.filter(x => x.completed).length,
    rootRepliesSearched: trace.reduce((s, x) => s + x.searched, 0),
    lastIterSearched: trace.length === 0 ? 0 : trace[trace.length - 1].searched,
    stopReason: r.stats.stopReason,
    aborted: r.stats.stopReason === 'abort',
    unitsPerMsAfter: r.stats.unitsPerMsAfter,
    iterFitRemainders: r.stats.iterFitRemainders ?? 0,
    iterFitPublished: r.stats.iterFitPublished ?? 0,
    endKey: r.endKey,
    source: r.source,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
}

function summarise(arm: string, rows: readonly Row[]): Record<string, number | string> {
  const mine = rows.filter(r => r.arm === arm);
  return {
    arm,
    n: mine.length,
    meanRung: Math.round(mean(mine.map(r => r.rung))),
    meanWork: Math.round(mean(mine.map(r => r.work))),
    usedPct: +(mean(mine.map(r => r.usedFrac)) * 100).toFixed(1),
    meanMs: Math.round(mean(mine.map(r => r.elapsedMs))),
    maxMs: Math.max(...mine.map(r => r.elapsedMs)),
    meanCompletedIters: +mean(mine.map(r => r.completedIters)).toFixed(2),
    meanRootReplies: +mean(mine.map(r => r.rootRepliesSearched)).toFixed(1),
    abortPct: +((100 * mine.filter(r => r.aborted).length) / (mine.length || 1)).toFixed(1),
    remainderRuns: mine.filter(r => r.iterFitRemainders > 0).length,
    published: mine.filter(r => r.iterFitPublished > 0).length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string): string => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const out = flag('--out', '');
  const fixtures = flag('--fixtures', '');
  const limit = Number(flag('--positions', '20'));
  const warmup = Number(flag('--warmup', '3'));
  const arms = ['hard@desktop', 'hard@ablate:search-iter-fit'];

  const targets = devTurn6Targets(limit);
  console.log(`positions: ${targets.length}, arms: ${arms.join(', ')}, warmup: ${warmup}`);

  if (fixtures !== '') {
    fs.mkdirSync(fixtures, { recursive: true });
    for (const t of targets.slice(0, 2)) {
      const file = path.join(fixtures, `e4-iter-fit-${t.openingId}-t${TURN_NUMBER}.json`);
      fs.writeFileSync(file, `${JSON.stringify({ id: t.id, openingId: t.openingId, side: t.side, options: t.options, state: t.state }, null, 1)}\n`);
      console.log(`fixture -> ${file}`);
    }
  }

  const rows: Row[] = [];
  for (const t of targets) {
    for (const arm of arms) {
      const row = await withMatchRules(t.options, async () => measure(arm, t, warmup));
      rows.push(row);
      console.log(
        `${arm.padEnd(28)} ${t.id.padEnd(30)} rung=${row.rung} work=${row.work} ms=${row.elapsedMs} ` +
          `iters=${row.completedIters} replies=${row.rootRepliesSearched} ${row.stopReason} ` +
          `rem=${row.iterFitRemainders} pub=${row.iterFitPublished} end=${row.endKey.slice(0, 8)}`,
      );
    }
  }

  const byPosition = targets.map(t => {
    const a = rows.find(r => r.arm === arms[0] && r.positionId === t.id);
    const b = rows.find(r => r.arm === arms[1] && r.positionId === t.id);
    return {
      positionId: t.id,
      baseIters: a?.completedIters ?? -1,
      armIters: b?.completedIters ?? -1,
      baseReplies: a?.rootRepliesSearched ?? -1,
      armReplies: b?.rootRepliesSearched ?? -1,
      turnChanged: a !== undefined && b !== undefined && a.endKey !== b.endKey,
      published: (b?.iterFitPublished ?? 0) > 0,
    };
  });
  const summary = arms.map(a => summarise(a, rows));
  for (const s of summary) console.log(JSON.stringify(s));
  console.log(`principal turn changed on ${byPosition.filter(x => x.turnChanged).length} of ${byPosition.length}`);

  if (out !== '') {
    fs.mkdirSync(out, { recursive: true });
    const artifact = {
      schema: 'muju-e4-iter-fit-probe-v1',
      allowanceMs: ALLOWANCE_MS,
      turnNumber: TURN_NUMBER,
      warmup,
      arms,
      positions: targets.map(t => ({ id: t.id, openingId: t.openingId, side: t.side })),
      summary,
      byPosition,
      rows,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(out, 'probe.json'), `${JSON.stringify(artifact, null, 1)}\n`);
    console.log(`-> ${path.join(out, 'probe.json')}`);
  }
}

void main();
