/**
 * "REPORT THIS POSITION" — the game's one feedback affordance for a bad AI move.
 *
 * The only thing that turns "the AI played badly" into something actionable is a
 * cheap way to say "here, this move was wrong". This builds the blob that says
 * it: enough to reproduce the position exactly and to tell which engine, which
 * allowance and which rules produced the move. It is the channel that produced
 * the three reports the 2026-09-20 engine repair was aimed at.
 *
 * AVAILABLE IN EVERY LOCAL GAME since the Phasing-only cutover (2026-09-21). It
 * was preview-only while the Phasing AI was an opt-in behind `?phasingAi=1`;
 * that preview is retired, so `GameScreen` renders the button in every local
 * game — vs AI, Watch AI and Pass & Play — and only online and analysis boards
 * are excluded. Pass & Play has no engine in a seat, and the report then simply
 * carries no AI turn, which is still a replayable position.
 *
 * THE WIRE KIND IS UNCHANGED: reports still say `muju-phasing-preview-report`.
 * It is a format identifier for the payload, not a statement about where the
 * button lives, and every reader is outside this repo (nothing here branches on
 * it) — a report is pasted into a chat, so the readers that matter are the ones
 * already holding older reports under that kind. Renaming it would split one
 * format into two for no gain, so the kind and `POSITION_REPORT_VERSION` stay
 * as they are.
 *
 * DEPENDENCY-FREE AND TINY, on purpose. It is a pure function over the live
 * state plus a clipboard write at the call site, so it cannot affect a game it
 * is reporting on, and it ships nothing the rest of the app does not already
 * carry.
 *
 * NOTHING IS SENT ANYWHERE. It goes to the clipboard; the owner pastes it
 * wherever he likes.
 */
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty } from '../ai/types';
import type { AIPace } from '../ai/turnTime';
import { PHASING_RULES_REVISION } from '../ai/hard/config';
import type { HardDiagnostics } from '../ai/hardOptIn';

export const POSITION_REPORT_VERSION = 1;

export interface PositionReportInput {
  state: GameState;
  difficulty: AIDifficulty;
  pace: AIPace;
  /** Which engine the reported seat was routed to, as `useAI` resolved it. */
  engine: 'hard' | 'v2';
  /** The AI's most recent completed turn, in dispatch order. */
  lastTurnActions: readonly AIAction[];
  /** The owner's one-line "what looked wrong", or null if he skipped it. */
  note: string | null;
}

export interface PositionReport {
  kind: 'muju-phasing-preview-report';
  version: number;
  capturedAt: string;
  /** `muju-phasing-2` for a Phasing game; the Standard set has no revision id. */
  rulesRevision: string | null;
  ruleset: GameState['ruleset'];
  difficulty: AIDifficulty;
  pace: AIPace;
  engine: 'hard' | 'v2';
  turnNumber: number;
  currentPlayer: GameState['turn']['currentPlayer'];
  phase: GameState['turn']['phase'];
  upkeepPending: boolean;
  note: string | null;
  lastTurnActions: AIAction[];
  /** `window.__mujuHardDiag` if the Hard route ever installed it. */
  hardDiag: HardDiagnostics | null;
  state: GameState;
}

interface DiagWindow { __mujuHardDiag?: HardDiagnostics }

/** The counters, if this page ever routed a seat through the Hard engine. */
export function readHardDiagSnapshot(): HardDiagnostics | null {
  if (typeof window === 'undefined') return null;
  const diag = (window as unknown as DiagWindow).__mujuHardDiag;
  return diag ? { ...diag } : null;
}

export function buildPositionReport(input: PositionReportInput, now: Date = new Date()): PositionReport {
  const { state } = input;
  return {
    kind: 'muju-phasing-preview-report',
    version: POSITION_REPORT_VERSION,
    capturedAt: now.toISOString(),
    rulesRevision: state.ruleset === 'phasing' ? PHASING_RULES_REVISION : null,
    ruleset: state.ruleset,
    difficulty: input.difficulty,
    pace: input.pace,
    engine: input.engine,
    turnNumber: state.turn.turnNumber,
    currentPlayer: state.turn.currentPlayer,
    phase: state.turn.phase,
    upkeepPending: !!state.upkeepPending,
    note: input.note,
    lastTurnActions: [...input.lastTurnActions],
    hardDiag: readHardDiagSnapshot(),
    // LAST, and whole. A report is only useful if the position replays, and
    // `GameState` is already the serialisable shape the save file stores.
    state,
  };
}

/** `JSON.stringify` of the report, ready for the clipboard. */
export function formatPositionReport(input: PositionReportInput, now?: Date): string {
  return JSON.stringify(buildPositionReport(input, now), null, 2);
}

/**
 * Writes `text` to the clipboard, falling back to a hidden `<textarea>` +
 * `execCommand('copy')` where the async API is missing or refused (an insecure
 * origin, a browser that wants a user gesture it does not think it got).
 * Resolves `true` when something actually took the text.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch { return false; }
}
