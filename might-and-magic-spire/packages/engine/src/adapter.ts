// The Source → Card adapter — the seam where HoMM3 stats become card numbers.
//
// THIS IS DESIGN, NOT ENGINEERING. The balance decisions live here and are
// documented in ADAPTER.md. Ethan vetoes balance; the formulas are laid out to
// be read and argued with, not buried.
//
// HARD CONSTRAINT: adapt(fixtureCreature) MUST deep-equal fixtureCard. There is
// a test asserting exactly this. Touch a number here, run the test.

import type {
  CardDef,
  SourceArtifact,
  SourceCreature,
  SourceHero,
} from "@mms/schema";
import type { CardType, Effect, Rarity, ArtifactClass } from "./schema-types";
import type { Relic, RelicEffect } from "./types";

// ---------------------------------------------------------------------------
// CREATURE → CARD
// ---------------------------------------------------------------------------

/**
 * Card energy cost from creature tier.
 *
 * HoMM tiers run 1–7. Spire energy is 3/turn, costs 0–3 (STS-like). We compress
 * 7 tiers into a 0–3 cost curve so the cheapest creatures are playable two-a-
 * turn and the apex creatures are an entire turn's energy:
 *
 *   tier 1–2 → 1   (skeletons, pikemen: the bread-and-butter strikes)
 *   tier 3–4 → 2
 *   tier 5–6 → 3
 *   tier 7   → 3   (capped; apex creatures lean on big magnitude, not cost)
 *
 * Skeleton is tier 1 → cost 1. ✓ (matches fixtureCard)
 */
export function costForTier(tier: number): number {
  if (tier <= 2) return 1;
  if (tier <= 4) return 2;
  return 3;
}

/**
 * Attack magnitude. We use the creature's **attack** stat directly as the
 * damage number — it's the cleanest read of "how hard does this thing hit" and
 * it's what the fixture pins (Skeleton attack 5 → "Deal 5 damage.").
 *
 * The damageMin/damageMax range is flavor we intentionally drop: a deckbuilder
 * wants a single deterministic number on the card face, not a dice roll, so
 * combat stays readable and the telegraph stays honest.
 *
 * Skeleton attack 5 → magnitude 5. ✓
 */
export function magnitudeForCreature(c: SourceCreature): number {
  return c.attack;
}

/**
 * Rarity from weekly **growth** (inverse availability) with **tier** as a
 * tiebreak. In HoMM, growth is how many spawn per week — Skeletons flood in at
 * ~12/week, Archangels trickle at 1/week. So growth is a ready-made rarity
 * signal: common things are common.
 *
 *   growth >= 10 → common      (Skeleton growth 12 → common ✓)
 *   growth 6–9   → uncommon
 *   growth <= 5  → rare
 *
 * Tier nudges the edges: a tier-7 creature is never "common" no matter its
 * growth, and a tier-1 creature is never "rare".
 */
export function rarityForCreature(c: SourceCreature): Rarity {
  let base: Rarity;
  if (c.growth >= 10) base = "common";
  else if (c.growth >= 6) base = "uncommon";
  else base = "rare";

  // Tier guardrails so the growth signal can't produce absurdities.
  if (c.tier >= 7 && base === "common") base = "uncommon";
  if (c.tier >= 6 && base === "common") base = "uncommon";
  if (c.tier <= 1 && base === "rare") base = "uncommon";

  return base;
}

/** A creature card is always a "strike" — it's a body you throw at the enemy. */
function typeForCreature(_c: SourceCreature): CardType {
  return "strike";
}

/** Stable card id derived from the source id: `card_<sourceTail>`. */
function cardIdFor(c: SourceCreature): string {
  // "necropolis_skeleton" → "card_skeleton"; falls back to full id if no "_".
  const tail = c.id.includes("_") ? c.id.slice(c.id.indexOf("_") + 1) : c.id;
  return `card_${tail}`;
}

/**
 * Adapt a SourceCreature into a playable CardDef.
 *
 * INVARIANT: adapt(fixtureCreature) deep-equals fixtureCard.
 */
export function adaptCreature(c: SourceCreature): CardDef {
  const amount = magnitudeForCreature(c);
  const effects: Effect[] = [{ kind: "damage", amount, target: "enemy" }];

  return {
    id: cardIdFor(c),
    sourceId: c.id,
    name: c.name,
    type: typeForCreature(c),
    faction: c.faction,
    cost: costForTier(c.tier),
    rarity: rarityForCreature(c),
    effects,
    upgradeOf: c.upgradeOf,
    text: `Deal ${amount} damage.`,
    imageRef: c.imageRef,
  };
}

/** Public entry point named `adapt` per the brief. */
export const adapt = adaptCreature;

// ---------------------------------------------------------------------------
// ARTIFACT → RELIC
// ---------------------------------------------------------------------------

/**
 * ArtifactClass maps cleanly onto Spire's Rarity ladder. HoMM has no "starter"
 * tier of artifact, so "starter" is reserved for the hero's signature relic.
 *
 *   Treasure → common
 *   Minor    → uncommon   (Centaur's Axe is Minor → uncommon)
 *   Major    → rare
 *   Relic    → rare       (the apex class; same display rarity, richer effect)
 */
export function rarityForArtifactClass(cls: ArtifactClass): Rarity {
  switch (cls) {
    case "Treasure":
      return "common";
    case "Minor":
      return "uncommon";
    case "Major":
      return "rare";
    case "Relic":
      return "rare";
  }
}

/**
 * Parse a relic's mechanical effect from its human-readable `bonuses` string.
 * HoMM artifact bonuses are terse ("+2 Attack", "+1 Defense", "+350 Spell
 * Points"). We map the common stat words onto combat hooks:
 *
 *   "+N Attack"          → +N Strength each combat (startStrength)
 *   "+N Defense"         → +N*2 starting Block each combat (startBlock)
 *   "+N Knowledge/Spell" → +1 card draw / turn (drawBonus) if N large enough
 *   "+N Power/Spell Pwr" → +1 energy / turn (startEnergy)
 *   anything else        → flavor (none)
 *
 * The Attack→Strength and Defense→Block lines are the load-bearing ones; the
 * rest are best-effort and documented in ADAPTER.md.
 */
export function effectForArtifactBonuses(bonuses: string): RelicEffect {
  const m = /([+-]?\d+)\s*([A-Za-z ]+)/.exec(bonuses);
  if (!m) return { kind: "none" };
  const n = parseInt(m[1], 10);
  const stat = m[2].trim().toLowerCase();

  if (stat.startsWith("attack")) return { kind: "startStrength", amount: n };
  if (stat.startsWith("defense")) return { kind: "startBlock", amount: n * 2 };
  if (stat.startsWith("power") || stat.includes("spell power"))
    return { kind: "startEnergy", amount: n >= 1 ? 1 : 0 };
  if (stat.startsWith("knowledge") || stat.includes("spell"))
    return { kind: "drawBonus", amount: n >= 1 ? 1 : 0 };

  return { kind: "none" };
}

export function adaptArtifact(a: SourceArtifact): Relic {
  return {
    id: `relic_${a.id.includes("_") ? a.id.slice(a.id.indexOf("_") + 1) : a.id}`,
    name: a.name,
    rarity: rarityForArtifactClass(a.class),
    description: a.bonuses,
    imageRef: a.imageRef,
    effect: effectForArtifactBonuses(a.bonuses),
  };
}

// ---------------------------------------------------------------------------
// HERO SPECIALTY → SIGNATURE RELIC
// ---------------------------------------------------------------------------

/**
 * A hero's `specialty` becomes their signature starting relic — the run's
 * identity piece. These are deliberately stronger than common artifacts (they
 * define a build) and get rarity "starter": owned from turn one, never offered
 * again.
 *
 * The effect is keyed off the specialty word where we recognize it; otherwise a
 * generic "+1 Strength" signature so every hero has a working relic.
 *
 *   "Skeletons"  → +2 Strength each combat (Galthran's necro-bruiser identity)
 *   "Offense"    → +2 Strength
 *   "Armorer"    → +4 starting Block
 *   "Wisdom"     → +1 energy / turn
 *   "Logistics"  → +1 card draw / turn
 *   (fallback)   → +1 Strength
 */
export function signatureEffectForSpecialty(specialty: string): RelicEffect {
  const s = specialty.toLowerCase();
  if (s.includes("skeleton")) return { kind: "startStrength", amount: 2 };
  if (s.includes("offense")) return { kind: "startStrength", amount: 2 };
  if (s.includes("armor")) return { kind: "startBlock", amount: 4 };
  if (s.includes("wisdom") || s.includes("intelligence"))
    return { kind: "startEnergy", amount: 1 };
  if (s.includes("logistics") || s.includes("scouting"))
    return { kind: "drawBonus", amount: 1 };
  return { kind: "startStrength", amount: 1 };
}

export function signatureRelicForHero(h: SourceHero): Relic {
  return {
    id: `relic_signature_${h.id.includes("_") ? h.id.slice(h.id.indexOf("_") + 1) : h.id}`,
    name: `${h.name}'s ${h.specialty}`,
    rarity: "starter",
    description: `Signature of ${h.name} (${h.heroClass}): specialty ${h.specialty}.`,
    imageRef: h.imageRef,
    effect: signatureEffectForSpecialty(h.specialty),
  };
}
