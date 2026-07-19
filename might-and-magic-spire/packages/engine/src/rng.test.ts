import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";

describe("seeded RNG", () => {
  it("is deterministic: same seed → identical stream", () => {
    const a = makeRng("hello");
    const b = makeRng("hello");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 10 }, makeRng("seed-a").next);
    const b = Array.from({ length: 10 }, makeRng("seed-b").next);
    expect(a).not.toEqual(b);
  });

  it("next() stays in [0,1)", () => {
    const r = makeRng("range");
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("int(min,max) is inclusive and bounded", () => {
    const r = makeRng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = r.int(1, 6);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(6);
      seen.add(x);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6])); // hits every face
  });

  it("shuffle is a permutation and does not mutate input", () => {
    const r = makeRng("shuffle");
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("fork(label) gives independent but reproducible substreams", () => {
    const parent = makeRng("root");
    const f1a = parent.fork("map").next();
    const f1b = makeRng("root").fork("map").next();
    const f2 = makeRng("root").fork("combat").next();
    expect(f1a).toBe(f1b); // reproducible
    expect(f1a).not.toBe(f2); // independent namespace
  });
});
