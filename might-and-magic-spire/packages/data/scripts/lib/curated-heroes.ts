// Hand-authored Necropolis hero roster (HoMM3: Shadow of Death).
//
// Two classes: Death Knight (might) and Necromancer (magic). Specialty becomes
// the hero's signature relic downstream, so it is transcribed precisely from the
// HoMM3 hero tables. startingSkills are the two secondary skills each hero
// begins with (Necromancy is innate to the town and listed where the hero
// starts with it explicitly).

import type { SourceHero } from "@mms/schema";

const N = "Necropolis" as const;
const DEATH_KNIGHT = "Death Knight";
const NECROMANCER = "Necromancer";

export const necropolisHeroes: SourceHero[] = [
  // ── Death Knights (might) ──────────────────────────────────────────────
  {
    id: "hero_galthran",
    name: "Galthran",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Skeletons",
    startingSkills: ["Necromancy", "Offense"],
    imageRef: "hero_galthran",
  },
  {
    id: "hero_isra",
    name: "Isra",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Vampires",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_isra",
  },
  {
    id: "hero_clavius",
    name: "Clavius",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Walking Dead",
    startingSkills: ["Necromancy", "Offense"],
    imageRef: "hero_clavius",
  },
  {
    id: "hero_moandor",
    name: "Moandor",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Liches",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_moandor",
  },
  {
    id: "hero_charna",
    name: "Charna",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Wights",
    startingSkills: ["Necromancy", "Tactics"],
    imageRef: "hero_charna",
  },
  {
    id: "hero_tamika",
    name: "Tamika",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Black Knights",
    startingSkills: ["Necromancy", "Offense"],
    imageRef: "hero_tamika",
  },
  {
    id: "hero_straker",
    name: "Straker",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Walking Dead",
    startingSkills: ["Necromancy", "Archery"],
    imageRef: "hero_straker",
  },
  {
    id: "hero_vokial",
    name: "Vokial",
    faction: N,
    heroClass: DEATH_KNIGHT,
    specialty: "Vampires",
    startingSkills: ["Necromancy", "Artillery"],
    imageRef: "hero_vokial",
  },

  // ── Necromancers (magic) ───────────────────────────────────────────────
  {
    id: "hero_thant",
    name: "Thant",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Animate Dead",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_thant",
  },
  {
    id: "hero_sandro",
    name: "Sandro",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Sorcery",
    startingSkills: ["Necromancy", "Sorcery"],
    imageRef: "hero_sandro",
  },
  {
    id: "hero_nimbus",
    name: "Nimbus",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Wisdom",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_nimbus",
  },
  {
    id: "hero_vidomina",
    name: "Vidomina",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Necromancy",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_vidomina",
  },
  {
    id: "hero_aislinn",
    name: "Aislinn",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Meteor Shower",
    startingSkills: ["Necromancy", "Wisdom"],
    imageRef: "hero_aislinn",
  },
  {
    id: "hero_septienna",
    name: "Septienna",
    faction: N,
    heroClass: NECROMANCER,
    specialty: "Death Ripple",
    startingSkills: ["Necromancy", "Scholar"],
    imageRef: "hero_septienna",
  },
];
