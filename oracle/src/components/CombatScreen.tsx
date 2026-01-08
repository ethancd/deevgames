// Oracle of Delve - V0 Combat Screen

import { useCombatState } from '../hooks/useCombatState';
import { EnemyDisplay } from './EnemyDisplay';
import { PlayerDisplay } from './PlayerDisplay';
import { TurnTimeline } from './TurnTimeline';
import { isPlayerTurn } from '../game/combat';

export function CombatScreen() {
  const { combatState, actions } = useCombatState();

  const playerTurn = isPlayerTurn(combatState);

  // Find damage animations for specific entities
  const getDamageAnimation = (entityId: string) => {
    return combatState.damageAnimations.find(anim => anim.targetId === entityId);
  };

  if (combatState.phase === 'victory') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-green-950/60 border-2 border-green-600/60 rounded-xl p-12 max-w-md w-full text-center">
          <h1 className="text-5xl font-bold mb-6 text-green-400">
            ⚔ VICTORY! ⚔
          </h1>
          <p className="text-xl mb-8 text-green-300">
            You have defeated all enemies!
          </p>
          <button
            onClick={actions.restart}
            className="bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500
                     px-8 py-4 rounded-lg text-xl font-bold transition-all duration-200
                     border-2 border-green-500 hover:scale-105 active:scale-95"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  if (combatState.phase === 'defeat') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-950/60 border-2 border-red-600/60 rounded-xl p-12 max-w-md w-full text-center">
          <h1 className="text-5xl font-bold mb-6 text-red-400">
            ☠ DEFEAT ☠
          </h1>
          <p className="text-xl mb-8 text-red-300">
            You have been slain...
          </p>
          <button
            onClick={actions.restart}
            className="bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500
                     px-8 py-4 rounded-lg text-xl font-bold transition-all duration-200
                     border-2 border-red-500 hover:scale-105 active:scale-95"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 to-stone-900">
      <div className="max-w-md w-full" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-amber-400" style={{ fontFamily: 'Cinzel, serif', marginBottom: '0.5rem' }}>
            ⚔ Oracle of Delve ⚔
          </h1>
          <p className="text-sm text-stone-500">V0 - Combat Prototype</p>
        </div>

        {/* Turn Timeline */}
        <TurnTimeline
          turnQueue={combatState.turnQueue}
          currentTurnIndex={combatState.currentTurnIndex}
          enemies={combatState.enemies}
        />

        {/* Enemies */}
        <div>
          <h2 className="text-center text-lg font-bold text-red-400" style={{ marginBottom: '0.5rem' }}>ENEMIES</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {combatState.enemies.map(enemy => (
              <EnemyDisplay
                key={enemy.id}
                enemy={enemy}
                onAttack={() => actions.playerAttack(enemy.id)}
                isPlayerTurn={playerTurn}
                damageAnimation={getDamageAnimation(enemy.id)}
              />
            ))}
          </div>
        </div>

        {/* Player */}
        <div style={{ paddingTop: '1rem' }}>
          <PlayerDisplay
            player={combatState.player}
            damageAnimation={getDamageAnimation('player')}
          />
        </div>
      </div>
    </div>
  );
}
