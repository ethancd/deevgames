import type { CSSProperties } from 'react';
import type { Cell } from '../game/types';

export function describeCrystals(cell: Cell): string {
  const total = cell.minedDepth + cell.resourceLayers;
  return cell.resourceLayers > 0
    ? `${cell.resourceLayers} crystal${cell.resourceLayers === 1 ? '' : 's'} left · next depth ${cell.minedDepth + 1} · bottom ${total}`
    : `Depleted · ${total} layers mined`;
}

/** Fixed vertical depth positions prevent confusing a shallow thin seam with
 * the deep remnant of a rich seam. Transparent sockets are extracted layers;
 * short rock marks are depths this square never contained. */
export function CrystalWell({ cell, showNumbers = false }: { cell: Cell; showNumbers?: boolean }) {
  const bottom = cell.minedDepth + cell.resourceLayers;
  return <>
    <span className="well-shading" style={{ '--excavated': cell.minedDepth } as CSSProperties} aria-hidden="true" />
    <span className="crystal-gauge" aria-hidden="true">{Array.from({ length: 5 }, (_, depth) => {
      const state = depth < cell.minedDepth ? 'mined' : depth < bottom ? 'crystal' : 'bedrock';
      return <i key={depth} className={`${state}${state === 'crystal' && depth === cell.minedDepth ? ' next-crystal' : ''}`} data-depth={depth + 1} />;
    })}</span>
    {cell.resourceLayers === 0 && <span className="empty-seam" aria-hidden="true">·</span>}
    {showNumbers && <span className="resource-readout" aria-hidden="true"><b className="resource-number">{cell.resourceLayers}</b><small>{cell.resourceLayers > 0 ? `↓${cell.minedDepth + 1}` : '—'}</small></span>}
  </>;
}
