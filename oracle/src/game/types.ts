// Oracle of Delve - V0 Types

export interface Entity {
  id: string;
  hp: number;
  maxHP: number;
}

export interface Player extends Entity {
  type: 'player';
}

export interface Enemy extends Entity {
  type: 'enemy';
  name: string;
}

export type TurnQueueEntry = {
  entityId: string;
  entityType: 'player' | 'enemy';
};

export type CombatPhase = 'ongoing' | 'victory' | 'defeat';

export interface CombatState {
  player: Player;
  enemies: Enemy[];
  turnQueue: TurnQueueEntry[];
  currentTurnIndex: number;
  phase: CombatPhase;
  damageAnimations: DamageAnimation[];
}

export interface DamageAnimation {
  id: string;
  targetId: string;
  damage: number;
  timestamp: number;
}
