import { describe, it, expect } from "vitest";
import {
  SourceCreature, SourceSpell, SourceArtifact, SourceHero,
} from "./source";
import { CardDef } from "./card";
import { ImageManifestEntry } from "./manifest";
import {
  fixtureCreature, fixtureSpell, fixtureArtifact, fixtureHero,
  fixtureCard, fixtureManifestEntry,
} from "./fixtures";

// This suite is the proof that the contract holds. If a schema and its
// fixture ever drift apart, this fails — which is exactly what we want, since
// every downstream agent builds against these fixtures.

describe("fixtures validate against their schemas", () => {
  it("fixtureCreature", () => {
    expect(SourceCreature.parse(fixtureCreature)).toEqual(fixtureCreature);
  });

  it("fixtureSpell", () => {
    expect(SourceSpell.parse(fixtureSpell)).toEqual(fixtureSpell);
  });

  it("fixtureArtifact", () => {
    expect(SourceArtifact.parse(fixtureArtifact)).toEqual(fixtureArtifact);
  });

  it("fixtureHero", () => {
    expect(SourceHero.parse(fixtureHero)).toEqual(fixtureHero);
  });

  it("fixtureCard", () => {
    expect(CardDef.parse(fixtureCard)).toEqual(fixtureCard);
  });

  it("fixtureManifestEntry", () => {
    expect(ImageManifestEntry.parse(fixtureManifestEntry)).toEqual(fixtureManifestEntry);
  });
});

describe("the Source → Card seam is wired correctly", () => {
  it("the card's sourceId points back at the creature it was adapted from", () => {
    expect(fixtureCard.sourceId).toBe(fixtureCreature.id);
  });

  it("the card reuses the creature's image ref (content art, not chrome)", () => {
    expect(fixtureCard.imageRef).toBe(fixtureCreature.imageRef);
  });

  it("every Source* imageRef resolves to the manifest ref", () => {
    expect(fixtureManifestEntry.ref).toBe(fixtureCreature.imageRef);
  });
});

describe("the ImageRef regex rejects raw paths and urls", () => {
  it("accepts snake_case keys", () => {
    expect(() => SourceCreature.parse({ ...fixtureCreature, imageRef: "necropolis_skeleton" })).not.toThrow();
  });

  it("rejects a path", () => {
    expect(() => SourceCreature.parse({ ...fixtureCreature, imageRef: "assets/images/x.webp" })).toThrow();
  });

  it("rejects a url", () => {
    expect(() => SourceCreature.parse({ ...fixtureCreature, imageRef: "https://example.com/x.png" })).toThrow();
  });
});
