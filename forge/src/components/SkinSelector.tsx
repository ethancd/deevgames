import { useSkin } from '../skins/SkinContext';

export function SkinSelector() {
  const { skinId, setSkin, availableSkins } = useSkin();

  return (
    <div className="flex items-center gap-2">
      {availableSkins.map(skin => (
        <button
          key={skin.id}
          onClick={() => setSkin(skin.id)}
          className={`glass-panel px-4 py-2 rounded-lg font-bold border-2 transition-all duration-200 ${
            skinId === skin.id
              ? 'border-amber-500 shadow-lg shadow-amber-500/30'
              : 'border-amber-900/30 hover:border-amber-700'
          }`}
          style={{ fontFamily: 'var(--font-display)', color: 'var(--bronze)' }}
          title={skin.description}
        >
          <span className="mr-2">{skin.icon}</span>
          {skin.displayName}
        </button>
      ))}
    </div>
  );
}

export function SkinSelectorCompact() {
  const { skinId, setSkin, availableSkins } = useSkin();

  return (
    <div className="flex items-center gap-1">
      {availableSkins.map(skin => (
        <button
          key={skin.id}
          onClick={() => setSkin(skin.id)}
          className={`glass-panel px-3 py-2 rounded-lg text-xl transition-all duration-200 ${
            skinId === skin.id
              ? 'border-2 border-amber-500 shadow-lg shadow-amber-500/30'
              : 'border border-amber-900/30 hover:border-amber-700'
          }`}
          title={`${skin.displayName}: ${skin.description}`}
        >
          {skin.icon}
        </button>
      ))}
    </div>
  );
}
