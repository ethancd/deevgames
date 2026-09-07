import type { QueuedUnit, BoardState, PlayerId } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { meetsTechRequirement } from '../game/building';
import { ELEMENT_SYMBOLS } from './UnitShop';
interface BuildQueueProps {
  queue: QueuedUnit[]; isOwner: boolean; isPlacePhase?: boolean; board?: BoardState;
  player?: PlayerId; selectedReadyId?: string | null; onSelectReady?: (id: string | null) => void;
}
export function BuildQueue({ queue, isOwner, isPlacePhase, board, player = 'white', selectedReadyId, onSelectReady }: BuildQueueProps) {
  if (!isOwner) return <div className="queue-strip">Opponent reinforcements hidden</div>;
  return <div className="queue-strip" aria-label="Build queue"><span>Queue {queue.length}</span><div>{queue.map(item => {
    const def = getUnitDefinition(item.definitionId);
    const tech = !!board && meetsTechRequirement(item.definitionId, player, board);
    return <button key={item.id} disabled={!isPlacePhase || item.turnsRemaining > 0 || !tech}
      aria-pressed={selectedReadyId === item.id} onClick={() => onSelectReady?.(selectedReadyId === item.id ? null : item.id)}>
      {ELEMENT_SYMBOLS[def.element]} {def.name} <b>{item.turnsRemaining ? `${item.turnsRemaining}t` : tech ? 'Place' : 'Needs tech'}</b>
    </button>;
  })}</div></div>;
}
