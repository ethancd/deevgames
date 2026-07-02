// A transient toast for an instant-tile claim (§27): "+1 Defense", "+120 XP", …
// Driven by run.lastClaim; auto-dismisses. `resetKey` (the claimed node id) makes
// a fresh claim re-trigger the show even if the tile/amount repeats.
import { useEffect, useState } from 'react';
import type { NodeType } from '../engine';

const CLAIM_TEXT: Partial<Record<NodeType, (n: number) => string>> = {
  attack: (n) => `⚔️  +${n} Attack`,
  defense: (n) => `🛡️  +${n} Defense`,
  power: (n) => `✦  +${n} Power`,
  knowledge: (n) => `📖  +${n} Knowledge`,
  xp: (n) => `★  +${n} XP`,
  gold: (n) => `⛃  +${n} Gold`,
  mana: () => `🔮  Mana Restored`,
  rest: () => `🏕️  Rested`,
};

export function ClaimToast({
  claim,
  resetKey,
}: {
  claim: { tile: NodeType; amount: number };
  resetKey: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!CLAIM_TEXT[claim.tile]) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [resetKey, claim.tile, claim.amount]);

  const fmt = CLAIM_TEXT[claim.tile];
  if (!visible || !fmt) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-40 flex justify-center animate-fade-in">
      <div className="rounded-full border border-verd-300/70 bg-grave-900/95 px-5 py-2 font-display text-sm tracking-wide text-verd-200 shadow-lg">
        {fmt(claim.amount)}
      </div>
    </div>
  );
}
