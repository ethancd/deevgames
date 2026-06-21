import { z } from "zod";

export const Faction = z.enum([
  "Castle", "Rampart", "Tower", "Inferno",
  "Necropolis", "Dungeon", "Stronghold", "Fortress", "Conflux",
  "Neutral",
]);
export type Faction = z.infer<typeof Faction>;

// snake_case key into the image manifest; never a raw URL or path
export const ImageRef = z.string().regex(/^[a-z0-9_]+$/);

export const SourceCreature = z.object({
  id: z.string(),                  // "necropolis_skeleton"
  name: z.string(),                // "Skeleton"
  faction: Faction,
  tier: z.number().int().min(1).max(7),
  upgraded: z.boolean(),
  upgradeOf: z.string().nullable(),// id of base form (the upgrade arrow), or null
  attack: z.number().int(),
  defense: z.number().int(),
  hp: z.number().int(),
  damageMin: z.number().int(),
  damageMax: z.number().int(),
  speed: z.number().int(),
  growth: z.number().int(),        // weekly growth — a clean rarity/availability signal
  abilities: z.array(z.string()),  // ["Undead", "No morale penalty"]
  imageRef: ImageRef,
});
export type SourceCreature = z.infer<typeof SourceCreature>;

export const SpellSchool = z.enum(["Air", "Earth", "Fire", "Water", "All"]);

export const SourceSpell = z.object({
  id: z.string(),
  name: z.string(),
  school: SpellSchool,
  level: z.number().int().min(1).max(5),
  manaCost: z.number().int(),
  isCombat: z.boolean(),           // combat vs. adventure spell
  description: z.string(),
  effectTags: z.array(z.string()), // ["damage", "single-target"] — hints for the adapter
  imageRef: ImageRef,
});
export type SourceSpell = z.infer<typeof SourceSpell>;

export const ArtifactClass = z.enum(["Treasure", "Minor", "Major", "Relic"]);
export const ArtifactSlot = z.enum([
  "Head", "Neck", "Torso", "RightHand", "LeftHand",
  "Ring", "Feet", "Misc", "Special",
]);

export const SourceArtifact = z.object({
  id: z.string(),
  name: z.string(),
  class: ArtifactClass,            // maps cleanly to relic rarity
  slot: ArtifactSlot,
  bonuses: z.string(),             // "+2 Attack" — human-readable; adapter parses
  imageRef: ImageRef,
});
export type SourceArtifact = z.infer<typeof SourceArtifact>;

export const SourceHero = z.object({
  id: z.string(),
  name: z.string(),
  faction: Faction,
  heroClass: z.string(),           // "Death Knight", "Necromancer"
  specialty: z.string(),           // "Skeletons" — becomes the signature relic
  startingSkills: z.array(z.string()),
  imageRef: ImageRef,
});
export type SourceHero = z.infer<typeof SourceHero>;
