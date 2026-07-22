/**
 * EMBER — app shell (src/App.tsx).
 *
 * Layout per VISUAL_TARGET.md / reference/*.png: game canvas left ~2/3,
 * right column a vertical stack of PILOT VIEW / GROUND TRUTH (dev, ON by
 * default, toggle in the control bar) / event ticker, with the pixel-style
 * transport + preset/replay control bar along the bottom.
 *
 * Wires the real session driver (src/ui/session.ts) to the panels
 * (src/ui/panels/, built in parallel by another WF2 agent against the same
 * pinned contracts) and the canvas (src/render/GameCanvas.tsx, likewise).
 * Both existed and matched their pinned prop contracts by the time this
 * agent got here, so no lazy-import/fallback placeholder was needed (the
 * task brief's fallback instruction only applies if a sibling module is
 * still missing at integration time).
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { GameCanvas } from './render/GameCanvas';
import { Controls } from './ui/Controls';
import { EventTicker } from './ui/panels/EventTicker';
import { GroundTruthPanel } from './ui/panels/GroundTruthPanel';
import { PilotPanel } from './ui/panels/PilotPanel';
import { createSession } from './ui/session';

function App() {
  // Stable across re-renders (and StrictMode's double-invoked initializer —
  // any discarded extra Sim is inert: it's paused, no timer running, per
  // session.ts's buildSim()).
  const [session] = useState(() => createSession({ presetId: 'night-defend' }));
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [devMode, setDevMode] = useState(true);

  useEffect(() => {
    return () => session.pause();
  }, [session]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-200">
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-[2]">
          <GameCanvas session={session} />
        </div>
        <div className="flex w-full min-w-[320px] max-w-[420px] flex-1 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-slate-950 p-3">
          <PilotPanel packet={state.lastPacket} intent={state.lastIntent} narrationEnabled={state.narrationEnabled} />
          {devMode && (
            <GroundTruthPanel body={state.body} wolf={state.world.wolf} history={state.history} />
          )}
          <EventTicker events={state.recentEvents} />
        </div>
      </div>
      <Controls session={session} state={state} devMode={devMode} onToggleDev={setDevMode} />
    </div>
  );
}

export default App;
