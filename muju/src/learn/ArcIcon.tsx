import { UnitArtwork } from '../components/UnitArtwork';
import type { Element } from '../game/types';
import type { ArcIcon as ArcIconId } from './types';

const ELEMENT_ARCS: Partial<Record<ArcIconId, Element>> = { fire: 'fire', lightning: 'lightning', water: 'water', shadow: 'shadow', plant: 'plant', metal: 'metal' };

/** One glyph per arc. Element arcs show their tier-1 piece; the rest are small line drawings. */
export function ArcIcon({ icon }: { icon: ArcIconId }) {
  const element = ELEMENT_ARCS[icon];
  if (element) return <span className="learn-arc-icon learn-arc-icon-piece"><UnitArtwork element={element} owner="white" tier={1} /></span>;
  return <svg className={`learn-arc-icon learn-arc-icon-${icon}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{glyph(icon)}</svg>;
}

function glyph(icon: ArcIconId) {
  switch (icon) {
    case 'move': return <><path d="M4 12h13" /><path d="m13 7 5 5-5 5" /><circle cx="4" cy="12" r="1.6" fill="currentColor" stroke="none" /></>;
    case 'mine': return <><path d="M12 3l6 6-6 12L6 9z" /><path d="M6 9h12" /><path d="M12 3 9.5 9 12 21 14.5 9" /></>;
    case 'attack': return <><path d="M5 19 17 7" /><path d="m14 4 6 6" /><path d="M4 15l5 5" /><path d="M8 20l-4-4" /></>;
    case 'elements': return <><circle cx="12" cy="5.5" r="2.4" /><circle cx="5.5" cy="17" r="2.4" /><circle cx="18.5" cy="17" r="2.4" /><path d="M10.4 7.3 7 14.8M13.6 7.3 17 14.8M8 17h8" /></>;
    case 'team': return <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5" /><path d="M13 15c3 0 5 2 5 5h3c0-3-2-5-5-5" /></>;
    case 'cleave': return <><path d="m4 6 6 6-6 6" /><path d="m11 6 6 6-6 6" /><path d="m17 9 3 3-3 3" /></>;
    case 'safety': return <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>;
    case 'summon': return <><circle cx="12" cy="13" r="7" strokeDasharray="3 2.2" /><path d="M12 9.5v7M8.5 13h7" /></>;
    case 'deny': return <><circle cx="12" cy="12" r="8" strokeDasharray="3 2.2" /><path d="M12 8.5v7M8.5 12h7" /><path d="M5.5 18.5 18.5 5.5" /></>;
    case 'promote': return <><path d="m6 14 6-6 6 6" /><path d="M12 8v12" /><path d="M5 4h14" /></>;
    case 'upkeep': return <><path d="M12 3 18 8l-6 13L6 8z" /><path d="M6 8h12" /><path d="M16 17h5M18.5 14.5v5" /></>;
    case 'eliminate': return <><circle cx="12" cy="12" r="8" /><path d="m8.5 8.5 7 7M15.5 8.5l-7 7" /></>;
    case 'invade': return <><path d="M4 11 12 4l8 7v9H4z" /><path d="M12 20v-5" /><path d="m9 13 3-3 3 3" /></>;
    case 'defend': return <><path d="M4 11 12 4l8 7v9H4z" /><path d="M12 9.5 9 11v2.5c0 2 1.3 3.3 3 4 1.7-.7 3-2 3-4V11z" /></>;
    case 'review': return <><path d="M5 6h14M5 12h14M5 18h9" /><path d="m16 17 2 2 3-4" /></>;
    case 'exam': return <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />;
    default: return <circle cx="12" cy="12" r="7" />;
  }
}
