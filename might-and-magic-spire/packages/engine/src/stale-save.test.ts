// Regression: a run persisted to localStorage BEFORE a hero field existed must
// not crash when restored and recomputed. The relics work added
// `Hero.baseSpellbook`; an old save lacks it, and `recomputeHero` (run on every
// equip) read `hero.baseSpellbook.slice()` → "Cannot read 'slice' of undefined".
import { describe, it, expect } from "vitest";
import { startRun, recomputeHero } from "./run";

describe("stale-save tolerance (recomputeHero)", () => {
  it("survives a hero missing baseSpellbook (pre-relics save) and self-heals", () => {
    const run = startRun("stale");
    const stale = { ...run.hero } as Record<string, unknown>;
    delete stale.baseSpellbook;
    expect(() => recomputeHero(stale as never)).not.toThrow();
    const fixed = recomputeHero(stale as never);
    expect(Array.isArray(fixed.spellbook)).toBe(true);
    expect(Array.isArray(fixed.baseSpellbook)).toBe(true); // backfilled
  });

  it("survives a hero missing base primary fields too", () => {
    const run = startRun("stale2");
    const stale = { ...run.hero } as Record<string, unknown>;
    delete stale.baseSpellbook;
    delete stale.baseAttack;
    delete stale.baseDefense;
    delete stale.basePower;
    delete stale.baseKnowledge;
    expect(() => recomputeHero(stale as never)).not.toThrow();
    const fixed = recomputeHero(stale as never);
    // base fields backfilled from the live primaries; attack stays sane.
    expect(typeof fixed.baseAttack).toBe("number");
    expect(fixed.attack).toBe(fixed.baseAttack); // no equipment → equal
  });
});
