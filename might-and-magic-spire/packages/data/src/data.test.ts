import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SourceCreature,
  SourceSpell,
  SourceArtifact,
  SourceHero,
  ImageManifestEntry,
} from "@mms/schema";
import {
  creatures,
  spells,
  artifacts,
  heroes,
  manifest,
  manifestByRef,
} from "./index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo: .../might-and-magic-spire/packages/data/src -> up 3 to the project root
const PROJECT_ROOT = join(__dirname, "..", "..", "..");

describe("every record validates against @mms/schema", () => {
  it("creatures", () => {
    expect(creatures.length).toBeGreaterThan(0);
    for (const c of creatures) expect(() => SourceCreature.parse(c)).not.toThrow();
  });
  it("spells", () => {
    expect(spells.length).toBeGreaterThan(0);
    for (const s of spells) expect(() => SourceSpell.parse(s)).not.toThrow();
  });
  it("artifacts", () => {
    expect(artifacts.length).toBeGreaterThan(0);
    for (const a of artifacts) expect(() => SourceArtifact.parse(a)).not.toThrow();
  });
  it("heroes", () => {
    expect(heroes.length).toBeGreaterThan(0);
    for (const h of heroes) expect(() => SourceHero.parse(h)).not.toThrow();
  });
  it("manifest entries", () => {
    expect(manifest.length).toBeGreaterThan(0);
    for (const m of manifest) expect(() => ImageManifestEntry.parse(m)).not.toThrow();
  });
});

describe("ids are unique within each record type", () => {
  const uniq = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
  it("creatures", () => expect(uniq(creatures)).toBe(true));
  it("spells", () => expect(uniq(spells)).toBe(true));
  it("artifacts", () => expect(uniq(artifacts)).toBe(true));
  it("heroes", () => expect(uniq(heroes)).toBe(true));
});

describe("creature upgrade arrows are consistent", () => {
  const ids = new Set(creatures.map((c) => c.id));
  it("upgradeOf points at a known base creature (or null)", () => {
    for (const c of creatures) {
      if (c.upgradeOf !== null) expect(ids.has(c.upgradeOf)).toBe(true);
    }
  });
  it("upgraded flag agrees with upgradeOf", () => {
    for (const c of creatures) {
      expect(c.upgraded).toBe(c.upgradeOf !== null);
    }
  });
  it("base creatures have a matching upgrade and vice versa", () => {
    const bases = creatures.filter((c) => !c.upgraded);
    const upgrades = creatures.filter((c) => c.upgraded);
    // Each base of tier T should have at least one upgrade pointing at it.
    for (const b of bases) {
      expect(upgrades.some((u) => u.upgradeOf === b.id)).toBe(true);
    }
  });
});

describe("every imageRef resolves to a manifest entry", () => {
  const all = [...creatures, ...spells, ...artifacts, ...heroes];
  it("each record's imageRef has a manifest entry", () => {
    for (const r of all) {
      expect(manifestByRef.has(r.imageRef), `${r.id} -> ${r.imageRef}`).toBe(true);
    }
  });
  it("manifest refs match the ImageRef pattern", () => {
    for (const m of manifest) expect(m.ref).toMatch(/^[a-z0-9_]+$/);
  });
});

describe("every manifest localPath file exists on disk", () => {
  it("the WebP file is present for each entry", () => {
    for (const m of manifest) {
      const abs = join(PROJECT_ROOT, m.localPath);
      expect(existsSync(abs), `missing ${m.localPath}`).toBe(true);
    }
  });
});

describe("v0 scope: all of Necropolis", () => {
  it("has 7 base + 7 upgrade Necropolis creatures across tiers 1-7", () => {
    const necro = creatures.filter((c) => c.faction === "Necropolis");
    expect(necro.length).toBe(14);
    const tiers = new Set(necro.map((c) => c.tier));
    expect([...tiers].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("has both Necromancer and Death Knight heroes", () => {
    const classes = new Set(heroes.map((h) => h.heroClass));
    expect(classes.has("Necromancer")).toBe(true);
    expect(classes.has("Death Knight")).toBe(true);
  });
  it("covers all four artifact classes", () => {
    const classes = new Set(artifacts.map((a) => a.class));
    for (const c of ["Treasure", "Minor", "Major", "Relic"]) {
      expect(classes.has(c as (typeof artifacts)[number]["class"])).toBe(true);
    }
  });
  it("has combat spells across all four elemental schools", () => {
    const schools = new Set(spells.map((s) => s.school));
    for (const s of ["Air", "Earth", "Fire", "Water"]) {
      expect(schools.has(s as (typeof spells)[number]["school"])).toBe(true);
    }
  });
});
