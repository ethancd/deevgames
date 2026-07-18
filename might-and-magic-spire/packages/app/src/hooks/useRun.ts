// The single source of UI truth: it holds the latest RunState and exposes the
// pinned engine ops as thin dispatchers. The UI never mutates state directly —
// every transition goes through the engine, which returns the next RunState.
//
// The run is PERSISTED to localStorage on every change and restored on load, so
// a page reload resumes exactly where you were (RunState is pure, serializable
// engine state). `reset` (and a finished run) clears it.
import { useCallback, useEffect, useState } from 'react';
import { engine } from '../engine';
import type {
  ArtifactSlot,
  CommandOrder,
  DamageForecast,
  RewardChoice,
  RunState,
} from '../engine';

const STORAGE_KEY = 'mms:run:v1';

function loadSavedRun(): RunState | null {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunState;
    // Minimal sanity check — ignore anything that isn't a plausible run.
    if (!parsed || typeof parsed.seed !== 'string' || !Array.isArray(parsed.map)) return null;
    // Don't replay last turn's damage popups on reload.
    return { ...parsed, lastEvents: undefined };
  } catch {
    return null;
  }
}

export function useRun() {
  const [run, setRun] = useState<RunState | null>(loadSavedRun);

  // Persist on every change; clear when the run ends or is reset.
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      if (run) localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage full / unavailable — non-fatal, run just won't persist */
    }
  }, [run]);

  const startRun = useCallback((seed: string, heroId?: string) => {
    setRun(engine.startRun(seed, heroId));
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

  // PLAYTEST: instantly win the current combat.
  const winCombatNow = useCallback(() => {
    setRun((r) => (r && engine.winCombatNow ? engine.winCombatNow(r) : r));
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

  const forecast = useCallback(
    (attackerId: string, targetId: string): DamageForecast | null =>
      run && engine.forecastAttack ? engine.forecastAttack(run, attackerId, targetId) : null,
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
    winCombatNow,
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
  };
}
