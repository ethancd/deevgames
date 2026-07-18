import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";
import { generateMap, startNodeIds, bossNode, isMusterDay } from "./map";
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

  it("acts are whole weeks (3/2/1) and the boss lands on a Monday (§25)", () => {
    for (const [act, weeks] of [[1, 3], [2, 2], [3, 1]] as const) {
      const map = generateMap(makeRng(`cal-${act}`), act);
      const boss = bossNode(map)!;
      // Interior rows = weeks*7; boss is one row above, on day weeks*7+1.
      expect(boss.row).toBe(weeks * 7);
      expect(boss.day).toBe(weeks * 7 + 1);
      // Every node's day = row+1, week = ceil(day/7).
      for (const n of map) {
        expect(n.day).toBe(n.row + 1);
        expect(n.week).toBe(Math.ceil(n.day / 7));
      }
      // The boss day is a "Monday" — the muster falls right before it.
      expect(isMusterDay(boss.day)).toBe(true);
    }
  });

  it("later acts are denser (wider) than earlier ones (§25)", () => {
    const widthOf = (act: number) =>
      Math.max(...generateMap(makeRng(`w-${act}`), act).map((n) => n.col)) + 1;
    expect(widthOf(3)).toBeGreaterThanOrEqual(widthOf(1));
  });

  it("opener tiles are gentle and ~1/3–1/2 of tiles are guarded (§27)", () => {
    const map = generateMap(makeRng("rhythm"), 1);
    for (const n of map.filter((n) => n.row === 0)) {
      expect(["attack", "defense", "gold"]).toContain(n.type); // gentle opener tile
      expect(n.tough).toBe(false);
      if (n.guarded) expect(n.difficulty).toBe("bronze");
    }
    // A low-combat route should usually exist: guard fraction in a sane band.
    const interior = map.filter((n) => n.type !== "boss");
    const frac = interior.filter((n) => n.guarded).length / interior.length;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.7);
  });

  it("guarded nodes carry a difficulty ring; unguarded ones don't (§27)", () => {
    const map = generateMap(makeRng("rings"), 2);
    for (const n of map) {
      if (n.guarded) expect(n.difficulty).toBeTruthy();
      else expect(n.difficulty).toBeUndefined();
    }
    expect(bossNode(map)!.guarded).toBe(true);
    expect(bossNode(map)!.difficulty).toBe("gold"); // Act-2 boss
  });

  it("only generates tile node types (§27)", () => {
    const valid = new Set<MapNode["type"]>([
      "attack", "defense", "power", "knowledge", "xp", "gold", "mana",
      "dwelling", "altar", "shrine", "merchant", "rest", "boss",
    ]);
    for (let i = 0; i < 30; i++) {
      const map = generateMap(makeRng(`types-${i}`), 1);
      for (const n of map) expect(valid.has(n.type)).toBe(true);
    }
  });

  it("sprinkles in growth nodes (dwelling/shrine/merchant) across many seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const map = generateMap(makeRng(`growth-${i}`), 1);
      for (const n of map) seen.add(n.type);
    }
    expect(seen.has("dwelling")).toBe(true);
    expect(seen.has("shrine")).toBe(true);
    expect(seen.has("merchant")).toBe(true);
    expect(seen.has("altar")).toBe(true);
  });
});
