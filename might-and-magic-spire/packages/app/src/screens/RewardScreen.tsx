// REWARD / NODE-RESOLUTION — shown after a battle is won (spoils + Necromancy
// raise) or on a rest node. The engine tells us (via pendingRewards) what
// choices exist; we render them as tappable tiles and dispatch pickReward. The
// army economy nodes (dwelling/altar/shrine/merchant) have their OWN screens;
// this handles the post-combat raise/gold and the rest stop.
import type { NodeType, RewardChoice, RunState } from '../engine';
import { creatureLookup } from '../engine';
import { ContentImage } from '../chrome/ContentImage';
import { GoldPip } from '../components/StatBar';

function ChoiceTile({ choice, onPick }: { choice: RewardChoice; onPick: () => void }) {
  if (choice.kind === 'raise') {
    const c = creatureLookup(choice.creatureId);
    return (
      <button
        type="button"
        data-testid="reward-raise"
        onClick={onPick}
        className="flex w-36 flex-col items-center gap-2 rounded-lg border border-necro-400/60 bg-grave-700 p-3 verd-frame active:scale-95"
      >
        <div className="h-16 w-16 overflow-hidden rounded-full border border-necro-400/60">
          <ContentImage imageRef={c?.imageRef ?? 'necropolis_skeleton'} alt={c?.name ?? 'Undead'} className="h-full w-full" />
        </div>
        <div className="font-display text-sm engraved text-necro-400">Raise the Dead</div>
        <div className="text-[0.65rem] text-bone-300">
          +{choice.count} {c?.name ?? 'Skeletons'} from the slain
        </div>
      </button>
    );
  }
  if (choice.kind === 'gold') {
    return (
      <button
        type="button"
        data-testid="reward-gold"
        onClick={onPick}
        className="flex w-36 flex-col items-center justify-center gap-2 rounded-lg border border-amber-300/50 bg-grave-700 p-4 verd-frame active:scale-95"
      >
        <span className="text-3xl text-amber-300/90">⛃</span>
        <div className="font-display text-sm engraved">Spoils</div>
        <div className="text-[0.7rem] text-bone-300">{choice.amount} gold</div>
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="reward-skip"
      onClick={onPick}
      className="flex h-36 w-36 flex-col items-center justify-center rounded-lg border border-grave-600 bg-grave-700 p-3 text-bone-300 active:scale-95"
    >
      <span className="font-display text-sm uppercase tracking-widest">Press on</span>
    </button>
  );
}

const DEFAULT_HEADING = {
  title: 'Spoils of the Dead',
  sub: 'Gather the bones and gold of the fallen.',
};
const HEADINGS: Partial<Record<NodeType, { title: string; sub: string }>> = {
  boss: { title: 'The Spire Yields', sub: 'Claim your reward.' },
  rest: { title: 'A Quiet Crypt', sub: 'A moment among the silent dead.' },
};

export function RewardScreen({
  run,
  choices,
  onPick,
}: {
  run: RunState;
  choices: RewardChoice[];
  onPick: (choice: RewardChoice) => void;
}) {
  const nodeType = run.map.find((n) => n.id === run.currentNodeId)?.type;
  const head = (nodeType && HEADINGS[nodeType]) ?? DEFAULT_HEADING;

  return (
    <div className="flex h-full flex-col items-center bg-necropolis px-4 py-8 text-center animate-fade-in">
      <div className="mb-4 self-stretch flex justify-end">
        <GoldPip gold={run.gold} />
      </div>
      <h2 className="font-display text-2xl tracking-widest text-bone-100 engraved">{head.title}</h2>
      <p className="mt-1 mb-6 text-sm italic text-bone-500">{head.sub}</p>
      <div className="flex flex-wrap items-stretch justify-center gap-3" data-testid="reward-choices">
        {choices.map((choice, i) => (
          <ChoiceTile key={i} choice={choice} onPick={() => onPick(choice)} />
        ))}
      </div>
    </div>
  );
}
