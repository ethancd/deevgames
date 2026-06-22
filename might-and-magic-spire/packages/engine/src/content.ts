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

/** The default starting faction (preserves the v0 / keystone behavior). */
export const DEFAULT_FACTION = "Necropolis";

/** Every playable faction in the corpus, in stable display order. */
export const FACTIONS: string[] = (() => {
  const order = ["Necropolis", "Castle", "Stronghold"];
  const seen = new Set<string>(allCreatures.map((c) => c.faction as string));
  const known = order.filter((f) => seen.has(f));
  // Append any faction present in data but not in the explicit order (forward-compat).
  for (const f of seen) if (!known.includes(f)) known.push(f);
  return known;
})();

/** Full creature corpus, including upgrade forms (Altar upgrades need them). */
export const ALL_CREATURES: SourceCreature[] = allCreatures;

/** All creatures of one faction (base + upgraded). `faction` is a plain string
 *  (the run/app layers don't carry the schema enum); we compare as strings. */
export function creaturesOfFaction(faction: string): SourceCreature[] {
  return allCreatures.filter((c) => (c.faction as string) === faction);
}

/** Base (un-upgraded) forms of one faction — dwelling/starting-army pools. */
export function basePool(faction: string): SourceCreature[] {
  return creaturesOfFaction(faction).filter((c) => !c.upgraded);
}

/** Base (un-upgraded) forms across ALL factions — the encounter pool draws here
 *  so foes are varied and never the player's own civil-war army. */
export const ALL_BASE_CREATURES: SourceCreature[] = allCreatures.filter(
  (c) => !c.upgraded,
);

/** Necropolis creatures (base + upgraded). Kept for back-compat. */
export const CREATURES: SourceCreature[] = creaturesOfFaction(DEFAULT_FACTION);

/** Base (un-upgraded) Necropolis forms. Kept for back-compat. */
export const BASE_CREATURES: SourceCreature[] = basePool(DEFAULT_FACTION);

/**
 * Spells the engine CUTS from the usable pool — the data record stays intact,
 * but Shrines/starting books never offer these. (BALANCE_PROPOSALS open-Q #5.)
 *
 * `spell_shield` (Shield) and `spell_stone_skin` (Stone Skin) are identical
 * +defense buffs today; differentiating Shield needs the `block` field (MEDIUM),
 * so we ship ONE and cut the other. Stone Skin stays; Shield is removed.
 */
export const CUT_SPELLS: ReadonlySet<string> = new Set(["spell_shield"]);

/** Combat spells (Shrines teach these; heroes cast them), minus CUT_SPELLS. */
export const SPELLS: SourceSpell[] = allSpells.filter(
  (s) => s.isCombat && !CUT_SPELLS.has(s.id),
);

/** Artifacts become equipment (Merchants sell them). Full corpus is fine. */
export const ARTIFACTS: SourceArtifact[] = allArtifacts;

/** Every playable hero (all factions); class+specialty derive the runtime hero. */
export const PLAYABLE_HEROES: SourceHero[] = allHeroes;

/** Heroes of one faction. */
export function heroesOfFaction(faction: string): SourceHero[] {
  return allHeroes.filter((h) => (h.faction as string) === faction);
}

/** Necropolis heroes. Kept for back-compat. */
export const HEROES: SourceHero[] = heroesOfFaction(DEFAULT_FACTION);

/** Galthran (Skeletons) is the default starting hero — falls back to any hero. */
export const DEFAULT_HERO: SourceHero =
  allHeroes.find((h) => h.id === "hero_galthran") ?? HEROES[0] ?? allHeroes[0];

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
