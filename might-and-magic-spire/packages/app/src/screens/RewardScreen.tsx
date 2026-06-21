// REWARD / NODE-RESOLUTION — shown after a combat win, or when standing on a
// rest / shop / event node. The engine tells us (via pendingRewards) what
// choices exist; we render them as tappable cards/relics/heals and dispatch
// pickReward. The node's flavour (rest vs shop vs event vs spoils) sets the
// heading so each non-combat node still reads distinctly.
import type { CardDef } from '@mms/schema';
import type { NodeType, RewardChoice, Relic, RunState } from '../engine';
import { Card } from '../components/Card';
import { ContentImage } from '../chrome/ContentImage';
import { HeartIcon } from '../chrome/icons';

// The mock's pools, surfaced for rendering choice previews. At integration the
// engine should return rich choices (with the CardDef/Relic inline); until
// then we look them up from the run-visible context where possible and fall
// back to a label.
function ChoiceTile({
  choice,
  cardLookup,
  relicLookup,
  onPick,
}: {
  choice: RewardChoice;
  cardLookup: (id: string) => CardDef | undefined;
  relicLookup: (id: string) => Relic | undefined;
  onPick: () => void;
}) {
  if (choice.kind === 'card') {
    const card = cardLookup(choice.cardId);
    return card ? (
      <Card card={card} playable onClick={onPick} />
    ) : (
      <GenericTile label={`Card: ${choice.cardId}`} onPick={onPick} />
    );
  }
  if (choice.kind === 'relic') {
    const relic = relicLookup(choice.relicId);
    return (
      <button
        type="button"
        data-testid="reward-relic"
        onClick={onPick}
        className="flex w-32 flex-col items-center gap-2 rounded-lg border border-verd-500 bg-grave-700 p-3 verd-frame active:scale-95"
      >
        <div className="h-14 w-14 overflow-hidden rounded-full border border-verd-500">
          <ContentImage imageRef={relic?.imageRef ?? 'unknown'} alt={relic?.name ?? 'Relic'} className="h-full w-full" />
        </div>
        <div className="font-display text-xs engraved">{relic?.name ?? choice.relicId}</div>
        <div className="text-[0.6rem] text-bone-300">{relic?.description}</div>
      </button>
    );
  }
  if (choice.kind === 'heal') {
    return (
      <button
        type="button"
        data-testid="reward-heal"
        onClick={onPick}
        className="flex w-32 flex-col items-center gap-2 rounded-lg border border-blood-500 bg-grave-700 p-4 verd-frame active:scale-95"
      >
        <HeartIcon className="text-2xl text-blood-400" />
        <div className="font-display text-sm engraved">Rest</div>
        <div className="text-[0.65rem] text-bone-300">Heal {choice.amount} HP</div>
      </button>
    );
  }
  if (choice.kind === 'gold') {
    return (
      <button
        type="button"
        data-testid="reward-gold"
        onClick={onPick}
        className="flex w-32 flex-col items-center gap-2 rounded-lg border border-bone-400 bg-grave-700 p-4 verd-frame active:scale-95"
      >
        <span className="text-2xl">⛃</span>
        <div className="font-display text-sm engraved">Spoils</div>
        <div className="text-[0.65rem] text-bone-300">{choice.amount} gold</div>
      </button>
    );
  }
  return <GenericTile label="Move on" onPick={onPick} testid="reward-skip" />;
}

function GenericTile({ label, onPick, testid }: { label: string; onPick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onPick}
      className="flex h-40 w-32 flex-col items-center justify-center rounded-lg border border-grave-600 bg-grave-700 p-3 text-bone-300 active:scale-95"
    >
      <span className="font-display text-sm">{label}</span>
    </button>
  );
}

const HEADINGS: Record<NodeType, { title: string; sub: string }> = {
  combat: { title: 'Spoils of the Dead', sub: 'Take one into your deck.' },
  elite: { title: 'Elite Spoils', sub: 'A relic stirs among the bones.' },
  boss: { title: 'The Spire Yields', sub: 'Claim your reward.' },
  rest: { title: 'A Quiet Crypt', sub: 'Mend your wounds, or press on.' },
  shop: { title: 'The Bone Pedlar', sub: 'Spend your gold among the wares.' },
  event: { title: 'An Omen', sub: 'The dead offer a choice.' },
};

export function RewardScreen({
  run,
  choices,
  cardLookup,
  relicLookup,
  onPick,
}: {
  run: RunState;
  choices: RewardChoice[];
  cardLookup: (id: string) => CardDef | undefined;
  relicLookup: (id: string) => Relic | undefined;
  onPick: (choice: RewardChoice) => void;
}) {
  const nodeType: NodeType =
    run.map.find((n) => n.id === run.currentNodeId)?.type ?? 'combat';
  const head = HEADINGS[nodeType];

  return (
    <div className="flex h-full flex-col items-center justify-center bg-necropolis px-4 py-8 text-center animate-fade-in">
      <h2 className="font-display text-2xl tracking-widest text-bone-100 engraved">{head.title}</h2>
      <p className="mt-1 mb-6 text-sm italic text-bone-500">{head.sub}</p>
      <div className="flex flex-wrap items-stretch justify-center gap-3" data-testid="reward-choices">
        {choices.map((choice, i) => (
          <ChoiceTile
            key={i}
            choice={choice}
            cardLookup={cardLookup}
            relicLookup={relicLookup}
            onPick={() => onPick(choice)}
          />
        ))}
      </div>
    </div>
  );
}
