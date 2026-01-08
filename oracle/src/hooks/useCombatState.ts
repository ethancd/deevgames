// Oracle of Delve - Combat State Hook

import { useState, useEffect, useCallback } from 'react';
import type { CombatState } from '../game/types';
import {
  createInitialCombatState,
  playerAttack,
  enemyTurn,
  isPlayerTurn,
  clearDamageAnimations,
} from '../game/combat';

export function useCombatState() {
  const [combatState, setCombatState] = useState<CombatState>(createInitialCombatState);

  // Auto-execute enemy turns
  useEffect(() => {
    if (combatState.phase !== 'ongoing') return;
    if (isPlayerTurn(combatState)) return;

    const timer = setTimeout(() => {
      setCombatState(prevState => enemyTurn(prevState));
    }, 800); // 800ms delay for enemy turn

    return () => clearTimeout(timer);
  }, [combatState.currentTurnIndex, combatState.phase]);

  // Clear damage animations after they've been shown
  useEffect(() => {
    if (combatState.damageAnimations.length === 0) return;

    const timer = setTimeout(() => {
      setCombatState(prevState => clearDamageAnimations(prevState));
    }, 1000); // Clear after 1 second

    return () => clearTimeout(timer);
  }, [combatState.damageAnimations]);

  const handlePlayerAttack = useCallback((targetEnemyId: string) => {
    setCombatState(prevState => playerAttack(prevState, targetEnemyId));
  }, []);

  const handleRestart = useCallback(() => {
    setCombatState(createInitialCombatState());
  }, []);

  return {
    combatState,
    actions: {
      playerAttack: handlePlayerAttack,
      restart: handleRestart,
    },
  };
}
