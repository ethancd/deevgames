interface ActionBarProps {
  actionsRemaining: number;
  phase: 'place' | 'action';
  onEndPlacePhase: () => void;
  onEndActionPhase: () => void;
  isPlayerTurn: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
}
export function ActionBar({ actionsRemaining, phase, onEndPlacePhase, onEndActionPhase, isPlayerTurn, onUndo, canUndo = false }: ActionBarProps) {
  return <div className="action-bar">
    <div className="action-budget" aria-label={`${actionsRemaining} actions remaining`}>
      <strong>{phase === 'action' ? `${actionsRemaining} actions` : 'Buy & promote'}</strong>
      {phase === 'action' && <span aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} className={i < actionsRemaining ? 'available' : ''} />)}</span>}
    </div>
    <button onClick={onUndo} disabled={!canUndo || !isPlayerTurn} title="Undo (⌘Z)">↶ Undo</button>
    <button className="primary" disabled={!isPlayerTurn} onClick={phase === 'place' ? onEndPlacePhase : onEndActionPhase}>
      {phase === 'place' ? 'Start actions →' : 'End turn →'}
    </button>
  </div>;
}
