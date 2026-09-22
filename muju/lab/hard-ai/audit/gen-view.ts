/**
 * What the PRODUCTION generator actually offers at a root, in family terms
 * (E2.1).
 *
 * `lab/hard-ai/analyze/engine.ts CandidateLister` already drives the generator
 * the way `search/pvs.ts generateAt` drives it at ply 0, but it reads out only
 * the end keys. The audit needs the SHAPE of each candidate, so this class does
 * the same setup and additionally decodes every `Turn` back into canonical
 * `AIAction`s with `gen/turn.ts decodeTurn` — the engine's own decoder, the one
 * `verify/replay.ts` replays through `applyAction`. The families reported here
 * are therefore measured from the generator's real output, not inferred from
 * reading `buildCombos`.
 *
 * The meter is `UNLIMITED_WORK` for the same reason the analyser uses it: the
 * list is then the generator's whole K, so a family missing from it was never
 * available to the search under any budget.
 */
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { newKeepSetTable, type KeepSetTable } from '../../../src/ai/hard/core/action';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { withinTurnScore } from '../../../src/ai/hard/eval/turnScore';
import { TurnPool, decodeTurn, type Turn } from '../../../src/ai/hard/gen/turn';
import { UNLIMITED_WORK } from '../../../src/ai/hard/gen/actionsearch';
import { TurnGenerator, newGenStats, outCapacityFor, type GenStats } from '../../../src/ai/hard/gen/generate';
import { installRescueWitness } from '../../../src/ai/hard/search/root';
import { Result, type Centi, type PackedState, type Side } from '../../../src/ai/hard/types';
import type { GenConfig, HardConfig } from '../../../src/ai/hard/config';
import { classifyTurn, type PlaceShape, type TurnFamily } from './families';

export interface GenFamilyList {
  count: number;
  /** One decoded candidate turn per emitted `Turn`, in emission order. */
  turns: { actions: AIAction[]; family: TurnFamily; endKey: string }[];
  /** Distinct `placeKey` values the generator offered. */
  placeFamilies: Set<string>;
  byShape: Record<PlaceShape, number>;
  stats: GenStats;
}

function emptyByShape(): Record<PlaceShape, number> {
  return { none: 0, 'buys-only': 0, 'promo-1': 0, 'promo-multi': 0, 'buy+promo-1': 0, 'buy+promo-multi': 0 };
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

export class GenFamilyLister {
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
    this.pool = new TurnPool(4096);
    this.gen = new TurnGenerator(this.rep, cfg, this.pool, this.sc);
    installRescueWitness(this.gen);
    this.evaluator = new Evaluator(this.rep, weights);
    this.out = new Array<Turn>(outCapacityFor(cfg));
  }

  private readonly score = (p: PackedState, sc: Scratch, ply: number): Centi =>
    withinTurnScore(this.evaluator, p, this.scoreMover, sc, ply);

  /** `null` when the replica refuses the position or the game is over there. */
  list(state: GameState, ply: number): GenFamilyList | null {
    let p: PackedState;
    try {
      p = this.rep.pack(state, allocState());
    } catch {
      return null;
    }
    if (p.result !== Result.ONGOING) return null;
    p.proverMode = 2;
    buildTables(p, this.sc, ply, 2, this.tables);
    this.pool.reset();
    this.scoreMover = p.side as Side;
    const n = this.gen.generate(p, this.tables, this.score, UNLIMITED_WORK, ply, this.keep, this.out, this.stats);

    const turns: GenFamilyList['turns'] = [];
    const placeFamilies = new Set<string>();
    const byShape = emptyByShape();
    for (let i = 0; i < n; i++) {
      const t = this.out[i];
      const actions = decodeTurn(p, t, this.keep);
      const family = classifyTurn(state, actions);
      byShape[family.shape]++;
      placeFamilies.add(family.placeKey);
      turns.push({ actions, family, endKey: keyHex(t.endHi, t.endLo) });
    }
    return { count: n, turns, placeFamilies, byShape, stats: { ...this.stats } };
  }
}
