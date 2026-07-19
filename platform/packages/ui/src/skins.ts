// Skin system — an HONEST redesign, not "FORGE generalized".
//
// FORGE's skins (forge/src/skins/types.ts, read-only reference) have no CSS
// vars at all: the load-bearing part is a typed `theme` object of Tailwind
// class bundles per faction/symbol, a card-name remap, and an `imagePath`
// function, all applied by consuming components reading `theme` directly —
// the root only ever gets a single `cssClass`. This module keeps that shape
// (typed `theme: T` is what components read) and adds the shared plumbing
// FORGE re-implemented ad hoc per game: root-class swapping, optional CSS
// custom properties for the (rarer) game that does want themeable CSS vars,
// name-remap-with-fallback, and persistence — generalized here, not
// invented from a CSS-vars system that never existed in FORGE.

export interface SkinSpec<T> {
  id: string;
  cssClass: string;
  theme: T;
  names?: Record<string, string>;
  assetPath?(key: string): string;
  cssVars?: Record<string, string>;
}

export interface Skin<T> {
  id: string;
  cssClass: string;
  theme: T;
  names: Record<string, string>;
  assetPath?(key: string): string;
  cssVars: Record<string, string>;
}

export function defineSkin<T>(spec: SkinSpec<T>): Skin<T> {
  return {
    id: spec.id,
    cssClass: spec.cssClass,
    theme: spec.theme,
    names: spec.names ?? {},
    assetPath: spec.assetPath,
    cssVars: spec.cssVars ?? {},
  };
}

export interface SkinStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SkinManagerOptions<T> {
  skins: Skin<T>[];
  defaultId: string;
  /** Defaults to `localStorage`; MUST be injectable for testing. */
  storage?: SkinStorage;
  storageKey?: string;
  /** Defaults to `document.documentElement`. */
  root?: HTMLElement;
}

export interface SkinManager<T> {
  current(): Skin<T>;
  /** Applies root class (removing the previous skin's class), sets cssVars, persists id. */
  set(id: string): void;
  /** Name remap with fallback to the raw key. */
  displayName(key: string): string;
  subscribe(fn: (skin: Skin<T>) => void): () => void;
}

const DEFAULT_STORAGE_KEY = 'deev:skin';

function localStorageAdapter(): SkinStorage {
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
  };
}

export function createSkinManager<T>(opts: SkinManagerOptions<T>): SkinManager<T> {
  if (opts.skins.length === 0) {
    throw new Error('createSkinManager: skins must be non-empty');
  }
  const byId = new Map(opts.skins.map((skin) => [skin.id, skin]));
  if (!byId.has(opts.defaultId)) {
    throw new Error(`createSkinManager: defaultId "${opts.defaultId}" is not among skins`);
  }

  const storage = opts.storage ?? localStorageAdapter();
  const storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY;
  const root = opts.root ?? document.documentElement;

  const storedId = storage.get(storageKey);
  let current: Skin<T> = (storedId !== null && byId.get(storedId)) || byId.get(opts.defaultId)!;

  const subscribers = new Set<(skin: Skin<T>) => void>();

  function applyToRoot(next: Skin<T>, previous: Skin<T> | null): void {
    if (previous) root.classList.remove(previous.cssClass);
    root.classList.add(next.cssClass);
    for (const [name, value] of Object.entries(next.cssVars)) {
      root.style.setProperty(name, value);
    }
  }

  // Apply the restored (or default) skin immediately so the root reflects
  // manager state as soon as it's constructed, without waiting for set().
  applyToRoot(current, null);

  return {
    current() {
      return current;
    },
    set(id: string) {
      const next = byId.get(id);
      if (!next) {
        throw new Error(`createSkinManager: unknown skin id "${id}"`);
      }
      const previous = current;
      current = next;
      applyToRoot(next, previous);
      storage.set(storageKey, id);
      for (const fn of subscribers) fn(current);
    },
    displayName(key: string) {
      return current.names[key] ?? key;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
