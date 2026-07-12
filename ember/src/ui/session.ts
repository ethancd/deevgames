/**
 * EMBER — session driver (src/ui/session.ts). Implements the pinned
 * `SessionApi` / `createSession` from src/ui/contracts.ts.
 *
 * Wraps a single `Sim` (createSim + ScriptedPilot — the LLM pilot is WF3
 * scope) with real-time pacing, a bounded event/history window, and
 * replay import/export. This is the one place in src/ui/ allowed to touch
 * wall-clock time (setInterval) — see contracts.ts's cross-cutting rules —
 * nothing here ever reaches back into src/{sim,body,skills,engine,pilot}
 * state outside the documented Sim/SimConfig surface.
 *
 * Design notes:
 *   - `getState()` returns a memoized snapshot object, only replaced by a
 *     new object when something actually changed (via `publish()`). This is
 *     required for `useSyncExternalStore` consumers (contracts.ts) — a
 *     getSnapshot that returns a fresh object every call causes React to
 *     re-render (and re-subscribe-check) forever.
 *   - `world`/`body` inside that snapshot are the Sim's live, in-place-
 *     mutated objects (per contracts.ts: "Live references for rendering —
 *     READ ONLY"). Their reference identity does NOT change tick-to-tick;
 *     only the wrapping SessionState object's identity does, on publish().
 *   - Steps are strictly serialized through a promise chain (`stepChain`)
 *     so the pacing timer, stepOnce(), and warmup never overlap an
 *     in-flight `sim.step()` — createSim() itself already throws on
 *     reentrant step() calls, so overlap would surface as a crash rather
 *     than silent corruption if this weren't respected.
 *   - `generation` guards async work (warmup, in-flight timer ticks)
 *     started by a since-superseded restart()/loadReplay() call from
 *     mutating state after a newer sim has taken over.
 */

import type { BodyState, Intent, Sim, SimEvent } from '../core/types';
import { createSim } from '../engine';
import { createScriptedPilot } from '../pilot/scripted';
import type {
  BodyHistoryPoint,
  Preset,
  PresetId,
  ReplayFile,
  SessionApi,
  SessionState,
  SessionStatus,
  Speed,
} from './contracts';
import { TICKS_PER_SECOND_BASE } from './contracts';
import { PRESETS } from './presets';

const RECENT_EVENTS_CAP = 100;
const HISTORY_CAP = 600;
const HISTORY_SAMPLE_EVERY = 2; // ticks
const TICK_CAP = 20000;
/** How many consecutive ticks of fuel<=0 counts as a "sustained" collapse
 *  (as opposed to a single reflex-collapse tick that resolves itself once
 *  the pilot reaches fuel again). Generous enough to not end a run that's
 *  merely mid-collapse-reflex but still actively recovering. */
const SUSTAINED_COLLAPSE_TICKS = 100;

function bodyHistoryPoint(tick: number, body: BodyState): BodyHistoryPoint {
  return {
    tick,
    fuel: body.fuel,
    heat: body.heat,
    damage: body.damage,
    fatigue: body.fatigue,
    activation: body.activation,
    stability: body.stability,
    mode: body.mode,
  };
}

export function createSession(opts?: { seed?: number; presetId?: PresetId }): SessionApi {
  let presetId: PresetId = opts?.presetId ?? 'free-run';
  let seed: number = opts?.seed ?? PRESETS[presetId].seed;
  let speed: Speed = 1;
  let status: SessionStatus = 'idle';
  let narrationEnabled = true;
  let replaying = false;

  let sim: Sim;
  let recentEvents: SimEvent[] = [];
  let history: BodyHistoryPoint[] = [];
  let historyStepCount = 0;
  let collapseStreak = 0;

  let generation = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stepChain: Promise<void> = Promise.resolve();

  const listeners = new Set<() => void>();
  // Always defined before any external call can observe it — the very
  // first buildSim() below (invoked synchronously during createSession)
  // calls publish() before this function returns.
  let snapshot!: SessionState;

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function publish(): void {
    snapshot = {
      tick: sim.world.tick,
      status,
      speed,
      world: sim.world,
      body: sim.body,
      lastPacket: sim.lastPacket,
      lastIntent: sim.intents.length > 0 ? sim.intents[sim.intents.length - 1] : null,
      recentEvents,
      history,
      seed,
      presetId,
      narrationEnabled,
      replaying,
    };
    for (const listener of listeners) listener();
  }

  function recordBookkeeping(): void {
    const all = sim.log.all();
    recentEvents = (all.length > RECENT_EVENTS_CAP ? all.slice(-RECENT_EVENTS_CAP) : all.slice()) as SimEvent[];

    historyStepCount += 1;
    if (historyStepCount % HISTORY_SAMPLE_EVERY === 0) {
      const point = bodyHistoryPoint(sim.world.tick, sim.body);
      history = history.length >= HISTORY_CAP ? [...history.slice(1), point] : [...history, point];
    }

    collapseStreak = sim.body.fuel <= 0 ? collapseStreak + 1 : 0;
  }

  function isEnded(): boolean {
    return collapseStreak >= SUSTAINED_COLLAPSE_TICKS || sim.world.tick >= TICK_CAP;
  }

  async function doStep(): Promise<void> {
    if (status === 'ended') return;
    await sim.step();
    recordBookkeeping();
    if (isEnded()) {
      status = 'ended';
      stopTimer();
    }
  }

  /** Chains onto the shared step queue so no two sim.step() calls ever
   *  overlap, regardless of whether they originate from the pacing timer,
   *  stepOnce(), or warmup. */
  function enqueueStep(): Promise<void> {
    const result = stepChain.then(() => doStep());
    // Never let a rejected step wedge the chain for subsequent callers.
    stepChain = result.catch(() => {});
    return result;
  }

  async function stepOnce(): Promise<void> {
    await enqueueStep();
    publish();
  }

  function startTimer(): void {
    stopTimer();
    const intervalMs = 1000 / (TICKS_PER_SECOND_BASE * speed);
    const myGen = generation;
    timer = setInterval(() => {
      void enqueueStep().then(() => {
        if (myGen !== generation) return; // superseded by restart/loadReplay
        publish();
      });
    }, intervalMs);
  }

  function play(): void {
    if (status === 'ended') return;
    status = 'running';
    publish();
    startTimer();
  }

  function pause(): void {
    if (status !== 'running') return;
    status = 'paused';
    stopTimer();
    publish();
  }

  function setSpeed(s: Speed): void {
    speed = s;
    if (status === 'running') startTimer();
    publish();
  }

  function setNarration(enabled: boolean): void {
    narrationEnabled = enabled;
    publish();
  }

  /** Builds a brand-new Sim from scratch and resets all per-session
   *  bookkeeping. If `preset.warmupTicks > 0`, auto-runs that many ticks
   *  (via the same serialized step queue) before flipping status from
   *  'idle' to 'paused' — this is the one place session.ts fast-forwards
   *  ticks without the pacing timer driving them. */
  function buildSim(nextSeed: number, nextPresetId: PresetId, preset: Preset, recordedIntents?: Intent[]): void {
    stopTimer();
    generation += 1;
    const myGen = generation;

    seed = nextSeed;
    presetId = nextPresetId;
    replaying = recordedIntents !== undefined;

    sim = createSim({
      seed,
      pilot: createScriptedPilot(),
      bodyOverrides: preset.bodyOverrides,
      worldPatch: preset.worldPatch,
      recordedIntents,
    });
    recentEvents = [];
    history = [];
    historyStepCount = 0;
    collapseStreak = 0;
    status = preset.warmupTicks > 0 && !replaying ? 'idle' : 'paused';
    publish();

    if (preset.warmupTicks > 0 && !replaying) {
      void (async () => {
        for (let i = 0; i < preset.warmupTicks; i++) {
          if (myGen !== generation) return;
          await enqueueStep();
          if (myGen !== generation) return;
        }
        status = isEnded() ? 'ended' : 'paused';
        publish();
      })();
    }
  }

  function restart(restartOpts?: { seed?: number; presetId?: PresetId }): void {
    const nextPresetId = restartOpts?.presetId ?? presetId;
    const preset = PRESETS[nextPresetId];
    const nextSeed = restartOpts?.seed ?? (restartOpts?.presetId ? preset.seed : seed);
    buildSim(nextSeed, nextPresetId, preset);
  }

  function exportReplay(): ReplayFile {
    return {
      version: 1,
      seed,
      presetId,
      bodyOverrides: PRESETS[presetId].bodyOverrides,
      intents: sim.intents.slice(),
    };
  }

  function loadReplay(file: ReplayFile): void {
    const nextPresetId = file.presetId ?? 'free-run';
    const preset = PRESETS[nextPresetId];
    const effectivePreset: Preset = {
      ...preset,
      bodyOverrides: file.bodyOverrides ?? preset.bodyOverrides,
      warmupTicks: 0, // a replay's own recordedIntents already carry the run
    };
    buildSim(file.seed, nextPresetId, effectivePreset, file.intents);
  }

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }

  function getState(): SessionState {
    return snapshot;
  }

  // ------------------------------------------------------------- init
  buildSim(seed, presetId, PRESETS[presetId]);

  return {
    getState,
    subscribe,
    play,
    pause,
    stepOnce,
    setSpeed,
    setNarration,
    restart,
    exportReplay,
    loadReplay,
  };
}
