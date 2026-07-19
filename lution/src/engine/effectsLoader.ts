// Effect module discovery. Boot-time loading is eager via import.meta.glob
// (works in both the Vite dev/build pipeline and Vitest, which shares Vite's
// transform pipeline) — files starting with "_" (the starter factory,
// _template.ts) are excluded. Mid-session hot loading (from M3 on, when
// Claude's implement job writes a brand-new src/effects/<id>.ts while the
// dev server is running) goes through loadEffectFresh's cache-busted dynamic
// import instead (query param defeats Vite's module cache).
//
// tests/structural.test.ts deliberately does NOT depend on this module (it
// globs src/effects/*.ts directly) so it stays green independent of this
// file's state; tests that DO want a real effects map (tests/helpers.ts) use
// loadAllEffects() or loadEffects() here.

import type { CardDef, CardId } from '../../shared/types';
import { compileComposition } from './compileComposition';
import type { CardEffect } from './types';

type EffectModule = { default: CardEffect };

function isUnderscored(path: string): boolean {
  return (path.split('/').pop() ?? '').startsWith('_');
}

export function loadAllEffects(): Map<CardId, CardEffect> {
  const modules = import.meta.glob('../effects/*.ts', { eager: true }) as Record<string, EffectModule>;
  const map = new Map<CardId, CardEffect>();
  for (const [path, mod] of Object.entries(modules)) {
    if (isUnderscored(path)) continue;
    map.set(mod.default.cardId, mod.default);
  }
  return map;
}

// M2: the loading-precedence entry point (see the M1 plan's §3 and shared/
// types.ts's CardDef.composition doc comment). For every registry row: a
// bespoke src/effects/<id>.ts module wins IFF one exists on disk; otherwise,
// if the row carries a `composition`, it's compiled on the spot via
// src/engine/compileComposition.ts; otherwise the card has no effect at all
// (an unimplemented/locked card, same as today). This is a superset of
// loadAllEffects() -- bespoke modules for ids with no registry row at all
// (shouldn't normally happen, but tests/structural.test.ts's own invariants
// are what actually enforce that) are simply not included, since this
// function's whole job is "one CardEffect per registry row."
export function loadEffects(registry: readonly CardDef[]): Map<CardId, CardEffect> {
  const bespoke = loadAllEffects();
  const map = new Map<CardId, CardEffect>();
  for (const card of registry) {
    const bespokeEffect = bespoke.get(card.id);
    if (bespokeEffect) {
      map.set(card.id, bespokeEffect);
      continue;
    }
    if (card.composition) {
      map.set(card.id, compileComposition(card.id, card.composition));
    }
  }
  return map;
}

let cacheBustCounter = 0;

export async function loadEffectFresh(cardId: CardId): Promise<CardEffect> {
  cacheBustCounter += 1;
  // Root-absolute paths are NOT rewritten by Vite's dev-time import analysis
  // when this is a dynamically-constructed specifier passed through
  // `@vite-ignore` (that directive exists precisely to skip Vite's static
  // rewriting for imports it can't analyze). Since the app is served under
  // `base: '/lution/'`, the URL must be built from `import.meta.env.BASE_URL`
  // rather than hardcoding a leading `/src/...` — otherwise this 404s against
  // the real dev server (verified: `/src/effects/x.ts` -> 404, `/lution/src/effects/x.ts` -> 200).
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const url = `${base}src/effects/${cardId}.ts?t=${Date.now()}-${cacheBustCounter}`;
  const mod = (await import(/* @vite-ignore */ url)) as EffectModule;
  return mod.default;
}

// Direct-registration path (for environments/tests where import.meta.glob
// eager-loading everything isn't desired): build the same
// Map<CardId, CardEffect> shape from an already-imported list of effect
// modules, e.g. `registerEffects([starterA, starterB, ...])`.
export function registerEffects(effectList: CardEffect[]): Map<CardId, CardEffect> {
  const map = new Map<CardId, CardEffect>();
  for (const effect of effectList) {
    map.set(effect.cardId, effect);
  }
  return map;
}
