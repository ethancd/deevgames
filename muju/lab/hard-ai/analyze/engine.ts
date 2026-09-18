/**
 * The two engines the analyser drives, and the one list it reads out of the
 * generator (EPIC-PLAN §4 E1.1/E1.4).
 *
 *   PRODUCTION  the `hard@<profile>` engine the seat actually played, at the
 *               ladder's own work rung. Its `RootResult` is what the engine
 *               BELIEVED about the turn it chose.
 *   ADVISER     the same engine at a much larger fixed-work budget. EPIC-PLAN
 *               §4 E1 is explicit that this is "an adviser, not an exact
 *               oracle": nothing here proves a turn best, it only says a
 *               deeper look at the same evaluation prefers something else.
 *
 * Both are built through `lab/hard-ai/bots/hard.ts hardEnginePatch`, the same
 * call `createHardBot` makes, so the resolved configuration — including the
 * `DEFAULT_WEIGHTS` substitution that every pre-E0 ladder row silently missed
 * — is the seat's own. Both run in FIXED-WORK mode (`searchTurn(state,
 * {work})`), which reads no clock at all, so a re-run of the analyser on
 * another box produces the same numbers.
 *
 * THE CHEAP LIST. `HardEngine` does not hand back its candidate set, so the
 * generator is driven directly, exactly as `search/pvs.ts generateAt` drives
 * it at ply 0: pack, `proverMode = 2`, level-2 tables, the same `GenConfig`
 * the seat resolved, the same within-turn scorer, and `installRescueWitness`
 * wired in (`search/root.ts` does this for every generator the engine owns,
 * and without it DESIGN §5.6's injection 4 is missing from the list). The one
 * deliberate difference is the meter: the analyser generates with
 * `UNLIMITED_WORK` so the list is the generator's whole K, not a list a
 * half-spent budget truncated. A candidate absent from THIS list was never
 * available to the search under any budget.
 */
import type { GameState, PlayerId } from '../../../src/game/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { TurnPool, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import { TurnGenerator, newGenStats, outCapacityFor, type GenStats } from '../../../src/ai/hard/gen/generate';
import { installRescueWitness, type RootResult } from '../../../src/ai/hard/search/root';
import { WORK_LADDER, chooseWork } from '../../../src/ai/hard/search/time';
import { MATE_PLY_CC, Result, WIN_CC, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import { DESKTOP, type GenConfig, type HardConfig } from '../../../src/ai/hard/config';
import { HardEngine } from '../../../src/ai/hard/engine';
import { hardEnginePatch } from '../bots/hard';

/** The slice of `HardEngine` the analyser uses. A test injects a stub. */
export interface AdviserEngine {
  /** `expose` is E2 lane 1's opt-in root instrument; a stub may ignore it. */
  searchTurn(state: GameState, opts?: { work?: number; expose?: boolean; ply1Trace?: boolean }): Promise<RootResult>;
}

export type EngineFactory = (patch: Partial<HardConfig>, role: 'adviser' | 'production') => AdviserEngine;

export const defaultEngineFactory: EngineFactory = patch => new HardEngine(patch);

/**
 * The rung a `--work wall:3000` seat searches its FIRST turn at:
 * `chooseWork(profile, time.baseMs)` on the 200 units/ms constant every fresh
 * `HardEngine` starts from. For `hard@lab`/`hard@desktop` that is 400,000
 * units.
 *
 * It is a REPRESENTATIVE rung, not the rung every turn used. In wall mode the
 * engine re-measures itself after each search and `search/time.ts
 * updateProfile` moves the profile toward the box's real throughput, so a
 * slower box drops to a smaller rung after turn 1 and `targetMs`'s home-threat
 * and kill-now multipliers push it back up in sharp positions. The pilot's own
 * `players.black.turnMs` shows both effects (4,584 ms on turn 1, ~1,700 ms
 * after). This number is used for the production re-run, which asks "what did
 * an engine of this size believe here"; it is not a claim about which rung that
 * particular turn drew.
 */
export function ladderWorkRung(config: HardConfig): number {
  return chooseWork(config.profile, config.time.baseMs);
}

/** `ADVISER_WORK_FACTOR × ladderWorkRung`, snapped up to the next work rung so
 * the adviser's budget is a rung the engine's own ladder defines. */
export const ADVISER_WORK_FACTOR = 4;

export function defaultAdviserWork(config: HardConfig): number {
  const raw = ladderWorkRung(config) * ADVISER_WORK_FACTOR;
  for (const rung of WORK_LADDER) if (rung >= raw) return rung;
  return WORK_LADDER[WORK_LADDER.length - 1];
}

/** `search/root.ts keyHex`: the `Kpos` of the position after a turn boundary,
 * which is what `RootResult.endKey` and `Turn.endLo/endHi` both carry. */
export function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

const SIDE_OF: Record<PlayerId, Side> = { white: 0, black: 1 };

export function sideOf(player: PlayerId): Side {
  return SIDE_OF[player];
}

export interface CheapList {
  keys: string[];
  /** `keys` as a set, for membership questions. */
  set: Set<string>;
  count: number;
  stats: GenStats;
}

/**
 * Packs a canonical `GameState` and reads out the numbers the analyser needs
 * from a position: its `Kpos` (the end key a turn landing here would carry) and
 * its terminal score from a nominated side's point of view.
 */
export class PositionReader {
  readonly rep = new Replica();
  private readonly buf: PackedState = allocState();

  /** `null` when the replica refuses the position (a `PackError`). */
  packKey(state: GameState): string | null {
    const p = this.tryPack(state);
    return p === null ? null : keyHex(p.kposHi, p.kposLo);
  }

  /** `±(WIN_CC − MATE_PLY_CC)` / `0` for a decided position, `null` otherwise. */
  terminalCc(state: GameState, from: PlayerId): Centi | null {
    const p = this.tryPack(state);
    if (p === null) return null;
    if (p.result === Result.ONGOING) return null;
    return terminalScore(p, sideOf(from), 1);
  }

  private tryPack(state: GameState): PackedState | null {
    try {
      return this.rep.pack(state, this.buf);
    } catch {
      return null;
    }
  }
}

/** Score a decided position without packing: used when a turn ends the game. */
export function decidedCc(winner: PlayerId | null, from: PlayerId): Centi {
  if (winner === null) return 0;
  const magnitude = WIN_CC - MATE_PLY_CC;
  return winner === from ? magnitude : -magnitude;
}

/**
 * Drives one `TurnGenerator` over canonical positions. One instance per
 * `GenConfig`; the root list uses `cfg.gen` and a reply node `cfg.genInterior`,
 * which is what the search itself would use at ply 1.
 */
export class CandidateLister {
  private readonly rep = new Replica();
  private readonly sc = new Scratch(8, 8, 4, 4);
  private readonly tables: NodeTables = allocTables();
  private readonly keep: KeepSetTable = newKeepSetTable();
  private readonly pool: TurnPool;
  private readonly gen: TurnGenerator;
  private readonly out: Turn[];
  private readonly stats: GenStats = newGenStats();
  private readonly evaluator: Evaluator;
  private scoreMover: Side = 0;

  constructor(cfg: GenConfig, weights: HardConfig['weights']) {
    // The generator's within-turn beam is the demanding caller; `engine.ts`
    // sizes its own pool at 1536 for the same `GenConfig`, and the analyser is
    // not in a search so it can afford headroom.
    this.pool = new TurnPool(4096);
    this.gen = new TurnGenerator(this.rep, cfg, this.pool, this.sc);
    installRescueWitness(this.gen);
    this.evaluator = new Evaluator(this.rep, weights);
    this.out = new Array<Turn>(outCapacityFor(cfg));
  }

  /** DESIGN §5.4's within-turn score, copied from `engine.ts`'s `ctx.score`
   * (and `recall/run.ts`, which builds the identical closure). */
  private readonly score = (p: PackedState, sc: Scratch, ply: number): Centi => {
    const mover = this.scoreMover;
    const terminal = terminalScore(p, mover, ply);
    if (terminal !== null) return terminal;
    return this.evaluator.stage0(p, mover) + this.evaluator.stage1(p, mover, sc, ply);
  };

  /** The end keys the generator offers in `state`, or `null` when the replica
   * refuses the position or the game is already over there. */
  list(state: GameState, ply: number): CheapList | null {
    let p: PackedState;
    try {
      p = this.rep.pack(state, allocState());
    } catch {
      return null;
    }
    if (p.result !== Result.ONGOING) return null;
    // A candidate may step onto the enemy corner, which `make` only adjudicates
    // with the prover switched on (`core/state.ts provesHomeCheckmate`).
    p.proverMode = 2;
    buildTables(p, this.sc, ply, 2, this.tables);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = this.gen.generate(p, this.tables, this.score, UNLIMITED_WORK, ply, this.keep, this.out, this.stats);
    const keys: string[] = [];
    const set = new Set<string>();
    for (let i = 0; i < n; i++) {
      const key = keyHex(this.out[i].endHi, this.out[i].endLo);
      if (set.has(key)) continue;
      set.add(key);
      keys.push(key);
    }
    return { keys, set, count: n, stats: { ...this.stats } };
  }
}

/**
 * The resolved configuration a `hard@<profile>` seat plays: `hardConfigFor`'s
 * profile with `hardEnginePatch`'s weights resolution applied. `hardConfigFor`
 * always returns a complete `HardConfig`, so the `DESKTOP` spread below only
 * fills fields a future profile might omit — it never overrides one.
 */
export function resolveHardConfig(profile: string): HardConfig {
  const patch = hardEnginePatch(profile);
  return { ...DESKTOP, ...patch } as HardConfig;
}

export { hardEnginePatch };
