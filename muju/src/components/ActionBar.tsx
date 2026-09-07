interface ActionBarProps {
  actionsRemaining: number;
  phase: 'place' | 'action' | 'queue';
  onEndPlacePhase: () => void;
  onEndActionPhase: () => void;
  onEndTurn: () => void;
  isPlayerTurn: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
}
export function ActionBar({ actionsRemaining, phase, onEndPlacePhase, onEndActionPhase, onEndTurn, isPlayerTurn, onUndo, canUndo = false }: ActionBarProps) {
  return <div className="action-bar">
    <div className="action-budget" aria-label={`${actionsRemaining} actions remaining`}>
      <strong>{phase === 'action' ? `${actionsRemaining} actions` : phase === 'place' ? 'Place & upgrade' : 'Reinforcements'}</strong>
      {phase === 'action' && <span aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} className={i < actionsRemaining ? 'available' : ''} />)}</span>}
    </div>
    <button onClick={onUndo} disabled={!canUndo || !isPlayerTurn} title="Undo (⌘Z)">↶ Undo</button>
    <button className="primary" disabled={!isPlayerTurn} onClick={phase === 'place' ? onEndPlacePhase : phase === 'action' ? onEndActionPhase : onEndTurn}>
      {phase === 'place' ? 'Start actions →' : phase === 'action' ? 'Finish actions →' : 'End turn →'}
    </button>
  </div>;
}
