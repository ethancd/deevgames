import type {
  SourceCreature, SourceSpell, SourceArtifact, SourceHero,
} from "./source";
import type { CardDef } from "./card";
import type { ImageManifestEntry } from "./manifest";

export const fixtureCreature: SourceCreature = {
  id: "necropolis_skeleton",
  name: "Skeleton",
  faction: "Necropolis",
  tier: 1,
  upgraded: false,
  upgradeOf: null,
  attack: 5, defense: 4, hp: 6,
  damageMin: 1, damageMax: 3,
  speed: 4, growth: 12,
  abilities: ["Undead", "No morale penalty"],
  imageRef: "necropolis_skeleton",
};

export const fixtureSpell: SourceSpell = {
  id: "spell_magic_arrow",
  name: "Magic Arrow",
  school: "All",
  level: 1,
  manaCost: 5,
  isCombat: true,
  description: "Deals direct magic damage to a single target.",
  effectTags: ["damage", "single-target"],
  imageRef: "spell_magic_arrow",
};

export const fixtureArtifact: SourceArtifact = {
  id: "artifact_centaurs_axe",
  name: "Centaur's Axe",
  class: "Minor",
  slot: "RightHand",
  bonuses: "+2 Attack",
  imageRef: "artifact_centaurs_axe",
};

export const fixtureHero: SourceHero = {
  id: "hero_galthran",
  name: "Galthran",
  faction: "Necropolis",
  heroClass: "Death Knight",
  specialty: "Skeletons",
  startingSkills: ["Necromancy", "Offense"],
  imageRef: "hero_galthran",
};

// The Source → Card adapter's canonical output for the Skeleton.
// Mechanics owns the adapter; this fixture is the agreed shape of its result.
export const fixtureCard: CardDef = {
  id: "card_skeleton",
  sourceId: "necropolis_skeleton",
  name: "Skeleton",
  type: "strike",
  faction: "Necropolis",
  cost: 1,
  rarity: "common",
  effects: [{ kind: "damage", amount: 5, target: "enemy" }],
  upgradeOf: null,
  text: "Deal 5 damage.",
  imageRef: "necropolis_skeleton",
};

export const fixtureManifestEntry: ImageManifestEntry = {
  ref: "necropolis_skeleton",
  localPath: "assets/images/necropolis_skeleton.webp",
  sourceUrl: "https://heroes.thelazy.net/index.php/Skeleton",
  attribution: "HoMM3 / Heroes Community wiki, reference use",
  width: 100,
  height: 130,
};
