// Hand-authored Necropolis creature roster (HoMM3: Shadow of Death stats).
//
// Source of truth for v0 because the scrape hosts (heroes.thelazy.net, fandom)
// are unreachable from the build environment (HTTP 403, egress allowlist). Stats
// are transcribed from the HoMM3 SoD creature tables. When the scrape pipeline
// can reach the sources, reconcile `pnpm scrape` output against these values.
//
// upgradeOf is the upgrade arrow the game runs on: every upgraded creature
// points at the id of its base form; every base form is null.

import type { SourceCreature } from "@mms/schema";

const N = "Necropolis" as const;

export const necropolisCreatures: SourceCreature[] = [
  // ── Tier 1 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_skeleton",
    name: "Skeleton",
    faction: N,
    tier: 1,
    upgraded: false,
    upgradeOf: null,
    attack: 5, defense: 4, hp: 6,
    damageMin: 1, damageMax: 3,
    speed: 4, growth: 12,
    abilities: ["Undead", "No morale penalty"],
    imageRef: "necropolis_skeleton",
  },
  {
    id: "necropolis_skeleton_warrior",
    name: "Skeleton Warrior",
    faction: N,
    tier: 1,
    upgraded: true,
    upgradeOf: "necropolis_skeleton",
    attack: 6, defense: 6, hp: 6,
    damageMin: 1, damageMax: 3,
    speed: 5, growth: 12,
    abilities: ["Undead", "No morale penalty"],
    imageRef: "necropolis_skeleton_warrior",
  },

  // ── Tier 2 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_walking_dead",
    name: "Walking Dead",
    faction: N,
    tier: 2,
    upgraded: false,
    upgradeOf: null,
    attack: 5, defense: 5, hp: 15,
    damageMin: 2, damageMax: 3,
    speed: 3, growth: 9,
    abilities: ["Undead", "No morale penalty"],
    imageRef: "necropolis_walking_dead",
  },
  {
    id: "necropolis_zombie",
    name: "Zombie",
    faction: N,
    tier: 2,
    upgraded: true,
    upgradeOf: "necropolis_walking_dead",
    attack: 5, defense: 5, hp: 20,
    damageMin: 2, damageMax: 3,
    speed: 4, growth: 9,
    abilities: ["Undead", "No morale penalty", "Disease"],
    imageRef: "necropolis_zombie",
  },

  // ── Tier 3 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_wight",
    name: "Wight",
    faction: N,
    tier: 3,
    upgraded: false,
    upgradeOf: null,
    attack: 7, defense: 7, hp: 18,
    damageMin: 3, damageMax: 5,
    speed: 5, growth: 7,
    abilities: ["Undead", "No morale penalty", "Regeneration"],
    imageRef: "necropolis_wight",
  },
  {
    id: "necropolis_wraith",
    name: "Wraith",
    faction: N,
    tier: 3,
    upgraded: true,
    upgradeOf: "necropolis_wight",
    attack: 7, defense: 7, hp: 18,
    damageMin: 3, damageMax: 5,
    speed: 7, growth: 7,
    abilities: ["Undead", "No morale penalty", "Regeneration", "Drains enemy mana"],
    imageRef: "necropolis_wraith",
  },

  // ── Tier 4 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_vampire",
    name: "Vampire",
    faction: N,
    tier: 4,
    upgraded: false,
    upgradeOf: null,
    attack: 10, defense: 9, hp: 30,
    damageMin: 5, damageMax: 8,
    speed: 6, growth: 5,
    abilities: ["Undead", "No morale penalty", "Flying", "No enemy retaliation"],
    imageRef: "necropolis_vampire",
  },
  {
    id: "necropolis_vampire_lord",
    name: "Vampire Lord",
    faction: N,
    tier: 4,
    upgraded: true,
    upgradeOf: "necropolis_vampire",
    attack: 10, defense: 10, hp: 40,
    damageMin: 5, damageMax: 8,
    speed: 9, growth: 5,
    abilities: [
      "Undead", "No morale penalty", "Flying",
      "No enemy retaliation", "Life drain",
    ],
    imageRef: "necropolis_vampire_lord",
  },

  // ── Tier 5 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_lich",
    name: "Lich",
    faction: N,
    tier: 5,
    upgraded: false,
    upgradeOf: null,
    attack: 13, defense: 10, hp: 30,
    damageMin: 11, damageMax: 13,
    speed: 6, growth: 4,
    abilities: ["Undead", "No morale penalty", "Ranged", "Death cloud attack"],
    imageRef: "necropolis_lich",
  },
  {
    id: "necropolis_power_lich",
    name: "Power Lich",
    faction: N,
    tier: 5,
    upgraded: true,
    upgradeOf: "necropolis_lich",
    attack: 13, defense: 10, hp: 40,
    damageMin: 11, damageMax: 15,
    speed: 7, growth: 4,
    abilities: [
      "Undead", "No morale penalty", "Ranged",
      "Death cloud attack", "24 shots",
    ],
    imageRef: "necropolis_power_lich",
  },

  // ── Tier 6 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_black_knight",
    name: "Black Knight",
    faction: N,
    tier: 6,
    upgraded: false,
    upgradeOf: null,
    attack: 16, defense: 16, hp: 120,
    damageMin: 15, damageMax: 30,
    speed: 7, growth: 3,
    abilities: ["Undead", "No morale penalty", "Curse"],
    imageRef: "necropolis_black_knight",
  },
  {
    id: "necropolis_dread_knight",
    name: "Dread Knight",
    faction: N,
    tier: 6,
    upgraded: true,
    upgradeOf: "necropolis_black_knight",
    attack: 18, defense: 18, hp: 120,
    damageMin: 15, damageMax: 30,
    speed: 9, growth: 3,
    abilities: ["Undead", "No morale penalty", "Curse", "Death blow"],
    imageRef: "necropolis_dread_knight",
  },

  // ── Tier 7 ─────────────────────────────────────────────────────────────
  {
    id: "necropolis_bone_dragon",
    name: "Bone Dragon",
    faction: N,
    tier: 7,
    upgraded: false,
    upgradeOf: null,
    attack: 17, defense: 15, hp: 150,
    damageMin: 25, damageMax: 50,
    speed: 9, growth: 1,
    abilities: [
      "Undead", "No morale penalty", "Flying",
      "Dragon", "Reduces enemy morale",
    ],
    imageRef: "necropolis_bone_dragon",
  },
  {
    id: "necropolis_ghost_dragon",
    name: "Ghost Dragon",
    faction: N,
    tier: 7,
    upgraded: true,
    upgradeOf: "necropolis_bone_dragon",
    attack: 19, defense: 17, hp: 200,
    damageMin: 25, damageMax: 50,
    speed: 14, growth: 1,
    abilities: [
      "Undead", "No morale penalty", "Flying",
      "Dragon", "Reduces enemy morale", "Aging",
    ],
    imageRef: "necropolis_ghost_dragon",
  },
];
