import type { Cell } from '../game/types';
export function describeCrystals(cell: Cell): string {
  return `${cell.resourceLayers} crystal${cell.resourceLayers === 1 ? '' : 's'} remaining`;
}
export function CellReserve({ cell, showNumbers = true }: { cell: Cell; showNumbers?: boolean }) {
  return showNumbers ? <span className="resource-readout" aria-hidden="true"><b className="resource-number">{cell.resourceLayers}</b></span> : null;
}
