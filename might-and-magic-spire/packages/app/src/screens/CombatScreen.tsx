// COMBAT — the heart of the loop. Top: enemies with telegraphed intents.
// Middle: player stats. Bottom: the hand fanned for thumb reach, an energy
// orb, and End Turn. Targeting model: tap an enemy to select it, then tap a
// single-target card; AoE/self cards ignore selection. All touch, no keyboard.
import { useEffect, useState } from 'react';
import type { CardDef } from '@mms/schema';
import type { RunState } from '../engine';
import { HpPip, HudShell } from '../components/StatBar';
import { RelicBar } from '../components/RelicBar';
import { EnemyView } from '../components/EnemyView';
import { Card } from '../components/Card';
import { ShieldIcon } from '../chrome/icons';

function needsTarget(card: CardDef): boolean {
  return card.effects.some(
    (e) => e.kind === 'damage' && e.target !== 'allEnemies' && e.target !== 'self',
  );
}

export function CombatScreen({
  run,
  onPlayCard,
  onEndTurn,
}: {
  run: RunState;
  onPlayCard: (cardId: string, targetId?: string) => void;
  onEndTurn: () => void;
}) {
  const combat = run.combat!;
  const [target, setTarget] = useState<string | null>(null);

  // Keep selection valid as enemies die; default to the first living enemy.
  useEffect(() => {
    if (combat.enemies.length === 0) return;
    if (!target || !combat.enemies.some((e) => e.id === target)) {
      setTarget(combat.enemies[0].id);
    }
  }, [combat.enemies, target]);

  const play = (card: CardDef) => {
    if (card.cost > combat.energy) return;
    onPlayCard(card.id, needsTarget(card) ? target ?? undefined : undefined);
  };

  return (
    <div className="flex h-full flex-col bg-necropolis">
      <HudShell>
        <div className="flex items-center gap-2 text-xs text-bone-300">
          <span className="font-display tracking-widest text-verd-300">TURN {combat.turn}</span>
        </div>
        <div className="text-[0.65rem] text-bone-500">
          Draw {combat.drawCount} · Discard {combat.discardCount}
        </div>
      </HudShell>
      <div className="border-b border-verd-700 bg-grave-900/60">
        <RelicBar relics={run.relics} />
      </div>

      {/* Enemy stage */}
      <div className="flex flex-1 items-start justify-center gap-3 overflow-y-auto px-3 pt-6">
        {combat.enemies.map((e) => (
          <EnemyView
            key={e.id}
            enemy={e}
            selected={target === e.id}
            onSelect={() => setTarget(e.id)}
          />
        ))}
      </div>

      {/* Player band */}
      <div className="flex items-center justify-between gap-3 border-t border-verd-700 bg-grave-800/90 px-3 py-2">
        <HpPip hp={combat.playerHp} maxHp={combat.playerMaxHp} />
        {combat.playerBlock > 0 && (
          <div
            data-testid="player-block"
            className="flex items-center gap-1 rounded-full border border-verd-500 bg-grave-900 px-2 py-0.5 text-sm text-verd-300"
            aria-label={`Block ${combat.playerBlock}`}
          >
            <ShieldIcon /> {combat.playerBlock}
          </div>
        )}
      </div>

      {/* Hand + controls */}
      <div className="relative bg-grave-900/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-end justify-center gap-2 overflow-x-auto px-3">
          {combat.hand.map((card, i) => (
            <Card
              key={`${card.id}-${i}`}
              card={card}
              playable={card.cost <= combat.energy && combat.outcome === 'ongoing'}
              onClick={() => play(card)}
            />
          ))}
          {combat.hand.length === 0 && (
            <div className="py-8 text-sm italic text-bone-500">Hand empty — end your turn.</div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between px-4">
          {/* Energy orb */}
          <div
            data-testid="energy"
            aria-label={`Energy ${combat.energy} of ${combat.maxEnergy}`}
            className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-verd-300 bg-gradient-to-b from-verd-500 to-grave-800 font-display text-bone-50 shadow-lg"
          >
            <span className="text-lg font-bold leading-none">{combat.energy}</span>
            <span className="text-[0.55rem] leading-none text-bone-300">/{combat.maxEnergy}</span>
          </div>

          <button
            type="button"
            data-testid="end-turn"
            onClick={onEndTurn}
            disabled={combat.outcome !== 'ongoing'}
            className="rounded-md border border-blood-500 bg-blood-500/20 px-6 py-3 font-display text-sm uppercase tracking-widest text-bone-100 active:scale-95 disabled:opacity-40"
          >
            End Turn
          </button>
        </div>
      </div>
    </div>
  );
}
