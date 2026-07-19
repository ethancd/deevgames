// Build-time content step: copy the researcher's content art (the repo-level
// assets/images/<ref>.webp stream) into the app's public/ dir so Vite serves
// each as a stable, runtime-addressable URL (/content/<ref>.webp). We can't use
// import.meta.glob here because the images are addressed by RUNTIME imageRef —
// Rollup tree-shakes dynamically-keyed glob URLs, so only the statically-reached
// ones survive the bundle. public/ assets are copied verbatim, no tree-shaking.
//
// Idempotent: wipes and repopulates public/content on every run. The output is
// gitignored; this script is the source of truth for it.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// packages/app/scripts -> ../../.. = might-and-magic-spire (repo root)
const srcDir = join(here, '..', '..', '..', 'assets', 'images');
const outDir = join(here, '..', 'public', 'content');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let n = 0;
for (const file of readdirSync(srcDir)) {
  if (file.endsWith('.webp')) {
    cpSync(join(srcDir, file), join(outDir, file));
    n += 1;
  }
}

console.log(`[sync-content] copied ${n} content images -> public/content`);
