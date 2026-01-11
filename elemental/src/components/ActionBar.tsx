interface ActionBarProps {
  actionsRemaining: number;
  phase: 'place' | 'action' | 'queue';
  onEndActionPhase: () => void;
  onEndTurn: () => void;
  isPlayerTurn: boolean;
}

export function ActionBar({
  actionsRemaining,
  phase,
  onEndActionPhase,
  onEndTurn,
  isPlayerTurn,
}: ActionBarProps) {
  const steps = [0, 1, 2, 3];

  return (
    <div className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
      {/* Action steps indicator */}
      <div className="flex items-center gap-1">
        <span className="text-gray-300 text-sm mr-2">Actions:</span>
        {steps.map((step) => (
          <div
            key={step}
            className={`
              w-4 h-4 rounded-full
              ${step < actionsRemaining ? 'bg-green-500' : 'bg-gray-600'}
              transition-colors duration-200
            `}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-600" />

      {/* Phase controls */}
      {phase === 'action' && isPlayerTurn && (
        <button
          onClick={onEndActionPhase}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          End Actions
        </button>
      )}

      {phase === 'queue' && isPlayerTurn && (
        <button
          onClick={onEndTurn}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
        >
          End Turn
        </button>
      )}

      {!isPlayerTurn && (
        <span className="text-yellow-400 text-sm">AI Thinking...</span>
      )}
    </div>
  );
}
