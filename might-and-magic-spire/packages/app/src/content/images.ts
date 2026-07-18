// Content-art image resolution (the researcher's stream).
//
// The researcher's WebP art lives at the repo-level assets/images/<ref>.webp and
// is copied into public/content/<ref>.webp by the build-time content step
// (scripts/sync-content.mjs, run before dev/build). We resolve an imageRef to
// that public URL, gated on the @mms/data image manifest so a ref the data
// layer doesn't know about returns null and the UI drops in placeholder chrome.
//
// IMPORTANT: this is the CONTENT stream. Card frames, faction backgrounds,
// icons and buttons are CHROME and live in src/chrome — never here.
import { manifest } from '@mms/data';

// Every ref the content DB actually ships an image for.
const refs = new Set(manifest.map((m) => m.ref));

// Vite serves public/ at the app's base URL (base: './' for portable deploys).
const base = import.meta.env.BASE_URL ?? '/';

/** Resolve a content-art imageRef to its bundled public URL, or null if absent. */
export function resolveImage(ref: string | undefined): string | null {
  if (!ref || !refs.has(ref)) return null;
  return `${base}content/${ref}.webp`;
}

/** Whether any content art is available (false only if the manifest is empty). */
export function hasContentArt(): boolean {
  return refs.size > 0;
}
