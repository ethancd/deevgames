// Engine content — sourced from @mms/data, the single validated corpus.
//
// The engine is content-agnostic (it adapts whatever Source* records it's
// handed), but a headless run needs a concrete bestiary, artifacts, and a hero.
// At integration we wire that to the real, schema-validated @mms/data corpus
// rather than carrying a hand-maintained copy here — one source of truth, so
// the engine's numbers can never silently drift from the researcher's data.
//
// v0 ships Necropolis. We use the BASE creature forms for the player deck and
// enemy pools (upgrades are reserved for a later upgrade-arrow mechanic); the
// generation logic in run.ts filters this pool by tier exactly as before.

import {
  creatures as allCreatures,
  artifacts as allArtifacts,
  heroes as allHeroes,
} from "@mms/data";
import type {
  SourceArtifact,
  SourceCreature,
  SourceHero,
} from "@mms/schema";

const FACTION = "Necropolis";

/** Bestiary — Necropolis base forms, used for the player deck and enemies. */
export const CREATURES: SourceCreature[] = allCreatures.filter(
  (c) => c.faction === FACTION && !c.upgraded,
);

/** Artifacts become relics (rarity from ArtifactClass). Full corpus is fine. */
export const ARTIFACTS: SourceArtifact[] = allArtifacts;

/** Necropolis heroes; specialty becomes the signature starter relic. */
export const HEROES: SourceHero[] = allHeroes.filter((h) => h.faction === FACTION);

/** Galthran (Skeletons) is the v0 starting hero — falls back to any Necro hero. */
export const DEFAULT_HERO: SourceHero =
  HEROES.find((h) => h.id === "hero_galthran") ?? HEROES[0];

/** Look up a creature by id across the WHOLE corpus (handles boss/upgrade ids). */
export function creatureById(id: string): SourceCreature | undefined {
  return (
    CREATURES.find((c) => c.id === id) ?? allCreatures.find((c) => c.id === id)
  );
}
