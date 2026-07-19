import { z } from "zod";
import { Faction, ImageRef } from "./source";

export const CardType = z.enum(["strike", "skill", "power"]); // Spire's attack/skill/power
export const Rarity = z.enum(["starter", "common", "uncommon", "rare"]);

export const Effect = z.object({
  kind: z.enum(["damage", "block", "summon", "buff", "debuff", "draw", "mana"]),
  amount: z.number().int().optional(),
  target: z.enum(["enemy", "self", "allEnemies", "random"]).optional(),
  summonId: z.string().optional(),  // for kind: "summon" — a SourceCreature id
  count: z.number().int().optional(),
});

export const CardDef = z.object({
  id: z.string(),
  sourceId: z.string(),             // back-ref into Source* (provenance)
  name: z.string(),
  type: CardType,
  faction: Faction,
  cost: z.number().int().min(0),
  rarity: Rarity,
  effects: z.array(Effect),
  upgradeOf: z.string().nullable(), // card-upgrade chain (Pikeman → Halberdier)
  text: z.string(),                 // rendered card text
  imageRef: ImageRef,
});
export type CardDef = z.infer<typeof CardDef>;
