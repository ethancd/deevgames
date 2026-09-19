/**
 * Baseline identity for the ladder (EPIC-PLAN E0.1, "Trust the contest").
 *
 * Two questions this module answers, both by computation rather than by a label:
 *
 * 1. WHAT CODE IS THIS? `baselineIdentity()` returns the git revision plus four
 *    content hashes — `src/ai/**`, `src/game/**`, the tactical WASM and
 *    `package-lock.json`. A ladder row that quotes them can be re-run later and
 *    checked against the tree it claims to measure. It is synchronous and reads
 *    roughly 1 MB, cheap enough to call once per ladder run (and per test).
 *
 * 2. WHAT ENGINE IS THIS? `resolvedConfig(name, work)` returns the
 *    configuration the ladder adapter ACTUALLY applies for an engine name at a
 *    work spec — the difficulty preset after every override, the throughput
 *    preset for `-fast`, the budget policy, the adapter lifecycle and the
 *    resignation flag — and `resolvedConfigHash` hashes a canonical
 *    serialisation of it. `engines.ts` folds that hash into
 *    `LadderEngine.configHash`, so two rows carrying the same engine name but a
 *    different resolved configuration can no longer be confused for each other
 *    (EPIC-PLAN E0 clause 4).
 *
 * The resolved configuration is read from the engines themselves wherever it
 * can be: the `AIEngineV2` presets are taken from a freshly constructed engine
 * (its constructor is a pair of object spreads), and the `HardConfig` merge
 * mirrors `src/ai/hard/engine.ts`'s constructor step for step. Duplicated
 * literals would drift; `tests/lab/baseline-identity.test.ts` pins the values
 * that matter so a silent shape change still fails a test.
 *
 * NAME vs CONFIGURATION. `hard@lab-400k`'s `-400k` suffix is documentary
 * (`lab/hard-ai/bots/hard.ts` strips it; the ladder's own `--work` decides the
 * budget), so `hard@lab` and `hard@lab-400k` resolve to the SAME configuration
 * and the same hash. That is the point of hashing the configuration instead of
 * the name. The engine NAME still survives in `configHash`'s prefix, so the two
 * rows stay distinguishable in a manifest.
 *
 * 3. WHAT RULES IS THIS? `rulesVersion` — `LADDER_RULES_VERSION`, the revision
 *    `lab/harness/runner.ts` stamps on every `GameRecord` — is the FIRST field
 *    of every resolved configuration, so it is inside `resolvedConfigHash` and
 *    therefore inside `engines.ts`'s `LadderEngine.configHash`, every
 *    `GameRecord.engineHash` and every `manifest.aConfigHash`.
 *
 *    WHY IT IS IN THE HASH AND NOT BESIDE IT. `hard@desktop` at `wall:8000` is
 *    not one engine: under Standard and under Phasing it plays a different game,
 *    from a different opening book, for a different result. Two such rows share
 *    their name, their work rung and every field of their `HardConfig`, so
 *    before this they hashed IDENTICALLY — and anything that pools rows by
 *    configuration hash (an Elo pool, a `hard:ladder` re-run check, a
 *    cross-row rung comparison) would have merged them without a word. The
 *    rules revision makes that structurally impossible instead of a convention
 *    someone has to remember.
 *
 *    CONSEQUENCE, stated rather than hidden: every resolved-configuration hash
 *    MOVED when Phasing became the ladder's rule set. The Standard-era hashes
 *    recorded in `lab/results/**` manifests (and pinned in
 *    `tests/lab/ablate.test.ts`) belong to `muju-standard` rows and cannot be
 *    reproduced by this tree, which is the separation working, not a
 *    regression: a Phasing tree must not be able to mint a Standard row's
 *    identity. `PHASING-PREREGISTRATION-2026-09-18.md` ("Keep ruleset identity
 *    in future benchmark manifests, packed state/hash formats, opening corpora
 *    and strength comparisons") is the requirement this satisfies.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIEngineV2, TURN_BUDGET_MS } from '../../../src/ai/engine-v2';
import { DESKTOP, type HardConfig } from '../../../src/ai/hard/config';
import { EMPTY_BOOK } from '../../../src/ai/hard/book/format';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import type { AIDifficulty } from '../../../src/ai/types';
import { hardEnginePatch } from '../bots/hard';
import { LADDER_RULES_VERSION } from './ruleset';
import type { WorkSpec } from './engines';

/** Repository root of the game package (`muju/`). */
const MUJU_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Throughput preset for `-fast` names: cheaper per-decision tactical/beam
 * search, independent of `WorkSpec`. It lives here rather than in `engines.ts`
 * so the resolved configuration and the adapter that applies it cannot drift
 * (and so `engines.ts` -> `identity.ts` stays a one-way import).
 */
export const FAST_THROUGHPUT = { tacticalNodes: 20000, beamWidth: 12, outputPlans: 10 } as const;

/**
 * Whether the aiv2 ladder adapter may resign.
 *
 * FALSE, because the released game never does: `shouldResign` is exported from
 * `src/ai/evaluation.ts` but has no caller anywhere in production master
 * 0f1d5f1's `src/` (`useAI.ts` substitutes `phaseEndAction` for an empty plan
 * and treats an illegal proposal as an engine error, "not a hidden
 * pass/resignation"). The ladder resigning where the shipped game plays on is a
 * difference in RESULTS, not just in speed, and it applied to the aiv2 arms
 * only — `lab/hard-ai/bots/hard.ts` never resigns — so it also biased every
 * aiv2-vs-hard row. See `docs/hard-ai/e0/E0.1-BASELINE-IDENTITY.md`.
 */
export const AIV2_RESIGN_DEFAULT = false;

export interface GitIdentity {
  /** Full commit SHA of the working tree, or `'unknown'` outside a git checkout. */
  rev: string;
  /** True when `git status --porcelain` is non-empty (untracked files included). */
  dirty: boolean;
}

export interface SourceIdentity {
  /** sha256 over the sorted relative paths and contents of `src/ai/**`. */
  ai: string;
  /** sha256 over the sorted relative paths and contents of `src/game/**`. */
  game: string;
  /** sha256 of `src/ai/wasm/tactics.wasm`. */
  wasm: string;
  /** sha256 of `package-lock.json`. */
  deps: string;
}

export interface BaselineIdentity {
  git: GitIdentity;
  sources: SourceIdentity;
  /**
   * The rule set this tree's ladder measures under, as `GameRecord.rulesVersion`
   * spells it. Part of the identity because the same `src/` tree plays two
   * different games: a row is only comparable with another row of the same rules
   * revision.
   */
  rulesVersion: typeof LADDER_RULES_VERSION;
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function filesUnder(absDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/**
 * sha256 over a directory tree: every file's repo-relative path (POSIX
 * separators) and its bytes, in sorted path order, each length-prefixed so no
 * concatenation of one file's content with another's path can collide.
 */
function hashTree(relDir: string): string {
  const absDir = resolve(MUJU_ROOT, relDir);
  const hash = createHash('sha256');
  for (const abs of filesUnder(absDir).sort()) {
    const rel = relative(MUJU_ROOT, abs).split(sep).join('/');
    const bytes = readFileSync(abs);
    hash.update(`${rel} ${bytes.length} `);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function gitIdentity(): GitIdentity {
  try {
    const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MUJU_ROOT, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: MUJU_ROOT, encoding: 'utf8' });
    return { rev, dirty: status.trim().length > 0 };
  } catch {
    return { rev: 'unknown', dirty: false };
  }
}

/** The frozen identity of the tree this process is running (EPIC-PLAN E0 clause 1). */
export function baselineIdentity(): BaselineIdentity {
  return {
    git: gitIdentity(),
    rulesVersion: LADDER_RULES_VERSION,
    sources: {
      ai: hashTree('src/ai'),
      game: hashTree('src/game'),
      wasm: sha256(readFileSync(resolve(MUJU_ROOT, 'src/ai/wasm/tactics.wasm'))),
      deps: sha256(readFileSync(resolve(MUJU_ROOT, 'package-lock.json'))),
    },
  };
}

/**
 * A stable serialisation for hashing: object keys sorted, typed arrays widened
 * to plain number arrays, `undefined` dropped, functions reduced to a marker
 * (`Book.lookup` is the only one that reaches here). Purely structural — two
 * configurations that differ in any field serialise differently.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

function canonicalize(value: unknown): Canonical {
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'function') return '[function]';
  if (typeof value === 'bigint') return value.toString();
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: { [key: string]: Canonical } = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  // `undefined` and `symbol` at the root.
  return null;
}

/** sha256 of the canonical serialisation of any resolved configuration. */
export function configHashOf(config: unknown): string {
  return sha256(canonicalJson(config));
}

/** How the adapter turns a `WorkSpec` into a per-search budget. */
export interface ResolvedBudget {
  mode: 'fixed' | 'wall';
  /** `AIEngineConfig.fixedWork` the adapter sets (0 in wall mode). */
  fixedWork: number;
  /** Wall mode: the milliseconds that fund one TURN. Null in fixed mode. */
  turnMs: number | null;
  /**
   * `whole-turn`: one search spends the turn's budget.
   * `split-across-remaining-decisions`: `useAI.ts`'s per-action loop —
   * `remaining / decisionsRemaining`, debited by what each search spent.
   */
  allocation: 'whole-turn' | 'split-across-remaining-decisions' | 'per-decision-work-units';
  /** The turn budget the browser funds this difficulty with (`TURN_BUDGET_MS`), for comparison. */
  shippedTurnBudgetMs: number | null;
  /**
   * The shipped worker leaves `mctsTimeLimit` at its preset and lets
   * `findBestAction` take `min(decisionMs, mctsTimeLimit)`; the ladder
   * overwrites `mctsTimeLimit` with the decision allowance so a `wall:` rung
   * above the preset is actually spent. True = ladder behaviour.
   */
  overridesPresetTimeLimit: boolean;
}

/** Engine construction, seeding and per-decision reconfiguration. */
export interface ResolvedLifecycle {
  engine: 'one-per-game-seat' | 'one-per-game-seat-lazy';
  seed: 'once-at-construction';
  setDifficultyPerDecision: boolean;
  searchesPerTurn: 'one' | 'one-per-action';
}

/**
 * The one field every resolved configuration carries, whatever the engine: the
 * rules revision the row is played under (see the module header, clause 3).
 */
export interface ResolvedRules {
  rulesVersion: typeof LADDER_RULES_VERSION;
}

export interface ResolvedAiv2Config extends ResolvedRules {
  engine: 'aiv2' | 'aiv2-turn';
  difficulty: AIDifficulty;
  fast: boolean;
  /** `AIEngineConfig` after the difficulty preset, `FAST_THROUGHPUT` and the work overrides. */
  search: Record<string, number>;
  budget: ResolvedBudget;
  lifecycle: ResolvedLifecycle;
  resign: boolean;
  tacticalSolver: 'wasm-tactics-or-reference-fallback';
}

export interface ResolvedHardConfig extends ResolvedRules {
  engine: 'hard';
  /** The `HardConfig` `HardEngine`'s constructor ends up with (label excluded: see the module header). */
  config: HardConfig;
  budget: ResolvedBudget;
  lifecycle: ResolvedLifecycle;
  resign: boolean;
}

export interface ResolvedScriptedConfig extends ResolvedRules {
  engine: 'scripted';
  bot: string;
}

export type ResolvedConfig = ResolvedAiv2Config | ResolvedHardConfig | ResolvedScriptedConfig;

const AIV2_NAME = /^aiv2-(easy|medium|hard)(-fast)?$/;
const AIV2_TURN_NAME = /^aiv2-(easy|medium|hard)-turn$/;

/**
 * The difficulty preset the engine actually installs, read off a fresh
 * `AIEngineV2` rather than copied from `engine-v2.ts` (its `DEFAULT_CONFIG` and
 * `DIFFICULTY_PRESETS` are module-private, and a copy here would silently go
 * stale). The constructor only spreads two objects, so this is cheap.
 */
function enginePreset(difficulty: AIDifficulty): Record<string, number> {
  const internals = new AIEngineV2(difficulty) as unknown as { config: Record<string, number> };
  return { ...internals.config };
}

function aiv2Search(difficulty: AIDifficulty, fast: boolean, work: WorkSpec): Record<string, number> {
  const search = enginePreset(difficulty);
  if (fast) Object.assign(search, FAST_THROUGHPUT);
  if (work.mode === 'fixed') search.fixedWork = work.units;
  else search.fixedWork = 0;
  return search;
}

function aiv2Budget(difficulty: AIDifficulty, work: WorkSpec, perAction: boolean): ResolvedBudget {
  return {
    mode: work.mode,
    fixedWork: work.mode === 'fixed' ? work.units : 0,
    turnMs: work.mode === 'wall' ? work.ms : null,
    allocation: work.mode === 'fixed' ? 'per-decision-work-units' : perAction ? 'split-across-remaining-decisions' : 'whole-turn',
    shippedTurnBudgetMs: TURN_BUDGET_MS[difficulty],
    overridesPresetTimeLimit: work.mode === 'wall',
  };
}

/**
 * `hard@<label>`'s configuration as `HardEngine`'s constructor resolves it:
 * `mergeConfig(DESKTOP, patch)`, then `EMPTY_BOOK` for a null book, then the
 * `DEFAULT_WEIGHTS` substitution.
 *
 * The patch is `hardEnginePatch(label)`, not `hardConfigFor(label)`: the
 * adapter resolves the evaluation weights itself, because a profile object's
 * `weights` field is always present and the constructor's substitution is
 * guarded on `cfg.weights === undefined`. Reading the patch from the adapter is
 * what keeps this function's answer equal to what the ladder actually runs
 * (`tests/lab/baseline-identity.test.ts` pins it against a live `HardEngine`).
 * Before that fix `hard@*` evaluated with `placeholder-m4`, M4's 58 zero
 * weights, and every `hard@*` row recorded up to and including M14's ran that
 * material-only evaluation.
 */
function hardResolvedConfig(label: string): HardConfig {
  const patch = hardEnginePatch(label);
  const config: HardConfig = { ...DESKTOP, ...patch };
  config.time = { ...config.time };
  config.profile = { ...config.profile };
  config.quiesce = { ...config.quiesce };
  config.dfpn = { ...config.dfpn };
  if (config.book === null) config.book = EMPTY_BOOK;
  if (config.weights.version === 0 && patch.weights === undefined) config.weights = DEFAULT_WEIGHTS;
  return config;
}

/** The configuration the ladder adapter applies for `name` at `work`. */
export function resolvedConfig(name: string, work: WorkSpec): ResolvedConfig {
  const turn = AIV2_TURN_NAME.exec(name);
  if (turn) {
    const difficulty = turn[1] as AIDifficulty;
    return {
      rulesVersion: LADDER_RULES_VERSION,
      engine: 'aiv2-turn',
      difficulty,
      fast: false,
      search: aiv2Search(difficulty, false, work),
      budget: aiv2Budget(difficulty, work, false),
      lifecycle: { engine: 'one-per-game-seat-lazy', seed: 'once-at-construction', setDifficultyPerDecision: false, searchesPerTurn: 'one' },
      resign: AIV2_RESIGN_DEFAULT,
      tacticalSolver: 'wasm-tactics-or-reference-fallback',
    };
  }
  if (name.startsWith('hard@')) {
    const label = name.slice('hard@'.length);
    return {
      rulesVersion: LADDER_RULES_VERSION,
      engine: 'hard',
      config: hardResolvedConfig(label),
      budget: {
        mode: work.mode,
        fixedWork: work.mode === 'fixed' ? work.units : 0,
        turnMs: work.mode === 'wall' ? work.ms : null,
        allocation: work.mode === 'fixed' ? 'per-decision-work-units' : 'whole-turn',
        shippedTurnBudgetMs: null,
        overridesPresetTimeLimit: false,
      },
      lifecycle: { engine: 'one-per-game-seat', seed: 'once-at-construction', setDifficultyPerDecision: false, searchesPerTurn: 'one' },
      resign: false,
    };
  }
  const aiv2 = AIV2_NAME.exec(name);
  if (aiv2) {
    const difficulty = aiv2[1] as AIDifficulty;
    const fast = aiv2[2] === '-fast';
    return {
      rulesVersion: LADDER_RULES_VERSION,
      engine: 'aiv2',
      difficulty,
      fast,
      search: aiv2Search(difficulty, fast, work),
      budget: aiv2Budget(difficulty, work, true),
      lifecycle: { engine: 'one-per-game-seat', seed: 'once-at-construction', setDifficultyPerDecision: true, searchesPerTurn: 'one-per-action' },
      resign: AIV2_RESIGN_DEFAULT,
      tacticalSolver: 'wasm-tactics-or-reference-fallback',
    };
  }
  return { rulesVersion: LADDER_RULES_VERSION, engine: 'scripted', bot: name };
}

/** sha256 of the canonical serialisation of `resolvedConfig(name, work)`. */
export function resolvedConfigHash(name: string, work: WorkSpec): string {
  return configHashOf(resolvedConfig(name, work));
}
