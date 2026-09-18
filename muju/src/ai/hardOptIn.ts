/**
 * How a browser game decides WHICH engine the Hard seat runs, and the
 * observable failure counters that go with it.
 *
 * ON BY DEFAULT, OPT-OUT AVAILABLE. Through E5 this module held a DEVELOPMENT
 * opt-in: without it a player never reached `HardEngine`. DESIGN §6.4's
 * release flag `hardEnabled` has since landed (`src/ai/hard/config.ts`, true
 * as of the E6 release decision of 2026-09-18 — evidence in
 * `docs/hard-ai/RELEASE-2026-09-18.md`), so difficulty "Hard" now runs the
 * real `HardEngine` for everyone. The opt-in survives as the way to reach the
 * engine while `hardEnabled` is false (a revert, a branch), and an explicit
 * opt-OUT is the way back to the legacy `AIEngineV2`:
 *
 *   route = optOut ? false : (hardEnabled || optIn)     `resolveHardAiRoute()`
 *
 * Both forms are read, the QUERY STRING FIRST: a `hardAi` param present on the
 * URL decides on its own, and storage is consulted only when it is absent.
 * The two spellings:
 *   - OPT OUT (wins over everything): `?hardAi=0`, or
 *     `localStorage['muju.hardAi'] = '0'` — Hard runs `AIEngineV2`.
 *   - OPT IN (only matters when `hardEnabled` is false): `?hardAi=1`, or
 *     `localStorage['muju.hardAi'] = '1'`.
 * Any other value is neither, and leaves `hardEnabled` to decide.
 *
 * TURN BUDGET. `?hardMs=<int>`, clamped to [1000, 120000], replaces
 * `TURN_BUDGET_MS.hard` for this game's Hard seat (`readHardTurnBudgetMs()`).
 * The release contract is the unchanged 8000 ms measured at `wall:8000`; this
 * is a page-URL override for demos and measurement, ignored on easy/medium.
 *
 * Every one of these is read ONCE per game start (`useAI.ts` caches them and
 * clears the cache in `cancel`, which every new game / restart / difficulty
 * change already runs through), so flipping a flag mid-turn cannot split one
 * turn across two engines or two budgets.
 *
 * DIAGNOSTICS. Every fallback is counted on `window.__mujuHardDiag` and logged
 * once with the fixed prefix `[hard-ai]`. The counters are the "an engine
 * failure is counted and diagnosable even if the player gets a graceful
 * fallback" rule of EPIC-PLAN §3, and they are what `e2e/hard-ai.spec.ts`
 * asserts on. They are process-wide and monotonic: nothing resets them but a
 * reload.
 */
import { hardEnabled } from './hard/config';

export const HARD_AI_STORAGE_KEY = 'muju.hardAi';
export const HARD_AI_QUERY_PARAM = 'hardAi';
/** Page-URL override for the Hard seat's whole-turn budget, in milliseconds. */
export const HARD_AI_MS_QUERY_PARAM = 'hardMs';
/** Every `[hard-ai]` console line starts with this, so a test can grep for it. */
export const HARD_AI_LOG_PREFIX = '[hard-ai]';

/** The one value that means "on", in both the query string and localStorage. */
const ON = '1';
/** The one value that means "off", in both places. It beats `hardEnabled`. */
const OFF = '0';
/** `?hardMs` is clamped into this range before it can fund anything. */
export const HARD_AI_MS_MIN = 1000;
export const HARD_AI_MS_MAX = 120000;

export interface HardDiagnostics {
  /**
   * Whether the Hard route resolved true for the current game — Hard is on by
   * default now (`hardEnabled`), so this is false only for easy/medium games
   * and for a player who explicitly opted out.
   */
  optIn: boolean;
  /** `engine:'hard'` whole-turn requests sent. */
  requests: number;
  /** Responses that actually reported `engineUsed: 'hard'`. */
  hardTurns: number;
  /** Hard plans that replayed through the canonical path with no fallback. */
  plansReplayed: number;
  /** Total falls back to the v2 path — the sum of the six kinds below. */
  fallbacks: number;
  packError: number;
  engineError: number;
  divergence: number;
  /** An action inside the plan the canonical rules refuse (invalid suffix). */
  invalidSuffix: number;
  /** Hard returned no actions at all; treated like an invalid suffix. */
  emptyPlan: number;
  /** The worker rejected, errored or hit the client watchdog. */
  workerError: number;
  /**
   * Per-action fallback decisions whose share of the turn's remaining
   * allowance had to be floored at `MIN_TURN_SEARCH_MS` because the turn was
   * already spent. Not a fallback — the turn still finishes legally — but it
   * says the turn overran its allowance, which is the thing E0.2 conserves.
   * (`lab/hard-ai/bots/hard.ts` counts the lab's equivalent under the same
   * name.)
   */
  budgetExhausted: number;
  lastFallback: HardFallbackKind | null;
}

export type HardFallbackKind =
  | 'packError' | 'engineError' | 'divergence'
  | 'invalidSuffix' | 'emptyPlan' | 'workerError';

/** `RootResult['fallback']` (the engine's own wire spelling) → a counter name. */
export function fallbackKindFor(reason: 'pack-error' | 'engine-error' | 'divergence'): HardFallbackKind {
  return reason === 'pack-error' ? 'packError' : reason === 'divergence' ? 'divergence' : 'engineError';
}

function emptyDiagnostics(): HardDiagnostics {
  return {
    optIn: false, requests: 0, hardTurns: 0, plansReplayed: 0, fallbacks: 0,
    packError: 0, engineError: 0, divergence: 0, invalidSuffix: 0, emptyPlan: 0,
    workerError: 0, budgetExhausted: 0, lastFallback: null,
  };
}

interface DiagWindow { __mujuHardDiag?: HardDiagnostics }

let diagnostics: HardDiagnostics | null = null;

/**
 * The process-wide counter object, installed on `window.__mujuHardDiag` the
 * first time it is asked for. Node/test callers without a `window` get the
 * same object back without one.
 */
export function hardDiag(): HardDiagnostics {
  if (diagnostics === null) {
    diagnostics = emptyDiagnostics();
    if (typeof window !== 'undefined') (window as unknown as DiagWindow).__mujuHardDiag = diagnostics;
  }
  return diagnostics;
}

/** Test-only: forget the counters (and the window handle's contents). */
export function resetHardDiag(): void {
  const current = hardDiag();
  Object.assign(current, emptyDiagnostics());
}

export function noteHardRequest(): void { hardDiag().requests++; }
export function noteHardTurn(engineUsed: 'v2' | 'hard' | undefined): void {
  if (engineUsed === 'hard') hardDiag().hardTurns++;
}
export function noteHardPlanReplayed(): void { hardDiag().plansReplayed++; }
export function noteHardBudgetExhausted(): void { hardDiag().budgetExhausted++; }

/**
 * Counts one fallback and logs it once. The caller drops the rest of the plan
 * and finishes the turn on the v2 path out of the SAME remaining allowance —
 * this function only records that it happened.
 */
export function recordHardFallback(kind: HardFallbackKind, detail?: string): void {
  const diag = hardDiag();
  diag[kind]++;
  diag.fallbacks++;
  diag.lastFallback = kind;
  // `warn`, not `error`: the player got a legal turn. A page error would fail
  // the very e2e that proves the fallback works.
  console.warn(`${HARD_AI_LOG_PREFIX} fallback ${kind}${detail === undefined ? '' : `: ${detail}`} — finishing this turn on the v2 path within the turn's remaining allowance`);
}

/** Reads `?hardAi` / `localStorage['muju.hardAi']`, query string first.
 * Every access is guarded: a worker/SSR context has no `window`, and a browser
 * with site data blocked THROWS on `localStorage`. */
function readHardAiFlag(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(HARD_AI_QUERY_PARAM);
    if (fromQuery !== null) return fromQuery;
  } catch { /* no usable location; fall through to storage */ }
  try {
    return window.localStorage.getItem(HARD_AI_STORAGE_KEY);
  } catch { /* storage blocked */ }
  return null;
}

/**
 * Reads the opt-in (`'1'`). It is the only thing that reaches `HardEngine`
 * while `hardEnabled` is false; once the release flag is true it is redundant
 * and `resolveHardAiRoute()` never even asks for it.
 */
export function readHardAiOptIn(): boolean {
  const on = readHardAiFlag() === ON;
  hardDiag().optIn = on;
  if (on) console.warn(`${HARD_AI_LOG_PREFIX} opt-in is ON: difficulty "hard" will run the real HardEngine in the worker`);
  return on;
}

/**
 * Reads the explicit opt-OUT (`'0'`). It wins over `hardEnabled`: a player who
 * asks for the legacy engine gets it, release flag or not.
 */
export function readHardAiOptOut(): boolean {
  return readHardAiFlag() === OFF;
}

/**
 * THE GATE `useAI.ts` APPLIES, once per game start: an explicit opt-out wins,
 * otherwise `hardEnabled || readHardAiOptIn()`. Records the answer as
 * `optIn` on the diagnostics and logs one `[hard-ai]` line either way, so a
 * report of "Hard felt weak" can be settled from the console alone.
 */
export function resolveHardAiRoute(): boolean {
  const optedOut = readHardAiOptOut();
  const on = optedOut ? false : (hardEnabled || readHardAiOptIn());
  const diag = hardDiag();
  diag.optIn = on;
  if (optedOut) {
    console.warn(`${HARD_AI_LOG_PREFIX} opt-out is set (${HARD_AI_QUERY_PARAM}=${OFF}): difficulty "hard" runs the legacy AIEngineV2 for this game`);
  } else if (on && hardEnabled) {
    console.warn(`${HARD_AI_LOG_PREFIX} hardEnabled: difficulty "hard" runs the real HardEngine in the worker (opt out with ?${HARD_AI_QUERY_PARAM}=${OFF})`);
  }
  return on;
}

/**
 * `?hardMs=<int>` — the whole-turn budget this game funds the Hard seat with,
 * clamped to [`HARD_AI_MS_MIN`, `HARD_AI_MS_MAX`]. `null` means "no override",
 * and the shipped `TURN_BUDGET_MS.hard` (8000, the release contract measured
 * at `wall:8000`) stands. Logged once per game, like every other read here.
 * Anything that is not an integer is ignored rather than guessed at.
 */
export function readHardTurnBudgetMs(): number | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(window.location.search).get(HARD_AI_MS_QUERY_PARAM);
  } catch { /* no usable location */ }
  if (raw === null || !/^[+-]?\d+$/.test(raw.trim())) return null;
  const requested = Number(raw);
  const ms = Math.min(HARD_AI_MS_MAX, Math.max(HARD_AI_MS_MIN, requested));
  console.warn(`${HARD_AI_LOG_PREFIX} ${HARD_AI_MS_QUERY_PARAM}=${requested} — this game funds the hard seat's turn with ${ms} ms (clamped to [${HARD_AI_MS_MIN}, ${HARD_AI_MS_MAX}]; the shipped budget is 8000)`);
  return ms;
}
