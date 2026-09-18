// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  forecastCampaign,
  forecastRun,
  formatTable,
  handicapOf,
  measuredOverheadPerGame,
  percentile,
  type ForecastGame,
  type PilotManifest,
} from '../../lab/hard-ai/ladder/forecast';

/**
 * The campaign forecast (EPIC-PLAN 2026-09-16 §6):
 *   2 × pairs × meanGameSeconds / concurrentGameWorkers, plus measured overhead,
 * per handicap, for the typical (mean) and the slow (p90) game.
 *
 * Synthetic games only — the arithmetic is the thing under test, and a pilot
 * run of real games would take minutes and could not pin an exact number.
 */

const TEST_TIMEOUT_MS = 10_000; // pure arithmetic and small temp files

/** One synthetic pilot game: a start time, a duration, a handicap. */
function game(startedAtMs: number, seconds: number, handicap: number): ForecastGame {
  return { startedAt: new Date(startedAtMs).toISOString(), durationMs: seconds * 1000, handicap };
}

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);

describe('forecast arithmetic', () => {
  it('nearest-rank percentile picks a real observation, never an interpolation', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.9)).toBe(9);
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([], 0.9)).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('reads the handicap from a v3 record and falls back to the v2 options field', () => {
    expect(handicapOf({ startedAt: '', durationMs: 0, handicap: 3 })).toBe(3);
    expect(handicapOf({ startedAt: '', durationMs: 0, options: { blackCrystalHandicap: 5 } })).toBe(5);
    expect(handicapOf({ startedAt: '', durationMs: 0 })).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('applies §6 formula per handicap for the typical and the slow game', () => {
    // Handicap 0: four games of 10 s each -> mean 10 s, p90 10 s.
    // Handicap 3: 10, 10, 10, 40 -> mean 17.5 s, p90 40 s.
    const games: ForecastGame[] = [
      game(T0, 10, 0), game(T0, 10, 0), game(T0, 10, 0), game(T0, 10, 0),
      game(T0, 10, 3), game(T0, 10, 3), game(T0, 10, 3), game(T0, 40, 3),
    ];
    const f = forecastCampaign(games, { shards: 1 }, { pairsPerHandicap: 50, workers: 2, overheadSecondsPerGame: 0 });
    expect(f.handicaps.map(h => h.handicap)).toEqual([0, 3]);
    expect(f.handicaps[0].meanGameSeconds).toBe(10);
    expect(f.handicaps[1].meanGameSeconds).toBe(17.5);
    expect(f.handicaps[1].p90GameSeconds).toBe(40);
    // 2 x 50 pairs = 100 games at 10 s on 2 workers = 500 s.
    expect(f.handicaps[0].plannedGames).toBe(100);
    expect(f.handicaps[0].typicalSeconds).toBeCloseTo(500, 6);
    expect(f.handicaps[1].typicalSeconds).toBeCloseTo(875, 6);
    expect(f.handicaps[1].slowSeconds).toBeCloseTo(2000, 6);
    // §6's worked example: 50 pairs per handicap across two handicaps is 200 games.
    expect(f.totalPlannedGames).toBe(200);
    expect(f.totalTypicalSeconds).toBeCloseTo(1375, 6);
    expect(f.totalSlowSeconds).toBeCloseTo(2500, 6);
  }, TEST_TIMEOUT_MS);

  it('halves the estimate when the worker count doubles', () => {
    const games = [game(T0, 10, 0), game(T0, 10, 0)];
    const opts = { pairsPerHandicap: 10, overheadSecondsPerGame: 0 };
    const two = forecastCampaign(games, {}, { ...opts, workers: 2 });
    const four = forecastCampaign(games, {}, { ...opts, workers: 4 });
    expect(two.totalTypicalSeconds).toBeCloseTo(2 * four.totalTypicalSeconds, 6);
  }, TEST_TIMEOUT_MS);

  it('adds the overhead per planned game, not per pilot game', () => {
    const games = [game(T0, 10, 0), game(T0, 10, 0)];
    const f = forecastCampaign(games, {}, { pairsPerHandicap: 5, workers: 1, overheadSecondsPerGame: 2 });
    // 10 games x 10 s + 10 games x 2 s, all on one worker.
    expect(f.handicaps[0].typicalSeconds).toBeCloseTo(120, 6);
    expect(f.overheadSource).toBe('override');
  }, TEST_TIMEOUT_MS);

  it('measures overhead as the pilot wall clock its games cannot account for', () => {
    // Two 10 s games on two shards: 10 s of play; the run took 13 s -> 3 s of
    // overhead over 2 games = 1.5 s per game.
    const games = [game(T0, 10, 0), game(T0, 10, 0)];
    const manifest: PilotManifest = { shards: 2, at: new Date(T0).toISOString(), finishedAt: new Date(T0 + 13_000).toISOString() };
    expect(measuredOverheadPerGame(games, manifest)).toBeCloseTo(1.5, 6);
    const f = forecastCampaign(games, manifest, { pairsPerHandicap: 1, workers: 1 });
    expect(f.overheadSource).toBe('measured');
    expect(f.handicaps[0].typicalSeconds).toBeCloseTo(2 * 10 + 2 * 1.5, 6);
  }, TEST_TIMEOUT_MS);

  /**
   * `ladder/run.ts` writes `manifest.at` BEFORE the first game and stamps
   * `finishedAt` at the end. Measuring the run against `at` made the residual
   * negative on every real run, so both E0 pilot forecasts booked zero overhead
   * and called it `unavailable` (E0-PILOT-REPORT §7 P3).
   */
  it('measures the run against finishedAt, never against the start time in `at`', () => {
    const games = [game(T0, 10, 0), game(T0, 10, 0)];
    const start = new Date(T0 - 2_000).toISOString();
    const measured = measuredOverheadPerGame(games, { shards: 2, at: start, finishedAt: new Date(T0 + 13_000).toISOString() });
    expect(measured).toBeCloseTo(1.5, 6);
    // The same manifest with only the start time available says nothing.
    expect(measuredOverheadPerGame(games, { shards: 2, at: start })).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('reports overhead as unavailable rather than inventing one', () => {
    const games = [game(T0, 10, 0)];
    expect(measuredOverheadPerGame(games, {})).toBeNull(); // no manifest.finishedAt
    expect(measuredOverheadPerGame(games, { at: new Date(T0 + 13_000).toISOString() })).toBeNull(); // a start time is not an end time
    expect(measuredOverheadPerGame(games, { finishedAt: null })).toBeNull(); // a run that never finished
    expect(measuredOverheadPerGame([], { finishedAt: new Date(T0).toISOString() })).toBeNull();
    // A manifest timestamp before the play it contains cannot yield an overhead.
    expect(measuredOverheadPerGame(games, { shards: 1, finishedAt: new Date(T0 + 1_000).toISOString() })).toBeNull();
    const f = forecastCampaign(games, {}, { pairsPerHandicap: 1, workers: 1 });
    expect(f.overheadSource).toBe('unavailable');
    expect(f.overheadSecondsPerGame).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('rejects a nonsense plan instead of forecasting from it', () => {
    const games = [game(T0, 10, 0)];
    expect(() => forecastCampaign(games, {}, { pairsPerHandicap: 0 })).toThrow(/positive integer/);
    expect(() => forecastCampaign(games, {}, { pairsPerHandicap: 2.5 })).toThrow(/positive integer/);
    expect(() => forecastCampaign(games, {}, { pairsPerHandicap: 2, workers: 0 })).toThrow(/workers/);
    expect(() => forecastCampaign([], {}, { pairsPerHandicap: 2 })).toThrow(/no games/);
  }, TEST_TIMEOUT_MS);
});

describe('forecast from a run directory', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-forecast-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeRun(games: ForecastGame[], manifest: PilotManifest): void {
    fs.writeFileSync(path.join(dir, 'games.jsonl'), games.map(g => JSON.stringify(g)).join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  it('reads a completed run\'s games.jsonl and manifest.json', () => {
    writeRun(
      [game(T0, 12, 0), game(T0 + 1_000, 8, 0), game(T0, 30, 3), game(T0, 10, 3)],
      {
        a: 'hard@lab', b: 'aiv2-hard', work: 'wall:1000', shards: 2, device: 'Apple M2 Max x12 (darwin/arm64)',
        at: new Date(T0).toISOString(), finishedAt: new Date(T0 + 40_000).toISOString(),
      },
    );
    const f = forecastRun(dir, { pairsPerHandicap: 2, workers: 2 });
    expect(f.a).toBe('hard@lab');
    expect(f.b).toBe('aiv2-hard');
    expect(f.work).toBe('wall:1000');
    expect(f.pilotGames).toBe(4);
    expect(f.pilotShards).toBe(2);
    expect(f.handicaps.map(h => h.handicap)).toEqual([0, 3]);
    expect(f.handicaps[0].meanGameSeconds).toBe(10);
    expect(f.handicaps[0].pilotGames).toBe(2);
    expect(f.handicaps[1].meanGameSeconds).toBe(20);
    expect(f.totalPlannedGames).toBe(8);
    expect(f.overheadSource).toBe('measured');
    const table = formatTable(f);
    expect(table).toContain('hard@lab vs aiv2-hard');
    expect(table).toContain('2 pairs per handicap on 2 concurrent game worker(s) = 8 games');
    expect(table.split('\n').filter(l => /^ *\d+ \| /.test(l))).toHaveLength(2); // one row per handicap
  }, TEST_TIMEOUT_MS);

  it('says which directory is not a completed run', () => {
    expect(() => forecastRun(dir, { pairsPerHandicap: 2 })).toThrow(/no games\.jsonl/);
  }, TEST_TIMEOUT_MS);

  it('forecasts without a manifest, marking the overhead unavailable', () => {
    fs.writeFileSync(path.join(dir, 'games.jsonl'), [game(T0, 5, 0), game(T0, 15, 0)].map(g => JSON.stringify(g)).join('\n'));
    const f = forecastRun(dir, { pairsPerHandicap: 3, workers: 2 });
    expect(f.a).toBe('unknown');
    expect(f.overheadSource).toBe('unavailable');
    expect(f.handicaps[0].typicalSeconds).toBeCloseTo((6 * 10) / 2, 6);
  }, TEST_TIMEOUT_MS);
});
