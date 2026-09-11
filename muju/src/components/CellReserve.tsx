import type { Cell } from '../game/types';
export function describeCrystals(cell: Cell): string {
  return `${cell.resourceLayers} crystal${cell.resourceLayers === 1 ? '' : 's'} remaining`;
}
export function CellReserve({ cell, visible = true }: { cell: Cell; visible?: boolean }) {
  if (!visible) return null;
  return <span className="reserve-bricks" aria-hidden="true">
    {Array.from({ length: cell.resourceLayers }, (_, index) => <span
      key={index} className="reserve-brick"
      style={{ gridColumn: index % 2 + 1, gridRow: 5 - Math.floor(index / 2) }}
    />)}
  </span>;
}
