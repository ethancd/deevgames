// The single source of UI truth: it holds the latest RunState and exposes the
// pinned engine ops as thin dispatchers. The UI never mutates state directly —
// every transition goes through the engine, which returns the next RunState.
import { useCallback, useState } from 'react';
import { engine } from '../engine';
import type { RewardChoice, RunState } from '../engine';

export function useRun() {
  const [run, setRun] = useState<RunState | null>(null);

  const startRun = useCallback((seed: string) => {
    setRun(engine.startRun(seed));
  }, []);

  const chooseNode = useCallback((nodeId: string) => {
    setRun((r) => (r ? engine.chooseNode(r, nodeId) : r));
  }, []);

  const playCard = useCallback((cardId: string, targetId?: string) => {
    setRun((r) => (r ? engine.playCard(r, cardId, targetId) : r));
  }, []);

  const endTurn = useCallback(() => {
    setRun((r) => (r ? engine.endTurn(r) : r));
  }, []);

  const pickReward = useCallback((choice: RewardChoice) => {
    setRun((r) => (r ? engine.pickReward(r, choice) : r));
  }, []);

  const pendingRewards = useCallback(
    (): RewardChoice[] => (run && engine.pendingRewards ? engine.pendingRewards(run) : []),
    [run],
  );

  const reset = useCallback(() => setRun(null), []);

  return { run, startRun, chooseNode, playCard, endTurn, pickReward, pendingRewards, reset };
}
