/**
 * Shared scaffolding for the M14 search tests: a real `HardEngine` over a real
 * `GameState`, with its `SearchContext` exposed so a test can drive `pvs`,
 * `quiesce`, `scoreTurns` and `verifyTurn` directly instead of only through
 * `searchTurn`.
 *
 * Everything here builds CANONICAL states (`tests/ai/hard/game-fixture.ts`),
 * so a test's expectation can always be cross-checked against `src/game`.
 */
import type { GameState } from '../../../src/game/types';
import { Result, type PackedState, type Side } from '../../../src/ai/hard/types';
import { buildTables } from '../../../src/ai/hard/tables/context';
import { HardEngine } from '../../../src/ai/hard/engine';
import { WorkClass } from '../../../src/ai/hard/search/time';
import { generateAt, type SearchContext } from '../../../src/ai/hard/search/pvs';
import { scoreTurns } from '../../../src/ai/hard/search/order';
import type { HardConfig } from '../../../src/ai/hard/config';
import type { Turn } from '../../../src/ai/hard/gen/turn';

export interface Prepared {
  engine: HardEngine;
  ctx: SearchContext;
  p: PackedState;
  mover: Side;
}

/** Packs `state` into `engine`'s root buffer and arms the context for a search
 * with `work` units, exactly as `searchRoot` does. */
export function prepare(state: GameState, work = 200_000, cfg?: Partial<HardConfig>): Prepared {
  const engine = new HardEngine(cfg);
  const ctx = engine.ctx;
  const p = ctx.rep.pack(state, engine.rootState);
  if (p.result !== Result.ONGOING) throw new Error('prepare: position is already decided');
  p.proverMode = 2;
  ctx.root = p.side as Side;
  ctx.meter.reset(work);
  ctx.tt.clear();
  ctx.proof.clear();
  buildTables(p, ctx.sc, 0, 2, ctx.tables[0]);
  ctx.meter.spend(WorkClass.KILLTABLE);
  return { engine, ctx, p, mover: p.side as Side };
}

/** This node's candidate list, generated and ordered exactly as `pvs` does. */
export function candidates(prepared: Prepared, ply = 0): { turns: Turn[]; n: number } {
  const { ctx, p } = prepared;
  const t = buildTables(p, ctx.sc, ply, 2, ctx.tables[ply]);
  const n = generateAt(ctx, p, t, ply);
  scoreTurns(p, t, ctx.turns[ply], n, null, ctx.ord, ply, 0, ctx);
  return { turns: ctx.turns[ply], n };
}

/** The candidate list WITHOUT the ordering pass (generator order). */
export function rawCandidates(prepared: Prepared, ply = 0): { turns: Turn[]; n: number } {
  const { ctx, p } = prepared;
  const t = buildTables(p, ctx.sc, ply, 2, ctx.tables[ply]);
  const n = generateAt(ctx, p, t, ply);
  return { turns: ctx.turns[ply], n };
}

export function endKeyOf(t: Turn): string {
  return `${(t.endHi >>> 0).toString(16).padStart(8, '0')}${(t.endLo >>> 0).toString(16).padStart(8, '0')}`;
}
