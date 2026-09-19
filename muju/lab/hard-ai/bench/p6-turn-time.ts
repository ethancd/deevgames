/**
 * `node --import tsx lab/hard-ai/bench/p6-turn-time.ts --replay <file> --side <white|black> ...`
 *
 * P6's reproduction harness for the E1 turn-time explosion
 * (`docs/hard-ai/e1/P6-TURN-TIME-EXPLOSION.md`): two games of the
 * `hard@ablate:k96` vs `hard@desktop` equal-time row show consecutive turns of
 * 20-180 s for BOTH seats against a `wall:3000` allowance, where every other
 * turn in the row is under 3.1 s.
 *
 * It is a DIAGNOSTIC, not a gate. Nothing here is imported by the engine, the
 * ladder or a gate runner, and it changes no engine behaviour: it reconstructs
 * a recorded position with `analyze/replay.ts` and then times the engine's own
 * public pieces around it.
 *
 * It does NOT take a heavy slot. Every mode is a single short measured search
 * (or a bounded sweep of them) run one at a time by hand; a run that wants to
 * be comparable against a ladder number should take a slot itself.
 *
 * THREE MODES, answering three different questions.
 *
 *   `--mode one` — WHERE DO THE SECONDS GO on one turn. Times the phases
 *     `HardEngine.searchTurn` runs in order and that a caller can separate from
 *     outside: `Replica.pack`, `buildTables` (the level-2 tables), the book
 *     probe, `targetMs`/`chooseWork`, a root `TurnGenerator.generate` at the
 *     engine's own `gen` config and the rung the engine would have picked, and
 *     then the whole `searchTurn` itself. The generator is run through a real
 *     `WorkMeter` at that rung, which is what `search/root.ts` gives it, so the
 *     number is the engine's root generation and not an unbounded one.
 *
 *   `--mode rung` — HOW ROOT GENERATION SCALES WITH THE RUNG. The same root
 *     generation at each `WORK_LADDER` rung between `--rung-from` and
 *     `--rung-to` (which defaults to the ladder's pre-turn-pace top of
 *     3,200,000, so an invocation written before the paces sweeps exactly the
 *     rungs it always did — see `Args.rungTo`). This is the
 *     measurement that decides whether a phase the deadline cannot interrupt
 *     can reach 170 s at a rung the engine can actually pick: `generateAt`
 *     (`search/pvs.ts`) polls `s.meter.exhausted()` and NEVER `s.stop()`.
 *
 *   `--mode sweep` — DOES THE GAME REPRODUCE IT. Replays one seat's turns
 *     through ONE engine in wall mode at `--wall`, in order, so the device
 *     profile evolves exactly as it did in the recorded game (`searchTurn`
 *     writes `config.profile` back after every measured search). Reports the
 *     rung, the profile, the measured elapsed and `stopReason` per turn next to
 *     the recorded `turnMs`. `--from`/`--to` bound the cost.
 *
 * The engine under test is `--engine <label>` resolved through
 * `bots/hard.ts hardEnginePatch`, so `hard@desktop` and `hard@ablate:k96` are
 * exactly the configurations the ladder row ran, weights included.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadReplay, reconstruct, withMatchRules } from '../analyze/replay';
import { hardEnginePatch } from '../bots/hard';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { HardConfig } from '../../../src/ai/hard/config';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { TurnGenerator, newGenStats, outCapacityFor, type GenStats } from '../../../src/ai/hard/gen/generate';
import { WORK_LADDER, WorkClass, WorkMeter, chooseWork, now, targetMs } from '../../../src/ai/hard/search/time';
import { DEAD, MAX_SLOTS, Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GameState, PlayerId } from '../../../src/game/types';

const POOL_CAPACITY = 8192;

interface Args {
  replay: string;
  side: PlayerId;
  turnIndex: number;
  engine: string;
  mode: 'one' | 'rung' | 'sweep';
  wall: number;
  from: number;
  to: number;
  rungFrom: number;
  /**
   * The top of `--mode rung`'s sweep, defaulting to the ladder's PRE-PACE top
   * (3,200,000). `search/time.ts WORK_LADDER` now runs to 51,200,000 for the
   * turn paces, and root generation at that rung is minutes of unmetered work
   * per position — a measurement to ask for, not one an invocation written
   * before the paces should inherit.
   */
  rungTo: number;
  dumpState: string | null;
  phases: 'gen' | 'search' | 'both';
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    replay: '',
    side: 'black',
    turnIndex: 19,
    engine: 'desktop',
    mode: 'one',
    wall: 3000,
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    rungFrom: 0,
    rungTo: 3.2e6,
    dumpState: null,
    phases: 'both',
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--replay': a.replay = v; i++; break;
      case '--side': a.side = v as PlayerId; i++; break;
      case '--turn-index': a.turnIndex = Number(v); i++; break;
      case '--engine': a.engine = v.replace(/^hard@/, ''); i++; break;
      case '--mode': a.mode = v as Args['mode']; i++; break;
      case '--wall': a.wall = Number(v); i++; break;
      case '--from': a.from = Number(v); i++; break;
      case '--to': a.to = Number(v); i++; break;
      case '--rung-from': a.rungFrom = Number(v); i++; break;
      case '--rung-to': a.rungTo = Number(v); i++; break;
      case '--phases': a.phases = v as Args['phases']; i++; break;
      case '--dump-state': a.dumpState = v; i++; break;
      case '--out': a.out = v; i++; break;
      default: throw new Error(`p6-turn-time: unknown argument ${argv[i]}`);
    }
  }
  if (a.replay === '') throw new Error('p6-turn-time: --replay is required');
  return a;
}

/** The root generation phase of `search/root.ts`, timed from outside.
 *
 * `searchRoot` packs, sets `proverMode = PROVER_FULL`, resets its meter to the
 * rung, builds the level-2 tables and calls `generateAt(s, p, t, 0)`, which is
 * `s.gen.generate(...)` with the search's own `WorkMeter`. This rebuilds that
 * sequence with the same config objects and reports each part.
 */
class RootPhases {
  private readonly rep = new Replica();
  private readonly sc = new Scratch(8, 8, 4, 4);
  private readonly tables: NodeTables = allocTables();
  private readonly evaluator = new Evaluator(this.rep);
  private readonly pool = new TurnPool(POOL_CAPACITY);
  private readonly keep: KeepSetTable = newKeepSetTable();
  private readonly gen: TurnGenerator;
  private readonly out: Turn[];
  private readonly stats: GenStats = newGenStats();
  private readonly score: (p: PackedState, sc: Scratch, ply: number) => Centi;
  private mover: Side = 0;

  constructor(readonly cfg: HardConfig) {
    this.gen = new TurnGenerator(this.rep, cfg.gen, this.pool, this.sc);
    this.out = new Array<Turn>(outCapacityFor(cfg.gen));
    // DESIGN §5.4's within-turn score, exactly as `engine.ts` and
    // `recall/run.ts` build it: stage-0 + stage-1 from the mover's side.
    this.score = (p, sc, ply) => {
      const terminal = terminalScore(p, this.mover, ply);
      if (terminal !== null) return terminal;
      return this.evaluator.stage0(p, this.mover) + this.evaluator.stage1(p, this.mover, sc, ply);
    };
  }

  measure(state: GameState, wallMs: number, rungOverride: number | null): Record<string, number | string> {
    const t0 = now();
    const p: PackedState = this.rep.pack(state, allocState());
    const packMs = now() - t0;
    if (p.result !== Result.ONGOING) return { note: 'position is not ONGOING' };
    p.proverMode = 2;

    const t1 = now();
    const t = buildTables(p, this.sc, 0, 2, this.tables);
    const tablesMs = now() - t1;

    const t2 = now();
    const book = this.cfg.book;
    let bookHit = false;
    if (book !== null && book.size > 0) bookHit = false; // profiles ship no book; kept for shape
    const bookMs = now() - t2;

    const t3 = now();
    const hint = candidateHint(p);
    const tms = targetMs(p, t, this.cfg.time, bookHit, hint);
    const rung = rungOverride ?? chooseWork(this.cfg.profile, tms);
    const timeMs = now() - t3;

    const meter = new WorkMeter(rung);
    meter.spend(WorkClass.KILLTABLE);
    // `Replica.fullProverCalls` is the count `make` runs the FULL home-checkmate
    // prover (`core/state.ts provesHomeCheckmate` at `proverMode = 2`). The
    // generator's `ActionSearch` applies its lines through `make`, and NOTHING
    // charges that delta to the meter: `search/pvs.ts chargeProver` is called
    // from the search loop, the ordering pass and the root's must-answer scan,
    // but not from `generateAt`. So this number next to `genWorkUsed` is the
    // whole point of the measurement.
    const proverBefore = this.rep.fullProverCalls;
    const t4 = now();
    this.pool.reset();
    this.mover = p.side as Side;
    const n = this.gen.generate(p, t, this.score, meter, 0, this.keep, this.out, this.stats);
    const genMs = now() - t4;

    return {
      packMs, tablesMs, bookMs, timeMs, genMs,
      targetMs: tms, rung, candidates: n, genWorkUsed: meter.used,
      // Which bucket the generator's work went into. `WorkClass` order:
      // MACRO, QUIESCE, TURN, GEN, KILLTABLE, DFPN, EVAL1, EVAL2, PROVER.
      genWorkByClass: [...meter.byClass].join(','),
      genUnitsPerMs: genMs > 0 ? Number((meter.used / genMs).toFixed(4)) : -1,
      genFullProverCalls: this.rep.fullProverCalls - proverBefore,
      placePlans: this.stats.placePlans, wallMs,
    };
  }
}

/** `engine.ts#candidateHint`, which is module-private there. */
function candidateHint(p: PackedState): number {
  const mover = p.side as Side;
  let bodies = 0;
  for (let slot = 0; slot < MAX_SLOTS && bodies < 2; slot++) {
    if (p.sq[slot] !== DEAD && p.owner[slot] === mover) bodies++;
  }
  return bodies >= 2 || p.bank[mover] > 0 ? 2 : 1;
}

function describe(state: GameState): string {
  const units: Record<string, string[]> = { white: [], black: [] };
  for (const u of state.board.units) units[u.owner]?.push(u.definitionId);
  let crystals = 0;
  let cellsWithCrystals = 0;
  for (const row of state.board.cells) {
    for (const c of row) {
      crystals += c.resourceLayers;
      if (c.resourceLayers > 0) cellsWithCrystals++;
    }
  }
  const tally = (list: string[]): string => {
    const by = new Map<string, number>();
    for (const d of list) by.set(d, (by.get(d) ?? 0) + 1);
    return [...by.entries()].sort().map(([d, n]) => `${n}x${d}`).join(' ');
  };
  return [
    `game turn ${state.turn.turnNumber}, ${state.turn.currentPlayer} to move, turn phase "${state.turn.phase}", actionsRemaining ${state.turn.actionsRemaining}, upkeepPending ${state.upkeepPending === true}`,
    `white: ${units.white.length} units [${tally(units.white)}], bank ${state.players.white.resources}`,
    `black: ${units.black.length} units [${tally(units.black)}], bank ${state.players.black.resources}`,
    `board: ${crystals} crystals left over ${cellsWithCrystals} cells`,
  ].join('\n  ');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const replay = loadReplay(path.resolve(args.replay));
  const recon = reconstruct(replay);
  const seatTurns = recon.bySide[args.side];
  const patch = hardEnginePatch(args.engine);
  // The full resolved `HardConfig` the adapter's patch produces, taken from an
  // engine so `mergeConfig`'s weights/book resolution is the real one.
  const cfg: HardConfig = new HardEngine(patch).config;
  const recorded = replay.meta.players[args.side].turnMs ?? [];

  const lines: string[] = [];
  const say = (s: string): void => { lines.push(s); console.log(s); };

  say(`# p6-turn-time  ${path.basename(args.replay)}  side=${args.side}  engine=hard@${args.engine}  mode=${args.mode}`);
  say(`replay: ${replay.fileId}  plies=${recon.plies}  winner=${recon.winner ?? 'none'}  seatTurns=${seatTurns.length}`);

  await withMatchRules(replay.options, async () => {
    if (args.mode === 'sweep') {
      const engine = new HardEngine(patch);
      engine.setSeed(replay.meta.seed ?? 1);
      say('');
      say('| seat turn | turn# | recorded ms | rung | profile u/ms (before) | measured ms | stats.elapsedMs | stopReason | nodes | work | plan |');
      say('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |');
      for (const turn of seatTurns) {
        if (turn.seatTurnIndex < args.from || turn.seatTurnIndex > args.to) continue;
        const before = engine.profile.unitsPerMs;
        const t0 = now();
        const r = await engine.searchTurn(turn.startState, { targetMs: args.wall, deadlineMs: args.wall });
        const ms = now() - t0;
        say(
          `| ${turn.seatTurnIndex} | ${turn.turnNumber} | ${recorded[turn.seatTurnIndex] ?? '?'} | ${chooseWork({ unitsPerMs: before, samples: 1 }, args.wall)} | ${before} | ${Math.round(ms)} | ${Math.round(r.stats.elapsedMs)} | ${r.stats.stopReason} | ${r.stats.nodes} | ${r.work} | ${r.actions.length} |`,
        );
      }
    } else {
      const turn = seatTurns.find(t => t.seatTurnIndex === args.turnIndex);
      if (turn === undefined) throw new Error(`p6-turn-time: seat turn ${args.turnIndex} not found (have 0..${seatTurns.length - 1})`);
      if (args.dumpState !== null) {
        fs.mkdirSync(path.dirname(path.resolve(args.dumpState)), { recursive: true });
        fs.writeFileSync(path.resolve(args.dumpState), JSON.stringify(turn.startState));
      }
      say('');
      say(`## position at seat turn ${turn.seatTurnIndex} (game turn ${turn.turnNumber}, ${turn.side}), recorded ${recorded[turn.seatTurnIndex] ?? '?'} ms`);
      say('  ' + describe(turn.startState));

      const phases = new RootPhases(cfg);
      if (args.mode === 'rung') {
        say('');
        say('| rung | root gen ms | candidates | gen work used | place plans |');
        say('| ---: | ---: | ---: | ---: | ---: |');
        for (const rung of WORK_LADDER) {
          if (rung < args.rungFrom || rung > args.rungTo) continue;
          const m = phases.measure(turn.startState, args.wall, rung);
          say(`| ${rung} | ${m.genMs} | ${m.candidates} | ${m.genWorkUsed} | ${m.placePlans} |`);
        }
      } else {
        if (args.phases !== 'search') {
          const m = phases.measure(turn.startState, args.wall, null);
          say('');
          say('### phases outside the engine (rung = what a cold profile picks)');
          say('```');
          say(JSON.stringify(m, null, 2));
          say('```');
        }
        if (args.phases === 'gen') return;

        const engine = new HardEngine(patch);
        engine.setSeed(replay.meta.seed ?? 1);
        const t0 = now();
        const r = await engine.searchTurn(turn.startState, { targetMs: args.wall, deadlineMs: args.wall });
        const ms = now() - t0;
        say('### the whole `searchTurn(state, { targetMs, deadlineMs })`');
        say('```');
        say(JSON.stringify({
          wallMsAroundCall: Math.round(ms),
          statsElapsedMs: Math.round(r.stats.elapsedMs),
          stopReason: r.stats.stopReason,
          source: r.source,
          fallback: r.fallback ?? null,
          depth: r.depth,
          work: r.work,
          nodes: r.stats.nodes,
          qnodes: r.stats.qnodes,
          turnNodes: r.stats.turnNodes,
          evals: r.stats.evals,
          proverCalls: r.stats.proverCalls,
          dfpnCalls: r.stats.dfpnCalls,
          catalogRebuilds: r.stats.catalogRebuilds,
          replicaDivergences: r.stats.replicaDivergences,
          workByClass: [...r.stats.byClass].join(','),
          planLength: r.actions.length,
          scoreCc: r.scoreCc,
          profileAfter: engine.profile,
        }, null, 2));
        say('```');
      }
    }
  });

  if (args.out !== null) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), lines.join('\n') + '\n');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
