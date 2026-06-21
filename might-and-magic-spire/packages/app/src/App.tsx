// App root — the screen state machine. It derives WHICH screen to show purely
// from RunState (the engine's truth) plus pendingRewards, so the UI is a pure
// function of engine state. Order of precedence:
//   no run            -> Title
//   run outcome set   -> Outcome (win/lose)
//   active combat     -> Combat (or Reward when combat just won)
//   standing on node  -> Reward (rest/shop/event resolution)
//   otherwise         -> Map
import { useRun } from './hooks/useRun';
import { lookupCard, lookupRelic } from './engine';
import { TitleScreen } from './screens/TitleScreen';
import { MapScreen } from './screens/MapScreen';
import { CombatScreen } from './screens/CombatScreen';
import { RewardScreen } from './screens/RewardScreen';
import { OutcomeScreen } from './screens/OutcomeScreen';

export default function App() {
  const { run, startRun, chooseNode, playCard, endTurn, pickReward, pendingRewards, reset } =
    useRun();

  const shell = (child: React.ReactNode) => (
    <div className="mx-auto h-[100dvh] max-w-md overflow-hidden">{child}</div>
  );

  if (!run) {
    return shell(<TitleScreen onStart={startRun} />);
  }

  if (run.outcome === 'won' || run.outcome === 'lost') {
    return shell(<OutcomeScreen outcome={run.outcome} onRestart={reset} />);
  }

  const onNode = run.currentNodeId != null;
  const inCombat = run.combat != null && run.combat.outcome === 'ongoing';
  const combatWon = run.combat != null && run.combat.outcome === 'won';

  if (inCombat) {
    return shell(<CombatScreen run={run} onPlayCard={playCard} onEndTurn={endTurn} />);
  }

  // On a node (combat just won, or a non-combat node) -> show its rewards.
  if (onNode) {
    const choices = pendingRewards();
    if (choices.length > 0 || combatWon) {
      return shell(
        <RewardScreen
          run={run}
          choices={choices}
          cardLookup={lookupCard}
          relicLookup={lookupRelic}
          onPick={pickReward}
        />,
      );
    }
  }

  return shell(<MapScreen run={run} onChoose={chooseNode} />);
}
