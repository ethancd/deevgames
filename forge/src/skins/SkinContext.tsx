import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { SkinId, Skin } from './types';
import { originalSkin } from './original';
import { cartoonSkin } from './cartoon';

const SKINS: Record<SkinId, Skin> = {
  original: originalSkin,
  cartoon: cartoonSkin,
};

const STORAGE_KEY = 'forge-skin-preference';

interface SkinContextValue {
  skinId: SkinId;
  skin: Skin;
  setSkin: (id: SkinId) => void;
  availableSkins: Skin[];
}

const SkinContext = createContext<SkinContextValue | null>(null);

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skinId, setSkinId] = useState<SkinId>(() => {
    if (typeof window === 'undefined') return 'original';
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'cartoon' ? 'cartoon' : 'original') as SkinId;
  });

  const setSkin = (id: SkinId) => {
    setSkinId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  useEffect(() => {
    // Apply skin class to document root
    document.documentElement.classList.remove('skin-original', 'skin-cartoon');
    document.documentElement.classList.add(`skin-${skinId}`);
  }, [skinId]);

  return (
    <SkinContext.Provider value={{
      skinId,
      skin: SKINS[skinId],
      setSkin,
      availableSkins: Object.values(SKINS),
    }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  const context = useContext(SkinContext);
  if (!context) {
    throw new Error('useSkin must be used within a SkinProvider');
  }
  return context;
}
