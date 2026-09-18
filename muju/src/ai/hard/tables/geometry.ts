/**
 * Spawn geometry features (DESIGN §4.12, §5.8).
 *
 * Built from `core/spawn.ts`'s already-gated primitives (`spawnInfo`,
 * `blockingSet`, M5) plus `tables/threat.ts`'s already-gated
 * `exposure` map (M6): DESIGN §4.6's `blockingSet` doc describes the
 * reachability-filter candidate as "the squares the enemy can occupy this
 * turn: existing reach ∪ purchase reach"; `t.exposure[side]` is exactly
 * `strike[enemy] | strikeIfBought[enemy]` — the union of the enemy's existing
 * and not-yet-bought attack areas (DESIGN §4.8) — which dilates one ring
 * beyond pure movement reach to cover the attack itself. Reusing it here
 * (rather than a second, movement-only BFS sweep) avoids re-deriving a set
 * `threat.ts` already computes and gates every node, at the price of a
 * TWO-SIDED approximation: `threat.ts` builds strike from
 * `STRIKE_MOVE_ACTIONS = 3` moves and then dilates by one, so a unit of speed
 * `s` covers `ball(3s + 1)` while the squares it could actually STAND on in a
 * four-action turn are `ball(4s)`. At speed 1 exposure is a superset (the
 * candidate set only grows, making `blocking` conservative — a square the
 * enemy could only attack, not stand on, can still appear); at speed >= 2
 * (Hi, Goel, Radi) `ball(4s)` is not contained in `ball(3s + 1)`, so far
 * squares the enemy could occupy are missed and `blocking` can read low.
 * `tests/ai/hard/geometry.test.ts` checks a hand case where this makes no
 * difference, and neither the F5 fixture nor the null-candidate oracle in
 * `lab/hard-ai/oracles/geometry.ts` requires the candidate set to be exact;
 * `docs/hard-ai/design/DEVIATIONS.md` (M9) records the true mask to build if
 * M12's tuning shows the approximation matters.
 */
import { CC, DEAD, MAX_SLOTS, NO_SLOT, type Centi, type PackedState, type Side } from '../types';
import { activeCatalog } from '../core/catalog';
import { blockingSet } from '../core/spawn';
import { bbHas, bbNew, type BB, type Scratch } from '../core/bits';
import { CORNER_NEIGHBOURS, RECT, SQ_X, SQ_Y, WHITE } from '../core/tables';
import { KILL_NEVER, type NodeTables } from './context';

/** DESIGN §4.12; re-declared in `tables/context.ts` (structurally identical,
 * see that module's header) until M12 can `import type` this directly. */
export interface SpawnGeometry {
  area: number;
  reserveSum: number;
  anchorDepth: number;
  /** 0..3. */
  fragility: number;
  /** 0..3, 3 = "more than two". */
  blocking: number;
  infiltrationAnchors: number;
  convertible: Centi;
  zeroCliff: 0 | 1;
  cornerNeighboursHeld: number;
}

export function newSpawnGeometry(): SpawnGeometry {
  return {
    area: 0,
    reserveSum: 0,
    anchorDepth: 0,
    fragility: 0,
    blocking: 0,
    infiltrationAnchors: 0,
    convertible: 0,
    zeroCliff: 0,
    cornerNeighboursHeld: 0,
  };
}

/** `SpawnGeometry.blocking` is documented "0..3, 3 = more than two" (four
 * states: 0, 1, 2, ">2"), so the `blockingSet` cap passed here is 2:
 * `blockingSet(..., 2, ...)` returns exactly 0, 1, 2 or `cap + 1 === 3`,
 * matching the field's own comment verbatim (DESIGN §5.8 separately calls the
 * field's span "cap 3", i.e. four possible values — the same fact stated the
 * other way). */
const BLOCKING_CAP = 2;

const SC_COVER: BB = bbNew();

function depthOf(side: Side, s: number): number {
  return side === WHITE ? SQ_X[s] + SQ_Y[s] : 18 - SQ_X[s] - SQ_Y[s];
}

/**
 * `spawnGeometry` (DESIGN §4.8, §4.12, §5.8). `sc`/`ply` are accepted per the
 * frozen signature; this module needs no per-ply scratch of its own (its one
 * bitboard, the `blockingSet` cover output, is discarded immediately, so a
 * single module-level buffer is enough — nothing here recurses).
 */
export function spawnGeometry(
  p: PackedState,
  t: NodeTables,
  side: Side,
  sc: Scratch,
  ply: number,
  out: SpawnGeometry,
): SpawnGeometry {
  void sc;
  void ply;
  const cat = activeCatalog();
  const info = t.spawn[side];

  out.area = info.area;
  out.reserveSum = info.reserveSum;
  out.anchorDepth = info.depth;
  out.convertible = Math.min(p.bank[side], 5 * info.area) * CC;
  out.zeroCliff = info.area === 0 && p.bank[side] >= 3 ? 1 : 0;

  out.blocking = blockingSet(p, side, t.exposure[side], BLOCKING_CAP, SC_COVER);

  // `infiltrationAnchors` (DESIGN §5.8): "Σ over own slots inside an enemy
  // rectangle of the anchors voided; a body on the enemy corner voids ALL of
  // them". `core/spawn.ts anchorsVoidedBy(p, victimSide, s)` answers a
  // DIFFERENT, hypothetical question — "if an intruder stood on the EMPTY
  // square s, how many of victimSide's CURRENTLY-unblocked anchors would it
  // void" — and explicitly skips any anchor whose rectangle already
  // intersects victimSide's enemy occupancy. Calling it with `s` set to one
  // of `side`'s OWN, ALREADY-PLACED unit squares is self-defeating: that
  // square is itself part of the "already blocks it" occupancy the function
  // checks, so every anchor whose rectangle contains `s` is reported as
  // pre-blocked and skipped, undercounting to zero on every position. The
  // loop below instead counts directly, per DESIGN's literal "Σ over own
  // slots inside an enemy rectangle": for each of `side`'s own unit squares,
  // how many of `enemy`'s own units have that square inside their rectangle
  // — with no "already blocked by someone else" exclusion, so a rectangle
  // infiltrated by two of `side`'s units is counted twice (redundant
  // infiltration pressure), and a unit on the enemy corner counts once per
  // enemy anchor (every rectangle contains the corner). See
  // `docs/hard-ai/design/DEVIATIONS.md` under M9.
  const enemy = (1 - side) as Side;
  const enemyRect = RECT[enemy];
  let infiltration = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    for (let eslot = 0; eslot < MAX_SLOTS; eslot++) {
      const a = p.sq[eslot];
      if (a === DEAD || p.owner[eslot] !== enemy) continue;
      if (bbHas(enemyRect[a], s)) infiltration++;
    }
  }
  out.infiltrationAnchors = infiltration;

  const neighbours = CORNER_NEIGHBOURS[side];
  let held = 0;
  for (let i = 0; i < neighbours.length; i++) {
    const n = neighbours[i];
    const slot = p.pieceAt[n];
    if (slot === NO_SLOT || p.owner[slot] !== side) continue;
    if (cat.spd[p.defId[slot]] === 1) held++;
  }
  out.cornerNeighboursHeld = held;

  let deepestSlot = -1;
  let deepestDepth = -1;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (!bbHas(info.anchors, s)) continue;
    const d = depthOf(side, s);
    if (d > deepestDepth) {
      deepestDepth = d;
      deepestSlot = slot;
    }
  }
  // `t.killActions` is a level-2 field: `buildTables` (M12) runs `geometry.ts`
  // at level 1, before `kill.ts` fills it in, so at that point every entry is
  // still `allocTables`'s default `KILL_NEVER` — which is exactly the value
  // this formula should see when the term is not yet known (the fragility
  // point it gates is "unproven", not "true"). When `buildTables` extends to
  // level 2 (or a caller re-invokes this after `kill.ts` runs) the real value
  // is picked up with no change here.
  const killActionsAtDeepest = deepestSlot >= 0 ? t.killActions[deepestSlot] : KILL_NEVER;
  out.fragility = (out.blocking <= 1 ? 2 : 0) + (killActionsAtDeepest <= 4 ? 1 : 0);

  return out;
}
