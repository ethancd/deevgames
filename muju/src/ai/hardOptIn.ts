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
 * TURN BUDGET. `?hardMs=<int>`, clamped to [1000, 120000], replaces the Hard
 * seat's whole-turn allowance for this game (`readHardTurnBudgetMs()`). The
 * allowance it overrides is now the PLAYER's: `src/ai/turnTime.ts` gives Hard
 * three paces — 10 s `quick`, 30 s `normal`, 60 s `deep` — where the release
 * contract was a single 8000 ms measured at `wall:8000`. The clamp's ceiling
 * is twice the deepest pace, so every pace passes through it untouched, and
 * this stays what it always was: a page-URL override for demos and
 * measurement, ignored on easy/medium.
 *
 * DEVICE PROFILE. `?hardProfile=phone` / `?hardProfile=desktop` (or
 * `localStorage['muju.hardProfile']`) forces the search TABLES the Hard seat's
 * engine is built from; without it `resolveHardDeviceProfile()` picks one from
 * the device itself, so a phone stops running the desktop shape. The tables are
 * `src/ai/hard/config.ts`'s, and its `deviceProfilePatch` is what goes on the
 * wire as the request's `hard` patch.
 *
 * WHAT THE ENGINE DOES WITH IT. The allowance reaches `HardEngine.searchTurn`
 * as `targetMs` (and, since A11, as `deadlineMs`), and an explicit `targetMs`
 * is used verbatim — the device profile's `time.maxMs` is the default the
 * engine would have chosen for itself, not a ceiling on what it was handed
 * (`src/ai/hard/engine.ts`, `tests/ai/hard/turn-pace.test.ts`). The work ladder
 * reaches 51,200,000 units so the longer paces buy a proportionally longer
 * search rather than the same 5 s one (`search/time.ts WORK_LADDER`).
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
import { hardEnabled, type DeviceProfileName } from './hard/config';

export const HARD_AI_STORAGE_KEY = 'muju.hardAi';
export const HARD_AI_QUERY_PARAM = 'hardAi';
/** Page-URL override for the Hard seat's whole-turn budget, in milliseconds. */
export const HARD_AI_MS_QUERY_PARAM = 'hardMs';
/** Page-URL override for the DEVICE PROFILE the Hard seat's engine is built
 * from: `?hardProfile=phone` or `?hardProfile=desktop`, with
 * `localStorage['muju.hardProfile']` as the stored spelling — the same two
 * forms, read in the same order, as `?hardAi`. See `resolveHardDeviceProfile`. */
export const HARD_AI_PROFILE_QUERY_PARAM = 'hardProfile';
export const HARD_AI_PROFILE_STORAGE_KEY = 'muju.hardProfile';
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
/**
 * The turn's allowance is gone and a per-action search is being floored at
 * `MIN_TURN_SEARCH_MS` to keep it legal. Counted AND logged: an overrun turn
 * used to be the one fallback kind that left no trace in the console at all, so
 * "the AI played instantly and badly" could not be settled from a bug report
 * (`ai-production-wiring.md` §6g).
 *
 * COUNTED PER DECISION, LOGGED ONCE PER TURN. Every floored decision is a fact
 * the counter keeps — `e2e/hard-ai.spec.ts` and `tests/ai/hard-hook-fallback.test.ts`
 * read the total — but the LINE says one thing about the whole turn, and under
 * Phasing `fallbackDecisionsRemaining` is `actionsRemaining + 3` (seven in an
 * opening Act), so logging each one buried the console in seven byte-identical
 * copies every turn for the rest of the game. `useAI` passes `announce` true on
 * the turn's first floored decision and false afterwards; it owns the turn, and
 * this module has no idea where a turn begins.
 */
export function noteHardBudgetExhausted(announce = true): void {
  hardDiag().budgetExhausted++;
  if (announce) console.warn(`${HARD_AI_LOG_PREFIX} turn budget exhausted — this turn overran its allowance; its remaining decisions all run on the minimum search floor (logged once per turn; the budgetExhausted counter has one per decision)`);
}

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

/** Reads ONE page flag — query string first, then `localStorage`.
 * Every access is guarded: a worker/SSR context has no `window`, and a browser
 * with site data blocked THROWS on `localStorage`. */
function readPageFlag(queryParam: string, storageKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(queryParam);
    if (fromQuery !== null) return fromQuery;
  } catch { /* no usable location; fall through to storage */ }
  try {
    return window.localStorage.getItem(storageKey);
  } catch { /* storage blocked */ }
  return null;
}

/** Reads `?hardAi` / `localStorage['muju.hardAi']`, query string first. */
function readHardAiFlag(): string | null {
  return readPageFlag(HARD_AI_QUERY_PARAM, HARD_AI_STORAGE_KEY);
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
 * and the allowance the PLAYER chose stands — the pace's `AI_TURN_SECONDS`
 * (`src/ai/turnTime.ts`), where before the paces it was a single 8000 ms.
 * Logged once per game, like every other read here. Anything that is not an
 * integer is ignored rather than guessed at.
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
  console.warn(`${HARD_AI_LOG_PREFIX} ${HARD_AI_MS_QUERY_PARAM}=${requested} — this game funds the hard seat's turn with ${ms} ms (clamped to [${HARD_AI_MS_MIN}, ${HARD_AI_MS_MAX}]; without it the seat gets the allowance of the pace the player picked)`);
  return ms;
}

/** A handheld's short side in CSS px (see `detectDeviceProfile`). */
const PHONE_MAX_SHORT_SIDE_PX = 820;
/** Logical cores at or below which a coarse-pointer device is phone-class. */
const PHONE_MAX_CORES = 4;
/** `profileFor`'s own DESIGN §6.3 memory trigger. */
const PHONE_MAX_MEMORY_GB = 2;

/**
 * WHICH DEVICE PROFILE THIS GAME'S HARD ENGINE IS BUILT FROM (A-F2, 2026-09-21).
 *
 * Until now `src/ai/hard/config.ts`'s `profileFor` was called from no
 * production code at all, so a phone ran the DESKTOP search shape — `K 24`,
 * widths `[6,4,3,2]`, a 512 K-entry macro table — inside the same whole-turn
 * clock as a workstation. This is the hint that fixes that. It is read ONCE per
 * game by `useAI` (cached in a ref that `cancel` clears, exactly like the route
 * and the `?hardMs` budget), never per search, so one turn can never be split
 * across two engine shapes.
 *
 * THE RULE, and why it is this one. A device is treated as a phone when
 *
 *   `navigator.deviceMemory` ≤ 2 GB                                   (a), or
 *   the PRIMARY pointer is coarse AND
 *     (the viewport's short side ≤ 820 CSS px OR ≤ 4 logical cores)   (b).
 *
 * (a) is `profileFor`'s own DESIGN §6.3 trigger, taken verbatim; Chrome and
 * friends report it, Safari does not, which is why it cannot be the only test.
 * (b) asks the question a handheld actually answers differently: `(pointer:
 * coarse)` is TRUE only when the primary input is a finger, so a touchscreen
 * laptop driven by a mouse stays desktop, and it is then confirmed by a small
 * viewport or a small core count. The short side rather than the width so an
 * orientation change cannot flip the answer, and 820 px because a 10" tablet
 * in portrait (810) is a phone-class chip while a 12.9" iPad Pro (1024, eight
 * cores) is not. Core count is the second arm so that a large, slow tablet
 * still gets the small tables.
 *
 * A HINT, NOT A MEASUREMENT: nothing here is throughput. The engine measures
 * its own `unitsPerMs` after the first search and sizes every later rung from
 * that; this only decides which TABLES it starts with, which is the part it
 * cannot discover for itself. Anything the rule gets wrong is one page-URL flag
 * away from being corrected in either direction, which is why the override
 * exists and why the answer is logged.
 */
function detectDeviceProfile(): DeviceProfileName {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= PHONE_MAX_MEMORY_GB) return 'phone';
  let coarse = false;
  try {
    coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  } catch { /* no usable media query support; fall back to the touch count */ }
  // Only reached on a browser with no `matchMedia` at all: more than one touch
  // point is the oldest available "this is a touchscreen" signal.
  if (!coarse && typeof window.matchMedia !== 'function') coarse = (nav.maxTouchPoints ?? 0) > 1;
  if (!coarse) return 'desktop';
  const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  const cores = nav.hardwareConcurrency;
  const small = shortSide > 0 && shortSide <= PHONE_MAX_SHORT_SIDE_PX;
  return small || (typeof cores === 'number' && cores <= PHONE_MAX_CORES) ? 'phone' : 'desktop';
}

/**
 * The hint `useAI` sends, override first: `?hardProfile=phone|desktop` (or
 * `localStorage['muju.hardProfile']`) decides on its own, and any other value
 * is ignored rather than guessed at. Logged once per game like every other read
 * in this module, so "the AI is slow on my phone" can be settled from the
 * console alone.
 */
export function resolveHardDeviceProfile(): DeviceProfileName {
  const raw = readPageFlag(HARD_AI_PROFILE_QUERY_PARAM, HARD_AI_PROFILE_STORAGE_KEY)?.trim().toLowerCase();
  const forced = raw === 'phone' || raw === 'desktop' ? raw : null;
  const device = forced ?? detectDeviceProfile();
  console.warn(`${HARD_AI_LOG_PREFIX} device profile ${device}${forced === null ? '' : ` (forced by ${HARD_AI_PROFILE_QUERY_PARAM}=${forced})`} — this game builds the hard engine from the ${device} tables (override with ?${HARD_AI_PROFILE_QUERY_PARAM}=phone or =desktop)`);
  return device;
}
