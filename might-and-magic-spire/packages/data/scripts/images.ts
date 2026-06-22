// Image pass: download the REAL artwork for every manifest entry from
// heroes.thelazy.net, normalize to WebP, and record the real width/height back
// into manifest.json.
//
// Each manifest entry's `sourceUrl` is the record's wiki *page* (not a direct
// image URL). So for each entry we:
//   1. fetch the page (cache-first via lib/http.ts — never re-hit the network),
//   2. extract the type-appropriate artwork URL by name (lib/parse.ts:
//      parseRecordImageUrl — Creature_*/Hero_*/Artifact_*/<spell>.png),
//   3. download that image, dedupe by content hash, convert to WebP at native
//      resolution (these are already web-sized sprites; we cap at MAX px),
//   4. read the real width/height back from the file into the manifest.
//
// If the page or image can't be fetched/decoded, we keep a deterministic
// solid-color placeholder so every imageRef still resolves, and report it.
//
//   pnpm --filter @mms/data images   (alias: tsx scripts/images.ts)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ImageManifest, type ImageManifestEntry } from "@mms/schema";
import { fetchCached } from "./lib/http.ts";
import { parseRecordImageUrl, type RecordKind } from "./lib/parse.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const ASSETS = join(__dirname, "..", "..", "..", "assets", "images");
// Sprites on thelazy are small (<=100x130); cap defensively so nothing huge
// sneaks through, but otherwise preserve native resolution.
const MAX = 256;
const PLACEHOLDER_W = 100;
const PLACEHOLDER_H = 130;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Deterministic pastel colour from the ref string, so placeholders are stable
// and visually distinguishable per record.
function colorFor(ref: string): { r: number; g: number; b: number } {
  const h = createHash("md5").update(ref).digest();
  return {
    r: 60 + (h[0] % 150),
    g: 60 + (h[1] % 150),
    b: 60 + (h[2] % 150),
  };
}

async function makePlaceholder(ref: string, outPath: string): Promise<void> {
  const { r, g, b } = colorFor(ref);
  await sharp({
    create: {
      width: PLACEHOLDER_W,
      height: PLACEHOLDER_H,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .webp({ quality: 80 })
    .toFile(outPath);
}

/** ref prefix -> record kind + record name (used to pick the sprite ON the page).
 *
 * The name is recovered from the sourceUrl page title, EXCEPT for creatures: a
 * creature's sourceUrl may point at a combined base+upgrade page (e.g. orc_chief
 * -> the "Orc" page), so the page title is not the creature's own name. For
 * creatures we recover the name from the ref (`<faction>_<snake_name>`) so the
 * sprite-name match in parseRecordImageUrl still targets the right creature. */
const FACTION_PREFIXES = [
  "necropolis_", "castle_", "rampart_", "tower_", "inferno_",
  "dungeon_", "stronghold_", "fortress_", "conflux_", "neutral_",
];
function describe(entry: ImageManifestEntry): { kind: RecordKind; name: string } {
  const kind: RecordKind = entry.ref.startsWith("hero_")
    ? "hero"
    : entry.ref.startsWith("artifact_")
      ? "artifact"
      : entry.ref.startsWith("spell_")
        ? "spell"
        : "creature";
  if (kind === "creature") {
    const prefix = FACTION_PREFIXES.find((p) => entry.ref.startsWith(p)) ?? "";
    const bare = entry.ref.slice(prefix.length).replace(/_/g, " ");
    // Title-case so it matches the page's "Orc Chief" file-name spelling.
    const name = bare.replace(/\b\w/g, (m) => m.toUpperCase());
    return { kind, name };
  }
  const last = entry.sourceUrl.split("/").pop() ?? "";
  const name = decodeURIComponent(last).replace(/_/g, " ");
  return { kind, name };
}

/**
 * Fetch the page, find the real artwork URL, download + normalize to WebP.
 * Returns true on success (file written), false if anything failed (caller
 * falls back to a placeholder).
 */
async function tryRealImage(
  entry: ImageManifestEntry,
  outPath: string,
): Promise<boolean> {
  try {
    const { kind, name } = describe(entry);
    const html = await fetchCached(entry.sourceUrl);
    const imageUrl = parseRecordImageUrl(html, kind, name);
    if (!imageUrl) return false;

    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "MMS-Researcher/0.1 (image pass; contact ethan@survivalandflourishing.com)" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());

    // Preserve native resolution; only shrink if larger than MAX. `without
    // enlargement` keeps small sprites at their true size.
    await sharp(buf, { animated: false })
      .resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(outPath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await mkdir(ASSETS, { recursive: true });
  const manifest = ImageManifest.parse(
    JSON.parse(await readFile(join(SRC, "manifest.json"), "utf8")),
  );

  const placeholders: string[] = [];
  const out: ImageManifestEntry[] = [];
  let real = 0;

  for (const entry of manifest) {
    const outPath = join(ASSETS, `${entry.ref}.webp`);
    // Always (re)attempt the real download this run, overwriting v0 placeholders.
    const ok = await tryRealImage(entry, outPath);
    if (ok) {
      real++;
    } else if (!(await exists(outPath))) {
      await makePlaceholder(entry.ref, outPath);
      placeholders.push(entry.ref);
    } else {
      // Couldn't fetch a real image and a file already exists — treat as a
      // standing placeholder so it's reported honestly.
      placeholders.push(entry.ref);
    }

    const meta = await sharp(outPath).metadata();
    out.push({
      ...entry,
      localPath: `assets/images/${entry.ref}.webp`,
      width: meta.width ?? PLACEHOLDER_W,
      height: meta.height ?? PLACEHOLDER_H,
    });
  }

  await writeFile(join(SRC, "manifest.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `image pass: ${out.length} refs resolved, ${real} real, ${placeholders.length} placeholder(s)`,
  );
  await writeFile(
    join(SRC, "placeholders.json"),
    JSON.stringify(placeholders, null, 2) + "\n",
    "utf8",
  );
  if (placeholders.length) {
    console.log(`placeholder refs written to src/placeholders.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
