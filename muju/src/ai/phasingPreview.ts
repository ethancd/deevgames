/**
 * THE PHASING AI PREVIEW OPT-IN — a personal, unreleased route, modelled on
 * `src/ai/hardOptIn.ts`.
 *
 * Both AI engines have been ported to Phasing in this tree (the legacy
 * `AIEngineV2` and the packed `HardEngine`, which is now Phasing-ONLY), but NO
 * RELEASE GATE HAS PASSED for either of them under those rules. So three
 * guards keep players away from them, and this module is the only thing that
 * opens any of the three:
 *
 *   1. `src/ai/worker/handler.ts` refuses a Phasing state unless the request
 *      itself carries `phasingPreview: true`, which only `useAI` sets and only
 *      from this opt-in. A request without the marker is refused exactly as it
 *      was before this module existed.
 *   2. `src/components/ModeSelect.tsx` offers the Phasing ruleset for vs-AI and
 *      AI-vs-AI (with a visible "Preview · unreleased AI" badge).
 *   3. `src/components/GameScreen.tsx` stops disabling both `useAI` seats when
 *      the game is Phasing.
 *
 * WITHOUT THE OPT-IN NOTHING CHANGES. Default is OFF, and nothing else can turn
 * it on: no environment variable, no build flag, no config file. Only the two
 * spellings below, and a person who typed one of them.
 *
 *   - ON:  `?phasingAi=1`, or `localStorage['muju.phasingAi'] = '1'`.
 *   - OFF: `?phasingAi=0`, which also CLEARS the stored flag, so the owner can
 *          get back to shipped behaviour from the URL bar alone and stay there.
 *
 * The QUERY STRING IS READ FIRST and decides on its own; storage is consulted
 * only when the parameter is absent. A `?phasingAi=1` is persisted to storage,
 * which is what makes `?phasingAi=0` a *clear* rather than a one-page override.
 * Any other value is no instruction at all and leaves the stored flag alone.
 *
 * READ ONCE PER GAME START. `useAI` caches the answer in a ref and clears it in
 * `cancel` — which every new game, restart, load, undo and difficulty change
 * already runs through — so a flag flipped mid-turn cannot split one turn
 * between "preview on" and "preview off".
 *
 * Every access is guarded: a worker/SSR context has no `window`, and a browser
 * with site data blocked THROWS on `localStorage`.
 */
export const PHASING_AI_STORAGE_KEY = 'muju.phasingAi';
export const PHASING_AI_QUERY_PARAM = 'phasingAi';
/** Every preview console line starts with this, so a test can grep for it. */
export const PHASING_AI_LOG_PREFIX = '[phasing-preview]';

/** The one value that means "on", in both the query string and localStorage. */
const ON = '1';
/** The one value that means "off". In the query string it also clears storage. */
const OFF = '0';

/** The badge the mode screen shows wherever the preview opens a Phasing seat. */
export const PHASING_PREVIEW_BADGE = 'Preview · unreleased AI';

function queryFlag(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(PHASING_AI_QUERY_PARAM);
  } catch { return null; } // no usable location
}

function storedFlag(): string | null {
  try { return window.localStorage.getItem(PHASING_AI_STORAGE_KEY); } catch { return null; }
}

function store(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PHASING_AI_STORAGE_KEY);
    else window.localStorage.setItem(PHASING_AI_STORAGE_KEY, value);
  } catch { /* storage blocked; the query string still governs this page */ }
}

/**
 * Is the Phasing AI preview on for this game? Query string first, storage
 * second, OFF by default. `?phasingAi=1` persists the flag; `?phasingAi=0`
 * clears it. Logs one `[phasing-preview]` warning whenever the answer is yes,
 * so a "the AI played badly" report can be settled from the console alone.
 */
export function readPhasingAiPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const fromQuery = queryFlag();
  let on: boolean;
  if (fromQuery === ON) { store(ON); on = true; }
  else if (fromQuery === OFF) { store(null); on = false; }
  else on = storedFlag() === ON;
  if (on) {
    console.warn(`${PHASING_AI_LOG_PREFIX} ON: the AI will play the Phasing ruleset. This is an UNRELEASED PREVIEW — no release gate has passed for either engine under these rules, and there is NO STRENGTH GUARANTEE. Turn it off with ?${PHASING_AI_QUERY_PARAM}=${OFF}.`);
  }
  return on;
}
