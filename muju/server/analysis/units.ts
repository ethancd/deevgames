import { calculateAttackPower, calculateDefense, canAttack, getAttackCount } from '../../src/game/combat';
import { getUnitDefinition } from '../../src/game/units';
import { getPromotionCost } from '../../src/game/promotion';
import { isLegalAction } from '../../src/game/legality';
import { unitUpkeep } from '../../src/game/upkeep';
import type { GameState } from '../../src/game/types';
import { square } from '../notation';
import type { AnalysisInput } from './schema';
import { selectedUnits } from './geometry';

export function unitDetails(s: GameState, input: AnalysisInput) {
  return selectedUnits(s, input).map(u => {
    const d = getUnitDefinition(u.definitionId);
    return { unit: `${u.id}@${square(u.position)} ${d.id}/${d.tier}`, element: d.element, attack: d.attack,
      baseDefense: d.defense, remainingDefense: calculateDefense(u), speed: d.speed, attacksUsed: getAttackCount(u),
      canAttack: canAttack(u), chainEligible: canAttack(u) && getAttackCount(u) > 0, upkeep: unitUpkeep(u),
      canAct: u.canActThisTurn, placedThisTurn: !!u.placedThisTurn,
      promotion: { legalNow: isLegalAction(s, { type: 'PROMOTE_UNIT', unitId: u.id }), cost: getPromotionCost(u) } };
  });
}

/** Definition rows deduplicate identical matchups; instance defense remains
 * separate, so a damaged defender never acquires another instance's health. */
export function matchups(s: GameState) {
  const definitions = [...new Set(s.board.units.map(u => u.definitionId))].sort();
  const matrix = (owner: 'white' | 'black') => definitions.map(a => definitions.map(d => calculateAttackPower(
    { ...s.board.units[0], definitionId: a, owner }, { ...s.board.units[0], definitionId: d })));
  const white = matrix('white'), black = matrix('black');
  return { definitions, attack: white,
    ...(JSON.stringify(white) !== JSON.stringify(black) ? { blackAttackOverride: black } : {}),
    defenders: s.board.units.map(u => [u.id, u.definitionId, calculateDefense(u)]),
    notation: 'Matrices use definitions for rows/columns. A hit kills iff attack >= the instance remainingDefense; defense is also damage needed to finish. Geometry/attack eligibility excluded.' };
}
