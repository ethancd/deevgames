// Small numeric fallbacks shared by ai/player.ts, resolving a CardEffect's
// strategy hints (which may be a plain number or a context-sensitive
// function) down to a concrete number for a given view/instance. Default
// (absent hint): baseValue || 1.

import type { CardInstance } from '../../shared/types';
import type { AIGameView, CardEffect } from '../engine/types';

function resolveHint(
  hint: number | ((view: AIGameView, instance: CardInstance) => number) | undefined,
  fallback: number,
  view: AIGameView,
  instance: CardInstance
): number {
  if (hint === undefined) return fallback;
  if (typeof hint === 'number') return hint;
  return hint(view, instance);
}

export function resolvePlayValue(
  effect: CardEffect,
  view: AIGameView,
  instance: CardInstance
): number {
  const fallback = effect.baseValue || 1;
  return resolveHint(effect.strategy?.playValue, fallback, view, instance);
}

export function resolveStealTargetValue(
  effect: CardEffect,
  view: AIGameView,
  instance: CardInstance
): number {
  const fallback = effect.baseValue || 1;
  return resolveHint(effect.strategy?.stealTargetValue, fallback, view, instance);
}

// Non-blocking-implement-job feature: a locked card (or, defensively, any
// card whose effect module simply isn't loaded yet) has no strategy hints to
// consult -- it's "unproven." Rather than crash on the missing module, both
// steal-pick valuation call sites (mid-game target ranking here, and
// src/ui/app.ts's design-round steal-candidate builders) fall back to this
// flat, modest value so a locked card is neither over- nor under-valued
// relative to real, judged cards while its implementation is still forging.
export const LOCKED_CARD_STEAL_VALUE = 1;

export function resolveStealTargetValueSafe(
  effect: CardEffect | undefined,
  locked: boolean,
  view: AIGameView,
  instance: CardInstance
): number {
  if (locked || !effect) return LOCKED_CARD_STEAL_VALUE;
  return resolveStealTargetValue(effect, view, instance);
}
