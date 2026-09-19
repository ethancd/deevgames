import { useId } from 'react';
import type { Element, PlayerId, Tier } from '../game/types';
import { ElementGlyph } from './ElementGlyph';

/** Army is encoded by material AND silhouette; element by color AND symbol.
 * Rank has an exact 1–4 pip count, with a larger crest on elite pieces. */
export function UnitArtwork({ element, owner, tier }: { element: Element; owner: PlayerId; tier: Tier }) {
  const id = useId().replace(/:/g, '');
  const ivory = owner === 'white';
  const shape = ivory ? 'M24 3a20 20 0 0 1 20 20v3a20 20 0 0 1-40 0v-3A20 20 0 0 1 24 3Z'
    : 'M14 3h20l11 11v20L34 45H14L3 34V14Z';
  return <svg className={`unit-art army-${owner} element-${element} rank-${tier}`} viewBox="0 0 48 50" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2=".7" y2="1">
        <stop stopColor={ivory ? '#fff8df' : '#4a5a70'} /><stop offset=".48" stopColor={ivory ? '#ede3c3' : '#243042'} /><stop offset="1" stopColor={ivory ? '#b9aa85' : '#101824'} />
      </linearGradient>
    </defs>
    <path d={shape} transform="translate(0 3)" fill={ivory ? '#756348' : '#050b14'} />
    <path d={shape} fill={`url(#${id}-body)`} stroke={ivory ? '#fff9e8' : '#8c9eb4'} strokeWidth="1.8" />
    {tier >= 3 && <path d={shape} transform="translate(3 3) scale(.875)" fill="none" stroke={ivory ? '#947441' : '#8c9eb4'} strokeWidth="1" />}
    <g className="piece-glyph" transform="translate(2.4 0) scale(.9)"><ElementGlyph element={element} /></g>
    <g className="rank-pips">{Array.from({ length: tier }, (_, i) =>
      <rect key={i} x={24 - (tier * 5 - 2) / 2 + i * 5} y="36" width="3" height="4" rx=".8" />
    )}</g>
  </svg>;
}
