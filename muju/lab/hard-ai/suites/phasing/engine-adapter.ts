/** Fixed-work, book-free Hard adapter. No measurement or file-based weight loader. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { HardEngine } from '../../../../src/ai/hard/engine';
import { EMPTY_BOOK } from '../../../../src/ai/hard/book/format';
import { Replica, allocState } from '../../../../src/ai/hard/core/state';
import { NDEF } from '../../../../src/ai/hard/core/catalog';
import { ZOBRIST_SEED } from '../../../../src/ai/hard/core/zobrist';
import { MAX_SLOTS, MAX_TURN_ACTIONS, PEND_STRIDE } from '../../../../src/ai/hard/types';
import { FEATURE_COUNT, FEATURE_NAMES } from '../../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS, WEIGHTS_VERSION, cloneWeights } from '../../../../src/ai/hard/eval/weights';
import { setElementGraph } from '../../../../src/game/elements';
import { setUpkeepVariant } from '../../../../src/game/upkeep';
import { setCombatHandicap } from '../../../../src/game/combat';
import { hardEnginePatch } from '../../bots/hard';
import { canonicalSourceHashes, hashJson, positionRef, replayMacro, semanticHash, sha256, verifySourceBinding } from './canonical';
import type { HardConfig, Weights } from '../../../../src/ai/hard/config';
import type { RootResult } from '../../../../src/ai/hard/search/root';
import type { HardSearchStats } from '../../../../src/ai/hard/search/pvs';
import type { GameState, PhasingCase, PhasingPosition, PlayerId, PositionRef, SourceBinding } from './format';
import type { CaseExecution, EngineTurn, EngineValue } from './score';

export interface EngineFacade {
  readonly config: HardConfig;
  readonly currentWeights: Weights;
  readonly cappedProverCalls: number;
  setSeed(seed: number): void;
  fullEvaluate(state: GameState, perspective: PlayerId): number;
  searchTurn(state: GameState, options: { work: number }): Promise<RootResult>;
}
export interface AdapterOptions {
  seed: number; weights?: Weights; restoreBinding: SourceBinding;
  /** Tests may substitute the computation, never canonical replay/end-key checking. */
  createEngine?: (config: HardConfig) => EngineFacade;
}
export interface EngineIdentity {
  schema: 'muju-phasing-engine-identity-v1'; engine: 'hard@desktop'; rulesVersion: 'muju-phasing-1';
  mode: 'fixed-work'; seed: number; book: 'EMPTY_BOOK';
  executionKind: 'production' | 'injected-test';
  sourceSha256: string; sources: Record<string, string>; configSha256: string; weightsSha256: string;
  weightsVersion: number; weightsLabel: string;
  abi: { featureCount: number; featureNamesSha256: string; weightsVersion: number; maxSlots: number; maxTurnActions: number; pendingStride: number; zobristSeed: number; sources: Record<string, string> };
}
export interface AdapterDiagnostics {
  positionId: string; positionRulesSha256: string; cappedProverCalls: number;
  source?: RootResult['source']; depth?: number; work?: number; requestedWork?: number;
  replicaDivergences?: number; reportedCappedProverCalls?: number; claimedEndKey?: string; verifiedEndKey?: string;
  searchStats?: Omit<HardSearchStats, 'byClass'> & { byClass: number[] };
  failedOperation?: string;
  completedOperations?: Record<string, AdapterDiagnostics>;
}
export interface EvaluationOutput { value: EngineValue; diagnostics: AdapterDiagnostics }
export interface SearchOutput { turn: EngineTurn; value: EngineValue; diagnostics: AdapterDiagnostics }
export interface CaseExecutionOutput { execution: CaseExecution; diagnostics: Record<string, AdapterDiagnostics> }
export class AdapterRefusal extends Error {
  constructor(message: string, readonly diagnostics: AdapterDiagnostics, readonly actions: unknown[] = []) { super(message); this.name = 'AdapterRefusal'; }
}
export interface PhasingEngineAdapter {
  readonly identity: EngineIdentity; readonly engineIdentity: string;
  evaluate(position: PhasingPosition, perspective: PlayerId): Promise<EvaluationOutput>;
  search(position: PhasingPosition, work: number): Promise<SearchOutput>;
  executeCase(caseRecord: PhasingCase, resolve: (ref: PositionRef) => PhasingPosition): Promise<CaseExecutionOutput>;
}

const MUJU = fileURLToPath(new NodeURL('../../../../', import.meta.url));
const LAB_DEPENDENCIES = ['lab/hard-ai/bots/hard.ts', 'lab/hard-ai/ablate/arms.ts', 'lab/hard-ai/audit/eval-groups.ts', 'lab/hard-ai/ladder/identity.ts', 'lab/hard-ai/ladder/ruleset.ts', 'lab/hard-ai/suites/phasing/engine-adapter.ts', 'lab/hard-ai/suites/phasing/canonical.ts'];
/** Source bytes only; no JSON/JSONL/binary book, opening, corpus or outcome reads. */
export function engineSourceHashes(): Record<string, string> {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.name.endsWith('.ts') ? [join(directory, entry.name)] : []);
  const files = [...walk(join(MUJU, 'src/ai/hard')), ...LAB_DEPENDENCIES.map(path => join(MUJU, path))];
  return { ...canonicalSourceHashes(), ...Object.fromEntries(files.sort().map(path => [relative(MUJU, path).replaceAll('\\', '/'), sha256(readFileSync(path))])) };
}
export function weightIdentity(weights: Weights): string {
  return hashJson({ version: weights.version, w: Array.from(weights.w), material: Array.from(weights.material) });
}
function validWeights(weights: Weights): void {
  if (!weights || !Number.isInteger(weights.version) || weights.version <= 0 || !weights.label || /placeholder/i.test(weights.label) || !(weights.w instanceof Int32Array) || !(weights.material instanceof Int32Array) || weights.w.length !== FEATURE_COUNT || weights.material.length !== NDEF) throw new Error('Adapter requires explicit current-shape nonplaceholder weights');
}
function configIdentity(config: HardConfig): string {
  if (config.book !== EMPTY_BOOK) throw new Error('Adapter requires the explicit EMPTY_BOOK object');
  return hashJson({ ...config, book: { kind: 'EMPTY_BOOK', size: 0 }, weights: { version: config.weights.version, label: config.weights.label, w: Array.from(config.weights.w), material: Array.from(config.weights.material) } });
}
function copyConfig(config: HardConfig): HardConfig {
  const { book: _book, ...data } = config;
  return { ...structuredClone(data), book: EMPTY_BOOK };
}
function productionEngine(config: HardConfig): EngineFacade {
  const engine = new HardEngine(config);
  return {
    get config() { return engine.config; }, get currentWeights() { return engine.ctx.eval.currentWeights; },
    get cappedProverCalls() { return engine.ctx.rep.cappedProverCalls; },
    setSeed: seed => engine.setSeed(seed),
    fullEvaluate: (state, perspective) => {
      const packed = engine.ctx.rep.pack(state, allocState()); packed.proverMode = 2;
      engine.ctx.eval.invalidate();
      return engine.ctx.eval.full(packed, perspective === 'white' ? 0 : 1, engine.ctx.sc, 0);
    },
    searchTurn: (state, options) => engine.searchTurn(state, options),
  };
}
function install(binding: SourceBinding): void {
  setElementGraph(binding.rules.elementGraph); setUpkeepVariant(binding.rules.upkeep);
  setCombatHandicap('white', binding.rules.combatHandicap.white); setCombatHandicap('black', binding.rules.combatHandicap.black);
}
function statsSnapshot(stats: HardSearchStats | undefined): AdapterDiagnostics['searchStats'] {
  return stats ? { ...structuredClone(stats), byClass: Array.from(stats.byClass) } : undefined;
}
let serial: Promise<void> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = serial.then(operation, operation); serial = next.then(() => undefined, () => undefined); return next;
}
export function packedEndpointKey(state: GameState): string {
  const packed = new Replica().pack(state, allocState());
  return `${(packed.kposHi >>> 0).toString(16).padStart(8, '0')}${(packed.kposLo >>> 0).toString(16).padStart(8, '0')}`;
}

export function createPhasingEngineAdapter(options: AdapterOptions): PhasingEngineAdapter {
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('Adapter seed must be a frozen uint32');
  verifySourceBinding(options.restoreBinding);
  validWeights(options.weights ?? DEFAULT_WEIGHTS);
  const owned = cloneWeights(options.weights ?? DEFAULT_WEIGHTS);
  const patch = hardEnginePatch('desktop', owned);
  const config = copyConfig({ ...patch, book: EMPTY_BOOK } as HardConfig);
  const sources = engineSourceHashes(), abiPaths = ['src/ai/hard/types.ts', 'src/ai/hard/core/state.ts', 'src/ai/hard/core/action.ts', 'src/ai/hard/core/zobrist.ts', 'src/ai/hard/eval/features.ts', 'src/ai/hard/eval/weights.ts'];
  const seed = options.seed;
  const identity: EngineIdentity = { schema: 'muju-phasing-engine-identity-v1', engine: 'hard@desktop', rulesVersion: 'muju-phasing-1', mode: 'fixed-work', seed, book: 'EMPTY_BOOK', executionKind: options.createEngine ? 'injected-test' : 'production', sourceSha256: hashJson(sources), sources, configSha256: configIdentity(config), weightsSha256: weightIdentity(owned), weightsVersion: owned.version, weightsLabel: owned.label,
    abi: { featureCount: FEATURE_COUNT, featureNamesSha256: hashJson(FEATURE_NAMES), weightsVersion: WEIGHTS_VERSION, maxSlots: MAX_SLOTS, maxTurnActions: MAX_TURN_ACTIONS, pendingStride: PEND_STRIDE, zobristSeed: ZOBRIST_SEED, sources: Object.fromEntries(abiPaths.map(path => [path, sources[path]])) } };
  const engineIdentity = hashJson(identity), restore = structuredClone(options.restoreBinding), create = options.createEngine ?? productionEngine;
  const check = (engine: EngineFacade): void => {
    if (configIdentity(engine.config) !== identity.configSha256 || weightIdentity(engine.currentWeights) !== identity.weightsSha256 || weightIdentity(engine.config.weights) !== identity.weightsSha256) throw new Error('Adapter engine/evaluator config or weights diverged');
    if (!Number.isSafeInteger(engine.cappedProverCalls) || engine.cappedProverCalls !== 0) throw new Error('Adapter capped-prover veto');
  };
  const operation = <T>(position: PhasingPosition, body: (engine: EngineFacade, position: PhasingPosition) => Promise<T>): Promise<T> => {
    // Freeze caller-owned input at invocation, before waiting for the global queue.
    const frozen = structuredClone(position);
    return enqueue(async () => {
      verifySourceBinding(frozen.binding);
      if (frozen.state.ruleset !== 'phasing' || frozen.binding.rulesVersion !== 'muju-phasing-1' || frozen.state.victoryRule !== frozen.binding.rules.victoryRule || frozen.state.inactivityRule !== frozen.binding.rules.inactivityRule || frozen.state.blackCrystalHandicap !== frozen.binding.rules.handicap) throw new Error('Adapter position rules mismatch');
      if (hashJson(engineSourceHashes()) !== identity.sourceSha256) throw new Error('Adapter source drift');
      try {
        install(frozen.binding);
        const engine = create(copyConfig(config)); engine.setSeed(seed); check(engine);
        const value = await body(engine, frozen); check(engine);
        if (hashJson(engineSourceHashes()) !== identity.sourceSha256) throw new Error('Adapter source drift during execution');
        return value;
      } finally { install(restore); }
    });
  };
  const diagnostics = (p: PhasingPosition, engine: EngineFacade): AdapterDiagnostics => ({ positionId: p.id, positionRulesSha256: hashJson(p.binding), cappedProverCalls: engine.cappedProverCalls });
  const evaluate = (position: PhasingPosition, perspective: PlayerId): Promise<EvaluationOutput> => {
    if (perspective !== 'white' && perspective !== 'black') return Promise.reject(new Error('Invalid evaluation perspective'));
    return operation(position, async (engine, p) => {
      try {
        const rootHash = semanticHash(p.state), value = engine.fullEvaluate(p.state, perspective);
        if (!Number.isFinite(value)) throw new Error('Nonfinite full evaluation');
        if (semanticHash(p.state) !== rootHash) throw new Error('Engine mutated canonical root');
        check(engine);
        return { value: { value, perspective, engineIdentity }, diagnostics: diagnostics(p, engine) };
      } catch (error) { throw new AdapterRefusal(error instanceof Error ? error.message : String(error), diagnostics(p, engine)); }
    });
  };
  const search = (position: PhasingPosition, work: number): Promise<SearchOutput> => {
    if (!Number.isSafeInteger(work) || work <= 0) return Promise.reject(new Error('Search requires positive fixed work'));
    return operation(position, async (engine, p) => {
      let selected: RootResult | undefined;
      try {
      const rootHash = semanticHash(p.state); selected = await engine.searchTurn(p.state, { work });
      if (semanticHash(p.state) !== rootHash) throw new Error('Engine mutated canonical root');
      check(engine);
      if (!selected || selected.fallback || !['search', 'home-race', 'mate', 'rescue', 'dfpn'].includes(selected.source)) throw new Error('Engine fallback/book/unknown-source veto');
      if (!selected.stats || selected.stats.replicaDivergences !== 0 || selected.stats.cappedProverCalls !== 0) throw new Error('Engine divergence/capped-prover veto');
      if (selected.stats.stopReason === 'abort' || selected.stats.rung !== work || !Number.isFinite(selected.scoreCc) || !Number.isFinite(selected.work) || selected.work < 0 || !Number.isInteger(selected.depth) || selected.depth < 0) throw new Error('Invalid fixed-work search result');
      const trace = replayMacro(p.state, selected.actions), verifiedEndKey = packedEndpointKey(trace.endpoint);
      if (!/^[a-f0-9]{16}$/.test(selected.endKey) || selected.endKey !== verifiedEndKey) throw new Error('Engine claimed endpoint key divergence');
      if (['mate', 'home-race', 'dfpn'].includes(selected.source) && (trace.endpoint.phase !== 'victory' || trace.endpoint.winner !== p.state.turn.currentPlayer)) throw new Error('Engine terminal claim disagrees with canonical result');
      const facts = { ...diagnostics(p, engine), source: selected.source, depth: selected.depth, work: selected.work, requestedWork: work, replicaDivergences: selected.stats.replicaDivergences, reportedCappedProverCalls: selected.stats.cappedProverCalls, claimedEndKey: selected.endKey, verifiedEndKey, searchStats: statsSnapshot(selected.stats) };
      return { turn: { actions: structuredClone(selected.actions), source: selected.source, fallback: false, engineIdentity, canonicalEndHash: semanticHash(trace.endpoint) }, value: { value: selected.scoreCc, perspective: p.state.turn.currentPlayer, engineIdentity }, diagnostics: facts };
      } catch (error) {
        throw new AdapterRefusal(error instanceof Error ? error.message : String(error), { ...diagnostics(p, engine), requestedWork: work, source: selected?.source, depth: selected?.depth, work: selected?.work, replicaDivergences: selected?.stats?.replicaDivergences, reportedCappedProverCalls: selected?.stats?.cappedProverCalls, claimedEndKey: selected?.endKey, searchStats: statsSnapshot(selected?.stats) }, selected?.actions ? structuredClone(selected.actions) : []);
      }
    });
  };
  const executeCase = async (c: PhasingCase, resolve: (ref: PositionRef) => PhasingPosition): Promise<CaseExecutionOutput> => {
    const bound = (ref: PositionRef): PhasingPosition => { const p = resolve(ref); if (positionRef(p).sha256 !== ref.sha256 || p.id !== ref.id) throw new Error('Adapter case member hash mismatch'); return p; };
    if (c.kind === 'macro-decision') { const selected = await search(bound(c.root), c.work); return { execution: { kind: 'macro', turn: selected.turn }, diagnostics: { 'macro/search': selected.diagnostics } }; }
    if (c.kind === 'canonical-coverage') {
      if (!c.engineReplay.required) return { execution: { kind: 'coverage' }, diagnostics: {} };
      const selected = await search(bound(c.root), c.engineReplay.work); return { execution: { kind: 'coverage', turn: selected.turn }, diagnostics: { 'coverage/search': selected.diagnostics } };
    }
    const violating = bound(c.violating), correct = bound(c.correct);
    if (hashJson(violating.binding) !== hashJson(correct.binding) || hashJson(violating.boundary) !== hashJson(correct.boundary)) throw new Error('Pair context mismatch');
    const completedOperations: Record<string, AdapterDiagnostics> = {};
    const capture = async <T extends EvaluationOutput | SearchOutput>(name: string, run: () => Promise<T>): Promise<T> => {
      try { const result = await run(); completedOperations[name] = result.diagnostics; return result; }
      catch (error) {
        const partial = { failedOperation: name, completedOperations: structuredClone(completedOperations) };
        if (error instanceof AdapterRefusal) throw new AdapterRefusal(error.message, { ...error.diagnostics, ...partial }, error.actions);
        // Initialization/source failures have no measured engine counters, but
        // the existing CLI refusal consumer can still preserve prior evidence.
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { diagnostics: partial });
      }
    };
    const evalA = await capture('violating/eval', () => evaluate(violating, c.perspective));
    const evalB = await capture('correct/eval', () => evaluate(correct, c.perspective));
    if (c.work === undefined) { if (c.primaryMetric === 'search-gap') throw new Error('Missing pair fixed-work budget'); return { execution: { kind: 'pair', evaluation: { violating: evalA.value, correct: evalB.value } }, diagnostics: completedOperations }; }
    const work = c.work;
    const searchA = await capture('violating/search', () => search(violating, work));
    const searchB = await capture('correct/search', () => search(correct, work));
    return { execution: { kind: 'pair', evaluation: { violating: evalA.value, correct: evalB.value }, search: { violating: searchA.value, correct: searchB.value }, turns: { violating: searchA.turn, correct: searchB.turn } }, diagnostics: completedOperations };
  };
  return { identity: structuredClone(identity), engineIdentity, evaluate, search, executeCase };
}
