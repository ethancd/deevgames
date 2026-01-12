import type { AIAction } from '../ai/types';
import { getUnitDefinition } from '../game/units';

interface AIRecapProps {
  actions: AIAction[];
  onDismiss: () => void;
}

function formatAction(action: AIAction): string {
  switch (action.type) {
    case 'MOVE':
      return `Moved unit to (${action.to.x}, ${action.to.y})`;
    case 'ATTACK':
      return `Attacked at (${action.targetPosition.x}, ${action.targetPosition.y})`;
    case 'MINE':
      return 'Mined resources';
    case 'QUEUE_UNIT': {
      const def = getUnitDefinition(action.definitionId);
      return `Queued ${def.name}`;
    }
    case 'PLACE_UNIT':
      return `Placed unit at (${action.position.x}, ${action.position.y})`;
    case 'PROMOTE_UNIT':
      return 'Promoted a unit';
    case 'END_ACTION_PHASE':
      return 'Ended action phase';
    case 'END_TURN':
      return 'Ended turn';
    case 'RESIGN':
      return 'Resigned the game';
    default:
      return 'Unknown action';
  }
}

function getActionIcon(action: AIAction): string {
  switch (action.type) {
    case 'MOVE': return '→';
    case 'ATTACK': return '⚔';
    case 'MINE': return '⛏';
    case 'QUEUE_UNIT': return '🏭';
    case 'PLACE_UNIT': return '📍';
    case 'PROMOTE_UNIT': return '⬆';
    case 'END_ACTION_PHASE': return '⏭';
    case 'END_TURN': return '⏹';
    case 'RESIGN': return '🏳';
    default: return '•';
  }
}

export function AIRecap({ actions, onDismiss }: AIRecapProps) {
  // Filter out phase transition actions for cleaner display
  const meaningfulActions = actions.filter(
    (a) => a.type !== 'END_ACTION_PHASE' && a.type !== 'END_TURN'
  );

  // Group actions by type for summary
  const summary = {
    moves: actions.filter((a) => a.type === 'MOVE').length,
    attacks: actions.filter((a) => a.type === 'ATTACK').length,
    mines: actions.filter((a) => a.type === 'MINE').length,
    queued: actions.filter((a) => a.type === 'QUEUE_UNIT').length,
    placed: actions.filter((a) => a.type === 'PLACE_UNIT').length,
    promoted: actions.filter((a) => a.type === 'PROMOTE_UNIT').length,
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-4 max-w-md w-full mx-4 border border-gray-600">
        <h2 className="text-lg font-bold text-white mb-3">AI Turn Recap</h2>

        {/* Summary */}
        <div className="flex flex-wrap gap-2 mb-4">
          {summary.moves > 0 && (
            <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-sm">
              {summary.moves} move{summary.moves !== 1 ? 's' : ''}
            </span>
          )}
          {summary.attacks > 0 && (
            <span className="px-2 py-1 bg-red-900/50 text-red-400 rounded text-sm">
              {summary.attacks} attack{summary.attacks !== 1 ? 's' : ''}
            </span>
          )}
          {summary.mines > 0 && (
            <span className="px-2 py-1 bg-purple-900/50 text-purple-400 rounded text-sm">
              {summary.mines} mine{summary.mines !== 1 ? 's' : ''}
            </span>
          )}
          {summary.queued > 0 && (
            <span className="px-2 py-1 bg-blue-900/50 text-blue-400 rounded text-sm">
              {summary.queued} queued
            </span>
          )}
          {summary.placed > 0 && (
            <span className="px-2 py-1 bg-cyan-900/50 text-cyan-400 rounded text-sm">
              {summary.placed} placed
            </span>
          )}
          {summary.promoted > 0 && (
            <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 rounded text-sm">
              {summary.promoted} promoted
            </span>
          )}
        </div>

        {/* Detailed actions list */}
        {meaningfulActions.length > 0 ? (
          <div className="max-h-48 overflow-y-auto mb-4">
            <ul className="space-y-1 text-sm">
              {meaningfulActions.map((action, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-300">
                  <span className="text-lg">{getActionIcon(action)}</span>
                  <span>{formatAction(action)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">AI took no actions this turn.</p>
        )}

        <button
          onClick={onDismiss}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
