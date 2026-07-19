// @mms/data — validated HoMM3 content for Might & Magic: Spire.
//
// The JSON in this directory is produced by scripts/build.ts (curated dataset)
// and scripts/images.ts (image pass + manifest). This module re-validates every
// record against @mms/schema AT IMPORT TIME and throws on any failure, so a
// downstream package can never load malformed data — the JSON files and the
// schema cannot silently drift apart.

import { z } from "zod";
import {
  SourceCreature,
  SourceSpell,
  SourceArtifact,
  SourceHero,
  ImageManifest,
  type SourceCreature as SourceCreatureT,
  type SourceSpell as SourceSpellT,
  type SourceArtifact as SourceArtifactT,
  type SourceHero as SourceHeroT,
  type ImageManifestEntry,
} from "@mms/schema";

import creaturesJson from "./creatures.json" with { type: "json" };
import spellsJson from "./spells.json" with { type: "json" };
import artifactsJson from "./artifacts.json" with { type: "json" };
import heroesJson from "./heroes.json" with { type: "json" };
import manifestJson from "./manifest.json" with { type: "json" };

function parseOrThrow<T>(label: string, schema: z.ZodType<T>, rows: unknown): T {
  const r = schema.safeParse(rows);
  if (!r.success) {
    throw new Error(
      `@mms/data: ${label} failed schema validation at load:\n` +
        r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  return r.data;
}

export const creatures: SourceCreatureT[] = parseOrThrow(
  "creatures",
  z.array(SourceCreature),
  creaturesJson,
);
export const spells: SourceSpellT[] = parseOrThrow(
  "spells",
  z.array(SourceSpell),
  spellsJson,
);
export const artifacts: SourceArtifactT[] = parseOrThrow(
  "artifacts",
  z.array(SourceArtifact),
  artifactsJson,
);
export const heroes: SourceHeroT[] = parseOrThrow(
  "heroes",
  z.array(SourceHero),
  heroesJson,
);
export const manifest: ImageManifestEntry[] = parseOrThrow(
  "manifest",
  ImageManifest,
  manifestJson,
);

// Convenience: every imageRef -> its manifest entry.
export const manifestByRef: Map<string, ImageManifestEntry> = new Map(
  manifest.map((m) => [m.ref, m]),
);

// Cross-check at load: every record's imageRef must resolve to a manifest entry.
{
  const refs = new Set(manifest.map((m) => m.ref));
  const missing: string[] = [];
  for (const r of [...creatures, ...spells, ...artifacts, ...heroes]) {
    if (!refs.has(r.imageRef)) missing.push(`${r.id} -> ${r.imageRef}`);
  }
  if (missing.length) {
    throw new Error(
      `@mms/data: ${missing.length} imageRef(s) do not resolve to the manifest:\n` +
        missing.map((m) => `  ${m}`).join("\n"),
    );
  }
}
