import { useEffect, useState } from 'react';
import type { AIAction } from '../ai/types';

interface AIRecapProps {
  actions: AIAction[];
  onDismiss: () => void;
}

function formatAction(action: AIAction): string {
  switch (action.type) {
    case 'MOVE':
      return `Moved to (${action.to.x}, ${action.to.y})`;
    case 'ATTACK':
      return `Attacked at (${action.targetPosition.x}, ${action.targetPosition.y})`;
    case 'MINE':
      return 'Mined resources';
    case 'PLACE_UNIT':
      return `Placed unit at (${action.position.x}, ${action.position.y})`;
    case 'PROMOTE_UNIT':
      return 'Promoted a unit';
    case 'RESIGN':
      return 'Resigned the game';
    default:
      return '';
  }
}

function getActionIcon(action: AIAction): string {
  switch (action.type) {
    case 'MOVE': return '→';
    case 'ATTACK': return '⚔';
    case 'MINE': return '⛏';
    case 'PLACE_UNIT': return '📍';
    case 'PROMOTE_UNIT': return '⬆';
    case 'RESIGN': return '🏳';
    default: return '•';
  }
}

export function AIRecap({ actions, onDismiss }: AIRecapProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out queue phase actions (only show place phase and action phase)
  const meaningfulActions = actions.filter(
    (a) =>
      a.type !== 'END_ACTION_PHASE' &&
      a.type !== 'END_TURN' &&
      a.type !== 'QUEUE_UNIT'
  );

  // Group actions by type for summary
  const summary = {
    moves: actions.filter((a) => a.type === 'MOVE').length,
    attacks: actions.filter((a) => a.type === 'ATTACK').length,
    mines: actions.filter((a) => a.type === 'MINE').length,
    placed: actions.filter((a) => a.type === 'PLACE_UNIT').length,
    promoted: actions.filter((a) => a.type === 'PROMOTE_UNIT').length,
    resigned: actions.filter((a) => a.type === 'RESIGN').length,
  };

  // Auto-dismiss after 5 seconds if not interacted with
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isExpanded) {
        onDismiss();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isExpanded, onDismiss]);

  // Build summary text
  const summaryParts: string[] = [];
  if (summary.moves > 0) summaryParts.push(`${summary.moves} move${summary.moves !== 1 ? 's' : ''}`);
  if (summary.attacks > 0) summaryParts.push(`${summary.attacks} attack${summary.attacks !== 1 ? 's' : ''}`);
  if (summary.mines > 0) summaryParts.push(`${summary.mines} mine${summary.mines !== 1 ? 's' : ''}`);
  if (summary.placed > 0) summaryParts.push(`${summary.placed} placed`);
  if (summary.promoted > 0) summaryParts.push(`${summary.promoted} promoted`);
  if (summary.resigned > 0) summaryParts.push('resigned');

  const summaryText = summaryParts.length > 0
    ? summaryParts.join(', ')
    : 'no actions';

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`
          bg-gray-800 rounded-lg border border-red-600/50 shadow-lg
          transition-all duration-200
          ${isExpanded ? 'p-4' : 'p-3'}
        `}
      >
        {/* Compact summary bar */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-medium text-sm">AI Turn:</span>
            <span className="text-gray-300 text-sm">{summaryText}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="text-gray-400 hover:text-white text-xs"
            >
              {isExpanded ? '▲' : '▼'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-gray-400 hover:text-white text-sm px-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && meaningfulActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <ul className="space-y-1 text-sm max-h-32 overflow-y-auto">
              {meaningfulActions.map((action, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-300">
                  <span>{getActionIcon(action)}</span>
                  <span>{formatAction(action)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
