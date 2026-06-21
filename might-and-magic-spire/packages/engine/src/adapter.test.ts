import { describe, it, expect } from "vitest";
import {
  fixtureCreature,
  fixtureCard,
  fixtureArtifact,
  fixtureHero,
} from "@mms/schema";
import {
  adapt,
  adaptArtifact,
  signatureRelicForHero,
  costForTier,
  rarityForCreature,
  rarityForArtifactClass,
} from "./index";
import { CREATURES } from "./content";

describe("Source → Card adapter", () => {
  it("adapt(fixtureCreature) deep-equals fixtureCard (the pinned contract)", () => {
    expect(adapt(fixtureCreature)).toEqual(fixtureCard);
  });

  it("damage magnitude equals the creature's attack stat", () => {
    for (const c of CREATURES) {
      const card = adapt(c);
      const dmg = card.effects.find((e) => e.kind === "damage");
      expect(dmg?.amount).toBe(c.attack);
    }
  });

  it("cost compresses 7 tiers into a 1–3 curve", () => {
    expect(costForTier(1)).toBe(1);
    expect(costForTier(2)).toBe(1);
    expect(costForTier(3)).toBe(2);
    expect(costForTier(4)).toBe(2);
    expect(costForTier(5)).toBe(3);
    expect(costForTier(7)).toBe(3);
  });

  it("rarity reads off growth (inverse availability) with tier guardrails", () => {
    expect(rarityForCreature(fixtureCreature)).toBe("common"); // growth 12
    const bone = CREATURES.find((c) => c.id === "necropolis_bone_dragon")!;
    // growth 1, tier 7 → never common
    expect(rarityForCreature(bone)).not.toBe("common");
  });

  it("produces only schema-valid rarities for the whole bestiary", () => {
    const valid = new Set(["starter", "common", "uncommon", "rare"]);
    for (const c of CREATURES) expect(valid.has(adapt(c).rarity)).toBe(true);
  });
});

describe("Artifact → Relic adapter", () => {
  it("maps ArtifactClass onto the rarity ladder", () => {
    expect(rarityForArtifactClass("Treasure")).toBe("common");
    expect(rarityForArtifactClass("Minor")).toBe("uncommon");
    expect(rarityForArtifactClass("Major")).toBe("rare");
    expect(rarityForArtifactClass("Relic")).toBe("rare");
  });

  it("adapts Centaur's Axe into a Strength relic (uncommon)", () => {
    const relic = adaptArtifact(fixtureArtifact);
    expect(relic.rarity).toBe("uncommon");
    expect(relic.effect).toEqual({ kind: "startStrength", amount: 2 });
    expect(relic.name).toBe("Centaur's Axe");
  });
});

describe("Hero specialty → signature relic", () => {
  it("turns Galthran's Skeletons specialty into a starter Strength relic", () => {
    const sig = signatureRelicForHero(fixtureHero);
    expect(sig.rarity).toBe("starter");
    expect(sig.effect).toEqual({ kind: "startStrength", amount: 2 });
    expect(sig.name).toContain("Galthran");
  });
});
