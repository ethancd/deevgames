import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";
import { generateMap, startNodeIds, bossNode } from "./map";
import type { MapNode } from "./types";

function byId(map: MapNode[]): Map<string, MapNode> {
  return new Map(map.map((n) => [n.id, n]));
}

/** Every start node can reach the boss via forward edges. */
function bossReachableFromAllStarts(map: MapNode[]): boolean {
  const index = byId(map);
  const boss = bossNode(map)!;
  for (const start of startNodeIds(map)) {
    const seen = new Set<string>();
    const stack = [start];
    let reached = false;
    while (stack.length) {
      const id = stack.pop()!;
      if (id === boss.id) {
        reached = true;
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      for (const nx of index.get(id)!.next) stack.push(nx);
    }
    if (!reached) return false;
  }
  return true;
}

describe("act-map graph generator", () => {
  it("is deterministic from seed", () => {
    const a = generateMap(makeRng("map-seed"), 1);
    const b = generateMap(makeRng("map-seed"), 1);
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = generateMap(makeRng("alpha"), 1);
    const b = generateMap(makeRng("beta"), 1);
    expect(a).not.toEqual(b);
  });

  it("has exactly one boss node at the top row", () => {
    const map = generateMap(makeRng("boss"), 1);
    const bosses = map.filter((n) => n.type === "boss");
    expect(bosses).toHaveLength(1);
    const maxRow = Math.max(...map.map((n) => n.row));
    expect(bosses[0].row).toBe(maxRow);
  });

  it("guarantees the boss is reachable from every start node (many seeds)", () => {
    for (let i = 0; i < 50; i++) {
      const map = generateMap(makeRng(`reach-${i}`), 1);
      expect(bossReachableFromAllStarts(map)).toBe(true);
    }
  });

  it("has no orphan nodes (every non-start node has an incoming edge)", () => {
    for (let i = 0; i < 20; i++) {
      const map = generateMap(makeRng(`orphan-${i}`), 1);
      const incoming = new Set<string>();
      for (const n of map) for (const nx of n.next) incoming.add(nx);
      const starts = new Set(startNodeIds(map));
      for (const n of map) {
        if (starts.has(n.id)) continue;
        expect(incoming.has(n.id)).toBe(true);
      }
    }
  });

  it("opens with combat and rests before the boss", () => {
    const map = generateMap(makeRng("rhythm"), 1);
    const row0 = map.filter((n) => n.row === 0);
    expect(row0.every((n) => n.type === "combat")).toBe(true);
    const maxRow = Math.max(...map.map((n) => n.row));
    const penultimate = map.filter((n) => n.row === maxRow - 1);
    expect(penultimate.every((n) => n.type === "rest")).toBe(true);
  });
});
