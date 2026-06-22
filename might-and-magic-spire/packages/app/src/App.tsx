// App root — the screen state machine. It derives WHICH screen to show purely
// from RunState (the engine's truth) plus pendingRewards, so the UI is a pure
// function of engine state. Order of precedence:
//   no run            -> Title
//   run outcome set   -> Outcome (win/lose)
//   doll overlay open -> HeroDoll (full)
//   active combat     -> Combat
//   standing on node  -> the node's screen (reward / dwelling / altar / …)
//   otherwise         -> Map
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRun } from './hooks/useRun';
import type { RunState } from './engine';
import { TitleScreen } from './screens/TitleScreen';
import { MapScreen } from './screens/MapScreen';
import { CombatScreen } from './screens/CombatScreen';
import { RewardScreen } from './screens/RewardScreen';
import { OutcomeScreen } from './screens/OutcomeScreen';
import { CodexScreen } from './screens/CodexScreen';
import { DwellingScreen } from './screens/DwellingScreen';
import { AltarScreen } from './screens/AltarScreen';
import { ShrineScreen } from './screens/ShrineScreen';
import { MerchantScreen } from './screens/MerchantScreen';
import { HeroDollFull } from './components/HeroDoll';

export default function App() {
  const {
    run,
    startRun,
    chooseNode,
    commandStack,
    castSpell,
    endPlayerTurn,
    legalTargets,
    legalSpellTargets,
    forecast,
    pickReward,
    recruit,
    upgrade,
    learn,
    buy,
    equipArtifact,
    pendingRewards,
    reset,
  } = useRun();

  // Hash route: #codex opens the data explorer/editor (a design tool).
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The hero paper-doll overlay, reachable from the map/combat HUD.
  const [dollOpen, setDollOpen] = useState(false);

  // End-of-battle playback: when a turn ENDS the combat (the engine settles and
  // clears the board), hold the battlefield and replay the final strikes before
  // routing to Outcome/Reward — so a loss/win is never silent.
  const lastCombatRunRef = useRef<RunState | null>(null);
  useEffect(() => {
    if (run?.combat) lastCombatRunRef.current = run;
  }, [run]);
  const [endingPlayback, setEndingPlayback] = useState(false);
  const playedEndRef = useRef<unknown>(null);
  useEffect(() => {
    if (!run) {
      setEndingPlayback(false);
      return;
    }
    // "Combat just ended with strikes to show": the board was cleared by the
    // engine's settlement, lastEvents holds that final turn, and we retained the
    // pre-end board. (lastEvents is cleared on node entry, so this can't fire on
    // the map.) The played-ref guard prevents re-triggering for the same batch.
    const combatGone = run.combat == null;
    const hasEvents = (run.lastEvents?.length ?? 0) > 0;
    if (
      combatGone &&
      hasEvents &&
      lastCombatRunRef.current?.combat &&
      run.lastEvents !== playedEndRef.current
    ) {
      playedEndRef.current = run.lastEvents;
      setEndingPlayback(true);
    }
  }, [run]);
  const onPlaybackDone = useCallback(() => setEndingPlayback(false), []);

  const shell = (child: React.ReactNode) => (
    <div className="mx-auto h-[100dvh] max-w-md overflow-hidden">{child}</div>
  );

  if (hash.startsWith('#codex')) {
    return <CodexScreen onExit={() => { window.location.hash = ''; }} />;
  }

  if (!run) {
    return shell(<TitleScreen onStart={startRun} onOpenCodex={() => { window.location.hash = '#codex'; }} />);
  }

  // Replay the battle-ending turn over the retained board before anything else.
  if (endingPlayback && lastCombatRunRef.current?.combat && run.lastEvents) {
    return shell(
      <CombatScreen
        run={lastCombatRunRef.current}
        onCommandStack={commandStack}
        onCastSpell={castSpell}
        onEndTurn={endPlayerTurn}
        legalTargets={legalTargets}
        legalSpellTargets={legalSpellTargets}
        forecast={forecast}
        onOpenDoll={() => setDollOpen(true)}
        playbackEvents={run.lastEvents}
        onPlaybackDone={onPlaybackDone}
      />,
    );
  }

  if (run.outcome === 'won' || run.outcome === 'lost') {
    return shell(<OutcomeScreen outcome={run.outcome} events={run.lastEvents} onRestart={reset} />);
  }

  // Hero doll overlay takes precedence so it can be opened over map or combat.
  if (dollOpen) {
    return shell(
      <HeroDollFull run={run} onEquip={equipArtifact} onClose={() => setDollOpen(false)} />,
    );
  }

  const node = run.currentNodeId != null ? run.map.find((n) => n.id === run.currentNodeId) : null;
  const inCombat = run.combat != null && run.combat.outcome === 'ongoing';

  if (inCombat) {
    return shell(
      <CombatScreen
        run={run}
        onCommandStack={commandStack}
        onCastSpell={castSpell}
        onEndTurn={endPlayerTurn}
        legalTargets={legalTargets}
        legalSpellTargets={legalSpellTargets}
        forecast={forecast}
        onOpenDoll={() => setDollOpen(true)}
      />,
    );
  }

  // Standing on a node (combat just won, or a non-combat node).
  if (node) {
    const choices = pendingRewards();
    const skip = () => pickReward({ kind: 'skip' });

    // Economy nodes drive their OWN screens off pendingRewards (the engine rolls
    // recruit/upgrade/learn/buy offers there and validates selections against
    // them). The screen shows while offers are pending; once the player picks
    // one or skips, pendingRewards clears and we fall through to the map. The
    // bespoke economy screens take precedence over the generic reward screen.
    if (choices.length > 0) {
      if (node.type === 'dwelling') {
        return shell(<DwellingScreen run={run} onRecruit={recruit} onSkip={skip} />);
      }
      if (node.type === 'altar') {
        return shell(<AltarScreen run={run} onUpgrade={upgrade} onSkip={skip} />);
      }
      if (node.type === 'shrine') {
        return shell(<ShrineScreen run={run} onLearn={learn} onSkip={skip} />);
      }
      if (node.type === 'merchant') {
        return shell(<MerchantScreen run={run} onBuy={buy} onSkip={skip} />);
      }

      // Post-combat / rest spoils (gold / raise / skip) surface generically.
      return shell(<RewardScreen run={run} choices={choices} onPick={pickReward} />);
    }
  }

  return shell(<MapScreen run={run} onChoose={chooseNode} onOpenDoll={() => setDollOpen(true)} />);
}
