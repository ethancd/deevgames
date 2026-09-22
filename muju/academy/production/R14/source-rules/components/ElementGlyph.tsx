import type { Element } from '../game/types';

// Deliberately different silhouettes: legible even without their element colors.
export function ElementGlyph({ element }: { element: Element }) {
  switch (element) {
    case 'fire': return <path d="M24 6c3 8 9 9 9 17a9 9 0 0 1-18 0c0-5 3-9 6-12-1 5 0 7 2 8 3-4 3-8 1-13Z" />;
    case 'lightning': return <path d="m25 5-13 17h10l-3 13 16-20H24Z" />;
    case 'water': return <path d="M24 5c-3 6-11 14-11 20a11 11 0 0 0 22 0c0-6-8-14-11-20Z" />;
    case 'shadow': return <path d="M29 6a15 15 0 1 0 9 25A13 13 0 0 1 29 6Z" />;
    case 'plant': return <><path d="M12 29C7 11 21 7 36 7c1 16-6 27-21 24Z" /><path d="m13 34 16-18" fill="none" stroke="var(--glyph-vein)" strokeWidth="2.5" strokeLinecap="round" /></>;
    case 'metal': return <><path d="M8 12h32l-7 9h-7v7h8v6H14v-6h7v-7h-5Z" /><path d="M10 10h26v4H10Z" /></>;
  }
}

export function ElementIcon({ element }: { element: Element }) {
  return <svg className={`element-icon element-${element}`} viewBox="0 0 48 40" aria-hidden="true"><ElementGlyph element={element} /></svg>;
}
