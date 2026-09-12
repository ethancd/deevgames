import { CellReserve, describeCrystals } from './CellReserve';
import type { Cell as CellType, Position } from '../game/types';
interface CellProps {
  cell: CellType; isValidMove: boolean; isValidAttack: boolean; isValidSpawn: boolean; isSelected: boolean;
  isInvalidSpawn?: boolean; isPendingMove?: boolean; movementRangeActions?: number; isAttackFrontier?: boolean;
  isPreview?: boolean; showResources?: boolean; moveCost?: number; unitLabel?: string; previewLabel?: string;
  onClick: (position: Position) => void;
}
export function Cell({ cell, isValidMove, isValidAttack, isValidSpawn, isSelected, isInvalidSpawn, isPendingMove, movementRangeActions, isAttackFrontier, isPreview, showResources, moveCost, unitLabel, previewLabel, onClick }: CellProps) {
  const home = cell.position.x === 0 && cell.position.y === 0 ? 'white' : cell.position.x === 9 && cell.position.y === 9 ? 'black' : null;
  const reach = movementRangeActions !== undefined;
  const coord = `${String.fromCharCode(65 + cell.position.x)}${cell.position.y + 1}`;
  const crystalDescription = describeCrystals(cell);
  const label = `${coord}${home ? `, ${home} home corner` : ''}${unitLabel ? `, ${unitLabel}` : ''}, ${crystalDescription}${previewLabel ? `, preview: ${previewLabel}` : ''}${reach ? `, move costs ${moveCost} actions` : ''}${isAttackFrontier ? ', enemy attack frontier: movement followed by an attack' : ''}${isValidAttack ? ', attack target' : ''}${isValidSpawn ? ', available for placement' : ''}`;
  return <button type="button" tabIndex={unitLabel ? 0 : -1} aria-label={label} title={crystalDescription} aria-pressed={isSelected || isPreview}
    className={`board-cell reserve-${cell.resourceLayers} ${isSelected ? 'selected' : ''} ${isValidAttack ? 'attack-target' : ''} ${isValidSpawn ? 'spawn-target' : ''} ${isPendingMove ? 'path-cell' : ''} ${isPreview ? 'preview-cell' : ''}`}
    onClick={() => onClick(cell.position)} data-testid={`cell-${cell.position.x}-${cell.position.y}`}>
    {home && <span className={`home-marker home-${home}`} aria-hidden="true">⌂</span>}
    <CellReserve cell={cell} visible={showResources} />
    {(reach || isValidMove) && !unitLabel && !isPreview && !isAttackFrontier && <span aria-hidden="true" className={`range-marker ${isValidMove ? 'near' : 'far'}`} />}
    {isValidSpawn && !unitLabel && <span aria-hidden="true" className="spawn-marker">＋</span>}
    {isPreview && !unitLabel && <span className="destination-marker" aria-hidden="true">◎</span>}
    {isInvalidSpawn && <span className="invalid-marker" aria-hidden="true">×</span>}
  </button>;
}
