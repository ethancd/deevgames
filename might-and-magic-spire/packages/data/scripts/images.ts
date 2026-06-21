// Image pass: ensure every imageRef in the manifest resolves to a real WebP in
// assets/images/, and that the manifest's width/height match the file on disk.
//
// Strategy:
//   1. For each manifest entry, if assets/images/<ref>.webp already exists, keep
//      it. Otherwise try to download the source image, dedupe by content hash,
//      and normalize to a web-sized WebP (max 100x130, contain).
//   2. If the download fails (egress restricted in the v0 build environment),
//      generate a deterministic solid-color 100x130 placeholder WebP so the ref
//      still resolves. Placeholders are tracked and reported.
//   3. Rewrite manifest.json with real width/height read back from each file.
//
//   pnpm --filter @mms/data images   (alias: tsx scripts/images.ts)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ImageManifest, type ImageManifestEntry } from "@mms/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const ASSETS = join(__dirname, "..", "..", "..", "assets", "images");
const MAX_W = 100;
const MAX_H = 130;

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
  // Bias toward mid-tones so text/overlay would remain legible.
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
      width: MAX_W,
      height: MAX_H,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .webp({ quality: 80 })
    .toFile(outPath);
}

async function tryDownloadNormalize(url: string, outPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MMS-Researcher/0.1 (image pass)" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize({ width: MAX_W, height: MAX_H, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 82 })
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

  for (const entry of manifest) {
    const outPath = join(ASSETS, `${entry.ref}.webp`);
    if (!(await exists(outPath))) {
      const ok = await tryDownloadNormalize(entry.sourceUrl, outPath);
      if (!ok) {
        await makePlaceholder(entry.ref, outPath);
        placeholders.push(entry.ref);
      }
    }
    const meta = await sharp(outPath).metadata();
    out.push({
      ...entry,
      localPath: `assets/images/${entry.ref}.webp`,
      width: meta.width ?? MAX_W,
      height: meta.height ?? MAX_H,
    });
  }

  await writeFile(join(SRC, "manifest.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(`image pass: ${out.length} refs resolved, ${placeholders.length} placeholder(s)`);
  if (placeholders.length) {
    await writeFile(
      join(SRC, "placeholders.json"),
      JSON.stringify(placeholders, null, 2) + "\n",
      "utf8",
    );
    console.log(`placeholder refs written to src/placeholders.json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
