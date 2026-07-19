// Act-map graph generator — Spire's branching node graph, deterministic from a
// seeded RNG. Rows of nodes connected upward; the player picks a path from the
// bottom row to the boss at the top. Reachability is guaranteed by construction.

import type { Rng } from "./rng";
import type { Difficulty, MapNode, NodeType } from "./types";

export interface MapGenConfig {
  /** Override the interior row count (default: `weeksForAct(act) * 7`). */
  rows?: number;
  /** Override max nodes per interior row (default: `widthForAct(act)`). */
  width?: number;
}

// --- Calendar + act structure (COMBAT.md §25) -------------------------------
/** Act length in WEEKS: Act 1 = 3, Act 2 = 2, Act 3 = 1. Later acts are shorter
 *  but DENSER (wider rows) and harder (per-act power mult in run.ts). */
export const ACT_WEEKS = [3, 2, 1];
/** Max nodes per row, widening per act so later maps feel denser. */
export const ACT_WIDTH = [4, 5, 6];
export const DAYS_PER_WEEK = 7;

export const weeksForAct = (act: number) =>
  ACT_WEEKS[act - 1] ?? ACT_WEEKS[ACT_WEEKS.length - 1];
/** Interior rows in an act = whole weeks × 7, so the boss (one row above) lands
 *  on day `rows+1` — a Monday (`(day-1) % 7 === 0`). */
export const rowsForAct = (act: number) => weeksForAct(act) * DAYS_PER_WEEK;
export const widthForAct = (act: number) =>
  ACT_WIDTH[act - 1] ?? ACT_WIDTH[ACT_WIDTH.length - 1];

const dayOfRow = (row: number) => row + 1; // row 0 = day 1
const weekOfDay = (day: number) => Math.ceil(day / DAYS_PER_WEEK);
/** A node where the weekly creature muster fires (COMBAT.md §25). */
export const isMusterDay = (day: number) => (day - 1) % DAYS_PER_WEEK === 0;

/**
 * Node type for an interior row. Early rows skew to combat; growth/economy
 * nodes (dwelling/altar/shrine/merchant) and rest are sprinkled in by row band
 * so the act has a recognizable rhythm:
 *   - row 0: always combat (a gentle opener)
 *   - mid rows: weighted mix of combat + growth nodes
 *   - a guaranteed rest before the boss (penultimate row)
 *
 * The town is gone, so growth happens on the map: DWELLING (recruit a stack),
 * ALTAR (upgrade a stack), SHRINE (learn a spell), MERCHANT (buy artifacts).
 */
/** Fraction of (non-opener) tiles that carry a combat guard. Kept at ~1/3–1/2 so
 *  there's often a low-combat route through the DAG (COMBAT.md §27). */
export const GUARD_FRACTION = 0.45;

/** The TILE (bonus) a node grants (COMBAT.md §27). Stat/economy tiles are common,
 *  shops rarer; the opener is a gentle stat tile. */
function rollTile(rng: Rng, row: number): NodeType {
  if (row === 0) return rng.pick(["attack", "defense", "gold"]);
  const table: NodeType[] = [
    "attack", "defense", "power", "knowledge", // S-tier primary bumps
    "xp", "xp", "gold", "gold", "mana",        // economy tiles (common)
    "dwelling", "shrine", "merchant", "altar", "rest", // shops/utility
  ];
  return rng.pick(table);
}

/** Guard difficulty ring from act + tough + boss (COMBAT.md §27):
 *  threat = act + tough + boss → bronze/silver/gold/diamond. So Act-1 normal =
 *  bronze, Act-1 tough / Act-2 normal = silver, Act-2 tough / Act-3 normal = gold,
 *  Act-3 tough / boss = diamond. */
export function difficultyOf(act: number, tough: boolean, isBoss: boolean): Difficulty {
  const threat = act + (tough ? 1 : 0) + (isBoss ? 1 : 0);
  return threat <= 1 ? "bronze" : threat === 2 ? "silver" : threat === 3 ? "gold" : "diamond";
}

/**
 * Generate one act's map. Returns a flat list of nodes; `next` holds the ids of
 * reachable nodes in the row above. The boss is a single node in the final row
 * that every top-interior node connects to.
 */
export function generateMap(
  rng: Rng,
  act: number,
  config: Partial<MapGenConfig> = {},
): MapNode[] {
  const rows = config.rows ?? rowsForAct(act);
  const width = config.width ?? widthForAct(act);
  const mapRng = rng.fork(`map:act${act}`);

  // Decide how many nodes live in each interior row (2..width), with the first
  // row guaranteed at least 2 to give an initial choice.
  const rowSizes: number[] = [];
  for (let r = 0; r < rows; r++) {
    const minSize = r === 0 ? 2 : 1;
    rowSizes.push(mapRng.int(minSize, width));
  }

  // Build interior nodes.
  const grid: MapNode[][] = [];
  for (let r = 0; r < rows; r++) {
    const size = rowSizes[r];
    const rowNodes: MapNode[] = [];
    const lateGame = r >= Math.floor(rows / 2);
    const toughChance = (0.2 + 0.1 * (act - 1)) * (lateGame ? 1.6 : 1);
    for (let c = 0; c < size; c++) {
      // The opener row is always a gentle (bronze) guarded fight; elsewhere ~1/3–1/2.
      const guarded = r === 0 ? true : mapRng.chance(GUARD_FRACTION);
      const tough = guarded && r > 0 && mapRng.chance(toughChance);
      rowNodes.push({
        id: `a${act}_r${r}_c${c}`,
        type: rollTile(mapRng, r),
        row: r,
        col: c,
        next: [],
        day: dayOfRow(r),
        week: weekOfDay(dayOfRow(r)),
        guarded,
        tough,
        difficulty: guarded ? difficultyOf(act, tough, false) : undefined,
      });
    }
    grid.push(rowNodes);
  }

  // Boss row (single node) on top — its day is `rows+1`, a Monday by construction.
  const bossRow: MapNode[] = [
    {
      id: `a${act}_boss`,
      type: "boss",
      row: rows,
      col: 0,
      next: [],
      day: dayOfRow(rows),
      week: weekOfDay(dayOfRow(rows)),
      guarded: true,
      tough: false,
      difficulty: difficultyOf(act, false, true),
    },
  ];
  grid.push(bossRow);

  // Connect each interior row to the one above, guaranteeing:
  //   (a) every node in row r has >= 1 outgoing edge (forward reachability), and
  //   (b) every node in row r+1 has >= 1 incoming edge (no orphan nodes).
  for (let r = 0; r < rows; r++) {
    const cur = grid[r];
    const nxt = grid[r + 1];

    // (a) each current node connects to a nearby node above.
    for (let c = 0; c < cur.length; c++) {
      // Map column proportionally, then jitter by one to create crossings.
      const proj = nxt.length === 1 ? 0 : Math.round((c / Math.max(1, cur.length - 1)) * (nxt.length - 1));
      const jitter = mapRng.int(-1, 1);
      const targetCol = clamp(proj + jitter, 0, nxt.length - 1);
      addEdge(cur[c], nxt[targetCol]);

      // Occasionally add a second edge for extra branching.
      if (nxt.length > 1 && mapRng.chance(0.35)) {
        const alt = clamp(targetCol + (mapRng.chance() ? 1 : -1), 0, nxt.length - 1);
        addEdge(cur[c], nxt[alt]);
      }
    }

    // (b) any node above with no incoming edge gets one from its nearest below.
    for (let c = 0; c < nxt.length; c++) {
      const hasIncoming = cur.some((n) => n.next.includes(nxt[c].id));
      if (!hasIncoming) {
        const proj = cur.length === 1 ? 0 : Math.round((c / Math.max(1, nxt.length - 1)) * (cur.length - 1));
        addEdge(cur[clamp(proj, 0, cur.length - 1)], nxt[c]);
      }
    }
  }

  return grid.flat();
}

/** The bottom-row node ids — the player's available starting choices. */
export function startNodeIds(map: MapNode[]): string[] {
  return map.filter((n) => n.row === 0).map((n) => n.id);
}

/** The boss node, if present. */
export function bossNode(map: MapNode[]): MapNode | undefined {
  return map.find((n) => n.type === "boss");
}

function addEdge(from: MapNode, to: MapNode): void {
  if (!from.next.includes(to.id)) from.next.push(to.id);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
