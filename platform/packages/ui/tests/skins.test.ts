import { describe, expect, it, vi } from 'vitest';
import { defineSkin, createSkinManager, type SkinStorage } from '../src/skins.ts';

interface DemoTheme {
  primary: string;
}

function memoryStorage(): SkinStorage {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
  };
}

function makeSkins() {
  const light = defineSkin<DemoTheme>({
    id: 'light',
    cssClass: 'skin-light',
    theme: { primary: '#fff' },
    names: { crimson: 'Ivory Order' },
    cssVars: { '--dv-bg': '#ffffff' },
  });
  const dark = defineSkin<DemoTheme>({
    id: 'dark',
    cssClass: 'skin-dark',
    theme: { primary: '#000' },
    cssVars: { '--dv-bg': '#000000' },
  });
  return [light, dark];
}

describe('defineSkin', () => {
  it('fills in defaults for optional fields', () => {
    const skin = defineSkin<DemoTheme>({ id: 'x', cssClass: 'skin-x', theme: { primary: 'red' } });
    expect(skin.names).toEqual({});
    expect(skin.cssVars).toEqual({});
    expect(skin.assetPath).toBeUndefined();
  });
});

describe('createSkinManager', () => {
  it('set() swaps the root class, sets css vars, and persists to injected storage', () => {
    const root = document.createElement('div');
    const storage = memoryStorage();
    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage, root });

    expect(root.classList.contains('skin-light')).toBe(true);

    manager.set('dark');

    expect(root.classList.contains('skin-light')).toBe(false);
    expect(root.classList.contains('skin-dark')).toBe(true);
    expect(root.style.getPropertyValue('--dv-bg')).toBe('#000000');
    expect(storage.get('deev:skin')).toBe('dark');
    expect(manager.current().id).toBe('dark');
  });

  it('restores from storage on create', () => {
    const root = document.createElement('div');
    const storage = memoryStorage();
    storage.set('deev:skin', 'dark');

    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage, root });

    expect(manager.current().id).toBe('dark');
    expect(root.classList.contains('skin-dark')).toBe(true);
    expect(root.classList.contains('skin-light')).toBe(false);
  });

  it('falls back to defaultId when storage holds an unknown id', () => {
    const root = document.createElement('div');
    const storage = memoryStorage();
    storage.set('deev:skin', 'nonexistent');

    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage, root });

    expect(manager.current().id).toBe('light');
  });

  it('displayName remaps a known key and falls back to the raw key otherwise', () => {
    const root = document.createElement('div');
    const storage = memoryStorage();
    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage, root });

    expect(manager.displayName('crimson')).toBe('Ivory Order');
    expect(manager.displayName('unknown-key')).toBe('unknown-key');
  });

  it('subscribe() fires on set() and the returned unsubscribe stops delivery', () => {
    const root = document.createElement('div');
    const storage = memoryStorage();
    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage, root });

    const fn = vi.fn();
    const unsubscribe = manager.subscribe(fn);

    manager.set('dark');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ id: 'dark' }));

    unsubscribe();
    manager.set('light');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('set() throws on an unknown id', () => {
    const root = document.createElement('div');
    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage: memoryStorage(), root });
    expect(() => manager.set('nope')).toThrow();
  });

  it('uses document.documentElement as the default root', () => {
    const storage = memoryStorage();
    const manager = createSkinManager({ skins: makeSkins(), defaultId: 'light', storage });
    try {
      expect(document.documentElement.classList.contains('skin-light')).toBe(true);
      expect(manager.current().id).toBe('light');
    } finally {
      document.documentElement.classList.remove('skin-light', 'skin-dark');
    }
  });
});
