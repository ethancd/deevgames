// Local TS aliases for schema enums that @mms/schema exports only as zod
// *values* (Rarity, CardType, Effect, ArtifactClass), not as named types. We
// re-derive the inferred types here with z.infer so the engine can name them.
// The shapes are pinned by the schema — this is purely a typing convenience.

import { z } from "zod";
import { Rarity as RarityZ, CardType as CardTypeZ, Effect as EffectZ } from "@mms/schema";
import { ArtifactClass as ArtifactClassZ, ArtifactSlot as ArtifactSlotZ } from "@mms/schema";

export type Rarity = z.infer<typeof RarityZ>;
export type CardType = z.infer<typeof CardTypeZ>;
export type Effect = z.infer<typeof EffectZ>;
export type ArtifactClass = z.infer<typeof ArtifactClassZ>;
export type ArtifactSlot = z.infer<typeof ArtifactSlotZ>;
