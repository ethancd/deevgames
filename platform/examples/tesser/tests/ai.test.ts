// Stage B lab gates — SPEC.md §3 Stage B, mirroring pebble-duel's
// integration-test discipline: fixed seeds, deterministic series, and a
// committed REPORT.md regenerated on every run (byte-identical, no
// timestamps; drift shows up as a git diff).
//
// Gates:
//   1. Sensitivity: greedyBot (over def.score) beats randomBot, 100 games,
//      95% Wilson CI excludes 0.5.
//   2. Strength ladder: tesserMinimaxBot (depth 3, node-capped) beats
//      greedyBot, 60 games, CI lower bound > 0.5.
//   3. Conservation invariant wired into every runSeries call: total measure
//      never increases within a game, every piece 1 <= measure <= volume,
//      footprints in bounds and pairwise disjoint. Zero violations.
//   4. First-mover measurement: minimax vs minimax, equal budget, 60 games,
//      seat rotation on — RECORDED in REPORT.md, not gated (V1 balance
//      target comes later).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@deev/core';
import {
  runSeries,
  randomBot,
  greedyBot,
  matchupReport,
  wilson,
  fmtCI,
  type SeriesResult,
} from '@deev/lab';
import {
  tesser,
  footprintCells,
  totalMeasure,
  volume,
  BOARD_W,
  BOARD_H,
  type Piece,
  type TesserState,
} from '../src/game.ts';
import { tesserEval } from '../src/eval.ts';
import { tesserMinimaxBot, orderTesserMoves, TESSER_MINIMAX_BUDGET } from '../src/bots.ts';

const here = dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------------------------
// Gate 3: the conservation invariant, as a runSeries per-state invariant.
// runSeries checks invariants on the initial state and after every apply;
// `ply === 0` marks a fresh game, resetting the running total so one
// invariant instance serves a whole series.
function conservationInvariant(): (s: TesserState) => void {
  let prevTotal = Infinity;
  return (s: TesserState) => {
    if (s.ply === 0) prevTotal = Infinity;
    const total = totalMeasure(s, 'south') + totalMeasure(s, 'north');
    if (total > prevTotal) {
      throw new Error(`conservation violated: total measure rose ${prevTotal} -> ${total}`);
    }
    prevTotal = total;
    if (total > 36) throw new Error(`total measure ${total} exceeds the default-config 36`);
    const seen = new Set<string>();
    for (const p of s.pieces) {
      if (p.measure < 1 || p.measure > volume(p)) {
        throw new Error(`piece ${p.id}: measure ${p.measure} outside 1..volume(${volume(p)})`);
      }
      for (const c of footprintCells(p)) {
        if (c.x < 0 || c.x >= BOARD_W || c.y < 0 || c.y >= BOARD_H) {
          throw new Error(`piece ${p.id}: cell (${c.x},${c.y}) off board`);
        }
        const key = `${c.x},${c.y}`;
        if (seen.has(key)) throw new Error(`overlapping footprints at (${c.x},${c.y})`);
        seen.add(key);
      }
    }
  };
}

// Series results shared with the REPORT.md writer (vitest runs the tests in
// this file sequentially, in order).
let sensitivitySeries: SeriesResult | undefined;
let ladderSeries: SeriesResult | undefined;
let firstMoverSeries: SeriesResult | undefined;

describe('gate 1 — sensitivity: greedy vs random', () => {
  it(
    'greedy (over def.score) beats random over 100 seeded games; CI excludes 0.5; report byte-identical across runs',
    async () => {
      const run = () =>
        runSeries({
          game: tesser,
          config: {},
          bots: [greedyBot(tesser), randomBot()],
          games: 100,
          seedStart: 5000,
          invariants: [conservationInvariant()],
        });
      const series1 = await run();
      const series2 = await run();

      const tally = series1.byBot['Greedy'];
      const ci = wilson(tally.wins, tally.wins + tally.losses + tally.draws);
      expect(ci.lo).toBeGreaterThan(0.5);
      expect(series1.invariantViolations).toBe(0);

      // Byte-identical determinism gate (the pebble-duel pattern).
      expect(matchupReport(series1)).toEqual(matchupReport(series2));

      sensitivitySeries = series1;
    },
    120_000,
  );
});

describe('gate 2 — strength ladder: minimax vs greedy', () => {
  it(
    'tesserMinimaxBot (depth 3, node-capped) beats greedy over 60 games with CI lower bound > 0.5',
    async () => {
      const bot = tesserMinimaxBot();
      const series = await runSeries({
        game: tesser,
        config: {},
        bots: [bot, greedyBot(tesser)],
        games: 60,
        seedStart: 6000,
        invariants: [conservationInvariant()],
      });

      const tally = series.byBot['tesser-minimax'];
      const ci = wilson(tally.wins, tally.wins + tally.losses + tally.draws);
      expect(ci.lo).toBeGreaterThan(0.5);
      expect(series.invariantViolations).toBe(0);
      expect(bot.lastSearch?.algorithm).toBe('minimax');
      expect(bot.lastSearch?.depthReached).toBe(3);

      ladderSeries = series;
    },
    300_000,
  );
});

describe('gate 4 — first-mover measurement: minimax vs minimax', () => {
  it(
    'equal-budget mirror match over 60 games with seat rotation; result recorded, not gated',
    async () => {
      const series = await runSeries({
        game: tesser,
        config: {},
        bots: [
          tesserMinimaxBot(TESSER_MINIMAX_BUDGET, 'tesser-minimax-A'),
          tesserMinimaxBot(TESSER_MINIMAX_BUDGET, 'tesser-minimax-B'),
        ],
        games: 60,
        seedStart: 7000,
        seatRotation: true,
        invariants: [conservationInvariant()],
      });

      expect(series.records).toHaveLength(60);
      expect(series.invariantViolations).toBe(0);
      // No 45-55% gate yet — the number is recorded in REPORT.md.

      firstMoverSeries = series;
    },
    300_000,
  );
});

describe('stage B units', () => {
  it('orderTesserMoves: attacks first, then folds, then moves by distance descending, pass last', () => {
    const state = tesser.init({}, mulberry32(1));
    const legal = tesser.legal(state, 'south');
    const ordered = orderTesserMoves(legal.slice(), state, 'south');
    const rank = (t: 'attack' | 'fold' | 'move' | 'pass') =>
      ({ attack: 0, fold: 1, move: 2, pass: 3 })[t];
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1];
      const b = ordered[i];
      expect(rank(a.type)).toBeLessThanOrEqual(rank(b.type));
      if (a.type === 'move' && b.type === 'move') expect(a.steps).toBeGreaterThanOrEqual(b.steps);
    }
    expect(ordered).toHaveLength(legal.length);
    expect(ordered[ordered.length - 1].type).toBe('pass');
  });

  it('tesserEval.explain sums to the eval value and measure-diff dominates', () => {
    const state = tesser.init({ pieces: explainSamplePieces() }, mulberry32(1));
    const entries = tesserEval.explain(state, 'south');
    const total = entries.reduce((sum, e) => sum + e.weighted, 0);
    expect(total).toBeCloseTo(tesserEval(state, 'south'), 10);
    expect(entries.map((e) => e.name)).toEqual(['measure-diff', 'mobility', 'threat', 'advance']);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    expect(byName['measure-diff'].raw).toBe(6); // 18 vs 12
    expect(Math.abs(byName['measure-diff'].weighted)).toBeGreaterThan(
      Math.abs(byName['mobility'].weighted) +
        Math.abs(byName['threat'].weighted) +
        Math.abs(byName['advance'].weighted),
    );
    // Anti-symmetry: every factor is a mine-minus-theirs difference.
    expect(tesserEval(state, 'north')).toBeCloseTo(-tesserEval(state, 'south'), 10);
  });
});

// --------------------------------------------------------------------------
// REPORT.md — regenerated on every run, byte-identical (fixed seeds, no
// timestamps). Committed at the package root; drift shows as a git diff.

/** Asymmetric mid-game position for the REPORT's .explain() sample: south up
 * 18-12 with a wounded north shield (measure 4 in a 3x2x1 box). */
function explainSamplePieces(): Piece[] {
  return [
    { id: 'S-keep', seat: 'south', x: 2, y: 3, w: 2, d: 2, h: 2, measure: 8 },
    { id: 'S-lance', seat: 'south', x: 0, y: 4, w: 1, d: 4, h: 1, measure: 4 },
    { id: 'S-shield', seat: 'south', x: 3, y: 6, w: 3, d: 2, h: 1, measure: 6 },
    { id: 'N-shield', seat: 'north', x: 2, y: 1, w: 3, d: 2, h: 1, measure: 4 },
    { id: 'N-keep', seat: 'north', x: 0, y: 0, w: 2, d: 2, h: 2, measure: 8 },
  ];
}

function section(title: string, series: SeriesResult): string {
  const table = matchupReport(series).replace('# Matchup Report\n\n', '');
  return `## ${title}\n\n${table}`;
}

describe('REPORT.md', () => {
  it('regenerates the committed report from the gate series', () => {
    expect(sensitivitySeries).toBeDefined();
    expect(ladderSeries).toBeDefined();
    expect(firstMoverSeries).toBeDefined();

    const fm = firstMoverSeries!;
    const southWins = fm.records.filter((r) => r.result.winner === 'south').length;
    const northWins = fm.records.filter((r) => r.result.winner === 'north').length;
    const draws = fm.records.length - southWins - northWins;
    const southCI = wilson(southWins, fm.records.length);

    const state = tesser.init({ pieces: explainSamplePieces() }, mulberry32(1));
    const entries = tesserEval.explain(state, 'south');
    const evalTotal = entries.reduce((sum, e) => sum + e.weighted, 0);
    const explainRows = entries
      .map((e) => `| ${e.name} | ${e.raw.toFixed(3)} | ${e.weighted.toFixed(3)} |`)
      .join('\n');

    const budget = `depth ${TESSER_MINIMAX_BUDGET.depth}, maxNodes ${TESSER_MINIMAX_BUDGET.maxNodes}`;

    const report = `# TESSER Stage B Lab Report

Generated by \`tests/ai.test.ts\` on every test run. Deterministic by
construction — fixed seeds, no timestamps — so this file is byte-identical
across runs; any drift is a real change and shows up as a git diff.

Minimax budget for every minimax series below: **${budget}** (hard node cap
per choose() call). A full depth-3 search from the opening costs ~62k nodes,
far too slow for 60-game series inside the vitest suite budget, so the cap
does the throttling (per SPEC: reduce per-move budget, never game count).
Transposition table on; move ordering: attacks, then folds, then moves by
distance descending.

${section('Gate 1 — sensitivity: Greedy vs Random (100 games)', sensitivitySeries!)}
${section('Gate 2 — strength ladder: minimax vs Greedy (60 games)', ladderSeries!)}
${section('Gate 4 — first-mover: minimax vs minimax (equal budget, 60 games, seat rotation on)', fm)}
First mover (south seat): ${southWins} wins / ${northWins} losses / ${draws} draws — win rate ${fmtCI(southCI)}.
Recorded only (V1 balance target is tuned later; no 45-55% gate yet). Note:
tesser is deterministic and both bots are seed-independent at equal budget,
so every game in this series is the same mirror game replayed — the effective
sample is one unique game, not 60 independent trials.

## Gate 3 — conservation invariant

Wired as a \`runSeries\` invariant on every series above: total measure never
increases within a game, every piece keeps 1 <= measure <= volume, and all
footprints stay in bounds and pairwise disjoint. Violations across all
series: ${sensitivitySeries!.invariantViolations + ladderSeries!.invariantViolations + fm.invariantViolations}.

## Eval sample — tesserEval.explain(state, 'south')

Position: south S-keep 2x2x2 at (2,3) m8, S-lance 1x4x1 at (0,4) m4, S-shield
3x2x1 at (3,6) m6; north N-shield 3x2x1 at (2,1) wounded m4, N-keep 2x2x2 at
(0,0) m8. South to act.

| factor | raw | weighted |
| --- | --- | --- |
${explainRows}

Total: ${evalTotal.toFixed(3)}
`;

    writeFileSync(join(here, '../REPORT.md'), report);
  });
});
