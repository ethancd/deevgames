// COMBAT — the heart of the loop, rebuilt as a HoMM3 ARMY battle. Top: the
// enemy army across two ranks with honest telegraphs. Middle: a sunken combat
// log. Bottom (thumb reach): your two ranks, the hero-doll strip, a mana-gated
// Spellbook drawer, and End Turn.
//
// Interaction (all touch, side-alternation):
//   • Tap one of YOUR unacted stacks → its legal enemy targets glow
//     (animate-pulse-blood), illegal stacks dim → tap an enemy to ATTACK it, or
//     tap Defend to brace.
//   • Tap a spell → it arms → tap a legal target (or it resolves if self/all).
//   • End Turn runs the enemy army; log deltas + floating damage numbers flash.
// The army roster is the life total: when your last stack falls you lose.
import { useEffect, useRef, useState } from 'react';
import type {
  Army,
  CombatEvent,
  CombatSpell,
  CombatState,
  CommandOrder,
  DamageForecast,
  RunState,
  Stack,
} from '../engine';
import { BattleField } from '../components/BattleField';
import { Spellbook } from '../components/Spellbook';
import { HeroDollStrip } from '../components/HeroDoll';
import { ArmyPip, HudShell } from '../components/StatBar';
import type { FloatKind } from '../components/FloatingNumber';

type Float = { id: string; text: string; kind: FloatKind };

let floatSeq = 0;

// Apply one strike's outcome to a board snapshot — used to replay the final
// turn blow-by-blow over a retained battlefield (the engine settled & cleared
// the live combat, so we animate from a kept copy).
function applyEventToBoard(combat: CombatState, e: CombatEvent): CombatState {
  const upd = (army: Army): Army => ({
    ...army,
    stacks: army.stacks.map((s) => {
      if (s.id !== e.targetId) return s;
      const count = Math.max(0, s.count - e.killed);
      const hpTop =
        count <= 0 ? 0 : e.killed > 0 ? s.maxHpPer : Math.max(1, s.hpTop - e.damage);
      return { ...s, count, hpTop };
    }),
  });
  return { ...combat, yourArmy: upd(combat.yourArmy), enemyArmy: upd(combat.enemyArmy) };
}

export function CombatScreen({
  run,
  onCommandStack,
  onCastSpell,
  onEndTurn,
  onWinCombat,
  legalTargets,
  legalSpellTargets,
  forecast,
  onOpenDoll,
  playbackEvents,
  onPlaybackDone,
}: {
  run: RunState;
  onCommandStack: (stackId: string, order: CommandOrder) => void;
  onCastSpell: (spellId: string, targetId?: string) => void;
  onEndTurn: () => void;
  /** PLAYTEST: instantly win this combat. */
  onWinCombat?: () => void;
  legalTargets: (stackId: string) => string[];
  legalSpellTargets: (spellId: string) => string[];
  forecast: (attackerId: string, targetId: string) => DamageForecast | null;
  onOpenDoll?: () => void;
  // When set, the screen REPLAYS these events over the (retained) board and
  // calls onPlaybackDone when finished — used to show the battle-ending turn
  // blow-by-blow before routing to Outcome/Reward. Interaction is locked.
  playbackEvents?: CombatEvent[];
  onPlaybackDone?: () => void;
}) {
  const playing = !!playbackEvents;
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [armedSpell, setArmedSpell] = useState<CombatSpell | null>(null);
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [floats, setFloats] = useState<Record<string, Float[]>>({});
  // The displayed board: the live combat normally, or a locally-replayed
  // snapshot during end-of-battle playback.
  const [simCombat, setSimCombat] = useState<CombatState>(run.combat!);
  const combat = playing ? simCombat : run.combat!;

  // Play the engine's per-strike events as staggered damage popups: your
  // attack, its retaliation, and every enemy strike on the enemy turn — so the
  // hits are legible instead of the board silently jumping to a new state.
  const playedRef = useRef<CombatEvent[] | null>(null);
  useEffect(() => {
    if (playing) return; // playback effect drives popups during end-of-battle replay
    const events = run.lastEvents;
    if (!events || events.length === 0 || events === playedRef.current) return;
    playedRef.current = events;
    const STAGGER = 600;
    const timers: ReturnType<typeof setTimeout>[] = [];
    events.forEach((e, i) => {
      timers.push(
        setTimeout(() => {
          const id = `f${floatSeq++}`;
          const text = e.killed > 0 ? `−${e.damage} ☠${e.killed}` : `−${e.damage}`;
          setFloats((cur) => ({
            ...cur,
            [e.targetId]: [...(cur[e.targetId] ?? []), { id, text, kind: 'loss' }],
          }));
        }, i * STAGGER),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [run.lastEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // End-of-battle replay: step the retained board forward one strike at a time.
  useEffect(() => {
    if (!playbackEvents) return;
    let board = run.combat!;
    setSimCombat(board);
    const STEP = 650;
    const timers: ReturnType<typeof setTimeout>[] = [];
    playbackEvents.forEach((e, i) => {
      timers.push(
        setTimeout(() => {
          board = applyEventToBoard(board, e);
          setSimCombat(board);
          const id = `f${floatSeq++}`;
          const text = e.killed > 0 ? `−${e.damage} ☠${e.killed}` : `−${e.damage}`;
          setFloats((cur) => ({
            ...cur,
            [e.targetId]: [...(cur[e.targetId] ?? []), { id, text, kind: 'loss' }],
          }));
        }, i * STEP),
      );
    });
    timers.push(setTimeout(() => onPlaybackDone?.(), playbackEvents.length * STEP + 1000));
    return () => timers.forEach(clearTimeout);
  }, [playbackEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFloat = (sid: string, fid: string) =>
    setFloats((cur) => ({ ...cur, [sid]: (cur[sid] ?? []).filter((f) => f.id !== fid) }));

  // Whose stacks can act / what's a legal target right now. (None during the
  // end-of-battle replay — the board is locked while it animates.)
  const selectableIds = playing
    ? new Set<string>()
    : new Set(combat.yourArmy.stacks.filter((s) => s.count > 0 && !s.hasActed).map((s) => s.id));

  let targetableIds = new Set<string>();
  if (armedSpell) {
    targetableIds = new Set(legalSpellTargets(armedSpell.id));
  } else if (selectedStackId) {
    targetableIds = new Set(legalTargets(selectedStackId));
  }

  // Damage forecast on each legal target while aiming a stack's attack.
  const forecasts: Record<string, DamageForecast> = {};
  if (!armedSpell && selectedStackId) {
    for (const id of targetableIds) {
      const f = forecast(selectedStackId, id);
      if (f) forecasts[id] = f;
    }
  }

  const tapStack = (s: Stack) => {
    if (playing) return; // board is locked during end-of-battle replay
    // Casting a spell at a legal target.
    if (armedSpell) {
      if (targetableIds.has(s.id)) {
        onCastSpell(armedSpell.id, s.id);
        setArmedSpell(null);
        setSpellbookOpen(false);
      }
      return;
    }
    // Selecting one of your stacks to command.
    if (s.side === 'player') {
      if (selectableIds.has(s.id)) {
        setSelectedStackId((cur) => (cur === s.id ? null : s.id));
      }
      return;
    }
    // Attacking with the selected stack.
    if (s.side === 'enemy' && selectedStackId && targetableIds.has(s.id)) {
      onCommandStack(selectedStackId, { kind: 'attack', targetId: s.id });
      setSelectedStackId(null);
    }
  };

  const defendSelected = () => {
    if (!selectedStackId) return;
    onCommandStack(selectedStackId, { kind: 'defend' });
    setSelectedStackId(null);
  };

  const armSpell = (spell: CombatSpell) => {
    setSelectedStackId(null);
    // Self/all spells need no target — resolve immediately.
    if (spell.targeting === 'self' || spell.targeting === 'allEnemies' || spell.targeting === 'allAllies' || spell.targeting === 'none') {
      onCastSpell(spell.id);
      setSpellbookOpen(false);
      setArmedSpell(null);
      return;
    }
    setArmedSpell((cur) => (cur?.id === spell.id ? null : spell));
    setSpellbookOpen(false);
  };

  const selected = selectedStackId
    ? combat.yourArmy.stacks.find((s) => s.id === selectedStackId)
    : null;

  return (
    <div className="relative flex h-full flex-col bg-necropolis">
      {onWinCombat && !playing && (
        <button
          onClick={onWinCombat}
          title="Playtest: instantly win this combat"
          className="absolute right-2 top-2 z-30 rounded border border-amber-300 bg-amber-500/90 px-2 py-1 font-display text-[0.6rem] uppercase tracking-widest text-black shadow-lg hover:bg-amber-300"
        >
          ⚡ Win
        </button>
      )}
      <HudShell>
        <div className="flex items-center gap-3">
          <span className="font-display text-xs tracking-widest text-verd-300">ROUND {combat.round}</span>
          <ArmyPip army={combat.yourArmy.stacks} />
        </div>
        <span className="font-display text-[0.65rem] uppercase tracking-widest text-bone-500">
          {playing ? 'Resolving…' : combat.whoseTurn === 'player' ? 'Your command' : 'Enemy acts'}
        </span>
      </HudShell>

      <BattleField
        combat={combat}
        selectedId={selectedStackId}
        targetableIds={targetableIds}
        selectableIds={selectableIds}
        forecasts={forecasts}
        floats={floats}
        onClearFloat={(fid) => {
          // find which stack owns this float id
          for (const [sid, list] of Object.entries(floats)) {
            if (list.some((f) => f.id === fid)) return clearFloat(sid, fid);
          }
        }}
        onTapStack={tapStack}
      />

      {/* Combat log trench */}
      <div
        data-testid="combat-log"
        className="max-h-16 overflow-y-auto border-y border-verd-700 bg-grave-900/80 px-3 py-1 text-[0.62rem] leading-snug text-bone-400"
      >
        {combat.log.slice(-4).map((line, i) => (
          <div key={i} className={i === Math.min(3, combat.log.length - 1) ? 'text-bone-200' : ''}>
            {line}
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 bg-grave-800/90 px-3 py-2">
        <div className="min-w-0 flex-1 text-[0.65rem] text-bone-400">
          {playing ? (
            <span className="italic text-bone-300">Resolving the battle…</span>
          ) : armedSpell ? (
            <span className="text-necro-400">Casting {armedSpell.name} — tap a target.</span>
          ) : selected ? (
            <span className="text-bone-200">{selected.name} selected — tap an enemy or Defend.</span>
          ) : (
            <span className="italic">Tap one of your stacks to command it.</span>
          )}
        </div>
        <button
          type="button"
          data-testid="defend"
          disabled={!selectedStackId || playing}
          onClick={defendSelected}
          className="rounded border border-verd-500 bg-verd-700/30 px-3 py-2 font-display text-xs uppercase tracking-widest text-bone-100 active:scale-95 disabled:opacity-30"
        >
          Defend
        </button>
        <button
          type="button"
          data-testid="open-spellbook"
          disabled={playing}
          onClick={() => setSpellbookOpen(true)}
          className="rounded border border-necro-400/60 bg-grave-900 px-3 py-2 font-display text-xs uppercase tracking-widest text-necro-400 active:scale-95 disabled:opacity-30"
        >
          Spells
        </button>
        <button
          type="button"
          data-testid="end-turn"
          onClick={() => {
            setSelectedStackId(null);
            setArmedSpell(null);
            onEndTurn();
          }}
          disabled={combat.outcome !== 'ongoing' || playing}
          className="rounded-md border border-blood-500 bg-blood-500/20 px-4 py-2 font-display text-xs uppercase tracking-widest text-bone-100 active:scale-95 disabled:opacity-40"
        >
          End Turn
        </button>
      </div>

      <HeroDollStrip hero={run.hero} onOpen={onOpenDoll} />

      <Spellbook
        open={spellbookOpen}
        spells={run.hero.spellbook}
        mana={run.hero.mana}
        spellCastThisTurn={combat.spellCastThisTurn}
        armedSpellId={armedSpell?.id ?? null}
        onArm={armSpell}
        onClose={() => setSpellbookOpen(false)}
      />
    </div>
  );
}
