import type { Cell } from '../game/types';
import { CrystalLights } from './CrystalLights';

export function describeCrystals(cell: Cell): string {
  return `${cell.resourceLayers} crystal${cell.resourceLayers === 1 ? '' : 's'} remaining`;
}
export function CellReserve({ cell }: { cell: Cell }) {
  return <CrystalLights remaining={cell.resourceLayers} />;
}
