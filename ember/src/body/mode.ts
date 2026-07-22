/**
 * EMBER — kernel-computed mode with hysteresis (src/body/mode.ts).
 *
 * Modes are never set by the pilot. Priority when multiple conditions are
 * simultaneously true: DEFEND > RECOVER > CONSERVE > EXPLORE. Each mode uses
 * separate enter/exit thresholds so the kernel doesn't chatter at a boundary
 * (rising path enters at a harder threshold than the falling path needs to
 * exit).
 */

import type { Mode } from '../core/types';
import {
  CONSERVE_FUEL_ENTER,
  CONSERVE_FUEL_EXIT,
  CONSERVE_HEAT_ENTER,
  CONSERVE_HEAT_EXIT,
  DEFEND_ENTER,
  DEFEND_EXIT,
  RECOVER_DAMAGE_ENTER,
  RECOVER_DAMAGE_EXIT,
  RECOVER_FATIGUE_ENTER,
  RECOVER_FATIGUE_EXIT,
} from './constants';

export interface ModeInputs {
  fuel: number;
  heat: number;
  damage: number;
  fatigue: number;
  activation: number;
}

export function computeMode(prev: Mode, b: ModeInputs): Mode {
  const defendActive =
    prev === 'DEFEND' ? b.activation > DEFEND_EXIT : b.activation >= DEFEND_ENTER;
  if (defendActive) return 'DEFEND';

  // "no threat" gate for RECOVER: activation must be below the DEFEND exit
  // threshold, i.e. not even lingering in a just-left-DEFEND hangover.
  const noThreat = b.activation < DEFEND_EXIT;

  const recoverDamage =
    prev === 'RECOVER'
      ? b.damage > RECOVER_DAMAGE_EXIT
      : b.damage >= RECOVER_DAMAGE_ENTER;
  const recoverFatigue =
    prev === 'RECOVER'
      ? b.fatigue > RECOVER_FATIGUE_EXIT
      : b.fatigue >= RECOVER_FATIGUE_ENTER;
  if ((recoverDamage || recoverFatigue) && noThreat) return 'RECOVER';

  const conserveFuel =
    prev === 'CONSERVE' ? b.fuel < CONSERVE_FUEL_EXIT : b.fuel <= CONSERVE_FUEL_ENTER;
  const conserveHeat =
    prev === 'CONSERVE' ? b.heat < CONSERVE_HEAT_EXIT : b.heat <= CONSERVE_HEAT_ENTER;
  if (conserveFuel || conserveHeat) return 'CONSERVE';

  return 'EXPLORE';
}
