// Act-map graph generator — Spire's branching node graph, deterministic from a
// seeded RNG. Rows of nodes connected upward; the player picks a path from the
// bottom row to the boss at the top. Reachability is guaranteed by construction.

import type { Rng } from "./rng";
import type { MapNode, NodeType } from "./types";

export interface MapGenConfig {
  /** Number of node rows BETWEEN the start row and the boss row (inclusive of
   *  the start row). Boss is an extra final row. Default 12. */
  rows: number;
  /** Max nodes per interior row. Default 4. */
  width: number;
}

const DEFAULT_CONFIG: MapGenConfig = { rows: 12, width: 4 };

/**
 * Node type for an interior row. Early rows skew to combat; rest/shop/elite/
 * event are sprinkled in by row band so the act has a recognizable rhythm:
 *   - row 0: always combat (a gentle opener)
 *   - mid rows: weighted mix
 *   - a guaranteed rest before the boss (penultimate row)
 */
function rollNodeType(rng: Rng, row: number, totalRows: number): NodeType {
  if (row === 0) return "combat";
  if (row === totalRows - 1) return "rest"; // breather before the boss

  // Weighted table. Elites appear from the mid-act onward.
  const lateGame = row >= Math.floor(totalRows / 2);
  const table: NodeType[] = [
    "combat",
    "combat",
    "combat",
    "event",
    "shop",
    "rest",
  ];
  if (lateGame) {
    table.push("elite", "elite", "combat");
  } else {
    table.push("combat");
  }
  return rng.pick(table);
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
  const { rows, width } = { ...DEFAULT_CONFIG, ...config };
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
    for (let c = 0; c < size; c++) {
      rowNodes.push({
        id: `a${act}_r${r}_c${c}`,
        type: rollNodeType(mapRng, r, rows),
        row: r,
        col: c,
        next: [],
      });
    }
    grid.push(rowNodes);
  }

  // Boss row (single node) on top.
  const bossRow: MapNode[] = [
    { id: `a${act}_boss`, type: "boss", row: rows, col: 0, next: [] },
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
