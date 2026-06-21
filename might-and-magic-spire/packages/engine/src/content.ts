// Engine content — sourced from @mms/data, the single validated corpus.
//
// The engine is content-agnostic (it adapts whatever Source* records it's
// handed), but a headless run needs a concrete bestiary, artifacts, spells and a
// hero. We wire to the real, schema-validated @mms/data corpus rather than
// carrying a hand-maintained copy — one source of truth, so the engine's numbers
// can never silently drift from the researcher's data.

import {
  creatures as allCreatures,
  artifacts as allArtifacts,
  heroes as allHeroes,
  spells as allSpells,
} from "@mms/data";
import type {
  SourceArtifact,
  SourceCreature,
  SourceHero,
  SourceSpell,
} from "@mms/schema";

const FACTION = "Necropolis";

/** Full creature corpus, including upgrade forms (Altar upgrades need them). */
export const ALL_CREATURES: SourceCreature[] = allCreatures;

/** Necropolis creatures (base + upgraded). */
export const CREATURES: SourceCreature[] = allCreatures.filter(
  (c) => c.faction === FACTION,
);

/** Base (un-upgraded) Necropolis forms — dwelling/encounter pools draw here. */
export const BASE_CREATURES: SourceCreature[] = CREATURES.filter((c) => !c.upgraded);

/** Combat spells (Shrines teach these; heroes cast them). */
export const SPELLS: SourceSpell[] = allSpells.filter((s) => s.isCombat);

/** Artifacts become equipment (Merchants sell them). Full corpus is fine. */
export const ARTIFACTS: SourceArtifact[] = allArtifacts;

/** Necropolis heroes; class+specialty derive the runtime hero. */
export const HEROES: SourceHero[] = allHeroes.filter((h) => h.faction === FACTION);

/** Galthran (Skeletons) is the v0 starting hero — falls back to any Necro hero. */
export const DEFAULT_HERO: SourceHero =
  HEROES.find((h) => h.id === "hero_galthran") ?? HEROES[0];

/** Look up a creature by id across the WHOLE corpus. */
export function creatureById(id: string): SourceCreature | undefined {
  return allCreatures.find((c) => c.id === id);
}

export function spellById(id: string): SourceSpell | undefined {
  return allSpells.find((s) => s.id === id);
}

export function artifactById(id: string): SourceArtifact | undefined {
  return allArtifacts.find((a) => a.id === id);
}

export function heroById(id: string): SourceHero | undefined {
  return allHeroes.find((h) => h.id === id);
}

/** The upgraded form of a creature, if one exists (Altar target). */
export function upgradeFormOf(id: string): SourceCreature | undefined {
  return allCreatures.find((c) => c.upgradeOf === id);
}
