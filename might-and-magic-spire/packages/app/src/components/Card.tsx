// A single card. CHROME (frame, cost orb, type band) is ours; the portrait is
// CONTENT art pulled from the manifest via ContentImage. Gothic register: a
// bone frame with a verdigris inner rule and a wax-seal cost orb.
import type { CardDef } from '@mms/schema';
import { ContentImage } from '../chrome/ContentImage';

const TYPE_BAND: Record<CardDef['type'], string> = {
  strike: 'text-blood-400',
  skill: 'text-verd-300',
  power: 'text-necro-400',
};

const TYPE_LABEL: Record<CardDef['type'], string> = {
  strike: 'Attack',
  skill: 'Skill',
  power: 'Power',
};

export function Card({
  card,
  playable,
  onClick,
  compact = false,
}: {
  card: CardDef;
  playable?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid="card"
      data-card-id={card.id}
      aria-label={`${card.name}, cost ${card.cost}, ${TYPE_LABEL[card.type]}. ${card.text}`}
      className={[
        'relative shrink-0 select-none rounded-lg text-left transition-transform',
        compact ? 'w-28' : 'w-32',
        'bg-grave-700 verd-frame',
        playable
          ? 'ring-1 ring-verd-300/60 active:scale-95 hover:-translate-y-2 hover:ring-verd-300'
          : onClick
            ? 'opacity-95 active:scale-95'
            : '',
        !playable && onClick ? 'grayscale-[35%]' : '',
      ].join(' ')}
    >
      {/* Cost orb — wax-seal crimson */}
      <span
        className="absolute -left-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-bone-300/40 bg-blood-500 font-display text-base font-bold text-bone-50 shadow-md"
        aria-hidden
      >
        {card.cost}
      </span>

      {/* Portrait (content art) */}
      <div className="overflow-hidden rounded-t-lg">
        <ContentImage
          imageRef={card.imageRef}
          alt={card.name}
          className="h-20 w-full"
        />
      </div>

      {/* Name plate */}
      <div className="border-y border-verd-700 bg-grave-800 px-2 py-1">
        <div className="truncate font-display text-[0.7rem] font-bold engraved">
          {card.name}
        </div>
        <div className={`text-[0.55rem] uppercase tracking-wider ${TYPE_BAND[card.type]}`}>
          {TYPE_LABEL[card.type]}
        </div>
      </div>

      {/* Rules text */}
      <div className="px-2 py-1.5 text-[0.66rem] leading-snug text-bone-300">
        {card.text}
      </div>
    </button>
  );
}
