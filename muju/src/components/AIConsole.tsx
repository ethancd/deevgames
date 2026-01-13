import type { AIDebugInfo, AIAction } from '../ai/types';

interface AIConsoleProps {
  title: string;
  debug: AIDebugInfo | null;
  isThinking: boolean;
}

function formatAction(action: AIAction): string {
  switch (action.type) {
    case 'MOVE':
      return `Move ${action.unitId} → (${action.to.x},${action.to.y})`;
    case 'ATTACK':
      return `Attack ${action.unitId} → (${action.targetPosition.x},${action.targetPosition.y})`;
    case 'MINE':
      return `Mine ${action.unitId}`;
    case 'QUEUE_UNIT':
      return `Queue ${action.definitionId}`;
    case 'PLACE_UNIT':
      return `Place ${action.queuedUnitId} → (${action.position.x},${action.position.y})`;
    case 'PROMOTE_UNIT':
      return `Promote ${action.unitId}`;
    case 'END_ACTION_PHASE':
      return 'End action phase';
    case 'END_TURN':
      return 'End turn';
    case 'RESIGN':
      return 'Resign';
    default:
      return action.type;
  }
}

export function AIConsole({ title, debug, isThinking }: AIConsoleProps) {
  return (
    <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-100">{title}</h3>
        {isThinking && <span className="text-xs text-yellow-400 animate-pulse">Thinking…</span>}
      </div>

      {!debug ? (
        <p className="text-gray-400">No AI analysis available yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-gray-400">
            <div>Plans generated: <span className="text-gray-200">{debug.planCount}</span></div>
            <div>
              MCTS: <span className="text-gray-200">{debug.config.mctsIterations}</span> iters,
              <span className="text-gray-200"> {debug.config.mctsTimeLimit}ms</span> cap
            </div>
            <div>
              Beam: <span className="text-gray-200">{debug.config.beamWidth}</span> width,
              <span className="text-gray-200"> {debug.config.outputPlans}</span> outputs
            </div>
            <div>
              Belief particles: <span className="text-gray-200">{debug.config.particleCount}</span>,
              tactical depth: <span className="text-gray-200">{debug.config.tacticalDepth}</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Top plans</div>
            <ul className="space-y-2">
              {debug.topPlans.map((plan) => (
                <li key={plan.id} className="bg-gray-900/70 rounded-md p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-200">Score: {plan.score.toFixed(1)}</span>
                    <span className="text-xs text-gray-500">{plan.tags.join(', ') || 'none'}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {plan.actions.length === 0
                      ? 'No actions'
                      : plan.actions.map(formatAction).join(' → ')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
