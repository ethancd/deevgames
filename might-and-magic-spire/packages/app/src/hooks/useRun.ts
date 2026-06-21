// The single source of UI truth: it holds the latest RunState and exposes the
// pinned engine ops as thin dispatchers. The UI never mutates state directly —
// every transition goes through the engine, which returns the next RunState.
import { useCallback, useState } from 'react';
import { engine } from '../engine';
import type { ArtifactSlot, CommandOrder, RewardChoice, RunState } from '../engine';

export function useRun() {
  const [run, setRun] = useState<RunState | null>(null);

  const startRun = useCallback((seed: string) => {
    setRun(engine.startRun(seed));
  }, []);

  const legalNextNodes = useCallback(
    (): string[] => (run ? engine.legalNextNodes(run) : []),
    [run],
  );

  const chooseNode = useCallback((nodeId: string) => {
    setRun((r) => (r ? engine.chooseNode(r, nodeId) : r));
  }, []);

  // --- combat ---------------------------------------------------------------
  const commandStack = useCallback((stackId: string, order: CommandOrder) => {
    setRun((r) => (r ? engine.commandStack(r, stackId, order) : r));
  }, []);

  const castSpell = useCallback((spellId: string, targetId?: string) => {
    setRun((r) => (r ? engine.castSpell(r, spellId, targetId) : r));
  }, []);

  const endPlayerTurn = useCallback(() => {
    setRun((r) => (r ? engine.endPlayerTurn(r) : r));
  }, []);

  const legalTargets = useCallback(
    (stackId: string): string[] => (run ? engine.legalTargets(run, stackId) : []),
    [run],
  );

  const legalSpellTargets = useCallback(
    (spellId: string): string[] =>
      run && engine.legalSpellTargets ? engine.legalSpellTargets(run, spellId) : [],
    [run],
  );

  // --- node interactions / economy -----------------------------------------
  const pickReward = useCallback((choice: RewardChoice) => {
    setRun((r) => (r ? engine.pickReward(r, choice) : r));
  }, []);

  const recruit = useCallback((creatureId: string, count: number) => {
    setRun((r) => (r ? engine.recruit(r, creatureId, count) : r));
  }, []);

  const upgrade = useCallback((stackId: string) => {
    setRun((r) => (r ? engine.upgrade(r, stackId) : r));
  }, []);

  const learn = useCallback((spellId: string) => {
    setRun((r) => (r ? engine.learn(r, spellId) : r));
  }, []);

  const buy = useCallback((artifactId: string) => {
    setRun((r) => (r ? engine.buy(r, artifactId) : r));
  }, []);

  const equipArtifact = useCallback((artifactId: string, slot: ArtifactSlot) => {
    setRun((r) => (r ? engine.equipArtifact(r, artifactId, slot) : r));
  }, []);

  const pendingRewards = useCallback(
    (): RewardChoice[] =>
      run && engine.pendingRewards ? engine.pendingRewards(run) ?? [] : [],
    [run],
  );

  const reset = useCallback(() => setRun(null), []);

  return {
    run,
    startRun,
    legalNextNodes,
    chooseNode,
    commandStack,
    castSpell,
    endPlayerTurn,
    legalTargets,
    legalSpellTargets,
    pickReward,
    recruit,
    upgrade,
    learn,
    buy,
    equipArtifact,
    pendingRewards,
    reset,
  };
}
