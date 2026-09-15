/**
 * `NodeTables` — the frozen two-level knowledge contract (DESIGN §4.8).
 *
 * A `NodeTables` is the per-macro-node scratchpad the generator, the ordering
 * and the level-1 evaluator read. Level 1 is the cheap half (~1–2 µs:
 * distances, strike maps, spawn geometry, home safety); level 2 adds the
 * expensive tables (kill DP, approach, cleave chains, economy DP). This module
 * owns the SHAPE only: `allocTables()` hands out a zeroed instance whose every
 * buffer is allocated once and then written in place, and `buildTables()` —
 * whose body lands at M12 (`docs/hard-ai/MILESTONES.md`) — fills it by calling
 * `threat.ts`, `spawn.ts`, `home.ts`, `geometry.ts` and, at level 2, `kill.ts`,
 * `approach.ts` and `economy.ts` in that order.
 *
 * LEVEL-2 RESULT SHAPES. DESIGN §4.11/§4.12 declare `KillEntry`, `KillTable`,
 * `HomeSafety`, `SpawnGeometry` and `EconResult` in `tables/kill.ts`,
 * `tables/home.ts`, `tables/geometry.ts` and `tables/economy.ts` — modules
 * built by M7, M8 and M9, which run CONCURRENTLY with M6 in parallel group E
 * and so cannot be imported from here at this milestone. They are re-declared
 * below, field for field, exactly as DESIGN §4.11/§4.12 print them;
 * TypeScript's structural typing makes the two spellings interchangeable, so
 * `buildTables` can assign a `tables/kill.ts` `KillTable` straight into
 * `killNow` once that module exists, and M12 may replace these declarations
 * with `import type` when every lane of group E has landed. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M6.
 */
import { MAX_SLOTS, type Centi, type PackedState, type Side } from '../types';
import { bbNew, type BB, type Scratch } from '../core/bits';
import { createDistanceCache, type DistanceCache } from '../core/movement';
import { newSpawnInfo, type SpawnInfo } from '../core/spawn';
import { BOARD } from '../core/tables';

/** `tables/kill.ts` KillEntry (DESIGN §4.11). `minActions === 255` is "impossible". */
export interface KillEntry {
  minActions: number;
  minCrystals: number;
  needsBuy: 0 | 1;
  needsPromo: 0 | 1;
  /** `cost × 100` catalogue prior, never an eval weight (DESIGN §4.11). */
  valueCc: Centi;
}

/** `tables/kill.ts` KillTable (DESIGN §4.11). */
export interface KillTable {
  entry: KillEntry[];
  killableNow: BB;
  bestValuePerAction: number;
  count: number;
}

/** `tables/home.ts` HomeSafety (DESIGN §4.12). */
export interface HomeSafety {
  actionsToCorner: number;
  turnsToCorner: number;
  buyThreat: 0 | 1;
  rescuers: number;
  plug: 0 | 1;
  occupied: 0 | 1;
}

/** `tables/geometry.ts` SpawnGeometry (DESIGN §4.12). */
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

/** `tables/economy.ts` EconResult (DESIGN §4.12); `income`/`upkeep` have `ECON_HORIZON` entries. */
export interface EconResult {
  stream: Centi;
  income: Int16Array;
  upkeep: Int16Array;
  turnsToInsolvency: number;
  relocationDebt: Centi;
  waste: number;
}

/**
 * `ECON_HORIZON` (DESIGN §4.12) restated so `allocTables` can size
 * `EconResult.income`/`upkeep` without importing `tables/economy.ts`, which
 * lands at M8. `tests/ai/hard/threat.test.ts` pins the two together once that
 * module exists; until then this is the single source of the buffer length.
 */
const ECON_H = 6;

/** `killActions` sentinel: this slot can never be killed next turn (DESIGN §4.8). */
export const KILL_NEVER = 127;

export interface NodeTables {
  keyLo: number;
  keyHi: number;
  level: 1 | 2;
  /** The mover at this node. */
  side: Side;

  // --- level 1 (~1-2 µs) ---
  dist: DistanceCache;
  /** Squares each side can attack this turn: ∪ `dilate(reach(u, spd, 3) ∪ {u})` (DESIGN §5.1). */
  strike: [BB, BB];
  /** The same for units not yet bought (DESIGN §5.2). */
  strikeIfBought: [BB, BB];
  /** `strike[other] | strikeIfBought[other]`. */
  exposure: [BB, BB];
  spawn: [SpawnInfo, SpawnInfo];
  /** Multi-source BFS from `CORNER[side]`: every square's distance to that corner. */
  cornerDist: [Int8Array, Int8Array];
  home: [HomeSafety, HomeSafety];
  geom: [SpawnGeometry, SpawnGeometry];

  // --- level 2 (~6-15 µs) ---
  /** [MAX_SLOTS] min actions for the OWNER's ENEMY to kill this slot next turn; `KILL_NEVER` = never. */
  killActions: Int8Array;
  /** [MAX_SLOTS] crystals of the cheapest such plan. */
  killCrystals: Int16Array;
  /** [MAX_SLOTS]. */
  killNeedsBuy: Uint8Array;
  /** What each side can kill THIS turn (mover: actions left; other: 4). */
  killNow: [KillTable, KillTable];
  /** [MAX_SLOTS] `Approach` class of the cheapest lethal enemy attacker of this slot. */
  approach: Uint8Array;
  /** [MAX_SLOTS] retreat squares of that attacker outside our strike. */
  retreats: Uint8Array;
  /** [MAX_SLOTS] Cleave-chain value (cc) exposed by this enemy tier-2+ unit. */
  chain: Int16Array;
  econ: [EconResult, EconResult];
}

function newKillEntry(): KillEntry {
  return { minActions: 255, minCrystals: 0, needsBuy: 0, needsPromo: 0, valueCc: 0 };
}

function newKillTable(): KillTable {
  const entry: KillEntry[] = new Array<KillEntry>(MAX_SLOTS);
  for (let i = 0; i < MAX_SLOTS; i++) entry[i] = newKillEntry();
  return { entry, killableNow: bbNew(), bestValuePerAction: 0, count: 0 };
}

function newHomeSafety(): HomeSafety {
  return { actionsToCorner: 127, turnsToCorner: 127, buyThreat: 0, rescuers: 0, plug: 0, occupied: 0 };
}

function newSpawnGeometry(): SpawnGeometry {
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

function newEconResult(): EconResult {
  return {
    stream: 0,
    income: new Int16Array(ECON_H),
    upkeep: new Int16Array(ECON_H),
    turnsToInsolvency: ECON_H + 1,
    relocationDebt: 0,
    waste: 0,
  };
}

/**
 * One node's tables, every buffer allocated once. The result is in the
 * "nothing computed yet" state: `level` is 1, `killActions` is `KILL_NEVER`
 * everywhere, `cornerDist` is `-1` everywhere (the `bfsFrom` sentinel for
 * "unreachable") and every mask is empty.
 */
export function allocTables(): NodeTables {
  const t: NodeTables = {
    keyLo: 0,
    keyHi: 0,
    level: 1,
    side: 0,
    dist: createDistanceCache(),
    strike: [bbNew(), bbNew()],
    strikeIfBought: [bbNew(), bbNew()],
    exposure: [bbNew(), bbNew()],
    spawn: [newSpawnInfo(), newSpawnInfo()],
    cornerDist: [new Int8Array(BOARD), new Int8Array(BOARD)],
    home: [newHomeSafety(), newHomeSafety()],
    geom: [newSpawnGeometry(), newSpawnGeometry()],
    killActions: new Int8Array(MAX_SLOTS),
    killCrystals: new Int16Array(MAX_SLOTS),
    killNeedsBuy: new Uint8Array(MAX_SLOTS),
    killNow: [newKillTable(), newKillTable()],
    approach: new Uint8Array(MAX_SLOTS),
    retreats: new Uint8Array(MAX_SLOTS),
    chain: new Int16Array(MAX_SLOTS),
    econ: [newEconResult(), newEconResult()],
  };
  t.killActions.fill(KILL_NEVER);
  t.cornerDist[0].fill(-1);
  t.cornerDist[1].fill(-1);
  return t;
}

/**
 * Fill `out` for `p` (DESIGN §4.8). The body lands at M12, together with the
 * evaluator that consumes it: M6 owns the shape, `threat.ts` and `approach.ts`;
 * `spawn`, `home`, `geom`, `kill` and `econ` arrive with M7–M9, and wiring them
 * up before they exist would produce a table that silently reports zeros.
 */
export function buildTables(
  _p: PackedState,
  _sc: Scratch,
  _ply: number,
  _level: 1 | 2,
  _out: NodeTables,
): NodeTables {
  throw new Error('buildTables: body lands at M12 (see docs/hard-ai/MILESTONES.md)');
}
