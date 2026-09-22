import type { Unit, PlayerId, Position } from './types';
import { UNIT_DEFINITIONS } from './units';

export interface BuildState { crystals: number }

/** Only tier 1 is purchased. Higher tiers arise through promotion on the board. */
export function getAffordablePurchases(resources: number) {
  return UNIT_DEFINITIONS.filter(def => def.tier === 1 && def.cost <= resources);
}

export function createUnitFromDefinition(definitionId: string, owner: PlayerId, position: Position, id: string): Unit {
  return { id, definitionId, owner, position, hasMoved: false, hasAttacked: false,
    lastAttackKilled: false, canActThisTurn: true, damageTaken: 0,
    promotedThisPlacement: false, placedThisTurn: true };
}
