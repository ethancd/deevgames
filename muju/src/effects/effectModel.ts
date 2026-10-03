import type { BoardState, Element, GameState, PlayerId, Position, Unit } from '../game/types';
import { getAttackModifier } from '../game/elements';
import { getUnitDefinition } from '../game/units';

/** How hard a blow lands, from the elemental modifier: −1, 0, +1. */
export type Magnitude = 'resisted' | 'normal' | 'vulnerable';
export const MAGNITUDES: readonly Magnitude[] = ['resisted', 'normal', 'vulnerable'];
/** Particle count, radius, duration and shake all scale by this. */
export const MAGNITUDE_SCALE: Record<Magnitude, number> = { resisted: .6, normal: 1, vulnerable: 1.6 };
/** Kill layers play lower as the blow gets heavier. */
export const MAGNITUDE_PITCH: Record<Magnitude, number> = { resisted: 1.15, normal: 1, vulnerable: .82 };

export type BoardEffect =
  | { kind: 'hit' | 'kill'; x: number; y: number; attackerElement: Element; magnitude: Magnitude; defenderOwner?: PlayerId }
  /** Crystal lights leaving a square; `to` is a square, or off the top edge when omitted. */
  | { kind: 'collect'; x: number; y: number; count: number; to?: Position }
  | { kind: 'checkmate'; x: number; y: number; winner: PlayerId }
  | { kind: 'reveal'; x: number; y: number };

export function magnitudeFor(attackerElement: Element, defenderElement: Element): Magnitude {
  const modifier = getAttackModifier(attackerElement, defenderElement);
  return modifier > 0 ? 'vulnerable' : modifier < 0 ? 'resisted' : 'normal';
}

/** Attacks visible between two rendered boards: each new target in an attacker's
 * `attackedThisTurn`. A target missing afterwards was killed. Undo, reloads and
 * unrelated boards never grow that list, so they produce nothing. */
export function attackEffects(before: BoardState, after: BoardState): BoardEffect[] {
  const old = new Map(before.units.map(unit => [unit.id, unit]));
  if (!after.units.some(unit => old.has(unit.id))) return [];
  const alive = new Set(after.units.map(unit => unit.id));
  const effects: BoardEffect[] = [];
  for (const attacker of after.units) {
    const previous = old.get(attacker.id);
    if (!previous) continue;
    for (const targetId of attacker.attackedThisTurn ?? []) {
      if (previous.attackedThisTurn?.includes(targetId)) continue;
      const target = old.get(targetId);
      if (!target) continue;
      effects.push(blowEffect(attacker, target, alive.has(targetId) ? 'hit' : 'kill'));
    }
  }
  return effects;
}

export function blowEffect(attacker: Pick<Unit, 'definitionId'>, target: Pick<Unit, 'definitionId' | 'position' | 'owner'>, kind: 'hit' | 'kill'): BoardEffect {
  const attackerElement = getUnitDefinition(attacker.definitionId).element;
  return { kind, x: target.position.x, y: target.position.y, attackerElement, defenderOwner: target.owner,
    magnitude: magnitudeFor(attackerElement, getUnitDefinition(target.definitionId).element) };
}

/** A home win or home checkmate that just happened celebrates on the invaded home. */
export function victoryEffect(before: Pick<GameState, 'phase'>, after: GameState): BoardEffect | null {
  if (before.phase === 'victory' || after.phase !== 'victory' || !after.winner) return null;
  if (after.victoryReason !== 'home-checkmate' && after.victoryReason !== 'home-occupation') return null;
  const last = after.board.cells.length - 1;
  const home = after.winner === 'white' ? { x: last, y: last } : { x: 0, y: 0 };
  return { kind: 'checkmate', x: home.x, y: home.y, winner: after.winner };
}

/** Per-element look, used by the renderer and pinned by tests. */
export const ELEMENT_LOOK: Record<Element, { name: string; particle: ParticleShape; gravity: number; speed: number; count: number; life: number }> = {
  fire: { name: 'ember burst', particle: 'ember', gravity: -.22, speed: 2.6, count: 26, life: 650 },
  lightning: { name: 'fork flash', particle: 'spark', gravity: .05, speed: 4.2, count: 14, life: 380 },
  water: { name: 'ripple splash', particle: 'droplet', gravity: .32, speed: 2.8, count: 18, life: 620 },
  shadow: { name: 'ink bloom', particle: 'ink', gravity: 0, speed: .9, count: 12, life: 820 },
  plant: { name: 'leaf scatter', particle: 'leaf', gravity: .07, speed: 2.1, count: 16, life: 900 },
  metal: { name: 'spark shards', particle: 'shard', gravity: .25, speed: 4.6, count: 20, life: 520 },
};
export type ParticleShape = 'ember' | 'spark' | 'droplet' | 'ink' | 'leaf' | 'shard' | 'confetti' | 'light' | 'glow' | 'ring' | 'bolt';

/** Particle count for one blow; a kill adds half again plus the shatter. */
export function particleCount(element: Element, magnitude: Magnitude, kind: 'hit' | 'kill'): number {
  return Math.round(ELEMENT_LOOK[element].count * MAGNITUDE_SCALE[magnitude] * (kind === 'kill' ? 1.5 : 1));
}

/** Board shake in pixels; resisted hits do not shake. */
export function shakeFor(magnitude: Magnitude, kind: 'hit' | 'kill'): number {
  if (magnitude === 'resisted' && kind === 'hit') return 0;
  return Math.round(2 * MAGNITUDE_SCALE[magnitude] * (kind === 'kill' ? 1.6 : 1) * 10) / 10;
}

export const ARMY_COLORS: Record<PlayerId, string[]> = {
  white: ['#ffffff', '#f6ebcd', '#f5d780', '#cfe6ff', '#b5e5e4'],
  black: ['#172334', '#41516a', '#f5d780', '#e2eafa', '#8b5cf6'],
};
