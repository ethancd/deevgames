// Oracle of Delve - V0 Combat Engine

import type { CombatState, Player, Enemy, TurnQueueEntry, DamageAnimation } from './types';

export const PLAYER_BASE_HP = 50;
export const PLAYER_ATTACK_DAMAGE = 8;
export const ENEMY_BASE_HP = 20;
export const ENEMY_ATTACK_DAMAGE = 6;

export function createInitialCombatState(): CombatState {
  const player: Player = {
    id: 'player',
    type: 'player',
    hp: PLAYER_BASE_HP,
    maxHP: PLAYER_BASE_HP,
  };

  const enemies: Enemy[] = [
    {
      id: 'enemy-1',
      type: 'enemy',
      name: 'Goblin',
      hp: ENEMY_BASE_HP,
      maxHP: ENEMY_BASE_HP,
    },
    {
      id: 'enemy-2',
      type: 'enemy',
      name: 'Orc',
      hp: ENEMY_BASE_HP,
      maxHP: ENEMY_BASE_HP,
    },
  ];

  // Fixed turn order: Player, Enemy1, Enemy2, Player, Enemy1, Enemy2...
  const turnQueue: TurnQueueEntry[] = [
    { entityId: player.id, entityType: 'player' },
    { entityId: enemies[0].id, entityType: 'enemy' },
    { entityId: enemies[1].id, entityType: 'enemy' },
  ];

  return {
    player,
    enemies,
    turnQueue,
    currentTurnIndex: 0,
    phase: 'ongoing',
    damageAnimations: [],
  };
}

export function getCurrentTurn(state: CombatState): TurnQueueEntry {
  return state.turnQueue[state.currentTurnIndex];
}

export function isPlayerTurn(state: CombatState): boolean {
  const currentTurn = getCurrentTurn(state);
  return currentTurn.entityType === 'player';
}

export function playerAttack(state: CombatState, targetEnemyId: string): CombatState {
  if (!isPlayerTurn(state)) {
    console.warn('Not player turn!');
    return state;
  }

  const targetEnemy = state.enemies.find(e => e.id === targetEnemyId);
  if (!targetEnemy) {
    console.warn('Target enemy not found!');
    return state;
  }

  if (targetEnemy.hp <= 0) {
    console.warn('Target enemy already dead!');
    return state;
  }

  const damage = PLAYER_ATTACK_DAMAGE;
  const newHP = Math.max(0, targetEnemy.hp - damage);

  const damageAnim: DamageAnimation = {
    id: `dmg-${Date.now()}-${Math.random()}`,
    targetId: targetEnemyId,
    damage,
    timestamp: Date.now(),
  };

  const updatedEnemies = state.enemies.map(e =>
    e.id === targetEnemyId ? { ...e, hp: newHP } : e
  );

  const newState: CombatState = {
    ...state,
    enemies: updatedEnemies,
    damageAnimations: [...state.damageAnimations, damageAnim],
  };

  return advanceTurn(newState);
}

export function enemyTurn(state: CombatState): CombatState {
  const currentTurn = getCurrentTurn(state);
  if (currentTurn.entityType !== 'enemy') {
    console.warn('Not enemy turn!');
    return state;
  }

  const enemy = state.enemies.find(e => e.id === currentTurn.entityId);
  if (!enemy || enemy.hp <= 0) {
    // Dead enemy, skip turn
    return advanceTurn(state);
  }

  // Enemy attacks player
  const damage = ENEMY_ATTACK_DAMAGE;
  const newHP = Math.max(0, state.player.hp - damage);

  const damageAnim: DamageAnimation = {
    id: `dmg-${Date.now()}-${Math.random()}`,
    targetId: 'player',
    damage,
    timestamp: Date.now(),
  };

  const newState: CombatState = {
    ...state,
    player: { ...state.player, hp: newHP },
    damageAnimations: [...state.damageAnimations, damageAnim],
  };

  return advanceTurn(newState);
}

function advanceTurn(state: CombatState): CombatState {
  // Check win/loss conditions
  const allEnemiesDead = state.enemies.every(e => e.hp <= 0);
  const playerDead = state.player.hp <= 0;

  if (allEnemiesDead) {
    return { ...state, phase: 'victory' };
  }

  if (playerDead) {
    return { ...state, phase: 'defeat' };
  }

  // Advance turn index (loop back to start)
  const nextTurnIndex = (state.currentTurnIndex + 1) % state.turnQueue.length;

  return {
    ...state,
    currentTurnIndex: nextTurnIndex,
  };
}

export function clearDamageAnimations(state: CombatState): CombatState {
  return {
    ...state,
    damageAnimations: [],
  };
}
