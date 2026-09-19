/**
 * `node --import tsx lab/hard-ai/bench/pace-allowance.ts [--allowances 10000,30000,60000]`
 *
 * DOES A LONGER TURN ALLOWANCE BUY A LONGER SEARCH? The turn paces
 * (`src/ai/turnTime.ts`) let a player fund a Hard turn with 10 s, 30 s or 60 s,
 * and the game page draws a stopwatch that runs while the seat thinks. A rung
 * that stops rising makes that stopwatch a lie, which is exactly what the
 * ladder did before it was extended: its top of 3,200,000 units is ~5.3 s on a
 * ~600 units/ms box, so every allowance above ~5 s bought the same search (the
 * E6 release measured a mean turn of 4.9 s inside an 8,000 ms allowance).
 *
 * This is the evidence for the extension, per position and per allowance: the
 * rung chosen, the work spent, the ELAPSED milliseconds, the depth completed,
 * the macro nodes searched and the transposition table the rung was given. It
 * is a DIAGNOSTIC, not a gate — nothing imports it, it takes no heavy slot, and
 * it changes no engine behaviour.
 *
 * WALL MODE, WARMED. The rung is `chooseWork(profile, targetMs)` and the
 * profile is what the engine has measured of this box; a cold engine sits at
 * `INITIAL_UNITS_PER_MS` = 200 and would report the rung a first turn gets
 * rather than the one a game settles on. Each position therefore gets its own
 * engine, warmed with `--warmup` short searches (3,000 ms, the profile's own
 * `baseMs`) before the measured ones, and the allowances are then measured in
 * ascending order on that same engine — which is also the order a player moving
 * the pace slider upward would produce. `unitsPerMsBefore` is printed next to
 * every row, so a row whose rung looks wrong can be checked against the
 * throughput it was chosen from.
 *
 * THE POSITIONS are mid-game turns of a recorded E1 ladder game, reconstructed
 * through the canonical engine by `analyze/replay.ts` and searched inside that
 * game's own `withMatchRules` — the same resolution `analyze/work-sweep.ts` and
 * `bench/arm-probe.ts` use, so a number here can be compared with one of
 * theirs. Mid-game and not opening, because that is where the candidate list is
 * widest and a bigger rung has somewhere to go.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HardEngine } from '../../../src/ai/hard/engine';
import { ttBitsForRung } from '../../../src/ai/hard/search/time';
import { loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import type { MatchOptions } from '../../harness/types';
import type { GameState, PlayerId } from '../../../src/game/types';

const REPO = path.resolve(import.meta.dirname, '../../..');

/** Warmup searches are funded at the DESKTOP profile's own `baseMs`. */
const WARMUP_MS = 3000;

const DEFAULT_REPLAY = 'lab/results/hard-ai-e1/e1.1-diag/replays/g2-s20_3_15-A-white.json';

interface Target {
  id: string;
  state: GameState;
  options: MatchOptions;
}

function loadTargets(file: string, side: PlayerId, turnNumbers: readonly number[]): Target[] {
  const replay = loadReplay(path.isAbsolute(file) ? file : path.join(REPO, file));
  return withMatchRules(replay.options, () => {
    const turns = reconstruct(replay).bySide[side];
    return turnNumbers.map(turnNumber => {
      const turn = turns.find(t => t.turnNumber === turnNumber);
      if (turn === undefined) throw new Error(`pace-allowance: ${side} t${turnNumber} is not in ${file}`);
      return { id: `${path.basename(file, '.json')}:${side}-t${turnNumber}`, state: turn.startState, options: replay.options };
    });
  });
}

interface Row {
  positionId: string;
  allowanceMs: number;
  rung: number;
  work: number;
  elapsedMs: number;
  usedPct: number;
  depth: number;
  nodes: number;
  qnodes: number;
  ttBits: number;
  ttProbes: number;
  ttHits: number;
  stopReason: string;
  /** `search/root.ts RootSource`, and the actions it handed back: a row that
   * ran out of clock must still publish a canonically verified turn rather than
   * ending the phase, so the row says which it did. */
  source: string;
  actions: number;
  fallback: string | null;
  unitsPerMsBefore: number;
  unitsPerMsAfter: number;
  endKey: string;
}

/**
 * One search, wall-funded at `allowanceMs` (`--allowances`) or, when `work` is
 * given (`--fixed`), at that rung with no clock read at all.
 *
 * THE FIXED-WORK ROWS ARE THE FAST-BOX ROWS. The rung a wall-funded turn picks
 * is `unitsPerMs × targetMs`, so a box slower than DESIGN §6.3's reference
 * desktop (600 units/ms) never selects the rungs the extension added: measured
 * through tsx on an M2 Max under vitest load this file reports ~60-80
 * units/ms, at which even 60 s asks for only ~4.2e6 units. A fixed-work row
 * runs the rung a 600 units/ms box WOULD select and reports what it costs and
 * what it buys, which is the only way to show on this box that the new rungs
 * are spendable rather than merely selectable.
 */
async function measure(engine: HardEngine, t: Target, allowanceMs: number, work?: number): Promise<Row> {
  const startedAt = Date.now();
  const r = await engine.searchTurn(
    t.state,
    work === undefined ? { targetMs: allowanceMs, deadlineMs: allowanceMs } : { work },
  );
  // Fixed-work mode reads no clock, so `stats.elapsedMs` is 0 there: the caller
  // times the call instead, exactly as `lab/hard-ai/bots/hard.ts` does.
  if (work !== undefined) r.stats.elapsedMs = Date.now() - startedAt;
  return {
    positionId: t.id,
    allowanceMs,
    rung: r.stats.rung,
    work: r.work,
    elapsedMs: Math.round(r.stats.elapsedMs),
    usedPct: allowanceMs > 0 ? +((100 * r.stats.elapsedMs) / allowanceMs).toFixed(1) : 0,
    depth: r.depth,
    nodes: r.stats.nodes,
    qnodes: r.stats.qnodes,
    ttBits: ttBitsForRung(engine.config.ttBitsMacro, r.stats.rung),
    ttProbes: r.stats.ttProbes,
    ttHits: r.stats.ttHits,
    stopReason: r.stats.stopReason,
    source: r.source,
    actions: r.actions.length,
    fallback: r.fallback ?? null,
    unitsPerMsBefore: r.stats.unitsPerMsBefore,
    unitsPerMsAfter: r.stats.unitsPerMsAfter,
    endKey: r.endKey,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string): string => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const allowances = flag('--allowances', '10000,30000,60000').split(',').map(Number);
  const replayFile = flag('--replay', DEFAULT_REPLAY);
  const side = flag('--side', 'white') as PlayerId;
  const turnNumbers = flag('--turns', '12,16,20').split(',').map(Number);
  const warmup = Number(flag('--warmup', '1'));
  const fixed = flag('--fixed', '') === '' ? [] : flag('--fixed', '').split(',').map(Number);
  // `--units-per-ms` SEEDS the device profile instead of measuring it, so the
  // rung a box of that speed would pick can be exercised on a box of another
  // speed. DESIGN §6.3's desktop row is 600; this file's own box measures
  // ~50-80 through tsx. A seeded profile makes the row honest about what it
  // is: the engine picks the reference box's rung and the watchdog then has to
  // do the work the profile would otherwise have done.
  const unitsPerMs = Number(flag('--units-per-ms', '0'));
  const out = flag('--out', '');

  const targets = loadTargets(replayFile, side, turnNumbers);
  const rows: Row[] = [];
  for (const t of targets) {
    // One engine per position, so the profile it warms up is measured on the
    // position it then searches.
    const engine = new HardEngine(unitsPerMs > 0 ? { profile: { unitsPerMs, samples: 8 } } : undefined);
    for (let i = 0; i < warmup; i++) {
      await withMatchRules(t.options, async () => engine.searchTurn(t.state, { targetMs: WARMUP_MS, deadlineMs: WARMUP_MS }));
    }
    const say = (row: Row, label: string): void => {
      rows.push(row);
      console.log(
        `${row.positionId} ${label}: rung ${row.rung} work ${row.work} elapsed ${row.elapsedMs} ms ` +
          `(${row.usedPct}%) depth ${row.depth} nodes ${row.nodes} q ${row.qnodes} tt 2^${row.ttBits} ` +
          `(${row.ttHits}/${row.ttProbes}) ${row.stopReason} ${row.source}/${row.actions} actions` +
          `${row.fallback === null ? '' : ` FALLBACK ${row.fallback}`} ${row.unitsPerMsBefore}→${row.unitsPerMsAfter} u/ms ${row.endKey}`,
      );
    };
    for (const allowanceMs of allowances) {
      say(await withMatchRules(t.options, async () => measure(engine, t, allowanceMs)), `@${allowanceMs} ms`);
    }
    for (const work of fixed) {
      say(await withMatchRules(t.options, async () => measure(engine, t, 0, work)), `fixed:${work}`);
    }
  }

  const text = `${JSON.stringify({ allowances, fixed, warmupMs: WARMUP_MS, rows }, null, 1)}\n`;
  if (out === '') process.stdout.write(text);
  else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`wrote ${out}`);
  }
}

void main();
