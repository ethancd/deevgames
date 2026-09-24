import type { ActionsPerTurn } from '../game/types';
import { DEFAULT_ACTIONS_PER_TURN } from '../game/rules';

interface ActionBarProps {
  actionsPerTurn?: ActionsPerTurn;
  phasing?: boolean;
  actionsRemaining: number;
  phase: 'place' | 'action';
  onEndPlacePhase: () => void;
  onEndActionPhase: () => void;
  isPlayerTurn: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  readOnly?: boolean;
}
/** "1 action", "0 actions", "2 actions". */
export const actionCount = (n: number) => `${n} ${n === 1 ? 'action' : 'actions'}`;

export function ActionBar({ phasing = false, actionsRemaining, actionsPerTurn = DEFAULT_ACTIONS_PER_TURN, phase, onEndPlacePhase, onEndActionPhase, isPlayerTurn, onUndo, canUndo = false, readOnly = false }: ActionBarProps) {
  return <div className="action-bar">
    <div className="action-budget" aria-label={`${actionCount(actionsRemaining)} remaining`}>
      <strong>{phase === 'action' ? actionCount(actionsRemaining) : phasing ? 'Summon & promote' : 'Buy & promote'}</strong>
      <span aria-hidden="true" data-active={phase === 'action'}>{Array.from({ length: actionsPerTurn }, (_, i) => <i key={i} className={i < actionsRemaining ? 'available' : ''} />)}</span>
    </div>
    {!readOnly && <><button onClick={onUndo} disabled={!canUndo || !isPlayerTurn} title="Undo (⌘Z)">↶ Undo</button>
    <button className="primary" disabled={!isPlayerTurn} onClick={phase === 'place' ? onEndPlacePhase : onEndActionPhase}>
      {phase === 'place' ? phasing ? 'End turn →' : 'Start actions →' : phasing ? 'Mine & prepare →' : 'End turn →'}
    </button></>}
  </div>;
}
