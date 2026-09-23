import { CellReserve, describeCrystals } from './CellReserve';
import type { Cell as CellType, Position } from '../game/types';
interface CellProps {
  cell: CellType; isValidMove: boolean; isValidAttack: boolean; isValidSpawn: boolean; isSelected: boolean;
  isInvalidSpawn?: boolean; isPendingMove?: boolean; movementRangeActions?: number; isAttackFrontier?: boolean;
  isPreview?: boolean; showResources?: boolean; moveCost?: number; unitLabel?: string; previewLabel?: string;
  pendingLabel?: string; isKoTarget?: boolean; isKoThreat?: boolean;
  onClick: (position: Position) => void;
}
export function Cell({ cell, isValidMove, isValidAttack, isValidSpawn, isSelected, isInvalidSpawn, isPendingMove, movementRangeActions, isAttackFrontier, isPreview, showResources, moveCost, unitLabel, previewLabel, pendingLabel, isKoTarget, isKoThreat, onClick }: CellProps) {
  const home = cell.position.x === 0 && cell.position.y === 0 ? 'white' : cell.position.x === 9 && cell.position.y === 9 ? 'black' : null;
  const reach = movementRangeActions !== undefined;
  const coord = `${String.fromCharCode(65 + cell.position.x)}${cell.position.y + 1}`;
  const crystalDescription = describeCrystals(cell);
  const label = `${coord}${home ? `, ${home} home corner` : ''}${unitLabel ? `, ${unitLabel}` : ''}${pendingLabel ? `, ${pendingLabel}` : ''}, ${crystalDescription}${previewLabel ? `, preview: ${previewLabel}` : ''}${reach ? `, move costs ${moveCost} actions` : ''}${isAttackFrontier ? ', attack frontier: up to 3 move actions and 1 attack' : ''}${isValidAttack ? ', attack target' : ''}${isKoTarget ? ', eliminates' : ''}${isKoThreat ? ', can be eliminated by selected enemy' : ''}${isValidSpawn ? ', available for placement' : ''}`;
  return <button type="button" tabIndex={unitLabel || pendingLabel ? 0 : -1} aria-label={label} title={pendingLabel || crystalDescription} aria-pressed={isSelected || isPreview}
    className={`board-cell reserve-${cell.resourceLayers} ${isSelected ? 'selected' : ''} ${isValidAttack ? 'attack-target' : ''} ${isKoTarget ? 'ko-target' : ''} ${isKoThreat ? 'ko-threat' : ''} ${isValidSpawn ? 'spawn-target' : ''} ${isPendingMove ? 'path-cell' : ''} ${isPreview ? 'preview-cell' : ''}`}
    onClick={() => onClick(cell.position)} data-testid={`cell-${cell.position.x}-${cell.position.y}`}>
    {home && <span className={`home-marker home-${home}`} aria-hidden="true">⌂</span>}
    <CellReserve cell={cell} visible={showResources} />
    {(reach || isValidMove) && !unitLabel && !isPreview && !isAttackFrontier && <span aria-hidden="true" className={`range-marker ${isValidMove ? 'near' : 'far'}`} />}
    {isValidSpawn && !unitLabel && <span aria-hidden="true" className="spawn-marker">＋</span>}
    {isPreview && !unitLabel && <span className="destination-marker" aria-hidden="true">◎</span>}
    {isInvalidSpawn && <span className="invalid-marker" aria-hidden="true">×</span>}
    {isKoTarget && <span aria-hidden="true" className="ko-badge ko-badge-target">☠</span>}
    {isKoThreat && <span aria-hidden="true" className="ko-badge ko-badge-threat">⚠</span>}
  </button>;
}
