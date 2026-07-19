// Validate the curated dataset against @mms/schema and emit JSON to src/.
//
// Every record is run through the Zod schema (SourceCreature.parse etc). A
// record that fails validation is NOT written — it is collected, reported to
// stderr, and excluded from the output. This script also builds the image
// manifest skeleton (one entry per distinct imageRef) so every ref resolves.
//
//   pnpm --filter @mms/data build:data   (alias: tsx scripts/build.ts)
//
// Re-run after editing any curated-*.ts file.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  SourceCreature,
  SourceSpell,
  SourceArtifact,
  SourceHero,
  ImageManifestEntry,
} from "@mms/schema";
import { necropolisCreatures } from "./lib/curated-creatures.ts";
import { necropolisHeroes } from "./lib/curated-heroes.ts";
import { castleCreatures, castleHeroes } from "./lib/curated-castle.ts";
import { strongholdCreatures, strongholdHeroes } from "./lib/curated-stronghold.ts";
import { spells } from "./lib/curated-spells.ts";
import { artifacts } from "./lib/curated-artifacts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

interface Dropped {
  kind: string;
  id: unknown;
  error: string;
}
const dropped: Dropped[] = [];

function validateAll<T>(
  kind: string,
  schema: z.ZodType<T>,
  rows: unknown[],
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const r = schema.safeParse(row);
    if (r.success) {
      out.push(r.data);
    } else {
      dropped.push({
        kind,
        id: (row as { id?: unknown })?.id,
        error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
  }
  return out;
}

function assertUniqueIds(kind: string, rows: { id: string }[]): void {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`${kind}: duplicate id ${r.id}`);
    seen.add(r.id);
  }
}

function assertUpgradeArrows(creatures: { id: string; upgradeOf: string | null }[]): void {
  const ids = new Set(creatures.map((c) => c.id));
  for (const c of creatures) {
    if (c.upgradeOf !== null && !ids.has(c.upgradeOf)) {
      throw new Error(`creature ${c.id}: upgradeOf ${c.upgradeOf} is not a known creature id`);
    }
  }
}

async function main(): Promise<void> {
  await mkdir(SRC, { recursive: true });

  const creatures = validateAll("creature", SourceCreature, [
    ...necropolisCreatures,
    ...castleCreatures,
    ...strongholdCreatures,
  ]);
  const heroes = validateAll("hero", SourceHero, [
    ...necropolisHeroes,
    ...castleHeroes,
    ...strongholdHeroes,
  ]);
  const spellRows = validateAll("spell", SourceSpell, spells);
  const artifactRows = validateAll("artifact", SourceArtifact, artifacts);

  assertUniqueIds("creature", creatures);
  assertUniqueIds("hero", heroes);
  assertUniqueIds("spell", spellRows);
  assertUniqueIds("artifact", artifactRows);
  assertUpgradeArrows(creatures);

  // ── Build the image manifest skeleton (one entry per distinct ref) ──────
  // The real image pass (scripts/images.ts) downloads/normalizes pixels and
  // fills width/height from the actual file. Here we ensure every ref a record
  // references has a resolvable manifest entry pointing at assets/images/.
  const refs = new Map<string, { sourceUrl: string; attribution: string }>();
  const add = (ref: string, sourceUrl: string, attribution: string) => {
    if (!refs.has(ref)) refs.set(ref, { sourceUrl, attribution });
  };
  // Most creatures have their own thelazy page, but a few upgrades have no
  // standalone page — their art lives on the combined base+upgrade page. Point
  // the sourceUrl at the page that actually exists; the image parser's name
  // alias still selects the correct (upgrade) sprite from it.
  const CREATURE_PAGE_OVERRIDE: Record<string, string> = {
    "Orc Chief": "Orc", // /index.php/Orc%20Chief 404s; art is on the Orc page.
  };
  for (const c of creatures) {
    const pageName = CREATURE_PAGE_OVERRIDE[c.name] ?? c.name;
    add(c.imageRef, `https://heroes.thelazy.net/index.php/${encodeURIComponent(pageName)}`,
      "HoMM3 / heroes.thelazy.net, reference use");
  }
  for (const h of heroes)
    add(h.imageRef, `https://heroes.thelazy.net/index.php/${encodeURIComponent(h.name)}`,
      "HoMM3 / heroes.thelazy.net, reference use");
  for (const s of spellRows)
    add(s.imageRef, `https://heroes.thelazy.net/index.php/${encodeURIComponent(s.name)}`,
      "HoMM3 / heroes.thelazy.net, reference use");
  for (const a of artifactRows)
    add(a.imageRef, `https://heroes.thelazy.net/index.php/${encodeURIComponent(a.name)}`,
      "HoMM3 / heroes.thelazy.net, reference use");

  const manifest = [...refs.entries()].map(([ref, meta]) =>
    ImageManifestEntry.parse({
      ref,
      localPath: `assets/images/${ref}.webp`,
      sourceUrl: meta.sourceUrl,
      attribution: meta.attribution,
      width: 100,
      height: 130,
    }),
  );

  const write = (name: string, data: unknown) =>
    writeFile(join(SRC, name), JSON.stringify(data, null, 2) + "\n", "utf8");

  await write("creatures.json", creatures);
  await write("heroes.json", heroes);
  // NOTE: spells.json / artifacts.json are NOT (re)written here. They are
  // hand-maintained / owned by a separate content stream; this build only emits
  // the creature + hero JSON and the manifest (which still references the spell
  // and artifact imageRefs derived from the curated arrays above). Re-emitting
  // them from the curated TS would silently clobber any manual edits.
  await write("manifest.json", manifest);

  // eslint-disable-next-line no-console
  console.log(
    `wrote: ${creatures.length} creatures, ${heroes.length} heroes, ` +
      `${spellRows.length} spells, ${artifactRows.length} artifacts, ` +
      `${manifest.length} manifest entries`,
  );
  if (dropped.length) {
    console.error(`\nDROPPED ${dropped.length} invalid record(s):`);
    for (const d of dropped) console.error(`  [${d.kind}] ${d.id}: ${d.error}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
