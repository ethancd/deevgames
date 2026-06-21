// Shared chrome for the economy node screens (Dwelling / Altar / Shrine /
// Merchant): the engraved heading, a gold readout, a centred grid of offer
// tiles with a per-tile affordability gate, and a "press on" skip. Mirrors the
// RewardScreen's visual language so the run reads cohesively.
import type { ReactNode } from 'react';
import { ContentImage } from '../chrome/ContentImage';
import { GoldPip } from '../components/StatBar';

export function NodeScreenShell({
  title,
  sub,
  gold,
  onSkip,
  children,
}: {
  title: string;
  sub: string;
  gold: number;
  onSkip: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-necropolis px-4 py-6 text-center animate-fade-in">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[0.65rem] uppercase tracking-widest text-bone-600">
          Necropolis
        </span>
        <GoldPip gold={gold} />
      </div>
      <h2 className="font-display text-2xl tracking-widest text-bone-100 engraved">{title}</h2>
      <p className="mt-1 mb-5 text-sm italic text-bone-500">{sub}</p>

      <div
        data-testid="node-offers"
        className="flex flex-1 flex-wrap content-start items-stretch justify-center gap-3 overflow-y-auto"
      >
        {children}
      </div>

      <button
        type="button"
        data-testid="node-skip"
        onClick={onSkip}
        className="mx-auto mt-4 rounded-md border border-grave-600 bg-grave-700 px-8 py-3 font-display text-sm uppercase tracking-widest text-bone-300 active:scale-95"
      >
        Press on
      </button>
    </div>
  );
}

export function OfferTile({
  testid,
  dataAttrs,
  imageRef,
  name,
  detail,
  cost,
  affordable,
  onClick,
  badge,
}: {
  testid: string;
  dataAttrs?: Record<string, string>;
  imageRef: string;
  name: string;
  detail?: ReactNode;
  cost: number;
  affordable: boolean;
  onClick: () => void;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-affordable={affordable ? 'true' : 'false'}
      {...dataAttrs}
      disabled={!affordable}
      onClick={onClick}
      className={[
        'flex w-36 flex-col items-center gap-2 rounded-lg border bg-grave-700 p-3 verd-frame transition',
        affordable ? 'border-verd-500 active:scale-95' : 'border-grave-600 opacity-45 grayscale',
      ].join(' ')}
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-md border border-verd-500">
        <ContentImage imageRef={imageRef} alt={name} className="h-full w-full" />
        {badge}
      </div>
      <div className="font-display text-[0.72rem] engraved leading-tight">{name}</div>
      {detail && <div className="text-[0.6rem] text-bone-400">{detail}</div>}
      <div
        className={`mt-auto flex items-center gap-1 font-display text-xs ${affordable ? 'text-amber-300/90' : 'text-blood-400'}`}
      >
        {cost} gold
      </div>
    </button>
  );
}
