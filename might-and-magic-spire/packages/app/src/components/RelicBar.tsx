// The relic bar — carried artifacts. Tap a relic to read its rule. Chrome:
// verdigris medallions on a bone rail.
import { useState } from 'react';
import type { Relic } from '../engine';
import { ContentImage } from '../chrome/ContentImage';

export function RelicBar({ relics }: { relics: Relic[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (relics.length === 0) {
    return (
      <div className="flex h-9 items-center px-2 text-[0.65rem] italic text-bone-500">
        No relics yet — slay an elite.
      </div>
    );
  }
  return (
    <div className="relative flex items-center gap-1.5 px-2 py-1">
      {relics.map((r) => (
        <button
          key={r.id}
          type="button"
          data-testid="relic"
          aria-label={`${r.name}: ${r.description}`}
          onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
          className="h-9 w-9 overflow-hidden rounded-full border border-verd-500 bg-grave-700 active:scale-95"
        >
          <ContentImage imageRef={r.imageRef} alt={r.name} className="h-full w-full" />
        </button>
      ))}
      {open && (
        <div
          role="tooltip"
          className="absolute left-2 top-11 z-30 w-56 rounded-md border border-verd-700 bg-grave-900 p-2 text-xs shadow-xl animate-fade-in"
        >
          <div className="font-display text-sm engraved">
            {relics.find((r) => r.id === open)?.name}
          </div>
          <div className="mt-1 text-bone-300">
            {relics.find((r) => r.id === open)?.description}
          </div>
        </div>
      )}
    </div>
  );
}
