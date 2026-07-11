/**
 * EMBER — pinned UI contracts (WF2). Authored by the supervisor.
 *
 * Builders implement AGAINST these types and MUST NOT edit this file.
 * The integrate agent may make minimal additive changes only, documented
 * in its report. src/core/types.ts remains pinned as in WF1.
 *
 * Module ownership for WF2 (an agent writes ONLY inside its dirs):
 *   src/render/       GameCanvas + procedural sprites + fx        (agent R)
 *   src/ui/panels/    PilotPanel, GroundTruthPanel, EventTicker,
 *                     meters + sparklines                          (agent P)
 *   src/ui/           session.ts (SessionApi impl), presets.ts,
 *                     controls, App layout, playwright config      (agent S)
 *   e2e/              Playwright specs                             (integrate)
 *
 * Cross-cutting rules:
 *   - No new npm dependencies. Sparklines/meters are hand-rolled SVG/canvas.
 *   - Component tests use the `// @vitest-environment jsdom` pragma per file;
 *     the vitest config default stays 'node' (WF1 suite must remain green).
 *   - The deterministic core stays pure: real-time pacing (rAF/intervals)
 *     lives ONLY in the session driver, never inside src/{sim,body,skills,
 *     engine,scenarios,pilot}.
 *   - ONE allowed additive engine change (agent S, with a test): expose the
 *     most recent pilot consultation on Sim as `lastPacket: ContextPacket |
 *     null` (set whenever the engine builds a packet). Nothing else.
 *   - Visual target: ember/VISUAL_TARGET.md ("What must be true" checklist +
 *     adopted details) and ember/reference/*.png. Match layout/mood/palette;
 *     strict 16px tiles with integer scaling in the canvas.
 */

import type {
  BodyState,
  ContextPacket,
  Intent,
  Mode,
  SimEvent,
  WolfEntity,
  WorldState,
} from '../core/types';

// ---------------------------------------------------------------- session

export interface BodyHistoryPoint {
  tick: number;
  fuel: number;
  heat: number;
  damage: number;
  fatigue: number;
  activation: number;
  stability: number;
  mode: Mode;
}

/** Saved/loaded replay. Must round-trip through JSON.stringify/parse. */
export interface ReplayFile {
  version: 1;
  seed: number;
  presetId?: PresetId;
  bodyOverrides?: Partial<BodyState>;
  intents: Intent[];
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'ended';

export type Speed = 1 | 4;

export interface SessionState {
  tick: number;
  status: SessionStatus;
  speed: Speed;
  /** Live references for rendering — READ ONLY. Mutating these from UI code
   *  is a contract violation (the anticheat suite guards the pilot path;
   *  the UI is trusted but audited by review). */
  world: WorldState;
  body: BodyState;
  lastPacket: ContextPacket | null;
  lastIntent: Intent | null;
  recentEvents: SimEvent[]; // newest last, capped ~100
  history: BodyHistoryPoint[]; // sampled every 2 ticks, capped ~600 points
  seed: number;
  presetId: PresetId;
  narrationEnabled: boolean;
  /** True while consuming a loaded ReplayFile's intents. */
  replaying: boolean;
}

/** useSyncExternalStore-compatible store + imperative controls.
 *  Required export from src/ui/session.ts:
 *    createSession(opts?: { seed?: number; presetId?: PresetId }): SessionApi
 *  Pacing: 'running' advances TICKS_PER_SECOND_BASE * speed ticks per second
 *  (base 8/s), driven by setInterval/rAF in the driver only. step() is async;
 *  the driver must serialize steps (never overlap awaited steps). */
export interface SessionApi {
  getState(): SessionState;
  subscribe(onChange: () => void): () => void;
  play(): void;
  pause(): void;
  stepOnce(): Promise<void>;
  setSpeed(s: Speed): void;
  setNarration(enabled: boolean): void;
  /** Rebuild the sim from scratch with a seed/preset. */
  restart(opts?: { seed?: number; presetId?: PresetId }): void;
  exportReplay(): ReplayFile;
  loadReplay(file: ReplayFile): void;
}

export const TICKS_PER_SECOND_BASE = 8;

// ---------------------------------------------------------------- presets

/** Named startable situations (mirror the demo scenarios' staging without
 *  importing scenario internals). Required export from src/ui/presets.ts:
 *    PRESETS: Record<PresetId, Preset>
 *  'night-defend' must reliably reach DEFEND with the wolf stalking within
 *  ~40 ticks of play; 'day-explore' must show healthy EXPLORE by day. */
export type PresetId = 'free-run' | 'day-explore' | 'night-defend';

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  seed: number;
  bodyOverrides?: Partial<BodyState>;
  worldPatch?: (world: WorldState) => void;
  /** Ticks to auto-run on load so the situation is established. */
  warmupTicks: number;
}

// ----------------------------------------------------------------- panels

export interface PilotPanelProps {
  packet: ContextPacket | null;
  intent: Intent | null;
  narrationEnabled: boolean;
}

export interface GroundTruthPanelProps {
  body: BodyState;
  wolf: WolfEntity;
  history: BodyHistoryPoint[];
}

export interface EventTickerProps {
  events: SimEvent[]; // newest last; component renders newest at top
}

/** Required exports:
 *    src/ui/panels/PilotPanel.tsx      -> PilotPanel(props: PilotPanelProps)
 *    src/ui/panels/GroundTruthPanel.tsx-> GroundTruthPanel(props: ...)
 *    src/ui/panels/EventTicker.tsx     -> EventTicker(props: ...)
 *  Styling per VISUAL_TARGET.md adopted details: per-row confidence column
 *  in pilot view; icon + meter bar + value + sparkline per ground-truth row;
 *  tinted full-width intent banner (amber DEFEND / teal EXPLORE); outlined
 *  mode-chip pill on the same row as `wolf: <FSM>`; topic-colored event log
 *  values (mode red, resources orange, paths green); monospace event lines. */

// ----------------------------------------------------------------- canvas

export interface GameCanvasProps {
  session: SessionApi; // canvas subscribes itself and draws on its own rAF
}

/** Required export from src/render/GameCanvas.tsx:
 *    GameCanvas(props: GameCanvasProps)
 *  - 16px logical tiles, drawn to an offscreen buffer at native resolution,
 *    blitted with integer scaling, imageSmoothingEnabled = false.
 *  - Procedural sprite sheets (no image assets): grass/forest/rock/water/den
 *    tiles with per-tile deterministic variation (hash tile coords, NOT
 *    Math.random), deadwood, sunpatch shimmer, wolf (distinct silhouette per
 *    FSM state), ember (teardrop flame, brightness scales with fuel).
 *  - Glow: radial gradient sized by glowRadius(body.fuel); night darkness
 *    overlay outside it; day/night tint from isDay + smooth dusk transition;
 *    rain streak overlay during rain.
 *  - Speech bubble above the ember showing lastIntent.thought when narration
 *    is enabled; dotted amber path line for the active move/flee route if
 *    the active skill exposes one in lastIntent.params.
 *  - Camera: fit the full 48x32 grid when it fits; otherwise follow ember. */
