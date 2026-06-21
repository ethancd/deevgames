// Content-art image resolution (the researcher's stream).
//
// Build-time content step: Vite globs every webp under assets/images and the
// `@mms/data` manifest is consulted (when present) to validate refs. An
// `imageRef` from the engine/schema resolves to a hashed bundled URL; a
// missing asset returns null so the UI can drop in its own placeholder chrome.
//
// IMPORTANT: this is the CONTENT stream. Card frames, faction backgrounds,
// icons and buttons are CHROME and live in src/chrome — never here.

// Eagerly glob bundled content art. `assets/images/<ref>.webp`. When the
// researcher's real assets land they drop into this folder and resolve for
// free. `import.meta.glob` returns {} cleanly when the folder is empty.
const modules = import.meta.glob<string>('../../assets/images/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byRef: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const ref = path.split('/').pop()!.replace(/\.webp$/, '');
  byRef[ref] = url as string;
}

/** Resolve a content-art imageRef to a bundled URL, or null if absent. */
export function resolveImage(ref: string | undefined): string | null {
  if (!ref) return null;
  return byRef[ref] ?? null;
}

/** Whether any content art is bundled (false during fixture-only dev). */
export function hasContentArt(): boolean {
  return Object.keys(byRef).length > 0;
}
