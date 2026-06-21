// Built-in content. The engine is content-agnostic — it adapts whatever
// Source* records it's handed — but a full headless run needs *some* bestiary,
// artifacts, and a hero. These are minimal, schema-valid HoMM3 records (the
// canonical fixtures plus a handful more) so the engine can stand alone and the
// integration test can resolve a real run. The data package will supply the
// full corpus later; the engine only depends on the SHAPES, not these values.

import type {
  SourceArtifact,
  SourceCreature,
  SourceHero,
} from "@mms/schema";

/** Bestiary — used both for the player's adapted deck and for enemies. */
export const CREATURES: SourceCreature[] = [
  {
    id: "necropolis_skeleton",
    name: "Skeleton",
    faction: "Necropolis",
    tier: 1,
    upgraded: false,
    upgradeOf: null,
    attack: 5,
    defense: 4,
    hp: 6,
    damageMin: 1,
    damageMax: 3,
    speed: 4,
    growth: 12,
    abilities: ["Undead", "No morale penalty"],
    imageRef: "necropolis_skeleton",
  },
  {
    id: "necropolis_zombie",
    name: "Zombie",
    faction: "Necropolis",
    tier: 2,
    upgraded: false,
    upgradeOf: null,
    attack: 5,
    defense: 5,
    hp: 15,
    damageMin: 2,
    damageMax: 3,
    speed: 3,
    growth: 8,
    abilities: ["Undead"],
    imageRef: "necropolis_zombie",
  },
  {
    id: "necropolis_wight",
    name: "Wight",
    faction: "Necropolis",
    tier: 3,
    upgraded: false,
    upgradeOf: null,
    attack: 7,
    defense: 7,
    hp: 18,
    damageMin: 3,
    damageMax: 5,
    speed: 5,
    growth: 5,
    abilities: ["Undead", "Regenerates"],
    imageRef: "necropolis_wight",
  },
  {
    id: "necropolis_vampire",
    name: "Vampire",
    faction: "Necropolis",
    tier: 4,
    upgraded: false,
    upgradeOf: null,
    attack: 10,
    defense: 9,
    hp: 30,
    damageMin: 5,
    damageMax: 8,
    speed: 6,
    growth: 4,
    abilities: ["Undead", "No retaliation"],
    imageRef: "necropolis_vampire",
  },
  {
    id: "necropolis_lich",
    name: "Lich",
    faction: "Necropolis",
    tier: 5,
    upgraded: false,
    upgradeOf: null,
    attack: 13,
    defense: 10,
    hp: 30,
    damageMin: 11,
    damageMax: 13,
    speed: 6,
    growth: 3,
    abilities: ["Undead", "Death cloud"],
    imageRef: "necropolis_lich",
  },
  {
    id: "necropolis_bone_dragon",
    name: "Bone Dragon",
    faction: "Necropolis",
    tier: 7,
    upgraded: false,
    upgradeOf: null,
    attack: 17,
    defense: 15,
    hp: 150,
    damageMin: 25,
    damageMax: 50,
    speed: 9,
    growth: 1,
    abilities: ["Undead", "Dragon", "Reduces enemy morale"],
    imageRef: "necropolis_bone_dragon",
  },
];

export const ARTIFACTS: SourceArtifact[] = [
  {
    id: "artifact_centaurs_axe",
    name: "Centaur's Axe",
    class: "Minor",
    slot: "RightHand",
    bonuses: "+2 Attack",
    imageRef: "artifact_centaurs_axe",
  },
  {
    id: "artifact_shield_of_the_dwarven_lords",
    name: "Shield of the Dwarven Lords",
    class: "Major",
    slot: "LeftHand",
    bonuses: "+3 Defense",
    imageRef: "artifact_shield_of_the_dwarven_lords",
  },
  {
    id: "artifact_ring_of_vitality",
    name: "Ring of Vitality",
    class: "Treasure",
    slot: "Ring",
    bonuses: "+1 Power",
    imageRef: "artifact_ring_of_vitality",
  },
];

export const HEROES: SourceHero[] = [
  {
    id: "hero_galthran",
    name: "Galthran",
    faction: "Necropolis",
    heroClass: "Death Knight",
    specialty: "Skeletons",
    startingSkills: ["Necromancy", "Offense"],
    imageRef: "hero_galthran",
  },
];

export const DEFAULT_HERO = HEROES[0];

export function creatureById(id: string): SourceCreature | undefined {
  return CREATURES.find((c) => c.id === id);
}
